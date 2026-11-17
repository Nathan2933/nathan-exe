// "Nathan's portfolio is missing its final page. You're in it."
// Nathan speaks from the bottom-left (big pixel portrait + typed bubble), hands the visitor a pass,
// and each tour stop has a 10-20 second moment that stamps it. Three optional discoveries and a
// playful title end in a downloadable postcard. Portfolio content never depends on any of this.
import { drawPortrait } from './portrait.js';

const WELCOME_KEY = 'nathanexe:welcome:v1';
const PASS_KEY = 'nathanexe:pass:v1';

// ---------- storage: localStorage, then sessionStorage, then this tab's memory ----------
const mem = new Map();
function sget(k) {
  try { const v = localStorage.getItem(k); if (v !== null) return v; } catch { /* blocked */ }
  try { const v = sessionStorage.getItem(k); if (v !== null) return v; } catch { /* blocked */ }
  return mem.has(k) ? mem.get(k) : null;
}
function sset(k, v) {
  mem.set(k, v);
  try { localStorage.setItem(k, v); return; } catch { /* blocked */ }
  try { sessionStorage.setItem(k, v); } catch { /* blocked */ }
}

export const STAMPS = [
  { id: 'origin', district: 'lake-park', label: 'Origin', icon: '✎' },
  { id: 'memory', district: 'winter-campus', label: 'Memory', icon: '✉' },
  { id: 'campus', district: 'monsoon-campus', label: 'Campus', icon: '⌂' },
  { id: 'toolbox', district: 'signal-tower', label: 'Toolbox', icon: '⚒' },
  { id: 'builder', district: 'garage', label: 'Builder', icon: '⚙' },
];
export const DISCOVERIES = [
  { id: 'scooty', label: "Rode Guru's scooty" },
  { id: 'photo', label: "Posed for Shabesh's photo" },
  { id: 'project', label: 'Found the abandoned project' },
];

const blankPass = () => ({ stamps: [], found: [], tour: { index: -1, done: false }, picks: {} });
function loadPass() { try { return { ...blankPass(), ...JSON.parse(sget(PASS_KEY) || '{}') }; } catch { return blankPass(); } }

// ---------- expressions: small pixel patches over the base portrait ----------
const PATCH = {
  smile: [],
  grin: [['#ffffff', 13, 20, 6, 1], ['#7a3b3b', 12, 19, 8, 1]],
  oops: [['#7a3b3b', 14, 19, 4, 3], ['#2b2238', 15, 20, 2, 1]],
  think: [['#1e1b2e', 16, 9, 6, 1], ['#f2d3bd', 16, 11, 6, 1], ['#7a3b3b', 15, 19, 3, 1]],
  proud: [['#ffffff', 12, 20, 8, 1], ['#7a3b3b', 11, 19, 10, 1], ['#f0b9a8', 8, 17, 2, 1], ['#f0b9a8', 22, 17, 2, 1]],
};
function drawFace(canvas, face) {
  drawPortrait(canvas, null);
  const g = canvas.getContext('2d');
  for (const [c, x, y, w, h] of PATCH[face] || []) { g.fillStyle = c; g.fillRect(x, y, w, h); }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * ctx: { state, sfx, toast, tour, stops (TOUR_STOPS), touch }
 */
export function createNathanIntro(ctx) {
  const { state, sfx } = ctx;
  let pass = loadPass();
  const save = () => sset(PASS_KEY, JSON.stringify(pass));
  const reduce = () => state.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- DOM ----------
  const root = document.createElement('div');
  root.id = 'nathan-say'; root.className = 'ns hidden'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Nathan');
  root.innerHTML = `<div class="ns-dim"></div><div class="ns-wrap"><canvas class="ns-face" width="32" height="32" aria-hidden="true"></canvas>
    <div class="ns-bubble"><p class="ns-name">NATHAN</p><p class="ns-text" aria-live="polite"></p><div class="ns-widget"></div><div class="ns-acts"></div><p class="ns-hint"></p></div></div>`;
  document.body.append(root);
  const face = root.querySelector('.ns-face'), text = root.querySelector('.ns-text'), widget = root.querySelector('.ns-widget'), acts = root.querySelector('.ns-acts'), hint = root.querySelector('.ns-hint');

  const pill = document.createElement('button');
  pill.type = 'button'; pill.id = 'pass-pill'; pill.className = 'pass-pill hidden';
  document.body.append(pill);
  const card = document.createElement('div');
  card.id = 'pass-card'; card.className = 'pass-card hidden'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Visitor pass');
  document.body.append(card);

  // ---------- talking ----------
  let typing = null, full = '', pending = null, onEsc = null;
  function setFace(f) { drawFace(face, f); face.dataset.face = f; }
  function finishTyping() { if (typing) { clearInterval(typing); typing = null; } text.textContent = full; }
  function type(line) {
    full = line; finishTyping();
    if (reduce()) return;
    text.textContent = ''; let i = 0;
    typing = setInterval(() => { i += 2; text.textContent = full.slice(0, i); if (i % 6 === 0) sfx.talk?.(); if (i >= full.length) finishTyping(); }, 22);
  }
  function open() {
    if (!root.classList.contains('hidden')) return;
    root.classList.remove('hidden'); root.classList.toggle('still', reduce());
    state.nathanSays = true; document.body.classList.add('ns-on');
  }
  function close() {
    finishTyping(); root.classList.add('hidden'); widget.innerHTML = ''; acts.innerHTML = '';
    state.nathanSays = false; pending = null; onEsc = null; document.body.classList.remove('ns-on');
  }
  /** Show one line. Resolves with the chosen value: buttons give theirs, plain lines resolve 'next'. */
  function say(line, { face: f = 'smile', choices = null, widgetHtml = '', onWidget = null, esc: escVal = 'esc' } = {}) {
    open(); setFace(f); type(line);
    widget.innerHTML = widgetHtml; acts.innerHTML = '';
    hint.textContent = choices ? '' : widgetHtml ? 'Esc to skip' : `${ctx.touch ? 'Tap' : 'Click or press Space'} to continue · Esc to skip`;
    return new Promise((resolve) => {
      pending = (v) => { pending = null; resolve(v); };
      onEsc = () => pending?.(escVal);
      if (choices) acts.innerHTML = choices.map((c, i) => `<button type="button" class="ns-btn${i ? ' alt' : ''}" data-v="${esc(c.v)}">${esc(c.label)}</button>`).join('');
      if (onWidget) onWidget(widget, (v) => pending?.(v));
      setTimeout(() => (acts.querySelector('button') || widget.querySelector('button'))?.focus({ preventScroll: true }), 40);
    });
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('.ns-btn');
    if (b) { sfx.select?.(); return pending?.(b.dataset.v); }
    if (e.target.closest('.ns-widget')) return;
    if (typing) return finishTyping();
    if (!acts.children.length && !widget.querySelector('button')) pending?.('next');
  });
  addEventListener('keydown', (e) => {
    if (root.classList.contains('hidden')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onEsc?.(); return; }
    if (e.key === 'Tab') return;
    const native = e.target.closest?.('#nathan-say button');
    if ((e.key === ' ' || e.key === 'Enter') && !native) {
      e.preventDefault();
      if (typing) finishTyping(); else if (!acts.children.length && !widget.querySelector('button')) pending?.('next');
    }
    if (!native || !(e.key === ' ' || e.key === 'Enter')) e.stopImmediatePropagation();   // the game never moves behind Nathan
  }, true);

  async function lines(list) {
    for (const [l, f] of list) { if ((await say(l, { face: f })) === 'esc') return false; }
    return true;
  }

  // ---------- pass ----------
  // only memories that exist in the current content (old saves can hold ids from earlier versions)
  const memoriesFound = () => { const ids = new Set((state.content?.memories || []).map((m) => m.id)); return (state.save?.memories || []).filter((id) => ids.has(id)).length; };
  const memoriesTotal = () => (state.content?.memories || []).length;
  function progressLine() {
    const left = unexplored(), parts = [`${pass.stamps.length}/${STAMPS.length} stamps`, `${pass.found.length}/${DISCOVERIES.length} discoveries`];
    if (memoriesTotal()) parts.push(`${memoriesFound()}/${memoriesTotal()} memories`);
    parts.push(left ? `${left} ${left === 1 ? 'place' : 'places'} still unexplored` : 'every place visited');
    return parts.join(' · ');
  }
  const unexplored = () => {
    const all = (state.content?.chapters || []).map((c) => c.district).filter(Boolean);
    return all.filter((d) => !(state.save?.chapters || []).includes(d)).length;
  };
  function title() {
    const s = pass.stamps, f = pass.found, read = (state.save?.chapters || []).length, all = (state.content?.chapters || []).length;
    if (all && read >= all) return 'Read Every Card Somehow';
    if (s.includes('builder') && f.includes('project')) return 'Garage Regular';
    if (f.includes('scooty')) return 'Scenic Route Specialist';
    if (f.includes('photo')) return 'Island Photogenic';
    if (s.length >= STAMPS.length) return 'Island Local';
    if (s.length >= 3) return 'Frequent Visitor';
    return 'Curious Visitor';
  }
  const shown = () => sget(WELCOME_KEY) === 'seen' || pass.stamps.length || pass.tour.index >= 0;
  function renderPill() {
    pill.innerHTML = `<span class="pp-k">PASS</span><b>${pass.stamps.length}/${STAMPS.length}</b>`;
    pill.setAttribute('aria-label', `Visitor pass: ${pass.stamps.length} of ${STAMPS.length} stamps`);
    pill.classList.toggle('hidden', !shown() || !state.started || state.level !== 'island1');
  }
  function renderCard() {
    const stamp = (s) => `<li class="${pass.stamps.includes(s.id) ? 'on' : ''}"><span class="pc-ink">${s.icon}</span><small>${s.label}</small></li>`;
    const disc = (d) => `<li class="${pass.found.includes(d.id) ? 'on' : ''}">${pass.found.includes(d.id) ? '✓' : '·'} ${esc(pass.found.includes(d.id) ? d.label : '???')}</li>`;
    card.innerHTML = `<div class="pc-head"><span>VISITOR PASS</span><button type="button" class="pc-x" aria-label="Close pass">✕</button></div>
      <p class="pc-title">${esc(title())}</p>
      <ul class="pc-stamps">${STAMPS.map(stamp).join('')}</ul>
      <p class="pc-sub">Optional discoveries</p><ul class="pc-disc">${DISCOVERIES.map(disc).join('')}</ul>
      <p class="pc-prog">${progressLine()}</p>
      <div class="pc-acts"><button type="button" class="ns-btn" data-pc="postcard">Make my postcard</button></div>`;
  }
  function toggleCard(force) {
    const on = force ?? card.classList.contains('hidden');
    if (on) renderCard();
    card.classList.toggle('hidden', !on);
  }
  pill.addEventListener('click', () => toggleCard());
  card.addEventListener('click', (e) => {
    if (e.target.closest('.pc-x')) return toggleCard(false);
    if (e.target.closest('[data-pc="postcard"]')) postcard();
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !card.classList.contains('hidden')) { e.stopImmediatePropagation(); toggleCard(false); } }, true);

  function stamp(id) {
    if (pass.stamps.includes(id)) return false;
    pass.stamps.push(id); save(); renderPill();
    sfx.memory?.();
    pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
    ctx.toast?.(`Stamp collected: ${STAMPS.find((s) => s.id === id)?.label}`);
    return true;
  }
  function discover(id) {
    if (pass.found.includes(id)) return;
    pass.found.push(id); save(); renderPill();
    sfx.chapter?.();
    ctx.toast?.(`Discovery: ${DISCOVERIES.find((d) => d.id === id)?.label} · ${title()}`);
  }

  // ---------- the five stop moments ----------
  const pick = (opts, cls = '') => `<div class="ns-pick ${cls}">${opts.map((o) => `<button type="button" class="ns-tile" data-k="${esc(o.k)}"><span>${o.ic}</span><small>${esc(o.label)}</small></button>`).join('')}</div>`;
  const MOMENTS = {
    origin: async () => {
      const desk = [{ k: 'lunch', ic: '🍱', label: 'Lunchbox' }, { k: 'ruler', ic: '📏', label: 'Ruler' }, { k: 'note', ic: '📓', label: 'Notebook' }, { k: 'pencils', ic: '✏️', label: 'Pencil case' }];
      const v = await say('My old school desk. Somewhere in this mess is the notebook where I first doodled game ideas. Find it?', { face: 'think', widgetHtml: pick(desk), onWidget: (w, done) => w.addEventListener('click', (e) => {
        const t = e.target.closest('.ns-tile'); if (!t) return;
        if (t.dataset.k === 'note') { t.classList.add('right'); setTimeout(() => done('ok'), 350); } else { t.classList.add('wrong'); sfx.miss?.(); setTimeout(() => t.classList.remove('wrong'), 400); }
      }), esc: 'skip' });
      if (v !== 'ok') return false;
      await say('That one. Half maths, half level designs. Teachers were not impressed.', { face: 'grin' });
      return true;
    },
    memory: async () => {
      const cards = [{ k: 'snow', ic: '❄️', label: 'First snow' }, { k: 'tram', ic: '🚋', label: 'Night tram' }, { k: 'dorm', ic: '🪟', label: 'Dorm window' }];
      const v = await say('Tomsk sent me home with a pile of postcards. Pick one.', { face: 'smile', widgetHtml: pick(cards, 'post'), onWidget: (w, done) => w.addEventListener('click', (e) => { const t = e.target.closest('.ns-tile'); if (t) { t.classList.add('right'); setTimeout(() => done(t.dataset.k), 300); } }), esc: 'skip' });
      if (v === 'skip' || v === 'esc') return false;
      pass.picks.postcard = v; save();
      await say({ snow: 'Good pick. Nothing prepares you for the first real winter.', tram: 'Good pick. The night tram is where homesickness and new friends both start.', dorm: 'Good pick. That window saw a lot of late study nights.' }[v] || 'Good pick.', { face: 'grin' });
      return true;
    },
    campus: async () => {
      let next = 1;
      const parcels = [3, 1, 2].map((n) => ({ k: String(n), ic: '📦', label: `Parcel ${n}` }));
      const v = await say('Event day at TCE and the volunteers need supplies. Deliver parcels 1, 2, 3 in order.', { face: 'grin', widgetHtml: pick(parcels), onWidget: (w, done) => w.addEventListener('click', (e) => {
        const t = e.target.closest('.ns-tile'); if (!t || t.disabled) return;
        if (+t.dataset.k === next) { t.classList.add('right'); t.disabled = true; sfx.select?.(); next += 1; if (next > 3) setTimeout(() => done('ok'), 300); } else { t.classList.add('wrong'); sfx.miss?.(); setTimeout(() => t.classList.remove('wrong'), 400); }
      }), esc: 'skip' });
      if (v !== 'ok') return false;
      await say('Delivered. That is roughly what office-bearer life felt like, minus the running.', { face: 'proud' });
      return true;
    },
    toolbox: async () => {
      const all = (state.content?.skills || []).flatMap((g) => g.items || []).map((s) => String(s).replace(/\s*\(learning\)$/i, ''));
      const six = ['Python', 'React', 'Docker', 'Git', 'Kubernetes', 'JavaScript'].filter((s) => all.includes(s)).slice(0, 6);
      const v = await say('Quick test for you. Which of these have you used yourself?', { face: 'think', widgetHtml: `<div class="ns-pick chips">${six.map((s) => `<button type="button" class="ns-chip" data-k="${esc(s)}">${esc(s)}</button>`).join('')}</div>`, onWidget: (w, done) => w.addEventListener('click', (e) => { const t = e.target.closest('.ns-chip'); if (t) { t.classList.add('right'); setTimeout(() => done(t.dataset.k), 250); } }), esc: 'skip' });
      if (v === 'skip' || v === 'esc') return false;
      pass.picks.tech = v; save();
      await say(`${v}? Then we already have something to talk about.`, { face: 'grin' });
      return true;
    },
    builder: async () => {
      let power = 0;
      const v = await say('Every project here started as a broken demo. Power this one up: three presses.', { face: 'grin', widgetHtml: '<div class="ns-power"><div class="ns-bar"><i></i></div><button type="button" class="ns-btn" data-pow>Power ⚡</button></div>', onWidget: (w, done) => w.addEventListener('click', (e) => {
        if (!e.target.closest('[data-pow]')) return;
        power += 1; sfx.rep?.(); w.querySelector('.ns-bar i').style.width = `${Math.min(100, power * 34)}%`;
        if (power >= 3) { w.querySelector('[data-pow]').textContent = 'Demo online ✓'; w.querySelector('[data-pow]').disabled = true; setTimeout(() => done('ok'), 450); }
      }), esc: 'skip' });
      if (v !== 'ok') return false;
      await say('It runs. Do not ask how many times it did not.', { face: 'proud' });
      return true;
    },
  };
  let lastCard = null, chain = Promise.resolve();
  /** Moments queue up: one finishes (or is skipped) before the next one starts. */
  function runMoment(id) {
    chain = chain.then(async () => {
      if (pass.stamps.includes(id)) return;
      try { const ok = await MOMENTS[id](); if (ok) stamp(id); } finally { close(); }
    }).catch(() => {});
    return chain;
  }

  // ---------- opening ----------
  async function welcome() {
    if (!(await lines([
      ['You made it. Slight problem. I built an entire island instead of writing a normal introduction.', 'oops'],
    ]))) { sset(WELCOME_KEY, 'seen'); close(); renderPill(); return; }
    const v = await say(`Give me three minutes. You can judge that decision afterwards. ${ctx.touch ? 'Tap to walk, ◆ to interact.' : 'WASD to walk, E near a glow to interact.'}`, { face: 'grin', choices: [{ v: 'tour', label: 'Show me around' }, { v: 'free', label: "I'll explore" }], esc: 'free' });
    sset(WELCOME_KEY, 'seen');
    if (v === 'tour') {
      await say("Here's your visitor pass. It is blank. That is your job now.", { face: 'proud' });
      close(); renderPill(); pass.tour = { index: 0, done: false }; save(); ctx.tour.start(0);
    } else {
      await say('Fair. The pass is top right if you want stamps. The top menu has the resume if you are in a hurry.', { face: 'smile' });
      close(); renderPill();
    }
  }
  async function welcomeBack() {
    const v = await say(`Welcome back. You stopped at stop ${pass.tour.index + 1} of ${ctx.stops.length}. Continue the tour?`, { face: 'grin', choices: [{ v: 'go', label: 'Continue tour' }, { v: 'free', label: "I'll explore" }], esc: 'free' });
    close();
    if (v === 'go') ctx.tour.start(pass.tour.index);
  }
  function whenReady(busy) {
    const tick = () => {
      if (state.started && state.bootWarmed && state.intro >= 1 && !busy()) {
        renderPill();
        if (sget(WELCOME_KEY) !== 'seen') welcome();
        else if (pass.tour.index >= 0 && !pass.tour.done) welcomeBack();
      } else setTimeout(tick, 400);
    };
    setTimeout(tick, 800);
  }

  // ---------- game hooks ----------
  let wasTour = false, rideT = 0;
  return {
    whenReady,
    replay() { close(); welcome(); },
    stamp, discover, title,
    cardOpened(district) { lastCard = district; },
    cardClosed() {
      const s = STAMPS.find((x) => x.district === lastCard); lastCard = null;
      if (s && shown() && state.level === 'island1') setTimeout(() => runMoment(s.id), 250);
    },
    update(dt) {
      const t = ctx.tour;
      if (t.active && t.stop) { const i = ctx.stops.indexOf(t.stop); if (i >= 0 && i !== pass.tour.index) { pass.tour.index = i; save(); } }
      if (wasTour && !t.active && pass.tour.index === ctx.stops.length - 1 && !pass.tour.done) { pass.tour.done = true; save(); }
      wasTour = t.active;
      if (state.mount?.it?.vtype === 'scooty' && state.level === 'island1') { rideT += dt; if (rideT > 8) discover('scooty'); } else rideT = 0;
      if (!pill.classList.contains('hidden') !== (shown() && state.started && state.level === 'island1')) renderPill();
    },
    get open() { return !root.classList.contains('hidden'); },
  };

  // ---------- postcard ----------
  function postcard() {
    const W = 800, H = 500, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#12382D'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1D493B'; for (let y = 0; y < H; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < W; x += 8) g.fillRect(x, y, 2, 2);
    g.strokeStyle = '#E7C65A'; g.lineWidth = 6; g.strokeRect(10, 10, W - 20, H - 20);
    const p = document.createElement('canvas'); drawFace(p, 'proud');
    g.fillStyle = '#efe6d2'; g.fillRect(40, 90, 256, 256); g.drawImage(p, 40, 90, 256, 256);
    g.fillStyle = '#F3E9C8'; g.font = '22px "Press Start 2P", monospace'; g.fillText('GREETINGS FROM', 330, 80); g.fillText('ORIGIN ISLE', 330, 116);
    g.fillStyle = '#91C7AF'; g.font = '500 22px "Pixelify Sans", monospace'; g.fillText('Visitor title', 330, 170);
    g.fillStyle = '#E7C65A'; g.font = '600 26px "IBM Plex Mono", monospace'; g.fillText(title(), 330, 204);
    STAMPS.forEach((s, i) => {
      const x = 360 + i * 82, y = 280, on = pass.stamps.includes(s.id);
      g.strokeStyle = on ? '#E7C65A' : '#6F9783'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 32, 0, Math.PI * 2); g.stroke();
      g.fillStyle = on ? '#E7C65A' : '#6F9783'; g.font = '26px serif'; g.textAlign = 'center'; g.fillText(on ? s.icon : '?', x, y + 9);
      g.font = '500 14px "Pixelify Sans", monospace'; g.fillText(s.label, x, y + 54); g.textAlign = 'left';
    });
    g.fillStyle = '#ACC8B5'; g.font = '16px "IBM Plex Mono", monospace';
    g.fillText(`${pass.found.length}/${DISCOVERIES.length} discoveries · ${pass.stamps.length}/${STAMPS.length} stamps`, 330, 390);
    g.fillText(new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }), 40, 420);
    g.fillStyle = '#F3E9C8'; g.fillText('nathan.exe · the final page was you', 40, 460);
    const url = cv.toDataURL('image/png');
    card.querySelector('.pc-acts').innerHTML = `<img class="pc-shot" src="${url}" alt="Your Origin Isle postcard"><a class="ns-btn" href="${url}" download="nathan-exe-postcard.png">Download postcard</a>`;
    sfx.select?.();
  }
}
