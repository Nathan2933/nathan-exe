// Reviews backend (dev admin server only). Mounted under /__admin/reviews AFTER the admin sign-in check,
// so every route here already requires the signed-in admin session, a loopback connection and (for POST) the X-Admin header.
//
// Private (git-ignored):  review-data/reviews.json (all reviews incl. drafts), review-data/covers/*, review-data/config.json
// Public (published only): public/data/reviews.json, public/reviews/<slug>/index.html + cover.<ext>
import fs from 'node:fs';
import { resolve } from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { CATEGORIES, clampRating, excerptOf, renderReviewPage } from '../src/shared/review-render.js';

const COVER_HOSTS = [/(^|\.)mzstatic\.com$/, /^covers\.openlibrary\.org$/, /(^|\.)archive\.org$/, /(^|\.)myanimelist\.net$/, /(^|\.)steamstatic\.com$/, /^upload\.wikimedia\.org$/];
const MAX_IMG = 8_000_000;

export function createReviewsApi(ROOT, { audit = () => {} } = {}) {
  const PRIV = resolve(ROOT, 'review-data');
  const COVERS = resolve(PRIV, 'covers');
  const DB = resolve(PRIV, 'reviews.json');
  const CFG = resolve(PRIV, 'config.json');
  const PUB_DIR = resolve(ROOT, 'public/reviews');
  const PUB_JSON = resolve(ROOT, 'public/data/reviews.json');
  fs.mkdirSync(COVERS, { recursive: true });

  const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
  const writeJson = (f, v) => { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 2) + '\n', 'utf8'); fs.renameSync(t, f); };
  const load = () => readJson(DB, []);
  const config = () => ({ siteUrl: '', ...readJson(CFG, {}) });

  const sniff = (b) => {
    if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg';
    if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
    if (b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return '.webp';
    if (b.length > 12 && b.subarray(0, 3).toString() === 'GIF') return '.gif';
    return '';
  };
  const hostOk = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && COVER_HOSTS.some((re) => re.test(x.hostname)); } catch { return false; } };

  const privateIp = (ip) => {
    if (net.isIPv6(ip)) { const v = ip.toLowerCase(); return v === '::1' || v === '::' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || (v.startsWith('::ffff:') && privateIp(v.slice(7))); }
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  };
  async function publicHost(hostname) {
    const addrs = await dns.lookup(hostname, { all: true });
    if (!addrs.length || addrs.some((x) => privateIp(x.address))) throw new Error('That image host is not allowed.');
  }
  // tiny sliding-window limiter for the endpoints that call out to other services
  const hits = new Map();
  const limited = (key, max, ms = 60_000) => {
    const now = Date.now(), arr = (hits.get(key) || []).filter((t) => now - t < ms);
    arr.push(now); hits.set(key, arr);
    return arr.length > max;
  };

  function body(req, limit) {
    return new Promise((ok, no) => {
      const chunks = []; let n = 0;
      req.on('data', (c) => { n += c.length; if (n > limit) { no(new Error('Too large')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => ok(Buffer.concat(chunks)));
      req.on('error', no);
    });
  }
  const jsonBody = async (req) => { try { return JSON.parse((await body(req, 400_000)).toString('utf8') || '{}'); } catch { return {}; } };

  async function fetchImage(url) {
    let u = url;
    for (let hop = 0; hop < 4; hop++) {
      if (!hostOk(u)) throw new Error('That image host is not allowed.');
      await publicHost(new URL(u).hostname);
      const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'portfolio-reviews' } });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location'), u).href; continue; }
      if (!r.ok) throw new Error(`Image download failed (${r.status}).`);
      if (Number(r.headers.get('content-length')) > MAX_IMG) throw new Error('Image too large (max 8 MB).');
      // read as a stream so an oversized or endless response is cut off at the limit
      const chunks = []; let n = 0;
      for await (const c of r.body) { n += c.length; if (n > MAX_IMG) { r.body.cancel?.().catch(() => {}); throw new Error('Image too large (max 8 MB).'); } chunks.push(Buffer.from(c)); }
      return Buffer.concat(chunks);
    }
    throw new Error('Too many redirects.');
  }
  function storeCover(buf) {
    const ext = sniff(buf);
    if (!ext) throw new Error('Cover must be a PNG, JPG, WebP or GIF image.');
    const name = `${crypto.randomBytes(8).toString('hex')}${ext}`;
    fs.writeFileSync(resolve(COVERS, name), buf);
    return name;
  }

  // ---------- search (server-side so there are no CORS or key problems) ----------
  const big = (u) => String(u || '').replace(/\/\d+x\d+(bb)?\.(jpg|png)$/, '/600x600bb.jpg');
  const yr = (d) => (String(d || '').match(/\d{4}/) || [''])[0];
  async function getJson(u) {
    const r = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'portfolio-reviews' } });
    if (!r.ok) throw new Error(`Search service returned ${r.status}.`);
    return r.json();
  }
  // Wikipedia search with lead image (no key needed): used for films and TV, where Apple's search no longer lists them
  async function wiki(q, kind, relevant) {
    const api = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=30&gsrsearch=${encodeURIComponent(`${q} ${kind}`)}&prop=pageimages%7Cdescription&piprop=thumbnail&pithumbsize=600`;
    const pages = Object.values((await getJson(api)).query?.pages || {}).sort((a, b) => a.index - b.index);
    const hits = pages.filter((x) => relevant.test(x.description || '') && !/character|adaptations|franchise|soundtrack|list of/i.test(x.description + ' ' + x.title)).slice(0, 15);
    // The search thumbnail skips posters (non-free), but the page summary includes the infobox poster.
    return Promise.all(hits.map(async (x) => {
      const d = x.description || '';
      let cover = x.thumbnail?.source || '';
      if (!cover) {
        try {
          const s = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(x.title.replace(/ /g, '_'))}`);
          cover = (s.originalimage?.source || s.thumbnail?.source || '').split('?')[0];
        } catch { /* no poster; the result still works */ }
      }
      return { title: x.title.replace(/\s*\((?:[^)]*(?:film|TV series|miniseries|series)[^)]*)\)$/i, ''), creator: ((d.match(/by (.+)$/i) || [])[1] || '').split(/,| and /)[0].trim(), year: (d.match(/(?:18|19|20)\d\d/) || [''])[0], cover };
    }));
  }
  async function search(cat, q) {
    const term = encodeURIComponent(q);
    const itunes = async (qs, map) => (await getJson(`https://itunes.apple.com/search?term=${term}&limit=12&${qs}`)).results.map(map);
    switch (cat) {
      case 'Movie': return wiki(q, 'film', /film/i);
      case 'TV Show': return wiki(q, 'television series', /series|show|miniseries|sitcom|drama|television/i);
      case 'Music': return itunes('media=music&entity=album', (x) => ({ title: x.collectionName, creator: x.artistName, year: yr(x.releaseDate), cover: big(x.artworkUrl100) }));
      case 'Podcast': return itunes('media=podcast&entity=podcast', (x) => ({ title: x.collectionName, creator: x.artistName, year: yr(x.releaseDate), cover: big(x.artworkUrl100) }));
      case 'App': return itunes('entity=software', (x) => ({ title: x.trackName, creator: x.artistName, year: yr(x.releaseDate), cover: big(x.artworkUrl512 || x.artworkUrl100) }));
      case 'Book': {
        const j = await getJson(`https://openlibrary.org/search.json?q=${term}&limit=12&fields=title,author_name,first_publish_year,cover_i`);
        return j.docs.map((x) => ({ title: x.title, creator: (x.author_name || [])[0] || '', year: x.first_publish_year ? String(x.first_publish_year) : '', cover: x.cover_i ? `https://covers.openlibrary.org/b/id/${x.cover_i}-L.jpg` : '' }));
      }
      case 'Anime': {
        const j = await getJson(`https://api.jikan.moe/v4/anime?q=${term}&limit=12&sfw=true`);
        return (j.data || []).map((x) => ({ title: x.title_english || x.title, creator: (x.studios || [])[0]?.name || '', year: x.year ? String(x.year) : yr(x.aired?.from), cover: x.images?.jpg?.large_image_url || '' }));
      }
      case 'Game': {
        const j = await getJson(`https://store.steampowered.com/api/storesearch/?term=${term}&l=english&cc=us`);
        return (j.items || []).slice(0, 12).map((x) => ({ title: x.name, creator: '', year: '', cover: `https://cdn.akamai.steamstatic.com/steam/apps/${x.id}/header.jpg` }));
      }
      default: return [];
    }
  }

  // ---------- publishing ----------
  const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'review';
  const slugDir = (slug) => { if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('Bad slug'); return resolve(PUB_DIR, slug); };

  function rebuildPublicIndex(all) {
    const pub = all.filter((r) => r.status === 'published' && r.live)
      .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
      .map((r) => ({ slug: r.slug, title: r.live.title, category: r.live.category, creator: r.live.creator, year: r.live.year, rating: r.live.rating, cover: r.live.cover ? `reviews/${r.slug}/${r.live.cover}` : '', excerpt: excerptOf(r.live.body), publishedAt: r.publishedAt }));
    fs.mkdirSync(resolve(ROOT, 'public/data'), { recursive: true });
    writeJson(PUB_JSON, { reviews: pub });
  }
  function removePublic(slug) {
    if (!slug) return;
    fs.rmSync(slugDir(slug), { recursive: true, force: true });
  }
  function publish(all, r) {
    const bad = !r.title ? 'a title' : !CATEGORIES.includes(r.category) ? 'a category' : !(r.rating >= 1) ? 'a star rating' : !String(r.body).trim() ? 'your thoughts' : '';
    if (bad) throw new Error(`Add ${bad} before publishing.`);
    if (!r.slug) {
      const base = slugify(r.title); let s = base, n = 2;
      while (all.some((x) => x.slug === s && x.id !== r.id)) s = `${base}-${n++}`;
      r.slug = s;
    }
    const dir = slugDir(r.slug);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) if (/^cover\./.test(f)) fs.unlinkSync(resolve(dir, f));
    let cover = '';
    if (r.cover && fs.existsSync(resolve(COVERS, r.cover))) { cover = 'cover' + r.cover.slice(r.cover.lastIndexOf('.')); fs.copyFileSync(resolve(COVERS, r.cover), resolve(dir, cover)); }
    const now = new Date().toISOString();
    r.publishedAt ||= now;
    r.live = { title: r.title, category: r.category, creator: r.creator, year: r.year, rating: r.rating, body: r.body, oneliner: r.oneliner || '', cover };
    r.status = 'published'; r.pending = false;
    fs.writeFileSync(resolve(dir, 'index.html'), renderReviewPage({ ...r.live, publishedAt: r.publishedAt }, { coverSrc: cover, siteUrl: config().siteUrl, slug: r.slug }), 'utf8');
    rebuildPublicIndex(all);
  }

  const clean = (s, n) => String(s ?? '').replace(/\r/g, '').trim().slice(0, n);
  const view = (r) => ({ id: r.id, slug: r.slug || '', title: r.title, category: r.category, creator: r.creator, year: r.year, rating: r.rating, body: r.body, oneliner: r.oneliner || '', cover: r.cover, status: r.status, pending: !!r.pending, createdAt: r.createdAt, updatedAt: r.updatedAt, publishedAt: r.publishedAt || '' });

  /** @returns {Promise<boolean>} true when the request was handled */
  return async function handle(req, res, send, path) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (!p.startsWith('/reviews')) return false;
    try {
      if (req.method === 'GET' && p.startsWith('/reviews/cover/')) {
        const f = decodeURIComponent(p.slice('/reviews/cover/'.length));
        if (!/^[a-f0-9]{16}\.(jpg|png|webp|gif)$/.test(f) || !fs.existsSync(resolve(COVERS, f))) return send(404, { error: 'Not found' }), true;
        res.statusCode = 200;
        res.setHeader('Content-Type', { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[f.split('.')[1]]);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.end(fs.readFileSync(resolve(COVERS, f)));
        return true;
      }
      if (req.method === 'GET' && p === '/reviews') { send(200, { reviews: load().map(view), config: config(), categories: CATEGORIES }); return true; }
      if (req.method === 'GET' && p === '/reviews/search') {
        if (limited('search', 30)) { send(429, { error: 'Too many searches. Wait a minute.' }); return true; }
        const q = clean(url.searchParams.get('q'), 120), cat = url.searchParams.get('cat');
        if (q.length < 2) { send(200, { results: [] }); return true; }
        try { send(200, { results: (await search(cat, q)).filter((x) => x.title) }); }
        catch (e) { send(502, { error: `Search is unavailable right now (${e.message}). You can still enter it manually.` }); }
        return true;
      }
      if (req.method !== 'POST') { send(405, { error: 'Method not allowed' }); return true; }

      if (p === '/reviews/config') {
        const b = await jsonBody(req);
        let s = clean(b.siteUrl, 200).replace(/\/+$/, '');
        if (s && !/^https?:\/\/[^\s/]+(\/[^\s]*)?$/i.test(s)) { send(400, { error: 'Enter the address like https://your-site.com' }); return true; }
        writeJson(CFG, { siteUrl: s });
        send(200, { config: config() }); return true;
      }
      if (p === '/reviews/cover') {   // upload
        if (limited('cover-upload', 30)) { send(429, { error: 'Too many uploads. Wait a minute.' }); return true; }
        const name = storeCover(await body(req, MAX_IMG));
        send(200, { cover: name }); return true;
      }
      if (p === '/reviews/cover-url') {
        if (limited('cover-url', 20)) { send(429, { error: 'Too many downloads. Wait a minute.' }); return true; }
        const b = await jsonBody(req);
        send(200, { cover: storeCover(await fetchImage(String(b.url || ''))) }); return true;
      }

      const all = load();
      if (p === '/reviews/save') {
        const b = await jsonBody(req);
        const title = clean(b.title, 140);
        if (!title) { send(400, { error: 'Give the review a title first.' }); return true; }
        let r = b.id ? all.find((x) => x.id === b.id) : null;
        if (b.id && !r) { send(404, { error: 'Review not found.' }); return true; }
        if (!r) { r = { id: crypto.randomBytes(6).toString('hex'), slug: '', status: 'draft', createdAt: new Date().toISOString() }; all.push(r); }
        // rating is optional; when present it must be a number from 0 to 5 (0 = not rated yet). Never silently clamped.
        let rating = 0;
        if (b.rating !== undefined && b.rating !== null && b.rating !== '') {
          rating = typeof b.rating === 'string' && b.rating.trim() ? Number(b.rating) : b.rating;
          if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 0 || rating > 5) { send(400, { error: 'Rating must be a number from 0 to 5.' }); return true; }
          rating = Math.round(rating);
        }
        const cover = /^[a-f0-9]{16}\.(jpg|png|webp|gif)$/.test(b.cover || '') && fs.existsSync(resolve(COVERS, b.cover)) ? b.cover : '';
        Object.assign(r, {
          title, category: CATEGORIES.includes(b.category) ? b.category : 'Other',
          creator: clean(b.creator, 120), year: clean(b.year, 12).replace(/[^\d–-]/g, ''),
          rating, body: clean(b.body, 20000), oneliner: clean(b.oneliner, 100).replace(/\s+/g, ' '), cover, updatedAt: new Date().toISOString(),
        });
        if (r.status === 'published') r.pending = true;   // live copy is untouched until Publish
        writeJson(DB, all);
        audit('review.save', r.id);
        send(200, { review: view(r) }); return true;
      }

      const b = await jsonBody(req);
      const r = all.find((x) => x.id === b.id);
      if (!r) { send(404, { error: 'Review not found.' }); return true; }
      if (p === '/reviews/publish') { publish(all, r); writeJson(DB, all); audit('review.publish', r.id); send(200, { review: view(r) }); return true; }
      if (p === '/reviews/unpublish') {
        removePublic(r.slug); r.status = 'draft'; r.live = null; r.pending = false;
        rebuildPublicIndex(all); writeJson(DB, all); audit('review.unpublish', r.id); send(200, { review: view(r) }); return true;
      }
      if (p === '/reviews/delete') {
        removePublic(r.slug);
        const rest = all.filter((x) => x.id !== r.id);
        rebuildPublicIndex(rest); writeJson(DB, rest); audit('review.delete', r.id); send(200, { ok: true }); return true;
      }
      send(404, { error: 'Unknown reviews route' });
    } catch (e) {
      send(400, { error: e.message || 'Request failed' });
    }
    return true;
  };
}
