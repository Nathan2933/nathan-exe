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
  teal: 0x2bb3a3, sky: 0x6fc3ff, yellow: 0xffd257, mint: 0x9ee6c4,
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
};
