// Dev only: Vite's SPA fallback would answer /reviews/ and /reviews/<slug>/ with the portfolio page.
// Production hosts (nginx, Netlify, Vercel) serve the folder's index.html on their own, so this mimics that.
import fs from 'node:fs';
import { resolve } from 'node:path';

export function reviewsDevStatic(ROOT) {
  return {
    name: 'reviews-dev-static',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/reviews(\/[a-z0-9-]+)?(\?.*)?$/.exec(req.url || '');
        if (!m || req.method !== 'GET') return next();
        res.statusCode = 301; res.setHeader('Location', `/reviews${m[1] || ''}/${m[2] || ''}`); res.end();
      });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/reviews(?:\/([a-z0-9-]+))?\/?(?:\?.*)?$/.exec(req.url || '');
        if (!m || req.method !== 'GET') return next();
        const file = resolve(ROOT, 'public/reviews', m[1] || '', 'index.html');
        if (!fs.existsSync(file)) return next();
        if (!/\/(\?.*)?$/.test(req.url)) { res.statusCode = 301; res.setHeader('Location', req.url.replace(/^([^?]*)/, '$1/')); return res.end(); }
        // version the shared stylesheet/script by file time so an edit is never hidden by a stale browser cache
        const stamp = (f) => { try { return fs.statSync(resolve(ROOT, 'public/reviews', f)).mtimeMs.toString(36); } catch { return '0'; } };
        const v = stamp('reviews.css') + stamp('reviews.js');
        const html = fs.readFileSync(file, 'utf8').replace(/(reviews\.(?:css|js))(?=")/g, `$1?v=${v}`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(html);
      });
    },
  };
}
