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
