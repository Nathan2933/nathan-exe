// Nathan coaches the controls from the bottom-left. No walls of text: each step shows the keys,
// and every key glows as the visitor presses it. On touch screens the real joystick and buttons glow.
// The game stays live underneath so people learn by doing. Shown once per browser ("Controls" replays it).
import { drawPortrait } from './portrait.js';

const WELCOME_KEY = 'nathanexe:welcome:v1';
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

// expressions: small pixel patches over the base portrait
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

// keyboard steps: keys shown as caps; `done(st)` decides when the step is complete
const KEY_STEPS = [
  { face: 'grin', line: 'Hey, I am Nathan. Walk me around.', keys: ['W', 'A', 'S', 'D'], done: (st) => st.walked > 4 },
  { face: 'proud', line: 'Hold Shift while walking to run.', keys: ['Shift'], done: (st) => st.ran > 1.2 },
  { face: 'oops', line: 'Jump!', keys: ['Space'], done: (st) => st.hit.has('Space') },
  { face: 'think', line: 'See a glowing circle? Walk onto it and press E, or just click the circle. That opens my story.', keys: ['E', 'Click'], done: (st) => st.hit.has('E') || st.opened },
  { face: 'smile', line: 'M opens the map. H shows every control.', keys: ['M', 'H'], done: (st) => st.hit.has('M') || st.hit.has('H') },
];
const TOUCH_STEPS = [
  { face: 'grin', line: 'Hey, I am Nathan. Drag the stick to walk me around.', glow: '#tc-stick', done: (st) => st.walked > 4 },
  { face: 'oops', line: 'Tap Jump!', glow: '#tc-jump', done: (st) => st.hit.has('tap:tc-jump') },
  { face: 'think', line: 'See a glowing circle? Walk onto it and tap USE, or just tap the circle. That opens my story.', glow: '#tc-act', done: (st) => st.hit.has('tap:tc-act') || st.opened },
];
const CAP_OF = { w: 'W', a: 'A', s: 'S', d: 'D', arrowup: 'W', arrowleft: 'A', arrowdown: 'S', arrowright: 'D', shift: 'Shift', ' ': 'Space', e: 'E', m: 'M', h: 'H' };

/** ctx: { state, sfx, getPos: () => {x,z}, touch: () => boolean } */
export function createNathanIntro(ctx) {
  const { state, sfx } = ctx;
  const root = document.createElement('div');
  root.id = 'nathan-coach'; root.className = 'nc hidden'; root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
  root.innerHTML = `<canvas class="nc-face" width="32" height="32" aria-hidden="true"></canvas>
    <div class="nc-bubble"><p class="nc-name">NATHAN</p><p class="nc-text"></p><div class="nc-keys"></div><button type="button" class="nc-skip">Skip</button></div>`;
  document.body.append(root);
  const face = root.querySelector('.nc-face'), text = root.querySelector('.nc-text'), keysEl = root.querySelector('.nc-keys');

  let steps = null, i = -1, st = null, last = null, glowEl = null, active = false, endT = 0, firstVisit = false;
  const reduce = () => state.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const capOf = (key) => CAP_OF[String(key).toLowerCase()] || CAP_OF[key];

  function show(n) {
    i = n; const s = steps[i];
    drawFace(face, s.face);
    text.textContent = s.line;
    keysEl.innerHTML = (s.keys || []).map((k) => `<kbd class="nc-cap${k.length > 1 ? ' wide' : ''}" data-cap="${k}">${k}</kbd>`).join('');
    glowEl?.classList.remove('nc-glow');
    glowEl = s.glow ? document.querySelector(s.glow) : null;
    glowEl?.classList.add('nc-glow');
    root.classList.remove('pop'); void root.offsetWidth; if (!reduce()) root.classList.add('pop');
  }
  function start() {
    steps = ctx.touch() ? TOUCH_STEPS : KEY_STEPS;
    st = { walked: 0, ran: 0, hit: new Set() }; last = null; endT = 0;
    active = true; root.classList.remove('hidden', 'done'); document.body.classList.add('nc-on');
    show(0);
  }
  function stop() {
    if (active && endT <= 0 && firstVisit) { firstVisit = false; setTimeout(() => ctx.onFirstDone?.(), 300); }   // skipped: still offer the tour
    active = false; root.classList.add('hidden'); document.body.classList.remove('nc-on');
    glowEl?.classList.remove('nc-glow'); glowEl = null;
    sset(WELCOME_KEY, 'seen');
  }
  function finish() {
    glowEl?.classList.remove('nc-glow'); glowEl = null;
    drawFace(face, 'proud'); text.textContent = firstVisit ? "That's everything. Now let me show you around: five quick stops." : "That's everything. Go explore, the island is yours."; keysEl.innerHTML = '';
    root.classList.add('done'); sfx.chapter?.(); endT = 3.2;
    sset(WELCOME_KEY, 'seen');
  }

  function press(cap, down) {
    if (!active) return;
    const el = keysEl.querySelector(`[data-cap="${cap}"]`);
    if (!el) return;
    el.classList.toggle('lit', down);
    if (down && !el.classList.contains('used')) { el.classList.add('used'); sfx.select?.(); }
  }
  // listen only: the game still receives every key, so the visitor practises for real
  addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.key === 'Escape' && !document.querySelector('#panel:not(.hidden), #bigmap:not(.hidden), #controls:not(.hidden)')) { stop(); return; }
    const cap = capOf(e.key); if (!cap) return;
    st.hit.add(cap); press(cap, true);
  }, true);
  addEventListener('keyup', (e) => { const cap = capOf(e.key); if (cap) press(cap, false); }, true);
  addEventListener('pointerdown', (e) => { if (!active) return; const b = e.target.closest?.('#tc-jump, #tc-act'); if (b) st.hit.add(`tap:${b.id}`); if (e.target.tagName === 'CANVAS') press('Click', true); }, true);
  addEventListener('pointerup', () => { if (active) press('Click', false); }, true);
  root.querySelector('.nc-skip').addEventListener('click', stop);

  return {
    /** First visit only: wait until the game is playable, then start coaching. */
    whenReady(busy) {
      if (sget(WELCOME_KEY) === 'seen') return;
      const tick = () => { if (state.started && state.bootWarmed && state.intro >= 1 && !busy()) { firstVisit = true; start(); } else setTimeout(tick, 400); };
      setTimeout(tick, 800);
    },
    replay() { start(); },
    update(dt) {
      if (!active) return;
      if (endT > 0) { endT -= dt; if (endT <= 0) { stop(); if (firstVisit) { firstVisit = false; ctx.onFirstDone?.(); } } return; }
      if (state.panelOpen) st.opened = true;
      const p = ctx.getPos();
      if (p && last) {
        const d = Math.hypot(p.x - last.x, p.z - last.z);
        if (d < 2) { st.walked += d; if (d > 0 && keysEl.querySelector('[data-cap="Shift"].lit')) st.ran += dt; }
      }
      last = p ? { x: p.x, z: p.z } : null;
      root.classList.toggle('away', !!state.panelOpen);   // a card hides the coach; it carries on afterwards
      if (steps[i].done(st)) { sfx.memory?.(); if (i + 1 < steps.length) show(i + 1); else finish(); }
    },
    get active() { return active; },
  };
}
