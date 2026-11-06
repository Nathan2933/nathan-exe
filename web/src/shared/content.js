// Shared content loading + helpers used by the game, portfolio and admin pages.

// Story order. `optional` districts don't count towards completing the save file.
export const DISTRICTS = [
  { id: 'lake-park', name: 'Montfort' },              // id kept from Lake Park so saves stay valid
  { id: 'iron-yard', name: 'Iron Yard' },
  { id: 'winter-campus', name: 'Tomsk State University' },
  { id: 'monsoon-campus', name: 'Thiagarajar College of Engineering' },
  { id: 'garage', name: 'The Garage' },
  { id: 'signal-tower', name: 'Guild Hall' },         // id kept from Signal Tower
  { id: 'lighthouse', name: 'Airport' },              // id kept from Lighthouse
];
export const MAIN_DISTRICTS = DISTRICTS.filter((d) => !d.optional);

export async function loadContent() {
  const base = import.meta.env.BASE_URL || '/';
  const res = await fetch(`${base}data/content.json?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load content (${res.status})`);
  return res.json();
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Only allow http(s), mailto, tel and relative URLs into href/src. */
export function safeUrl(url) {
  const u = String(url ?? '').trim();
  if (!u) return '';
  if (/^(https?:|mailto:|tel:|\/|\.\/|#)/i.test(u)) return u;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) return u; // relative path like resume.pdf
  return '';
}

export const chapterFor = (content, districtId) =>
  (content.chapters || []).find((c) => c.district === districtId);

export function linkByLabel(content, label) {
  return (content.links || []).find((l) => l.label.toLowerCase() === label.toLowerCase());
}

/** Full project sheet for the Garage exhibits: links, architecture, stack, contribution. */
export function projectDetails(p) {
  const links = [
    p.github && `<a class="pd-link" href="${esc(safeUrl(p.github))}" target="_blank" rel="noopener">GitHub ↗</a>`,
    p.demo && `<a class="pd-link" href="${esc(safeUrl(p.demo))}" target="_blank" rel="noopener">Live demo ↗</a>`,
  ].filter(Boolean).join('');
  const arch = (p.architecture || []).filter(Boolean);
  return `
    <article class="project-details${p.featured ? ' is-featured' : ''}">
      ${p.image ? `<img class="pd-shot" src="${esc(safeUrl(p.image))}" alt="" loading="lazy">` : ''}
      <header class="pd-head">
        <h3>${esc(p.title)}</h3>
        ${p.year ? `<span class="project-year">${esc(p.year)}</span>` : ''}
      </header>
      ${p.pitch ? `<p class="pd-pitch">${esc(p.pitch)}</p>` : ''}
      ${p.description ? `<p class="pd-desc">${esc(p.description)}</p>` : ''}
      ${p.contribution ? `<section class="pd-sec"><h4>My contribution</h4><p>${esc(p.contribution)}</p></section>` : ''}
      ${arch.length ? `<section class="pd-sec"><h4>Architecture</h4><ol class="pd-arch">${arch.map((a) => `<li>${esc(a)}</li>`).join('')}</ol></section>` : ''}
      ${p.stack?.length ? `<section class="pd-sec"><h4>Tech stack</h4><ul class="chips">${p.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section>` : ''}
      ${links ? `<div class="pd-links">${links}</div>` : ''}
    </article>`;
}

export function projectCard(p) {
  const links = [
    p.github && `<a href="${esc(safeUrl(p.github))}" target="_blank" rel="noopener">Code ↗</a>`,
    p.demo && `<a href="${esc(safeUrl(p.demo))}" target="_blank" rel="noopener">Live ↗</a>`,
  ].filter(Boolean).join('');
  return `
    <article class="project-card${p.featured ? ' is-featured' : ''}">
      ${p.image ? `<img src="${esc(safeUrl(p.image))}" alt="" loading="lazy">` : ''}
      <div class="project-head">
        <h3>${esc(p.title)}</h3>
        ${p.year ? `<span class="project-year">${esc(p.year)}</span>` : ''}
      </div>
      <p class="project-pitch">${esc(p.pitch)}</p>
      ${p.description ? `<p class="project-desc">${esc(p.description)}</p>` : ''}
      ${p.stack?.length ? `<ul class="chips">${p.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${links ? `<div class="project-links">${links}</div>` : ''}
    </article>`;
}
