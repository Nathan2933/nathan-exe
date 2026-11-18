import { CATEGORIES, renderReviewPage, starsHtml, excerptOf, clampRating } from './shared/review-render.js';

// Reviews tab for the admin. All data lives behind /__admin/reviews/* (same sign-in as the rest of the admin).
// Drafts and covers stay private on this computer; Publish writes the public page + data file.

const $el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c);
  return n;
};

async function api(path, { method = 'GET', json, raw } = {}) {
  const headers = {};
  if (method !== 'GET') headers['X-Admin'] = '1';
  let body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (raw) { headers['Content-Type'] = 'application/octet-stream'; body = raw; }
  const res = await fetch(`/__admin/reviews${path}`, { method, headers, body });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Request failed (${res.status})`);
  return out;
}

const coverUrl = (r) => (r.cover ? `/__admin/reviews/cover/${r.cover}` : '');
const publicPath = (r) => `/reviews/${r.slug}/`;
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export async function mountReviews(host, setStatus) {
  let state = { reviews: [], config: { siteUrl: '' }, filter: 'all' };
  host.replaceChildren($el('p', { class: 'note' }, 'Loading reviews…'));
  try { Object.assign(state, await api('')); } catch (e) { host.replaceChildren($el('p', { class: 'note' }, e.message)); return; }

  const toast = (m, kind = 'ok') => setStatus(m, kind);
  const siteBase = () => (state.config.siteUrl || '').replace(/\/+$/, '');
  const publicLink = (r) => (siteBase() ? `${siteBase()}${publicPath(r)}` : '');

  // ---------- list ----------
  function showList() {
    const shown = state.reviews.filter((r) => state.filter === 'all' || (state.filter === 'draft' ? r.status !== 'published' : r.status === 'published'))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const count = (f) => state.reviews.filter((r) => (f === 'draft' ? r.status !== 'published' : f === 'published' ? r.status === 'published' : true)).length;

    const site = $el('input', { type: 'url', id: 'rv-site', placeholder: 'https://your-site.com', value: state.config.siteUrl || '', inputmode: 'url' });
    const siteForm = $el('form', { class: 'rv-site card', onsubmit: async (e) => {
      e.preventDefault();
      try { state.config = (await api('/config', { method: 'POST', json: { siteUrl: site.value } })).config; toast('Site address saved. Re-publish a review to refresh its share preview.'); showList(); }
      catch (err) { toast(err.message, 'err'); }
    } },
      $el('label', { for: 'rv-site' }, 'Public site address'),
      $el('div', { class: 'file-row' }, site, $el('button', { class: 'btn', type: 'submit' }, 'Save')),
      $el('small', {}, 'Used for "Copy public link", the Story card and share previews. Enter the address where your portfolio is hosted.'));

    const filters = $el('div', { class: 'rv-filters', role: 'group', 'aria-label': 'Filter reviews' },
      ...[['all', 'All'], ['draft', 'Drafts'], ['published', 'Published']].map(([k, label]) =>
        $el('button', { class: `rv-pill${state.filter === k ? ' on' : ''}`, type: 'button', 'aria-pressed': String(state.filter === k), onclick: () => { state.filter = k; showList(); } }, `${label} (${count(k)})`)));

    const cards = shown.length
      ? shown.map(listCard)
      : [$el('p', { class: 'note' }, state.reviews.length ? 'Nothing in this filter.' : 'No reviews yet. Click "New review" to write your first one.')];

    host.replaceChildren(
      $el('div', { class: 'rv-toolbar' }, $el('button', { class: 'btn add', type: 'button', onclick: () => showEditor(null) }, '+ New review'), filters),
      siteForm,
      $el('div', { class: 'rv-list' }, ...cards));
  }

  function listCard(r) {
    const published = r.status === 'published';
    const act = (label, fn, cls = '') => $el('button', { class: `btn small ${cls}`, type: 'button', onclick: fn }, label);
    return $el('article', { class: 'card rv-item' },
      $el('div', { class: 'rv-thumb' }, r.cover ? $el('img', { src: coverUrl(r), alt: '', loading: 'lazy' }) : $el('span', {}, '★')),
      $el('div', { class: 'rv-item-main' },
        $el('div', { class: 'rv-item-head' },
          $el('h3', {}, r.title),
          $el('span', { class: `rv-badge ${published ? 'pub' : 'draft'}` }, published ? (r.pending ? 'Published · edits not live' : 'Published') : 'Draft')),
        $el('p', { class: 'rv-sub' }, [r.category, r.creator, r.year].filter(Boolean).join(' · ')),
        (() => { const s = $el('span'); s.innerHTML = r.rating ? starsHtml(r.rating) : '<em class="rv-sub">No rating yet</em>'; return s; })(),
        $el('p', { class: 'rv-sub' }, `Updated ${fmtDate(r.updatedAt)}${published ? ` · live since ${fmtDate(r.publishedAt)}` : ''}`),
        $el('div', { class: 'rv-actions' },
          act('Edit', () => showEditor(r)),
          act('Preview', () => preview(r)),
          published ? act(r.pending ? 'Publish changes' : 'Republish', () => doPublish(r), r.pending ? 'primary' : '') : act('Publish', () => doPublish(r), 'primary'),
          published ? act('Unpublish', () => doUnpublish(r)) : null,
          published ? act('Copy public link', () => copyLink(r)) : null,
          published ? act('Download Instagram Story card', () => storyCard(r)) : null,
          published ? $el('a', { class: 'btn small', href: publicPath(r), target: '_blank', rel: 'noopener' }, 'Open ↗') : null)));
  }

  async function doPublish(r) {
    try { const { review } = await api('/publish', { method: 'POST', json: { id: r.id } }); Object.assign(r, review); toast(`Published "${r.title}". Commit and deploy to put it on the live site.`); showList(); }
    catch (e) { toast(e.message, 'err'); }
  }
  async function doUnpublish(r) {
    if (!confirm(`Unpublish "${r.title}"? It will disappear from the public site but stay here as a draft.`)) return;
    try { const { review } = await api('/unpublish', { method: 'POST', json: { id: r.id } }); Object.assign(r, review); toast(`"${r.title}" is now a private draft.`); showList(); }
    catch (e) { toast(e.message, 'err'); }
  }
  async function copyLink(r) {
    const link = publicLink(r);
    if (!link) { toast('Set your public site address first (field at the top of this tab).', 'warn'); host.querySelector('#rv-site')?.focus(); return; }
    try { await navigator.clipboard.writeText(link); toast('Public link copied.'); }
    catch { window.prompt('Copy this link:', link); }
  }

  // ---------- preview (same markup as the public page, sandboxed) ----------
  function preview(r) {
    const doc = renderReviewPage({ ...r, publishedAt: r.publishedAt || new Date().toISOString() }, { coverSrc: r.cover ? location.origin + coverUrl(r) : '', preview: true, assets: `${location.origin}/reviews/` });
    const dlg = $el('dialog', { class: 'rv-dialog' },
      $el('div', { class: 'rv-dialog-bar' }, $el('b', {}, 'Preview · exactly what visitors will see'), $el('button', { class: 'btn small', type: 'button', onclick: () => dlg.close() }, 'Close')),
      $el('iframe', { class: 'rv-frame', title: 'Review preview', sandbox: 'allow-same-origin', srcdoc: doc }));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  // ---------- Instagram Story card (1080x1920 PNG, drawn locally) ----------
  async function storyCard(r) {
    if (!r.live && r.status !== 'published') return;
    const link = publicLink(r);
    try {
      toast('Drawing Story card…', 'warn');
      // Shared with the public Share-as-Story button. Loaded through a plain import() that Vite does not rewrite (it rejects public files).
      const { drawStoryCard } = await new Function('u', 'return import(u)')(`${location.origin}/reviews/story-card.js`);
      const foot = (link ? link.replace(/^https?:\/\//, '') : `nathan.exe${publicPath(r)}`).replace(/\/$/, '');
      const blob = await drawStoryCard(r, { coverSrc: r.cover ? coverUrl(r) : '', footText: foot });
      const a = $el('a', { href: URL.createObjectURL(blob), download: `story-${r.slug}.png` });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      let copied = false;
      if (link) { try { await navigator.clipboard.writeText(link); copied = true; } catch { /* clipboard blocked */ } }
      toast(copied ? 'Story card downloaded and the review link is copied. In Instagram, add a Link sticker over the dashed pill and paste it.' : 'Story card downloaded. Use "Copy public link", then add it as a Link sticker in Instagram.');
    } catch (e) { toast(`Story card failed: ${e.message}`, 'err'); }
  }

  // ---------- editor ----------
  function showEditor(existing) {
    const f = { id: existing?.id || '', title: existing?.title || '', category: existing?.category || 'Movie', creator: existing?.creator || '', year: existing?.year || '', rating: existing?.rating || 0, body: existing?.body || '', oneliner: existing?.oneliner || '', cover: existing?.cover || '' };
    let current = existing, dirty = false, busy = false;
    const touch = () => { dirty = true; };
    const input = (id, key, label, attrs = {}) => {
      const i = $el('input', { id, type: 'text', value: f[key], autocomplete: 'off', ...attrs });
      i.addEventListener('input', () => { f[key] = i.value; touch(); });
      return $el('div', { class: 'field' }, $el('label', { for: id }, label), i);
    };

    const cat = $el('select', { id: 'rv-cat' }, ...CATEGORIES.map((c) => $el('option', { value: c, selected: c === f.category }, c)));
    cat.addEventListener('change', () => { f.category = cat.value; touch(); searchHint(); });

    // search
    const q = $el('input', { id: 'rv-q', type: 'search', placeholder: 'Search by name…', autocomplete: 'off' });
    const results = $el('ul', { class: 'rv-results', 'aria-live': 'polite' });
    const hint = $el('small', {});
    const searchHint = () => { hint.textContent = ['Other'].includes(f.category) ? 'No search for this category. Fill in the fields below by hand.' : f.category === 'Game' ? 'Game results come from Steam. Console and mobile games: enter them manually.' : ''; };
    searchHint();
    const doSearch = async () => {
      const term = q.value.trim(); if (term.length < 2) return;
      results.replaceChildren($el('li', { class: 'rv-sub' }, 'Searching…'));
      try {
        const { results: list } = await api(`/search?cat=${encodeURIComponent(f.category)}&q=${encodeURIComponent(term)}`);
        results.replaceChildren(...(list.length ? list.map((x) => $el('li', {}, $el('button', { type: 'button', class: 'rv-result', onclick: () => pick(x) },
          x.cover ? $el('img', { src: x.cover, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : $el('span', { class: 'ph' }, '★'),
          $el('span', {}, $el('b', {}, x.title), $el('small', {}, [x.creator, x.year].filter(Boolean).join(' · ')))))) : [$el('li', { class: 'rv-sub' }, 'No matches. Try another spelling or enter it manually below.')]));
      } catch (e) { results.replaceChildren($el('li', { class: 'rv-sub err' }, e.message)); }
    };
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(typing); doSearch(); } });
    let typing; // search as you type, after a short pause
    q.addEventListener('input', () => { clearTimeout(typing); if (q.value.trim().length >= 2 && f.category !== 'Other') typing = setTimeout(doSearch, 450); else if (!q.value.trim()) results.replaceChildren(); });

    const fields = {
      title: input('rv-title', 'title', 'Title', { maxlength: 140, required: true }),
      creator: input('rv-creator', 'creator', 'Creator (director, artist, author…)', { maxlength: 120 }),
      year: input('rv-year', 'year', 'Year', { maxlength: 12, inputmode: 'numeric' }),
    };
    const sync = () => { for (const [k, w] of Object.entries(fields)) w.querySelector('input').value = f[k]; drawLive(); };
    for (const w of Object.values(fields)) w.querySelector('input').addEventListener('input', () => drawLive());
    async function pick(x) {
      f.title = x.title; f.creator = x.creator || ''; f.year = x.year || ''; touch(); sync();
      results.replaceChildren(); q.value = '';
      manual.open = false; // details are filled in; leave just the stars and thoughts
      if (x.cover) {
        try { toast('Fetching cover art…', 'warn'); f.cover = (await api('/cover-url', { method: 'POST', json: { url: x.cover } })).cover; drawCover(); toast('Cover added.'); }
        catch (e) { toast(`Could not fetch the cover: ${e.message}. Upload one instead.`, 'warn'); manual.open = true; }
      }
    }

    // live card: what the review looks like as a tile on the public pages, updated as you type
    const live = $el('div', { class: 'rv-live', 'aria-label': 'Card preview' });
    function drawLive() {
      const meta = [f.category, f.creator, f.year].filter(Boolean).join(' · ');
      const stars = $el('span', { class: 'stars' }); stars.innerHTML = starsHtml(f.rating);
      live.replaceChildren(
        $el('div', { class: 'rv-live-pic' }, f.cover ? $el('img', { src: coverUrl(f), alt: '' }) : $el('span', {}, '★')),
        $el('div', { class: 'rv-live-txt' },
          $el('small', {}, meta || 'Category'), $el('b', {}, f.title || 'Pick a title above'), stars,
          $el('p', {}, excerptOf(f.body, 160) || 'Your thoughts show up here as you write.')));
    }

    // cover
    const coverBox = $el('div', { class: 'rv-coverbox' });
    let drawCover = () => {
      coverBox.replaceChildren(f.cover ? $el('img', { src: coverUrl(f), alt: 'Cover art preview' }) : $el('span', { class: 'ph' }, 'No cover yet'));
    };
    const drawCover0 = drawCover;
    drawCover = () => { drawCover0(); drawLive(); };
    drawCover();
    const file =$el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
    file.addEventListener('change', async () => {
      const x = file.files[0]; file.value = ''; if (!x) return;
      if (x.size > 8_000_000) return toast('Image too large (max 8 MB).', 'err');
      try { toast('Uploading cover…', 'warn'); f.cover = (await api('/cover', { method: 'POST', raw: x })).cover; touch(); drawCover(); toast('Cover added.'); }
      catch (e) { toast(e.message, 'err'); }
    });

    // stars
    const starGroup = $el('div', { class: 'rv-starpick', role: 'radiogroup', 'aria-label': 'Star rating' });
    const drawStars = () => starGroup.replaceChildren(...[1, 2, 3, 4, 5].map((n) => $el('button', {
      type: 'button', role: 'radio', 'aria-checked': String(f.rating === n), 'aria-label': `${n} star${n > 1 ? 's' : ''}`, tabindex: (f.rating === n || (!f.rating && n === 1)) ? '0' : '-1',
      class: n <= f.rating ? 'on' : '', onclick: () => { f.rating = n; touch(); drawStars(); drawLive(); starGroup.children[n - 1].focus(); },
      onkeydown: (e) => { const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]; if (d) { e.preventDefault(); f.rating = Math.min(5, Math.max(1, (f.rating || 0) + d)); touch(); drawStars(); drawLive(); starGroup.children[f.rating - 1].focus(); } },
    }, '★')));
    drawStars();

    const body = $el('textarea', { id: 'rv-body', rows: 10, maxlength: 20000, placeholder: 'What did you think? Blank line = new paragraph.' });
    const one = $el('input', { id: 'rv-one', type: 'text', maxlength: 100, autocomplete: 'off', placeholder: 'e.g. A total fun rider.', value: f.oneliner });
    const oneCount = $el('small', {}, `${f.oneliner.length}/100 · shown only on the Instagram Story card`);
    one.addEventListener('input', () => { f.oneliner = one.value; oneCount.textContent = `${f.oneliner.length}/100 · shown only on the Instagram Story card`; touch(); });
    body.value = f.body;
    const count = $el('small', {}, `${f.body.length} characters`);
    body.addEventListener('input', () => { f.body = body.value; count.textContent = `${f.body.length} characters`; touch(); drawLive(); });

    const manual = $el('details', { class: 'rv-manual' }, $el('summary', {}, 'Title, creator, year and cover art'),
      $el('div', { class: 'rv-row3' }, fields.title, fields.creator, fields.year),
      $el('div', { class: 'field' }, $el('label', {}, 'Cover art'), $el('div', { class: 'rv-coverrow' }, coverBox,
        $el('div', { class: 'rv-coverbtns' }, $el('button', { class: 'btn small', type: 'button', onclick: () => file.click() }, 'Upload image'), file,
          $el('button', { class: 'btn small', type: 'button', onclick: () => { f.cover = ''; touch(); drawCover(); } }, 'Remove'),
          $el('small', {}, 'Picking a search result fills this in. PNG, JPG, WebP or GIF up to 8 MB.')))));
    manual.open = !(existing && existing.title) || f.category === 'Other';
    drawLive();

    const payload = () => ({ ...f });
    async function save(quiet) {
      if (!f.title.trim()) { toast('Give the review a title first.', 'err'); fields.title.querySelector('input').focus(); return null; }
      const { review } = await api('/save', { method: 'POST', json: payload() });
      f.id = review.id; current = review; dirty = false;
      const i = state.reviews.findIndex((x) => x.id === review.id); if (i >= 0) state.reviews[i] = review; else state.reviews.push(review);
      if (!quiet) toast(review.status === 'published' ? 'Saved. Click "Publish changes" to update the live page.' : 'Draft saved.');
      return review;
    }
    const guard = (fn) => async () => { if (busy) return; busy = true; actions.classList.add('busy'); try { await fn(); } catch (e) { toast(e.message, 'err'); } busy = false; actions.classList.remove('busy'); };
    const isPub = () => current?.status === 'published';

    const actions = $el('div', { class: 'rv-editor-actions' },
      $el('button', { class: 'btn', type: 'button', onclick: guard(async () => { if (await save()) refreshActions(); }) }, isPub() ? 'Save changes' : 'Save draft'),
      $el('button', { class: 'btn', type: 'button', onclick: () => preview({ ...payload(), slug: current?.slug || '', publishedAt: current?.publishedAt || '' }) }, 'Preview'),
      $el('button', { class: 'btn primary', type: 'button', onclick: guard(async () => {
        const saved = await save(true); if (!saved) return;
        const { review } = await api('/publish', { method: 'POST', json: { id: saved.id } });
        const i = state.reviews.findIndex((x) => x.id === review.id); state.reviews[i] = review; current = review; dirty = false;
        toast(`Published. Public page: ${publicPath(review)}${siteBase() ? '' : ' (set your site address to copy the full link)'}. Commit and deploy to put it live.`);
        showList();
      }) }, 'Publish'),
      $el('button', { class: 'btn', type: 'button', id: 'rv-unpub', onclick: guard(async () => {
        if (!confirm('Unpublish this review? It will disappear from the public site and stay here as a draft.')) return;
        const { review } = await api('/unpublish', { method: 'POST', json: { id: current.id } });
        const i = state.reviews.findIndex((x) => x.id === review.id); state.reviews[i] = review; current = review; toast('Unpublished. Now a private draft.'); refreshActions();
      }) }, 'Unpublish'),
      $el('button', { class: 'btn', type: 'button', onclick: () => { if (dirty && !confirm('Discard unsaved changes to this review?')) return; showList(); } }, '← Back to list'),
      $el('button', { class: 'btn danger', type: 'button', id: 'rv-del', onclick: guard(async () => {
        if (!confirm(`Delete "${current.title}" permanently? This cannot be undone.`)) return;
        await api('/delete', { method: 'POST', json: { id: current.id } }); state.reviews = state.reviews.filter((x) => x.id !== current.id); toast('Review deleted.'); showList();
      }) }, 'Delete'));
    const refreshActions = () => {
      actions.querySelector('#rv-unpub').hidden = !isPub();
      actions.querySelector('#rv-del').hidden = !current;
      actions.children[0].textContent = isPub() ? 'Save changes' : 'Save draft';
      actions.children[2].textContent = isPub() ? 'Publish changes' : 'Publish';
    };
    refreshActions();

    host.replaceChildren(
      $el('h2', { class: 'rv-h' }, existing ? `Edit review${isPub() ? ' · published' : ' · draft'}` : 'New review'),
      $el('div', { class: 'card rv-form' },
        $el('div', { class: 'field' }, $el('label', { for: 'rv-cat' }, 'Category'), cat),
        $el('div', { class: 'field' }, $el('label', { for: 'rv-q' }, 'Find it'), $el('div', { class: 'file-row' }, q, $el('button', { class: 'btn', type: 'button', onclick: doSearch }, 'Search')), hint, results),
        manual,
        $el('div', { class: 'rv-writeRow' },
          $el('div', { class: 'rv-write' },
            $el('div', { class: 'field' }, $el('label', {}, 'Rating'), starGroup),
            $el('div', { class: 'field' }, $el('label', { for: 'rv-body' }, 'Description'), body, count),
            $el('div', { class: 'field' }, $el('label', { for: 'rv-one' }, 'One-liner (Story card)'), one, oneCount)),
          $el('div', { class: 'rv-livewrap' }, $el('label', {}, 'Card preview'), live))),
      actions);
    fields.title.querySelector('input').focus();
  }

  showList();
}
