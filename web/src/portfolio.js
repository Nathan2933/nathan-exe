import { loadContent, esc, safeUrl, chapterFor } from './shared/content.js';
import { portraitURL } from './game/portrait.js';

const main = document.getElementById('main');
const params = new URLSearchParams(location.search);

function notice(msg) {
  const n = document.getElementById('notice');
  n.textContent = msg;
  n.classList.remove('hidden');
}

// ---------- helpers ----------
const ext = (url) => (String(url).startsWith('mailto:') ? '' : ' target="_blank" rel="noopener"');
const chips = (items, cls = 'chips') => (items?.length ? `<ul class="${cls}">${items.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : '');
const paras = (arr) => (arr || []).map((t) => `<p>${esc(t)}</p>`).join('');

function section(id, file, title, body, extraCls = '') {
  return `
    <section id="${id}" class="window section ${extraCls}" aria-labelledby="${id}-h">
      <div class="window-bar"><span class="title">${esc(file)}</span></div>
      <div class="section-body"><h2 id="${id}-h">${esc(title)}</h2>${body}</div>
    </section>`;
}

const norm = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, '').trim();
/** Names a skill item answers to, e.g. "Ethereum / Ganache" → ethereum, ganache. */
const aliases = (item) => norm(item).split('/').map((s) => s.trim()).filter(Boolean);

// Category for each existing skill item (no new skills are invented here).
const SKILL_CATS = [
  ['Languages', ['python', 'java', 'javascript', 'typescript', 'c', 'c++', 'sql']],
  ['Frontend', ['html', 'css', 'react', 'next.js', 'tailwind css']],
  ['Backend', ['flask', 'node.js']],
  ['Databases', ['mysql', 'mongodb', 'sqlite']],
  ['Cloud / DevOps', ['docker', 'kubernetes', 'grafana', 'git', 'github']],
  ['Security', ['falco', 'audit-event monitoring']],
  ['Blockchain', ['solidity', 'ethereum / ganache']],
  ['AI & Tools', ['ai-assisted prototyping', 'prompt engineering', 'reflect', 'bugbug.io']],
  ['Game Dev', ['three.js', 'blender']],
];

function groupSkills(c) {
  const all = [...new Set((c.skills || []).flatMap((g) => g.items || []))];
  const groups = SKILL_CATS.map(([name]) => ({ name, items: [] }));
  const other = { name: 'Other', items: [] };
  for (const item of all) {
    const i = SKILL_CATS.findIndex(([, list]) => list.includes(norm(item)));
    (i >= 0 ? groups[i] : other).items.push(item);
  }
  return [...groups, other].filter((g) => g.items.length);
}

const projectsUsing = (c, item) => {
  const names = aliases(item);
  return (c.projects || []).filter((p) => (p.stack || []).some((s) => names.includes(norm(s))));
};

/** Achievements whose org line names the project (e.g. "with Aratro", "· TCE Event Scheduler"). */
const resultsFor = (c, p) => {
  const short = norm(p.title.split(':')[0]);
  return (c.achievements || []).filter((a) => norm(a.org || '').includes(short));
};

// ---------- sections ----------
function characterFile(c) {
  const p = c.profile || {};
  const resume = safeUrl(p.resumeUrl);
  const count = (c.projects || []).length;
  return `
    <section id="about" class="window section hero" aria-labelledby="about-h">
      <div class="window-bar"><span class="title">character_file / 001</span></div>
      <div class="section-body hero-grid">
        <div class="hero-text">
        <p class="kicker">CHARACTER FILE / 001</p>
        <h1 id="about-h">${esc((p.name || '').toUpperCase())}</h1>
        <p class="role">${esc(p.role)}</p>
        ${p.location ? `<p class="loc">${esc(p.location)}</p>` : ''}
        <p class="summary">${esc(p.summary)}</p>
        <div class="hero-actions">
          ${resume ? `<a class="btn primary" href="${esc(resume)}" target="_blank" rel="noopener">Resume ↗</a>` : ''}
          <a class="btn" href="#projects">Projects</a>
          <a class="btn" href="#contact">Contact</a>
        </div>
        <dl class="stat-row">
          <div><dt>Missions logged</dt><dd>${count}</dd></div>
          <div><dt>Trophies</dt><dd>${(c.achievements || []).length}</dd></div>
          <div><dt>Career entries</dt><dd>${(c.experience || []).length}</dd></div>
        </dl>
        <details class="more">
          <summary>Read the full profile</summary>
          ${paras(p.about)}
        </details>
        </div>
        <img class="name-tag" src="assets/hello-name.png" alt="Hello, my name is Nathan Jerald" width="859" height="544">
      </div>
    </section>`;
}

function journey(c) {
  const edu = c.education || [];
  const items = edu.map((e, i) => {
    const ch = chapterFor(c, e.district) || {};
    const mems = (c.memories || []).filter((m) => m.district === e.district);
    return `
      <li class="chapter" data-tone="${esc(e.station || '')}">
        <div class="ch-preview" aria-hidden="true" data-shot="${esc(e.id || '')}"><span>${esc(e.num || String(i + 1).padStart(2, '0'))}</span></div>
        <div class="ch-main">
          <p class="ch-tag">${esc(e.tagline)}</p>
          <h3>${esc(e.institution)}</h3>
          <p class="ch-meta">${esc(e.place)} · ${esc(e.detail)}</p>
          <button type="button" class="link-btn ch-open" data-chapter="${i}">Chapter details ›</button>
          <template class="ch-body">
            <p class="m-id">${esc(e.tagline)} · ${esc(e.place)}</p>
            <h2 id="md-title">${esc(e.institution)}</h2>
            ${ch.title ? `<h3>${esc(ch.title)}${ch.subtitle ? ` — ${esc(ch.subtitle)}` : ''}</h3>` : ''}
            ${paras(ch.body)}
            ${chips(ch.highlights)}
            ${mems.length ? `<ul class="mem-list">${mems.map((m) => `<li><b>${esc(m.title)}</b>${m.year ? ` <span>${esc(m.year)}</span>` : ''}<p>${esc(m.text)}</p></li>`).join('')}</ul>` : ''}
          </template>
        </div>
      </li>`;
  }).join('');
  return section('journey', 'journey map', 'Journey', `<ol class="journey">${items}</ol>`);
}

function discipline(c) {
  const ch = chapterFor(c, 'iron-yard');
  if (!ch) return '';
  const mems = (c.memories || []).filter((m) => m.district === 'iron-yard');
  const steps = (ch.highlights || []).map((h) => {
    const [label, value] = h.split(':').map((s) => s.trim());
    return `<li><span class="cp-label">${esc(value ? label : '')}</span><b>${esc(value || label)}</b></li>`;
  }).join('');
  return section('discipline', 'iron_yard.log', ch.title, `
    ${ch.subtitle ? `<p class="sub">${esc(ch.subtitle)}</p>` : ''}
    ${steps ? `<ol class="checkpoints">${steps}</ol>` : ''}
    ${paras(ch.body)}
    ${mems.length ? `<div class="mem-grid">${mems.map((m) => `
      <figure class="mem-card">
        ${m.image ? `<img src="${esc(safeUrl(m.image))}" alt="" loading="lazy">` : '<div class="media-ph" aria-hidden="true"></div>'}
        <figcaption><b>${esc(m.title)}</b><p>${esc(m.text)}</p></figcaption>
      </figure>`).join('')}</div>` : ''}`);
}

function missionCard(c, p, i) {
  const links = [
    p.github && `<a href="${esc(safeUrl(p.github))}" target="_blank" rel="noopener">Code ↗</a>`,
    p.demo && `<a href="${esc(safeUrl(p.demo))}" target="_blank" rel="noopener">Live ↗</a>`,
  ].filter(Boolean).join('');
  return `
    <article class="mission${p.featured ? ' is-featured' : ''}" data-project="${esc(p.id)}">
      ${p.image ? `<img class="m-shot" src="${esc(safeUrl(p.image))}" alt="" loading="lazy">` : `<div class="m-shot m-ph" aria-hidden="true"><span>M-${String(i + 1).padStart(2, '0')}</span></div>`}
      <div class="m-body">
        <div class="m-head">
          <span class="m-id">MISSION ${String(i + 1).padStart(2, '0')}${p.featured ? ' · FEATURED' : ''}</span>
          ${p.year ? `<span class="m-year">${esc(p.year)}</span>` : ''}
        </div>
        <h3>${esc(p.title)}</h3>
        <p class="m-pitch">${esc(p.pitch)}</p>
        ${chips(p.stack)}
        <div class="m-actions">
          <button class="btn small" type="button" data-details="${esc(p.id)}">View details</button>
          ${links ? `<span class="m-links">${links}</span>` : ''}
        </div>
      </div>
    </article>`;
}

function missions(c, sorted) {
  return section('projects', 'mission_board/', 'Mission Board', `
    <p class="sub">${sorted.length} missions on file.</p>
    <div class="mission-grid">${sorted.map((p, i) => missionCard(c, p, i)).join('')}</div>`);
}

function missionDetails(c, p) {
  const results = resultsFor(c, p);
  const arch = (p.architecture || []).filter(Boolean);
  const links = [
    p.github && `<a class="btn small" href="${esc(safeUrl(p.github))}" target="_blank" rel="noopener">GitHub ↗</a>`,
    p.demo && `<a class="btn small" href="${esc(safeUrl(p.demo))}" target="_blank" rel="noopener">Live demo ↗</a>`,
  ].filter(Boolean).join('');
  return `
    ${p.image ? `<img class="md-shot" src="${esc(safeUrl(p.image))}" alt="" loading="lazy">` : ''}
    <p class="m-id">${p.year ? esc(p.year) : 'Mission file'}${p.featured ? ' · FEATURED' : ''}</p>
    <h2 id="md-title">${esc(p.title)}</h2>
    <p class="m-pitch">${esc(p.pitch)}</p>
    ${p.description ? `<section><h3>Brief</h3><p>${esc(p.description)}</p></section>` : ''}
    ${arch.length ? `<section><h3>Approach</h3><ol class="arch">${arch.map((a) => `<li>${esc(a)}</li>`).join('')}</ol></section>` : ''}
    ${p.contribution ? `<section><h3>My contribution</h3><p>${esc(p.contribution)}</p></section>` : ''}
    ${p.stack?.length ? `<section><h3>Tech</h3>${chips(p.stack)}</section>` : ''}
    ${results.length ? `<section><h3>Results</h3><ul class="results">${results.map((a) => `<li><b>${esc(a.title)}</b>${a.detail ? ` — ${esc(a.detail)}` : ''}</li>`).join('')}</ul></section>` : ''}
    ${links ? `<div class="md-links">${links}</div>` : ''}`;
}

function skillTree(c) {
  const groups = groupSkills(c);
  return section('skills', 'skill_tree.cfg', 'Skill Tree', `
    <p class="sub">Select a skill to see the missions that used it.</p>
    <div class="tree">${groups.map((g) => `
      <div class="branch">
        <h3>${esc(g.name)}</h3>
        <ul>${g.items.map((s) => {
          const n = projectsUsing(c, s).length;
          return `<li><button type="button" class="skill" aria-pressed="false" data-skill="${esc(s)}">${esc(s)}${n ? `<span class="s-n" aria-label="${n} missions">${n}</span>` : ''}</button></li>`;
        }).join('')}</ul>
      </div>`).join('')}
    </div>
    <div class="skill-out" id="skill-out" aria-live="polite"><p class="hint">No skill selected.</p></div>`);
}

function careerLog(c) {
  const exp = c.experience || [];
  if (!exp.length) return '';
  return section('experience', 'career.log', 'Career Log', `
    <ol class="career">${exp.map((e) => `
      <li>
        <div class="row-head"><h3>${esc(e.role)}</h3>${e.period ? `<span>${esc(e.period)}</span>` : ''}</div>
        <p class="org">${esc(e.org)}</p>
        <p>${esc(e.summary)}</p>
      </li>`).join('')}
    </ol>`);
}

const tier = (a) => (/second runner-up/i.test(a.title) ? 'third' : /runner-up/i.test(a.title) ? 'second' : /winner/i.test(a.title) ? 'gold' : 'other');
const TIER_LABEL = { gold: 'Winner', second: 'Runner-up', third: 'Second runner-up', other: 'Award' };

function trophies(c) {
  const list = (c.achievements || []).map((a, i) => ({ ...a, i, t: tier(a) }));
  if (!list.length) return '';
  const order = { gold: 0, second: 1, third: 2, other: 3 };
  list.sort((a, b) => order[a.t] - order[b.t] || String(b.year).localeCompare(String(a.year)) || a.i - b.i);
  const present = Object.keys(order).filter((t) => list.some((a) => a.t === t));
  return section('trophies', 'achievements', 'Trophy Collection', `
    <div class="filters" role="group" aria-label="Filter trophies">
      <button type="button" class="filter" aria-pressed="true" data-filter="all">All (${list.length})</button>
      ${present.map((t) => `<button type="button" class="filter" aria-pressed="false" data-filter="${t}">${TIER_LABEL[t]} (${list.filter((a) => a.t === t).length})</button>`).join('')}
    </div>
    <ul class="trophy-grid" id="trophy-grid">${list.map((a, n) => `
      <li class="trophy t-${a.t}${n >= 6 ? ' is-extra' : ''}" data-tier="${a.t}">
        <span class="t-icon" aria-hidden="true"></span>
        <div>
          <h3>${esc(a.title)}</h3>
          <p class="t-meta">${esc(a.org || '')}${a.year ? ` · ${esc(a.year)}` : ''}</p>
          ${a.detail ? `<p class="t-detail">${esc(a.detail)}</p>` : ''}
        </div>
      </li>`).join('')}
    </ul>
    ${list.length > 6 ? `<button type="button" class="btn small" id="trophy-all" aria-expanded="false" aria-controls="trophy-grid">View all ${list.length}</button>` : ''}`);
}

function terminal(c) {
  const p = c.profile || {};
  const resume = safeUrl(p.resumeUrl);
  const ch = chapterFor(c, 'lighthouse');
  const rows = (c.links || []).map((l) => {
    const url = safeUrl(l.url);
    const shown = url.replace(/^mailto:/, '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    return `<li><span class="k">${esc(l.label.toUpperCase())}</span><a href="${esc(url)}"${ext(url)}>${esc(shown)}</a></li>`;
  }).join('');
  return section('contact', 'comm_terminal.exe', 'Communication Terminal', `
    ${ch ? `<h3 class="sub-h">${esc(ch.title)}</h3>${paras(ch.body)}` : ''}
    <ul class="term">${rows}${resume ? `<li><span class="k">RESUME</span><a href="${esc(resume)}" target="_blank" rel="noopener">resume.pdf ↗</a></li>` : ''}</ul>`, 'terminal');
}

// compact project list beside the journey (opens the same details dialog)
function missionList(sorted) {
  return `
    <section class="window section quick" aria-labelledby="quick-h">
      <div class="window-bar"><span class="flag" aria-hidden="true"></span><span class="title" id="quick-h">Missions (projects)</span></div>
      <ul class="quick-list">${sorted.map((p) => `
        <li><button type="button" data-details="${esc(p.id)}">
          <b>${esc(p.title.split(':')[0])}</b>
          <span>${esc((p.stack || []).slice(0, 3).join(' · ') || p.pitch || '')}</span>
          <i aria-hidden="true">›</i>
        </button></li>`).join('')}
      </ul>
    </section>`;
}
// top achievements strip (full collection lives further down)
function trophyStrip(c) {
  const list = (c.achievements || []).map((a, i) => ({ ...a, i, t: tier(a) })).sort((a, b) => ({ gold: 0, second: 1, third: 2, other: 3 }[a.t] - { gold: 0, second: 1, third: 2, other: 3 }[b.t]) || a.i - b.i);
  if (!list.length) return '';
  return `
    <section class="window section strip" aria-labelledby="strip-h">
      <div class="window-bar"><span class="cup" aria-hidden="true"></span><span class="title" id="strip-h">Achievements</span></div>
      <ul class="strip-list">${list.slice(0, 3).map((a) => `
        <li class="t-${a.t}"><span class="t-icon" aria-hidden="true"></span><div><b>${esc(a.title)}</b><span>${esc(TIER_LABEL[a.t])}${a.org ? ` · ${esc(a.org)}` : ''}${a.year ? ` · ${esc(a.year)}` : ''}</span></div></li>`).join('')}
        <li class="more-t"><a href="#trophies"><span class="medal" aria-hidden="true"></span><div><b>+ More achievements</b><span>View all ${list.length} →</span></div></a></li>
      </ul>
    </section>`;
}
// real Island 01 buildings, rendered once in the background
async function loadShots() {
  const els = [...main.querySelectorAll('[data-shot]')];
  if (!els.length) return;
  try {
    const { renderBuildings } = await import('./buildingShots.js');
    const shots = await renderBuildings([...new Set(els.map((e) => e.dataset.shot))]);
    for (const e of els) if (shots[e.dataset.shot]) { e.style.backgroundImage = `url(${shots[e.dataset.shot]})`; e.classList.add('has-shot'); }
    const heroEl = main.querySelector('[data-hero]');
    if (heroEl) { const { renderHero } = await import('./buildingShots.js'); heroEl.style.backgroundImage = `url(${await renderHero()})`; heroEl.classList.add('has-shot'); }
  } catch (err) { console.warn('building previews unavailable', err); }
}

// ---------- render + behaviour ----------
function render(c) {
  const p = c.profile || {};
  document.title = `${p.name || 'Nathan'} — Player Archive`;
  document.getElementById('foot-name').textContent = `© ${new Date().getFullYear()} ${p.name || 'Nathan'}`;
  document.getElementById('side-name').textContent = (p.name || 'Nathan').toUpperCase();
  const resume = safeUrl(p.resumeUrl);
  if (resume) document.getElementById('side-resume').href = resume;

  const sorted = [...(c.projects || [])].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  const noticeEl = document.getElementById('notice');
  main.innerHTML = '';
  main.append(noticeEl);
  main.insertAdjacentHTML('beforeend', characterFile(c) + `<div class="duo">${journey(c)}${missionList(sorted)}</div>` + discipline(c) + missions(c, sorted) + skillTree(c) + careerLog(c) + terminal(c));
  loadShots();
  main.removeAttribute('aria-busy');

  wireMissions(c);
  wireSkills(c);
  wireNavHighlight();
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
}

const dialog = document.getElementById('mission-dialog');
let lastOpener = null;
function openMission(c, id, opener) {
  const p = (c.projects || []).find((x) => x.id === id);
  if (!p) return;
  document.getElementById('md-body').innerHTML = missionDetails(c, p);
  document.getElementById('md-file').textContent = `mission_${p.id}.log`;
  lastOpener = opener;
  if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
  document.getElementById('md-close').focus();
}
dialog.addEventListener('close', () => lastOpener?.focus());
document.getElementById('md-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

function wireMissions(c) {
  main.addEventListener('click', (e) => {
    const chb = e.target.closest('[data-chapter]');
    if (chb) {
      document.getElementById('md-body').innerHTML = chb.parentElement.querySelector('.ch-body').innerHTML;
      document.getElementById('md-file').textContent = 'journey.map';
      lastOpener = chb;
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
      document.getElementById('md-close').focus();
      return;
    }
    const b = e.target.closest('[data-details]');
    if (b) openMission(c, b.dataset.details, b);
  });
}

function wireSkills(c) {
  const out = document.getElementById('skill-out');
  const buttons = [...main.querySelectorAll('.skill')];
  buttons.forEach((b) => b.addEventListener('click', () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    buttons.forEach((x) => x.setAttribute('aria-pressed', 'false'));
    main.querySelectorAll('.mission.is-match').forEach((m) => m.classList.remove('is-match'));
    if (!on) { out.innerHTML = '<p class="hint">No skill selected.</p>'; return; }
    b.setAttribute('aria-pressed', 'true');
    const skill = b.dataset.skill;
    const ps = projectsUsing(c, skill);
    ps.forEach((p) => main.querySelector(`.mission[data-project="${CSS.escape(p.id)}"]`)?.classList.add('is-match'));
    out.innerHTML = ps.length
      ? `<p><b>${esc(skill)}</b> was used in:</p><ul class="rel">${ps.map((p) => `<li><button type="button" class="link-btn" data-details="${esc(p.id)}">${esc(p.title)}</button></li>`).join('')}</ul>`
      : `<p><b>${esc(skill)}</b> isn't tied to a listed mission yet.</p>`;
  }));
}

function wireTrophies() {
  const grid = document.getElementById('trophy-grid');
  if (!grid) return;
  const all = document.getElementById('trophy-all');
  const filters = [...main.querySelectorAll('.filter')];
  filters.forEach((f) => f.addEventListener('click', () => {
    filters.forEach((x) => x.setAttribute('aria-pressed', String(x === f)));
    grid.dataset.filter = f.dataset.filter;
    grid.querySelectorAll('.trophy').forEach((t) => {
      t.hidden = f.dataset.filter !== 'all' && t.dataset.tier !== f.dataset.filter;
    });
    if (f.dataset.filter !== 'all') grid.classList.add('show-all');
    else if (all?.getAttribute('aria-expanded') !== 'true') grid.classList.remove('show-all');
    if (all) all.hidden = f.dataset.filter !== 'all';
  }));
  all?.addEventListener('click', () => {
    const open = all.getAttribute('aria-expanded') !== 'true';
    all.setAttribute('aria-expanded', String(open));
    grid.classList.toggle('show-all', open);
    all.textContent = open ? 'Show featured' : `View all ${grid.children.length}`;
  });
}

let lockUntil = 0;
function wireNavHighlight() {
  const links = [...document.querySelectorAll('.side-nav a, .top-nav a')];
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting || performance.now() < lockUntil) return;
      links.forEach((a) => {
        if (a.getAttribute('href') === `#${en.target.id}`) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  main.querySelectorAll('section[id]').forEach((s) => io.observe(s));
  const mark = (id) => links.forEach((a) => { if (a.getAttribute('href') === `#${id}`) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  // a click highlights instantly and holds while the page scrolls there
  links.forEach((a) => a.addEventListener('click', () => { lockUntil = performance.now() + 1200; mark(a.getAttribute('href').slice(1)); }));
  addEventListener('scroll', () => { if (performance.now() > lockUntil && innerHeight + scrollY >= document.documentElement.scrollHeight - 4) mark('contact'); }, { passive: true });
}

// Mobile menu
const menuBtn = document.getElementById('menu-btn');
const sideNav = document.getElementById('side-nav');
menuBtn.addEventListener('click', () => {
  const open = menuBtn.getAttribute('aria-expanded') !== 'true';
  menuBtn.setAttribute('aria-expanded', String(open));
  sideNav.classList.toggle('open', open);
});
sideNav.addEventListener('click', (e) => {
  if (e.target.closest('a')) { menuBtn.setAttribute('aria-expanded', 'false'); sideNav.classList.remove('open'); }
});

document.getElementById('portrait').src = portraitURL();
if (params.has('nowebgl')) notice("Your browser couldn't start the 3D version, so here's the classic portfolio.");

loadContent().then(render).catch((err) => {
  console.error(err);
  main.innerHTML = '<p class="loading">Could not load portfolio content. Please refresh.</p>';
});
