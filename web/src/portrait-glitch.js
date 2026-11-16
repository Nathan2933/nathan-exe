// Spider-Verse-style glitch for the Character File portrait.
// Burst (~520ms): anticipation jitter -> strong glitch -> offset afterimage -> clean snap back.
// Triggered by hover / tap, plus an idle burst every 8-12s. Never overlaps. Sound is a short
// synthesised crackle + bass hit, only after the visitor has interacted and only if not muted.

const LOOK_KEY = 'nathan-exe:look';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const isMuted = () => { try { return JSON.parse(localStorage.getItem(LOOK_KEY) || '{}').sound === false; } catch { return false; } };

let actx = null, interacted = false;
const unlock = () => {
  interacted = true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !actx) actx = new AC();
    actx?.resume();
  } catch { /* audio is optional */ }
};
['pointerdown', 'keydown', 'touchstart'].forEach((t) => addEventListener(t, unlock, { once: true, passive: true }));

function playGlitch() {
  if (!interacted || !actx || isMuted() || actx.state !== 'running') return;
  const t0 = actx.currentTime + 0.08; // lines up with the strong burst
  const out = actx.createGain(); out.gain.value = 0.5; out.connect(actx.destination);
  // digital crackle: stuttered noise through a highpass
  const len = Math.floor(actx.sampleRate * 0.24), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const gate = Math.floor(i / (actx.sampleRate * 0.022)) % 2 === 0 ? 1 : 0.15; // stutter
    d[i] = (Math.random() * 2 - 1) * gate * (1 - i / len);
  }
  const n = actx.createBufferSource(); n.buffer = buf;
  const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
  const ng = actx.createGain(); ng.gain.value = 0.1;
  n.connect(hp).connect(ng).connect(out); n.start(t0);
  // subtle bass hit
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(95, t0); o.frequency.exponentialRampToValueAtTime(42, t0 + 0.2);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.28, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
  o.connect(g).connect(out); o.start(t0); o.stop(t0 + 0.26);
}

export function initPortraitGlitch() {
  const img = document.querySelector('#about .hero-portrait');
  const grid = img?.parentElement;
  if (!img || !grid || img.dataset.glitch) return;
  img.dataset.glitch = '1';

  // overlay locked to the portrait rect; overflow hidden keeps every effect inside it
  const box = document.createElement('div');
  box.className = 'pg-box'; box.setAttribute('aria-hidden', 'true');
  const layer = (cls, clip) => {
    const i = document.createElement('img');
    i.src = img.currentSrc || img.src; i.alt = ''; i.className = `pg-l ${cls}`;
    if (clip) i.style.clipPath = clip;
    box.appendChild(i); return i;
  };
  const after = layer('pg-after');
  const mag = layer('pg-mag');
  const cy = layer('pg-cy');
  const slices = [layer('pg-s', 'inset(14% 0 66% 0)'), layer('pg-s', 'inset(44% 0 38% 0)'), layer('pg-s', 'inset(72% 0 12% 0)')];
  grid.appendChild(box);

  const place = () => {
    box.style.cssText = `left:${img.offsetLeft}px;top:${img.offsetTop}px;width:${img.offsetWidth}px;height:${img.offsetHeight}px`;
  };
  let busy = false, timer = 0;
  const steps = 'steps(1, end)';
  const run = (el, kf, dur) => el.animate(kf.map((k) => ({ ...k, easing: steps })), { duration: dur, easing: 'linear', fill: 'none' });

  let left = 0; // bursts remaining in the current episode
  function burst(e) {
    const episode = left > 0 && e === 'next';
    if (busy || document.hidden) return;
    busy = true; clearTimeout(timer); place();
    box.classList.add('on');
    if (reduced.matches) { // subtle, silent: a brief soft tint flash
      const a = cy.animate([{ opacity: 0 }, { opacity: .35 }, { opacity: 0 }], { duration: 320, easing: 'ease-out' });
      a.onfinish = done; return;
    }
    const T = 520;
    // anticipation jitter on the real portrait (0-80ms), then everything snaps back to rest
    run(img, [{ transform: 'translate(0,0)' }, { transform: 'translate(-1px,0)', offset: .04 }, { transform: 'translate(1px,1px)', offset: .08 },
      { transform: 'translate(-1px,0)', offset: .12 }, { transform: 'translate(0,0)', offset: .16 }, { transform: 'translate(0,0)' }], T);
    // channel separation: strongest 80-300ms, then it settles
    const sep = (x, y) => ({ opacity: .85, transform: `translate(${x}px,${y}px)` });
    run(cy, [{ opacity: 0 }, { ...sep(0, 0), opacity: 0, offset: .15 }, { ...sep(10, 0), offset: .17 }, { ...sep(-7, 2), offset: .3 }, { ...sep(12, -2), offset: .42 },
      { ...sep(5, 0), offset: .52 }, { opacity: 0, offset: .6 }, { opacity: 0 }], T);
    run(mag, [{ opacity: 0 }, { opacity: 0, offset: .15 }, { ...sep(-10, 0), offset: .17 }, { ...sep(8, -2), offset: .3 }, { ...sep(-12, 2), offset: .42 },
      { ...sep(-5, 0), offset: .52 }, { opacity: 0, offset: .6 }, { opacity: 0 }], T);
    // displaced horizontal slices
    const dx = [[0, 18, -14, 20, 0], [0, -22, 16, -12, 0], [0, 14, -18, 24, 0]];
    slices.forEach((s, k) => run(s, [
      { opacity: 0, transform: 'translateX(0)' },
      { opacity: 1, transform: `translateX(${dx[k][1]}px)`, offset: .17 },
      { opacity: 1, transform: `translateX(${dx[k][2]}px)`, offset: .3 },
      { opacity: 1, transform: `translateX(${dx[k][3]}px)`, offset: .42 },
      { opacity: 0, transform: 'translateX(0)', offset: .5 }, { opacity: 0 }], T));
    // offset comic-print afterimage (fades out 300-520ms)
    run(after, [{ opacity: 0 }, { opacity: 0, offset: .5 }, { opacity: .45, transform: 'translate(6px,5px)', offset: .52 },
      { opacity: .3, transform: 'translate(5px,4px)', offset: .72 }, { opacity: .15, transform: 'translate(4px,3px)', offset: .86 }, { opacity: 0 }], T);
    playGlitch();
    setTimeout(done, T + 20);
  }
  function done() {
    box.classList.remove('on'); busy = false;
    if (left > 0) { left--; clearTimeout(timer); timer = setTimeout(() => burst('next'), 260); } else schedule();
  }
  // one single burst, then quiet for 9-13s
  function episode() { if (busy || document.hidden) { schedule(); return; } left = 0; burst('next'); }
  function schedule() { clearTimeout(timer); timer = setTimeout(episode, 9000 + Math.random() * 4000); }

  img.addEventListener('pointerenter', burst);
  img.addEventListener('pointerdown', burst);
  img.addEventListener('touchstart', burst, { passive: true });
  img.style.touchAction = 'manipulation'; img.style.webkitTapHighlightColor = 'transparent';
  addEventListener('resize', place);
  timer = setTimeout(episode, 1800); // first burst shortly after load so phones see it right away
}
