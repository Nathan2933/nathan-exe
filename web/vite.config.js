import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { adminApi } from './server/admin-plugin.js';
import { reviewsDevStatic } from './server/reviews-dev-static.js';

const ROOT = __dirname;

export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE || '/',
  plugins: [adminApi(ROOT), reviewsDevStatic(ROOT)],
  // one id per build: data and map URLs carry it, so a new deploy can never mix with old cached files
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2020',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // three.js in its own long-cached chunk: game code changes never re-download the engine
        manualChunks(id) { if (/node_modules[\/]three[\/]/.test(id)) return 'three'; },
      },
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
