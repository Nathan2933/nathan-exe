import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = __dirname;
const CONTENT_FILE = resolve(ROOT, 'public/data/content.json');
const BACKUP_DIR = resolve(ROOT, 'content-backups');
const AUTH_FILE = resolve(ROOT, '.admin-auth.json');   // created by `npm run admin:password`, git-ignored

// ---- admin sign-in: scrypt-hashed password, HttpOnly session cookie, lockout on repeated failures ----
const sessions = new Map();                 // token -> expiry (ms)
const SESSION_MS = 8 * 60 * 60 * 1000;
let fails = 0, lockedUntil = 0;
const readAuth = () => { try { return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')); } catch { return null; } };
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function checkLogin(user, pass) {
  const a = readAuth();
  if (!a) return false;
  const h = crypto.scryptSync(String(pass), a.salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return safeEq(user, a.user) & safeEq(h, a.hash);   // both always evaluated (no early exit timing)
}
const tokenOf = (req) => (/(?:^|;\s*)nx_admin=([a-f0-9]{64})/.exec(req.headers.cookie || '') || [])[1];
function authed(req) {
  const t = tokenOf(req), exp = t && sessions.get(t);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(t); return false; }
  return true;
}
// Only accept requests addressed to this machine (blocks DNS-rebinding tricks from other sites)
const localHost = (req) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(req.headers.host || '');
const sameOrigin = (req) => !req.headers.origin || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(req.headers.origin);

/**
 * Dev-only admin API. Lets /admin.html save content.json to disk.
 * Only accepts requests from this machine (loopback), even though the dev
 * server listens on 0.0.0.0 so phones on the LAN can play-test.
 * Never included in the production build.
 */
function adminApi() {
  const isLoopback = (addr = '') =>
    addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';

  return {
    name: 'nathan-admin-api',
    apply: 'serve',
    configureServer(server) {
      // The admin page and its script are only served to this computer
      server.middlewares.use((req, res, next) => {
        const u = (req.url || '').split('?')[0];
        if (/^\/(admin(\.html)?|src\/admin\.js|src\/styles\/admin\.css)$/.test(u) && (!isLoopback(req.socket.remoteAddress) || !localHost(req))) {
          res.statusCode = 404; return res.end('Not found');
        }
        next();
      });
      // Secure backend AI proxy: evaluates API key strictly on server, never exposes key to client
      server.middlewares.use('/__ai/dialogue', async (req, res) => {
        const send = (code, body) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });
        let raw = '';
        req.on('data', (c) => { raw += c; if (raw.length > 50000) req.destroy(); });
        req.on('end', async () => {
          try {
            const body = JSON.parse(raw);
            const geminiKey = process.env.GEMINI_API_KEY;
            const openAiKey = process.env.OPENAI_API_KEY;
            if (!geminiKey && !openAiKey) {
              return send(200, { available: false, reason: 'No AI key configured' });
            }
            if (geminiKey) {
              const prompt = `You generate in-game dialogue for NATHAN.EXE, a retro pixel-art RPG where Nathan explores his life, memories, and friends.
Character Name: ${body.name}
Role: ${body.role}
Personality: ${body.traits || ''}
Location: ${body.location || 'Island'}
Activity: ${body.activity || 'hanging out'}
Visits: ${body.visitCount || 0}
Events: ${JSON.stringify(body.events || [])}
Input: ${body.playerChoice || 'greeting'}

Respond strictly with valid JSON:
{
  "lines": ["Spoken line 1", "Optional line 2"],
  "choices": [
    {"q": "Choice 1 for Nathan", "reply": "NPC short response", "action": null},
    {"q": "Choice 2 for Nathan", "reply": "NPC short response", "action": null}
  ]
}
Rules:
1. Natural spoken English like close friends.
2. Short, punchy replies with humor and personality.
3. NEVER use double hyphens anywhere.
4. Keep lines under 120 chars each so they fit the dialogue box.`;

              const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }],
                  generationConfig: { responseMimeType: 'application/json', temperature: 0.85 }
                })
              });
              const json = await resp.json();
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                const parsed = JSON.parse(text);
                return send(200, { available: true, ...parsed });
              }
            }
            return send(200, { available: false });
          } catch (err) {
            return send(200, { available: false, error: err.message });
          }
        });
      });
      server.middlewares.use('/__admin', (req, res) => {
        if (req.method === 'POST' && req.headers['x-admin'] !== '1') {
          res.statusCode = 403; return res.end('{"error":"Missing admin header"}');
        }
        const send = (code, body) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (!isLoopback(req.socket.remoteAddress) || !localHost(req) || !sameOrigin(req)) {
          return send(403, { error: 'Admin is only available on this computer (localhost).' });
        }
        res.setHeader('Cache-Control', 'no-store');
        if (req.method === 'GET' && req.url.startsWith('/status')) {
          return send(200, { ok: true, configured: !!readAuth(), authed: authed(req), canSave: authed(req) });
        }
        if (req.method === 'POST' && req.url.startsWith('/login')) {
          let raw = '';
          req.on('data', (c) => { raw += c; if (raw.length > 4000) req.destroy(); });
          req.on('end', () => {
            if (!readAuth()) return send(409, { error: 'No admin password set yet. Run: npm run admin:password' });
            const now = Date.now();
            if (now < lockedUntil) return send(429, { error: `Too many attempts. Try again in ${Math.ceil((lockedUntil - now) / 60000)} min.` });
            let body = {}; try { body = JSON.parse(raw); } catch { /* empty */ }
            if (!checkLogin(body.user || '', body.pass || '')) {
              fails++;
              if (fails >= 5) { lockedUntil = now + 10 * 60 * 1000; fails = 0; }
              return setTimeout(() => send(401, { error: 'Wrong username or password.' }), 600);   // slow down guessing
            }
            fails = 0;
            const token = crypto.randomBytes(32).toString('hex');
            sessions.set(token, now + SESSION_MS);
            res.setHeader('Set-Cookie', `nx_admin=${token}; HttpOnly; SameSite=Strict; Path=/__admin; Max-Age=${SESSION_MS / 1000}`);
            send(200, { ok: true });
          });
          return;
        }
        if (req.method === 'POST' && req.url.startsWith('/logout')) {
          const t = tokenOf(req); if (t) sessions.delete(t);
          res.setHeader('Set-Cookie', 'nx_admin=; HttpOnly; SameSite=Strict; Path=/__admin; Max-Age=0');
          return send(200, { ok: true });
        }
        if (!authed(req)) return send(401, { error: 'Please sign in to the admin.' });
        if (req.method === 'POST' && req.url.startsWith('/save')) {
          let raw = '';
          req.on('data', (c) => {
            raw += c;
            if (raw.length > 2_000_000) req.destroy();
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(raw);
              if (!data || typeof data !== 'object' || !data.profile || !Array.isArray(data.projects)) {
                return send(400, { error: 'Content is missing required sections (profile, projects).' });
              }
              fs.mkdirSync(BACKUP_DIR, { recursive: true });
              if (fs.existsSync(CONTENT_FILE)) {
                const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                fs.copyFileSync(CONTENT_FILE, resolve(BACKUP_DIR, `content-${stamp}.json`));
                const backups = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json')).sort();
                backups.slice(0, Math.max(0, backups.length - 30)).forEach((f) => fs.unlinkSync(resolve(BACKUP_DIR, f)));
              }
              fs.writeFileSync(CONTENT_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
              send(200, { ok: true, savedAt: new Date().toISOString() });
            } catch (err) {
              send(400, { error: 'Invalid JSON: ' + err.message });
            }
          });
          return;
        }
        if (req.method === 'POST' && req.url.startsWith('/upload')) {
          const name = new URL(req.url, 'http://x').searchParams.get('name') || '';
          const ext = String(name).toLowerCase().match(/\.(png|jpe?g|webp|gif|svg|pdf|mp4|webm|mov|m4v)$/)?.[0];
          if (!ext) return send(400, { error: 'Allowed: png, jpg, webp, gif, svg, pdf, mp4, webm, mov' });
          const limit = /mp4|webm|mov|m4v/.test(ext) ? 60_000_000 : 8_000_000;
          const chunks = []; let size = 0, tooBig = false;
          req.on('data', (c) => {
            size += c.length;
            if (size > limit) { if (!tooBig) { tooBig = true; send(413, { error: 'File too large' }); } }
            else chunks.push(c);
          });
          req.on('end', () => {
            if (tooBig) return;
            try {
              const base = String(name).toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/g, '-').slice(0, 60) || 'file';
              const fileName = `${base}-${Date.now().toString(36)}${ext}`;
              const dir = resolve(ROOT, 'public/uploads');
              fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(resolve(dir, fileName), Buffer.concat(chunks));
              send(200, { ok: true, url: `/uploads/${fileName}` });
            } catch (err) {
              send(400, { error: 'Upload failed: ' + err.message });
            }
          });
          return;
        }
        send(404, { error: 'Unknown admin route' });
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE || '/',
  plugins: [adminApi()],
  // one id per build: data and map URLs carry it, so a new deploy can never mix with old cached files
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2020',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: resolve(ROOT, 'index.html'),
        play: resolve(ROOT, 'play.html'),
        portfolio: resolve(ROOT, 'portfolio.html'),
        // admin.html is intentionally left out of production builds.
        ...(command === 'serve' ? { admin: resolve(ROOT, 'admin.html') } : {}),
      },
    },
  },
}));
