// Shared information-card system: one structure (header, body grid, footer), one pixel icon
// family and one set of builders for every card in the game. Pure HTML builders plus the small
// bits of modal behaviour (focus trap, input lock, image viewer) that every card shares.
import { esc, safeUrl } from '../shared/content.js';

// ---------- pixel icons (12x12, drawn with currentColor) ----------
const BITS = {
  school: ['.....##.....', '...######...', '.##########.', '############', '.##########.', '...##..##...', '...######...', '...######...'],
  pin: ['...######...', '..########..', '.####..####.', '.####..####.', '.##########.', '..########..', '...######...', '....####....', '.....##.....', '.....##.....'],
  folder: ['####........', '#####.......', '############', '############', '############', '############', '############', '############', '############'],
  mallet: ['.#######....', '.#######....', '.#######....', '...###......', '...###......', '...###......', '...###......', '...###......'],
  arch: ['####....####', '####....####', '####....####', '..##....##..', '..########..', '.....##.....', '....####....', '....####....', '....####....'],
  server: ['############', '#..........#', '#.##.......#', '############', '############', '#..........#', '#.##.......#', '############'],
  window: ['############', '#.#.#.....##', '############', '#..........#', '#.########.#', '#.#......#.#', '#.########.#', '############'],
  grid: ['############', '#..#..#..#.#', '############', '#..#..#..#.#', '############', '#..#..#..#.#', '############'],
  cube: ['....####....', '..########..', '############', '#..##..##..#', '#..##..##..#', '#..##..##..#', '.##########.', '...######...'],
  gem: ['.....##.....', '....####....', '...######...', '..########..', '...######...', '....####....', '.....##.....', '....####....'],
  chip: ['..#.#.#.#...', '.##########.', '###......###', '.##.####.##.', '###.####.###', '.##.####.##.', '###......###', '.##########.', '..#.#.#.#...'],
  trophy: ['.##########.', '###.####.###', '#.#.####.#.#', '#.#.####.#.#', '.##.####.##.', '..########..', '...######...', '....####....', '.....##.....', '...######...', '...######...'],
  medal: ['..##....##..', '...##..##...', '....####....', '...######...', '..########..', '..###..###..', '..###..###..', '..########..', '...######...'],
  ext: ['....######..', '....######..', '.........##.', '........###.', '..#....#.##.', '...#..#..##.', '....##......', '...#........'],
  code: ['...#....#...', '..#......#..', '.#........#.', '#..........#', '.#........#.', '..#......#..', '...#....#...'],
  mail: ['############', '##........##', '#.#......#.#', '#..#....#..#', '#...#..#...#', '#....##....#', '#..........#', '############'],
  doc: ['..######....', '..#....##...', '..#....####.', '..#.......#.', '..#.####..#.', '..#.......#.', '..#.####..#.', '..#.......#.', '..#########.'],
  user: ['....####....', '...######...', '...######...', '....####....', '..########..', '.##########.', '.##########.'],
  film: ['############', '#.#......#.#', '############', '#.#......#.#', '#.#......#.#', '#.#......#.#', '############', '#.#......#.#', '############'],
  dumbbell: ['.#........#.', '###.####.###', '###.####.###', '.#........#.'],
  globe: ['...######...', '..#..##..#..', '.#...##...#.', '############', '.#...##...#.', '..#..##..#..', '...######...'],
  flag: ['.##.........', '.########...', '.##########.', '.##########.', '.########...', '.##.........', '.##.........', '.##.........'],
  book: ['##########..', '#.##....##..', '#.##.##.##..', '#.##....##..', '#.##.##.##..', '#.##....##..', '##########..'],
  briefcase: ['...######...', '...#....#...', '############', '############', '#....##....#', '############', '############'],
  star: ['.....##.....', '.....##.....', '....####....', '############', '.##########.', '..########..', '..###..###..', '.##......##.'],
  bolt: ['......##....', '.....##.....', '....##......', '..######....', '....##......', '...##.......', '..##........'],
  arrow: ['.....##.....', '......##....', '###########.', '###########.', '......##....', '.....##.....'],
  back: ['.....##.....', '....##......', '.###########', '.###########', '....##......', '.....##.....'],
  wheat: ['.....#......', '...#.#.#....', '...###.#....', '.....#.###..', '..#..#.###..', '..###.#.#...', '....##.#....', '.....##.....', '.....#......', '.....#......'],
  shield: ['.##########.', '.##########.', '.##########.', '.##########.', '..########..', '..########..', '...######...', '....####....', '.....##.....'],
  calendar: ['..#......#..', '############', '############', '#..........#', '#.##.##.##.#', '#..........#', '#.##.##.##.#', '############'],
  building: ['...######...', '...######...', '.##########.', '.#.#.##.#.#.', '.##########.', '.#.#.##.#.#.', '.##########.', '.#.#.##.#.#.', '.####..####.'],
  gamepad: ['..########..', '.##########.', '##.######.##', '#.#.####.#.#', '##.######.##', '.##########.', '..##....##..'],
  cross: ['....####....', '....####....', '....####....', '############', '############', '....####....', '....####....', '....####....'],
  quest: ['.########...', '.#......#...', '.#.####.#...', '.#......#...', '.#.####.#...', '.#......#...', '.########...'],
  lock: ['...######...', '..##....##..', '..#......#..', '############', '############', '#####..#####', '#####..#####', '############'],
  close: ['##........##', '###......###', '.###....###.', '..###..###..', '...######...', '...######...', '..###..###..', '.###....###.', '###......###', '##........##'],
};
const ICON_CACHE = new Map();
function iconPath(name) {
  if (ICON_CACHE.has(name)) return ICON_CACHE.get(name);
  const rows = BITS[name] || BITS.star;
  let d = '';
  rows.forEach((row, y) => {
    for (const m of row.padEnd(12, '.').slice(0, 12).matchAll(/#+/g)) d += `M${m.index} ${y}h${m[0].length}v1h-${m[0].length}z`;
  });
  ICON_CACHE.set(name, d);
  return d;
}
/** Pixel icon. `size` in px; colour comes from the surrounding text colour. */
export const ico = (name, size = 16, cls = '') =>
  `<svg class="px ${cls}" width="${size}" height="${Math.round(size * (BITS[name]?.length || 12) / 12)}" viewBox="0 0 12 ${BITS[name]?.length || 12}" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><path fill="currentColor" d="${iconPath(name)}"/></svg>`;

/** Escape, then turn **word** into a highlighted keyword. */
export const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const plain = (s) => String(s ?? '').replace(/\*\*/g, '');

// ---------- structure ----------
export const tile = (inner) => `<span class="cd-tile">${inner}</span>`;
export function head({ tile: t = '', eyebrow = '', title = '', sub = '', meta = '' }) {
  return `<header class="cd-head">${t}<div class="cd-titles">${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}<h2 id="panel-title">${esc(title)}</h2>${sub ? `<p class="subtitle">${sub}</p>` : ''}</div>${meta ? `<div class="cd-meta">${meta}</div>` : ''}</header>`;
}
export const sec = (icon, label, inner, cls = '') =>
  `<section class="cd-sec ${cls}"><h3 class="cd-h">${icon ? ico(icon, 14) : ''}<span>${esc(label)}</span></h3>${inner}</section>`;
export const col = (inner, cls = '') => `<div class="cd-col ${cls}">${inner}</div>`;
export function frame({ kind = 'info', narrow = false, head: h, body, foot = '' }) {
  return `<div class="cd cd-${kind}${narrow ? ' cd-narrow' : ''}">${h}<div class="cd-body">${body}</div>${foot ? `<footer class="cd-foot">${foot}</footer>` : ''}</div>`;
}
/** Role labels per project technology. Only roles stated in the project's own write-up or visible in its code; anything else is left out. */
const STACK_ROLES = {
  aratro: { Python: 'Workflows', Solidity: 'Smart contracts', Ethereum: 'Blockchain', Ganache: 'Local chain' },
  'microservices-security': { Kubernetes: 'Monitoring pipeline', Falco: 'Runtime detection', Grafana: 'Dashboards' },
  'tce-event-scheduler': { Flask: 'Web framework', SQL: 'Database', HTML: 'Frontend', CSS: 'Frontend' },
  cauverysite: { 'Next.js': 'App framework', 'Tailwind CSS': 'Styling' },
  'nathan-exe': { 'Three.js': '3D rendering', JavaScript: 'Game logic', Tiled: 'Town map', glTF: 'Models' },
  'hospital-management': { Tkinter: 'Desktop UI' },
};
// Technologies without a real logo get a pixel icon from the card icon family (never a letter placeholder)
const PIXEL_TECH = { Falco: 'shield', Ganache: 'server', Tkinter: 'window', Tiled: 'grid', glTF: 'cube', Ethereum: 'gem' };
/** Reusable tech stack: one tile per technology, in the project's own order. Icon (iconFn) + full name + optional role. */
export function techStack(list, project = {}, iconFn = null) {
  if (!list?.length) return '';
  const roles = STACK_ROLES[project.id] || {};
  return `<ul class="cd-tech">${list.map((n) => {
    const r = roles[n];
    const ic = PIXEL_TECH[n] ? ico(PIXEL_TECH[n], 22, 'tech-px') : iconFn ? iconFn(n) : ico('chip', 22, 'tech-px');
    return `<li><span class="cd-tech-ic">${ic}</span><span class="cd-tech-tx"><b class="cd-tech-n">${esc(n)}</b>${r ? `<small class="cd-tech-r">${esc(r)}</small>` : ''}</span></li>`;
  }).join('')}</ul>`;
}
export const tags = (list) => `<ul class="cd-tags">${(list || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
export const points = (list) => `<ul class="cd-points">${(list || []).map((p) => `<li>${ico(p.icon || 'star', 14)}<span>${rich(p.text)}</span></li>`).join('')}</ul>`;
export const paras = (list) => (list || []).map((t) => `<p>${rich(t)}</p>`).join('');
/** Footer rows: [page row, added by fitCard] / one compact action row / optional extra row (project switcher).
 *  Returns '' when there is nothing to show: the title bar's X already closes every card. */
export const foot = (left = '', right = '', extra = '') =>
  (left || right ? `<div class="cd-acts"><div class="cd-foot-l">${left}</div><div class="cd-foot-r">${right}</div></div>` : '') + extra;

export function linkBtn(icon, label, href, { primary = false, ext = true, attrs = '' } = {}) {
  const u = safeUrl(href);
  if (!u) return '';
  return `<a class="btn${primary ? ' primary' : ''}" href="${esc(u)}"${ext ? ' target="_blank" rel="noopener"' : ''} ${attrs}>${icon ? ico(icon, 14) : ''}<span>${esc(label)}</span></a>`;
}
export const actBtn = (icon, label, attrs, primary = false) =>
  `<button type="button" class="btn${primary ? ' primary' : ''}" ${attrs}>${icon ? ico(icon, 14) : ''}<span>${esc(label)}</span></button>`;

// ---------- helpers ----------
export const splitTitle = (t) => {
  const m = String(t).match(/^(.*?):\s+(.+)$/);
  return m ? [m[1], m[2]] : [t, ''];
};
export function achParts(a) {
  const m = String(a.title).match(/^(.*?):\s*([^:]*)$/);
  const name = m ? m[1] : a.title, result = m ? m[2].trim() : '';
  const tier = /second runner/i.test(result) ? 'bronze' : /runner/i.test(result) ? 'silver' : 'gold';
  return { name, result: (result || 'Winner').replace(/^second/i, '2nd'), tier, icon: tier === 'gold' ? 'trophy' : 'medal' };
}
const achMeta = (a) => [a.org, a.year].filter(Boolean).join(' · ');
export const achCounts = (list) => {
  const n = { gold: 0, silver: 0, bronze: 0 };
  (list || []).forEach((a) => { n[achParts(a).tier] += 1; });
  return n;
};
const countStrip = (list) => {
  const n = achCounts(list);
  return `<div class="cd-counts" aria-label="${list.length} achievements">${[['gold', 'trophy', 'Winner'], ['silver', 'medal', 'Runner-up'], ['bronze', 'medal', 'Second runner-up']].map(([t, i, l]) => `<span class="tier-${t}">${ico(i, 16)}<b>${n[t]}</b> ${l}</span>`).join('')}</div>`;
};
const orgLogoImg = (e) => `<span class="cd-logo">${e.logo ? `<img src="${esc(safeUrl(e.logo))}" alt="" loading="lazy">` : esc((e.org || '?')[0])}</span>`;
const mediaList = (p) => [...new Set([p.image, ...(p.media || [])].filter(Boolean))];

// ---------- About ----------
export function aboutHtml(c, portrait) {
  const p = c.profile || {}, k = p.card || {};
  const [role, tagline] = k.role ? [k.role, k.tagline] : String(p.role || '').split('|').map((s) => s.trim());
  const hl = k.highlights || [];
  const h = head({
    tile: `<img class="cd-avatar" src="${portrait}" alt="">`, eyebrow: 'About · readme', title: p.name || 'Nathan',
    sub: `${esc(role || '')}${tagline ? ` <span class="sep">/</span> ${esc(tagline)}` : ''}`,
    meta: p.location ? `<span class="cd-loc">${ico('pin', 14)}${esc(p.location)}</span>` : '',
  });
  const left = col(`<p class="cd-lead">${rich(k.intro || p.summary || '')}</p>${k.note ? `<p class="cd-note">${rich(k.note)}</p>` : ''}`);
  const right = col(`<ul class="cd-facts">${hl.map((x) => `<li>${ico(x.icon, 16)}<div><h4>${esc(x.label)}</h4><p>${rich(x.text)}</p></div></li>`).join('')}</ul>`);
  const f = foot('', `${linkBtn('user', 'Full profile', './#about', { ext: false })}${linkBtn('doc', 'Resume', p.resumeUrl, { primary: true })}`);
  return frame({ kind: 'about', head: h, body: left + right, foot: f });
}

// ---------- Projects ----------
const SEC = { problem: ['bolt', 'Problem'], part: ['mallet', 'My Contribution'], result: ['trophy', 'Result'], what: ['star', 'What it is'], status: ['flag', 'Status'], learned: ['book', 'What it taught me'] };
export function projectHtml(c, p, { index = 0, total = 1, prev = null, next = null, iconFn = null } = {}) {
  const k = p.card || {};
  const [name, subTitle] = splitTitle(p.title);
  const media = mediaList(p);
  const h = head({
    tile: tile(ico(k.icon || 'folder', 28)), eyebrow: `Project ${index + 1} of ${total}${p.school ? ' · School' : ''}`, title: name, sub: esc(subTitle),
    meta: p.year ? `<span class="cd-year">${ico('calendar', 14)}${esc(p.year)}</span>` : '',
  });
  const kinds = (...ks) => (k.sections || []).filter((s) => ks.includes(s.k));
  const secOf = (s) => sec(...(SEC[s.k] || ['star', s.k]), `<p>${rich(s.text)}</p>`, s.k === 'result' || s.k === 'status' ? 'is-result' : '');
  const thumbs = media.slice(1, 4).map((u, i) => `<button type="button" class="cd-ph-t" data-enlarge="${esc(p.id)}" data-slide="${i + 1}" aria-label="Enlarge photo ${i + 2} of ${media.length}"><img src="${esc(safeUrl(u))}" alt="" loading="lazy"></button>`).join('');
  const shot = media.length ? `<figure class="cd-photo"><button type="button" class="cd-ph-main" data-enlarge="${esc(p.id)}" data-slide="0" aria-label="Enlarge photo of ${esc(name)}"><img src="${esc(safeUrl(media[0]))}" alt=""><span class="cd-ph-tag">${ico('ext', 12)}Enlarge${media.length > 1 ? ` · ${media.length} photos` : ''}</span></button>${thumbs ? `<div class="cd-ph-strip">${thumbs}${media.length > 4 ? `<span class="cd-ph-more">+${media.length - 4}</span>` : ''}</div>` : ''}</figure>` : '';
  const flow = k.flow ? sec('arch', 'Supply flow', `<div class="cd-flowbox"><ol class="cd-flow">${k.flow.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>${k.flowNote ? `<p class="cd-small">${esc(k.flowNote)}</p>` : ''}`) : '';
  const stack = p.stack?.length ? sec('chip', 'Tech stack', techStack(p.stack, p, iconFn), 'cd-stack') : '';
  const links = `${linkBtn('code', 'GitHub', p.github)}${linkBtn('ext', 'Live demo', p.demo)}`;
  const sw = (to, dir) => (to ? `<button type="button" class="btn cd-sw ${dir}" data-proj="${esc(to.id)}" aria-label="${dir === 'prev' ? 'Previous' : 'Next'} project: ${esc(to.name)}">${dir === 'prev' ? ico('back', 14) : ''}<span class="cd-sw-t"><small>${dir === 'prev' ? 'Previous project:' : 'Next project:'}</small><b>${esc(to.name)}</b></span>${dir === 'next' ? ico('arrow', 14) : ''}</button>` : '');
  const nav = total > 1 ? `<nav class="cd-switch" aria-label="Switch project">${sw(prev, 'prev')}${sw(next, 'next')}</nav>` : '';
  // Three pages at most: 1 picture + tech stack + the problem in a line, 2 my part, 3 outcome.
  const lead = kinds('problem', 'what')[0];
  const p1 = `${shot}${col(`${sec('bolt', lead ? SEC[lead.k][1] : 'Overview', `<p>${rich(lead ? lead.text : (k.summary || p.pitch || ''))}</p>`)}${stack}`)}`;
  const p2 = col(`${sec('star', 'Overview', `<p>${rich(k.summary || p.pitch || '')}</p>`)}${kinds('part').map(secOf).join('')}${flow}`);
  const outcome = kinds('result', 'status', 'learned').map(secOf).join('');
  const p3 = col(`${outcome || sec('trophy', 'In short', `<p>${rich(k.summary || p.pitch || '')}</p>`)}${links ? sec('ext', 'Take a look', `<div class="cd-linkrow">${links}</div>`) : ''}${nav}`);
  const pages = [['Overview', p1], ['My part', p2], ['Outcome', p3]];
  const body = pages.map(([t, h], i) => `<div class="pj-page" data-pj-page="${i}" data-title="${t}"${i ? ' hidden' : ''}>${h}</div>`).join('');
  const pager = `<div class="cd-pager pj-pager"><button type="button" class="btn" data-pj="-1" aria-label="Previous page" disabled>${ico('back', 14)}<span>Prev</span></button><span class="cd-pg-n" aria-live="polite">Page 1 of 3 · Overview</span><button type="button" class="btn primary" data-pj="1" aria-label="Next page"><span>Next</span>${ico('arrow', 14)}</button></div>`;
  // Desktop keeps the original two-column card; phones get the three pages above.
  const old = `${col(sec('star', 'Overview', `<p>${rich(k.summary || p.pitch || '')}</p>`) + (k.sections || []).map(secOf).join('') + flow, 'pj-desk')}${col(`${shot}${stack}`, 'pj-desk')}`;
  return frame({ kind: 'project cd-pj', head: h, body: `${old}<div class="pj-mob">${body}</div>`, foot: `<div class="pj-desk-foot">${foot(links, '', nav)}</div><div class="pj-mob">${pager}</div>` });
}
export const projectSlides = (p) => mediaList(p).map((src) => ({ src, caption: splitTitle(p.title)[0] }));

// ---------- Chapters ----------
const roleRows = (list, tight = false) => `<ul class="cd-rows${tight ? ' tight' : ''}">${list.map((e) => `<li>${orgLogoImg(e)}<div><b class="cd-t">${esc(e.role)}</b><span class="cd-sub">${esc(e.org)}${e.period ? ` · ${esc(e.period)}` : ''}</span>${e.short ? `<p>${rich(e.short)}</p>` : ''}</div></li>`).join('')}</ul>`;
export const achRows = (list) => `<ul class="cd-ach">${list.map((a) => {
  const { name, result, tier, icon } = achParts(a);
  return `<li class="tier-${tier}">${ico(icon, 18)}<span class="n">${esc(name)}</span><span class="r">${esc(result)}</span><span class="m" title="${esc(achMeta(a))}">${esc(a.year || '')}</span></li>`;
}).join('')}</ul>`;

/** Skills in one view: every category, every skill, icon + label. iconFn(name) returns the logo html. */
export function skillsHtml(groups, iconFn, { dense = false } = {}) {
  const GI = ['code', 'globe', 'shield', 'bolt', 'folder'];
  return `<div class="cd-skills${dense ? ' dense' : ''}">${(groups || []).map((g, i) => `<section class="cd-sk-group"><h3 class="cd-h">${ico(GI[i % GI.length], 14)}<span>${esc(g.group)}</span><em>${(g.items || []).length}</em></h3><ul>${(g.items || []).map((s) => {
    const m = String(s).match(/^(.*?)\s*\((learning)\)$/i);
    return `<li${m ? ' class="is-learning"' : ''}><span class="cd-sk-logo">${iconFn(m ? m[1] : s)}</span><span class="cd-sk-n">${esc(m ? m[1] : s)}</span>${m ? '<i class="tbx-learn">Learning</i>' : ''}</li>`;
  }).join('')}</ul></section>`).join('')}</div>`;
}

// ---------- The Toolbox (Guild Hall): skills inventory + experience timeline ----------
const TB_GROUPS = [
  ['Languages', 'code', ['Python', 'Java', 'JavaScript', 'TypeScript', 'SQL', 'Solidity']],
  ['Web', 'globe', ['HTML', 'CSS', 'React', 'Next.js', 'Flask', 'Node.js', 'Tailwind CSS']],
  ['Data', 'server', ['MySQL', 'MongoDB', 'SQLite']],
  ['Cloud & Security', 'shield', ['Docker', 'Kubernetes', 'Falco', 'Grafana', 'Audit-event monitoring', 'Ethereum / Ganache']],
  ['AI', 'chip', ['AI-assisted prototyping', 'Prompt engineering']],
  ['Tools', 'mallet', ['Git', 'GitHub', 'Reflect', 'BugBug.io', 'Blender', 'Three.js']],
];
const tbBase = (s) => String(s).replace(/\s*\((learning)\)$/i, '').trim();
/** Regroup the content's skills into the Toolbox categories. Every item keeps its own spelling; strays land in Tools. */
export function toolboxGroups(skills) {
  const flat = (skills || []).flatMap((g) => g.items || []);
  const used = new Set();
  const out = TB_GROUPS.map(([name, icon, want]) => ({ name, icon, items: want.map((w) => flat.find((f) => tbBase(f).toLowerCase() === w.toLowerCase())).filter((f) => f && !used.has(f) && used.add(f)) }));
  const stray = flat.filter((f) => !used.has(f));
  if (stray.length) out[out.length - 1].items.push(...stray);
  return out.filter((g) => g.items.length);
}
export function toolboxHtml(c, iconFn) {
  const list = c.achievements || [], n = achCounts(list);
  const counts = `<div class="tbx-counts" aria-label="${list.length} achievements">${[['gold', 'trophy', 'Winner'], ['silver', 'medal', 'Runner-up'], ['bronze', 'medal', 'Second runner-up']].map(([t, i, l]) => `<span class="tier-${t}">${ico(i, 16)}<b>${n[t]}</b><em>${l}</em></span>`).join('')}</div>`;
  const rows = toolboxGroups(c.skills).map((g) => `<section class="tbx-row"><h3 class="tbx-cat">${ico(g.icon, 16)}<span>${esc(g.name)}</span></h3><ul class="tbx-chips">${g.items.map((s) => {
    const m = String(s).match(/^(.*?)\s*\((learning)\)$/i), name = m ? m[1] : s;
    return `<li class="tbx-chip${name.length > 15 ? ' wide' : ''}${m ? ' is-learning' : ''}"><span class="tbx-ic">${iconFn(name)}</span><span class="tbx-n">${esc(name)}</span>${m ? '<i class="tbx-learn">Learning</i>' : ''}</li>`;
  }).join('')}</ul></section>`).join('');
  const exp = (c.experience || []).map((e) => `<li class="tbx-card"><span class="tbx-logo">${e.logo ? `<img src="${esc(safeUrl(e.logo))}" alt="" loading="lazy">` : esc((e.org || '?')[0])}</span><div class="tbx-tx"><b class="tbx-role">${esc(e.role)}</b><div class="tbx-meta"><span class="tbx-org">${esc(e.org)}</span>${e.period ? `<span class="tbx-date">${ico('calendar', 12)}${esc(e.period)}</span>` : ''}</div><p>${rich(e.short || e.summary || '')}</p></div></li>`).join('');
  return `<div class="cd cd-tbx"><header class="tbx-head"><div class="tbx-titles"><p class="tbx-eyebrow">GUILD HALL / FIELD NOTES</p><h2 id="panel-title">THE TOOLBOX</h2><p class="tbx-sub">Skills collected. Experience earned.</p></div>${counts}</header><div class="tbx-body"><section class="tbx-skills" aria-label="Skills"><h3 class="tbx-h">Skill inventory</h3>${rows}</section><section class="tbx-exp" aria-label="Experience"><h3 class="tbx-h">Experience</h3><ol class="tbx-timeline">${exp}</ol></section></div><footer class="tbx-foot"><button type="button" class="tbx-trophy" data-open-panel="trophies">${ico('trophy', 14)}<span>OPEN TROPHY CASE</span></button><span class="tbx-esc"><kbd>Esc</kbd> · Close</span></footer></div>`;
}

export function chapterHtml(c, ch, o = {}) {
  if (o.district === 'signal-tower' && !o.travel) return toolboxHtml(c, o.iconFn);
  const k = ch.card || {}, d = o.district;
  const intro = k.intro?.length ? paras(k.intro) : paras((ch.body || []).slice(0, 1));
  const pts = k.points?.length ? points(k.points) : (ch.highlights || []).length ? points(ch.highlights.map((t) => ({ icon: 'star', text: t }))) : '';
  const mem = o.mems?.length ? `<p class="cd-mem">${ico('star', 14)}Memories here: <b>${o.found}/${o.mems.length}</b>${o.found < o.mems.length ? ' · look for the glowing ✦ nearby' : ' · all found'}</p>` : '';
  const h = head({ tile: tile(ico(k.icon || 'star', 28)), eyebrow: k.eyebrow || ch.period || '', title: ch.title, sub: esc(ch.subtitle || ''), meta: d === 'signal-tower' ? countStrip(c.achievements || []) : ch.period ? `<span class="cd-year">${ico('calendar', 14)}${esc(ch.period)}</span>` : '' });
  const mediaSlot = ch.media?.length ? '<div class="cd-media" data-media></div>' : '';
  let left = col(`${intro}${pts}${mem}`), right = '', narrow = false, span = '', footR = '', footL = '';
  const acts = (c.experience || []).filter((x) => /tce/i.test(x.org));
  if (d === 'lake-park') {
    const sp = (c.projects || []).filter((p) => p.school);
    right = col(sp.map((p) => {
      const pk = p.card || {};
      return sec('folder', 'My first UI project', `<div class="cd-mini"><b class="cd-t">${esc(splitTitle(p.title)[0])} <span class="cd-year">${esc(p.year || '')}</span></b><p>${rich(pk.summary || p.pitch)}</p>${techStack(p.stack, p, o.iconFn)}</div>`) ;
    }).join(''));
    footR = sp.map((p) => actBtn('arrow', 'Open project', `data-open-project="${esc(p.id)}"`)).join('');
  } else if (d === 'winter-campus') {
    narrow = true; right = '';
  } else if (d === 'monsoon-campus') {
    right = col(sec('briefcase', 'College roles', roleRows(acts)));
    span = `<div class="cd-span">${sec('trophy', `Achievements · ${(c.achievements || []).length}`, achRows(c.achievements || []))}</div>`;
  } else if (d === 'iron-yard') {
    right = col(`${mediaSlot}${sec('dumbbell', 'Gym sessions', `<ul class="cd-prog">${(o.gym || []).map((g) => `<li class="${g.done ? 'done' : ''}"><span>${g.done ? '✓' : '○'}</span>${esc(g.name)}</li>`).join('')}</ul><p class="cd-small">Only in-game sets are tracked here.</p>`)}`);
    footR = actBtn('dumbbell', 'Start workout', 'data-dz="start"', true);
  } else if (d === 'garage') {
    right = col(sec('folder', `Projects · ${(c.projects || []).length}`, `<div class="cd-tiles">${(c.projects || []).map((p) => {
      const pk = p.card || {};
      return `<button type="button" class="cd-proj" data-open-project="${esc(p.id)}">${ico(pk.icon || 'folder', 20)}<span><b class="cd-t">${esc(splitTitle(p.title)[0])}</b><small>${esc(pk.short || p.pitch || '')}</small></span><em>${esc(p.year || '')}</em></button>`;
    }).join('')}</div>`));
    footR = linkBtn('arrow', 'All projects', './#projects', { ext: false });
    left = col(`${intro}${mem}`);
  } else if (d === 'signal-tower') {
    left = col(`${intro}${sec('chip', 'Skills', skillsHtml(c.skills, o.iconFn, { dense: true }))}`);
    right = col(sec('briefcase', 'Experience', roleRows(c.experience || [], true)));
    footR = actBtn('trophy', 'Open trophy case', 'data-open-panel="trophies"');
  } else if (d === 'lighthouse') {
    const email = (c.links || []).find((l) => /^mailto:/.test(l.url));
    const others = (c.links || []).filter((l) => !/^mailto:/.test(l.url));
    const li = (l) => ({ GitHub: 'code', LinkedIn: 'user' }[l.label] || 'ext');
    right = col(sec('ext', 'Find me', `<ul class="cd-links">${email ? `<li>${ico('mail', 16)}<a href="${esc(safeUrl(email.url))}">${esc(email.url.replace('mailto:', ''))}</a></li>` : ''}${others.map((l) => `<li>${ico(li(l), 16)}<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label)}</a></li>`).join('')}<li>${ico('doc', 16)}<a href="${esc(safeUrl(c.profile?.resumeUrl))}" target="_blank" rel="noopener">Resume (PDF)</a></li></ul>`));
    footR = linkBtn('doc', 'Resume', c.profile?.resumeUrl) + (email ? linkBtn('mail', 'Send a message', `${email.url}?subject=${encodeURIComponent('Hello from NATHAN.EXE')}`, { primary: true, ext: false }) : '');
  }
  if (o.travel) { footL += actBtn('arrow', 'Travel to campus', `data-travel="${esc(o.travel)}"`, true) + actBtn('back', 'All chapters', 'data-edu-back'); footR = ''; }
  return frame({ kind: d === 'signal-tower' ? 'chapter cd-toolbox' : d === 'iron-yard' ? 'chapter cd-gym' : 'chapter', narrow: narrow && !o.travel ? true : narrow, head: h, body: left + right + span, foot: foot(footL, footR) });
}

// ---------- Memory ----------
export function memoryHtml(m, label) {
  const h = head({ tile: tile(ico('star', 28)), eyebrow: label, title: m.title, sub: esc(m.year || '') });
  const img = m.image ? `<img class="cd-memimg" src="${esc(safeUrl(m.image))}" alt="">` : '';
  return frame({ kind: 'memory', narrow: !m.image, head: h, body: col(`<p class="cd-lead">${esc(m.text)}</p>`) + (img ? col(img) : ''), foot: foot('', actBtn('book', 'Open memory album', 'id="mem-album"')) });
}

// ---------- Trophies ----------
export function trophiesHtml(list) {
  const h = head({ tile: tile(ico('trophy', 28)), eyebrow: 'Guild Hall · Trophy collection', title: 'Trophies', sub: esc(`${list.length} results. Tap one to open its plaque.`), meta: countStrip(list) });
  const rows = `<ul class="cd-ach pick" aria-label="Achievements">${list.map((a, i) => {
    const { name, result, tier, icon } = achParts(a);
    const img = (a.images || [])[0];
    const thumb = img ? `<button type="button" class="cd-thumb" data-enlarge-trophy="${i}" aria-label="View full photo: ${esc(name)}"><img src="${esc(safeUrl(img))}" alt=""><span class="cd-thumb-z">${ico('ext', 10)}View</span></button>` : '';
    const meta = achMeta(a);
    return `<li class="tier-${tier}"><button type="button" class="cd-ach-h" aria-expanded="${i === 0}" data-trophy="${i}">${ico(icon, 18)}<span class="n">${esc(name)}</span><span class="r">${esc(result)}</span></button><div class="cd-ach-det${img ? ' has-thumb' : ''}">${thumb}<div class="cd-ach-tx"><p class="cd-sub">${esc(meta)}</p>${a.detail ? `<p>${esc(a.detail)}</p>` : ''}</div></div></li>`;
  }).join('')}</ul>`;
  return frame({ kind: 'trophies', narrow: true, head: h, body: col(rows, 'cd-list'), foot: '' });
}

// ---------- Quest log / experience ----------
export function questsHtml(c) {
  const exp = c.experience || [];
  const main = exp.filter((e) => e.quest === 'main' || /hewlett|hpe|sez/i.test(e.org)), side = exp.filter((e) => !main.includes(e));
  const q = (e, kind) => `<li class="quest ${kind}">${orgLogoImg(e)}<div><span class="cd-badge">${ico(kind === 'main' ? 'star' : 'flag', 12)}${kind === 'main' ? 'Main quest' : 'Side quest'}</span><b class="cd-t">${esc(e.role)}</b><span class="cd-sub">${esc(e.org)}${e.period ? ` · <i>${esc(e.period)}</i>` : ''}</span><p>${rich(e.short || e.summary || '')}</p></div></li>`;
  const h = head({ tile: tile(ico('quest', 28)), eyebrow: 'Guild Hall · Quest log', title: 'Quest log', sub: esc(`${exp.length} quests: internships and campus roles`) });
  return frame({ kind: 'quests', head: h, body: col(`<ul class="cd-quests">${main.map((e) => q(e, 'main')).join('')}</ul>`) + col(`<ul class="cd-quests">${side.map((e) => q(e, 'side')).join('')}</ul>`),
    foot: foot('', linkBtn('doc', 'Full resume', c.profile?.resumeUrl, { primary: true })) });
}

// ---------- Skill tree ----------
export function skilltreeHtml(c, iconFn) {
  const groups = c.skills || [], total = groups.reduce((n, g) => n + (g.items || []).length, 0);
  const h = head({ tile: tile(ico('chip', 28)), eyebrow: 'Guild Hall · Skill tree', title: 'Skill tree', sub: esc('My tech stack and skills'), meta: `<span class="cd-year">${ico('code', 14)}<b>${total}</b> skills · <b>${groups.length}</b> domains</span>` });
  return frame({ kind: 'skilltree', head: h, body: `<div class="cd-span">${skillsHtml(groups, iconFn)}</div>`, foot: foot('', '') });
}

// ---------- Profile ----------
export function profileHtml(c, portrait, eduChapters) {
  const p = c.profile || {}, k = p.card || {};
  const h = head({ tile: `<img class="cd-avatar" src="${portrait}" alt="">`, eyebrow: 'Guild Hall · Character profile', title: p.name || 'Nathan', sub: esc(k.role || p.role || ''), meta: p.location ? `<span class="cd-loc">${ico('pin', 14)}${esc(p.location)}</span>` : '' });
  const edu = `<ol class="cd-rows">${eduChapters.map((ch) => `<li><span class="cd-logo">${ico('school', 16)}</span><div><b class="cd-t">${esc(ch.subtitle || ch.title)}</b>${ch.period ? `<span class="cd-sub">${esc(ch.period)}</span>` : ''}</div></li>`).join('')}</ol>`;
  const projs = `<ul class="cd-rows">${(c.projects || []).map((pr) => `<li><span class="cd-logo">${ico(pr.card?.icon || 'folder', 16)}</span><div><b class="cd-t">${esc(splitTitle(pr.title)[0])}${pr.year ? ` <span class="cd-year">${esc(pr.year)}</span>` : ''}</b><span class="cd-sub">${esc(pr.card?.short || '')}</span></div></li>`).join('')}</ul>`;
  const links = (c.links || []).filter((l) => !l.url.startsWith('mailto:')).map((l) => linkBtn(l.label === 'GitHub' ? 'code' : 'user', l.label, l.url)).join('');
  return frame({ kind: 'profile', head: h, body: col(`<p class="cd-lead">${rich(k.intro || p.summary || '')}</p>${sec('school', 'Education', edu)}`) + col(sec('folder', `Projects · ${(c.projects || []).length}`, projs)), foot: foot('', `${links}${linkBtn('doc', 'Resume', p.resumeUrl, { primary: true })}`) });
}

// ---------- Education journey list ----------
export function educationListHtml(list, stamps) {
  const h = head({ tile: tile(ico('school', 28)), eyebrow: 'Education', title: 'The education journey', sub: 'Three chapters, three campuses.', meta: `<span class="cd-year">${ico('flag', 14)}Passport <b>${stamps.length}/${list.length}</b></span>` });
  const rows = `<ol class="cd-edu">${list.map((e) => `<li><span class="cd-num">${esc(e.num)}</span><div class="cd-edu-t"><span class="cd-sub">${esc(e.label)} · ${esc(e.tagline)}</span><b class="cd-t">${esc(e.institution)}</b><span class="cd-sub">${esc(e.place || '')}${e.detail ? ` · ${esc(e.detail)}` : ''}</span></div><span class="cd-stamp${stamps.includes(e.id) ? ' on' : ''}">${stamps.includes(e.id) ? 'STAMPED' : 'NOT YET'}</span><div class="cd-edu-a">${actBtn('book', 'Read journey', `data-read="${esc(e.id)}"`, true)}${actBtn('arrow', 'Travel to campus', `data-travel="${esc(e.id)}"`)}</div></li>`).join('')}</ol>`;
  return frame({ kind: 'edu', head: h, body: `<div class="cd-span">${rows}<p class="cd-small">Optional. Stamps come from visiting each campus. Everything here is open either way.</p></div>`, foot: foot('', '') });
}

// ---------- generic wrapper for legacy/simple panels ----------
export const genericHtml = (inner) => `<div class="cd cd-generic"><div class="cd-body"><div class="cd-span cd-prose">${inner}</div></div></div>`;

export { plain };

// ---------- paging: a card never scrolls, long content turns into Prev / Page n of m / Next ----------
/**
 * Lays out the open card as pages when it is taller than the screen allows. Units (sections, paragraphs,
 * list rows) are measured with everything visible, packed greedily into pages, and the rest hidden with
 * .pg-off. The card is held at the height of its tallest page so the page row never moves.
 * Call after every render and on resize; it is idempotent.
 */
export function fitCard(panelBody, tight = false) {
  const root = panelBody.querySelector('.cd');
  if (!root || root.classList.contains('cd-tbx')) return;   // the Toolbox is one screen that scrolls on small displays, never paged
  const body = root.querySelector('.cd-body');
  root.querySelectorAll('.pg-off').forEach((e) => e.classList.remove('pg-off'));
  root.querySelector('.cd-pager:not(.pj-pager)')?.remove();
  root.querySelector('.cd-foot-auto')?.remove();
  root.classList.remove('is-paged', 'cd-flat');
  root.classList.toggle('cd-tight', tight);
  if (body) body.style.minHeight = '';
  if (root.classList.contains('cd-pj') && matchMedia('(max-width: 760px)').matches) return;   // phones: project cards use their own three pages
  if (!body || panelBody.scrollHeight <= panelBody.clientHeight + 1) return;   // already fits: no pages
  if (root.querySelector('.cd-skills:not(.dense)')) {   // skill tiles stack one domain per row when the grid is too tall
    root.classList.add('cd-flat');
    if (panelBody.scrollHeight <= panelBody.clientHeight + 1) return;
  }
  let footEl = root.querySelector('.cd-foot');
  if (!footEl) { footEl = document.createElement('footer'); footEl.className = 'cd-foot cd-foot-auto'; root.append(footEl); }
  const undo = () => { pager.remove(); root.querySelector('.cd-foot-auto')?.remove(); };
  const room = () => panelBody.clientHeight - (root.offsetHeight - body.offsetHeight)
    - parseFloat(getComputedStyle(body).paddingTop) - parseFloat(getComputedStyle(body).paddingBottom);
  const pager = document.createElement('div');
  pager.className = 'cd-pager';
  pager.innerHTML = `<button type="button" class="btn" data-pg="-1" aria-label="Previous page">${ico('back', 14)}<span>Prev</span></button><span class="cd-pg-n" aria-live="polite"></span><button type="button" class="btn primary" data-pg="1" aria-label="Next page"><span>Next</span>${ico('arrow', 14)}</button>`;
  footEl.prepend(pager);
  const budget = room() - 8;
  const gap = parseFloat(getComputedStyle(body).rowGap) || 8;
  const hOf = (e) => { const cs = getComputedStyle(e); return e.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom); };
  // accordion lists (trophies): one row is open at a time, so every page keeps room for the tallest opened row
  let reserve = 0;
  const dets = [...body.querySelectorAll('.cd-ach-det')];
  dets.forEach((d) => { const li = d.closest('li'); li.classList.add('open-measure'); reserve = Math.max(reserve, d.offsetHeight + 4); li.classList.remove('open-measure'); });
  const openLi = body.querySelector('[data-trophy][aria-expanded="true"]')?.closest('li');
  const openExtra = openLi ? openLi.querySelector('.cd-ach-det').offsetHeight : 0;
  // flatten: grid children, with columns opened up
  const units = [];
  [...body.children].forEach((c) => (c.classList.contains('cd-col') ? units.push(...c.children) : units.push(c)));
  const atoms = [];   // {el, h, group?, base?}
  units.forEach((el) => {
    const h = hOf(el), lst = el.matches('ul, ol') ? el : (el.querySelector('.cd-skills, .cd-tiles') || (el.querySelector('.cd-flowbox') ? null : el.querySelector('ul, ol'))), items = lst ? [...lst.children] : [];
    if (h > budget - reserve && items.length > 1) {
      const ig = parseFloat(getComputedStyle(lst).rowGap) || 0;
      const ih = items.map((it) => hOf(it) - (it === openLi ? openExtra : 0));
      const base = Math.max(0, h - openExtra - ih.reduce((x, y) => x + y, 0) - (items.length - 1) * ig);
      items.forEach((it, i) => atoms.push({ el: it, h: ih[i] + ig, group: el, base }));
    } else atoms.push({ el, h: h + gap });
  });
  // side-by-side columns fill up independently, so a page is as tall as its tallest column plus anything spanning both
  const multi = getComputedStyle(body).gridTemplateColumns.trim().split(/\s+/).length > 1;
  const keyOf = (el) => (multi ? (el.closest('.cd-col') || 'span') : 'one');
  const total = (u) => { let m = 0; for (const k of Object.keys(u)) if (k !== 'span') m = Math.max(m, u[k]); return (u.span || 0) + m; };
  const pages = [[]]; let use = { span: reserve }, seen = new Set();
  const cost = (a) => a.h + (a.group && !seen.has(a.group) ? a.base : 0);
  atoms.forEach((a) => {
    const k = a.key = keyOf(a.el);
    const fits = () => { const t = { ...use }; t[k] = (t[k] || 0) + cost(a); return total(t) <= budget; };
    if (!fits() && pages.at(-1).length) { pages.push([]); use = { span: reserve }; seen = new Set(); }
    use[k] = (use[k] || 0) + cost(a);
    if (a.group) seen.add(a.group);
    pages.at(-1).push(a);
  });
  if (!tight && (reserve > budget * 0.5 || atoms.some((a) => a.h - gap > budget - reserve))) { undo(); return fitCard(panelBody, true); }   // one piece is taller than a page: tighten the type and try again
  if (pages.length < 2) { undo(); return; }
  root.classList.add('is-paged');
  let at = Math.min(+root.dataset.pgAt || 0, pages.length - 1);
  const apply = () => {
    const on = new Set(pages[at].map((a) => a.el)), groups = new Set(pages[at].map((a) => a.group).filter(Boolean));
    atoms.forEach((a) => a.el.classList.toggle('pg-off', !on.has(a.el)));
    new Set(atoms.map((a) => a.group).filter(Boolean)).forEach((g) => g.classList.toggle('pg-off', !groups.has(g)));
    body.querySelectorAll('.cd-col').forEach((c) => c.classList.toggle('pg-off', ![...c.children].some((k) => !k.classList.contains('pg-off'))));
  };
  // hold the body at the tallest page so Prev / Next never jumps
  let tall = 0;
  body.style.flex = '0 0 auto';   // measure the content, not the stretched grid
  pages.forEach((_, i) => { at = i; apply(); tall = Math.max(tall, body.getBoundingClientRect().height - (openLi && !openLi.classList.contains('pg-off') ? openExtra : 0) + reserve); });
  body.style.flex = '';
  at = Math.min(+root.dataset.pgAt || 0, pages.length - 1);
  const show = () => {
    apply();
    body.style.minHeight = `${Math.ceil(tall)}px`;
    pager.querySelector('.cd-pg-n').textContent = `Page ${at + 1} of ${pages.length}`;
    pager.querySelector('[data-pg="-1"]').disabled = at === 0;
    pager.querySelector('[data-pg="1"]').disabled = at === pages.length - 1;
    root.dataset.pgAt = at; panelBody.scrollTop = 0;
    const sel = body.querySelector('[data-trophy][aria-expanded="true"]');
    if (sel && sel.closest('li').classList.contains('pg-off')) body.querySelector('li:not(.pg-off) [data-trophy]')?.click();   // the open row always lives on the visible page
  };
  pager.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pg]'); if (!b || b.disabled) return;
    at = Math.max(0, Math.min(pages.length - 1, at + +b.dataset.pg)); show();
    (pager.querySelector(`[data-pg="${b.dataset.pg}"]:not(:disabled)`) || pager.querySelector('button:not(:disabled)'))?.focus({ preventScroll: true });
  });
  show();
}

// ---------- modal behaviour ----------
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, video[controls], [tabindex]:not([tabindex="-1"])';
const visible = (el) => el.offsetParent !== null || el === document.activeElement;
function trapTab(e, root) {
  const items = [...root.querySelectorAll(FOCUSABLE)].filter(visible);
  if (!items.length) { e.preventDefault(); root.focus(); return; }
  const first = items[0], last = items.at(-1), a = document.activeElement;
  if (!root.contains(a) || a === root) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
}

/** Image / video lightbox: one at a time, Esc closes only the viewer, focus returns to the opener. */
export function openLightbox(slides, start = 0) {
  slides = slides.map((s) => ({ ...s, src: safeUrl(s.src) })).filter((s) => s.src);
  if (!slides.length) return;
  document.querySelector('.lb')?.remove();
  const opener = document.activeElement;
  let i = Math.max(0, Math.min(start, slides.length - 1));
  const el = document.createElement('div');
  el.className = 'lb'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Photo viewer'); el.tabIndex = -1;
  el.innerHTML = `<div class="lb-box"><div class="lb-bar"><span class="lb-title"></span><span class="lb-count"></span><button type="button" class="lb-x" aria-label="Close photo viewer">${ico('close', 14)}</button></div>
    <div class="lb-stage"><button type="button" class="lb-nav prev" aria-label="Previous photo">${ico('back', 16)}</button><img alt=""><video controls playsinline hidden></video><button type="button" class="lb-nav next" aria-label="Next photo">${ico('arrow', 16)}</button></div></div>`;
  const img = el.querySelector('img'), vid = el.querySelector('video');
  const show = () => {
    const s = slides[i], isVid = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(s.src);
    vid.pause(); img.hidden = isVid; vid.hidden = !isVid;
    if (isVid) vid.src = s.src; else { vid.removeAttribute('src'); img.src = s.src; img.alt = s.caption || ''; }
    el.querySelector('.lb-title').textContent = s.caption || '';
    el.querySelector('.lb-count').textContent = slides.length > 1 ? `${i + 1} / ${slides.length}` : '';
    el.querySelectorAll('.lb-nav').forEach((b) => { b.hidden = slides.length < 2; });
  };
  const close = () => {
    vid.pause(); vid.removeAttribute('src'); el.remove(); removeEventListener('keydown', key, true);
    try { opener?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
  };
  const step = (d) => { i = (i + d + slides.length) % slides.length; show(); };
  function key(e) {
    if (!el.isConnected) return;
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft' && slides.length > 1) { e.stopPropagation(); step(-1); }
    else if (e.key === 'ArrowRight' && slides.length > 1) { e.stopPropagation(); step(1); }
    else if (e.key === 'Tab') { e.stopPropagation(); trapTab(e, el); }
    else if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation();   // the game never sees keys meant for the viewer
  }
  el.querySelector('.lb-x').addEventListener('click', close);
  el.querySelector('.prev').addEventListener('click', () => step(-1));
  el.querySelector('.next').addEventListener('click', () => step(1));
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  addEventListener('keydown', key, true);
  document.body.append(el); show(); el.querySelector('.lb-x').focus();
}

/**
 * Makes #panel a real modal: a scrim behind it (click closes), focus moves in and is trapped,
 * and the game's keyboard shortcuts stay quiet while it is open.
 */
export function installPanelModal({ panel, scrim, close, onOpen }) {
  panel.setAttribute('aria-modal', 'true');
  panel.tabIndex = -1;
  const isOpen = () => !panel.classList.contains('hidden');
  const sync = () => { scrim.classList.toggle('hidden', !isOpen()); };
  new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['class'] });
  sync();
  scrim.addEventListener('click', () => close());
  panel.addEventListener('click', (e) => { if (e.target.closest('[data-card-close]')) close(); });
  window.addEventListener('keydown', (e) => {
    if (!isOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.lb')) return;
    if (e.target.closest?.('#tour-card, #tour-modal, #bigmap, #controls, .photo-card')) return;
    if (e.key === 'Escape') return;                       // the game's own handler closes the panel
    if (e.key === 'Tab') { e.stopPropagation(); trapTab(e, panel); return; }
    e.stopPropagation();                                  // movement, interact, map, help... stay quiet behind the card
    const k = e.key, t = e.target;
    const native = t.closest?.('button, a, summary, input, select, textarea, video');
    if ((k === ' ' || k === 'Enter') && native) return;  // let the focused control activate
    if (k === ' ' && !t.closest?.('#panel')) e.preventDefault();
  }, true);
  return { focus: () => { try { panel.focus({ preventScroll: true }); } catch { /* ignore */ } onOpen?.(); } };
}

// ---------- Memory Line timetable ----------
export function timetableHtml(stops) {
  const h = head({ tile: tile(ico('flag', 28)), eyebrow: 'Memory Line', title: 'Where to next?', sub: 'The line loops the town, one stop per chapter of my life.' });
  const rows = `<ol class="cd-edu cd-stops">${stops.map((s) => `<li class="${s.current ? 'current' : ''}"><span class="cd-num">${esc(s.num)}</span><div class="cd-edu-t"><b class="cd-t">${esc(s.name)}</b><span class="cd-sub">${esc(s.sub)}</span></div>${s.current ? `<span class="cd-stamp on">${ico('pin', 12)} You are here</span>` : actBtn('arrow', 'Board', `data-board="${esc(s.id)}"`, true)}</li>`).join('')}</ol>`;
  return frame({ kind: 'edu', head: h, body: `<div class="cd-span">${rows}</div>`, foot: foot('', '') });
}
