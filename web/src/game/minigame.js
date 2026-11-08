import { esc } from '../shared/content.js';
import { sfx } from './audio.js';

// Iron Yard "Lift" minigame: three reps. A marker sweeps across a bar; press
// E / Space / tap while it's inside the orange zone. Each good rep narrows the
// zone, mirroring progressive overload. Always skippable, never fails hard:
// a missed rep just retries. Completing it unlocks the transformation memory.

export function runLift(root, { title = 'Progressive overload', intro = '', onDone, onClose }) {
  const reps = 3;
  let rep = 0, pos = 0, dir = 1, raf = 0, last = performance.now(), lock = false, done = false;
  const zones = [[0.38, 0.62], [0.42, 0.58], [0.45, 0.55]];
  const speed = [0.9, 1.15, 1.4];

  root.innerHTML = `
    <div class="window-bar"><span class="title">iron-yard/lift.exe</span><button class="panel-close mg-x" aria-label="Close">✕</button></div>
    <div class="mg-body">
      <h2>${esc(title)}</h2>
      <p class="mg-intro">${esc(intro)}</p>
      <div class="mg-bar"><div class="mg-zone"></div><div class="mg-needle"></div></div>
      <div class="mg-reps">${Array.from({ length: reps }, () => '<i></i>').join('')}</div>
      <p class="mg-msg" aria-live="polite">Press <kbd>E</kbd> / <kbd>Space</kbd> or tap when the marker is in the zone.</p>
      <div class="mg-actions"><button class="btn primary mg-lift">Lift</button><button class="btn mg-skip">Skip</button></div>
    </div>`;
  root.classList.remove('hidden');
  const zoneEl = root.querySelector('.mg-zone'), needle = root.querySelector('.mg-needle'), msg = root.querySelector('.mg-msg');
  const setZone = () => { const [a, b] = zones[rep]; zoneEl.style.left = a * 100 + '%'; zoneEl.style.width = (b - a) * 100 + '%'; };
  setZone();

  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!lock) {
      pos += dir * dt * speed[rep];
      if (pos > 1) { pos = 1; dir = -1; } else if (pos < 0) { pos = 0; dir = 1; }
      needle.style.left = pos * 100 + '%';
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const attempt = () => {
    if (lock || done) return;
    const [a, b] = zones[rep];
    lock = true;
    if (pos >= a && pos <= b) {
      root.querySelectorAll('.mg-reps i')[rep].classList.add('ok');
      sfx.rep();
      rep++;
      msg.textContent = ['Clean rep. Add weight.', 'Good. Heavier now.', 'Done.'][rep - 1];
      if (rep >= reps) { done = true; setTimeout(() => finish(true), 500); return; }
      setTimeout(() => { setZone(); lock = false; }, 450);
    } else {
      msg.textContent = 'Missed the groove. Reset and go again.';
      sfx.miss();
      root.querySelector('.mg-bar').classList.add('shake');
      setTimeout(() => { root.querySelector('.mg-bar').classList.remove('shake'); lock = false; }, 450);
    }
  };
  const key = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    else if (e.key === ' ' || e.key === 'e' || e.key === 'E' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); attempt(); }
  };
  window.addEventListener('keydown', key, true);
  root.querySelector('.mg-lift').addEventListener('click', attempt);
  root.querySelector('.mg-bar').addEventListener('pointerdown', attempt);
  root.querySelector('.mg-skip').addEventListener('click', () => finish(true, true));
  root.querySelector('.mg-x').addEventListener('click', () => finish(false));

  function finish(success, skipped = false) {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', key, true);
    root.classList.add('hidden');
    root.innerHTML = '';
    if (success) onDone?.({ skipped }); else onClose?.();
  }
  return { close: () => finish(false) };
}

// Iron Yard "Tempo" minigame: a rep-rhythm set. Eight plates slide along a
// lane toward the bar line in a steady 2-1 lifting tempo; press E / Space /
// tap as each plate crosses the line. Land 6 of 8 to finish the set; a short
// set just restarts. Always skippable.
export function runTempo(root, { title = 'Tempo set', intro = '', onDone, onClose }) {
  const beats = [0, 0.75, 1.5, 2.25, 3.0, 3.375, 3.75, 4.5]; // seconds; the double-time pair is the "pause rep"
  const LEAD = 1.6, WIN = 0.16, NEED = 6;
  let t0 = 0, raf = 0, done = false, hits, judged;
  root.innerHTML = `
    <div class="window-bar"><span class="title">iron-yard/tempo.exe</span><button class="panel-close mg-x" aria-label="Close">✕</button></div>
    <div class="mg-body">
      <h2>${esc(title)}</h2>
      <p class="mg-intro">${esc(intro)}</p>
      <div class="mg-bar mg-lane"><div class="mg-line"></div></div>
      <div class="mg-reps">${beats.map(() => '<i></i>').join('')}</div>
      <p class="mg-msg" aria-live="polite">Press <kbd>E</kbd> / <kbd>Space</kbd> or tap as each plate hits the line.</p>
      <div class="mg-actions"><button class="btn primary mg-lift">Rep</button><button class="btn mg-skip">Skip</button></div>
    </div>`;
  root.classList.remove('hidden');
  const lane = root.querySelector('.mg-lane'), msg = root.querySelector('.mg-msg'), pips = root.querySelectorAll('.mg-reps i');
  const plates = beats.map(() => { const p = document.createElement('b'); p.className = 'mg-plate'; lane.appendChild(p); return p; });
  const LINE = 0.12; // bar line position across the lane

  const start = () => {
    hits = 0; judged = beats.map(() => false);
    pips.forEach((p) => p.classList.remove('ok', 'bad'));
    plates.forEach((p) => p.classList.remove('hit', 'gone'));
    t0 = performance.now() / 1000 + 0.8;
  };
  const now = () => performance.now() / 1000 - t0;
  const frame = () => {
    const t = now();
    beats.forEach((b, i) => {
      const x = LINE + (b - t) / LEAD * (1 - LINE);
      plates[i].style.left = Math.max(-0.1, Math.min(1.05, x)) * 100 + '%';
      if (!judged[i] && t > b + WIN) { judged[i] = true; pips[i].classList.add('bad'); plates[i].classList.add('gone'); sfx.miss(); }
    });
    if (!done && judged.every(Boolean)) {
      if (hits >= NEED) { done = true; msg.textContent = `${hits}/8 on tempo. Set complete.`; setTimeout(() => finish(true), 700); }
      else { msg.textContent = `${hits}/8 on tempo. Need ${NEED}. Rest, then go again.`; start(); }
    }
    raf = requestAnimationFrame(frame);
  };
  const attempt = () => {
    if (done) return;
    const t = now();
    let best = -1;
    beats.forEach((b, i) => { if (!judged[i] && Math.abs(b - t) <= WIN && (best < 0 || Math.abs(b - t) < Math.abs(beats[best] - t))) best = i; });
    if (best < 0) { msg.textContent = 'Off beat. Breathe and wait for the plate.'; lane.classList.add('shake'); setTimeout(() => lane.classList.remove('shake'), 300); return; }
    judged[best] = true; hits++;
    pips[best].classList.add('ok'); plates[best].classList.add('hit'); sfx.rep();
    msg.textContent = best === 4 || best === 5 ? 'Pause rep. Nice control.' : ['Up.', 'Smooth.', 'Drive.', 'On tempo.'][hits % 4];
  };
  const key = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    else if (e.key === ' ' || e.key === 'e' || e.key === 'E' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) attempt(); }
  };
  window.addEventListener('keydown', key, true);
  root.querySelector('.mg-lift').addEventListener('click', attempt);
  lane.addEventListener('pointerdown', attempt);
  root.querySelector('.mg-skip').addEventListener('click', () => finish(true, true));
  root.querySelector('.mg-x').addEventListener('click', () => finish(false));
  start();
  raf = requestAnimationFrame(frame);

  function finish(success, skipped = false) {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', key, true);
    root.classList.add('hidden');
    root.innerHTML = '';
    if (success) onDone?.({ skipped, hits }); else onClose?.();
  }
  return { close: () => finish(false) };
}
