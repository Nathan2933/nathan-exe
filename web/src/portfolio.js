import { loadContent, esc, safeUrl, projectCard, DISTRICTS, chapterFor } from './shared/content.js';

const main = document.getElementById('main');
const params = new URLSearchParams(location.search);
if (params.has('nowebgl')) notice("Your browser couldn't start the 3D version, so here's the classic portfolio.");

function notice(msg) {
  const n = document.getElementById('notice');
  n.textContent = msg;
  n.classList.remove('hidden');
}

function section(id, title, body, file) {
  return `
    <section id="${id}" class="window section">
      <div class="window-bar"><span class="dots"><i></i><i></i><i></i></span><span class="title">${esc(file)}</span></div>
      <div class="section-body"><h2>${esc(title)}</h2>${body}</div>
    </section>`;
}

function render(c) {
  const p = c.profile || {};
  document.title = `${p.name || 'Nathan'} — Portfolio`;
  document.getElementById('foot-name').textContent = `© ${new Date().getFullYear()} ${p.name || 'Nathan'}`;
  const links = c.links || [];
  const resume = safeUrl(p.resumeUrl);

  const hero = `
    <section class="hero">
      ${p.photo ? `<img class="avatar" src="${esc(safeUrl(p.photo))}" alt="${esc(p.name)}">` : '<div class="avatar avatar-ph" aria-hidden="true">N.</div>'}
      <div>
        <p class="kicker">${esc(p.availability || '')}</p>
        <h1>${esc(p.name)}</h1>
        <p class="role">${esc(p.role)}${p.location ? ` · ${esc(p.location)}` : ''}</p>
        <p class="summary">${esc(p.summary)}</p>
        <div class="hero-actions">
          ${resume ? `<a class="btn primary" href="${esc(resume)}" target="_blank" rel="noopener">Resume ↗</a>` : ''}
          <a class="btn" href="#projects">Projects</a>
          <a class="btn" href="#contact">Contact</a>
        </div>
      </div>
    </section>`;

  const about = section('about', 'About', `
    ${(p.about || []).map((t) => `<p>${esc(t)}</p>`).join('')}
    <ol class="timeline">
      ${DISTRICTS.map((d) => chapterFor(c, d.id)).filter((ch) => ch && !['garage', 'signal-tower'].includes(ch.district)).map((ch) => `
        <li>
          <div class="tl-head"><h3>${esc(ch.title)}</h3><span>${esc(ch.period || '')}</span></div>
          ${ch.subtitle ? `<p class="tl-sub">${esc(ch.subtitle)}</p>` : ''}
          ${(ch.body || []).map((t) => `<p>${esc(t)}</p>`).join('')}
          ${ch.highlights?.length ? `<ul class="chips">${ch.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
        </li>`).join('')}
    </ol>`, 'about.txt');

  const sorted = [...(c.projects || [])].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  const projects = section('projects', 'Projects', `<div class="grid">${sorted.map(projectCard).join('')}</div>`, 'projects/');

  const skills = section('skills', 'Skills', `
    <div class="skills">${(c.skills || []).map((g) => `
      <div><h3>${esc(g.group)}</h3><ul class="chips">${(g.items || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>`).join('')}
    </div>`, 'skills.cfg');

  const exp = (c.experience || []).length || (c.achievements || []).length ? section('experience', 'Experience & achievements', `
    <ul class="rows">${(c.experience || []).map((e) => `
      <li><div class="row-head"><h3>${esc(e.role)} · ${esc(e.org)}</h3><span>${esc(e.period)}</span></div><p>${esc(e.summary)}</p></li>`).join('')}
    ${(c.achievements || []).map((a) => `
      <li><div class="row-head"><h3>🏆 ${esc(a.title)}${a.org ? ` · ${esc(a.org)}` : ''}</h3><span>${esc(a.year)}</span></div>${a.detail ? `<p>${esc(a.detail)}</p>` : ''}</li>`).join('')}
    </ul>`, 'log.txt') : '';

  const contact = section('contact', 'Contact', `
    <p>${esc(chapterFor(c, 'lighthouse')?.body?.[0] || "Let's talk.")}</p>
    <div class="hero-actions">
      ${links.map((l, i) => `<a class="btn${i === 0 ? ' primary' : ''}" href="${esc(safeUrl(l.url))}" ${l.url.startsWith('mailto:') ? '' : 'target="_blank" rel="noopener"'}>${esc(l.label)}</a>`).join('')}
      ${resume ? `<a class="btn" href="${esc(resume)}" target="_blank" rel="noopener">Resume ↗</a>` : ''}
    </div>`, 'contact.exe');

  main.innerHTML = hero + about + projects + skills + exp + contact;
  main.removeAttribute('aria-busy');
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
}

loadContent().then(render).catch((err) => {
  console.error(err);
  main.innerHTML = '<p class="loading">Could not load portfolio content. Please refresh.</p>';
});
