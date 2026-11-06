// Shared content loading + helpers used by the game, portfolio and admin pages.

// Story order. `optional` districts don't count towards completing the save file.
export const DISTRICTS = [
  { id: 'iron-yard', name: 'Iron Yard' },
  { id: 'winter-campus', name: 'Winter Campus' },
  { id: 'monsoon-campus', name: 'Monsoon Campus' },
  { id: 'garage', name: 'The Garage' },
  { id: 'signal-tower', name: 'Signal Tower' },
  { id: 'lighthouse', name: 'Lighthouse' },
  { id: 'lake-park', name: 'Lake Park', optional: true },
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
