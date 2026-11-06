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
};
