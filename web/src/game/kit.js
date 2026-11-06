import * as THREE from 'three';
import { registerMaterial } from './palette.js';

// The NATHAN.EXE kit: every placeable piece, keyed by the name used as the
// object "type" in Tiled. Each builder returns
//   { obj, colliders?: [{x,z,w,d} | {x,z,r}] (local space), animate?(t, state), dynamic? }
// These are code-built stand-ins. Drop a Blender export at
// public/assets/kit/<name>.glb and list it in public/assets/kit/manifest.json
// to replace any piece (see docs/WORKFLOW.md).
//
// Design system shared by every building: stone plinth → walls → trim band →
// roof slab with overhang → framed sign. Accent orange = interactive/brand only.

export const C = {
  ink: 0x2a2440, cream: 0xfff8ea, paper: 0xfff1d6, accent: 0xff6a3d, amber: 0xffc14d,
  plinth: 0xb7aea2, concrete: 0xe2ddd4, steel: 0xc6d2e0, steelDark: 0x7d8fa8, charcoal: 0x4a5a7a,
  brick: 0xc8553d, brickDark: 0x9a3f2e, wood: 0xa0673f, woodLight: 0xd9a066, rubber: 0x34304a,
  grass: 0x9fd46a, leaf: 0x8cc85e, leafDark: 0x62a650, pink: 0xff8fb1, pinkDark: 0xe8648e,
  snow: 0xf7faff, pine: 0x2f8f6a, trunk: 0x8a5a36, water: 0x4fd0ea, white: 0xffffff,
  teal: 0x2bb3a3, sky: 0x6fc3ff, yellow: 0xffd257, mint: 0x9ee6c4, terracotta: 0xc4623a,
};

const mats = new Map();
// Every glowing material, so night mode can turn the glow up.
const glowMats = [];
export function setGlowBoost(k) { for (const g of glowMats) g.m.emissiveIntensity = g.base * k; }
let _pool = null;
function poolTex() {
  if (_pool) return _pool;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (_pool = new THREE.CanvasTexture(c));
}
/** Warm pool of lamplight on the ground, only visible at night. */
export function lightPool(radius = 2.6, color = 0xffc46a) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), new THREE.MeshBasicMaterial({ color, map: poolTex(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.06; m.visible = false; m.userData.dynamic = true; m.renderOrder = 1;
  return m;
}
export function mat(color, { emissive = 0, emissiveIntensity = 1, keep = false } = {}) {
  const key = `${color}|${emissive}|${emissiveIntensity}|${keep}`;
  if (!mats.has(key)) {
    const m = new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity, flatShading: true });
    if (!keep) registerMaterial(m); // `keep` = brand/interaction colours that never change with the palette
    if (emissive) glowMats.push({ m, base: emissiveIntensity });
    mats.set(key, m);
  }
  return mats.get(key);
}
const glow = (color) => mat(color, { emissive: color, emissiveIntensity: 0.55 });

// ---------- tiny builders ----------
function kit(g) {
  const api = {
    box(w, h, d, color, x = 0, y = 0, z = 0, o = {}) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'number' ? mat(color) : color);
      m.position.set(x, y + h / 2, z);
      if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz;
      m.castShadow = o.shadow !== false; m.receiveShadow = true;
      (o.parent || g).add(m);
      return m;
    },
    cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 8, o = {}) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === 'number' ? mat(color) : color);
      m.position.set(x, y + h / 2, z);
      if (o.rx) m.rotation.x = o.rx; if (o.rz) m.rotation.z = o.rz;
      m.castShadow = o.shadow !== false; m.receiveShadow = true;
      (o.parent || g).add(m);
      return m;
    },
    mesh(geo, color, x = 0, y = 0, z = 0, o = {}) {
      const m = new THREE.Mesh(geo, typeof color === 'number' ? mat(color) : color);
      m.position.set(x, y, z);
      if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz;
      m.castShadow = o.shadow !== false; m.receiveShadow = true;
      (o.parent || g).add(m);
      return m;
    },
  };
  return api;
}

/** Crisp pixel-font sign texture (Silkscreen is loaded by the page). */
export function signTexture(text, { fg = '#ff6a3d', bg = '#1e1b2e', w = 128, h = 32, size = 18, icon = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 2; g.strokeRect(3, 3, w - 6, h - 6);
  g.fillStyle = fg;
  g.font = `${size}px Silkscreen, monospace`;
  // shrink long names so they always fit inside the frame
  const room = w - 16 - (icon ? 22 : 0);
  while (size > 7 && g.measureText(text).width > room) { size -= 1; g.font = `${size}px Silkscreen, monospace`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2 + (icon ? 8 : 0), h / 2 + 1);
  if (icon === 'dumbbell') {
    const tw = g.measureText(text).width, x = w / 2 - tw / 2 - 12;
    g.fillRect(x - 6, h / 2 - 1, 12, 3); g.fillRect(x - 8, h / 2 - 5, 3, 11); g.fillRect(x + 5, h / 2 - 5, 3, 11);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter;
  return tex;
}
function signMesh(text, w, h, opts) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: signTexture(text, opts) }));
  m.userData.dynamic = true; // textured: excluded from static merging
  return m;
}

// ---------- Garage exhibit helpers ----------
/** Display table with a coloured diorama board; returns the board's top height. */
function exhibitTable(k, TW, TD, board) {
  const TH = 0.75;
  k.box(TW, 0.12, TD, C.wood, 0, TH - 0.12, 0);
  for (const x of [-TW / 2 + 0.2, TW / 2 - 0.2]) for (const z of [-TD / 2 + 0.2, TD / 2 - 0.2]) k.box(0.14, TH - 0.12, 0.14, C.wood, x, 0, z);
  k.box(TW - 0.4, 0.06, TD - 0.4, C.woodLight, 0, 0.18, 0);
  k.box(TW - 0.1, 0.1, TD - 0.1, board, 0, TH, 0);
  return TH + 0.1;
}
/** Small wooden name sign on a post at the front of an exhibit. */
function nameSign(g, k, text, x, z, y) {
  k.box(0.06, 0.5, 0.06, C.wood, x - 0.5, y, z);
  k.box(1.14, 0.26, 0.05, C.wood, x, y + 0.26, z);
  const s = signMesh(text, 1.08, 0.2, { fg: '#fff1d6', bg: '#8b5a3c', size: 14, w: 176, h: 32 });
  s.position.set(x, y + 0.39, z + 0.03); g.add(s);
}
/** 0..1 activation that eases up while Nathan is within r metres (0 with Motion off). */
function nearness(g, r = 4.6) {
  let act = 0;
  return (state) => {
    const p = state.playerPos;
    const near = p && Math.hypot(p.x - g.position.x, p.z - g.position.z) < r;
    act += ((near ? 1 : 0) - act) * 0.06;
    return state.reduceMotion ? 0 : act;
  };
}

/** Chunky retro board sign facing +z: ink board with cream pixel lettering,
 *  drop shadow, orange trims and a dark backing for depth. */
function boardSign(text, SW, SH, { size = 0, w = 512, h = 112, fg = '#fff1d6', bg = '#2a2440', board: boardColor = C.ink, trim = C.accent } = {}) {
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.16, SH + 0.16, 0.1), mat(0x14101f)); back.position.z = -0.07; back.castShadow = true;
  const board = new THREE.Mesh(new THREE.BoxGeometry(SW, SH, 0.06), mat(boardColor));
  const trimM = mat(trim, { keep: true });
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(SW, 0.05, 0.08), trimM); t1.position.y = SH / 2 - 0.04;
  const t2 = t1.clone(); t2.position.y = -SH / 2 + 0.04;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x2 = cv.getContext('2d');
  x2.fillStyle = bg; x2.fillRect(0, 0, w, h);
  let fs = size || Math.round(h * 0.72); x2.font = `bold ${fs}px Silkscreen, monospace`;
  while (fs > 10 && x2.measureText(text).width > w * 0.84) { fs -= 2; x2.font = `bold ${fs}px Silkscreen, monospace`; }
  x2.textAlign = 'center'; x2.textBaseline = 'middle';
  const off = Math.max(2, Math.round(fs / 14));
  x2.fillStyle = '#100c1a'; x2.fillText(text, w / 2 + off, h / 2 + 2 + off);
  x2.fillStyle = fg; x2.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(SW - 0.06, SH - 0.14), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.z = 0.035; face.userData.dynamic = true;
  g.add(back, board, t1, t2, face);
  return g;
}

/** Boxy horse used as a walking companion (Arthur's horse). */
export function buildHorse(coat = 0x7a4a2a, mane = 0x2a1a12) {
  const g = new THREE.Group(), k = kit(g);
  k.box(1.1, 0.5, 0.42, coat, 0, 0.75, 0);
  const legs = [];
  for (const [x, z] of [[-0.4, -0.15], [-0.4, 0.15], [0.4, -0.15], [0.4, 0.15]]) {
    const p = new THREE.Group(); p.position.set(x, 0.75, z); g.add(p);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.75, 0.12), mat(coat)); l.position.y = -0.375; l.castShadow = true; p.add(l);
    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.13), mat(0x2a1a12)); hoof.position.y = -0.71; p.add(hoof);
    legs.push(p);
  }
  k.box(0.5, 0.06, 0.46, 0x5a2a1a, -0.05, 1.25, 0);
  k.box(0.06, 0.14, 0.48, 0xc9a24a, -0.05, 1.1, 0, { shadow: false });
  const head = new THREE.Group(); head.position.set(0.55, 1.15, 0); g.add(head);
  const hk = kit(head);
  hk.box(0.22, 0.5, 0.26, coat, 0.05, 0, 0, { rz: -0.5 });
  hk.box(0.42, 0.22, 0.22, coat, 0.32, 0.32, 0);
  hk.box(0.1, 0.3, 0.06, mane, -0.05, 0.1, 0, { rz: -0.5 });
  hk.box(0.06, 0.1, 0.06, mane, 0.12, 0.5, 0.07); hk.box(0.06, 0.1, 0.06, mane, 0.12, 0.5, -0.07);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), mat(mane)); tail.geometry.translate(0, -0.25, 0); tail.position.set(-0.58, 1.15, 0); g.add(tail);
  g.userData.dynamic = true;
  return { group: g, legs, head, tail };
}

// ---------- pieces ----------
export const KIT = {
  // ----- street furniture -----
  lamp() {
    const g = new THREE.Group(), k = kit(g);
    k.cyl(0.16, 0.2, 0.25, C.ink, 0, 0, 0, 8);
    k.cyl(0.06, 0.07, 2.8, C.ink, 0, 0.25, 0, 6);
    k.box(0.5, 0.06, 0.06, C.ink, 0.2, 2.95, 0);
    k.box(0.32, 0.08, 0.32, C.ink, 0.42, 2.72, 0);
    k.box(0.24, 0.3, 0.24, glow(C.amber), 0.42, 2.42, 0);
    k.box(0.32, 0.05, 0.32, C.ink, 0.42, 2.37, 0);
    const pool = lightPool(2.6); pool.position.x = 0.42; g.add(pool);
    return { obj: g, colliders: [{ x: 0, z: 0, r: 0.2 }], nightGlow: [pool] };
  },
  bench({ snow = false } = {}) {
    const g = new THREE.Group(), k = kit(g);
    if (snow) { k.box(1.62, 0.07, 0.42, C.snow, 0, 0.47, -0.04); k.box(1.62, 0.06, 0.08, C.snow, 0, 0.94, -0.26); }
    for (const x of [-0.7, 0.7]) { k.box(0.08, 0.42, 0.5, C.ink, x, 0, 0); k.box(0.08, 0.5, 0.06, C.ink, x, 0.42, -0.24); }
    for (let i = 0; i < 3; i++) k.box(1.6, 0.05, 0.13, C.woodLight, 0, 0.42, -0.16 + i * 0.16);
    for (let i = 0; i < 2; i++) k.box(1.6, 0.11, 0.04, C.woodLight, 0, 0.6 + i * 0.17, -0.26);
    return { obj: g, colliders: [{ x: 0, z: 0, w: 1.7, d: 0.6 }] };
  },
  planter() {
    const g = new THREE.Group(), k = kit(g);
    k.box(1.2, 0.5, 1.2, C.woodLight, 0, 0, 0); k.box(1.3, 0.06, 1.3, C.wood, 0, 0.5, 0);
    k.box(1.0, 0.1, 1.0, 0x6a4a32, 0, 0.5, 0, { shadow: false });
    const flowers = [C.accent, C.pink, C.cream, C.amber];
    for (let i = 0; i < 9; i++) k.box(0.16, 0.24, 0.16, flowers[i % 4], -0.32 + (i % 3) * 0.32, 0.56, -0.32 + Math.floor(i / 3) * 0.32);
    k.mesh(new THREE.IcosahedronGeometry(0.32, 0), C.leaf, 0, 0.9, 0);
    return { obj: g, colliders: [{ x: 0, z: 0, w: 1.3, d: 1.3 }] };
  },
  bin() {
    const g = new THREE.Group(), k = kit(g);
    k.cyl(0.26, 0.22, 0.75, C.charcoal, 0, 0, 0, 8);
    k.cyl(0.29, 0.29, 0.07, C.ink, 0, 0.75, 0, 8);
    k.box(0.2, 0.06, 0.02, C.accent, 0, 0.5, 0.25, { shadow: false });
    return { obj: g, colliders: [{ x: 0, z: 0, r: 0.3 }] };
  },
  notice_board({ text = 'ABOUT ME' } = {}) {
    const g = new THREE.Group(), k = kit(g);
    for (const x of [-0.85, 0.85]) k.box(0.12, 2.1, 0.12, C.wood, x, 0, 0);
    k.box(1.9, 1.2, 0.1, C.woodLight, 0, 0.8, 0);
    k.box(2.1, 0.12, 0.3, C.wood, 0, 2.05, 0);
    const papers = [[-0.5, 1.45, C.cream], [0.15, 1.5, C.amber], [0.6, 1.25, C.cream], [-0.35, 1.05, C.pink], [0.35, 0.95, C.cream]];
    for (const [x, y, c] of papers) k.box(0.42, 0.34, 0.02, c, x, y, 0.06, { shadow: false });
    const sign = signMesh(String(text).toUpperCase(), 1.2, 0.3, { size: 16 });
    sign.position.set(0, 2.25, 0.16); g.add(sign);
    return { obj: g, colliders: [{ x: 0, z: 0, w: 2, d: 0.4 }] };
  },
  lot_sign({ text = 'DISTRICT', color = '#ff6a3d' }) {
    const g = new THREE.Group(), k = kit(g);
    for (const x of [-0.9, 0.9]) k.box(0.14, 2.2, 0.14, C.ink, x, 0, 0);
    k.box(2.1, 0.62, 0.14, C.ink, 0, 1.5, 0);
    const sign = signMesh(text, 1.9, 0.48, { fg: color, size: 16 });
    sign.position.set(0, 1.81, 0.08); g.add(sign);
    return { obj: g, colliders: [{ x: -0.9, z: 0, r: 0.15 }, { x: 0.9, z: 0, r: 0.15 }] };
  },
  hedge({ w = 1, d = 1 }) {
    const g = new THREE.Group(), k = kit(g);
    k.box(w, 0.9, d, C.leafDark, 0, 0, 0);
    k.box(w + 0.06, 0.18, d + 0.06, C.leaf, 0, 0.9, 0);
    // a few berry/flower dots for texture
    const n = Math.floor(Math.max(w, d) / 1.7);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      k.box(0.12, 0.12, 0.12, i % 2 ? C.pink : C.cream, w > d ? t * w : w / 2 + 0.01, 0.62, w > d ? d / 2 + 0.01 : t * d, { shadow: false });
    }
    return { obj: g, colliders: [{ x: 0, z: 0, w, d }] };
  },
  tree_round({ scale = 1 }) {
    const g = new THREE.Group(), k = kit(g);
    k.cyl(0.13, 0.18, 1.1, C.trunk, 0, 0, 0, 6);
    k.mesh(new THREE.IcosahedronGeometry(1.05, 0), C.leafDark, 0, 1.75, 0);
    k.mesh(new THREE.IcosahedronGeometry(0.8, 0), C.leaf, 0.2, 2.35, 0.15, { ry: 0.6 });
    g.scale.setScalar(scale);
    return { obj: g, colliders: [{ x: 0, z: 0, r: 0.35 }] };
  },
  tree_blossom({ scale = 1 }) {
    const g = new THREE.Group(), k = kit(g);
    k.cyl(0.12, 0.17, 1.2, C.trunk, 0, 0, 0, 6);
    k.mesh(new THREE.IcosahedronGeometry(0.95, 0), C.pinkDark, 0, 1.8, 0);
    k.mesh(new THREE.IcosahedronGeometry(0.7, 0), C.pink, -0.15, 2.3, 0.1, { ry: 0.9 });
    g.scale.setScalar(scale);
    return { obj: g, colliders: [{ x: 0, z: 0, r: 0.35 }] };
  },
  tree_pine({ scale = 1 }) {
    const g = new THREE.Group(), k = kit(g);
    k.cyl(0.12, 0.16, 0.6, C.trunk, 0, 0, 0, 5);
    k.mesh(new THREE.ConeGeometry(1.05, 1.6, 6), C.pine, 0, 1.3, 0);
    k.mesh(new THREE.ConeGeometry(0.8, 1.3, 6), C.pine, 0, 2.1, 0, { ry: 0.5 });
    k.mesh(new THREE.ConeGeometry(0.5, 0.8, 6), C.snow, 0, 2.75, 0, { ry: 0.5 });
    g.scale.setScalar(scale);
    return { obj: g, colliders: [{ x: 0, z: 0, r: 0.35 }] };
  },
  tree_palm({ scale = 1 }) {
    const g = new THREE.Group(), k = kit(g);
    for (let i = 0; i < 5; i++) k.cyl(0.13 - i * 0.01, 0.15 - i * 0.01, 0.55, i % 2 ? C.trunk : C.wood, i * 0.05, i * 0.55, 0, 6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.box(1.5, 0.05, 0.4, C.leaf, Math.cos(a) * 0.65 + 0.25, 2.8, Math.sin(a) * 0.65, { ry: -a, rz: -0.35 });
    }
    g.scale.setScalar(scale);
    return { obj: g, colliders: [{ x: 0, z: 0, r: 0.3 }] };
  },

  // ----- plaza landmark: a giant CRT that plays scenes from Nathan's life -----
  crt_monument() {
    const g = new THREE.Group(), k = kit(g);
    k.cyl(2.6, 2.8, 0.3, C.plinth, 0, 0, 0, 12);
    k.cyl(2.1, 2.3, 0.35, C.concrete, 0, 0.3, 0, 12);
    k.box(1.4, 0.9, 1.4, C.ink, 0, 0.65, 0);           // stand
    k.box(2.4, 0.18, 1.8, C.ink, 0, 1.55, 0);
    const body = new THREE.Group(); body.position.y = 1.73; g.add(body);
    const b = kit(body);
    b.box(3.4, 2.7, 2.2, C.paper, 0, 0, 0.2);            // case
    b.box(2.6, 2.1, 1.0, 0xe2d8c0, 0, 0.3, -1.3);         // tapered back
    b.box(1.6, 1.4, 0.6, 0xd6cbb1, 0, 0.6, -2.0);
    b.box(3.0, 2.3, 0.1, C.ink, 0, 0.18, 1.3);            // bezel
    b.box(0.5, 0.12, 0.06, C.charcoal, 1.15, 0.12, 1.33); // vents/buttons
    for (let i = 0; i < 4; i++) b.box(0.6, 0.04, 0.02, 0xc9bfa6, -1.0, 0.1 + i * 0.07, 1.33, { shadow: false });
    const led = b.box(0.1, 0.1, 0.04, glow(C.accent), 1.45, 0.1, 1.33);
    led.userData.dynamic = true;
    // Screen
    const sc = document.createElement('canvas'); sc.width = 128; sc.height = 96;
    const sg = sc.getContext('2d');
    const tex = new THREE.CanvasTexture(sc);
    tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.0), new THREE.MeshBasicMaterial({ map: tex }));
    screen.position.set(0, 1.33, 1.36); screen.userData.dynamic = true;
    body.add(screen);
    const scenes = [
      { t: 'NATHAN.EXE', s: 'PRESS START', c: '#ff6a3d' },
      { t: 'CH.1', s: 'IRON YARD', c: '#ffb347', draw: 'pulse' },
      { t: 'CH.2', s: 'WINTER', c: '#cfe3ff', draw: 'snow' },
      { t: 'CH.3', s: 'MONSOON', c: '#f2a93b', draw: 'rain' },
      { t: 'CH.4', s: 'BUILD()', c: '#7be0c9', draw: 'code' },
      { t: 'NEXT?', s: 'LIGHTHOUSE', c: '#ff6a3d' },
    ];
    let last = -1;
    const animate = (t) => {
      led.material = Math.sin(t * 3) > 0 ? glow(C.accent) : mat(C.brickDark);
      const frame = Math.floor(t * 8);
      if (frame === last) return;
      last = frame;
      const sceneIdx = Math.floor(t / 3.2) % scenes.length, s = scenes[sceneIdx], lt = t % 3.2;
      sg.fillStyle = '#121019'; sg.fillRect(0, 0, 128, 96);
      sg.fillStyle = s.c; sg.textAlign = 'center';
      if (s.draw === 'snow' || s.draw === 'rain') {
        for (let i = 0; i < 24; i++) {
          const x = (i * 37) % 128, y = ((i * 53 + lt * (s.draw === 'rain' ? 90 : 24)) % 96);
          sg.fillRect(x, y, s.draw === 'rain' ? 1 : 2, s.draw === 'rain' ? 4 : 2);
        }
      }
      if (s.draw === 'pulse') {
        sg.beginPath(); sg.strokeStyle = s.c; sg.lineWidth = 2;
        for (let x = 0; x < 128; x += 2) {
          const k2 = ((x + lt * 60) % 64);
          const y = 74 - (k2 > 28 && k2 < 34 ? (k2 - 28) * 4 : k2 >= 34 && k2 < 38 ? (38 - k2) * 5 : 0);
          x === 0 ? sg.moveTo(x, y) : sg.lineTo(x, y);
        }
        sg.stroke();
      }
      if (s.draw === 'code') {
        sg.font = '8px Silkscreen, monospace'; sg.textAlign = 'left';
        ['fn ship() {', '  build();', '  test();', '}'].forEach((l, i) => sg.fillText(l.slice(0, Math.floor(lt * 10) - i * 6), 14, 62 + i * 9));
        sg.textAlign = 'center';
      }
      sg.font = '20px Silkscreen, monospace'; sg.fillText(s.t, 64, 34);
      sg.font = '10px Silkscreen, monospace'; sg.fillText(s.s, 64, 50);
      if (Math.floor(t * 2) % 2 && sceneIdx === 0) sg.fillRect(40, 58, 48, 2);
      sg.fillStyle = 'rgba(0,0,0,.28)';
      for (let y = 0; y < 96; y += 3) sg.fillRect(0, y, 128, 1);
      tex.needsUpdate = true;
    };
    return { obj: g, colliders: [{ x: 0, z: 0, r: 2.4 }], animate };
  },

  fountain() {
    const g = new THREE.Group(), k = kit(g);
    k.cyl(2.3, 2.4, 0.5, C.concrete, 0, 0, 0, 14);
    const water = k.cyl(2.05, 2.05, 0.05, glow(C.water), 0, 0.42, 0, 14, { shadow: false });
    water.material = mat(C.water, { emissive: 0x1b5566, emissiveIntensity: 0.6 });
    k.cyl(0.35, 0.45, 1.2, C.concrete, 0, 0.45, 0, 8);
    k.cyl(0.9, 0.7, 0.18, C.concrete, 0, 1.6, 0, 10);
    k.cyl(0.2, 0.25, 0.6, C.concrete, 0, 1.78, 0, 8);
    const jets = [];
    for (let i = 0; i < 6; i++) {
      const j = k.mesh(new THREE.OctahedronGeometry(0.1, 0), C.white, 0, 0, 0, { shadow: false });
      j.userData.dynamic = true; jets.push(j);
    }
    const animate = (t) => jets.forEach((j, i) => {
      const p = (t * 0.8 + i / jets.length) % 1, a = (i / jets.length) * Math.PI * 2;
      j.position.set(Math.cos(a) * p * 1.2, 2.4 + p * 0.6 - p * p * 2.2, Math.sin(a) * p * 1.2);
    });
    return { obj: g, colliders: [{ x: 0, z: 0, r: 2.4 }], animate };
  },

  // ----- Iron Yard -----
  gym_building() {
    // 11 m × 7 m warehouse gym, front faces +z. Designed to read at retro
    // resolution: light walls, one strong orange band, a big high-contrast
    // sign, a lit open door and a giant rooftop dumbbell as the landmark.
    const g = new THREE.Group(), k = kit(g);
    const W = 11, D = 7, H = 4.6;
    const wall = 0xf3ece0, band = C.accent, roofC = 0xa9b7cc;
    k.box(W + 0.5, 0.3, D + 0.5, C.plinth, 0, 0, 0);
    k.box(W, 1.2, D, 0xd9694c, 0, 0.3, 0);                                   // brick base
    for (let y = 0.6; y < 1.5; y += 0.3) k.box(W + 0.02, 0.04, D + 0.02, 0xb85540, 0, y, 0, { shadow: false });
    k.box(W, H - 1.5, D, wall, 0, 1.5, 0);                                    // light upper walls
    k.box(W + 0.06, 0.55, D + 0.06, band, 0, 2.15, 0);                        // orange band wraps the building
    k.box(W + 0.3, 0.3, D + 0.3, C.ink, 0, H, 0);                             // roof edge
    // shallow sawtooth roof in light steel with sky-blue skylights
    const tooth = new THREE.Shape(); tooth.moveTo(0, 0); tooth.lineTo(2.75, 0); tooth.lineTo(0, 0.9); tooth.closePath();
    const tgeo = new THREE.ExtrudeGeometry(tooth, { depth: D, bevelEnabled: false });
    for (let i = 0; i < 4; i++) {
      k.mesh(tgeo, roofC, -W / 2 + i * 2.75, H + 0.3, -D / 2);
      k.box(0.06, 0.75, D - 0.4, glow(0x9fdcff), -W / 2 + i * 2.75 + 0.05, H + 0.35, 0, { shadow: false });
    }
    // giant rooftop dumbbell: the Iron Yard landmark
    for (const x of [-1.6, 1.6]) k.box(0.3, 1.1, 0.3, C.ink, x, H + 0.3, D / 2 - 1.2);
    const bar = k.cyl(0.16, 0.16, 6.2, C.steel, 0, 0, D / 2 - 1.2, 8, { rz: Math.PI / 2 }); bar.position.y = H + 1.6;
    for (const s of [-1, 1]) {
      for (const [dx, r, c] of [[2.15, 1.15, band], [2.55, 1.0, C.ink], [2.9, 0.8, band]]) {
        const p = k.cyl(r, r, 0.34, c, s * dx, 0, D / 2 - 1.2, 14, { rz: Math.PI / 2 }); p.position.y = H + 1.6;
      }
    }
    // big open roll-up door with a warmly lit interior
    const DX = 2.3, DW = 4.0, DH = 3.2;
    k.box(DW + 0.4, DH + 0.2, 0.16, C.ink, DX, 0.3, D / 2 + 0.02);
    k.box(DW, DH, 0.1, mat(0xffd9a0, { emissive: 0xffb04d, emissiveIntensity: 0.55 }), DX, 0.3, D / 2 - 0.4, { shadow: false }); // lit back wall
    k.box(DW, 0.06, 0.6, 0x6f7fa0, DX, 0.32, D / 2 - 0.15, { shadow: false });
    for (let i = 0; i < 3; i++) k.box(DW, 0.2, 0.08, i % 2 ? C.steel : 0xe3e8ef, DX, 0.3 + DH - 0.25 - i * 0.2, D / 2 + 0.1);
    // silhouettes inside: squat rack + punch bag against the glow
    for (const x of [DX - 1.2, DX - 0.4]) k.box(0.1, 2.0, 0.1, C.ink, x, 0.3, D / 2 - 0.25);
    k.box(1.0, 0.08, 0.08, C.ink, DX - 0.8, 1.7, D / 2 - 0.2);
    k.box(0.04, 0.5, 0.04, C.ink, DX + 1.1, 2.6, D / 2 - 0.25);
    k.cyl(0.26, 0.26, 1.0, C.accent, DX + 1.1, 1.6, D / 2 - 0.25, 8);
    // glass entrance + orange canopy
    const EX = -3.4;
    k.box(1.7, 2.5, 0.1, C.ink, EX, 0.3, D / 2 + 0.03);
    k.box(1.4, 2.2, 0.06, mat(0xbfe6ff, { emissive: 0x3a6f88, emissiveIntensity: 0.45 }), EX, 0.4, D / 2 + 0.08, { shadow: false });
    k.box(0.06, 0.45, 0.05, C.steel, EX + 0.45, 1.3, D / 2 + 0.12);
    k.box(2.6, 0.14, 1.4, band, EX, 3.0, D / 2 + 0.65);
    for (const x of [EX - 1.15, EX + 1.15]) k.box(0.09, 2.7, 0.09, C.ink, x, 0.3, D / 2 + 1.25);
    // windows above the band
    for (const x of [-4.2, -1.6, 4.4]) {
      k.box(1.2, 0.8, 0.08, C.ink, x, 2.95, D / 2 + 0.03);
      k.box(1.0, 0.62, 0.06, glow(C.amber), x, 3.04, D / 2 + 0.07, { shadow: false });
    }
    // high-contrast sign: cream panel, dark letters, sized to read at low resolution
    k.box(6.2, 1.05, 0.16, C.ink, -1.1, 3.55 + 0.02, D / 2 + 0.12);
    const sign = signMesh('IRON YARD', 5.9, 0.85, { fg: '#2a2440', bg: '#fff1d6', size: 30, w: 256, h: 40, icon: 'dumbbell' });
    sign.position.set(-1.1, 4.1, D / 2 + 0.22); g.add(sign);
    // side wall: big painted dumbbell mural (faces +x, the camera side)
    k.box(0.08, 0.3, 2.6, band, W / 2 + 0.05, 3.1, 0);
    for (const z of [-1.4, 1.4]) k.box(0.1, 1.2, 0.4, C.ink, W / 2 + 0.06, 2.65, z);
    for (const z of [-1.8, 1.8]) k.box(0.1, 0.8, 0.3, band, W / 2 + 0.07, 2.85, z);
    // details: wall lamps, AC unit, downpipes, plate stack by the door
    for (const x of [EX, DX]) k.box(0.32, 0.16, 0.26, glow(C.amber), x, 3.9 - 1.0, D / 2 + 0.16, { shadow: false });
    k.box(1.2, 0.8, 0.8, C.steel, -W / 2 - 0.5, 0.3, -1.6); k.box(0.9, 0.06, 0.6, C.steelDark, -W / 2 - 0.5, 1.1, -1.6);
    for (const [x, z] of [[-W / 2 - 0.06, D / 2 - 0.1], [W / 2 + 0.06, D / 2 - 0.1]]) k.box(0.12, H, 0.12, C.steelDark, x, 0.3, z);
    for (let i = 0; i < 4; i++) k.cyl(0.42, 0.42, 0.1, i % 2 ? C.ink : band, 5.0, 0.3 + i * 0.1, D / 2 + 0.75, 12);
    return { obj: g, colliders: [{ x: 0, z: 0, w: W + 0.6, d: D + 0.6 }, { x: -W / 2 - 0.5, z: -1.6, w: 1.3, d: 0.9 }, { x: EX, z: D / 2 + 1.25, w: 2.5, d: 0.2 }, { x: 5.0, z: D / 2 + 0.75, r: 0.45 }] };
  },
  squat_rack() {
    const g = new THREE.Group(), k = kit(g);
    k.box(2.6, 0.06, 2.0, C.woodLight, 0, 0, 0, { shadow: false });           // lifting platform
    k.box(1.0, 0.065, 2.0, C.rubber, -1.3 + 0.5 - 0.5, 0, 0, { shadow: false });
    for (const x of [-0.75, 0.75]) for (const z of [-0.45, 0.25]) k.box(0.09, 2.3, 0.09, C.ink, x, 0.06, z);
    for (const x of [-0.75, 0.75]) { k.box(0.09, 0.09, 0.8, C.ink, x, 2.3, -0.1); k.box(0.12, 0.08, 0.16, C.accent, x, 1.25, 0.32); }
    k.box(1.6, 0.08, 0.08, C.ink, 0, 2.3, -0.45);
    const bar = k.cyl(0.03, 0.03, 2.4, C.steel, 0, 1.33, 0.34, 6, { rz: Math.PI / 2 });
    bar.position.y = 1.36;
    for (const s of [-1, 1]) {
      const p1 = k.cyl(0.45, 0.45, 0.1, C.accent, s * 0.95, 0, 0.34, 12, { rz: Math.PI / 2 }); p1.position.y = 1.36;
      const p2 = k.cyl(0.36, 0.36, 0.08, C.rubber, s * 1.05, 0, 0.34, 12, { rz: Math.PI / 2 }); p2.position.y = 1.36;
    }
    return { obj: g, colliders: [{ x: 0, z: -0.1, w: 1.8, d: 1.0 }] };
  },
  pullup_rig() {
    const g = new THREE.Group(), k = kit(g);
    for (const x of [-1.4, 1.4]) for (const z of [-0.6, 0.6]) k.box(0.1, 2.6, 0.1, C.ink, x, 0, z);
    for (const z of [-0.6, 0.6]) k.box(2.9, 0.07, 0.07, C.steel, 0, 2.5, z);
    k.box(0.07, 0.07, 1.3, C.ink, -1.4, 2.6, 0); k.box(0.07, 0.07, 1.3, C.ink, 1.4, 2.6, 0);
    const rings = new THREE.Group(); g.add(rings); rings.position.set(0.5, 2.5, 0.6);
    for (const x of [-0.25, 0.25]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.8, 0.03), mat(C.ink)); strap.position.set(x, -0.4, 0); rings.add(strap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 4, 10), mat(C.woodLight)); ring.position.set(x, -0.9, 0); rings.add(ring);
    }
    rings.userData.dynamic = true;
    return { obj: g, colliders: [{ x: 0, z: 0, w: 3.0, d: 1.4 }], animate: (t) => { rings.rotation.x = Math.sin(t * 1.3) * 0.08; } };
  },
  plyo_boxes() {
    const g = new THREE.Group(), k = kit(g);
    k.box(0.9, 0.75, 0.75, C.woodLight, 0, 0, 0); k.box(0.7, 0.6, 0.6, C.wood, 1.0, 0, 0.1); k.box(0.6, 0.45, 0.5, C.woodLight, 0.15, 0.75, 0, { ry: 0.2 });
    k.box(0.3, 0.04, 0.02, C.ink, 0, 0.4, 0.38, { shadow: false });
    return { obj: g, colliders: [{ x: 0.45, z: 0, w: 2.0, d: 0.9 }] };
  },
  tyre() {
    const g = new THREE.Group(), k = kit(g);
    k.mesh(new THREE.TorusGeometry(0.62, 0.26, 6, 12), C.rubber, 0, 0.26, 0, { rx: -Math.PI / 2 });
    k.cyl(0.1, 0.1, 0.02, C.accent, 0.5, 0.5, 0.2, 6, { shadow: false });
    return { obj: g, colliders: [{ x: 0, z: 0, r: 0.9 }] };
  },
  kettlebell_rack() {
    const g = new THREE.Group(), k = kit(g);
    k.box(2.0, 0.08, 0.6, C.ink, 0, 0.4, 0); k.box(2.0, 0.08, 0.6, C.ink, 0, 0.05, 0);
    for (const x of [-0.95, 0.95]) k.box(0.08, 0.5, 0.6, C.ink, x, 0, 0);
    const cols = [C.accent, C.ink, C.steelDark, C.accent, C.charcoal];
    cols.forEach((c, i) => {
      const x = -0.75 + i * 0.37;
      k.mesh(new THREE.IcosahedronGeometry(0.15, 0), c, x, 0.63, 0);
      k.mesh(new THREE.TorusGeometry(0.08, 0.025, 4, 8), c, x, 0.82, 0);
    });
    return { obj: g, colliders: [{ x: 0, z: 0, w: 2.1, d: 0.7 }] };
  },
  weight_bench() {
    const g = new THREE.Group(), k = kit(g);
    k.box(1.3, 0.12, 0.35, C.rubber, 0, 0.42, 0); k.box(0.06, 0.03, 0.36, C.accent, 0.3, 0.54, 0, { shadow: false });
    for (const x of [-0.5, 0.5]) k.box(0.08, 0.42, 0.3, C.steelDark, x, 0, 0);
    for (const x of [-0.25, 0.25]) k.mesh(new THREE.IcosahedronGeometry(0.11, 0), C.ink, x + 0.1, 0.11, 0.42);
    return { obj: g, colliders: [{ x: 0, z: 0, w: 1.4, d: 0.5 }] };
  },
  water_fountain() {
    const g = new THREE.Group(), k = kit(g);
    k.box(0.45, 0.95, 0.4, C.steel, 0, 0, 0); k.box(0.5, 0.08, 0.45, C.steelDark, 0, 0.95, 0);
    k.box(0.12, 0.08, 0.04, glow(0x7fd3ea), 0, 1.02, 0.1, { shadow: false });
    return { obj: g, colliders: [{ x: 0, z: 0, r: 0.3 }] };
  },
  chalk_board() {
    const g = new THREE.Group(), k = kit(g);
    k.box(1.0, 1.4, 0.06, C.wood, 0, 0, 0.12, { rx: 0.12 }); k.box(1.0, 1.4, 0.06, C.wood, 0, 0, -0.12, { rx: -0.12 });
    k.box(0.86, 1.1, 0.02, 0x2f3a34, 0, 0.18, 0.2, { rx: 0.12, shadow: false });
    for (let i = 0; i < 5; i++) k.box(0.3 + (i % 3) * 0.15, 0.04, 0.01, C.cream, -0.1, 0.4 + i * 0.17, 0.25 - i * 0.02, { rx: 0.12, shadow: false });
    return { obj: g, colliders: [{ x: 0, z: 0, w: 1.0, d: 0.5 }] };
  },
  bike_rack() {
    const g = new THREE.Group(), k = kit(g);
    for (let i = 0; i < 3; i++) k.mesh(new THREE.TorusGeometry(0.35, 0.03, 4, 10, Math.PI), C.steelDark, -0.6 + i * 0.6, 0, 0);
    const bike = new THREE.Group(); bike.position.set(-0.6, 0, 0.1); g.add(bike);
    const b = kit(bike);
    for (const z of [-0.5, 0.5]) b.mesh(new THREE.TorusGeometry(0.3, 0.035, 4, 12), C.ink, 0, 0.32, z, { ry: Math.PI / 2 });
    b.box(0.04, 0.04, 0.9, C.accent, 0, 0.55, 0); b.box(0.04, 0.4, 0.04, C.accent, 0, 0.32, -0.15);
    b.box(0.1, 0.04, 0.2, C.ink, 0, 0.75, -0.15); b.box(0.4, 0.04, 0.04, C.ink, 0, 0.8, 0.45);
    return { obj: g, colliders: [{ x: 0, z: 0, w: 1.8, d: 0.6 }] };
  },

  // ----- shared / placeholders -----
  project_bench() {
    const g = new THREE.Group(), k = kit(g);
    k.box(1.6, 0.08, 0.8, C.woodLight, 0, 0.82, 0);
    for (const x of [-0.7, 0.7]) for (const z of [-0.32, 0.32]) k.box(0.06, 0.82, 0.06, C.ink, x, 0, z);
    k.box(1.5, 0.04, 0.7, C.wood, 0, 0.3, 0);
    k.box(0.75, 0.5, 0.06, C.ink, 0, 0.92, -0.15); k.box(0.66, 0.4, 0.02, glow(C.amber), 0, 0.97, -0.11, { shadow: false });
    k.box(0.1, 0.12, 0.1, C.ink, 0, 0.9, -0.2);
    k.box(0.5, 0.03, 0.18, C.charcoal, 0, 0.9, 0.18); k.cyl(0.05, 0.05, 0.1, C.accent, 0.55, 0.9, 0.1, 6);
    return { obj: g, colliders: [{ x: 0, z: 0, w: 1.7, d: 0.9 }] };
  },
  district_placeholder({ w = 6, d = 5, h = 3.5, color = '#b3bcc6', title = '' }) {
    const g = new THREE.Group(), k = kit(g);
    const col = new THREE.Color(color).getHex();
    k.box(w + 0.5, 0.3, d + 0.5, C.plinth, 0, 0, 0);
    k.box(w, h, d, col, 0, 0.3, 0);
    k.box(w + 0.15, 0.2, d + 0.15, C.cream, 0, 0.3 + h * 0.62, 0, { shadow: false });
    k.box(w + 0.6, 0.3, d + 0.6, new THREE.Color(col).multiplyScalar(0.62).getHex(), 0, 0.3 + h, 0);
    if (w >= 3) {
      k.box(1.1, 1.9, 0.08, C.ink, 0, 0.3, d / 2 + 0.02);
      for (const x of [-w / 2 + 1, w / 2 - 1]) if (Math.abs(x) > 1) k.box(0.9, 0.7, 0.06, glow(C.amber), x, 0.3 + h * 0.3, d / 2 + 0.04, { shadow: false });
    }
    if (title) {
      const sw = Math.min(w + 0.4, 4);
      k.box(sw + 0.2, 0.62, 0.12, C.ink, 0, 0.3 + h + 0.3, d / 2 + 0.2);
      const s = signMesh(title.toUpperCase(), sw, 0.5, { size: 14, w: 160 });
      s.position.set(0, 0.3 + h + 0.61, d / 2 + 0.27); g.add(s);
    }
    return { obj: g, colliders: [{ x: 0, z: 0, w: w + 0.6, d: d + 0.6 }] };
  },

  // ----- Winter Campus -----
  faculty_building({ text = 'UNIVERSITY' } = {}) {
    // 14 m × 6.5 m, two storeys, neoclassical campus block. Front faces +z.
    const g = new THREE.Group(), k = kit(g);
    const W = 14, D = 6.5, H = 6.2, wall = 0xf4cf6a, trim = C.cream, roofC = 0x4f9c88;
    k.box(W + 0.6, 0.5, D + 0.6, 0x9a96a6, 0, 0, 0);                         // granite plinth
    k.box(W, H, D, wall, 0, 0.5, 0);
    k.box(W + 0.12, 0.22, D + 0.12, trim, 0, 0.5 + H * 0.48, 0);             // floor band
    k.box(W + 0.4, 0.35, D + 0.4, trim, 0, 0.5 + H - 0.1, 0);                // cornice
    for (let x = -W / 2 + 0.35; x <= W / 2; x += 2.2) k.box(0.32, H, 0.12, trim, x, 0.5, D / 2 + 0.03);
    // windows: two rows, white frames, blue glass, snow on the sills
    for (const y of [1.35, 4.25]) for (let x = -W / 2 + 1.45; x < W / 2 - 0.5; x += 2.2) {
      if (Math.abs(x) < 1.6) continue;
      k.box(0.95, 1.35, 0.08, trim, x, 0.5 + y - 0.1, D / 2 + 0.04);
      k.box(0.75, 1.15, 0.06, mat(0x9fd4ff, { emissive: 0x25507a, emissiveIntensity: 0.35 }), x, 0.5 + y, D / 2 + 0.08, { shadow: false });
      k.box(0.05, 1.15, 0.08, trim, x, 0.5 + y, D / 2 + 0.1, { shadow: false });
      k.box(1.05, 0.08, 0.22, C.snow, x, 0.5 + y - 0.12, D / 2 + 0.12, { shadow: false });
    }
    // pitched metal roof with snow cover
    const roof = new THREE.Shape(); roof.moveTo(-D / 2 - 0.4, 0); roof.lineTo(D / 2 + 0.4, 0); roof.lineTo(0, 2.0); roof.closePath();
    k.mesh(new THREE.ExtrudeGeometry(roof, { depth: W + 0.4, bevelEnabled: false }), roofC, (W + 0.4) / 2, 0.5 + H + 0.25, 0, { ry: -Math.PI / 2 });
    const snowRoof = new THREE.Shape(); snowRoof.moveTo(-D / 4 - 0.1, 1.0); snowRoof.lineTo(D / 4 + 0.1, 1.0); snowRoof.lineTo(0, 2.12); snowRoof.closePath();
    k.mesh(new THREE.ExtrudeGeometry(snowRoof, { depth: W + 0.5, bevelEnabled: false }), C.snow, (W + 0.5) / 2, 0.5 + H + 0.25, 0, { ry: -Math.PI / 2 });
    for (const x of [-4.5, 4.5]) { k.box(0.6, 1.4, 0.6, 0xc98b6a, x, 0.5 + H + 0.6, -0.8); k.box(0.7, 0.12, 0.7, C.snow, x, 0.5 + H + 2.0, -0.8); }
    // portico: steps, four columns, pediment with clock
    for (let i = 0; i < 3; i++) k.box(4.6 - i * 0.3, 0.17, 1.9 - i * 0.35, 0xd8d4de, 0, i * 0.17, D / 2 + 0.95 - i * 0.17);
    for (const x of [-1.65, -0.55, 0.55, 1.65]) { k.cyl(0.2, 0.22, 3.9, trim, x, 0.5, D / 2 + 1.2, 10); k.box(0.5, 0.15, 0.5, trim, x, 4.4, D / 2 + 1.2); }
    k.box(4.4, 0.4, 1.6, trim, 0, 4.55, D / 2 + 0.85);
    const ped = new THREE.Shape(); ped.moveTo(-2.3, 0); ped.lineTo(2.3, 0); ped.lineTo(0, 1.15); ped.closePath();
    k.mesh(new THREE.ExtrudeGeometry(ped, { depth: 1.5, bevelEnabled: false }), trim, 0, 4.95, D / 2 + 0.1);
    const clockBack = k.cyl(0.32, 0.32, 0.06, C.ink, 0, 0, D / 2 + 1.62, 12, { rx: Math.PI / 2 }); clockBack.position.y = 5.35;
    const clockFace = k.cyl(0.27, 0.27, 0.07, C.cream, 0, 0, D / 2 + 1.64, 12, { rx: Math.PI / 2 }); clockFace.position.y = 5.35;
    k.box(0.03, 0.2, 0.02, C.ink, 0, 5.32, D / 2 + 1.69, { shadow: false }); k.box(0.14, 0.03, 0.02, C.ink, 0.06, 5.35, D / 2 + 1.69, { shadow: false });
    // doors + name plaque
    k.box(1.6, 2.3, 0.1, C.wood, 0, 0.5, D / 2 + 0.05);
    k.box(0.04, 2.1, 0.12, C.ink, 0, 0.6, D / 2 + 0.07, { shadow: false });
    k.box(3.2, 0.5, 0.1, C.ink, 0, 3.3, D / 2 + 0.06);
    const sign = signMesh(String(text).toUpperCase(), 3.0, 0.4, { fg: '#ffd257', size: 22, w: 384, h: 52 });
    sign.position.set(0, 3.55, D / 2 + 0.12); g.add(sign);
    return { obj: g, colliders: [{ x: 0, z: 0, w: W + 0.6, d: D + 0.6 }, { x: 0, z: D / 2 + 1.2, w: 4.6, d: 0.6 }] };
  },
  birch({ scale = 1 }) {
    const g = new THREE.Group(), k = kit(g);
    k.cyl(0.11, 0.14, 2.4, 0xf5f2ea, 0, 0, 0, 6);
    for (let i = 0; i < 5; i++) k.box(0.1, 0.05, 0.24, C.ink, (i % 2 ? 0.07 : -0.07), 0.35 + i * 0.42, 0, { ry: i, shadow: false });
    k.box(0.06, 0.06, 0.9, 0xe8e2d6, 0.25, 1.9, 0, { ry: 0.6, rx: 0.5 });
    k.box(0.06, 0.06, 0.8, 0xe8e2d6, -0.2, 2.1, 0.1, { ry: -0.9, rx: -0.4 });
    k.mesh(new THREE.IcosahedronGeometry(0.75, 0), 0xc8d97a, 0.1, 2.7, 0);
    k.mesh(new THREE.IcosahedronGeometry(0.55, 0), 0xe0e89a, -0.25, 3.15, 0.1, { ry: 0.7 });
    k.mesh(new THREE.IcosahedronGeometry(0.38, 0), C.snow, 0, 3.45, 0);
    g.scale.setScalar(scale);
    return { obj: g, colliders: [{ x: 0, z: 0, r: 0.3 }] };
  },
  snow_pile({ scale = 1 }) {
    const g = new THREE.Group(), k = kit(g);
    const a = k.mesh(new THREE.IcosahedronGeometry(0.7, 0), C.snow, 0, 0.15, 0); a.scale.set(1.4, 0.55, 1);
    const b = k.mesh(new THREE.IcosahedronGeometry(0.45, 0), 0xe6eef8, 0.5, 0.15, 0.2); b.scale.set(1, 0.6, 1);
    g.scale.setScalar(scale);
    return { obj: g, colliders: [{ x: 0.1, z: 0, r: 0.8 * scale }] };
  },

  // ----- Memory Line station (the rail runs along the platform's +z side) -----
  station({ name = 'STATION' } = {}) {
    const g = new THREE.Group(), k = kit(g);
    const L = 9, Dp = 2.6, h = 0.32;
    k.box(L, h, Dp, C.concrete, 0, 0, 0);
    k.box(L, 0.02, 0.28, C.yellow, 0, h, Dp / 2 - 0.2, { shadow: false });   // safety edge
    for (let x = -L / 2 + 0.3; x < L / 2; x += 0.6) k.box(0.3, 0.021, 0.06, C.ink, x, h + 0.001, Dp / 2 - 0.42, { shadow: false });
    k.box(1.2, 0.16, Dp, C.concrete, -L / 2 - 0.6, 0, 0); k.box(1.2, 0.16, Dp, C.concrete, L / 2 + 0.6, 0, 0); // ramps
    for (const x of [-2.6, 2.6]) k.box(0.14, 2.8, 0.14, C.ink, x, h, -0.6);
    k.box(6.8, 0.16, 2.2, C.accent, 0, h + 2.8, -0.1);
    k.box(7.0, 0.08, 2.4, C.cream, 0, h + 2.96, -0.1);
    for (let x = -3; x <= 3; x += 1.5) k.box(0.9, 0.06, 0.06, glow(C.amber), x, h + 2.74, 0.4, { shadow: false });
    // hanging name sign
    k.box(0.04, 0.4, 0.04, C.ink, -0.9, h + 2.4, 0.5); k.box(0.04, 0.4, 0.04, C.ink, 0.9, h + 2.4, 0.5);
    k.box(2.6, 0.48, 0.1, C.ink, 0, h + 1.95, 0.5);
    const sn = signMesh(String(name).toUpperCase(), 2.4, 0.36, { fg: '#ffd257', size: 13, w: 192 });
    sn.position.set(0, h + 2.19, 0.56); g.add(sn);
    // departure board
    k.box(0.12, 1.6, 0.12, C.ink, 3.6, h, -0.8);
    k.box(1.4, 0.8, 0.14, C.ink, 3.6, h + 1.5, -0.8);
    const bd = signMesh('MEMORY LINE', 1.25, 0.62, { fg: '#ffc14d', bg: '#14121c', size: 11, w: 128, h: 64 });
    bd.position.set(3.6, h + 1.9, -0.72); g.add(bd);
    const b = KIT.bench({}); b.obj.position.set(-2.2, h, -0.7); g.add(b.obj);
    return {
      obj: g,
      colliders: [{ x: -2.6, z: -0.6, r: 0.15 }, { x: 2.6, z: -0.6, r: 0.15 }, { x: 3.6, z: -0.8, w: 1.4, d: 0.3 }, { x: -2.2, z: -0.7, w: 1.7, d: 0.6 }],
      floors: [{ x: 0, z: 0, w: L, d: Dp, h }],
    };
  },

  // ----- Monsoon Campus (Tamil Nadu college) -----
  college_building({ text = 'COLLEGE', subtitle = '', logo = '' } = {}) {
    // 11 m × 6 m block with a pillared veranda along the front (+z), red-oxide
    // plinth, cream walls, green shutters and a terracotta-tiled hipped roof.
    const g = new THREE.Group(), k = kit(g);
    const W = 11, D = 6, H = 4.2, wall = 0xf6e7c8, oxide = 0xb5523b, tile = 0xd06a3e, shutter = 0x3f9a72;
    k.box(W + 2.2, 0.45, D + 2.6, oxide, 0, 0, 0.6);                            // raised red-oxide plinth + veranda floor
    k.box(W + 2.3, 0.06, D + 2.7, 0x8f3e2c, 0, 0.45, 0.6, { shadow: false });
    k.box(W, H, D, wall, 0, 0.45, 0);
    k.box(W + 0.1, 0.5, D + 0.1, 0xe8d3a8, 0, 0.45, 0);                         // skirting
    // windows: green shutters, wooden frames
    for (const x of [-4.2, -2.4, 2.4, 4.2]) {
      k.box(1.1, 1.6, 0.08, C.wood, x, 1.3, D / 2 + 0.03);
      k.box(0.45, 1.4, 0.06, shutter, x - 0.26, 1.4, D / 2 + 0.08);
      k.box(0.45, 1.4, 0.06, shutter, x + 0.26, 1.4, D / 2 + 0.08);
      for (let y = 1.6; y < 2.7; y += 0.25) k.box(0.95, 0.03, 0.03, 0x2f7a58, x, y, D / 2 + 0.12, { shadow: false });
    }
    // central double door with a carved frame
    k.box(1.8, 2.7, 0.12, C.wood, 0, 0.45, D / 2 + 0.03);
    k.box(1.5, 2.4, 0.1, 0x7a4a2c, 0, 0.5, D / 2 + 0.08);
    k.box(0.04, 2.3, 0.12, C.amber, 0, 0.55, D / 2 + 0.12, { shadow: false });
    // veranda: square pillars carrying a deep sloping eave
    for (let x = -W / 2 - 0.6; x <= W / 2 + 0.7; x += 2.05) {
      k.box(0.36, 0.3, 0.36, oxide, x, 0.45, D / 2 + 1.55);
      k.box(0.26, H - 0.75, 0.26, C.cream, x, 0.75, D / 2 + 1.55);
      k.box(0.36, 0.18, 0.36, C.cream, x, H - 0.05, D / 2 + 1.55);
    }
    // eave: high against the wall, sloping down over the pillars (shape x maps to -z)
    const eave = new THREE.Shape(); eave.moveTo(0, 0); eave.lineTo(2.3, 0); eave.lineTo(2.3, 0.9); eave.closePath();
    k.mesh(new THREE.ExtrudeGeometry(eave, { depth: W + 2.2, bevelEnabled: false }), tile, -(W + 2.2) / 2, H + 0.1, D / 2 + 2.3, { ry: Math.PI / 2 });
    // main hipped roof
    const roof = new THREE.Shape(); roof.moveTo(-D / 2 - 0.7, 0); roof.lineTo(D / 2 + 0.7, 0); roof.lineTo(0, 2.3); roof.closePath();
    k.mesh(new THREE.ExtrudeGeometry(roof, { depth: W + 0.8, bevelEnabled: false }), tile, (W + 0.8) / 2, H + 0.45, 0, { ry: -Math.PI / 2 });
    for (let i = 0; i < 6; i++) k.box(W + 0.9, 0.05, 0.08, 0xa8502f, 0, H + 0.6 + i * 0.36, -D / 2 - 0.4 + i * 0.64 - 0.15, { shadow: false }); // tile courses (rear)
    for (let i = 0; i < 6; i++) k.box(W + 0.9, 0.05, 0.08, 0xa8502f, 0, H + 0.6 + i * 0.36, D / 2 + 0.4 - i * 0.64 + 0.15, { shadow: false }); // tile courses (front)
    k.box(W + 1.0, 0.16, 0.22, 0x8f3e2c, 0, H + 2.7, 0);                         // ridge
    // name board above the veranda: logo panel + two-line name
    const BW = 6.4, BH = 1.25, by = H + 0.85, bz = D / 2 + 2.3;
    k.box(BW + 0.2, BH + 0.2, 0.14, C.ink, 0, by, bz);
    const nameCanvas = document.createElement('canvas');
    nameCanvas.width = 384; nameCanvas.height = 80;
    const ng = nameCanvas.getContext('2d');
    ng.fillStyle = '#fff1d6'; ng.fillRect(0, 0, 384, 80);
    ng.fillStyle = '#2a2440'; ng.textAlign = 'center'; ng.textBaseline = 'middle';
    ng.font = '34px Silkscreen, monospace'; ng.fillText(String(text).toUpperCase(), 192, 30);
    ng.font = '15px Silkscreen, monospace'; ng.fillStyle = '#7a3b2c'; ng.fillText(String(subtitle).toUpperCase(), 192, 62);
    const nameTex = new THREE.CanvasTexture(nameCanvas); nameTex.colorSpace = THREE.SRGBColorSpace;
    const nameBoard = new THREE.Mesh(new THREE.PlaneGeometry(BW - BH - 0.1, BH), new THREE.MeshBasicMaterial({ map: nameTex }));
    nameBoard.position.set((BH + 0.1) / 2, by + BH / 2 + 0.1, bz + 0.08); nameBoard.userData.dynamic = true; g.add(nameBoard);
    // logo panel: shows public/<logo> when the file exists, a neutral emblem until then
    const logoCanvas = document.createElement('canvas');
    logoCanvas.width = logoCanvas.height = 96;
    const lg = logoCanvas.getContext('2d');
    lg.fillStyle = '#fff1d6'; lg.fillRect(0, 0, 96, 96);
    lg.strokeStyle = '#7a3b2c'; lg.lineWidth = 5; lg.beginPath(); lg.arc(48, 48, 38, 0, Math.PI * 2); lg.stroke();
    lg.fillStyle = '#7a3b2c'; lg.font = '26px Silkscreen, monospace'; lg.textAlign = 'center'; lg.textBaseline = 'middle'; lg.fillText('TCE', 48, 50);
    const logoMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(logoCanvas), transparent: true });
    logoMat.map.colorSpace = THREE.SRGBColorSpace;
    const logoPanel = new THREE.Mesh(new THREE.PlaneGeometry(BH, BH), logoMat);
    logoPanel.position.set(-BW / 2 + BH / 2, by + BH / 2 + 0.1, bz + 0.08); logoPanel.userData.dynamic = true; g.add(logoPanel);
    if (logo) {
      new THREE.TextureLoader().load(`${import.meta.env.BASE_URL || '/'}${String(logo).replace(/^\//, '')}`, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        logoMat.map = tex; logoMat.needsUpdate = true;
      }, undefined, () => { /* no logo file yet: keep the placeholder emblem */ });
    }
    // potted plants on the veranda
    for (const x of [-3.2, 3.2]) { k.cyl(0.25, 0.2, 0.45, 0xc8643c, x, 0.5, D / 2 + 0.6, 8); k.mesh(new THREE.IcosahedronGeometry(0.35, 0), C.leaf, x, 1.15, D / 2 + 0.6); }
    return { obj: g, colliders: [{ x: 0, z: 0, w: W + 0.4, d: D + 0.4 }, ...[-1, 1].map((s) => ({ x: s * (W / 2 + 0.6), z: D / 2 + 1.55, r: 0.25 }))], floors: [{ x: 0, z: D / 2 + 1.3, w: W + 2.2, d: 2.5, h: 0.45 }] };
  },
  gate_arch({ text = 'WELCOME' } = {}) {
    // Entrance arch spanning a 4 m path; the path runs along the piece's x axis.
    const g = new THREE.Group(), k = kit(g);
    for (const z of [-2.4, 2.4]) {
      k.box(0.9, 0.4, 0.9, 0xb5523b, 0, 0, z);
      k.box(0.7, 3.6, 0.7, C.cream, 0, 0.4, z);
      k.box(0.9, 0.25, 0.9, 0xd06a3e, 0, 4.0, z);
      k.mesh(new THREE.ConeGeometry(0.4, 0.6, 4), 0xd06a3e, 0, 4.55, z, { ry: Math.PI / 4 });
    }
    k.box(0.6, 0.5, 5.6, C.cream, 0, 3.6, 0);
    k.box(0.7, 0.14, 5.8, 0xd06a3e, 0, 4.1, 0);
    k.box(0.16, 0.8, 3.8, C.ink, 0.3, 2.85, 0);
    const sign = signMesh(String(text).toUpperCase(), 3.6, 0.62, { fg: '#2a2440', bg: '#ffe791', size: 20, w: 224, h: 38 });
    sign.rotation.y = Math.PI / 2; sign.position.set(0.39, 3.25, 0); g.add(sign);
    // marigold garland
    for (let i = 0; i < 11; i++) {
      const z = -2.0 + i * 0.4, y = 3.25 - Math.sin((i / 10) * Math.PI) * 0.45;
      k.mesh(new THREE.IcosahedronGeometry(0.09, 0), i % 2 ? C.amber : C.accent, 0.42, y, z, { shadow: false });
    }
    return { obj: g, colliders: [{ x: 0, z: -2.4, w: 0.9, d: 0.9 }, { x: 0, z: 2.4, w: 0.9, d: 0.9 }] };
  },
  banyan() {
    // Old banyan with a round stone platform to sit on (a campus meeting spot).
    const g = new THREE.Group(), k = kit(g);
    k.cyl(2.1, 2.2, 0.5, 0xc9b9a0, 0, 0, 0, 16);
    k.cyl(2.15, 2.15, 0.08, 0xb8aa8e, 0, 0.5, 0, 16);
    k.cyl(0.42, 0.6, 2.6, 0x7a5236, 0, 0.5, 0, 8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3, r = 1.2 + (i % 2) * 0.5;
      k.cyl(0.05, 0.07, 2.4, 0x8a6446, Math.cos(a) * r, 0.5, Math.sin(a) * r, 5);
    }
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; k.box(0.18, 0.18, 1.6, 0x7a5236, Math.cos(a) * 0.8, 2.9, Math.sin(a) * 0.8, { ry: -a + Math.PI / 2, rx: 0.4 }); }
    const crowns = [[0, 3.8, 0, 1.7, C.leafDark], [1.5, 3.4, 0.5, 1.2, C.leaf], [-1.4, 3.5, -0.4, 1.25, C.leafDark], [0.4, 3.3, -1.5, 1.1, C.leaf], [-0.5, 3.4, 1.5, 1.15, C.leaf], [0.2, 4.6, 0.2, 1.0, C.leaf]];
    for (const [x, y, z, r, c] of crowns) k.mesh(new THREE.IcosahedronGeometry(r, 0), c, x, y, z, { ry: x });
    return { obj: g, colliders: [{ x: 0, z: 0, r: 0.75 }], floors: [{ x: 0, z: 0, w: 2.8, d: 2.8, h: 0.55 }] };
  },
  tea_stall() {
    // Roadside tea stall: counter, striped awning, steaming kettle, glasses, bench.
    const g = new THREE.Group(), k = kit(g);
    k.box(2.6, 1.0, 1.2, 0x3f9a72, 0, 0, 0);
    k.box(2.7, 0.08, 1.3, C.woodLight, 0, 1.0, 0);
    k.box(2.4, 0.5, 0.06, C.cream, 0, 0.3, 0.62, { shadow: false });
    for (const x of [-1.25, 1.25]) for (const z of [-0.55, 0.55]) k.box(0.08, 2.3, 0.08, C.wood, x, 0, z);
    for (let i = 0; i < 6; i++) k.box(0.48, 0.08, 1.7, i % 2 ? C.cream : C.teal, -1.2 + i * 0.48, 2.3, 0.15, { rx: -0.12 });
    k.cyl(0.18, 0.22, 0.32, C.steel, -0.6, 1.08, -0.1, 8);
    k.box(0.22, 0.05, 0.05, C.steel, -0.35, 1.3, -0.1, { rz: 0.4 });
    for (let i = 0; i < 4; i++) k.cyl(0.05, 0.045, 0.14, 0xe6f2f7, 0.2 + i * 0.16, 1.08, 0.25, 6);
    k.box(1.2, 0.36, 0.08, C.ink, 0.3, 1.9, 0.6);
    const s = signMesh('TEA', 1.1, 0.3, { fg: '#ffe791', size: 16, w: 96 });
    s.position.set(0.3, 2.08, 0.65); g.add(s);
    const steam = [];
    for (let i = 0; i < 3; i++) { const p = k.mesh(new THREE.IcosahedronGeometry(0.08, 0), C.white, -0.6, 1.5, -0.1, { shadow: false }); p.userData.dynamic = true; steam.push(p); }
    const b = KIT.bench({}); b.obj.position.set(0, 0, 1.9); b.obj.rotation.y = Math.PI; g.add(b.obj);
    return {
      obj: g,
      colliders: [{ x: 0, z: 0, w: 2.8, d: 1.4 }, { x: 0, z: 1.9, w: 1.7, d: 0.6 }],
      animate: (t) => steam.forEach((p, i) => { const q = (t * 0.5 + i / 3) % 1; p.position.set(-0.6 + Math.sin(q * 6 + i) * 0.06, 1.45 + q * 0.7, -0.1); p.scale.setScalar(0.6 + q * 1.4); }),
    };
  },
  cycle_stand() {
    const g = new THREE.Group(), k = kit(g);
    k.box(3.2, 0.06, 0.12, C.steelDark, 0, 0.3, -0.35);
    const colors = [C.accent, C.teal, 0x2a2440];
    colors.forEach((c, i) => {
      const bike = new THREE.Group(); bike.position.set(-1.1 + i * 1.1, 0, 0); g.add(bike);
      const b = kit(bike);
      for (const z of [-0.5, 0.5]) b.mesh(new THREE.TorusGeometry(0.32, 0.035, 4, 12), C.ink, 0, 0.34, z, { ry: Math.PI / 2 });
      b.box(0.04, 0.04, 0.9, c, 0, 0.6, 0); b.box(0.04, 0.42, 0.04, c, 0, 0.34, -0.15);
      b.box(0.12, 0.04, 0.22, C.ink, 0, 0.78, -0.18); b.box(0.45, 0.04, 0.04, C.ink, 0, 0.84, 0.45);
      if (i === 1) b.box(0.3, 0.2, 0.25, C.woodLight, 0, 0.62, -0.55);
    });
    return { obj: g, colliders: [{ x: 0, z: 0, w: 3.4, d: 1.3 }] };
  },
  puddle({ scale = 1 } = {}) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.9, 10), mat(0x8fd6ea, { emissive: 0x24566a, emissiveIntensity: 0.4 }));
    m.rotation.x = -Math.PI / 2; m.scale.set(1.5 * scale, scale, 1); m.position.y = 0.012; m.receiveShadow = true;
    g.add(m);
    return { obj: g, colliders: [] };
  },

  // ----- The Garage (projects + tech stack) -----
  workshop({ text = 'THE GARAGE' } = {}) {
    // 10 m × 6 m workshop, front faces +z: one roller door open on a lit
    // workspace, one closed, a big sign, solar panels and an antenna on top.
    const g = new THREE.Group(), k = kit(g);
    const W = 10, D = 6, H = 4;
    const wall = 0x8fd3c5, rib = 0x6fbcad, trim = C.ink;
    k.box(W + 0.4, 0.25, D + 0.4, C.plinth, 0, 0, 0);
    k.box(W, H, D, wall, 0, 0.25, 0);
    for (let x = -W / 2 + 0.3; x < W / 2; x += 0.45) k.box(0.08, H - 0.3, 0.05, rib, x, 0.4, D / 2 + 0.02, { shadow: false });
    k.box(W + 0.3, 0.35, D + 0.3, trim, 0, H + 0.2, 0);                                // parapet
    for (let i = 0; i < 3; i++) { k.box(2.2, 0.08, 1.4, 0x3d5a8a, -3 + i * 2.6, H + 0.75, -0.8, { rx: -0.35 }); k.box(0.08, 0.5, 0.08, C.steelDark, -3 + i * 2.6, H + 0.4, -0.4); }
    k.box(0.08, 2.2, 0.08, C.steelDark, 4.2, H + 0.4, -2); k.box(0.7, 0.05, 0.05, C.steelDark, 4.2, H + 2.4, -2);
    // open bay (left): lit interior with a workbench and a monitor wall
    k.box(3.6, 3.1, 0.14, trim, -2.4, 0.25, D / 2 + 0.02);
    k.box(3.3, 2.9, 0.1, mat(0xfff0c8, { emissive: 0xffc46a, emissiveIntensity: 0.5 }), -2.4, 0.25, D / 2 - 0.5, { shadow: false });
    k.box(2.4, 0.08, 0.7, C.woodLight, -2.4, 1.1, D / 2 - 0.15);
    for (const x of [-3.2, -2.4, -1.6]) { k.box(0.6, 0.42, 0.05, C.ink, x, 1.7, D / 2 - 0.4); k.box(0.52, 0.34, 0.04, glow(x === -2.4 ? C.teal : C.amber), x, 1.74, D / 2 - 0.36, { shadow: false }); }
    for (let i = 0; i < 3; i++) k.box(3.6, 0.2, 0.08, i % 2 ? C.steel : 0xe3e8ef, -2.4, 3.05 - i * 0.2, D / 2 + 0.1);
    // closed bay (right): yellow roller door
    k.box(3.6, 3.1, 0.14, trim, 2.4, 0.25, D / 2 + 0.02);
    for (let i = 0; i < 9; i++) k.box(3.4, 0.3, 0.06, i % 2 ? C.yellow : 0xf7c84a, 2.4, 0.3 + i * 0.32, D / 2 + 0.1);
    for (let i = 0; i < 6; i++) k.box(0.4, 0.12, 0.02, C.ink, 1.0 + i * 0.56, 0.5, D / 2 + 0.14, { rz: 0.6, shadow: false });
    // sign
    k.box(5.6, 0.9, 0.14, trim, 0, H - 0.75, D / 2 + 0.12);
    const s = signMesh(String(text).toUpperCase(), 5.3, 0.7, { fg: '#2a2440', bg: '#fff1d6', size: 26, w: 256, h: 34 });
    s.position.set(0, H - 0.3, D / 2 + 0.21); g.add(s);
    k.box(0.3, 0.16, 0.24, glow(C.amber), -2.4, H - 1.05, D / 2 + 0.2, { shadow: false });
    // side details (camera side +x): AC unit + cable tray
    k.box(0.8, 1.0, 1.2, C.steel, W / 2 + 0.4, 0.25, -1); k.box(0.05, 0.6, 0.6, C.steelDark, W / 2 + 0.81, 0.45, -1);
    return { obj: g, colliders: [{ x: 0, z: 0, w: W + 0.5, d: D + 0.5 }, { x: W / 2 + 0.4, z: -1, w: 0.9, d: 1.3 }] };
  },
  skills_board() {
    // Freestanding pegboard of tools and coloured skill chips (opens the tech stack).
    const g = new THREE.Group(), k = kit(g);
    for (const x of [-1.05, 1.05]) k.box(0.12, 2.3, 0.12, C.ink, x, 0, 0);
    k.box(2.2, 1.5, 0.08, 0xd9a066, 0, 0.7, 0);
    for (let y = 0.85; y < 2.1; y += 0.2) for (let x = -0.95; x <= 0.95; x += 0.2) k.box(0.03, 0.03, 0.02, 0x8a5a36, x, y, 0.05, { shadow: false });
    const chips = [C.accent, C.teal, C.yellow, 0x6fa8dc, C.pink, 0x9b7fd1];
    chips.forEach((c, i) => k.box(0.42, 0.22, 0.04, c, -0.7 + (i % 3) * 0.7, 1.75 - Math.floor(i / 3) * 0.32, 0.07, { shadow: false }));
    k.box(0.08, 0.5, 0.04, C.steelDark, -0.6, 0.85, 0.07); k.box(0.3, 0.08, 0.04, C.steelDark, -0.6, 1.3, 0.07);
    k.box(0.5, 0.08, 0.04, C.accent, 0.1, 1.0, 0.07); k.box(0.1, 0.25, 0.04, C.ink, 0.35, 0.9, 0.07);
    k.cyl(0.1, 0.1, 0.04, C.steelDark, 0.7, 0.95, 0.07, 8, { rx: Math.PI / 2 });
    const s = signMesh('TECH STACK', 1.6, 0.3, { size: 14, w: 160 }); s.position.set(0, 2.38, 0.05); g.add(s);
    k.box(1.8, 0.4, 0.06, C.ink, 0, 2.2, 0);
    return { obj: g, colliders: [{ x: 0, z: 0, w: 2.3, d: 0.4 }] };
  },
  server_rack() {
    const g = new THREE.Group(), k = kit(g);
    k.box(0.8, 2.0, 0.8, C.ink, 0, 0, 0);
    const leds = [];
    for (let i = 0; i < 8; i++) {
      k.box(0.66, 0.16, 0.02, 0x3a3456, 0, 0.2 + i * 0.22, 0.41, { shadow: false });
      const l = k.box(0.06, 0.05, 0.02, glow(i % 3 ? C.teal : C.accent), -0.24 + (i % 2) * 0.1, 0.25 + i * 0.22, 0.43, { shadow: false });
      l.userData.dynamic = true; leds.push(l);
    }
    return { obj: g, colliders: [{ x: 0, z: 0, w: 0.9, d: 0.9 }], animate: (t) => leds.forEach((l, i) => { l.visible = Math.sin(t * (3 + i) + i * 2) > -0.3; }) };
  },

  // ----- Signal Tower (achievements + experience) -----
  lattice_tower() {
    const g = new THREE.Group(), k = kit(g);
    const H = 12;
    k.box(3.2, 0.4, 3.2, C.plinth, 0, 0, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = k.box(0.16, H, 0.16, C.accent, sx * 0.85, 0.4, sz * 0.85);
      leg.rotation.set(sz * 0.055, 0, -sx * 0.055);
    }
    for (let i = 1; i <= 7; i++) {
      const y = 0.4 + i * 1.55, w = 1.75 - i * 0.12;
      for (const sz of [-1, 1]) k.box(w * 2, 0.08, 0.08, C.cream, 0, y, sz * (w - 0.05));
      for (const sx of [-1, 1]) k.box(0.08, 0.08, w * 2, C.cream, sx * (w - 0.05), y, 0);
      k.box(w * 2.6, 0.05, 0.05, C.cream, 0, y - 0.75, w - 0.05, { rz: 0.55 * (i % 2 ? 1 : -1) });
    }
    k.box(1.6, 0.1, 1.6, C.ink, 0, H + 0.3, 0);
    const dish = k.mesh(new THREE.SphereGeometry(0.9, 10, 5, 0, Math.PI * 2, 0, Math.PI / 3), C.cream, 0.6, H - 1.5, 0.6, { rx: -1.0 });
    dish.rotation.y = 0.8;
    k.box(0.08, 1.6, 0.08, C.ink, 0, H + 0.4, 0);
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), mat(0xff4a4a, { emissive: 0xff2020, emissiveIntensity: 1, keep: true }));
    beacon.position.set(0, H + 2.1, 0); beacon.userData.dynamic = true; g.add(beacon);
    return { obj: g, colliders: [{ x: 0, z: 0, w: 3.0, d: 3.0 }], animate: (t) => { beacon.visible = Math.sin(t * 3) > 0; } };
  },
  radio_shack({ text = 'RADIO' } = {}) {
    const g = new THREE.Group(), k = kit(g);
    k.box(4.4, 0.25, 3.4, C.plinth, 0, 0, 0);
    k.box(4.0, 2.8, 3.0, C.cream, 0, 0.25, 0);
    k.box(4.4, 0.3, 3.4, C.accent, 0, 3.05, 0);
    k.box(1.0, 2.0, 0.08, 0x3d5a8a, -0.9, 0.25, 1.52);
    k.box(1.3, 0.9, 0.08, C.ink, 0.9, 1.3, 1.52); k.box(1.1, 0.7, 0.06, glow(C.amber), 0.9, 1.4, 1.56, { shadow: false });
    k.box(0.06, 2.4, 0.06, C.ink, 1.6, 3.3, -1); k.box(0.9, 0.04, 0.04, C.ink, 1.6, 5.4, -1); k.box(0.6, 0.04, 0.04, C.ink, 1.6, 5.0, -1);
    k.box(2.2, 0.5, 0.1, C.ink, 0, 2.45, 1.53);
    const s = signMesh(String(text).toUpperCase(), 2.0, 0.38, { size: 16, w: 160 }); s.position.set(0, 2.7, 1.6); g.add(s);
    return { obj: g, colliders: [{ x: 0, z: 0, w: 4.5, d: 3.5 }] };
  },
  trophy_case() {
    const g = new THREE.Group(), k = kit(g);
    k.box(2.4, 0.8, 0.9, C.wood, 0, 0, 0);
    k.box(2.4, 1.4, 0.9, mat(0xd6f0ff, { emissive: 0x2a4a5a, emissiveIntensity: 0.25 }), 0, 0.8, 0, { shadow: false });
    for (const x of [-1.18, 1.18]) k.box(0.06, 1.4, 0.92, C.ink, x, 0.8, 0);
    k.box(2.5, 0.12, 1.0, C.ink, 0, 2.2, 0);
    const gold = mat(0xffcf4a, { emissive: 0x6a4a00, emissiveIntensity: 0.4 });
    for (const [x, h] of [[-0.7, 0.55], [0, 0.75], [0.7, 0.45]]) {
      k.box(0.3, 0.1, 0.3, C.ink, x, 0.82, 0);
      k.cyl(0.05, 0.08, h * 0.5, gold, x, 0.92, 0, 6);
      k.cyl(0.2, 0.08, h * 0.45, gold, x, 0.92 + h * 0.5, 0, 8);
    }
    for (const x of [-0.7, 0, 0.7]) k.box(0.4, 0.14, 0.02, C.cream, x, 0.5, 0.46, { shadow: false });
    return { obj: g, colliders: [{ x: 0, z: 0, w: 2.5, d: 1.0 }] };
  },

  // ----- Lake Park (reflection) -----
  jetty({ length = 5 } = {}) {
    // Wooden jetty running along local −z from the origin, raised over water.
    const g = new THREE.Group(), k = kit(g);
    const L = length, h = 0.3;
    for (let z = 0; z < L; z += 0.45) k.box(1.8, 0.08, 0.38, z % 0.9 < 0.45 ? C.woodLight : 0xc98f5a, 0, h - 0.08, -z - 0.2);
    for (let z = 0; z <= L; z += 1.6) for (const x of [-0.85, 0.85]) k.box(0.14, 1.2, 0.14, C.wood, x, -0.8, -z);
    for (const x of [-0.85, 0.85]) k.box(0.06, 0.06, L, C.wood, x, h + 0.55, -L / 2);
    for (let z = 0; z <= L; z += 1.6) for (const x of [-0.85, 0.85]) k.box(0.08, 0.6, 0.08, C.wood, x, h, -z);
    const b = KIT.bench({}); b.obj.position.set(0, h, -L + 0.5); b.obj.rotation.y = Math.PI; g.add(b.obj);
    k.cyl(0.06, 0.06, 1.6, C.ink, 0.75, h, -L + 0.15, 6); k.box(0.24, 0.3, 0.24, glow(C.amber), 0.75, h + 1.55, -L + 0.15);
    return {
      obj: g,
      colliders: [{ x: 0, z: -L + 0.5, w: 1.7, d: 0.5 }, { x: 0.75, z: -L + 0.15, r: 0.12 }],
      floors: [{ x: 0, z: -L / 2, w: 1.8, d: L, h }],
    };
  },
  rowboat() {
    const g = new THREE.Group(), k = kit(g);
    const boat = new THREE.Group(); g.add(boat); boat.userData.dynamic = true;
    const b = kit(boat);
    b.box(0.9, 0.35, 2.0, C.cream, 0, 0, 0); b.box(0.8, 0.1, 1.9, 0x8fd6ea, 0, 0.3, 0, { shadow: false });
    b.box(0.95, 0.1, 2.05, C.accent, 0, 0.32, 0); b.box(0.8, 0.06, 0.3, C.wood, 0, 0.36, 0.2);
    b.box(0.06, 0.06, 1.2, C.wood, 0.5, 0.4, 0.1, { ry: 0.5 });
    return { obj: g, colliders: [], animate: (t) => { boat.position.set(Math.sin(t * 0.18) * 1.2, 0.02 + Math.sin(t * 1.3) * 0.03, Math.cos(t * 0.14) * 0.8); boat.rotation.y = Math.sin(t * 0.12) * 0.7; boat.rotation.z = Math.sin(t * 1.1) * 0.04; } };
  },
  ducks({ r = 3 } = {}) {
    const g = new THREE.Group();
    const ducks = [0, 1, 2].map((i) => {
      const d = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.22), mat(C.cream));
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.15, 0.14), mat(i ? 0x3f9a72 : C.cream));
      const beak = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.06), mat(C.amber));
      head.position.set(0.18, 0.15, 0); beak.position.set(0.28, 0.14, 0);
      d.add(body, head, beak); d.userData.dynamic = true; g.add(d); return d;
    });
    return { obj: g, colliders: [], animate: (t) => ducks.forEach((d, i) => { const a = t * 0.22 + i * 0.45; d.position.set(Math.cos(a) * r, 0.06 + Math.sin(t * 2 + i) * 0.02, Math.sin(a) * r); d.rotation.y = -a - Math.PI / 2; }) };
  },
  reeds({ scale = 1 } = {}) {
    const g = new THREE.Group(), k = kit(g);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.3, r = 0.15 + (i % 3) * 0.18, h = 0.7 + (i % 4) * 0.2;
      k.box(0.05, h, 0.05, i % 2 ? 0x7fae5a : 0x9ac46a, Math.cos(a) * r, 0, Math.sin(a) * r, { rz: (i % 3 - 1) * 0.12, shadow: false });
      if (i % 3 === 0) k.box(0.09, 0.22, 0.09, 0x8a5a36, Math.cos(a) * r, h - 0.1, Math.sin(a) * r, { shadow: false });
    }
    g.scale.setScalar(scale);
    return { obj: g, colliders: [] };
  },
  willow({ scale = 1 } = {}) {
    const g = new THREE.Group(), k = kit(g);
    k.cyl(0.18, 0.28, 2.0, C.trunk, 0, 0, 0, 7);
    k.mesh(new THREE.IcosahedronGeometry(1.2, 0), 0x9cc96a, 0, 2.6, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const c = k.mesh(new THREE.ConeGeometry(0.45, 2.0, 5), i % 2 ? 0xb4d77a : 0x8cbf62, Math.cos(a) * 1.1, 1.7, Math.sin(a) * 1.1, { rx: Math.PI });
      c.rotation.z = Math.cos(a) * 0.15;
    }
    g.scale.setScalar(scale);
    return { obj: g, colliders: [{ x: 0, z: 0, r: 0.4 }] };
  },

  // ----- Lighthouse (the ending) -----
  lighthouse() {
    // Striped tower with a gallery and lantern room. `api.setLit(true)` turns
    // on the lamp and the sweeping beam for the finale.
    const g = new THREE.Group(), k = kit(g);
    k.cyl(2.0, 2.3, 0.6, C.plinth, 0, 0, 0, 12);
    const levels = 6, segH = 1.5;
    for (let i = 0; i < levels; i++) {
      const r0 = 1.45 - i * 0.12, r1 = 1.45 - (i + 1) * 0.12;
      k.cyl(r1, r0, segH, i % 2 ? C.cream : 0xe2574a, 0, 0.6 + i * segH, 0, 12);
    }
    const top = 0.6 + levels * segH;
    k.cyl(1.25, 1.25, 0.18, C.ink, 0, top, 0, 14);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; k.box(0.05, 0.55, 0.05, C.ink, Math.cos(a) * 1.18, top + 0.18, Math.sin(a) * 1.18, { shadow: false }); }
    k.cyl(1.2, 1.2, 0.05, C.ink, 0, top + 0.72, 0, 14);
    const glass = mat(0xd6f0ff, { emissive: 0x30506a, emissiveIntensity: 0.3, keep: true });
    const lantern = k.cyl(0.7, 0.7, 1.1, glass, 0, top + 0.18, 0, 10);
    lantern.userData.dynamic = true;
    k.mesh(new THREE.ConeGeometry(0.95, 0.8, 10), 0xe2574a, 0, top + 1.68, 0);
    k.cyl(0.08, 0.08, 0.5, C.ink, 0, top + 2.05, 0, 6);
    k.box(0.9, 1.6, 0.1, 0x3d5a8a, 0, 0.6, 1.4); k.box(0.9, 0.12, 0.3, C.ink, 0, 2.2, 1.45);
    for (const y of [3.4, 6.2]) k.box(0.4, 0.55, 0.08, glow(C.amber), 0, y, 1.38 - y * 0.06, { shadow: false });
    // beam: two long translucent wedges that sweep when lit
    const beam = new THREE.Group(); beam.position.y = top + 0.75; beam.visible = false; beam.userData.dynamic = true; g.add(beam);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    for (const s of [1, -1]) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.9, 6, 10, 1, true), beamMat);
      b.rotation.z = (s * Math.PI) / 2; b.position.x = s * 3; beam.add(b);
    }
    let lit = false;
    const api = {
      setLit(on) {
        lit = on; beam.visible = on;
        lantern.material = on ? mat(0xfff1b0, { emissive: 0xffd36a, emissiveIntensity: 1.2, keep: true }) : glass;
      },
      get lit() { return lit; },
    };
    return { obj: g, colliders: [{ x: 0, z: 0, r: 2.1 }], api, animate: (t) => { if (lit) beam.rotation.y = t * 0.9; } };
  },
  cottage() {
    const g = new THREE.Group(), k = kit(g);
    k.box(5.0, 0.25, 4.0, C.plinth, 0, 0, 0);
    k.box(4.6, 2.6, 3.6, C.cream, 0, 0.25, 0);
    const roof = new THREE.Shape(); roof.moveTo(-2.2, 0); roof.lineTo(2.2, 0); roof.lineTo(0, 1.6); roof.closePath();
    k.mesh(new THREE.ExtrudeGeometry(roof, { depth: 5.0, bevelEnabled: false }), 0x3d6fa8, 2.5, 2.85, 0, { ry: -Math.PI / 2 });
    k.box(0.9, 1.8, 0.08, 0xe2574a, -1.0, 0.25, 1.82);
    for (const x of [0.6, 1.6]) { k.box(0.7, 0.7, 0.08, C.ink, x, 1.2, 1.82); k.box(0.56, 0.56, 0.06, glow(C.amber), x, 1.27, 1.86, { shadow: false }); }
    k.box(0.5, 1.0, 0.5, 0xc8553d, 1.4, 3.5, -0.6);
    k.cyl(0.3, 0.25, 0.4, 0xc8643c, -2.0, 0.25, 2.2, 8); k.mesh(new THREE.IcosahedronGeometry(0.32, 0), C.pink, -2.0, 0.9, 2.2);
    return { obj: g, colliders: [{ x: 0, z: 0, w: 5.0, d: 4.0 }] };
  },

  // ----- City Park life -----
  food_cart() {
    const g = new THREE.Group(), k = kit(g);
    k.box(1.8, 0.9, 1.0, C.yellow, 0, 0.3, 0);
    k.box(1.9, 0.08, 1.1, C.cream, 0, 1.2, 0);
    for (const x of [-0.6, 0.6]) { const w = k.cyl(0.3, 0.3, 0.12, C.ink, x, 0, 0.55, 10, { rx: Math.PI / 2 }); w.position.y = 0.3; }
    k.cyl(0.04, 0.04, 1.6, C.ink, 0, 1.2, 0, 6);
    k.mesh(new THREE.ConeGeometry(1.4, 0.5, 8), C.accent, 0, 3.0, 0);
    k.box(1.2, 0.3, 0.06, C.ink, 0, 0.75, 0.52);
    const s = signMesh('SNACKS', 1.1, 0.26, { fg: '#ffe791', size: 13, w: 112 }); s.position.set(0, 0.9, 0.56); g.add(s);
    return { obj: g, colliders: [{ x: 0, z: 0, w: 1.9, d: 1.2 }] };
  },
  picnic_blanket() {
    const g = new THREE.Group(), k = kit(g);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) k.box(0.5, 0.02, 0.5, (i + j) % 2 ? C.cream : 0xe2574a, -0.75 + i * 0.5, 0.02, -0.75 + j * 0.5, { shadow: false });
    k.box(0.5, 0.3, 0.35, C.woodLight, 0.5, 0.04, -0.4); k.box(0.5, 0.05, 0.05, C.wood, 0.5, 0.42, -0.4);
    k.cyl(0.08, 0.08, 0.2, C.accent, -0.4, 0.04, 0.3, 8);
    return { obj: g, colliders: [{ x: 0.5, z: -0.4, r: 0.35 }] };
  },

  // ----- Garage project bay (one project per bay) -----
  project_bay() {
    // 5.2 m x 5.0 m painted bay. The display board at the back faces the camera;
    // world.js puts the project's title card (or its image) on board.screen.
    const g = new THREE.Group(), k = kit(g);
    const W = 5.2, D = 5.0;
    for (const [x, z, w, d] of [[0, -D / 2, W, 0.12], [0, D / 2, W, 0.12], [-W / 2, 0, 0.12, D], [W / 2, 0, 0.12, D]]) k.box(w, 0.02, d, C.yellow, x, 0.01, z, { shadow: false });
    for (const sx of [-1, 1]) k.box(0.5, 0.02, 0.12, C.yellow, sx * (W / 2 - 0.45), 0.012, D / 2 - 0.4, { shadow: false, ry: sx * 0.8 });
    // display board on two posts
    for (const x of [-1.6, 1.6]) k.box(0.14, 3.6, 0.14, C.ink, x, 0, -1.9);
    k.box(3.5, 2.1, 0.14, C.ink, 0, 1.4, -1.9);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.86), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    screen.position.set(0, 2.45, -1.82); screen.userData.dynamic = true; g.add(screen);
    k.box(3.6, 0.12, 0.3, C.accent, 0, 3.5, -1.9);
    // workbench
    const b = KIT.project_bench({}); b.obj.position.set(0, 0, -0.35); g.add(b.obj);
    k.box(0.5, 0.5, 0.5, C.woodLight, 1.9, 0, -1.2); k.box(0.4, 0.35, 0.4, C.wood, 1.95, 0.5, -1.2);
    return {
      obj: g, screen,
      colliders: [{ x: -1.6, z: -1.9, r: 0.14 }, { x: 1.6, z: -1.9, r: 0.14 }, { x: 0, z: -0.35, w: 1.7, d: 0.9 }, { x: 1.9, z: -1.2, w: 0.55, d: 0.55 }],
    };
  },

  // ===== Garage: inventor's workshop =====
  // Pieces animate with (t, state): state.playerPos is Nathan's position and
  // state.reduceMotion respects the OS "reduce motion" setting.

  workshop_canopy({ w = 13.6, d = 20.8 } = {}) {
    // Open-sided steel canopy: pillars with warm lamps and a light eave frame
    // always show; trusses, roof and hanging lamps sit in one group that fades
    // away while Nathan is underneath, so the fixed camera always sees inside.
    const g = new THREE.Group(), k = kit(g);
    const H = 3.4, hw = w / 2, hd = d / 2;
    const pillars = [];
    for (const x of [-hw, hw]) for (const z of [-hd, 0, hd]) pillars.push([x, z]);
    const lampMat = mat(C.amber, { emissive: C.amber, emissiveIntensity: 0.8 });
    for (const [x, z] of pillars) {
      k.box(0.36, 0.25, 0.36, C.plinth, x, 0, z);
      k.box(0.2, H, 0.2, C.charcoal, x, 0.25, z);
      k.box(0.22, 0.06, 0.22, C.accent, x, 1.2, z, { shadow: false });           // safety band
      const inX = x < 0 ? 0.14 : -0.14;
      k.box(0.12, 0.18, 0.16, lampMat, x + inX, 2.5, z, { shadow: false });         // pillar lamp
    }
    for (const x of [-hw, hw]) k.box(0.16, 0.18, d + 0.3, C.charcoal, x, H + 0.15, 0);
    for (const z of [-hd, hd]) k.box(w + 0.3, 0.18, 0.16, C.charcoal, 0, H + 0.15, z);

    // fading upper structure
    const upper = new THREE.Group(); upper.userData.dynamic = true; g.add(upper);
    const fadeMats = [];
    const fm = (color, extra = {}) => { const m = new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: true, opacity: 1, ...extra }); fadeMats.push(m); return m; };
    const steel = fm(0x8a9ab3), roofM = fm(0xb8c4d6), ribM = fm(0x9aa8bf), cord = fm(C.ink), bulb = fm(C.amber, { emissive: C.amber, emissiveIntensity: 0.8 });
    const add = (geo, m, x, y, z, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.z = rz; o.castShadow = m === roofM; upper.add(o); return o; };
    for (let i = 0; i <= 4; i++) {
      const z = -hd + (i * d) / 4;
      add(new THREE.BoxGeometry(w, 0.1, 0.1), steel, 0, H + 0.3, z);
      for (const sgn of [-1, 1]) add(new THREE.BoxGeometry(hw + 0.2, 0.08, 0.08), steel, sgn * hw / 2, H + 0.7, z, sgn * -0.17);
    }
    add(new THREE.BoxGeometry(0.12, 0.12, d), steel, 0, H + 1.08, 0);
    for (const sgn of [-1, 1]) {
      add(new THREE.BoxGeometry(hw + 0.5, 0.07, d + 0.5), roofM, sgn * (hw / 2 + 0.1), H + 0.8, 0, sgn * -0.17);
      for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.05, 0.05, d + 0.5), ribM, sgn * (0.8 + i * (hw / 5)), H + 0.9 - i * (hw / 5) * 0.17, 0);
    }
    for (const x of [-hw / 2, hw / 2]) for (const z of [-hd / 2, hd / 2]) {
      add(new THREE.BoxGeometry(0.03, 0.5, 0.03), cord, x, H + 0.05, z);
      add(new THREE.CylinderGeometry(0.1, 0.24, 0.16, 8), cord, x, H - 0.25, z);
      add(new THREE.BoxGeometry(0.14, 0.1, 0.14), bulb, x, H - 0.36, z);
    }
    const pools = [];
    for (const [x, z] of [[-hw / 2, -hd / 2], [hw / 2, -hd / 2], [-hw / 2, hd / 2], [hw / 2, hd / 2], [0, 0]]) {
      const pool = lightPool(2.6, 0xffd08a); pool.position.set(x, 0.09, z); g.add(pool); pools.push(pool);
    }
    let fade = 1;
    return {
      obj: g,
      colliders: pillars.map(([x, z]) => ({ x, z, r: 0.24 })),
      nightGlow: pools,
      animate: (t, state) => {
        const p = state.playerPos;
        const lx = p ? p.x - g.position.x : 1e9, lz = p ? p.z - g.position.z : 1e9; // canopy is placed unrotated
        const inside = Math.abs(lx) < hw + 2 && Math.abs(lz) < hd + 2;
        fade += ((inside ? 0 : 1) - fade) * 0.12;
        for (const m of fadeMats) { m.opacity = fade; m.depthWrite = fade > 0.95; }
        upper.visible = fade > 0.02;
      },
    };
  },

  tool_wall({ len = 8, variant = 0 } = {}) {
    // Low workshop wall along local x, facing +z: pegboard, shelves, tools, cables.
    const g = new THREE.Group(), k = kit(g);
    k.box(len, 2.2, 0.28, 0xd8c3a0, 0, 0, -0.14);                              // plank wall
    for (let x = -len / 2 + 0.4; x < len / 2; x += 0.8) k.box(0.04, 2.2, 0.3, 0xb99c74, x, 0, -0.13, { shadow: false });
    k.box(len + 0.1, 0.12, 0.34, C.wood, 0, 2.2, -0.14);
    // shelves with jars / boxes / spools
    const cols = [C.accent, C.teal, C.yellow, 0x6fa8dc, C.pink, C.cream];
    for (let sx = -len / 2 + 0.9, i = 0; sx < len / 2 - 0.6; sx += 2.6, i++) {
      for (const y of [1.05, 1.65]) {
        k.box(1.8, 0.06, 0.32, C.wood, sx, y, 0.12);
        for (let j = 0; j < 4; j++) k.box(0.22, 0.24, 0.2, cols[(i + j + (y > 1.2 ? 2 : 0)) % cols.length], sx - 0.6 + j * 0.4, y + 0.06, 0.13);
      }
      // pegboard with tools between shelf groups
      const px = sx + 1.3;
      if (px < len / 2 - 0.6) {
        k.box(0.9, 0.9, 0.04, 0xd9a066, px, 0.95, 0.02);
        k.box(0.06, 0.5, 0.04, C.steelDark, px - 0.25, 1.2, 0.06); k.box(0.3, 0.08, 0.04, C.steelDark, px - 0.25, 1.62, 0.06); // hammer
        k.box(0.5, 0.06, 0.04, C.accent, px + 0.1, 1.45, 0.06);                                                          // wrench
        k.box(0.08, 0.36, 0.04, C.yellow, px + 0.3, 1.0, 0.06);                                                          // screwdriver
      }
    }
    // floor-level detail: cable reels, a toolbox, a crate
    const fx = variant ? len / 2 - 1.2 : -len / 2 + 1.2;
    k.cyl(0.32, 0.32, 0.18, C.wood, fx, 0, 0.35, 10, { rx: Math.PI / 2 }).position.y = 0.32;
    k.cyl(0.2, 0.2, 0.2, C.ink, fx, 0, 0.35, 10, { rx: Math.PI / 2 }).position.y = 0.32;
    k.box(0.7, 0.4, 0.35, C.accent, -fx * 0.4, 0, 0.3); k.box(0.72, 0.06, 0.37, C.ink, -fx * 0.4, 0.4, 0.3);
    // a cable drooping along the wall
    for (let i = 0; i < 10; i++) k.box(len / 10, 0.04, 0.04, C.ink, -len / 2 + (i + 0.5) * (len / 10), 2.0 - Math.sin((i / 9) * Math.PI) * 0.25, 0.03, { shadow: false });
    return { obj: g, colliders: [{ x: 0, z: 0.05, w: len, d: 0.75 }] };
  },

  exhibit_aratro() {
    // Tabletop diorama: farm field -> dirt road -> warehouse, a delivery truck,
    // grain sacks and a floating blockchain that "verifies" each delivery.
    // Activates (crops sway, truck drives, blocks light up in sequence) when
    // Nathan comes within ~4.5 m.
    const g = new THREE.Group(), k = kit(g);
    const TW = 4.6, TD = 3.8, TH = 0.75;
    // display table
    k.box(TW, 0.12, TD, C.wood, 0, TH - 0.12, 0);
    for (const x of [-TW / 2 + 0.2, TW / 2 - 0.2]) for (const z of [-TD / 2 + 0.2, TD / 2 - 0.2]) k.box(0.14, TH - 0.12, 0.14, C.wood, x, 0, z);
    k.box(TW - 0.4, 0.06, TD - 0.4, C.woodLight, 0, 0.18, 0);
    const top = TH;
    k.box(TW - 0.1, 0.1, TD - 0.1, 0x9fd46a, 0, top, 0);                      // grass board
    // dirt road along the front
    k.box(TW - 0.4, 0.03, 0.55, 0xd9b27a, 0, top + 0.1, 1.05, { shadow: false });
    // field: soil + crop rows (left)
    k.box(1.9, 0.06, 1.9, 0x8a5a36, -1.1, top + 0.1, -0.55);
    const crops = new THREE.Group(); crops.position.set(-1.1, top + 0.16, -0.55); crops.userData.dynamic = true; g.add(crops);
    const wheat = mat(0xe8c35a), green = mat(C.leaf);
    const cropList = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32 + ((r + c) % 3) * 0.05, 0.1), r % 2 ? green : wheat);
      m.position.set(-0.72 + c * 0.36, 0.16, -0.66 + r * 0.44); m.castShadow = true; crops.add(m); cropList.push(m);
    }
    // little fence
    for (let i = 0; i < 6; i++) k.box(0.05, 0.22, 0.05, C.cream, -2.05 + i * 0.38, top + 0.1, 0.5);
    k.box(1.95, 0.04, 0.04, C.cream, -1.1, top + 0.24, 0.5);
    // warehouse (right back)
    const wx = 1.25, wz = -0.75;
    k.box(1.6, 0.9, 1.3, C.cream, wx, top + 0.1, wz);
    const roofShape = new THREE.Shape(); roofShape.moveTo(-0.75, 0); roofShape.lineTo(0.75, 0); roofShape.lineTo(0, 0.45); roofShape.closePath();
    k.mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 1.75, bevelEnabled: false }), C.terracotta, wx + 0.875, top + 1.0, wz, { ry: -Math.PI / 2 });
    k.box(0.5, 0.6, 0.04, C.ink, wx - 0.2, top + 0.1, wz + 0.66);
    k.box(0.34, 0.2, 0.04, glow(C.amber), wx + 0.45, top + 0.55, wz + 0.66, { shadow: false });
    // grain sacks by the warehouse door
    const sack = mat(0xe9d4a7);
    for (const [x, y, z] of [[0.3, 0, 0.2], [0.55, 0, 0.25], [0.42, 0.18, 0.22], [0.75, 0, 0.1]]) {
      const s2 = k.mesh(new THREE.IcosahedronGeometry(0.13, 0), sack, x, top + 0.22 + y, z); s2.scale.set(1.2, 0.8, 1);
    }
    // truck on the road
    const truck = new THREE.Group(); truck.userData.dynamic = true; g.add(truck);
    const tk = kit(truck);
    tk.box(0.36, 0.3, 0.34, C.accent, 0.22, 0.08, 0);                          // cab
    tk.box(0.2, 0.14, 0.3, 0xbfe6ff, 0.3, 0.26, 0, { shadow: false });         // windshield
    tk.box(0.5, 0.12, 0.38, C.wood, -0.2, 0.08, 0);                            // bed
    tk.box(0.5, 0.1, 0.04, C.wood, -0.2, 0.2, 0.17); tk.box(0.5, 0.1, 0.04, C.wood, -0.2, 0.2, -0.17);
    for (const x of [-0.3, -0.12]) tk.mesh(new THREE.IcosahedronGeometry(0.08, 0), sack, x, 0.28, 0);
    for (const x of [-0.3, 0.22]) for (const z of [-0.18, 0.18]) { const w2 = tk.cyl(0.07, 0.07, 0.05, C.ink, x, 0, z, 8, { rx: Math.PI / 2 }); w2.position.y = 0.07; }
    truck.scale.setScalar(1.5); truck.position.set(-1.6, top + 0.1, 1.05);
    // blockchain: four blocks linked above the diorama
    const chain = new THREE.Group(); chain.position.set(0, top + 2.0, -0.6); chain.userData.dynamic = true; g.add(chain);
    const blocks = [];
    for (let i = 0; i < 4; i++) {
      const bm = new THREE.MeshLambertMaterial({ color: 0x5a6b8a, emissive: 0x000000, flatShading: true });
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), bm);
      b.position.set(-1.35 + i * 0.9, 0, 0); b.castShadow = true; chain.add(b); blocks.push(b);
      if (i < 3) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.07), mat(C.steel)); l.position.set(-0.9 + i * 0.9, 0, 0); chain.add(l); }
    }
    const check = new THREE.Group(); check.position.set(1.35, 0.62, 0); check.scale.setScalar(1.6); chain.add(check);
    const cm = new THREE.MeshBasicMaterial({ color: 0x5fe08a, transparent: true, opacity: 0 });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.06), cm); c1.position.set(-0.06, -0.03, 0); c1.rotation.z = 0.8;
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.06), cm); c2.position.set(0.07, 0.04, 0); c2.rotation.z = -0.55;
    check.add(c1, c2);
    // trophy (Hack Odyssey 2K25) on the front-right corner
    const gold = mat(0xffcf4a, { emissive: 0x6a4a00, emissiveIntensity: 0.4 });
    k.box(0.26, 0.08, 0.26, C.ink, 1.85, top + 0.1, 1.4);
    k.cyl(0.04, 0.06, 0.16, gold, 1.85, top + 0.18, 1.4, 6);
    k.cyl(0.14, 0.06, 0.2, gold, 1.85, top + 0.34, 1.4, 8);
    // little wooden name sign (front-left)
    k.box(0.06, 0.4, 0.06, C.wood, -1.95, top + 0.1, 1.45);
    k.box(0.9, 0.26, 0.05, C.wood, -1.6, top + 0.36, 1.45);
    const sign = signMesh('ARATRO', 0.84, 0.2, { fg: '#fff1d6', bg: '#8b5a3c', size: 16, w: 128, h: 32 });
    sign.position.set(-1.6, top + 0.49, 1.48); g.add(sign);

    let act = 0, phase = 0;
    return {
      obj: g,
      colliders: [{ x: 0, z: 0, w: TW, d: TD }],
      animate: (t, state) => {
        const p = state.playerPos;
        const near = p && Math.hypot(p.x - g.position.x, p.z - g.position.z) < 4.6;
        act += ((near ? 1 : 0) - act) * 0.06;
        const live = state.reduceMotion ? 0 : act;
        phase += live * 0.016;
        // crops sway
        cropList.forEach((m, i) => { m.rotation.z = Math.sin(t * 2.2 + i * 0.7) * 0.12 * live; });
        // truck: farm -> warehouse -> back, easing at each end
        const u = (Math.sin(phase * 1.6) + 1) / 2;
        const x = -1.6 + u * 2.4;
        const dir = Math.cos(phase * 1.6) >= 0 ? 1 : -1;
        truck.position.x = x; truck.rotation.y = dir > 0 ? 0 : Math.PI;
        truck.position.y = top + 0.1 + Math.abs(Math.sin(t * 18)) * 0.012 * live;
        // blockchain verification: blocks light in sequence, then a green check
        const cyc = (t * 0.9) % 6;
        blocks.forEach((b, i) => {
          const on = live > 0.05 && cyc > i * 0.9;
          b.material.color.setHex(on ? 0x3fe0c8 : 0x6f7f9c);
          b.material.emissive.setHex(on ? 0x1a8f80 : 0x000000);
          b.position.y = on ? Math.max(0, Math.sin((cyc - i * 0.9) * 6) * 0.06) : 0;
        });
        cm.opacity = live > 0.05 && cyc > 3.6 ? Math.min(1, (cyc - 3.6) * 2) * live : 0;
        chain.position.y = top + 2.0 + Math.sin(t * 1.4) * 0.05;
      },
    };
  },

  exhibit_covered({ w = 3.6, d = 3.0 } = {}) {
    // Placeholder exhibit: a plinth with a tarp over the build ("in progress").
    const g = new THREE.Group(), k = kit(g);
    const TH = 0.75;
    k.box(w, 0.12, d, C.wood, 0, TH - 0.12, 0);
    for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) for (const z of [-d / 2 + 0.2, d / 2 - 0.2]) k.box(0.14, TH - 0.12, 0.14, C.wood, x, 0, z);
    const tarp = 0xdccdaa;
    k.box(w - 0.6, 0.9, d - 0.6, tarp, 0, TH, 0);
    k.box(w - 0.4, 0.5, d - 0.4, 0xc9b78f, 0, TH, 0);
    k.mesh(new THREE.IcosahedronGeometry(0.55, 0), tarp, -0.4, TH + 1.0, -0.1).scale.set(1.3, 0.6, 1);
    k.mesh(new THREE.IcosahedronGeometry(0.4, 0), 0xe6d9bb, 0.5, TH + 0.95, 0.2).scale.set(1.2, 0.6, 1);
    for (const x of [-w / 2 + 0.4, w / 2 - 0.4]) k.box(0.05, 0.05, d - 0.3, C.yellow, x, TH + 0.05, 0, { shadow: false }); // tie-down straps
    k.box(0.5, 0.3, 0.04, C.yellow, w / 2 - 0.5, TH + 0.2, d / 2 - 0.28);       // "WIP" tag
    k.box(0.32, 0.06, 0.05, C.ink, w / 2 - 0.5, TH + 0.32, d / 2 - 0.25, { shadow: false });
    return { obj: g, colliders: [{ x: 0, z: 0, w, d }] };
  },

  exhibit_microservices() {
    // Mini data centre: server racks with blinking LEDs, a Kubernetes-style helm
    // wheel, container stack, a live dashboard and a security beacon. On approach
    // the LEDs blink, bars move, and every few seconds an alert fires and the
    // shield resolves it.
    const g = new THREE.Group(), k = kit(g);
    const TW = 4.2, TD = 3.4, y = exhibitTable(k, TW, TD, 0x5d6b85);
    for (let i = -1; i <= 1; i++) k.box(TW - 0.3, 0.01, 0.03, 0x4a5670, 0, y, i * 1.0, { shadow: false });
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    // racks
    const rackX = [-1.45, -0.85, -0.25];
    for (const x of rackX) {
      k.box(0.52, 1.25, 0.55, 0x2e3550, x, y, -0.95);
      k.box(0.44, 0.04, 0.57, 0x3c4566, x, y + 1.25, -0.95);
      for (let r = 0; r < 6; r++) k.box(0.42, 0.03, 0.02, 0x46507a, x, y + 0.14 + r * 0.17, -0.67, { shadow: false });
    }
    const ledCount = rackX.length * 6 * 3;
    const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff }), ledCount);
    const tmp = new THREE.Object3D(), col = new THREE.Color();
    let n = 0;
    rackX.forEach((x) => { for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) {
      tmp.position.set(x - 0.13 + c * 0.08, y + 0.22 + r * 0.17, -0.66); tmp.updateMatrix(); leds.setMatrixAt(n, tmp.matrix); leds.setColorAt(n, col.setHex(0x5fe08a)); n++;
    } });
    dyn.add(leds);
    // cables racks -> dashboard
    for (const x of rackX) k.box(0.04, 0.03, 0.75, C.ink, x + 0.12, y, -0.3, { shadow: false });
    k.box(1.85, 0.03, 0.04, C.ink, -0.42, y, 0.08, { shadow: false });
    // helm wheel floating above the racks
    const wheel = new THREE.Group(); wheel.position.set(-0.85, y + 1.95, -0.95); wheel.rotation.y = Math.PI / 4; dyn.add(wheel);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 7), mat(0x4f7fe0, { emissive: 0x1d3a80, emissiveIntensity: 0.5 }));
    rim.rotation.x = Math.PI / 2; wheel.add(rim);
    const spokes = new THREE.Group(); wheel.add(spokes);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.05), mat(C.white));
      sp.position.set(Math.sin(a) * 0.17, Math.cos(a) * 0.17, 0.06); sp.rotation.z = -a; spokes.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 8), mat(C.white)); hub.rotation.x = Math.PI / 2; spokes.add(hub);
    // container stack (Docker)
    for (const [x, yy, c] of [[0.2, 0, 0x2bb3a3], [0.72, 0, 0x4f7fe0], [0.46, 0.22, C.amber]]) {
      k.box(0.48, 0.22, 0.3, c, x - 0.2, y + yy, 0.95);
      for (let i = 0; i < 4; i++) k.box(0.02, 0.18, 0.31, 0x2a2440, x - 0.38 + i * 0.12, y + yy + 0.02, 0.95, { shadow: false });
    }
    // dashboard monitor with live bars
    const dx = 1.15, dz = -0.55;
    k.box(0.1, 0.5, 0.1, C.ink, dx, y, dz); k.box(0.5, 0.05, 0.3, C.ink, dx, y, dz);
    k.box(1.5, 0.95, 0.08, C.ink, dx, y + 0.5, dz);
    k.box(1.38, 0.83, 0.02, 0x14202e, dx, y + 0.56, dz + 0.05, { shadow: false });
    const bars = [], barMat = new THREE.MeshBasicMaterial({ color: 0x3fe0c8 });
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.BoxGeometry(0.16, 1, 0.03); geo.translate(0, 0.5, 0);
      const b = new THREE.Mesh(geo, barMat); b.position.set(dx - 0.46 + i * 0.23, y + 0.64, dz + 0.07); b.scale.y = 0.2 + (i % 3) * 0.1; dyn.add(b); bars.push(b);
    }
    // security beacon on the monitor
    k.box(0.26, 0.05, 0.26, C.ink, dx + 0.55, y + 1.45, dz);
    const alertMat = new THREE.MeshBasicMaterial({ color: 0x5a2a2a });
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 8), alertMat); beacon.position.set(dx + 0.55, y + 1.6, dz); dyn.add(beacon);
    // shield on a stand (front right)
    k.box(0.06, 0.3, 0.06, C.ink, 1.3, y, 0.95); k.box(0.3, 0.04, 0.3, C.ink, 1.3, y, 0.95);
    const sh = new THREE.Shape(); sh.moveTo(0, 0.32); sh.lineTo(0.26, 0.22); sh.lineTo(0.22, -0.1); sh.lineTo(0, -0.32); sh.lineTo(-0.22, -0.1); sh.lineTo(-0.26, 0.22); sh.closePath();
    const shieldMat = new THREE.MeshLambertMaterial({ color: 0x5fe08a, emissive: 0x1a6a3a, flatShading: true });
    const shield = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: false }), shieldMat);
    shield.position.set(1.3, y + 0.62, 0.95); shield.rotation.y = Math.PI / 4; dyn.add(shield);
    nameSign(g, k, 'MICROSERVICES', -1.35, 1.5, y);
    const near = nearness(g);
    return {
      obj: g,
      colliders: [{ x: 0, z: 0, w: TW, d: TD }],
      animate: (t, state) => {
        const live = near(state);
        const cyc = (t * 0.5) % 6, alerting = live > 0.05 && cyc > 3.8 && cyc < 5;
        for (let i = 0; i < ledCount; i++) {
          const on = live > 0.05 ? Math.sin(t * (2 + (i % 5)) + i * 1.7) > -0.3 : i % 4 === 0;
          leds.setColorAt(i, col.setHex(alerting && i % 3 === 0 ? 0xff5a4a : on ? 0x5fe08a : 0x1f3b2a));
        }
        leds.instanceColor.needsUpdate = true;
        bars.forEach((b, i) => { b.scale.y = 0.18 + (0.4 + 0.3 * Math.sin(t * 2.4 + i * 1.3)) * live; });
        barMat.color.setHex(alerting ? 0xff6a5a : 0x3fe0c8);
        alertMat.color.setHex(alerting ? (Math.sin(t * 14) > 0 ? 0xff3b30 : 0xa02020) : 0x5a2a2a);
        const fix = live > 0.05 && cyc >= 5 ? Math.sin(((cyc - 5) / 1) * Math.PI) : 0;
        shield.scale.setScalar(1 + 0.3 * fix);
        shieldMat.color.setHex(alerting ? C.amber : 0x5fe08a);
        spokes.rotation.z += 0.03 * live;
        wheel.position.y = y + 1.95 + Math.sin(t * 1.4) * 0.05;
      },
    };
  },

  exhibit_scheduler() {
    // Event planning desk: a calendar easel whose days fill with events, tent
    // cards for each event, and a mini stage with a sweeping spotlight. Runner-up
    // medal for HackFest 2025.
    const g = new THREE.Group(), k = kit(g);
    const TW = 4.2, TD = 3.4, y = exhibitTable(k, TW, TD, 0xf1e3c6);
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    // calendar easel
    const cx = -0.8, cz = -1.05;
    for (const x of [cx - 0.95, cx + 0.95]) k.box(0.08, 1.75, 0.08, C.wood, x, y, cz - 0.05);
    k.box(2.0, 1.45, 0.08, C.wood, cx, y + 0.22, cz - 0.05);
    k.box(1.88, 1.33, 0.02, C.cream, cx, y + 0.28, cz, { shadow: false });
    k.box(1.88, 0.22, 0.03, C.accent, cx, y + 1.38, cz + 0.01, { shadow: false });
    for (const x of [cx - 0.6, cx + 0.6]) k.box(0.06, 0.16, 0.05, C.ink, x, y + 1.5, cz + 0.02); // binder rings
    const COLS = 5, ROWS = 4, cells = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.22, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff }), COLS * ROWS);
    const tmp = new THREE.Object3D(), col = new THREE.Color();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      tmp.position.set(cx - 0.76 + c * 0.38, y + 1.18 - r * 0.27, cz + 0.02); tmp.updateMatrix(); cells.setMatrixAt(r * COLS + c, tmp.matrix);
    }
    dyn.add(cells);
    const ORDER = [2, 6, 9, 13, 17, 4, 11, 15, 0, 18], EV = [C.teal, C.pink, C.yellow, 0x6fa8dc];
    // event tent cards
    const cards = [];
    [[-1.45, 0.55, C.teal], [-0.95, 0.75, C.pink], [-0.45, 0.55, C.yellow]].forEach(([x, z, c]) => {
      const card = new THREE.Group(); card.position.set(x, y, z); dyn.add(card);
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.03), mat(c)); a.position.set(0, 0.13, 0.06); a.rotation.x = -0.35; a.castShadow = true;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.03), mat(C.cream)); b.position.set(0, 0.13, -0.06); b.rotation.x = 0.35;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.01), mat(C.ink)); s.position.set(0, 0.18, 0.1); s.rotation.x = -0.35;
      card.add(a, b, s); cards.push(card);
    });
    // mini stage
    const sx = 1.15, sz = -0.35;
    k.box(1.6, 0.22, 1.1, 0x6b3f2a, sx, y, sz);
    k.box(1.6, 0.04, 1.1, C.wood, sx, y + 0.22, sz);
    k.box(1.6, 1.15, 0.08, 0x3a2a4a, sx, y + 0.22, sz - 0.55);
    for (const x of [sx - 0.62, sx + 0.62]) k.box(0.36, 1.1, 0.1, 0xc4402f, x, y + 0.26, sz - 0.46);
    k.box(1.6, 0.18, 0.12, 0xa8322a, sx, y + 1.2, sz - 0.46);
    k.box(0.2, 0.3, 0.16, C.wood, sx, y + 0.26, sz + 0.05);                         // podium
    k.box(0.06, 0.12, 0.04, C.ink, sx, y + 0.56, sz + 0.05);                        // mic
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) k.box(0.14, 0.12, 0.14, r ? 0x4f7fe0 : C.accent, sx - 0.5 + c * 0.33, y, sz + 0.85 + r * 0.3); // audience seats
    // spotlight truss
    k.box(0.06, 1.95, 0.06, C.ink, sx + 0.88, y, sz + 0.25);
    k.box(0.75, 0.06, 0.06, C.ink, sx + 0.5, y + 1.9, sz + 0.25);
    const spot = new THREE.Group(); spot.position.set(sx + 0.2, y + 1.88, sz + 0.25); dyn.add(spot);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.16, 8), mat(C.ink)); lamp.position.y = -0.06; spot.add(lamp);
    const beamGeo = new THREE.ConeGeometry(0.4, 1.55, 12, 1, true); beamGeo.translate(0, -0.78, 0);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(beamGeo, beamMat); spot.add(beam);
    // HackFest 2025 runner-up medal by the sign
    k.box(0.05, 0.3, 0.05, C.wood, 0.25, y, 1.4);
    k.box(0.08, 0.16, 0.02, 0x4f7fe0, 0.25, y + 0.3, 1.42, { shadow: false });
    k.cyl(0.11, 0.11, 0.03, mat(0xd9dde6, { emissive: 0x3a3e48, emissiveIntensity: 0.4 }), 0.25, y + 0.14, 1.44, 10, { rx: Math.PI / 2 });
    nameSign(g, k, 'EVENT SCHEDULER', -1.25, 1.5, y);
    const near = nearness(g);
    return {
      obj: g,
      colliders: [{ x: 0, z: 0, w: TW, d: TD }],
      animate: (t, state) => {
        const live = near(state);
        const filled = live > 0.05 ? Math.min(ORDER.length, Math.floor((t * 1.2) % (ORDER.length + 4))) : 3;
        for (let i = 0; i < COLS * ROWS; i++) cells.setColorAt(i, col.setHex(0xfff8ea));
        for (let i = 0; i < filled; i++) cells.setColorAt(ORDER[i], col.setHex(EV[i % EV.length]));
        cells.instanceColor.needsUpdate = true;
        cards.forEach((c, i) => { c.position.y = y + Math.max(0, Math.sin(t * 3 + i * 1.2)) * 0.1 * live; });
        spot.rotation.z = Math.sin(t * 1.1) * 0.3 * live;
        spot.rotation.x = Math.cos(t * 0.8) * 0.15 * live;
        beamMat.opacity = 0.05 + 0.2 * live;
      },
    };
  },

  exhibit_cauverysite() {
    // Real-estate development model: a grid of plots along a lane, finished
    // houses, a house under construction, a tower crane and a map pin that hops
    // from plot to plot ("selectable plots") while Nathan is near.
    const g = new THREE.Group(), k = kit(g);
    const TW = 4.2, TD = 3.4, y = exhibitTable(k, TW, TD, C.grass);
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    k.box(TW - 0.3, 0.02, 0.42, 0x7d7f8e, 0, y, 1.05, { shadow: false });          // front road
    for (let i = 0; i < 6; i++) k.box(0.22, 0.005, 0.05, C.cream, -1.6 + i * 0.64, y + 0.02, 1.05, { shadow: false });
    k.box(0.42, 0.02, 2.0, 0x7d7f8e, 0, y, -0.15, { shadow: false });              // central lane
    const PX = [-1.45, -0.7, 0.7, 1.45], PZ = [-0.75, 0.3];
    const plots = [];
    for (const z of PZ) for (const x of PX) plots.push([x, z]);
    const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.66, 0.05, 0.86), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), plots.length);
    const tmp = new THREE.Object3D(), col = new THREE.Color();
    plots.forEach(([x, z], i) => { tmp.position.set(x, y + 0.025, z); tmp.updateMatrix(); slabs.setMatrixAt(i, tmp.matrix); slabs.setColorAt(i, col.setHex(0xe2c98f)); });
    slabs.receiveShadow = true; dyn.add(slabs);
    const house = (x, z, c, roofC) => {
      k.box(0.42, 0.3, 0.42, c, x, y + 0.05, z - 0.08);
      const rs = new THREE.Shape(); rs.moveTo(-0.25, 0); rs.lineTo(0.25, 0); rs.lineTo(0, 0.2); rs.closePath();
      k.mesh(new THREE.ExtrudeGeometry(rs, { depth: 0.48, bevelEnabled: false }), roofC, x, y + 0.35, z - 0.08 - 0.24);
      k.box(0.1, 0.16, 0.02, C.ink, x, y + 0.05, z + 0.14, { shadow: false });
      k.box(0.1, 0.08, 0.02, glow(C.amber), x + 0.12, y + 0.2, z + 0.14, { shadow: false });
    };
    house(PX[0], PZ[0], C.cream, C.terracotta); house(PX[3], PZ[0], 0xcfe3f0, 0x4f7fe0);
    house(PX[1], PZ[1], 0xf3d9c4, C.terracotta); house(PX[2], PZ[1], C.cream, 0x2bb3a3);
    for (const i of [1, 4, 7]) {                                                     // open plots with sale flags
      const [x, z] = plots[i];
      k.box(0.03, 0.28, 0.03, C.ink, x + 0.22, y + 0.05, z + 0.3);
      k.box(0.18, 0.12, 0.02, C.accent, x + 0.12, y + 0.2, z + 0.3, { shadow: false });
    }
    // house under construction on plot 2 (grows while active)
    const [bx, bz] = plots[2];
    for (const [ox, oz] of [[-0.25, -0.3], [0.25, -0.3], [-0.25, 0.2], [0.25, 0.2]]) k.box(0.03, 0.5, 0.03, C.yellow, bx + ox, y + 0.05, bz + oz);
    const buildGeo = new THREE.BoxGeometry(0.42, 1, 0.42); buildGeo.translate(0, 0.5, 0);
    const build = new THREE.Mesh(buildGeo, mat(0xd8c3a0)); build.position.set(bx, y + 0.05, bz - 0.05); build.scale.y = 0.12; build.castShadow = true; dyn.add(build);
    // tower crane in the back-right corner
    const kx = 1.85, kz = -1.45;
    k.box(0.3, 0.06, 0.3, C.charcoal, kx, y, kz);
    k.box(0.1, 2.0, 0.1, C.yellow, kx, y + 0.06, kz);
    for (let i = 0; i < 6; i++) k.box(0.12, 0.02, 0.12, C.ink, kx, y + 0.3 + i * 0.3, kz, { shadow: false });
    const jib = new THREE.Group(); jib.position.set(kx, y + 2.06, kz); dyn.add(jib);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.08), mat(C.yellow)); arm.position.x = -0.55; arm.castShadow = true;
    const cw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.16), mat(C.charcoal)); cw.position.x = 0.38;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.14), mat(C.cream)); cab.position.set(0.05, -0.1, 0);
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.6, 0.015), mat(C.ink)); cable.position.set(-1.1, -0.3, 0);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), mat(C.accent)); hook.position.set(-1.1, -0.62, 0);
    jib.add(arm, cw, cab, cable, hook);
    // trees
    for (const [x, z] of [[-1.85, 1.45], [1.9, 0.75], [-1.9, -1.5]]) { k.box(0.05, 0.14, 0.05, C.trunk, x, y, z); k.mesh(new THREE.IcosahedronGeometry(0.16, 0), C.leaf, x, y + 0.24, z); }
    // map pin hovering over the selected plot
    const pin = new THREE.Group(); dyn.add(pin);
    const pinMat = mat(C.accent, { emissive: C.accent, emissiveIntensity: 0.35, keep: true });
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), pinMat); head.position.y = 0.32;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 8), pinMat); tip.rotation.x = Math.PI; tip.position.y = 0.14;
    const dot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), mat(C.white)); dot.position.set(0, 0.32, 0.12);
    pin.add(head, tip, dot);
    nameSign(g, k, 'CAUVERYSITE', -1.3, 1.5, y);
    const near = nearness(g);
    let sel = 0, last = -1;
    return {
      obj: g,
      colliders: [{ x: 0, z: 0, w: TW, d: TD }],
      animate: (t, state) => {
        const live = near(state);
        if (live > 0.05) sel = Math.floor(t / 1.3) % plots.length;
        if (sel !== last) {
          plots.forEach((_, i) => slabs.setColorAt(i, col.setHex(i === sel ? 0xffd257 : 0xe2c98f)));
          slabs.instanceColor.needsUpdate = true; last = sel;
        }
        const [px, pz] = plots[sel];
        pin.position.set(px, y + 0.55 + Math.abs(Math.sin(t * 3)) * 0.12 * (0.3 + live), pz);
        pin.rotation.y = t * 1.5 * live;
        build.scale.y = 0.12 + 0.3 * ((Math.sin(t * 0.7) + 1) / 2) * live;
        jib.rotation.y = Math.sin(t * 0.5) * 0.9 * live;
      },
    };
  },

  exhibit_nathanexe() {
    // The centre workbench: a miniature of this very town on a round island,
    // with a little train looping the Memory Line, the CRT monument, the gym,
    // the lighthouse and a tiny Nathan. Laptop, mug and desk lamp on the bench.
    const g = new THREE.Group(), k = kit(g);
    const TW = 4.2, TD = 3.0, y = exhibitTable(k, TW, TD, 0xc9a77c);
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const ix = 0.55, iz = -0.1;
    k.cyl(1.15, 1.2, 0.08, 0x4fd0ea, ix, y, iz, 20);                                 // sea
    k.cyl(0.95, 1.0, 0.14, C.grass, ix, y, iz, 18);                                 // island
    k.cyl(0.32, 0.32, 0.02, C.concrete, ix, y + 0.14, iz, 14);                     // plaza
    // roads
    k.box(1.7, 0.01, 0.12, 0x6c6a7d, ix, y + 0.14, iz, { shadow: false });
    k.box(0.12, 0.01, 1.7, 0x6c6a7d, ix, y + 0.14, iz, { shadow: false });
    // track ring
    const track = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.025, 4, 36), mat(C.ink)); track.rotation.x = Math.PI / 2; track.position.set(ix, y + 0.16, iz); g.add(track);
    // CRT monument
    k.box(0.22, 0.2, 0.2, 0xe8d8b8, ix, y + 0.15, iz);
    const crtMat = new THREE.MeshBasicMaterial({ color: 0x2bd18a });
    const crt = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.01), crtMat); crt.position.set(ix + 0.03, y + 0.26, iz + 0.105); crt.rotation.y = 0; dyn.add(crt);
    // gym (NW), college (NE), garage canopy (SE), radio mast (SW)
    k.box(0.36, 0.26, 0.3, C.brick, ix - 0.45, y + 0.14, iz - 0.45); k.box(0.4, 0.04, 0.34, C.ink, ix - 0.45, y + 0.4, iz - 0.45);
    k.box(0.36, 0.3, 0.26, 0xf3e3c3, ix + 0.45, y + 0.14, iz - 0.45); k.box(0.4, 0.04, 0.3, C.terracotta, ix + 0.45, y + 0.44, iz - 0.45);
    for (const [ox, oz] of [[0.3, 0.3], [0.6, 0.3], [0.3, 0.6], [0.6, 0.6]]) k.box(0.02, 0.18, 0.02, C.charcoal, ix + ox, y + 0.14, iz + oz);
    k.box(0.36, 0.02, 0.36, 0xb8c4d6, ix + 0.45, y + 0.32, iz + 0.45);
    k.box(0.03, 0.5, 0.03, C.accent, ix - 0.45, y + 0.14, iz + 0.45);
    for (const [x, z] of [[-0.2, -0.65], [0.65, -0.05], [-0.68, 0.1], [0.05, 0.68]]) k.mesh(new THREE.ConeGeometry(0.07, 0.18, 6), C.leafDark, ix + x, y + 0.23, iz + z);
    // lighthouse on the south shore
    const lx = ix + 0.2, lz = iz + 1.02;
    k.cyl(0.07, 0.09, 0.42, C.white, lx, y + 0.08, lz, 8);
    k.cyl(0.075, 0.08, 0.06, C.accent, lx, y + 0.22, lz, 8);
    const lhMat = new THREE.MeshBasicMaterial({ color: C.amber });
    const lhLamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.08), lhMat); lhLamp.position.set(lx, y + 0.54, lz); dyn.add(lhLamp);
    k.mesh(new THREE.ConeGeometry(0.08, 0.08, 8), C.accent, lx, y + 0.62, lz);
    // tiny Nathan on the plaza
    const me = new THREE.Group(); me.position.set(ix + 0.18, y + 0.16, iz + 0.2); dyn.add(me);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.04), mat(0x3a5a9a)); legs.position.y = 0.035;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.05), mat(0xc4402f)); torso.position.y = 0.105;
    const headM = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), mat(0xf3d0b0)); headM.position.y = 0.17;
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.07), mat(0x2a2020)); hair.position.y = 0.21;
    me.add(legs, torso, headM, hair);
    // train
    const train = new THREE.Group(); dyn.add(train);
    const cars = [];
    [C.accent, C.cream, C.cream].forEach((c, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.09), mat(c)); m.castShadow = true; train.add(m); cars.push(m); });
    // bench props: laptop, mug, desk lamp, toolbox
    const lpx = -1.4, lpz = 0.3;
    k.box(0.7, 0.03, 0.48, C.charcoal, lpx, y, lpz);
    k.box(0.7, 0.44, 0.03, C.charcoal, lpx, y + 0.03, lpz - 0.24, { rx: -0.25 });
    const lapMat = new THREE.MeshBasicMaterial({ color: 0x261e3a });
    const lap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.36, 0.01), lapMat); lap.position.set(lpx, y + 0.26, lpz - 0.2); lap.rotation.x = -0.25; dyn.add(lap);
    const logo = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.012), new THREE.MeshBasicMaterial({ color: C.accent })); logo.position.set(lpx - 0.18, y + 0.29, lpz - 0.19); logo.rotation.x = -0.25; dyn.add(logo);
    k.cyl(0.07, 0.07, 0.14, C.accent, -1.75, y, -0.45, 8); k.box(0.04, 0.08, 0.02, C.accent, -1.66, y + 0.03, -0.45);
    k.box(0.16, 0.04, 0.16, C.ink, -1.2, y, -1.05);
    k.box(0.04, 0.7, 0.04, C.ink, -1.2, y + 0.04, -1.05, { rz: -0.35 });
    k.box(0.04, 0.5, 0.04, C.ink, -1.0, y + 0.66, -1.05, { rz: 0.9 });
    k.box(0.2, 0.12, 0.16, glow(C.amber), -0.72, y + 0.88, -1.05, { shadow: false });
    k.box(0.5, 0.22, 0.28, C.accent, -1.15, y, -0.45); k.box(0.52, 0.04, 0.3, C.ink, -1.15, y + 0.22, -0.45);
    nameSign(g, k, 'NATHAN.EXE', -1.45, 1.25, y);
    const near = nearness(g);
    let ang = 0;
    return {
      obj: g,
      colliders: [{ x: 0, z: 0, w: TW, d: TD }],
      animate: (t, state) => {
        const live = near(state);
        ang += 0.018 * live;
        cars.forEach((m, i) => {
          const a = ang - i * 0.22;
          m.position.set(ix + Math.cos(a) * 0.82, y + 0.22, iz + Math.sin(a) * 0.82);
          m.rotation.y = -a;
        });
        lhMat.color.setHex(Math.sin(t * 4) > 0 || live < 0.05 ? C.amber : 0x8a6a2a);
        crtMat.color.setHex(live > 0.05 && Math.sin(t * 9) > 0.7 ? 0x9ff5c8 : 0x2bd18a);
        lapMat.color.setHex(live > 0.05 ? 0x332a4c : 0x261e3a);
        me.position.y = y + 0.16 + Math.abs(Math.sin(t * 5)) * 0.05 * live;
        me.rotation.y = t * 0.8 * live;
      },
    };
  },

  workshop_shed({ len = 8, depth = 2.4, hBack = 3.7, hFront = 3.2, pillars = null, sign = '' } = {}) {
    // Open lean-to workshop roof along local x, sloping down toward +z (the
    // open side). Placed only along the Garage's back edges, so from the fixed
    // camera it can never overlap the exhibits in front of it. The roof sheet
    // also turns see-through while Nathan stands underneath.
    const g = new THREE.Group(), k = kit(g);
    const hz = depth / 2, xs = pillars || [-len / 2, 0, len / 2];
    for (const x of xs) {
      for (const [z, h] of [[-hz, hBack], [hz, hFront]]) {
        k.box(0.34, 0.22, 0.34, C.plinth, x, 0, z);
        k.box(0.2, h - 0.22, 0.2, C.charcoal, x, 0.22, z);
        k.box(0.22, 0.06, 0.22, C.accent, x, 1.2, z, { shadow: false });
      }
      k.box(0.12, 0.12, depth, C.charcoal, x, (hBack + hFront) / 2 - 0.12, 0, { rx: Math.atan2(hBack - hFront, depth) }); // rafter
    }
    // eave beams
    k.box(len + 0.3, 0.2, 0.18, C.charcoal, 0, hBack - 0.2, -hz);
    k.box(len + 0.3, 0.2, 0.18, C.charcoal, 0, hFront - 0.2, hz);
    // corrugated roof sheet (one mesh, striped texture)
    const slope = Math.atan2(hBack - hFront, depth), run = Math.hypot(depth, hBack - hFront) + 0.5;
    const c = document.createElement('canvas'); c.width = 64; c.height = 8;
    const cg = c.getContext('2d');
    for (let i = 0; i < 8; i++) { cg.fillStyle = ['#c3ccd8', '#b3bdcb', '#a3aec0', '#b3bdcb', '#c3ccd8', '#d0d7e0', '#c3ccd8', '#b8c2d0'][i]; cg.fillRect(i * 8, 0, 8, 8); }
    const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(len / 2.2, 1); tex.colorSpace = THREE.SRGBColorSpace;
    const roofMat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 1, flatShading: true });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 0.6, 0.08, run), roofMat);
    roof.position.set(0, (hBack + hFront) / 2 + 0.04, 0); roof.rotation.x = slope; roof.castShadow = true; roof.receiveShadow = true;
    roof.userData.dynamic = true; g.add(roof);
    // front fascia + gutter
    k.box(len + 0.6, 0.24, 0.1, 0x3a3150, 0, hFront - 0.08, hz + 0.24);
    k.box(len + 0.6, 0.06, 0.12, C.accent, 0, hFront + 0.16, hz + 0.24, { shadow: false });
    // hanging work lamps
    const lampMat = mat(C.amber, { emissive: C.amber, emissiveIntensity: 0.8 });
    const pools = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const x = (xs[i] + xs[i + 1]) / 2;
      k.box(0.03, 0.5, 0.03, C.ink, x, hFront - 0.7, hz - 0.3, { shadow: false });
      k.cyl(0.08, 0.22, 0.16, C.ink, x, hFront - 0.86, hz - 0.3, 8, { shadow: false });
      k.box(0.14, 0.08, 0.14, lampMat, x, hFront - 0.92, hz - 0.3, { shadow: false });
      const pool = lightPool(2.2, 0xffd08a); pool.position.set(x, 0.09, hz - 0.2); g.add(pool); pools.push(pool);
    }
    if (sign) {
      // Big physical sign standing on the front edge: ink board, cream chunky
      // letters with a drop shadow, orange trims and rivets, three gooseneck lamps.
      const SW = Math.min(len - 0.8, 5.8), SH = 1.3, sy = hFront + 0.22, sz = hz + 0.22;
      for (const x of [-SW / 2 + 0.5, SW / 2 - 0.5]) k.box(0.1, 0.4, 0.1, C.charcoal, x, hFront + 0.12, sz - 0.1);
      k.box(SW + 0.24, SH + 0.24, 0.18, 0x14101f, 0, sy, sz - 0.12);               // depth / backing
      k.box(SW, SH, 0.1, C.ink, 0, sy + 0.12, sz);
      k.box(SW, 0.08, 0.12, mat(C.accent, { keep: true }), 0, sy + 0.18, sz + 0.01, { shadow: false });
      k.box(SW, 0.08, 0.12, mat(C.accent, { keep: true }), 0, sy + SH - 0.02, sz + 0.01, { shadow: false });
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 112;
      const x2 = cv.getContext('2d');
      x2.fillStyle = '#2a2440'; x2.fillRect(0, 0, 512, 112);
      let size = 84; x2.font = `bold ${size}px Silkscreen, monospace`;
      while (size > 40 && x2.measureText(sign).width > 420) { size -= 2; x2.font = `bold ${size}px Silkscreen, monospace`; }
      x2.textAlign = 'center'; x2.textBaseline = 'middle';
      x2.fillStyle = '#100c1a'; x2.fillText(sign, 256 + 6, 58 + 6);
      x2.fillStyle = '#fff1d6'; x2.fillText(sign, 256, 58);
      x2.fillStyle = '#ff6a3d';
      for (const x of [18, 494]) { x2.fillRect(x - 7, 44, 14, 14); x2.fillRect(x - 3, 66, 6, 6); }
      const st = new THREE.CanvasTexture(cv); st.colorSpace = THREE.SRGBColorSpace; st.magFilter = THREE.NearestFilter; st.minFilter = THREE.LinearFilter;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(SW - 0.1, SH - 0.32), new THREE.MeshBasicMaterial({ map: st }));
      face.position.set(0, sy + 0.12 + SH / 2, sz + 0.055); face.userData.dynamic = true; g.add(face);
      for (const x of [-SW / 2 + 0.12, SW / 2 - 0.12]) for (const yy of [0.32, SH - 0.08]) k.box(0.06, 0.06, 0.04, C.accent, x, sy + yy, sz + 0.06, { shadow: false });
      for (const x of [-SW / 3, 0, SW / 3]) {
        k.box(0.04, 0.3, 0.04, C.ink, x, sy + SH + 0.12, sz - 0.02);
        k.box(0.04, 0.04, 0.3, C.ink, x, sy + SH + 0.4, sz + 0.1);
        k.box(0.18, 0.08, 0.12, lampMat, x, sy + SH + 0.33, sz + 0.24, { shadow: false });
      }
    }
    const v = new THREE.Vector3();
    let fade = 1;
    return {
      obj: g,
      colliders: xs.flatMap((x) => [{ x, z: -hz, r: 0.24 }, { x, z: hz, r: 0.24 }]),
      nightGlow: pools,
      animate: (t, state) => {
        const p = state.playerPos;
        let under = false;
        if (p) { v.set(p.x, 0, p.z); g.worldToLocal(v); under = Math.abs(v.x) < len / 2 + 0.3 && v.z > -hz - 0.3 && v.z < hz + 0.6; }
        fade += ((under ? 0.35 : 1) - fade) * 0.12;
        roofMat.opacity = fade; roofMat.depthWrite = fade > 0.95;
      },
    };
  },

  // ===================== Guild Hall (replaces Signal Tower) =====================
  guild_hall({ w = 12.4, d = 7 } = {}) {
    // Walk-in timber guild hall facing +z. Stone plinth, plaster walls with dark
    // beams, slate gable roof and a big GUILD HALL board. Inside: the Toolbox, a
    // workshop corner with tool chest, workbench and tool racks. When Nathan
    // steps in, the roof, front wall and east wall fade so the camera sees in.
    const g = new THREE.Group(), k = kit(g);
    const W = w, D = d, H = 3.2, T = 0.3, DOOR = 1.8, B = 0.35; // B = plinth height
    const hw = W / 2, hd = D / 2;
    k.box(W + 0.4, B, D + 0.4, C.plinth, 0, 0, 0);
    k.box(W - 2 * T, 0.03, D - 2 * T, 0x8a5a36, 0, B, 0, { shadow: false });            // plank floor
    for (let x = -hw + 1; x < hw - 0.5; x += 1.0) k.box(0.03, 0.035, D - 2 * T, 0x6f4a30, x, B, 0, { shadow: false });
    k.box(W, H, T, 0xf1e3c6, 0, B, -hd + T / 2);                                         // back wall (always visible)
    k.box(T, H, D, 0xf1e3c6, -hw + T / 2, B, 0);                                         // west wall (always visible)
    for (let x = -hw + 1.2; x < hw; x += 2.0) k.box(0.18, H, 0.06, 0x5a3a26, x, B, -hd + T + 0.03, { shadow: false });
    // ---- the Toolbox: interior workshop along the back wall ----
    const bz = -hd + T;
    k.box(3.2, 1.0, 0.05, 0xd9a066, -3.2, B + 1.1, bz + 0.03);                           // pegboard
    for (const [x, y, c, h2] of [[-4.4, 1.6, C.steelDark, 0.5], [-3.9, 1.5, C.accent, 0.3], [-3.4, 1.6, C.yellow, 0.45], [-2.9, 1.55, C.steelDark, 0.35], [-2.4, 1.6, 0x2bb3a3, 0.4], [-2.0, 1.5, C.accent, 0.3]]) k.box(0.08, h2, 0.05, c, x, B + y - h2 / 2, bz + 0.08, { shadow: false });
    k.box(0.9, 0.08, 0.05, C.steelDark, -3.2, B + 1.95, bz + 0.08, { shadow: false });
    k.box(2.2, 0.85, 0.7, 0x6f4a30, -3.2, B, bz + 0.45);                                 // workbench
    k.box(2.3, 0.08, 0.8, 0x8a5a36, -3.2, B + 0.85, bz + 0.45);
    k.box(0.3, 0.2, 0.2, C.steel, -3.8, B + 0.93, bz + 0.4); k.box(0.5, 0.06, 0.1, C.steelDark, -2.7, B + 0.93, bz + 0.5);
    k.box(1.2, 0.6, 0.7, 0xb8393a, -0.6, B, bz + 0.5);                                   // iron-banded tool chest
    k.box(1.24, 0.14, 0.74, 0x7a2424, -0.6, B + 0.6, bz + 0.5);
    for (const x of [-1.0, -0.2]) k.box(0.07, 0.62, 0.76, C.steelDark, x, B, bz + 0.5, { shadow: false });
    k.box(0.22, 0.1, 0.06, C.yellow, -0.6, B + 0.45, bz + 0.88, { shadow: false });
    k.box(0.05, 0.4, 0.05, C.steelDark, -0.35, B + 0.74, bz + 0.45, { rz: 0.4 });
    k.box(0.3, 0.06, 0.3, C.wood, -0.85, B + 0.74, bz + 0.5);
    k.cyl(0.32, 0.32, 0.18, C.wood, -hw + T + 0.5, B, -0.8, 10, { rx: Math.PI / 2 }).position.y = B + 0.32;   // cable reel
    // the rest of the hall: map table, bookshelf, banners on the back wall
    k.box(2.0, 0.8, 1.1, 0x6f4a30, 2.6, B, -0.6); k.box(1.8, 0.02, 0.9, 0xf6e7c4, 2.6, B + 0.8, -0.6, { shadow: false });
    for (const [x, z] of [[2.0, -0.8], [3.0, -0.4]]) k.box(0.2, 0.04, 0.2, C.accent, x, B + 0.82, z, { shadow: false });
    k.box(1.6, 2.2, 0.45, 0x5a3a26, 4.6, B, bz + 0.25);
    for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) k.box(0.16, 0.36, 0.3, [C.accent, 0x2bb3a3, C.yellow, 0x6fa8dc, C.pink, C.cream][(i + r) % 6], 4.0 + i * 0.22, B + 0.15 + r * 0.52, bz + 0.3, { shadow: false });
    for (const [x, c] of [[1.2, C.accent], [2.6, 0x2bb3a3]]) k.box(0.6, 1.4, 0.04, c, x, B + 1.4, bz + 0.05, { shadow: false });
    k.box(2.4, 0.04, 1.6, 0x8a2a2a, -1.6, B + 0.02, 0.6, { shadow: false });              // rug under the Toolbox spot
    const lampM = mat(C.amber, { emissive: C.amber, emissiveIntensity: 0.8 });
    for (const x of [-3.0, 0.4, 3.6]) { k.box(0.03, 0.6, 0.03, C.ink, x, B + H - 0.6, -0.4); k.box(0.2, 0.16, 0.2, lampM, x, B + H - 0.76, -0.4, { shadow: false }); }
    const pools = [];
    for (const x of [-2.6, 2.4]) { const p = lightPool(2.4, 0xffd08a); p.position.set(x, B + 0.06, 0); g.add(p); pools.push(p); }

    // ---- fading shell: roof, front wall, east wall and their decoration ----
    const shell = new THREE.Group(); shell.userData.dynamic = true; g.add(shell);
    const fmats = new Map();
    const fm = (color, emissive = 0) => { const key = `${color}|${emissive}`; if (!fmats.has(key)) fmats.set(key, new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: emissive ? 0.6 : 0, flatShading: true, transparent: true, opacity: 1 })); return fmats.get(key); };
    const sb = (w2, h2, d2, color, x, y, z, emissive = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, d2), fm(color, emissive)); m.position.set(x, y + h2 / 2, z); m.castShadow = true; shell.add(m); return m; };
    const sideW = (W - DOOR) / 2;
    sb(sideW, H, T, 0xf1e3c6, -(DOOR / 2 + sideW / 2), B, hd - T / 2);                  // front wall, left of door
    sb(sideW, H, T, 0xf1e3c6, DOOR / 2 + sideW / 2, B, hd - T / 2);                     // front wall, right of door
    sb(DOOR, 0.7, T, 0xf1e3c6, 0, B + H - 0.7, hd - T / 2);                              // over the door
    sb(T, H, D, 0xf1e3c6, hw - T / 2, B, 0);                                             // east wall
    for (let x = -hw; x <= hw + 0.01; x += W / 8) if (Math.abs(x) > DOOR / 2 + 0.1) sb(0.2, H, 0.08, 0x5a3a26, x, B, hd + 0.02);
    sb(W, 0.18, 0.1, 0x5a3a26, 0, B + 1.6, hd + 0.03);
    sb(W + 0.1, 0.2, D + 0.1, 0x5a3a26, 0, B + H - 0.1, 0);
    for (const x of [-DOOR / 2 - 0.1, DOOR / 2 + 0.1]) sb(0.2, H - 0.7, 0.16, 0x5a3a26, x, B, hd + 0.02);
    for (const x of [-hw + 1.0, -hw + 2.4, -2.6, 2.6, hw - 2.4, hw - 1.0]) { sb(0.8, 0.9, 0.06, 0x5a3a26, x, B + 0.6, hd + 0.04); sb(0.62, 0.72, 0.04, 0xffd08a, x, B + 0.69, hd + 0.08, 0xffd08a); }
    for (const [x, c] of [[-DOOR / 2 - 0.6, C.accent], [DOOR / 2 + 0.6, 0x2bb3a3]]) sb(0.5, 1.3, 0.04, c, x, B + 1.4, hd + 0.14);
    for (const x of [-DOOR / 2 - 0.25, DOOR / 2 + 0.25]) sb(0.2, 0.26, 0.2, C.amber, x, B + 2.1, hd + 0.35, C.amber);
    const rs = new THREE.Shape(); rs.moveTo(-hd - 0.4, 0); rs.lineTo(hd + 0.4, 0); rs.lineTo(0, 2.5); rs.closePath();
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(rs, { depth: W + 0.6, bevelEnabled: false }), fm(0x46607e));
    roof.position.set(-hw - 0.3, B + H, 0); roof.rotation.y = Math.PI / 2; roof.castShadow = true; shell.add(roof);
    sb(W + 0.7, 0.12, 0.14, 0x22344a, 0, B + H + 2.45, 0);
    sb(0.6, 1.4, 0.6, C.brickDark, hw - 1.4, B + H + 0.8, -0.8);
    // big GUILD HALL board on the front eave (stays visible)
    const sign = boardSign('GUILD HALL', Math.min(W - 3, 6.4), 1.1);
    sign.position.set(0, B + H + 0.75, hd + 0.55); sign.userData.dynamic = true; g.add(sign);
    const signBits = new THREE.Group(); signBits.userData.dynamic = true; g.add(signBits);
    const sbk = kit(signBits);
    for (const x of [-2.2, 2.2]) sbk.box(0.12, 0.9, 0.12, 0x3a2418, x, B + H - 0.1, hd + 0.45);
    for (const x of [-1.6, 0, 1.6]) { sbk.box(0.05, 0.3, 0.05, C.ink, x, B + H + 1.35, hd + 0.5); sbk.box(0.2, 0.1, 0.16, glow(C.amber), x, B + H + 1.6, hd + 0.7, { shadow: false }); }
    const porch = lightPool(3, 0xffd08a); porch.position.set(0, 0.09, hd + 1.4); g.add(porch); pools.push(porch);

    const v = new THREE.Vector3();
    let fade = 1;
    return {
      obj: g,
      colliders: [
        { x: 0, z: -hd + T / 2, w: W, d: T + 0.2 },                                  // back wall
        { x: -hw + T / 2, z: 0, w: T + 0.2, d: D },                                  // west wall
        { x: hw - T / 2, z: 0, w: T + 0.2, d: D },                                   // east wall
        { x: -(DOOR / 2 + sideW / 2), z: hd - T / 2, w: sideW, d: T + 0.2 },         // front wall either side of the door
        { x: DOOR / 2 + sideW / 2, z: hd - T / 2, w: sideW, d: T + 0.2 },
        { x: -3.2, z: bz + 0.45, w: 2.3, d: 0.8 }, { x: -0.6, z: bz + 0.5, w: 1.24, d: 0.74 },   // workbench, tool chest
        { x: -hw + T + 0.5, z: -0.8, r: 0.35 }, { x: 2.6, z: -0.6, w: 2.0, d: 1.1 }, { x: 4.6, z: bz + 0.25, w: 1.6, d: 0.45 },
      ],
      floors: [{ x: 0, z: 0, w: W - 2 * T, d: D - 2 * T, h: B }, { x: 0, z: hd + 0.1, w: DOOR, d: 0.8, h: B }],
      nightGlow: pools,
      animate: (t, state) => {
        const p = state.playerPos;
        let inside = false;
        if (p) { v.set(p.x, 0, p.z); g.worldToLocal(v); inside = Math.abs(v.x) < hw + 0.2 && v.z > -hd && v.z < hd + 0.8; }
        fade += ((inside ? 0.12 : 1) - fade) * 0.12;
        for (const m of fmats.values()) { m.opacity = fade; m.depthWrite = fade > 0.95; }
        sign.visible = fade > 0.55; signBits.visible = fade > 0.55;   // the eave board steps aside while you're indoors
      },
    };
  },

  guild_skill_tree() {
    // A glowing skill tree: five branches (one per skill group) with node
    // gems. Nodes breathe when Nathan is near; opening it "levels up" the tree.
    const g = new THREE.Group(), k = kit(g);
    k.cyl(1.2, 1.3, 0.25, C.plinth, 0, 0, 0, 10);
    k.cyl(1.0, 1.0, 0.06, 0x7d6a52, 0, 0.25, 0, 10);
    k.cyl(0.22, 0.32, 2.0, C.trunk, 0, 0.3, 0, 7);
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const cols = [C.accent, 0x2bb3a3, 0x6fa8dc, 0xb56fdc, C.yellow];
    const nodes = [];
    cols.forEach((c, i) => {
      const a = (i / cols.length) * Math.PI * 2 + 0.3;
      const bx = Math.cos(a), bz = Math.sin(a);
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 1.3), mat(C.trunk));
      br.position.set(bx * 0.55, 2.05 + (i % 2) * 0.25, bz * 0.55); br.lookAt(bx * 1.2, 2.45 + (i % 2) * 0.3, bz * 1.2); br.castShadow = true; g.add(br);
      for (let j = 0; j < 3; j++) {
        const m = new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.25, flatShading: true });
        const n = new THREE.Mesh(new THREE.OctahedronGeometry(0.22 - j * 0.035, 0), m);
        const r = 0.7 + j * 0.4;
        n.position.set(bx * r, 2.2 + (i % 2) * 0.25 + j * 0.25, bz * r); dyn.add(n); nodes.push({ n, m, base: n.position.y, i: i * 3 + j });
      }
    });
    const crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), mat(C.amber, { emissive: C.amber, emissiveIntensity: 0.6 }));
    crown.position.y = 3.3; dyn.add(crown);
    const near = nearness(g, 5);
    let burst = -10;
    return {
      obj: g, colliders: [{ x: 0, z: 0, r: 1.3 }],
      api: { trigger() { burst = performance.now() / 1000; } },
      animate: (t, state) => {
        const live = near(state), since = performance.now() / 1000 - burst;
        nodes.forEach(({ n, m, base, i }) => {
          const lit = since < 3 ? (since * 6 > i ? 1 : 0.2) : 0.25 + 0.35 * live * (0.5 + 0.5 * Math.sin(t * 2 + i));
          m.emissiveIntensity = lit;
          n.position.y = base + Math.sin(t * 1.6 + i) * 0.04 * (0.3 + live);
          n.rotation.y = t * (0.5 + live);
        });
        crown.rotation.y = t; crown.position.y = 3.3 + Math.sin(t * 1.2) * 0.06;
      },
    };
  },

  guild_trophy_stand() {
    // Three-tier trophy podium: gold cups for wins, silver for runner-up places.
    const g = new THREE.Group(), k = kit(g);
    const gold = mat(0xffcf4a, { emissive: 0x6a4a00, emissiveIntensity: 0.4 }), silver = mat(0xd9dde6, { emissive: 0x3a3e48, emissiveIntensity: 0.35 });
    k.box(2.8, 0.4, 1.4, 0x5a3a26, 0, 0, 0);
    k.box(2.0, 0.4, 1.0, 0x6f4a30, 0, 0.4, -0.1);
    k.box(1.1, 0.4, 0.7, 0x845a3a, 0, 0.8, -0.2);
    k.box(2.82, 0.06, 1.42, C.yellow, 0, 0.38, 0, { shadow: false });
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const cups = [];
    const cup = (x, y, z, m, s = 1) => {
      const c = new THREE.Group(); c.position.set(x, y, z); c.scale.setScalar(s); dyn.add(c);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.2), mat(C.ink)); base.position.y = 0.03;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.14, 6), m); stem.position.y = 0.13;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.05, 0.18, 8), m); bowl.position.y = 0.29;
      c.add(base, stem, bowl); cups.push(c);
    };
    cup(0, 1.2, -0.2, gold, 1.5);
    [-0.65, -0.22, 0.22, 0.65].forEach((x, i) => cup(x, 0.8, -0.1, i % 2 ? silver : gold, 1.1));
    [-1.15, -0.7, -0.25, 0.25, 0.7, 1.15].forEach((x, i) => cup(x, 0.4, 0.35, i % 3 === 1 ? gold : silver, 0.95));
    const near = nearness(g, 5);
    let burst = -10;
    return {
      obj: g, colliders: [{ x: 0, z: 0, w: 2.8, d: 1.4 }],
      api: { trigger() { burst = performance.now() / 1000; } },
      animate: (t, state) => {
        const live = near(state), since = performance.now() / 1000 - burst;
        cups.forEach((c, i) => {
          c.rotation.y = since < 2.5 ? since * 6 : Math.sin(t * 0.8 + i) * 0.3 * live;
          c.position.y += ((since < 2.5 ? 0.12 * Math.abs(Math.sin(since * 4 + i)) : 0) - (c.userData.hop || 0));
          c.userData.hop = since < 2.5 ? 0.12 * Math.abs(Math.sin(since * 4 + i)) : 0;
        });
      },
    };
  },

  guild_quest_board() {
    // Quest board: two big main-quest scrolls with gold seals, two side quests,
    // a writing desk with a quill. Scrolls flutter when Nathan is near.
    const g = new THREE.Group(), k = kit(g);
    for (const x of [-1.0, 1.0]) k.box(0.12, 2.1, 0.12, 0x5a3a26, x, 0, 0);
    k.box(2.2, 1.3, 0.1, 0x8a5a36, 0, 0.75, 0);
    k.box(2.4, 0.14, 0.3, 0x5a3a26, 0, 2.05, 0);
    k.box(2.2, 0.08, 0.14, C.accent, 0, 1.98, 0.06, { shadow: false });
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const scrolls = [];
    [[-0.5, 1.45, 0.62, 0.7, true], [0.45, 1.45, 0.62, 0.7, true], [-0.55, 0.95, 0.5, 0.36, false], [0.45, 0.95, 0.5, 0.36, false]].forEach(([x, y, w, h, main]) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), mat(0xf6e7c4)); s.position.set(x, y, 0.07);
      s.geometry.translate(0, -h / 2, 0); s.position.y += h / 2; dyn.add(s); scrolls.push(s);
      for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.025, 0.01), mat(0x8a7a5a)); l.position.set(0, -0.12 - i * (h / 4.2), 0.015); s.add(l); }
      if (main) { const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 8), mat(0xc4402f)); seal.rotation.x = Math.PI / 2; seal.position.set(w * 0.3, -h + 0.1, 0.02); s.add(seal); }
    });
    // desk with quill and inkpot
    k.box(0.9, 0.7, 0.5, 0x6f4a30, 1.7, 0, 0.5);
    k.box(0.46, 0.03, 0.34, 0xf6e7c4, 1.65, 0.7, 0.5, { shadow: false });
    k.cyl(0.07, 0.08, 0.12, C.ink, 1.95, 0.7, 0.42, 6);
    k.box(0.03, 0.4, 0.03, C.white, 1.96, 0.8, 0.42, { rz: 0.3 });
    const near = nearness(g, 5);
    return {
      obj: g, colliders: [{ x: 0, z: 0, w: 2.4, d: 0.4 }, { x: 1.7, z: 0.5, w: 0.9, d: 0.5 }],
      animate: (t, state) => { const live = near(state); scrolls.forEach((s, i) => { s.rotation.x = Math.sin(t * 3 + i) * 0.12 * live; }); },
    };
  },

  guild_profile_stand() {
    // Character profile: an ornate standing frame with the N. emblem, a small
    // armour-stand bust in Nathan's colours (checked shirt red, glasses).
    const g = new THREE.Group(), k = kit(g);
    k.box(1.6, 0.18, 0.7, C.plinth, 0, 0, 0);
    for (const x of [-0.7, 0.7]) k.box(0.1, 2.0, 0.1, 0x5a3a26, x, 0.18, 0);
    k.box(1.5, 0.1, 0.14, C.yellow, 0, 2.18, 0);
    k.box(1.3, 1.6, 0.06, C.ink, 0, 0.45, 0);
    const em = boardSign('N.', 0.9, 0.9, { size: 120, w: 128, h: 128 });
    em.position.set(0, 1.25, 0.06); g.add(em);
    // bust on a pedestal beside the frame
    k.box(0.4, 0.8, 0.4, C.plinth, 1.25, 0, 0.1);
    k.box(0.42, 0.34, 0.24, 0xc4402f, 1.25, 0.8, 0.1);
    k.box(0.24, 0.26, 0.24, 0xf3d0b0, 1.25, 1.14, 0.1);
    k.box(0.28, 0.12, 0.28, 0x2a2020, 1.25, 1.38, 0.1);
    k.box(0.22, 0.05, 0.02, C.ink, 1.25, 1.27, 0.23, { shadow: false });
    const near = nearness(g, 4.5);
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const shine = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0 }));
    shine.position.set(0, 1.25, 0.1); shine.rotation.z = 0.5; dyn.add(shine);
    return {
      obj: g, colliders: [{ x: 0.3, z: 0, w: 2.2, d: 0.7 }],
      animate: (t, state) => { const live = near(state), u = (t * 0.6) % 1; shine.position.x = -0.6 + u * 1.2; shine.material.opacity = 0.35 * live * Math.sin(u * Math.PI); },
    };
  },

  // ===================== Pop Culture Park =====================
  pop_rooftop({ variant = 'signal' } = {}) {
    // Small noir rooftop block. variant 'signal': searchlight that sweeps and,
    // when triggered, throws an original winged emblem onto the sky.
    // variant 'red': red-lit rooftop with an "echo" sound interaction.
    const g = new THREE.Group(), k = kit(g);
    const red = variant === 'red';
    const W = red ? 2.0 : 2.2, H = red ? 1.9 : 2.4;
    k.box(W, H, W, red ? 0x6a2c2c : 0x3d4058, 0, 0, 0);
    for (let y = 0.5; y < H - 0.2; y += 0.6) for (const x of [-W / 4, W / 4]) k.box(0.36, 0.34, 0.04, red ? glow(0xff6a5a) : glow(0xffd08a), x, y, W / 2 + 0.01, { shadow: false });
    k.box(W + 0.12, 0.14, W + 0.12, 0x2a2440, 0, H, 0);
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const near = nearness(g, 5);
    let burst = -10;
    if (!red) {
      // rooftop searchlight + magnifying glass (detective easter egg)
      k.box(0.3, 0.3, 0.3, C.charcoal, 0.4, H + 0.14, -0.3);
      const head = new THREE.Group(); head.position.set(0.4, H + 0.6, -0.3); dyn.add(head);
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.45, 10), mat(C.charcoal)); can.rotation.x = Math.PI / 2; head.add(can);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 10), new THREE.MeshBasicMaterial({ color: 0xfff1c0 })); lens.rotation.x = Math.PI / 2; lens.position.z = 0.24; head.add(lens);
      const beamGeo = new THREE.CylinderGeometry(0.2, 1.4, 9, 12, 1, true); beamGeo.translate(0, 4.5, 0); beamGeo.rotateX(Math.PI / 2);
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const beam = new THREE.Mesh(beamGeo, beamMat); head.add(beam);
      // original winged emblem (canvas) shown high above when triggered
      const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x2 = c.getContext('2d');
      x2.fillStyle = '#fff1c0'; x2.beginPath(); x2.ellipse(64, 32, 60, 28, 0, 0, Math.PI * 2); x2.fill();
      x2.fillStyle = '#1e1b2e'; x2.beginPath(); x2.moveTo(10, 30); x2.lineTo(40, 18); x2.lineTo(52, 30); x2.lineTo(64, 14); x2.lineTo(76, 30); x2.lineTo(88, 18); x2.lineTo(118, 30); x2.lineTo(92, 40); x2.lineTo(64, 50); x2.lineTo(36, 40); x2.closePath(); x2.fill();
      const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
      const emblemMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });
      const emblem = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), emblemMat); emblem.position.set(0.4, H + 7, -0.3); emblem.rotation.y = Math.PI / 4; dyn.add(emblem);
      k.cyl(0.12, 0.12, 0.03, mat(0xbfe6ff), -0.5, H + 0.14, 0.5, 10); k.box(0.04, 0.03, 0.22, C.wood, -0.5, H + 0.15, 0.7);
      return {
        obj: g, colliders: [{ x: 0, z: 0, w: W, d: W }],
        api: { trigger(ctx) { burst = performance.now() / 1000; ctx?.sfx?.whistle?.(); } },
        animate: (t, state) => {
          const live = near(state), since = performance.now() / 1000 - burst, on = since < 7;
          head.rotation.x = on ? -Math.PI / 2 + 0.02 : -0.5 + Math.sin(t * 0.7) * 0.15;
          head.rotation.y = on ? 0 : Math.sin(t * 0.5) * 0.9;
          beamMat.opacity = on ? 0.22 : 0.1 * live;
          emblemMat.opacity = on ? Math.min(1, since * 1.5, (7 - since) * 1.5) : 0;
        },
      };
    }
    // red rooftop: gargoyle-ish ledge, water tank, neon strip, echo rings
    k.box(W + 0.2, 0.08, 0.1, glow(0xff3b30), 0, H - 0.25, W / 2 + 0.06, { shadow: false });
    k.cyl(0.35, 0.35, 0.7, 0x5a3a26, -0.4, H + 0.14, -0.4, 8);
    k.mesh(new THREE.ConeGeometry(0.4, 0.3, 8), 0x3a2418, -0.4, H + 0.99, -0.4);
    k.box(0.05, 0.6, 0.05, 0x8a2a2a, 0.55, H + 0.14, 0.45, { rz: 0.5 });            // two batons leaning on the ledge
    k.box(0.05, 0.6, 0.05, 0x8a2a2a, 0.7, H + 0.14, 0.45, { rz: -0.5 });
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const rm = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0, depthWrite: false });
      const r = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 32), rm); r.rotation.x = -Math.PI / 2; r.position.y = 0.05; dyn.add(r); rings.push({ r, rm, i });
    }
    return {
      obj: g, colliders: [{ x: 0, z: 0, w: W, d: W }],
      api: { trigger(ctx) { burst = performance.now() / 1000; ctx?.sfx?.echo?.(); } },
      animate: (t, state) => {
        const live = near(state), since = performance.now() / 1000 - burst;
        rings.forEach(({ r, rm, i }) => {
          const u = since < 4 ? ((since - i * 0.45) % 1.4) / 1.4 : ((t * 0.4 + i / 3) % 1);
          const on = since < 4 ? since > i * 0.45 : live > 0.05;
          r.scale.setScalar(1 + u * (since < 4 ? 5 : 2));
          rm.opacity = on ? (1 - u) * (since < 4 ? 0.8 : 0.25 * live) : 0;
        });
      },
    };
  },

  pop_moon() {
    // Moonlit mystery corner: a pale crescent on a stone plinth, a dark-blue
    // reflecting pool and a small hidden glyph that only shows up close.
    const g = new THREE.Group(), k = kit(g);
    k.cyl(1.1, 1.2, 0.08, 0x23305a, 0, 0, 0.2, 14);
    k.box(0.7, 0.5, 0.5, C.plinth, 0, 0, -0.3);
    const cres = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.16, 6, 20, Math.PI * 1.25), mat(0xeef3ff, { emissive: 0xbfd0ff, emissiveIntensity: 0.35, keep: true }));
    cres.position.set(0, 1.35, -0.3); cres.rotation.z = Math.PI * 0.55; cres.castShadow = true; g.add(cres);
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const glyphMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0 });
    const glyph = new THREE.Group(); glyph.position.set(0.55, 0.12, 0.65); dyn.add(glyph);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.22), glyphMat); glyph.add(body);
    for (const s of [-1, 1]) for (const z of [-0.06, 0.06]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), glyphMat); l.position.set(s * 0.12, 0, z); glyph.add(l); }
    const orbs = [];
    for (let i = 0; i < 3; i++) { const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: 0xdfe8ff })); dyn.add(o); orbs.push(o); }
    const near = nearness(g, 4);
    let burst = -10;
    return {
      obj: g, colliders: [{ x: 0, z: -0.3, w: 0.8, d: 0.6 }],
      api: { trigger() { burst = performance.now() / 1000; } },
      animate: (t, state) => {
        const live = near(state), since = performance.now() / 1000 - burst;
        cres.material.emissiveIntensity = 0.35 + 0.25 * live + (since < 3 ? 0.6 * (1 - since / 3) : 0);
        glyphMat.opacity = Math.max(live * 0.9, since < 4 ? 1 : 0);
        glyph.position.y = 0.12 + (since < 4 ? Math.min(1.4, since) * 0.6 : 0);
        glyph.rotation.y = t * (since < 4 ? 3 : 0.5);
        orbs.forEach((o, i) => { const a = t * 0.8 + (i * Math.PI * 2) / 3; o.position.set(Math.cos(a) * 1.0, 1.35 + Math.sin(t + i) * 0.15, -0.3 + Math.sin(a) * 0.5); o.visible = live > 0.1; });
      },
    };
  },

  pop_web() {
    // Web-inspired climbing frame with red/blue posts. Triggering it starts a
    // tiny agility challenge: touch the three glowing rings within 15 seconds.
    const g = new THREE.Group(), k = kit(g);
    for (const x of [-1.2, 1.2]) { k.box(0.16, 2.6, 0.16, 0xc4402f, x, 0, 0); k.box(0.2, 0.12, 0.2, 0x2f5fb0, x, 2.6, 0); }
    k.box(2.56, 0.12, 0.12, 0x2f5fb0, 0, 2.5, 0);
    const webM = mat(0xeef3ff);
    const cx = 0, cy = 1.4;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.15, 0.03), webM); s.position.set(cx + Math.sin(a) * 0.55, cy + Math.cos(a) * 0.55, 0); s.rotation.z = -a; g.add(s); }
    for (const r of [0.3, 0.6, 0.9]) for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * Math.PI * 2, len = 2 * r * Math.sin(Math.PI / 8);
      const s = new THREE.Mesh(new THREE.BoxGeometry(len, 0.025, 0.025), webM); s.position.set(cx + Math.sin(a) * r * 0.92, cy + Math.cos(a) * r * 0.92, 0); s.rotation.z = -a + Math.PI / 2; g.add(s);
    }
    k.box(2.8, 0.06, 1.4, 0x2a2440, 0, 0, 0.3, { shadow: false });              // safety mat
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const RING = [[-1.6, 3.2], [1.9, 2.4], [0.2, 4.6]];
    const rings = RING.map(([x, z]) => {
      const m = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0, depthWrite: false });
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 20), m); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.15, z); dyn.add(r);
      return { r, m, x, z, got: false };
    });
    const flash = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const glowPlane = new THREE.Mesh(new THREE.CircleGeometry(1.0, 20), flash); glowPlane.position.set(cx, cy, 0.04); dyn.add(glowPlane);
    let run = null, done = -10, ctx = null;
    const v = new THREE.Vector3();
    return {
      obj: g, colliders: [{ x: -1.2, z: 0, r: 0.2 }, { x: 1.2, z: 0, r: 0.2 }, { x: 0, z: 0, w: 2.4, d: 0.2 }],
      api: { trigger(c) { ctx = c; run = { t0: performance.now() / 1000 }; rings.forEach((r) => { r.got = false; }); ctx?.toast?.('Web challenge: touch the 3 red rings in 15 s'); } },
      animate: (t, state) => {
        const now = performance.now() / 1000;
        if (run) {
          const left = 15 - (now - run.t0);
          const p = state.playerPos;
          rings.forEach((r) => {
            if (!r.got && p) { v.set(r.x, 0, r.z); g.localToWorld(v); if (Math.hypot(p.x - v.x, p.z - v.z) < 0.8) { r.got = true; ctx?.sfx?.open?.(); } }
            r.m.opacity = r.got ? 0.15 : 0.85; r.r.position.y = 0.15 + Math.abs(Math.sin(t * 4 + r.x)) * 0.15; r.m.color.setHex(r.got ? 0x2f5fb0 : 0xff3b30);
          });
          if (rings.every((r) => r.got)) { run = null; done = now; ctx?.sfx?.memory?.(); ctx?.toast?.('Challenge cleared. Nice moves.'); }
          else if (left <= 0) { run = null; ctx?.sfx?.miss?.(); ctx?.toast?.('Out of time. Try the web again.'); }
        } else rings.forEach((r) => { r.m.opacity = 0; });
        flash.opacity = now - done < 1.5 ? 0.7 * (1 - (now - done) / 1.5) : 0;
      },
    };
  },

  pop_camp({ horse: withHorse = true } = {}) {
    // Peaceful western camp: canvas tent, campfire, lantern post and a horse.
    const g = new THREE.Group(), k = kit(g);
    const ts = new THREE.Shape(); ts.moveTo(-0.9, 0); ts.lineTo(0.9, 0); ts.lineTo(0, 1.3); ts.closePath();
    k.mesh(new THREE.ExtrudeGeometry(ts, { depth: 1.8, bevelEnabled: false }), 0xe6d6b0, 0.4, 0, -1.9);
    k.box(0.5, 0.9, 0.02, 0x5a3a26, 0.4, 0, -0.08, { shadow: false });
    // fire ring + logs
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; k.box(0.16, 0.12, 0.16, C.plinth, -0.4 + Math.cos(a) * 0.4, 0, 0.9 + Math.sin(a) * 0.4); }
    k.box(0.5, 0.08, 0.1, C.trunk, -0.4, 0.05, 0.9, { ry: 0.6 }); k.box(0.5, 0.08, 0.1, C.trunk, -0.4, 0.05, 0.9, { ry: -0.6 });
    for (const [x, z] of [[-1.3, 0.6], [0.5, 1.5]]) k.box(0.7, 0.3, 0.3, C.trunk, x, 0, z);   // log seats
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const flames = [0xff6a3d, 0xffc14d, 0xffe08a].map((c, i) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.16 - i * 0.04, 0.4 - i * 0.08, 6), new THREE.MeshBasicMaterial({ color: c })); f.position.set(-0.4, 0.3, 0.9); dyn.add(f); return f; });
    const fire = lightPool(1.8, 0xff9a4a); fire.position.set(-0.4, 0.08, 0.9); g.add(fire);
    // lantern post
    k.box(0.08, 1.5, 0.08, C.trunk, 1.4, 0, 0.6); k.box(0.4, 0.06, 0.06, C.trunk, 1.25, 1.45, 0.6);
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), mat(C.amber, { emissive: C.amber, emissiveIntensity: 0.7 })); lantern.position.set(1.1, 1.22, 0.6); dyn.add(lantern);
    // horse
    const horse = new THREE.Group(); horse.position.set(1.6, 0, -0.8); horse.rotation.y = Math.PI / 2 + 0.3; horse.visible = withHorse; if (withHorse) g.add(horse);
    const hk = kit(horse), coat = 0x7a4a2a, mane = 0x2a1a12;
    hk.box(1.1, 0.5, 0.42, coat, 0, 0.75, 0);
    for (const [x, z] of [[-0.4, -0.15], [-0.4, 0.15], [0.4, -0.15], [0.4, 0.15]]) hk.box(0.12, 0.75, 0.12, coat, x, 0, z);
    hk.box(0.5, 0.06, 0.46, 0x5a2a1a, -0.05, 1.25, 0);                           // saddle
    const head = new THREE.Group(); head.position.set(0.55, 1.15, 0); horse.add(head); head.userData.dynamic = true;
    const hh = kit(head);
    hh.box(0.22, 0.5, 0.26, coat, 0.05, 0, 0, { rz: -0.5 });
    hh.box(0.42, 0.22, 0.22, coat, 0.32, 0.32, 0);
    hh.box(0.1, 0.3, 0.06, mane, -0.05, 0.1, 0, { rz: -0.5 });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), mat(mane)); tail.geometry.translate(0, -0.25, 0); tail.position.set(-0.58, 1.15, 0); horse.add(tail); tail.userData.dynamic = true;
    const near = nearness(g, 5);
    let burst = -10;
    return {
      obj: g, colliders: [{ x: 0.4, z: -1.0, w: 1.9, d: 1.9 }, { x: -0.4, z: 0.9, r: 0.55 }, ...(withHorse ? [{ x: 1.6, z: -0.8, w: 1.0, d: 1.3 }] : [])],
      nightGlow: [fire],
      api: { trigger(ctx) { burst = performance.now() / 1000; ctx?.sfx?.whinny?.(); } },
      animate: (t, state) => {
        const live = near(state), since = performance.now() / 1000 - burst, flare = since < 2 ? 1.8 - since * 0.4 : 1;
        flames.forEach((f, i) => { f.scale.set(1, (0.8 + 0.25 * Math.sin(t * 9 + i * 2)) * flare, 1); f.position.y = 0.3 + 0.03 * Math.sin(t * 7 + i); });
        lantern.material.emissiveIntensity = 0.6 + 0.15 * Math.sin(t * 5);
        if (withHorse) head.rotation.z = (since < 2 ? 0.4 * Math.sin(since * 8) : Math.sin(t * 1.3) * 0.08) * (0.4 + live);
        if (withHorse) tail.rotation.x = Math.sin(t * 2.4) * 0.35 * (0.3 + live);
      },
    };
  },

  pop_startup({ board: withBoard = true } = {}) {
    // Startup corner: a desk with a beige retro computer, whiteboard of boxes,
    // a beanbag. Triggering runs a build: compiling, fails, then it works.
    const g = new THREE.Group(), k = kit(g);
    k.box(1.6, 0.72, 0.8, C.woodLight, 0, 0, 0);
    k.box(0.7, 0.55, 0.55, 0xe8d8b8, 0, 0.72, -0.05);
    k.box(0.6, 0.06, 0.3, 0xe8d8b8, 0, 0.72, 0.3);
    const c = document.createElement('canvas'); c.width = 64; c.height = 48; const x2 = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.38), new THREE.MeshBasicMaterial({ map: tex })); screen.position.set(0, 1.0, 0.23); screen.userData.dynamic = true; g.add(screen);
    // whiteboard
    if (withBoard) for (const x of [-0.6, 0.6]) k.box(0.06, 1.7, 0.06, C.steelDark, x - 1.6, 0, -0.5);
    if (withBoard) k.box(1.4, 0.9, 0.05, C.white, -1.6, 0.8, -0.5);
    if (withBoard) for (const [x, y, cc] of [[-1.95, 1.4, C.accent], [-1.55, 1.15, 0x2bb3a3], [-1.2, 1.4, 0x6fa8dc], [-1.6, 0.95, C.yellow]]) k.box(0.24, 0.14, 0.02, cc, x, y, -0.47, { shadow: false });
    k.box(0.42, 0.03, 0.3, C.charcoal, 0.55, 0.72, 0.12); k.box(0.42, 0.28, 0.03, C.charcoal, 0.55, 0.75, -0.03, { rx: -0.3 });   // laptop
    k.box(0.36, 0.22, 0.02, glow(0x6fa8dc), 0.55, 0.79, -0.01, { rx: -0.3, shadow: false });
    for (const [x, z] of [[-0.6, 0.25], [0.15, 0.3]]) { k.cyl(0.05, 0.045, 0.11, C.white, x, 0.72, z, 8); k.box(0.02, 0.05, 0.03, C.white, x + 0.06, 0.75, z); }   // coffee cups
    k.box(0.16, 0.06, 0.12, 0x2bb3a3, -0.55, 0.72, -0.15); k.box(0.04, 0.12, 0.04, C.accent, -0.5, 0.78, -0.15);   // prototype boards
    k.box(0.12, 0.05, 0.2, 0x4a5a7a, 0.62, 0.72, -0.3);
    const draw = (mode, u) => {
      x2.fillStyle = '#10241a'; x2.fillRect(0, 0, 64, 48);
      x2.fillStyle = mode === 'fail' ? '#ff5a4a' : '#5fe08a';
      if (mode === 'idle') { for (let i = 0; i < 5; i++) x2.fillRect(4, 6 + i * 7, 10 + ((i * 17) % 40), 3); if (u > 0.5) x2.fillRect(4 + 52, 38, 4, 5); }
      else if (mode === 'build') { x2.fillRect(4, 18, 56, 2); x2.fillRect(4, 28, 56 * u, 6); for (let i = 0; i < 3; i++) x2.fillRect(4, 4 + i * 4, 20 + i * 10, 2); }
      else if (mode === 'fail') { x2.fillRect(18, 12, 28, 4); x2.fillRect(18, 12, 4, 24); x2.fillRect(42, 12, 4, 24); x2.fillRect(28, 26, 8, 4); }
      else { x2.fillRect(14, 26, 8, 6); x2.fillRect(20, 30, 8, 6); x2.fillRect(26, 22, 6, 8); x2.fillRect(30, 16, 6, 8); x2.fillRect(36, 10, 6, 8); }
      tex.needsUpdate = true;
    };
    let burst = -10, lastKey = '';
    return {
      obj: g, colliders: [{ x: 0, z: 0, w: 1.6, d: 0.8 }, ...(withBoard ? [{ x: -1.6, z: -0.5, w: 1.4, d: 0.2 }] : [])],
      api: { trigger(ctx) { burst = performance.now() / 1000; ctx?.sfx?.open?.(); setTimeout(() => ctx?.sfx?.miss?.(), 2200); setTimeout(() => ctx?.sfx?.memory?.(), 3600); } },
      animate: (t) => {
        const since = performance.now() / 1000 - burst;
        let mode = 'idle', u = (t * 1.5) % 1;
        if (since < 2.2) { mode = 'build'; u = since / 2.2; } else if (since < 3.6) mode = 'fail'; else if (since < 6) mode = 'ok';
        const key = mode + Math.floor(u * 12);
        if (key !== lastKey) { draw(mode, u); lastKey = key; }
      },
    };
  },

  pop_boxing() {
    // A quiet basement corner: a heavy bag on a frame, a bare bulb, a battered
    // door and a single pink soap bar on a crate. Triggering throws a punch.
    const g = new THREE.Group(), k = kit(g);
    k.box(2.4, 0.04, 1.6, 0x4a4250, 0, 0, 0, { shadow: false });
    for (const x of [-0.9, 0.9]) k.box(0.1, 2.3, 0.1, C.charcoal, x, 0, -0.5);
    k.box(1.9, 0.1, 0.1, C.charcoal, 0, 2.3, -0.5);
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const bag = new THREE.Group(); bag.position.set(0, 2.3, -0.5); dyn.add(bag);
    const chain = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.03), mat(C.steelDark)); chain.position.y = -0.2; bag.add(chain);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.0, 10), mat(0x8a2a2a)); body.position.y = -0.9; body.castShadow = true; bag.add(body);
    // door in a low wall
    k.box(1.4, 2.2, 0.16, 0x6a6070, -1.85, 0, -1.0);
    k.box(0.8, 1.8, 0.06, 0x5a3a26, -1.85, 0, -0.9);
    k.box(0.06, 0.06, 0.06, C.amber, -1.6, 0.9, -0.85, { shadow: false });
    k.box(0.5, 0.4, 0.4, C.wood, 1.4, 0, 0.3);
    k.box(0.16, 0.08, 0.1, 0xff8fb1, 1.4, 0.4, 0.3);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
    const bulb = new THREE.Group(); bulb.position.set(0.9, 2.3, 0.2); dyn.add(bulb);
    const wire = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.02), mat(C.ink)); wire.position.y = -0.25; bulb.add(wire);
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), bulbMat); b.position.y = -0.55; bulb.add(b);
    let burst = -10;
    return {
      obj: g, colliders: [{ x: 0, z: -0.5, w: 2.0, d: 0.5 }, { x: -1.85, z: -1.0, w: 1.4, d: 0.2 }, { x: 1.4, z: 0.3, w: 0.5, d: 0.4 }],
      api: { trigger(ctx) { burst = performance.now() / 1000; ctx?.sfx?.punch?.(); } },
      animate: (t) => {
        const since = performance.now() / 1000 - burst;
        bag.rotation.x = since < 3 ? Math.sin(since * 6) * 0.45 * Math.exp(-since * 1.2) : Math.sin(t * 0.9) * 0.02;
        bulb.rotation.z = Math.sin(t * 1.1) * 0.08 + (since < 3 ? Math.sin(since * 7) * 0.15 * Math.exp(-since) : 0);
        bulbMat.color.setHex(since < 1.2 && Math.sin(since * 40) > 0 ? 0x5a4a2a : 0xffe08a);
      },
    };
  },

  pop_cinema() {
    // Little outdoor cinema: a screen with flickering film light and two rows
    // of folding seats. Decorative, animates while Nathan is near.
    const g = new THREE.Group(), k = kit(g);
    for (const x of [-1.5, 1.5]) k.box(0.12, 2.4, 0.12, C.ink, x, 0, 0);
    k.box(3.2, 1.6, 0.08, C.ink, 0, 0.75, -0.02);
    const sm = new THREE.MeshBasicMaterial({ color: 0xdfe8ff });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.4), sm); scr.position.set(0, 1.55, 0.03); scr.userData.dynamic = true; g.add(scr);
    for (const r of [0, 1]) for (let i = 0; i < 4; i++) { k.box(0.4, 0.4, 0.36, C.accent, -1.05 + i * 0.7, 0, 1.4 + r * 0.7); k.box(0.4, 0.4, 0.06, 0xa83a22, -1.05 + i * 0.7, 0.4, 1.58 + r * 0.7); }
    const near = nearness(g, 5);
    const cols = [0xdfe8ff, 0xffe8c8, 0xc8dcff, 0xf0f0f0];
    return {
      obj: g, colliders: [{ x: 0, z: 0, w: 3.2, d: 0.2 }, { x: 0, z: 1.75, w: 2.9, d: 1.2 }],
      animate: (t, state) => { const live = near(state); const f = Math.floor(t * 6) % 4; sm.color.setHex(live > 0.1 ? cols[f] : 0x9aa6bf); },
    };
  },

  pop_arcade() {
    // Small central arcade kiosk: striped awning, three cabinets with
    // flickering screens and a marquee.
    const g = new THREE.Group(), k = kit(g);
    k.box(2.2, 0.12, 2.2, 0x3a3150, 0, 0, 0);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.1, 2.4, 0.1, C.ink, x, 0.12, z);
    for (let i = 0; i < 6; i++) k.box(2.4 / 6, 0.12, 2.4, i % 2 ? C.cream : C.accent, -1.2 + (i + 0.5) * 0.4, 2.52, 0);
    const sign = boardSign('ARCADE', 1.6, 0.4); sign.position.set(0, 2.62, 1.22); g.add(sign);
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const screens = [];
    [[0, -0.6, 0, C.accent], [-0.6, 0.1, Math.PI / 2, 0x2bb3a3], [0.6, 0.1, -Math.PI / 2, 0x6fa8dc]].forEach(([x, z, ry, c]) => {
      const cab = new THREE.Group(); cab.position.set(x, 0.12, z); cab.rotation.y = ry; g.add(cab);
      const ck = kit(cab);
      ck.box(0.5, 1.45, 0.45, c, 0, 0, 0); ck.box(0.5, 0.12, 0.3, C.ink, 0, 0.8, 0.3);
      const m = new THREE.MeshBasicMaterial({ color: 0x5fe08a });
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.3), m); s.position.set(0, 1.12, 0.231); cab.add(s); s.userData.dynamic = true;
      screens.push(m);
    });
    const near = nearness(g, 5);
    const pal = [0x5fe08a, 0xffd257, 0xff6a5a, 0x6fc3ff];
    return {
      obj: g, colliders: [{ x: 0, z: 0, w: 2.2, d: 2.2 }],
      animate: (t, state) => { const live = near(state); screens.forEach((m, i) => m.color.setHex(pal[(Math.floor(t * (live > 0.1 ? 4 : 1)) + i) % 4])); },
    };
  },

  // ===================== Montfort (replaces Lake Park) =====================
  school_building({ text = 'ST. MONTFORT' } = {}) {
    // Compact two-storey school facing +z: cream walls, blue window bands,
    // red-tile roof, clock above the entrance and a sign board.
    const g = new THREE.Group(), k = kit(g);
    const W = 8.6, D = 3.4, H = 4.2;
    k.box(W + 0.3, 0.3, D + 0.3, C.plinth, 0, 0, 0);
    k.box(W, H, D, 0xf3e6c8, 0, 0.3, 0);
    k.box(W + 0.1, 0.14, D + 0.1, 0x3a6fa8, 0, 0.3 + H / 2, 0);
    for (const y of [0.9, 0.9 + H / 2]) for (let x = -W / 2 + 0.8; x < W / 2 - 0.5; x += 1.15) {
      if (Math.abs(x) < 0.7 && y < 1) continue;
      k.box(0.7, 0.85, 0.06, 0x3a6fa8, x, y, D / 2 + 0.02, { shadow: false });
      k.box(0.56, 0.7, 0.04, glow(0xcfe8ff), x, y + 0.07, D / 2 + 0.05, { shadow: false });
    }
    k.box(1.3, 1.9, 0.1, 0x5a3a26, 0, 0.3, D / 2 + 0.03);                        // entrance
    k.box(W + 0.5, 0.25, D + 0.6, 0xc4623a, 0, 0.3 + H, 0);                        // roof slab
    k.box(2.0, 1.1, 0.4, 0xf3e6c8, 0, 0.3 + H + 0.25, D / 2 - 0.3);                  // front gable block
    k.cyl(0.36, 0.36, 0.06, C.white, 0, 0.3 + H + 0.75, D / 2 - 0.05, 16, { rx: Math.PI / 2 });
    k.box(0.04, 0.24, 0.03, C.ink, 0, 0.3 + H + 0.7, D / 2 + 0.0, { shadow: false });
    k.box(0.18, 0.04, 0.03, C.ink, 0.07, 0.3 + H + 0.8, D / 2 + 0.0, { shadow: false });
    const sign = boardSign(text, 3.4, 0.5); sign.position.set(0, 0.3 + 2.0, D / 2 + 0.12); g.add(sign);
    // flag pole
    k.box(0.06, 4.2, 0.06, C.steel, W / 2 + 0.8, 0, D / 2 + 0.6);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.02), mat(0x3a6fa8)); flag.geometry.translate(0.3, 0, 0); flag.position.set(W / 2 + 0.83, 3.9, D / 2 + 0.6); flag.userData.dynamic = true; g.add(flag);
    return {
      obj: g, colliders: [{ x: 0, z: 0, w: W + 0.3, d: D + 0.3 }, { x: W / 2 + 0.8, z: D / 2 + 0.6, r: 0.15 }],
      animate: (t) => { flag.rotation.y = Math.sin(t * 2) * 0.25; },
    };
  },

  hangout_corner() {
    // Childhood hangout: a low wall to sit on, a parked cycle, a cricket bat and
    // stumps chalked on the wall, under a shady tree.
    const g = new THREE.Group(), k = kit(g);
    k.box(3.0, 0.55, 0.4, 0xd8c3a0, 0, 0, -0.6);
    k.box(3.1, 0.08, 0.5, 0xc9b48f, 0, 0.55, -0.6);
    for (const x of [-0.25, 0, 0.25]) k.box(0.05, 0.5, 0.02, C.white, x - 0.9, 0.6, -0.39, { shadow: false });
    k.box(0.12, 0.7, 0.06, C.woodLight, 1.0, 0.55, -0.35, { rz: 0.25 });
    // cycle
    for (const x of [-0.4, 0.4]) k.cyl(0.28, 0.28, 0.04, C.ink, 0.9 + x, 0, 0.5, 12, { rx: Math.PI / 2 }).position.y = 0.3;
    k.box(0.8, 0.05, 0.05, 0x3a6fa8, 0.9, 0.5, 0.5); k.box(0.05, 0.4, 0.05, 0x3a6fa8, 0.7, 0.3, 0.5); k.box(0.24, 0.05, 0.12, C.ink, 0.7, 0.72, 0.5);
    // tree
    k.cyl(0.18, 0.24, 1.6, C.trunk, -1.8, 0, 0.4, 7);
    k.mesh(new THREE.IcosahedronGeometry(1.1, 0), C.leafDark, -1.8, 2.2, 0.4);
    return { obj: g, colliders: [{ x: 0, z: -0.6, w: 3.0, d: 0.4 }, { x: 0.9, z: 0.5, w: 1.3, d: 0.3 }, { x: -1.8, z: 0.4, r: 0.3 }] };
  },

  // ===================== Airport (replaces Lighthouse) =====================
  airport_terminal() {
    const g = new THREE.Group(), k = kit(g);
    const W = 5.4, D = 3.0, H = 2.6;
    k.box(W + 0.2, 0.2, D + 0.2, C.plinth, 0, 0, 0);
    k.box(W, H, D, 0xe8eef5, 0, 0.2, 0);
    k.box(W - 0.6, H - 0.7, 0.06, glow(0xa8d8f0), 0, 0.4, D / 2 + 0.02, { shadow: false });
    for (let x = -W / 2 + 0.6; x <= W / 2 - 0.5; x += 0.9) k.box(0.06, H - 0.7, 0.08, C.steelDark, x, 0.4, D / 2 + 0.04, { shadow: false });
    k.box(W + 0.8, 0.18, D + 1.2, 0x3d4058, 0, 0.2 + H, 0.3);                   // flat canopy roof
    k.box(1.2, 1.9, 0.1, C.ink, 0, 0.2, D / 2 + 0.06);
    const sign = boardSign('AIRPORT', 3.0, 0.55); sign.position.set(0, 0.2 + H + 0.2, D / 2 + 0.95); g.add(sign);
    // departures board (no text, just blinking rows)
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    k.box(1.2, 0.7, 0.06, C.ink, -1.9, 1.3, D / 2 + 0.08);
    const rows = [];
    for (let i = 0; i < 3; i++) { const m = new THREE.MeshBasicMaterial({ color: 0xffc14d }); const r = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.01), m); r.position.set(-1.9, 1.85 - i * 0.18, D / 2 + 0.12); dyn.add(r); rows.push(m); }
    return {
      obj: g, colliders: [{ x: 0, z: 0, w: W + 0.2, d: D + 0.2 }],
      animate: (t) => rows.forEach((m, i) => m.color.setHex(Math.sin(t * 2 + i * 1.7) > 0.6 ? 0x5fe08a : 0xffc14d)),
    };
  },

  control_tower() {
    const g = new THREE.Group(), k = kit(g);
    k.cyl(0.7, 0.8, 0.3, C.plinth, 0, 0, 0, 8);
    k.cyl(0.4, 0.5, 4.2, 0xe8eef5, 0, 0.3, 0, 8);
    k.cyl(0.95, 0.75, 0.9, glow(0xa8d8f0), 0, 4.5, 0, 8);
    k.cyl(1.05, 1.05, 0.15, 0x3d4058, 0, 5.4, 0, 8);
    k.box(0.05, 0.8, 0.05, C.ink, 0, 5.55, 0);
    const bm = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), bm); beacon.position.y = 6.4; beacon.userData.dynamic = true; g.add(beacon);
    return { obj: g, colliders: [{ x: 0, z: 0, r: 0.75 }], animate: (t) => bm.color.setHex(Math.sin(t * 3) > 0.3 ? 0xff3b30 : 0x5a1a1a) };
  },

  private_jet() {
    // Parked private jet, nose toward +x, boarding stairs on the +z side.
    const g = new THREE.Group(), k = kit(g);
    const body = 0xf4f6fa, stripe = C.accent;
    k.cyl(0.45, 0.45, 4.0, body, 0, 0.6, 0, 12, { rz: Math.PI / 2 }).position.set(0.2, 1.05, 0);
    k.mesh(new THREE.ConeGeometry(0.45, 1.0, 12), body, 2.7, 1.05, 0, { rz: -Math.PI / 2 });
    k.mesh(new THREE.ConeGeometry(0.45, 1.2, 12), body, -2.4, 1.15, 0, { rz: Math.PI / 2 });
    k.box(4.4, 0.08, 0.02, stripe, 0.2, 1.02, 0.46, { shadow: false });
    k.box(4.4, 0.08, 0.02, stripe, 0.2, 1.02, -0.46, { shadow: false });
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) k.box(0.18, 0.14, 0.02, 0x2a3a5a, -1.4 + i * 0.5, 1.18, s * 0.455, { shadow: false });
    k.box(0.5, 0.2, 0.02, 0x2a3a5a, 2.55, 1.2, 0.3, { ry: 0.6, shadow: false });
    // wings + tail
    k.box(1.2, 0.08, 4.0, body, -0.1, 0.8, 0);
    for (const s of [-1, 1]) k.box(0.3, 0.3, 0.06, stripe, -0.5, 0.88, s * 1.98);
    k.box(0.8, 1.2, 0.08, body, -2.3, 1.4, 0, { rz: 0.3 });
    k.box(0.5, 0.06, 1.6, body, -2.55, 2.5, 0);
    for (const s of [-1, 1]) k.cyl(0.18, 0.18, 0.8, 0xc6d2e0, -1.6, 1.25, s * 0.62, 10, { rz: Math.PI / 2 });
    // landing gear
    for (const [x, z] of [[2.0, 0], [-0.4, -0.5], [-0.4, 0.5]]) { k.box(0.06, 0.55, 0.06, C.ink, x, 0, z); k.cyl(0.14, 0.14, 0.1, C.ink, x, 0, z, 8, { rx: Math.PI / 2 }).position.y = 0.14; }
    // door + stairs
    k.box(0.5, 0.75, 0.02, 0xd8dee8, 1.6, 0.85, 0.47, { shadow: false });
    for (let i = 0; i < 5; i++) k.box(0.55, 0.06, 0.22, C.steelDark, 1.6, 0.8 - i * 0.17, 0.62 + i * 0.2);
    k.box(0.04, 0.9, 1.1, C.ink, 1.88, 0.2, 0.95, { rx: -0.7, shadow: false });
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const navR = new THREE.MeshBasicMaterial({ color: 0xff3b30 }), navG = new THREE.MeshBasicMaterial({ color: 0x5fe08a });
    const nr = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), navR); nr.position.set(-0.1, 0.9, -2.0);
    const ng = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), navG); ng.position.set(-0.1, 0.9, 2.0);
    dyn.add(nr, ng);
    // chocks
    for (const z of [-0.5, 0.5]) k.box(0.2, 0.12, 0.12, C.yellow, -0.15, 0, z);
    return {
      obj: g,
      colliders: [{ x: 0.2, z: 0, w: 5.6, d: 1.0 }, { x: -0.1, z: 0, w: 1.2, d: 4.0 }, { x: 1.6, z: 1.0, w: 0.6, d: 0.9 }],
      animate: (t) => { const on = Math.sin(t * 4) > 0.5; navR.color.setHex(on ? 0xff3b30 : 0x5a1a1a); navG.color.setHex(on ? 0x5fe08a : 0x1a4a2a); },
    };
  },

  runway({ len = 16, w = 2.6 } = {}) {
    // Flat markings on concrete: centre dashes, threshold bars, edge lights.
    const g = new THREE.Group(), k = kit(g);
    k.box(len, 0.02, w, 0x55586a, 0, 0.02, 0, { shadow: false });
    for (let x = -len / 2 + 1.5; x < len / 2 - 1.2; x += 1.2) k.box(0.6, 0.01, 0.08, C.white, x, 0.04, 0, { shadow: false });
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) k.box(0.7, 0.01, 0.14, C.white, s * (len / 2 - 0.6), 0.04, -0.75 + i * 0.5, { shadow: false });
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const lights = [];
    for (let x = -len / 2; x <= len / 2 + 0.01; x += 2) for (const s of [-1, 1]) { const m = new THREE.MeshBasicMaterial({ color: 0xffc14d }); const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), m); l.position.set(x, 0.06, s * (w / 2 + 0.1)); dyn.add(l); lights.push({ m, x }); }
    return { obj: g, colliders: [], animate: (t) => lights.forEach(({ m, x }) => m.color.setHex(((t * 4 - x * 0.5) % 4 + 4) % 4 < 0.6 ? 0xffffff : 0xffc14d)) };
  },

  windsock() {
    const g = new THREE.Group(), k = kit(g);
    k.box(0.08, 2.2, 0.08, C.steelDark, 0, 0, 0);
    const sock = new THREE.Group(); sock.position.set(0, 2.1, 0); sock.userData.dynamic = true; g.add(sock);
    [C.accent, C.white, C.accent].forEach((c, i) => { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - i * 0.03, 0.13 - i * 0.03, 0.3, 8), mat(c)); s.rotation.z = Math.PI / 2; s.position.x = 0.2 + i * 0.3; sock.add(s); });
    return { obj: g, colliders: [{ x: 0, z: 0, r: 0.15 }], animate: (t) => { sock.rotation.y = Math.sin(t * 0.6) * 0.4; sock.rotation.z = -0.1 + Math.sin(t * 2.3) * 0.06; } };
  },

  // ===================== Pop Culture Park: character areas =====================
  alley_props() {
    // Red-lit alley dressing: dumpster, crates, a red lamp, steam vent, puddle.
    const g = new THREE.Group(), k = kit(g);
    k.box(1.2, 0.7, 0.7, 0x3a5a4a, -0.2, 0, 0); k.box(1.24, 0.08, 0.74, 0x2a4038, -0.2, 0.7, 0, { rx: -0.08 });
    k.box(0.5, 0.5, 0.5, C.wood, 0.8, 0, 0.7); k.box(0.4, 0.4, 0.4, 0x8a5a36, 0.85, 0.5, 0.7);
    k.box(0.08, 2.6, 0.08, C.ink, 3.6, 0, -0.6); k.box(0.5, 0.06, 0.06, C.ink, 3.4, 2.55, -0.6);
    k.box(0.26, 0.2, 0.26, glow(0xff3b30), 3.2, 2.35, -0.6, { shadow: false });
    k.box(0.7, 0.03, 0.5, 0x23202e, 2.0, 0, 1.6, { shadow: false });
    k.cyl(0.6, 0.6, 0.01, 0x3a4a6a, 1.2, 0, 1.0, 12, { shadow: false });
    const pool = lightPool(2.4, 0xff4a3a); pool.position.set(3.2, 0.08, -0.4); g.add(pool);
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const puffs = [0, 1, 2].map((i) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: 0xe8e8f0, transparent: true, opacity: 0.4, depthWrite: false })); dyn.add(m); return m; });
    return {
      obj: g, colliders: [{ x: -0.2, z: 0, w: 1.2, d: 0.7 }, { x: 0.8, z: 0.7, w: 0.5, d: 0.5 }, { x: 3.6, z: -0.6, r: 0.15 }],
      nightGlow: [pool],
      animate: (t) => puffs.forEach((m, i) => { const u = ((t * 0.4 + i / 3) % 1); m.position.set(2.0, 0.1 + u * 1.6, 1.6); m.scale.setScalar(0.6 + u * 1.4); m.material.opacity = 0.4 * (1 - u); }),
    };
  },

  rooftop_props() {
    // Colourful rooftop for the web runner: painted deck, stair hut, AC unit,
    // vents and an antenna. The deck is flat so it never blocks walking.
    const g = new THREE.Group(), k = kit(g);
    k.box(4.4, 0.04, 3.6, 0x2f8f9a, 0, 0, 1.6, { shadow: false });
    for (const [x, z] of [[-1.5, 0.6], [0, 2.6], [1.5, 0.6]]) k.box(0.9, 0.01, 0.1, C.yellow, x, 0.045, z, { shadow: false });
    k.box(0.8, 1.7, 0.8, 0xe07a5a, -1.3, 0, 1.6); k.box(0.9, 0.1, 0.9, 0x6a2c2c, -1.3, 1.7, 1.6); k.box(0.4, 1.1, 0.04, 0x3a2a2a, -1.3, 0, 2.02);
    k.box(0.7, 0.5, 0.5, 0xc6d2e0, 1.6, 0, 1.4); for (let i = 0; i < 3; i++) k.box(0.6, 0.03, 0.02, 0x7d8fa8, 1.6, 0.12 + i * 0.12, 1.66, { shadow: false });
    k.cyl(0.08, 0.08, 0.5, C.steelDark, 0.6, 0, 0.5, 6); k.cyl(0.08, 0.08, 0.4, C.steelDark, -0.3, 0, 0.6, 6);
    k.box(0.04, 2.2, 0.04, C.ink, 2.0, 0, 0.3); k.box(0.5, 0.04, 0.04, C.ink, 2.0, 2.0, 0.3);
    // webs: a big corner web on the hut, strands to the frame and the antenna
    const webM = mat(0xf4f6fa);
    const web = (cx, cy, cz, r, ry) => {
      const w = new THREE.Group(); w.position.set(cx, cy, cz); w.rotation.y = ry; g.add(w);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI - Math.PI / 2; const sp = new THREE.Mesh(new THREE.BoxGeometry(0.025, r, 0.025), webM); sp.position.set(Math.sin(a) * r / 2, -Math.cos(a) * r / 2, 0); sp.rotation.z = a; w.add(sp); }
      for (const f of [0.35, 0.65, 0.95]) for (let i = 0; i < 5; i++) { const a = ((i + 0.5) / 6) * Math.PI - Math.PI / 2, len = 2 * r * f * Math.sin(Math.PI / 12); const st = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, 0.02), webM); st.position.set(Math.sin(a) * r * f * 0.97, -Math.cos(a) * r * f * 0.97, 0); st.rotation.z = a + Math.PI / 2; w.add(st); }
    };
    web(-0.88, 1.66, 2.02, 0.9, 0);          // hut doorway corner
    web(1.95, 0.5, 1.66, 0.6, 0);            // AC unit
    web(-1.2, 2.0, 0.05, 1.1, 0);            // between frame post and hut
    const strand = (a, b) => { const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, d.length()), webM); m.position.copy(a).addScaledVector(d, 0.5); m.lookAt(b); g.add(m); };
    strand(new THREE.Vector3(-1.3, 1.75, 1.6), new THREE.Vector3(-1.2, 2.55, 0));
    strand(new THREE.Vector3(1.2, 2.55, 0), new THREE.Vector3(2.0, 2.15, 0.3));
    strand(new THREE.Vector3(-0.9, 1.75, 2.0), new THREE.Vector3(1.6, 0.52, 1.4));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 1.4), webM); sp.position.set(0.3, 0.05, 2.6); sp.rotation.y = a; g.add(sp); }
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const blinkM = new THREE.MeshBasicMaterial({ color: 0xff3b30 }); const blink = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), blinkM); blink.position.set(2.0, 2.26, 0.3); dyn.add(blink);
    const fan = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.06), mat(C.ink)); fan.position.set(1.6, 0.52, 1.4); dyn.add(fan);
    return {
      obj: g, colliders: [{ x: -1.3, z: 1.6, w: 0.8, d: 0.8 }, { x: 1.6, z: 1.4, w: 0.7, d: 0.5 }, { x: 2.0, z: 0.3, r: 0.12 }],
      animate: (t) => { blinkM.color.setHex(Math.sin(t * 3) > 0.4 ? 0xff3b30 : 0x4a1a1a); fan.rotation.y = t * 8; },
    };
  },

  moon_court() {
    // Moonlit courtyard: pale paving, two obelisks with crescent tops and two
    // braziers with a cold blue flame.
    const g = new THREE.Group(), k = kit(g);
    k.box(4.2, 0.04, 4.6, 0xe6e2d8, 0, 0, 0, { shadow: false });
    for (let i = 0; i < 6; i++) k.box(4.2, 0.005, 0.03, 0xc9c3b6, 0, 0.045, -2.1 + i * 0.84, { shadow: false });
    const pale = 0xf0ece4;
    for (const x of [-1.4, 1.4]) {
      k.box(0.5, 0.2, 0.5, 0xc9c3b6, x, 0, -1.0);
      k.box(0.32, 2.0, 0.32, pale, x, 0.2, -1.0);
      k.mesh(new THREE.ConeGeometry(0.24, 0.4, 4), pale, x, 2.4, -1.0, { ry: Math.PI / 4 });
      const cm = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 4, 12, Math.PI * 1.2), mat(0xdfe8ff, { emissive: 0x9fb4ff, emissiveIntensity: 0.4, keep: true }));
      cm.position.set(x, 2.85, -1.0); cm.rotation.z = Math.PI * 0.6; g.add(cm);
    }
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const flames = [];
    for (const x of [-1.4, 1.4]) {
      k.cyl(0.25, 0.18, 0.5, 0x8a8f9a, x, 0, 1.6, 8); k.cyl(0.3, 0.3, 0.06, 0x6a6f7a, x, 0.5, 1.6, 8);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 6), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.85 })); f.position.set(x, 0.78, 1.6); dyn.add(f); flames.push(f);
    }
    const pools = [-1.4, 1.4].map((x) => { const p = lightPool(1.8, 0x9fc8ff); p.position.set(x, 0.08, 1.6); g.add(p); return p; });
    return {
      obj: g, colliders: [{ x: -1.4, z: -1.0, w: 0.5, d: 0.5 }, { x: 1.4, z: -1.0, w: 0.5, d: 0.5 }, { x: -1.4, z: 1.6, r: 0.3 }, { x: 1.4, z: 1.6, r: 0.3 }],
      nightGlow: pools,
      animate: (t) => flames.forEach((f, i) => { f.scale.set(1, 0.85 + 0.25 * Math.sin(t * 7 + i * 2), 1); }),
    };
  },

  neon_sign({ text = "HELL'S KITCHEN", w = 3.8, h = 0.62 } = {}) {
    // Red neon street sign on brackets (Hell's Kitchen alley).
    const g = new THREE.Group(), k = kit(g);
    const sign = boardSign(text, w, h, { fg: '#ff4a3a', bg: '#1a0f16', board: 0x1a0f16, trim: 0xff3b30 });
    sign.position.set(0, 2.0, 0); g.add(sign);
    for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) k.box(0.06, 0.06, 0.3, C.ink, x, 2.0 + h / 2, -0.15);
    const pool = lightPool(2.2, 0xff3b30); pool.position.set(0, 0.08, 1.0); g.add(pool);
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.5, h + 0.4), new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.set(0, 2.0, 0.05); dyn.add(halo);
    return { obj: g, colliders: [], nightGlow: [pool], animate: (t) => { halo.material.opacity = Math.sin(t * 13) > 0.92 ? 0.04 : 0.18 + 0.04 * Math.sin(t * 2); } };
  },

  pied_piper({ w = 3.0, d = 2.4 } = {}) {
    // Suburban startup house with a bold PIED PIPER board over the garage.
    const g = new THREE.Group(), k = kit(g);
    const W = w, D = d, H = 2.6;
    k.box(W + 0.2, 0.2, D + 0.2, C.plinth, 0, 0, 0);
    k.box(W, H, D, 0xe9e4d6, 0, 0.2, 0);
    const rs = new THREE.Shape(); rs.moveTo(-D / 2 - 0.3, 0); rs.lineTo(D / 2 + 0.3, 0); rs.lineTo(0, 1.0); rs.closePath();
    k.mesh(new THREE.ExtrudeGeometry(rs, { depth: W + 0.4, bevelEnabled: false }), 0x4a5a6a, -W / 2 - 0.2, 0.2 + H, 0, { ry: Math.PI / 2 });
    k.box(1.6, 1.5, 0.06, 0xc6d2e0, -0.5, 0.2, D / 2 + 0.02);                       // garage door
    for (let i = 0; i < 4; i++) k.box(1.6, 0.03, 0.04, 0x9aa8bf, -0.5, 0.45 + i * 0.32, D / 2 + 0.06, { shadow: false });
    k.box(0.6, 1.6, 0.06, 0x2f5a3a, 0.95, 0.2, D / 2 + 0.02);                       // front door
    k.box(0.5, 0.4, 0.04, glow(0xcfe8ff), 0.95, 1.95, D / 2 + 0.04, { shadow: false });
    const sign = boardSign('PIED PIPER', Math.max(3.6, W - 0.4), 1.15, { fg: '#ffffff', bg: '#1f6b3a', board: 0x1f6b3a, trim: 0xf2f0ea, size: 92 });
    sign.position.set(0, 0.2 + H + 0.55, D / 2 + 0.3); g.add(sign);
    for (const x of [-1.3, 1.3]) k.box(0.1, 0.7, 0.1, 0x2a2440, x, 0.2 + H - 0.1, D / 2 + 0.2);
    k.box(0.5, 0.6, 0.06, C.white, -1.15, 0.9, D / 2 + 0.06);                       // whiteboard by the door
    for (const [x, y, c] of [[-1.25, 1.3, C.accent], [-1.05, 1.1, 0x2bb3a3]]) k.box(0.14, 0.08, 0.02, c, x, y, D / 2 + 0.1, { shadow: false });
    return { obj: g, colliders: [{ x: 0, z: 0, w: W + 0.2, d: D + 0.2 }] };
  },

  training_dummy() {
    const g = new THREE.Group(), k = kit(g);
    k.box(0.5, 0.1, 0.5, 0x6f4a30, 0, 0, 0);
    k.box(0.12, 1.5, 0.12, C.trunk, 0, 0.1, 0);
    k.box(1.0, 0.1, 0.1, C.trunk, 0, 1.2, 0);
    k.box(0.5, 0.6, 0.36, 0xd8c39a, 0, 0.75, 0);
    k.box(0.32, 0.32, 0.32, 0xd8c39a, 0, 1.45, 0);
    k.box(0.52, 0.08, 0.38, 0x8a2a2a, 0, 1.0, 0, { shadow: false });
    return { obj: g, colliders: [{ x: 0, z: 0, r: 0.3 }] };
  },

  paddock({ r = 2.7 } = {}) {
    // Round riding paddock: packed-dirt ring and a post-and-rail fence with a
    // gate gap on the west side (local -x).
    const g = new THREE.Group(), k = kit(g);
    k.cyl(r, r, 0.03, 0xc9a27a, 0, 0, 0, 28, { shadow: false });
    k.cyl(r - 0.9, r - 0.9, 0.035, 0xb8916a, 0, 0, 0, 24, { shadow: false });
    const N = 26, cols = [], gate = (a) => Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.3;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      if (gate(a)) continue;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      k.box(0.12, 0.95, 0.12, C.wood, x, 0, z);
      cols.push({ x, z, r: 0.14 });
      const a2 = ((i + 1) / N) * Math.PI * 2;
      if (gate(a2)) continue;
      const x2 = Math.cos(a2) * r, z2 = Math.sin(a2) * r, len = Math.hypot(x2 - x, z2 - z);
      for (const y of [0.45, 0.82]) { const rail = k.box(len, 0.07, 0.06, C.woodLight, (x + x2) / 2, y, (z + z2) / 2); rail.rotation.y = -Math.atan2(z2 - z, x2 - x); }
    }
    k.box(0.5, 0.35, 0.3, C.wood, r + 0.6, 0, -1.2); k.box(0.46, 0.06, 0.26, 0xd9b27a, r + 0.6, 0.35, -1.2);   // hay bale + water trough feel
    return { obj: g, colliders: cols };
  },

  giant_soap({ text = 'FIGHT CLUB' } = {}) {
    // A big pink bar of soap with FIGHT CLUB pressed into it, with bubbles.
    const g = new THREE.Group(), k = kit(g);
    const pink = 0xff8fb1, deep = 0xe8648e;
    k.box(2.3, 0.7, 1.3, pink, 0, 0, 0);
    k.box(2.1, 0.12, 1.1, 0xffa8c4, 0, 0.7, 0);
    k.box(2.34, 0.06, 1.34, deep, 0, 0, 0, { shadow: false });
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const x2 = cv.getContext('2d');
    x2.fillStyle = '#ffa8c4'; x2.fillRect(0, 0, 256, 64);
    x2.font = 'bold 40px Silkscreen, monospace'; x2.textAlign = 'center'; x2.textBaseline = 'middle';
    x2.fillStyle = '#ffd6e4'; x2.fillText(text, 130, 35);
    x2.fillStyle = '#c2456e'; x2.fillText(text, 128, 33);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48), new THREE.MeshBasicMaterial({ map: tex }));
    top.rotation.x = -Math.PI / 2; top.position.set(0, 0.825, 0.05); top.userData.dynamic = true; g.add(top);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), new THREE.MeshBasicMaterial({ map: tex }));
    front.position.set(0, 0.36, 0.655); front.userData.dynamic = true; g.add(front);
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    const bubbles = [0, 1, 2, 3, 4].map((i) => { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08 + (i % 3) * 0.04, 1), new THREE.MeshBasicMaterial({ color: 0xf6f3ff, transparent: true, opacity: 0.7, depthWrite: false })); dyn.add(b); return b; });
    return {
      obj: g, colliders: [{ x: 0, z: 0, w: 2.3, d: 1.3 }],
      animate: (t) => bubbles.forEach((b, i) => { const u = (t * 0.25 + i / 5) % 1; b.position.set(-0.8 + i * 0.4 + Math.sin(t + i) * 0.1, 0.9 + u * 1.6, Math.cos(t * 0.7 + i) * 0.3); b.material.opacity = 0.7 * (1 - u); }),
    };
  },
};
