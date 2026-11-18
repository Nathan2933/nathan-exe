import { resolve } from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createReviewsApi } from './reviews.js';

/** Dev-only admin plugin (sign-in, content save, uploads, reviews). ROOT = the web folder. Never part of the production build. */
export function adminApi(ROOT) {
const CONTENT_FILE = resolve(ROOT, 'public/data/content.json');
const BACKUP_DIR = resolve(ROOT, 'content-backups');
const AUTH_FILE = resolve(ROOT, '.admin-auth.json');   // created by `npm run admin:password`, git-ignored
// ---- admin sign-in: scrypt-hashed password, HttpOnly session cookie, lockout on repeated failures ----
const sessions = new Map();                 // token -> { exp (ms), stamp }  (stamp ties a session to the current password)
const stampOf = (a) => (a ? crypto.createHash('sha256').update(`${a.user}|${a.salt}|${a.hash}`).digest('hex') : '');
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
  const t = tokenOf(req), s = t && sessions.get(t);
  if (!s) return false;
  if (Date.now() > s.exp || s.stamp !== stampOf(readAuth())) { sessions.delete(t); return false; }
  return true;
}
// Only accept requests addressed to this machine (blocks DNS-rebinding tricks from other sites)
const localHost = (req) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(req.headers.host || '');
const sameOrigin = (req) => !req.headers.origin || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(req.headers.origin);

// append-only admin audit trail (never contains passwords, tokens or review text)
const AUDIT = resolve(ROOT, 'review-data', 'audit.log');
function audit(action, detail = '') {
  try { fs.mkdirSync(resolve(ROOT, 'review-data'), { recursive: true }); fs.appendFileSync(AUDIT, `${new Date().toISOString()} ${action} ${String(detail).replace(/[^\w .:/-]/g, '').slice(0, 120)}\n`); } catch { /* never block the admin on logging */ }
}
// Files the dev server must never hand out: the password hash, review drafts, backups and server code.
// (Vite serves everything under the project root, and the dev server listens on the LAN for phone testing.)
const PRIVATE_PATH = /^\/(\.admin-auth|review-data|content-backups|server|tools|api|\.env|package(-lock)?\.json|vite\.config|\.git)(?=$|[/.?#])/i;
function isPrivatePath(rawUrl) {
  let u = String(rawUrl || '').split(/[?#]/)[0];
  try { u = decodeURIComponent(u); } catch { return true; }
  u = u.split(String.fromCharCode(92)).join('/').replace(/\/{2,}/g, '/');
  if (/^\/@fs\//i.test(u) || u.includes('/../') || u.includes('\0')) return true;
  return PRIVATE_PATH.test(u);
}
// real file-type check for uploads (the extension alone proves nothing)
const RAW_SIG = {
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  gif: (b) => b.subarray(0, 3).toString() === 'GIF',
  pdf: (b) => b.subarray(0, 5).toString() === '%PDF-',
  webm: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  mp4: (b) => b.subarray(4, 8).toString() === 'ftyp',
};
function uploadLooksValid(ext, buf) {
  const e = ext.replace('.', '').replace('jpeg', 'jpg').replace(/^(mov|m4v)$/, 'mp4');
  if (e === 'svg') { const t = buf.toString('utf8'); return /<svg[\s>]/i.test(t) && !/<script|<foreignObject|<iframe|<embed|<object|\son\w+\s*=|javascript:|data:text\/html/i.test(t); }
  return !!RAW_SIG[e] && RAW_SIG[e](buf);
}
return innerPlugin();

/**
 * Dev-only admin API. Lets /admin.html save content.json to disk.
 * Only accepts requests from this machine (loopback), even though the dev
 * server listens on 0.0.0.0 so phones on the LAN can play-test.
 * Never included in the production build.
 */
function innerPlugin() {
  const reviewsApi = createReviewsApi(ROOT, { audit });
  const isLoopback = (addr = '') =>
    addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';

  return {
    name: 'nathan-admin-api',
    apply: 'serve',
    configureServer(server) {
      // Private files (password hash, drafts, backups, server code) are never served to anyone
      server.middlewares.use((req, res, next) => { if (isPrivatePath(req.url)) { res.statusCode = 404; return res.end('Not found'); } next(); });
      // The admin page and its script are only served to this computer
      server.middlewares.use((req, res, next) => {
        const u = (req.url || '').split('?')[0];
        if (/^\/(admin(\.html)?|src\/admin(-reviews)?\.js|src\/styles\/admin\.css)$/.test(u) && (!isLoopback(req.socket.remoteAddress) || !localHost(req))) {
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
      server.middlewares.use('/__admin', async (req, res) => {
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
              fails++; audit('login.fail');
              if (fails >= 5) { lockedUntil = now + 10 * 60 * 1000; fails = 0; }
              return setTimeout(() => send(401, { error: 'Wrong username or password.' }), 600);   // slow down guessing
            }
            fails = 0;
            const token = crypto.randomBytes(32).toString('hex');
            sessions.set(token, { exp: now + SESSION_MS, stamp: stampOf(readAuth()) });
            audit('login.ok');
            res.setHeader('Set-Cookie', `nx_admin=${token}; HttpOnly; SameSite=Strict; Path=/__admin; Max-Age=${SESSION_MS / 1000}`);
            send(200, { ok: true });
          });
          return;
        }
        if (req.method === 'POST' && req.url.startsWith('/logout')) {
          const t = tokenOf(req); if (t) sessions.delete(t); audit('logout');
          res.setHeader('Set-Cookie', 'nx_admin=; HttpOnly; SameSite=Strict; Path=/__admin; Max-Age=0');
          return send(200, { ok: true });
        }
        if (!authed(req)) return send(401, { error: 'Please sign in to the admin.' });
        if (await reviewsApi(req, res, send)) return;   // Reviews tab API (same session check as above)
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
              audit('content.save');
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
              const data = Buffer.concat(chunks);
              if (!uploadLooksValid(ext, data)) return send(400, { error: 'That file is not really a ' + ext.slice(1) + ' (or the SVG contains scripts).' });
              fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(resolve(dir, fileName), data);
              audit('upload', fileName);
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

}
