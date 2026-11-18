// Regression tests for the reviews admin + public pages. Synthetic data only, in a throw-away folder.
// Run:  npm test
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { adminApi } from '../server/admin-plugin.js';
import { renderReviewPage, clampRating } from '../src/shared/review-render.js';

const PASS = 'correct horse battery staple';
let root, server, base, cookie = '';

const writeAuth = (pass, user = 'tester') => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pass, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  fs.writeFileSync(resolve(root, '.admin-auth.json'), JSON.stringify({ user, salt, hash, set: new Date().toISOString() }));
};
const api = (path, { method = 'GET', body, headers = {}, cookieOn = true, raw } = {}) =>
  fetch(base + path, {
    method,
    headers: { ...(method === 'POST' ? { 'X-Admin': '1' } : {}), ...(cookieOn && cookie ? { Cookie: cookie } : {}), ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
const json = async (r) => r.json().catch(() => ({}));
const publicIndex = () => JSON.parse(fs.readFileSync(resolve(root, 'public/data/reviews.json'), 'utf8')).reviews;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

before(async () => {
  root = fs.mkdtempSync(resolve(os.tmpdir(), 'nx-rev-'));
  fs.mkdirSync(resolve(root, 'public/data'), { recursive: true });
  fs.writeFileSync(resolve(root, 'public/data/content.json'), '{"profile":{},"projects":[]}');
  fs.writeFileSync(resolve(root, 'public/data/reviews.json'), '{"reviews":[]}');
  fs.writeFileSync(resolve(root, 'public/index.html'), '<h1>site</h1>');
  fs.mkdirSync(resolve(root, 'review-data'), { recursive: true });
  fs.writeFileSync(resolve(root, 'review-data/reviews.json'), '[{"title":"SECRET DRAFT"}]');
  writeAuth(PASS);
  server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [adminApi(root)], server: { host: '127.0.0.1', port: 0, strictPort: false }, optimizeDeps: { noDiscovery: true, include: [] } });
  await server.listen();
  base = `http://127.0.0.1:${server.httpServer.address().port}`;
});
after(async () => { await server?.close(); fs.rmSync(root, { recursive: true, force: true }); });

// ---------------------------------------------------------------- anonymous / non-admin denial
test('anonymous requests cannot read or write any admin or review route', async () => {
  const writes = ['/__admin/reviews/save', '/__admin/reviews/publish', '/__admin/reviews/unpublish', '/__admin/reviews/delete', '/__admin/reviews/cover', '/__admin/reviews/cover-url', '/__admin/reviews/config', '/__admin/save', '/__admin/upload?name=x.png'];
  for (const p of writes) {
    const r = await api(p, { method: 'POST', body: { id: 'x', title: 'x' }, cookieOn: false });
    assert.equal(r.status, 401, `${p} should be 401 for anonymous, got ${r.status}`);
  }
  for (const p of ['/__admin/reviews', '/__admin/reviews/search?q=matrix&cat=Movie', '/__admin/reviews/cover/0123456789abcdef.png']) {
    assert.equal((await api(p, { cookieOn: false })).status, 401, p);
  }
});

test('a request with a forged or unknown session cookie is denied (non-admin)', async () => {
  const fake = 'nx_admin=' + 'a'.repeat(64);
  const r = await api('/__admin/reviews/save', { method: 'POST', body: { title: 'x' }, cookieOn: false, headers: { Cookie: fake } });
  assert.equal(r.status, 401);
});

test('POST without the X-Admin header is refused (CSRF guard)', async () => {
  const r = await fetch(base + '/__admin/reviews/save', { method: 'POST', body: '{"title":"x"}' });
  assert.equal(r.status, 403);
});

test('admin API refuses a foreign Origin and a foreign Host header (CORS / DNS rebinding)', async () => {
  const r = await api('/__admin/status', { headers: { Origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
  assert.equal(r.headers.get('access-control-allow-origin'), null, 'no CORS headers are ever sent');
  const status = await new Promise((ok, no) => {
    const u = new URL(base);
    http.get({ host: u.hostname, port: u.port, path: '/__admin/status', headers: { Host: 'evil.example' } }, (res) => { res.resume(); ok(res.statusCode); }).on('error', no);
  });
  assert.equal(status, 403);
});

test('private files (password hash, drafts, server code) are never served by the dev server', async () => {
  for (const p of ['/.admin-auth.json', '/review-data/reviews.json', '/review-data/config.json', '/review-data/audit.log', '/server/reviews.js', '/content-backups/x.json',
    '/%2eadmin-auth.json', '//review-data/reviews.json', '/review-data%2freviews.json', '/@fs/' + root.replace(/\\/g, '/') + '/.admin-auth.json', '/.admin-auth.json?import', '/REVIEW-DATA/reviews.json']) {
    const r = await fetch(base + p);
    const t = await r.text();
    assert.ok(r.status === 404 || r.status === 403, `${p} -> ${r.status}`);
    assert.ok(!/SECRET DRAFT|"hash"|"salt"/.test(t), `${p} leaked private data`);
  }
});

// ---------------------------------------------------------------- sign-in
test('wrong password is rejected; correct login sets a hardened cookie', async () => {
  const bad = await api('/__admin/login', { method: 'POST', body: { user: 'tester', pass: 'nope-nope-nope' } });
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get('set-cookie'), null);
  const ok = await api('/__admin/login', { method: 'POST', body: { user: 'tester', pass: PASS } });
  assert.equal(ok.status, 200);
  const sc = ok.headers.get('set-cookie');
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Strict/);
  assert.match(sc, /Max-Age=\d+/);
  cookie = sc.split(';')[0];
  assert.equal((await json(await api('/__admin/status'))).authed, true);
});

// ---------------------------------------------------------------- drafts, publish, unpublish
let id, slug;
const MAL = { title: 'Dune "><script>alert(1)</script>', category: 'Movie', creator: '<img src=x onerror=alert(2)>', year: '2021', body: 'Great film.\n\n<script>alert(3)</script> & "quotes" \' end', rating: 4 };

test('rating must be a number from 0 to 5 when present (never silently clamped)', async () => {
  for (const bad of [5.5, 6, -1, 'abc', '7', {}, [], true]) {
    const r = await api('/__admin/reviews/save', { method: 'POST', body: { ...MAL, rating: bad } });
    assert.equal(r.status, 400, `rating ${JSON.stringify(bad)} should be rejected`);
  }
  for (const good of [0, 1, 5, '3', null, undefined]) {
    const r = await api('/__admin/reviews/save', { method: 'POST', body: { ...MAL, title: 'Rating probe', rating: good } });
    assert.equal(r.status, 200, `rating ${JSON.stringify(good)} should be accepted`);
    const rv = (await json(r)).review;
    assert.ok(rv.rating >= 0 && rv.rating <= 5);
    await api('/__admin/reviews/delete', { method: 'POST', body: { id: rv.id } });
  }
});

test('a draft is saved privately and is not visible anywhere public', async () => {
  const r = await api('/__admin/reviews/save', { method: 'POST', body: MAL });
  assert.equal(r.status, 200);
  ({ id, slug } = (await json(r)).review);
  assert.equal(publicIndex().length, 0, 'draft must not appear in the public index');
  assert.ok(!fs.existsSync(resolve(root, 'public/reviews')), 'no public review folder for a draft');
  const idx = fs.readFileSync(resolve(root, 'public/data/reviews.json'), 'utf8');
  assert.ok(!idx.includes('Dune'));
  assert.equal((await fetch(base + '/reviews/')).status, 404);
});

test('publishing needs a title, category, rating of at least 1 and a body', async () => {
  const d = await json(await api('/__admin/reviews/save', { method: 'POST', body: { title: 'Unrated', category: 'Movie', body: 'x', rating: 0 } }));
  const r = await api('/__admin/reviews/publish', { method: 'POST', body: { id: d.review.id } });
  assert.equal(r.status, 400);
  assert.equal(publicIndex().length, 0);
  await api('/__admin/reviews/delete', { method: 'POST', body: { id: d.review.id } });
});

test('publish exposes only the approved fields and renders hostile text inertly', async () => {
  const r = await api('/__admin/reviews/publish', { method: 'POST', body: { id } });
  assert.equal(r.status, 200);
  slug = (await json(r)).review.slug;
  assert.match(slug, /^[a-z0-9][a-z0-9-]*$/);
  const [entry] = publicIndex();
  assert.deepEqual(Object.keys(entry).sort(), ['category', 'cover', 'creator', 'excerpt', 'publishedAt', 'rating', 'slug', 'title', 'year']);
  assert.ok(!('id' in entry) && !('body' in entry) && !('status' in entry));
  const html = fs.readFileSync(resolve(root, 'public/reviews', slug, 'index.html'), 'utf8');
  assert.ok(!/<script>alert/i.test(html), 'user text must not create script tags');
  assert.ok(!/<img src=x/i.test(html), 'user text must not create tags');
  assert.ok(!/onerror=alert\(2\)>/i.test(html.replace(/&lt;img[^]*?&gt;/g, '')));
  assert.equal((html.match(/<script/g) || []).length, 1, 'only the site\'s own reviews.js script');
  assert.match(html, /<title>Dune &quot;&gt;&lt;script&gt;/);
  assert.match(html, /<meta property="og:title" content="Dune [^"]*&lt;script&gt;[^"]*· 4\/5">/);
});

test('editing a published review keeps the live copy until it is published again', async () => {
  const r = await api('/__admin/reviews/save', { method: 'POST', body: { ...MAL, id, title: 'UNPUBLISHED EDIT SECRET', rating: 2 } });
  assert.equal((await json(r)).review.pending, true);
  assert.ok(!JSON.stringify(publicIndex()).includes('UNPUBLISHED EDIT SECRET'));
  assert.ok(!fs.readFileSync(resolve(root, 'public/reviews', slug, 'index.html'), 'utf8').includes('UNPUBLISHED EDIT SECRET'));
  await api('/__admin/reviews/save', { method: 'POST', body: { ...MAL, id } });   // restore
});

test('unpublish removes the page, media and index entry, and keeps the draft private', async () => {
  const r = await api('/__admin/reviews/unpublish', { method: 'POST', body: { id } });
  assert.equal(r.status, 200);
  assert.equal(publicIndex().length, 0);
  assert.ok(!fs.existsSync(resolve(root, 'public/reviews', slug)), 'public folder removed');
  assert.equal((await fetch(`${base}/reviews/${slug}/`)).status, 404);
  assert.equal((await fetch(`${base}/reviews/${slug}/index.html`)).status, 404);
  const list = await json(await api('/__admin/reviews'));
  assert.equal(list.reviews.find((x) => x.id === id).status, 'draft', 'owner still has the draft');
});

test('delete removes a published review everywhere', async () => {
  await api('/__admin/reviews/publish', { method: 'POST', body: { id } });
  assert.ok(fs.existsSync(resolve(root, 'public/reviews', slug, 'index.html')));
  await api('/__admin/reviews/delete', { method: 'POST', body: { id } });
  assert.ok(!fs.existsSync(resolve(root, 'public/reviews', slug)));
  assert.equal(publicIndex().length, 0);
});

// ---------------------------------------------------------------- covers / uploads
test('draft covers stay private; only a published review copies its cover to the public folder', async () => {
  const up = await api('/__admin/reviews/cover', { method: 'POST', raw: PNG, headers: { 'Content-Type': 'application/octet-stream' } });
  assert.equal(up.status, 200);
  const { cover } = await json(up);
  assert.match(cover, /^[a-f0-9]{16}\.png$/);
  assert.equal((await fetch(`${base}/review-data/covers/${cover}`)).status, 404);
  assert.equal((await api(`/__admin/reviews/cover/${cover}`, { cookieOn: false })).status, 401);
  const d = (await json(await api('/__admin/reviews/save', { method: 'POST', body: { ...MAL, title: 'Cover test', cover } }))).review;
  assert.deepEqual(fs.readdirSync(resolve(root, 'public/reviews')), [], 'draft cover not public');
  const pub = (await json(await api('/__admin/reviews/publish', { method: 'POST', body: { id: d.id } }))).review;
  assert.ok(fs.existsSync(resolve(root, 'public/reviews', pub.slug, 'cover.png')));
  await api('/__admin/reviews/unpublish', { method: 'POST', body: { id: d.id } });
  assert.ok(!fs.existsSync(resolve(root, 'public/reviews', pub.slug)), 'cover removed with the page');
  await api('/__admin/reviews/delete', { method: 'POST', body: { id: d.id } });
});

test('cover upload checks real file contents, not the name or content-type', async () => {
  for (const body of [Buffer.from('<?php system($_GET[1]); ?>'), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), Buffer.from('GIF'), Buffer.alloc(0)]) {
    const r = await api('/__admin/reviews/cover', { method: 'POST', raw: body, headers: { 'Content-Type': 'image/png' } });
    assert.equal(r.status, 400);
  }
  const big = await api('/__admin/reviews/cover', { method: 'POST', raw: Buffer.concat([PNG, Buffer.alloc(8_100_000)]) }).catch((e) => e);
  assert.ok(big instanceof Error || big.status === 400, 'oversized upload refused');
});

test('cover-url refuses non-allow-listed, non-https and private destinations (SSRF)', async () => {
  for (const url of ['http://169.254.169.254/latest/meta-data/', 'https://169.254.169.254/x.png', 'http://localhost:5173/.admin-auth.json', 'https://evil.example/x.png', 'file:///etc/passwd', 'https://covers.openlibrary.org.evil.example/x.jpg', 'https://user@127.0.0.1/x.png', 'ftp://archive.org/x.png', '']) {
    const r = await api('/__admin/reviews/cover-url', { method: 'POST', body: { url } });
    assert.equal(r.status, 400, url);
  }
});

test('site uploads verify file contents and reject scripted SVG', async () => {
  const up = (name, buf) => api(`/__admin/upload?name=${encodeURIComponent(name)}`, { method: 'POST', raw: buf });
  assert.equal((await up('a.png', Buffer.from('not a png at all, just text'))).status, 400);
  assert.equal((await up('a.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'))).status, 400);
  assert.equal((await up('a.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'))).status, 400);
  assert.equal((await up('a.html', PNG)).status, 400);
  assert.equal((await up('a.png', PNG)).status, 200);
});

test('review config rejects a javascript: or malformed site URL', async () => {
  for (const siteUrl of ['javascript:alert(1)', 'https://', 'https://a b.com', 'data:text/html,x']) {
    assert.equal((await api('/__admin/reviews/config', { method: 'POST', body: { siteUrl } })).status, 400, siteUrl);
  }
});

// ---------------------------------------------------------------- rendering (unit)
test('renderReviewPage escapes every field, including social metadata', () => {
  const evil = `"><svg onload=alert(1)>'`;
  const html = renderReviewPage({ title: evil, category: evil, creator: evil, year: evil, rating: 9, body: evil, publishedAt: '2026-01-01' }, { coverSrc: evil, siteUrl: 'https://x.example', slug: 'a' });
  assert.ok(!/<svg onload/i.test(html));
  assert.ok(!/content="[^"]*"><svg/i.test(html));
  assert.match(html, /5\/5/, 'out of range rating is clamped for display');
  assert.equal(clampRating(-3), 0);
  assert.equal(clampRating('x'), 0);
  assert.equal(clampRating(5.4), 5);
});

test('published page carries the correct title, description and share image', () => {
  const html = renderReviewPage({ title: 'Heat', category: 'Movie', creator: 'Michael Mann', year: '1995', rating: 5, body: 'A cracking crime epic.', publishedAt: '2026-01-01' }, { coverSrc: 'cover.jpg', siteUrl: 'https://site.example/', slug: 'heat' });
  assert.match(html, /<title>Heat · Review · NATHAN\.EXE<\/title>/);
  assert.match(html, /og:description" content="A cracking crime epic\."/);
  assert.match(html, /og:image" content="https:\/\/site\.example\/reviews\/heat\/cover\.jpg"/);
  assert.match(html, /rel="canonical" href="https:\/\/site\.example\/reviews\/heat\/"/);
  assert.ok(!/noindex/.test(html));
});

// ---------------------------------------------------------------- sessions / audit (keep last)
test('the audit log records admin changes without secrets or review text', () => {
  const log = fs.readFileSync(resolve(root, 'review-data/audit.log'), 'utf8');
  assert.match(log, /login\.fail/);
  assert.match(log, /login\.ok/);
  assert.match(log, /review\.publish/);
  assert.match(log, /review\.unpublish/);
  assert.match(log, /review\.delete/);
  assert.ok(!log.includes(PASS) && !log.includes('Great film') && !/nx_admin/.test(log));
});

test('changing the admin password revokes existing sessions; logout ends the session', async () => {
  const keep = cookie;
  writeAuth('a brand new passphrase 123');
  assert.equal((await api('/__admin/reviews')).status, 401, 'old session dies after a password change');
  cookie = '';
  const ok = await api('/__admin/login', { method: 'POST', body: { user: 'tester', pass: 'a brand new passphrase 123' } });
  assert.equal(ok.status, 200);
  cookie = ok.headers.get('set-cookie').split(';')[0];
  assert.equal((await api('/__admin/reviews')).status, 200);
  await api('/__admin/logout', { method: 'POST' });
  assert.equal((await api('/__admin/reviews')).status, 401, 'logout revokes the token server-side');
  const replay = await api('/__admin/reviews', { cookieOn: false, headers: { Cookie: keep } });
  assert.equal(replay.status, 401);
});
