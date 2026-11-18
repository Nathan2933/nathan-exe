// Portfolio -> virtual tour nudges: a rocket ticket (every visit) and Nathan's end-of-scroll invite (once per visit).
const TOUR_URL = './play.html';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get: (s, k) => { try { return (s === 'l' ? localStorage : sessionStorage).getItem(k); } catch { return null; } },
  set: (s, k) => { try { (s === 'l' ? localStorage : sessionStorage).setItem(k, '1'); } catch { /* storage blocked */ } },
};

// ---------- flying ticket ----------
const TICKET_SVG = '<svg viewBox="0 0 24 14" shape-rendering="crispEdges" aria-hidden="true">'
  + '<path fill="#101F45" d="M1 0h22v1h1v4h-1v1h-1v2h1v1h1v4h-1v1H1v-1H0V9h1V8h1V6H1V5H0V1h1z"/>'
  + '<path fill="#FFF02A" d="M2 1h20v4h-1v2h1v2h-1v4H2V9H1V7h1V5H1V1z"/>'
  + '<path fill="#F5A300" d="M16 1h1v12h-1zM2 12h20v1H2z"/>'
  + '<path fill="#101F45" d="M5 4h6v1H5zM5 6h8v1H5zM5 8h5v1H5z"/></svg>';

const tourBtns = () => [...document.querySelectorAll('a.tour-cta')];
const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

// cubic bezier point + tangent
const bez = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    dx: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    dy: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
};

function puff(x, y, cls) {
  const p = document.createElement('i');
  p.className = cls; p.setAttribute('aria-hidden', 'true');
  p.style.left = `${x}px`; p.style.top = `${y}px`;
  p.style.setProperty('--dx', `${(Math.random() - .5) * 30}px`);
  p.style.setProperty('--dy', `${(Math.random() - .5) * 30}px`);
  document.body.appendChild(p);
  p.addEventListener('animationend', () => p.remove(), { once: true });
}

function impact(btn, x, y) {
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, d = 40 + Math.random() * 30;
    const s = document.createElement('i');
    s.className = 'tk-spark'; s.setAttribute('aria-hidden', 'true');
    s.style.left = `${x}px`; s.style.top = `${y}px`;
    s.style.setProperty('--dx', `${Math.cos(a) * d}px`); s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
    document.body.appendChild(s);
    s.addEventListener('animationend', () => s.remove(), { once: true });
  }
  btn.classList.remove('st-armed');
  btn.classList.add('ticket-hit', 'st-reveal');
  setTimeout(() => btn.classList.remove('ticket-hit'), 500);
  setTimeout(() => btn.classList.remove('st-reveal'), 1400);
}

// flight paths: the sidebar ticket swoops in from the bottom right, the navbar ticket climbs from the bottom left
function pathFor(btn, end) {
  if (btn.closest('.site-head')) {
    return [{ x: -80, y: innerHeight * .85 }, { x: innerWidth * .3, y: innerHeight * .05 }, { x: end.x - 220, y: end.y + innerHeight * .5 }];
  }
  return [{ x: innerWidth + 80, y: innerHeight * .78 }, { x: innerWidth * .55, y: -innerHeight * .15 }, { x: Math.max(end.x + 260, innerWidth * .35), y: end.y + innerHeight * .25 }];
}

// rocket ticket: launches off-screen, loops over the page, slams into a tour button (every visit)
function flyTicket(btn) {
  if (reduced() || !visible(btn)) { btn.classList.remove('st-armed'); return; }
  const sc = btn.closest('.side-card');                 // short screens: bring the button into the sidebar's view
  if (sc) {
    const br = btn.getBoundingClientRect(), sr = sc.getBoundingClientRect();
    if (br.bottom > sr.bottom - 8) sc.scrollTop += br.bottom - sr.bottom + 16;
  }
  const r = btn.getBoundingClientRect();
  const end = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  const [p0, p1, p2] = pathFor(btn, end);
  const t = document.createElement('div');
  t.className = 'fly-ticket'; t.setAttribute('aria-hidden', 'true');
  t.innerHTML = `<span class="tk-flame"></span>${TICKET_SVG}`;
  document.body.appendChild(t);
  const w = t.offsetWidth, h = t.offsetHeight, dur = 1500, t0 = performance.now();
  let last = 0;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = k * k * (1.6 - .6 * k);                    // slow ignition, then full thrust
    const pt = bez(p0, p1, p2, end, e);
    const ang = Math.atan2(pt.dy, pt.dx);
    const wob = Math.sin(now / 35) * 2.5;
    t.style.transform = `translate(${pt.x - w / 2}px, ${pt.y - h / 2}px) rotate(${ang + wob * Math.PI / 180}rad)`;
    if (now - last > 22) {                               // exhaust trail
      last = now;
      const bx = pt.x - Math.cos(ang) * w * .7, by = pt.y - Math.sin(ang) * w * .7;
      puff(bx, by, 'tk-smoke');
      if (Math.random() < .6) puff(bx, by, 'tk-ember');
    }
    if (k < 1) requestAnimationFrame(step);
    else { t.remove(); impact(btn, end.x, end.y); }
  };
  requestAnimationFrame(step);
}

// ---------- end-of-scroll invite ----------
let shown = false;
function showInvite() {
  if (shown || store.get('s', 'nx-invite')) return;
  shown = true; store.set('s', 'nx-invite');
  const quick = reduced();
  const el = document.createElement('div');
  el.className = 'tour-invite' + (quick ? ' is-instant' : '');
  el.innerHTML = `
    <div class="ti-dim" aria-hidden="true"></div>
    <aside class="ti-wrap" role="region" aria-label="Virtual tour invitation">
      <img class="ti-nathan" src="assets/nat.png" alt="" width="160" height="160">
      <div class="ti-bubble">
        <button class="ti-close" type="button" aria-label="Dismiss invitation">✕</button>
        <p>You’ve seen the chapters. Want to walk through them?</p>
        <a class="btn primary ti-go" href="${TOUR_URL}">Explore the world <span aria-hidden="true">▶</span></a>
      </div>
    </aside>`;
  document.body.appendChild(el);
  el.querySelector('.ti-close').addEventListener('click', () => el.classList.add('is-gone'));
  el.addEventListener('transitionend', (e) => { if (el.classList.contains('is-gone') && e.target === el) el.remove(); });
  if (quick) { el.classList.add('is-in', 'is-ask'); return; }
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
  setTimeout(() => el.classList.add('is-ask'), 1500);   // button appears after Nathan has spoken
  setTimeout(() => el.classList.add('is-undim'), 2600); // dimming is brief; invite stays, scrolling never blocked
}

function atEnd() {
  return document.getElementById('contact') && innerHeight + scrollY >= document.documentElement.scrollHeight - 8;
}

export function initTourInvite() {
  const btns = tourBtns();
  if (!reduced()) btns.forEach((b) => b.classList.add('st-armed'));   // labels stay hidden until their ticket hits
  const tryTicket = () => btns.forEach((b, i) => setTimeout(() => flyTicket(b), i * 280));
  if (document.readyState === 'complete') setTimeout(tryTicket, 600); else addEventListener('load', () => setTimeout(tryTicket, 600), { once: true });
  addEventListener('scroll', () => { if (!shown && atEnd()) showInvite(); }, { passive: true });
}
