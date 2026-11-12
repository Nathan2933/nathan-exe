/**
 * On-screen touch controls: a floating-feel joystick (walk/run) plus Interact and Jump buttons.
 * They drive the same `keys` set and keyboard handlers the desktop controls use, so no game logic is
 * duplicated. Shown on touch devices (or with ?touch=1); desktop keyboard/mouse is untouched.
 */
const DIRS = { a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] };

export function initTouchControls(keys) {
  const wantTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || /[?&]touch=1/.test(location.search);
  if (!wantTouch) return null;

  const root = document.createElement('div');
  root.className = 'touch-ui';
  root.innerHTML = `
    <div class="tc-stick" id="tc-stick" aria-label="Move" role="application"><i class="tc-knob"></i></div>
    <div class="tc-btns">
      <button type="button" class="tc-btn" id="tc-jump" aria-label="Jump">Jump</button>
      <button type="button" class="tc-btn tc-act" id="tc-act" aria-label="Interact">USE</button>
    </div>`;
  document.body.append(root);
  document.body.classList.add('touch-ui-on');

  const press = (k) => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); };
  const release = (k) => { document.body.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })); };

  // ---- joystick ----
  const stick = root.querySelector('#tc-stick'), knob = root.querySelector('.tc-knob');
  let pid = null, cx = 0, cy = 0, R = 40;
  const held = new Set();
  const setKeys = (next) => {
    for (const k of Object.keys(DIRS)) {
      const on = next.has(k);
      if (on && !held.has(k)) { keys.add(k); held.add(k); }
      else if (!on && held.has(k)) { keys.delete(k); held.delete(k); }
    }
    if (next.has('shift')) { keys.add('shift'); held.add('shift'); } else if (held.has('shift')) { keys.delete('shift'); held.delete('shift'); }
  };
  const move = (e) => {
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const next = new Set();
    if (d > R * 0.28) {
      // screen-up = W, screen-right = D, with 8-way blending on the diagonals
      if (dx > R * 0.35 * (d / R)) next.add('d'); else if (dx < -R * 0.35 * (d / R)) next.add('a');
      if (dy > R * 0.35 * (d / R)) next.add('s'); else if (dy < -R * 0.35 * (d / R)) next.add('w');
      if (d > R * 0.92) next.add('shift');           // pushed to the rim = run
    }
    setKeys(next);
  };
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null; knob.style.transform = ''; stick.classList.remove('on'); setKeys(new Set());
  };
  stick.addEventListener('pointerdown', (e) => {
    if (pid !== null) return;
    pid = e.pointerId; stick.setPointerCapture(pid); stick.classList.add('on');
    const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; R = r.width * 0.36;
    e.preventDefault(); move(e);
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === pid) { e.preventDefault(); move(e); } });
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
  stick.addEventListener('lostpointercapture', end);
  // never leave the character walking: a panel opening (controls hidden), a cancelled touch, a lost window
  const reset = () => { pid = null; knob.style.transform = ''; stick.classList.remove('on'); setKeys(new Set()); };
  window.addEventListener('blur', reset);
  window.addEventListener('pagehide', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  document.addEventListener('touchcancel', () => { if (pid !== null) reset(); }, true);
  // when the controls are hidden (menu, dialogue, modal) the stick collapses to 0x0: release it
  if ('ResizeObserver' in window) new ResizeObserver(() => { if (!stick.offsetParent && (pid !== null || held.size)) reset(); }).observe(stick);

  // ---- action buttons (hold-aware so Jump can be held like Space) ----
  const bind = (id, key) => {
    const b = root.querySelector(id);
    let id_ = null;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); id_ = e.pointerId; b.setPointerCapture(id_); b.classList.add('down'); press(key); });
    const up = (e) => { if (e.pointerId !== id_) return; id_ = null; b.classList.remove('down'); release(key); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    new ResizeObserver(() => { if (!b.offsetParent && id_ !== null) { id_ = null; b.classList.remove('down'); release(key); } }).observe(b);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  bind('#tc-act', 'e');
  bind('#tc-jump', ' ');
  return root;
}
