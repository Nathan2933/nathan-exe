// Pure string rendering for a public review page. Used by the dev server (writes the static page on publish)
// and by the admin preview, so what you preview is exactly what visitors get. No DOM, no Node APIs.

export const CATEGORIES = ['Movie', 'TV Show', 'Anime', 'Music', 'Book', 'Game', 'Podcast', 'App', 'Other'];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const clampRating = (n) => Math.min(5, Math.max(0, Math.round(Number(n) || 0)));

export function starsHtml(rating) {
  const r = clampRating(rating);
  let out = '';
  for (let i = 1; i <= 5; i++) out += `<span class="${i <= r ? 'on' : 'off'}" aria-hidden="true">★</span>`;
  return `<span class="stars" role="img" aria-label="${r} out of 5 stars">${out}</span>`;
}

export const paragraphs = (text) =>
  String(text ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

export const excerptOf = (text, n = 180) => {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
};

// Which pixel scene (background + Nathan layer) each category gets. Anything else gets the quiet neutral room.

/**
 * @param r       review {title, category, creator, year, rating, body, publishedAt}
 * @param opts    {coverSrc, siteUrl, slug, preview}  coverSrc is relative to the page (or any URL in preview)
 */
export function renderReviewPage(r, { coverSrc = '', siteUrl = '', slug = '', preview = false, assets = '../' } = {}) {
  const url = siteUrl && slug ? `${siteUrl.replace(/\/+$/, '')}/reviews/${slug}/` : '';
  const absCover = siteUrl && coverSrc && !preview ? `${siteUrl.replace(/\/+$/, '')}/reviews/${slug}/${coverSrc}` : '';
  const desc = excerptOf(r.body, 200) || `${r.title}: a review by Nathan`;
  const meta = [r.creator, r.year].filter(Boolean).map(esc).join(' · ');
  const date = r.publishedAt ? new Date(r.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(r.title)} · Review · NATHAN.EXE</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0b1230">
${preview ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(r.title)} · ${clampRating(r.rating)}/5">
<meta property="og:description" content="${esc(desc)}">
${url ? `<meta property="og:url" content="${esc(url)}"><link rel="canonical" href="${esc(url)}">` : ''}
${absCover ? `<meta property="og:image" content="${esc(absCover)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(absCover)}">` : '<meta name="twitter:card" content="summary">'}
<link rel="icon" href="${assets}../favicon.ico" sizes="any">
<link rel="stylesheet" href="${assets}reviews.css">
</head>
<body class="rv-page rv-list rv-single">
<header class="rv-top">
  <a class="rv-brand" href="${assets}../">NATHAN.EXE <b>/ reviews</b></a>
  <a class="rv-back" href="${assets}">All reviews</a>
</header>
<main class="rv-wrap">
  <article class="rvp">
    <div class="rvp-stage">
      <div class="rvp-frame"><figure class="rvp-poster${coverSrc ? '' : ' none'}">${coverSrc ? `<img src="${esc(coverSrc)}" alt="Cover art for ${esc(r.title)}">` : '<span aria-hidden="true">★</span>'}</figure></div>
    </div>
    <div class="rvp-info">
      <p class="rv-cat">${esc(r.category)}</p>
      <h1>${esc(r.title)}</h1>
      ${meta ? `<p class="rv-meta">${meta}</p>` : ''}
      <p class="rv-rate">${starsHtml(r.rating)} <b>${clampRating(r.rating)}/5</b></p>
      <div class="rv-body">${paragraphs(r.body)}</div>
      <p class="rv-date">${date ? `Reviewed ${esc(date)} by Nathan` : 'Review by Nathan'}</p>
      <div class="rv-actions">
        <button type="button" class="rv-btn primary" data-share data-title="${esc(r.title)}" data-text="${esc(`${r.title}: ${clampRating(r.rating)}/5. Nathan's review`)}">Share</button>
        ${preview ? '' : `<button type="button" class="rv-btn" data-share-story data-story="${esc(JSON.stringify({ title: r.title, category: r.category, creator: r.creator || '', year: r.year || '', rating: clampRating(r.rating), oneliner: r.oneliner || '', body: excerptOf(r.body, 400), slug }))}">Share as Story</button>`}
        <a class="rv-btn" href="${assets}">More reviews</a>
      </div>
      <p class="rv-status" role="status" aria-live="polite"></p>
    </div>
  </article>
</main>
<script src="${assets}reviews.js"></script>
</body>
</html>
`;
}
