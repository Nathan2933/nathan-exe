import { loadContent, esc, safeUrl, chapterFor } from './shared/content.js';
import { portraitURL } from './game/portrait.js';
import { initPortraitGlitch } from './portrait-glitch.js';
import { initTourInvite } from './tour-invite.js';

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
const TECH_RE = /\b(Kubernetes|Falco|Grafana|Docker|Python|Solidity|Ethereum|Ganache|Flask|Next\.js|TypeScript|Tailwind CSS|Three\.js|Blender|Reflect|BugBug\.io|React|Node\.js|MongoDB|MySQL|SQLite|Tkinter)\b/g;
const KEY_RE = /\b((?:19|20)\d\d|Winner|Runner-up|Second runner-up|Hack Odyssey 2K25|Aratro|CauverySite|TCE Event Scheduler|NATHAN\.EXE|Hospital Management System|Hewlett Packard Enterprise|HPE|SEZ US|TCE IT Association|IT Association|Office Bearer|Entrepreneurship Cell|E-Cell|technical and cultural events|flagship events|security logging and monitoring|web and mobile)\b/g;
const NUM_RE = /\b(\d[\d,]*\+\s+(?:participants|attendees|students|teams|users))/g;
/** Escapes text, then adds restrained emphasis: navy bold keys, teal tech, yellow for meaningful numbers. */
function rich(text) {
  return esc(text == null ? '' : String(text))
    .replace(NUM_RE, '<mark class="hl-y">$1</mark>')
    .replace(TECH_RE, '<b class="hl-t">$1</b>')
    .replace(KEY_RE, '<b class="hl-n">$1</b>');
}
const paras = (arr) => (arr || []).map((t) => `<p>${rich(t)}</p>`).join('');

// project logos: existing files only (transparent copies in assets/logos/transparent)
const PROJECT_LOGOS = {
  'microservices-security': 'assets/logos/transparent/hpe.png',
  'tce-event-scheduler': 'assets/logos/transparent/tce.png',
  'nathan-exe': 'assets/logos/transparent/nat_log.png',
};
// retro building art for journey stops (web/public/assets/journey)
const JOURNEY_IMG = { montfort: 'assets/journey/montfort.png', tce: 'assets/journey/tce.png' };

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
  ['Languages', ['python', 'java', 'javascript', 'typescript', 'c', 'c++', 'sql', 'solidity']],
  ['Web', ['html', 'css', 'react', 'next.js', 'tailwind css', 'flask', 'node.js', 'mysql', 'mongodb', 'sqlite']],
  ['Cloud', ['docker', 'kubernetes', 'grafana']],
  ['Security', ['falco', 'audit-event monitoring', 'ethereum / ganache']],
  ['Tools', ['git', 'github', 'ai-assisted prototyping', 'prompt engineering', 'reflect', 'bugbug.io', 'three.js', 'blender']],
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
  return `
    <section id="about" class="window section hero" aria-labelledby="about-h">
      <div class="window-bar"><span class="title">character_file / 001</span></div>
      <div class="section-body hero-grid">
        <div class="hero-text">
        <h1 id="about-h">${esc((p.name || '').toUpperCase())}</h1>
        <p class="role"><span class="d-only">${esc(p.role)}</span><span class="m-only">${esc(p.mobileRole || 'IT Undergrad · Builder')}</span></p>
        ${p.location ? `<p class="loc">${esc(p.location)}</p>` : ''}
        <p class="summary"><span class="d-only">${rich(p.summary)}</span><span class="m-only">${esc(p.mobileSummary || 'I follow loose wires just to see where they go. Sometimes, something boots up.')}</span></p>
        <div class="hero-actions">
          ${resume ? `<a class="btn primary" href="${esc(resume)}" target="_blank" rel="noopener">Resume ↗</a>` : ''}
          <a class="btn" href="#projects">Projects</a>
          <a class="btn" href="#contact">Contact</a>
        </div>
        </div>
        <img class="name-tag hero-portrait" src="assets/nat.png" alt="Pixel-art portrait of Nathan Jerald" width="1254" height="1254">
      </div>
    </section>`;
}

const J_ICONS = {
  book: '<svg viewBox="0 0 14 14" shape-rendering="crispEdges" aria-hidden="true"><path fill="#101F45" d="M1 2h5v1h-5zM8 2h5v1h-5zM0 3h1v1h-1zM6 3h2v1h-2zM13 3h1v1h-1zM0 4h1v1h-1zM6 4h2v1h-2zM13 4h1v1h-1zM0 5h1v1h-1zM6 5h2v1h-2zM13 5h1v1h-1zM0 6h1v1h-1zM6 6h2v1h-2zM13 6h1v1h-1zM0 7h1v1h-1zM6 7h2v1h-2zM13 7h1v1h-1zM0 8h1v1h-1zM6 8h2v1h-2zM13 8h1v1h-1zM0 9h1v1h-1zM6 9h2v1h-2zM13 9h1v1h-1zM1 10h12v1h-12z"/><path fill="#FFF5DD" d="M1 3h5v1h-5zM8 3h5v1h-5zM1 4h1v1h-1zM5 4h1v1h-1zM8 4h1v1h-1zM12 4h1v1h-1zM1 5h5v1h-5zM8 5h5v1h-5zM1 6h1v1h-1zM5 6h1v1h-1zM8 6h1v1h-1zM12 6h1v1h-1zM1 7h5v1h-5zM8 7h5v1h-5zM1 8h1v1h-1zM5 8h1v1h-1zM8 8h1v1h-1zM12 8h1v1h-1zM1 9h5v1h-5zM8 9h5v1h-5z"/><path fill="#FFF02A" d="M2 4h3v1h-3zM9 4h3v1h-3zM2 6h3v1h-3zM9 6h3v1h-3zM2 8h3v1h-3zM9 8h3v1h-3z"/></svg>',
  code: '<svg viewBox="0 0 14 14" shape-rendering="crispEdges" aria-hidden="true"><path fill="#101F45" d="M1 2h12v1h-12zM0 3h1v1h-1zM13 3h1v1h-1zM0 4h1v1h-1zM13 4h1v1h-1zM0 5h1v1h-1zM13 5h1v1h-1zM0 6h1v1h-1zM13 6h1v1h-1zM0 7h1v1h-1zM13 7h1v1h-1zM0 8h1v1h-1zM13 8h1v1h-1zM0 9h1v1h-1zM13 9h1v1h-1zM1 10h12v1h-12z"/><path fill="#FFF5DD" d="M1 3h12v1h-12zM1 4h4v1h-4zM6 4h1v1h-1zM9 4h4v1h-4zM1 5h3v1h-3zM5 5h2v1h-2zM8 5h1v1h-1zM10 5h3v1h-3zM1 6h2v1h-2zM4 6h2v1h-2zM7 6h3v1h-3zM11 6h2v1h-2zM1 7h3v1h-3zM5 7h1v1h-1zM7 7h2v1h-2zM10 7h3v1h-3zM1 8h4v1h-4zM7 8h1v1h-1zM9 8h4v1h-4zM1 9h12v1h-12z"/><path fill="#009FA9" d="M5 4h1v1h-1zM8 4h1v1h-1zM4 5h1v1h-1zM9 5h1v1h-1zM3 6h1v1h-1zM10 6h1v1h-1zM4 7h1v1h-1zM9 7h1v1h-1zM5 8h1v1h-1zM8 8h1v1h-1z"/><path fill="#d9a800" d="M7 4h1v1h-1zM7 5h1v1h-1zM6 6h1v1h-1zM6 7h1v1h-1zM6 8h1v1h-1z"/></svg>',
};
// chapter-card copy lives in content.json (education[].journeyCard); scenery art is reusable SVG in assets/journey
const J_DECO = (id, side) => `<span class="j-deco ${side}" style="background-image:url(assets/journey/deco-${id}-${side}.svg)"></span>`;

function journey(c) {
  const edu = c.education || [];
  const isTomsk = (e) => /tomsk/i.test(`${e.id || ''} ${e.institution || ''}`);
  let shown = 0;
  const items = edu.map((e, i) => {
    if (isTomsk(e)) return '';
    shown++;
    const n = String(shown).padStart(2, '0');
    const ch = chapterFor(c, e.district) || {};
    const mems = (c.memories || []).filter((m) => m.district === e.district);
    const k = e.journeyCard || {};
    const inst = (k.institutionLines && k.institutionLines.length ? k.institutionLines : [e.institution]).map(esc).join('<br>');
    const meta = k.meta || [e.place, e.detail].filter(Boolean).join(' / ');
    const tag = k.tag || '';
    return `
      <li class="jstop" data-tone="${esc(e.station || '')}">
        <span class="j-chk" aria-hidden="true">${n}</span>
        <div class="j-card">
          <div class="j-art" aria-hidden="true">${JOURNEY_IMG[e.id] ? `${J_DECO(e.id, 'l')}<img src="${JOURNEY_IMG[e.id]}" alt="" width="900" height="648" loading="eager" decoding="async">${J_DECO(e.id, 'r')}` : ''}</div>
          <div class="ch-main">
            <p class="j-chap">${esc(k.chapter || `Chapter ${n}`)}</p>
            <h3>${esc(k.title || e.tagline || '')}</h3>
            <p class="j-inst">${inst}</p>
            <p class="j-meta">${esc(meta)}</p>
            ${k.description ? `<p class="j-desc">${esc(k.description)}</p>` : '<p class="j-desc"></p>'}
            <button type="button" class="link-btn ch-open" data-chapter="${i}">Chapter details <span aria-hidden="true">&rsaquo;</span></button>
            <template class="ch-body">
              <p class="m-id">${/detour/i.test(e.tagline || '') ? '' : `${esc(e.tagline)} · `}${esc(e.place)}</p>
              <h2 id="md-title">${esc(e.institution)}</h2>
              ${ch.title ? `<h3>${esc(ch.title)}${ch.subtitle ? ` · ${esc(ch.subtitle)}` : ''}</h3>` : ''}
              ${paras(ch.body)}
              ${chips(ch.highlights)}
              ${mems.length ? `<ul class="mem-list">${mems.map((m) => `<li><b>${esc(m.title)}</b>${m.year ? ` <span>${esc(m.year)}</span>` : ''}<p>${rich(m.text)}</p></li>`).join('')}</ul>` : ''}
            </template>
          </div>
        </div>
      </li>`;
  }).join('');
  return `
    <section id="journey" class="window section" aria-labelledby="journey-h">
      <div class="window-bar"><span class="title">journey map</span></div>
      <div class="section-body"><h2 id="journey-h" class="j-h">Journey</h2><p class="sub j-sub">Two chapters. One adventure.</p><ol class="jmap" style="--n:${shown || 1}">${items}</ol></div>
    </section>`;
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
        <figcaption><b>${esc(m.title)}</b><p>${rich(m.text)}</p></figcaption>
      </figure>`).join('')}</div>` : ''}`);
}

const logoBox = (p, cls = '') => (PROJECT_LOGOS[p.id]
  ? `<span class="p-logo ${cls}" aria-hidden="true"><img src="${PROJECT_LOGOS[p.id]}" alt="" loading="lazy" decoding="async"></span>`
  : `<span class="p-logo is-icon ${cls}" aria-hidden="true">${projectIcon(p.id)}</span>`);

const CARD_PITCH = {
  aratro: 'Won **1st place** at Hack Odyssey 2K25. Built warehouse and inventory flows on **Solidity** smart contracts.',
  'microservices-security': 'Real-time **Kubernetes** threat visibility with **Falco** alerts and Grafana dashboards, built at HPE.',
  'tce-event-scheduler': 'Event scheduler with admin and database workflows, shipped in a **6-hour hackathon** using **Flask**.',
  cauverysite: 'Role-aware **property management** platform with sales dashboards and an employee hierarchy in **Next.js**.',
  'nathan-exe': 'This portfolio: an interactive **2.5D retro town** with a playable character, built with **Three.js**.',
  'hospital-management': 'My first project: a **desktop app** to manage hospital patient records, with staff login and file storage.',
};
const CARD_HIDE_TAGS = { 'microservices-security': ['Grafana'] };
const cardPitch = (p) => (CARD_PITCH[p.id] ? esc(CARD_PITCH[p.id]).replace(/\*\*(.+?)\*\*/g, '<b class="hl-t">$1</b>') : rich(p.pitch));

function missionCard(c, p, i) {
  const links = [
    p.github && `<a href="${esc(safeUrl(p.github))}" target="_blank" rel="noopener">Code ↗</a>`,
    p.demo && `<a href="${esc(safeUrl(p.demo))}" target="_blank" rel="noopener">Live ↗</a>`,
  ].filter(Boolean).join('');
  return `
    <article class="mission${p.featured ? ' is-featured' : ''}" data-project="${esc(p.id)}">
      ${p.image ? `<div class="m-shot m-frame" aria-hidden="true"><img class="m-bg" src="${esc(safeUrl(p.image))}" alt="" loading="lazy"><img class="m-img" src="${esc(safeUrl(p.image))}" alt="" loading="lazy"></div>` : `<div class="m-shot m-ph" aria-hidden="true"><span>M-${String(i + 1).padStart(2, '0')}</span></div>`}
      <div class="m-body">
        <div class="m-head">
          <span class="m-id">MISSION ${String(i + 1).padStart(2, '0')}${p.featured ? ' · FEATURED' : ''}</span>
          ${p.year ? `<span class="m-year">${esc(p.year)}</span>` : ''}
        </div>
        <h3>${esc(p.title)}</h3>
        <p class="m-pitch">${cardPitch(p)}</p>
        ${chips((p.stack || []).filter((t) => !(CARD_HIDE_TAGS[p.id] || []).includes(t)))}
        <div class="m-actions">
          <button class="btn small" type="button" data-details="${esc(p.id)}">View details</button>
          ${links ? `<span class="m-links">${links}</span>` : ''}
        </div>
      </div>
    </article>`;
}

function missions(c, sorted) {
  return section('projects', 'mission_board/', 'Projects', `
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
  return `<div class="md-grid"><div class="md-media">
    ${p.image ? `<img class="md-shot" src="${esc(safeUrl(p.image))}" alt="" loading="lazy">` : ''}
    <p class="m-id">${p.year ? esc(p.year) : 'Mission file'}${p.featured ? ' · FEATURED' : ''}</p>
    <div class="p-row">${logoBox(p, 'lg')}<div class="p-text"><h2 id="md-title">${esc(p.title)}</h2>
    <p class="m-pitch">${rich(p.pitch)}</p></div></div>
    ${p.stack?.length ? `<section><h3>Tech</h3>${chips(p.stack)}</section>` : ''}
    ${links ? `<div class="md-links">${links}</div>` : ''}
    </div><div class="md-text">
    ${p.description ? `<section><h3>Brief</h3><p>${rich(p.description)}</p></section>` : ''}
    ${arch.length ? `<section><h3>Approach</h3><ol class="arch">${arch.map((a) => `<li>${rich(a)}</li>`).join('')}</ol></section>` : ''}
    ${p.contribution ? `<section><h3>My contribution</h3><p>${rich(p.contribution)}</p></section>` : ''}
    ${results.length ? `<section><h3>Results</h3><ul class="results">${results.map((a) => `<li><b>${esc(a.title)}</b>${a.detail ? ` · ${rich(a.detail)}` : ''}</li>`).join('')}</ul></section>` : ''}
    </div></div>`;
}

// Official logo file per skill (public/assets/skills); anything missing gets a labelled symbol.
const SKILL_LOGOS = {
  python: 'python', java: 'java', javascript: 'javascript', typescript: 'typescript', html: 'html', css: 'css',
  react: 'react', 'next.js': 'nextjs', flask: 'flask', 'node.js': 'nodejs', 'tailwind css': 'tailwind',
  mysql: 'mysql', mongodb: 'mongodb', sqlite: 'sqlite', docker: 'docker', kubernetes: 'kubernetes',
  grafana: 'grafana', git: 'git', github: 'github', solidity: 'solidity', 'ethereum / ganache': 'ethereum',
  blender: 'blender', 'three.js': 'threejs',
};
const SKILL_SYMBOLS = {
  sql: 'SQL', falco: '[!]', 'audit-event monitoring': '[•]', 'ai-assisted prototyping': 'AI',
  'prompt engineering': '>_', reflect: 'RF', 'bugbug.io': 'BUG', c: 'C', 'c++': 'C++',
};

function skillSlot(item) {
  const key = norm(item);
  const learning = /\(learning\)/i.test(item);
  const label = item.replace(/\s*\(learning\)/i, '');
  const logo = SKILL_LOGOS[key];
  const icon = logo
    ? `<img src="assets/skills/${logo}.svg" alt="" width="40" height="40" loading="lazy">`
    : `<span class="sym" aria-hidden="true">${esc(SKILL_SYMBOLS[key] || label.slice(0, 2).toUpperCase())}</span>`;
  return `<li class="slot"><span class="slot-icon">${icon}${learning ? '<span class="learn">Learning</span>' : ''}</span><span class="slot-name">${esc(label)}</span></li>`;
}

function skillTree(c) {
  const groups = groupSkills(c);
  return section('skills', 'SKILL_TREE.CFG', 'SKILL TREE', `
    <p class="sub">The tools behind my work.</p>
    <div class="skill-tabs" role="tablist" aria-label="Skill categories">${groups.map((g, i) => `
      <button type="button" role="tab" class="skill-tab" id="st-t${i}" aria-controls="st-p${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(g.name)}</button>`).join('')}
    </div>
    ${groups.map((g, i) => `
      <div class="skill-panel" role="tabpanel" id="st-p${i}" aria-labelledby="st-t${i}"${i ? ' hidden' : ''}>
        <ul class="slots">${g.items.map(skillSlot).join('')}</ul>
      </div>`).join('')}`);
}

function wireSkillTabs() {
  const tabs = [...document.querySelectorAll('.skill-tab')];
  const show = (t) => tabs.forEach((x) => {
    const on = x === t;
    x.setAttribute('aria-selected', on);
    x.tabIndex = on ? 0 : -1;
    document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
  });
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const n = tabs[(i + d + tabs.length) % tabs.length];
      show(n); n.focus();
    });
  });
}

const EXP_TAGS = { hewlett: ['Kubernetes', 'Falco', 'Grafana'], 'sez us': ['Web & Mobile', 'Reflect', 'BugBug.io'], 'tce it association': ['Event Coordination', 'Technical Events', 'Cultural Events'], entrepreneurship: ['Entrepreneurship'] };
const tagsFor = (org) => Object.entries(EXP_TAGS).find(([k]) => norm(org).includes(k))?.[1] || [];
const ORG_LOGO_FIX = { 'assets/logos/career_logos/hpe.png': 'assets/logos/transparent/hpe.png', '/assets/logos/career_logos/hpe.png': 'assets/logos/transparent/hpe.png', '/assets/logos/tce.png': 'assets/logos/transparent/tce.png' };

function careerCard(e, kind) {
  const remote = /\(remote\)/i.test(e.org || '');
  const org = String(e.org || '').replace(/\s*\(remote\)/i, '');
  const logo = e.logo ? (ORG_LOGO_FIX[e.logo] || e.logo.replace(/^\//, '')) : '';
  const tags = tagsFor(e.org);
  return `
    <li class="career-item ${kind}">
      ${kind === 'exp' ? '<span class="tl-dot" aria-hidden="true"></span>' : ''}
      <article class="rc-card career-card">
        <span class="org-logo" aria-hidden="true">${logo ? `<img src="${esc(safeUrl(logo))}" alt="" loading="lazy" decoding="async">` : `<span class="sym">${esc(org.slice(0, 3).toUpperCase())}</span>`}</span>
        <div class="cc-body">
          <div class="row-head"><h3>${esc(e.role)}</h3>${e.period ? `<span class="date-badge">${esc(e.period)}</span>` : ''}</div>
          <p class="org"><span>${esc(org)}</span>${remote ? '<i class="remote-badge">Remote</i>' : ''}</p>
          <p class="cc-sum">${rich(e.summary)}</p>
          ${tags.length ? chips(tags, 'chips cc-tags') : ''}
          ${e.period || remote ? `<div class="cc-meta-m" aria-hidden="true">${e.period ? `<span class="date-badge">${esc(e.period)}</span>` : ''}${remote ? '<i class="remote-badge">Remote</i>' : ''}</div>` : ''}
        </div>
      </article>
    </li>`;
}

function careerLog(c) {
  const all = c.experience || [];
  if (!all.length) return '';
  const exp = all.filter((e) => e.period), lead = all.filter((e) => !e.period);
  return section('experience', 'career.log', 'Experience', `
    <p class="eyebrow">Professional journey</p>
    ${exp.length ? `<ol class="career timeline">${exp.map((e) => careerCard(e, 'exp')).join('')}</ol>` : ''}
    ${lead.length ? `<h3 class="sub-title">Campus Leadership</h3><ul class="career leadership">${lead.map((e) => careerCard(e, 'lead')).join('')}</ul>` : ''}`, 'career-section');
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
          ${a.detail ? `<p class="t-detail">${rich(a.detail)}</p>` : ''}
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
    <ul class="term">${rows}${resume ? `<li><span class="k">RESUME</span><a href="${esc(resume)}" target="_blank" rel="noopener">resume.pdf ↗</a></li>` : ''}</ul>
    <form class="contact-form" id="contact-form" name="contact" method="POST" action="/" novalidate>
      <div class="cf-bar"><span class="cf-dot" aria-hidden="true"></span>new_message.msg</div>
      <h3 class="cf-title">Send me a message</h3>
      <input type="hidden" name="form-name" value="contact">
      <p class="cf-hp" aria-hidden="true"><label>Leave this empty <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
      <div class="cf-grid">
        <label class="cf-row"><span>&gt; NAME</span><input name="name" type="text" required maxlength="100" autocomplete="name" placeholder="Your name"></label>
        <label class="cf-row"><span>&gt; EMAIL</span><input name="email" type="email" required maxlength="200" autocomplete="email" placeholder="you@example.com"></label>
      </div>
      <label class="cf-row"><span>&gt; MESSAGE</span><textarea name="message" rows="5" required maxlength="3000" placeholder="Tell me about your project, role or idea…"></textarea></label>
      <div class="cf-foot">
        <button type="submit" class="btn primary">▶ Send message</button>
        <p class="cf-status" id="cf-status" role="status" aria-live="polite"></p>
      </div>
    </form>`, 'terminal');
}

// 8x8 retro pixel icons for the project list (palette: navy / teal / sun / orange / cream)
const PX = { n: '#101F45', t: '#009fa9', y: '#FFE927', o: '#f2a93b', c: '#fff3d6', g: '#3fae5a', r: '#d9443f' };
const PROJECT_ICONS = {
  aratro: ['........', '..gg.gg.', '.gggggg.', '..gggg..', '...nn...', '...nn...', '.oooooo.', '........'],
  'microservices-security': ['.nnnnnn.', 'nttttttn', 'ntttyttn', 'ntttyttn', '.nttyytn', '.nttttn.', '..nttn..', '...nn...'],
  'tce-event-scheduler': ['nnnnnnnn', 'nttttttn', 'nccccccn', 'ncncncnn', 'nccccccn', 'ncncncyn', 'nccccccn', 'nnnnnnnn'],
  cauverysite: ['...oo...', '..oooo..', '.oooooo.', 'oooooooo', '.cccccc.', '.ccnncc.', '.ccnncc.', '.cccccc.'],
  'nathan-exe': ['nnnnnnnn', 'ntttttyn', 'ntcttttn', 'ntttcctn', 'nnnnnnnn', '...nn...', '..nnnn..', '........'],
  'hospital-management': ['..rrrr..', '..rrrr..', 'rrrrrrrr', 'rrrrrrrr', 'rrrrrrrr', 'rrrrrrrr', '..rrrr..', '..rrrr..'],
};
const FALLBACK_ICON = ['...yy...', '...yy...', 'yyyyyyyy', '.yyyyyy.', '..yyyy..', '.yy..yy.', '.y....y.', '........'];
function projectIcon(id) {
  const rows = PROJECT_ICONS[id] || FALLBACK_ICON;
  const rects = rows.flatMap((r, y) => [...r].map((ch, x) => (PX[ch] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${PX[ch]}"/>` : ''))).join('');
  return `<span class="q-ico" aria-hidden="true"><svg viewBox="0 0 8 8" shape-rendering="crispEdges">${rects}</svg></span>`;
}

// compact project list beside the journey (opens the same details dialog)
function missionList(sorted) {
  return `
    <section class="window section quick" aria-labelledby="quick-h">
      <div class="window-bar"><span class="flag" aria-hidden="true"></span><span class="title" id="quick-h">Projects</span></div>
      <ul class="quick-list">${sorted.map((p) => `
        <li><button type="button" data-details="${esc(p.id)}">
          ${logoBox(p)}
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
  document.title = `${p.name || 'Nathan'} · Player Archive`;
  document.getElementById('foot-name').textContent = `© ${new Date().getFullYear()} ${p.name || 'Nathan'}`;
  document.getElementById('side-name').textContent = (p.name || 'Nathan').toUpperCase();
  const resume = safeUrl(p.resumeUrl);
  if (resume) document.getElementById('side-resume').href = resume;

  const sorted = [...(c.projects || [])].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  const noticeEl = document.getElementById('notice');
  main.innerHTML = '';
  main.append(noticeEl);
  main.insertAdjacentHTML('beforeend', characterFile(c) + journey(c) + missions(c, sorted) + skillTree(c) + careerLog(c) + terminal(c));
  wireSkillTabs();
  wireContact();
  loadShots();
  main.removeAttribute('aria-busy');

  wireMissions(c);
  wireNavHighlight();
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
}

const dialog = document.getElementById('mission-dialog');
let lastOpener = null;
function openMission(c, id, opener) {
  const p = (c.projects || []).find((x) => x.id === id);
  if (!p) return;
  document.getElementById('md-body').innerHTML = missionDetails(c, p);
  document.getElementById('md-file').textContent = p.title;   // readable title, not the internal mission_<id>.log name
  showDialog(opener);
}
// background scroll lock + shared media cleanup for every way the dialog can be dismissed
let lockY = 0;
function showDialog(opener) {
  lastOpener = opener;
  if (!dialog.open) {
    lockY = window.scrollY;
    document.documentElement.classList.add('modal-lock');
    document.body.style.top = `-${lockY}px`;
  }
  document.getElementById('md-body').scrollTop = 0; dialog.scrollTop = 0;
  if (dialog.showModal) { if (!dialog.open) dialog.showModal(); } else dialog.setAttribute('open', '');
  document.getElementById('md-close').focus({ preventScroll: true });
}
function cleanupDialog() {
  const body = document.getElementById('md-body');
  body.querySelectorAll('video, audio').forEach((m) => { try { m.pause(); m.removeAttribute('src'); m.load(); } catch { /* ignore */ } });
  body.querySelectorAll('iframe').forEach((f) => { f.src = 'about:blank'; });
  body.innerHTML = '';
  document.documentElement.classList.remove('modal-lock');
  document.body.style.top = '';
  window.scrollTo({ top: lockY, left: 0, behavior: 'instant' });
}
dialog.addEventListener('close', () => { cleanupDialog(); lastOpener?.focus({ preventScroll: true }); });
window.addEventListener('pagehide', () => { if (dialog.open) dialog.close(); });
document.getElementById('md-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

function wireMissions(c) {
  main.addEventListener('click', (e) => {
    const chb = e.target.closest('[data-chapter]');
    if (chb) {
      document.getElementById('md-body').innerHTML = chb.parentElement.querySelector('.ch-body').innerHTML;
      document.getElementById('md-file').textContent = chb.closest('.jstop')?.querySelector('h3')?.textContent || 'Journey';
      showDialog(chb);
      return;
    }
    const b = e.target.closest('[data-details]');
    if (b) openMission(c, b.dataset.details, b);
  });
}


// Contact form: posts to the /api/contact serverless function (web/api/contact.js), which emails the message via Resend
function wireContact() {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const status = document.getElementById('cf-status');
  const btn = form.querySelector('button[type="submit"]');
  const say = (msg, kind) => { status.textContent = msg; status.dataset.kind = kind || ''; };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    btn.disabled = true; say('Sending…');
    try {
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      if (!res.ok) throw new Error(res.status);
      form.reset(); say('Message sent. Thanks, I will reply soon.', 'ok');
    } catch {
      say('Could not send. Please email nathanjerald293@gmail.com directly.', 'err');
    } finally { btn.disabled = false; }
  });
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
// phones: one compact header: the Menu button moves into the top bar next to Play
const siteHead = document.querySelector('.site-head'), sideId = document.querySelector('.side-id');
const mobileMQ = matchMedia('(max-width: 820px)');
function placeMenu() {
  if (mobileMQ.matches) siteHead.insertBefore(menuBtn, siteHead.querySelector('.play'));
  else sideId.append(menuBtn);
  if (!mobileMQ.matches) { menuBtn.setAttribute('aria-expanded', 'false'); sideNav.classList.remove('open'); }
}
mobileMQ.addEventListener('change', placeMenu);
menuBtn.addEventListener('click', () => {
  const open = menuBtn.getAttribute('aria-expanded') !== 'true';
  menuBtn.setAttribute('aria-expanded', String(open));
  sideNav.classList.toggle('open', open);
});
sideNav.addEventListener('click', (e) => {
  if (e.target.closest('a')) { menuBtn.setAttribute('aria-expanded', 'false'); sideNav.classList.remove('open'); }
});

const closeMenu = () => { menuBtn.setAttribute('aria-expanded', 'false'); sideNav.classList.remove('open'); };
document.addEventListener('click', (e) => { if (sideNav.classList.contains('open') && !e.target.closest('.side, #menu-btn')) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
placeMenu();
document.getElementById('portrait').src = portraitURL();
if (params.has('nowebgl')) notice("Your browser couldn't start the 3D version, so here's the classic portfolio.");

loadContent().then((c) => { render(c); initPortraitGlitch(); initTourInvite(); window.nxLoader?.page(); }).catch((err) => {
  console.error(err);
  main.innerHTML = '<p class="loading">Could not load portfolio content. Please refresh.</p>';
  window.nxLoader?.fail('Could not load the archive. Check your connection and try again.');
});

// click sound for every button/link on the portfolio page (drop a file at public/assets/sfx/click.mp3)
(() => {
  const SRC = '/assets/sfx/click.mp3';
  let ok = true;
  const a = new Audio(SRC); a.preload = 'auto'; a.volume = 0.6;
  a.addEventListener('error', () => { ok = false; });
  document.addEventListener('click', (e) => {
    if (!ok || !e.target.closest('button, a, summary, [role="button"], [role="tab"]')) return;
    try { const n = a.cloneNode(); n.volume = a.volume; n.play().catch(() => {}); } catch { /* ignore */ }
  }, true);
})();

// Journey link: land the panel directly under the navbar, then re-align once lazy images above it have settled
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href="#journey"]');
  const el = document.getElementById('journey');
  if (!a || !el) return;
  e.preventDefault();
  history.replaceState(null, '', '#journey');
  const go = () => {
    const head = document.querySelector('.site-head')?.getBoundingClientRect().height || 58;
    const gap = parseFloat(getComputedStyle(el).scrollMarginTop) || 16;
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - head - gap), behavior: 'instant' });
  };
  go();
  [120, 400, 900].forEach((ms) => setTimeout(go, ms));
});
