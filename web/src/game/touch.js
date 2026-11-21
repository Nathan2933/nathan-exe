/**
 * On-screen touch controls: a floating-feel joystick (walk/run) plus Interact and Jump buttons.
 * They drive the same `keys` set and keyboard handlers the desktop controls use, so no game logic is
 * duplicated. Shown on touch devices (or with ?touch=1); desktop keyboard/mouse is untouched.
 */
/** Live joystick state read by the movement loop: x right, y up, mag 0..1 (dead zone removed). */
export const touchInput = { x: 0, y: 0, mag: 0, run: false, active: false };

export function initTouchControls(keys) {
  // Re-evaluated live: the primary pointer can change at runtime (DevTools device mode, tablet/laptop
  // convertibles), so the controls follow it instead of sticking with whatever was true at page load.
  // `'ontouchstart' in window` is deliberately not used — touchscreen laptops with a mouse report it too.
  const forced = /[?&]touch=1/.test(location.search);
  const coarse = matchMedia('(pointer: coarse)');

  const root = document.createElement('div');
  root.className = 'touch-ui';
  root.innerHTML = `
    <div class="tc-stick" id="tc-stick" aria-label="Move" role="application"><i class="tc-knob"></i></div>
    <div class="tc-btns">
      <button type="button" class="tc-btn" id="tc-jump" aria-label="Jump">Jump</button>
      <button type="button" class="tc-btn tc-act" id="tc-act" aria-label="Interact">USE</button>
    </div>`;
  document.body.append(root);
  const sync = () => {
    const on = forced || coarse.matches;
    document.body.classList.toggle('touch-ui-on', on);
    if (!on) { touchInput.x = touchInput.y = touchInput.mag = 0; touchInput.run = touchInput.active = false; }
  };
  sync();
  coarse.addEventListener('change', sync);

  const press = (k) => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); };
  const release = (k) => { document.body.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })); };

  // ---- joystick ----
  // Pointer Events + pointer capture; publishes a continuous analog vector (touchInput) that the movement
  // loop reads every frame, so nothing depends on synthetic key events or anything clearing `keys`.
  const stick = root.querySelector('#tc-stick'), knob = root.querySelector('.tc-knob');
  stick.style.touchAction = 'none';
  let pid = null, cx = 0, cy = 0, R = 40;
  const DEAD = 0.12;
  const setVec = (x, y, run) => {
    touchInput.x = x; touchInput.y = y; touchInput.mag = Math.hypot(x, y);
    touchInput.run = run; touchInput.active = touchInput.mag > 0;
  };
  const reset = () => {
    if (pid !== null) { try { stick.releasePointerCapture(pid); } catch {} }
    pid = null; knob.style.transform = ''; stick.classList.remove('on'); setVec(0, 0, false);
  };
  const move = (e) => {
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    const kd = Math.min(d, R);                       // knob clamped to the rim, finger may roam beyond
    const ux = d ? dx / d : 0, uy = d ? dy / d : 0;
    knob.style.transform = `translate(${ux * kd}px, ${uy * kd}px)`;
    let m = Math.min(1, d / R);
    if (m < DEAD) { setVec(0, 0, false); return; }
    m = (m - DEAD) / (1 - DEAD);                     // rescale so output starts from 0 past the dead zone
    setVec(ux * m, -uy * m, d > R * 0.92);           // screen-up = +y; length <= 1 so diagonals aren't faster
  };
  stick.addEventListener('pointerdown', (e) => {
    if (pid !== null) return;
    pid = e.pointerId; try { stick.setPointerCapture(pid); } catch {} stick.classList.add('on');
    const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; R = r.width * 0.36;
    e.preventDefault(); move(e);
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === pid) { e.preventDefault(); move(e); } });
  const end = (e) => { if (e.pointerId === pid) reset(); };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
  stick.addEventListener('lostpointercapture', end);
  stick.addEventListener('contextmenu', (e) => e.preventDefault());
  // belt and braces for browsers that ignore touch-action: the page never scrolls or zooms under the stick
  stick.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  // never leave the character walking: a cancelled touch, a lost window, or the controls being hidden
  window.addEventListener('blur', reset);
  window.addEventListener('pagehide', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  if ('ResizeObserver' in window) new ResizeObserver(() => { if (pid !== null && !stick.getClientRects().length) reset(); }).observe(stick);

  // Prevent touch control events from leaking into the 3D scene canvas underneath
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.addEventListener('pointerup', (e) => e.stopPropagation());
  root.addEventListener('click', (e) => e.stopPropagation());

  // ---- action buttons (hold-aware so Jump can be held like Space) ----
  const bind = (id, key) => {
    const b = root.querySelector(id);
    let id_ = null;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      id_ = e.pointerId;
      try { b.setPointerCapture(id_); } catch {}
      b.classList.add('down');
      press(key);
    });
    const up = (e) => {
      if (e.pointerId !== id_) return;
      id_ = null;
      b.classList.remove('down');
      release(key);
    };
    b.addEventListener('pointerup', (e) => { e.stopPropagation(); up(e); });
    b.addEventListener('pointercancel', (e) => { e.stopPropagation(); up(e); });
    b.addEventListener('lostpointercapture', (e) => { e.stopPropagation(); up(e); });
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    new ResizeObserver(() => { if (!b.getClientRects().length && id_ !== null) { id_ = null; b.classList.remove('down'); release(key); } }).observe(b);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  bind('#tc-act', 'e');
  bind('#tc-jump', ' ');
  return root;
}
