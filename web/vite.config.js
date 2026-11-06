import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import fs from 'node:fs';

const ROOT = __dirname;
const CONTENT_FILE = resolve(ROOT, 'public/data/content.json');
const BACKUP_DIR = resolve(ROOT, 'content-backups');

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
      server.middlewares.use('/__admin', (req, res) => {
        const send = (code, body) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (!isLoopback(req.socket.remoteAddress)) {
          return send(403, { error: 'Admin saving is only allowed from this computer (localhost).' });
        }
        if (req.method === 'GET' && req.url.startsWith('/status')) {
          return send(200, { ok: true, canSave: true });
        }
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
          let raw = '';
          req.on('data', (c) => {
            raw += c;
            if (raw.length > 12_000_000) req.destroy();
          });
          req.on('end', () => {
            try {
              const { name, data } = JSON.parse(raw);
              const ext = String(name).toLowerCase().match(/\.(png|jpe?g|webp|gif|svg|pdf)$/)?.[0];
              if (!ext) return send(400, { error: 'Allowed: png, jpg, webp, gif, svg, pdf' });
              const base = String(name).toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/g, '-').slice(0, 60) || 'file';
              const fileName = `${base}${ext}`;
              const dir = resolve(ROOT, 'public/uploads');
              fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(resolve(dir, fileName), Buffer.from(String(data), 'base64'));
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
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2020',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: resolve(ROOT, 'index.html'),
        portfolio: resolve(ROOT, 'portfolio.html'),
        // admin.html is intentionally left out of production builds.
        ...(command === 'serve' ? { admin: resolve(ROOT, 'admin.html') } : {}),
      },
    },
  },
}));
