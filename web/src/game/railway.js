import * as THREE from 'three';
import { mat, C, mergeGroupByMat } from './kit.js';
import { tileAt } from './tiled.js';

// The Memory Line: track bed, rails, sleepers and a lake bridge built along
// the closed polygon on the Tiled "rail" layer, plus a three-car train that
// loops the town and pauses at each station.

export function buildRailway(root, map, stations, animated) {
  if (!map.rail) return null;
  const pts = map.rail.points.map((p) => new THREE.Vector3(p.x, 0, p.z));
  const n = pts.length;
  const add = (geo, color, x, y, z, ry, shadow = false) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = shadow; m.receiveShadow = true;
    root.add(m);
    return m;
  };
  const water = (x, z) => tileAt(map, x, z)?.type === 'water';

  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = a.distanceTo(b);
    if (len < 0.01) continue;
    const ry = Math.atan2(b.x - a.x, b.z - a.z);
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const overWater = water(mx, mz) || water(a.x, a.z) || water(b.x, b.z);
    const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len, nx = uz, nz = -ux;
    if (overWater) {
      add(new THREE.BoxGeometry(2.6, 0.16, len + 0.05), C.woodLight, mx, 0.1, mz, ry, true);
      for (const s of [-1.25, 1.25]) add(new THREE.BoxGeometry(0.1, 0.5, len + 0.05), C.wood, mx + nx * s, 0.35, mz + nz * s, ry, true);
      for (let d = 0; d < len; d += 3) for (const s of [-1.1, 1.1]) add(new THREE.BoxGeometry(0.2, 1.2, 0.2), C.wood, a.x + ux * d + nx * s, -0.5, a.z + uz * d + nz * s, ry);
    } else {
      add(new THREE.BoxGeometry(2.3, 0.16, len + 0.3), 0xc9bfb2, mx, 0.08, mz, ry);   // ballast bed
    }
    // sleepers
    for (let d = 0.3; d < len; d += 0.75) add(new THREE.BoxGeometry(1.7, 0.06, 0.24), C.wood, a.x + ux * d, 0.19, a.z + uz * d, ry);
    // rails
    for (const s of [-0.48, 0.48]) add(new THREE.BoxGeometry(0.09, 0.09, len + 0.06), 0x8f9bb0, mx + nx * s, 0.25, mz + nz * s, ry, true);
  }

  // ---------- train ----------
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.2);
  const L = curve.getLength();
  const train = [];
  const car = (body, roofC, isEngine) => {
    const g = new THREE.Group();
    const m = (geo, color, x, y, z) => { const o = new THREE.Mesh(geo, mat(color)); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    m(new THREE.BoxGeometry(1.5, 0.3, 2.7), C.ink, 0, 0.45, 0);
    m(new THREE.BoxGeometry(1.45, 1.25, 2.6), body, 0, 1.2, 0);
    m(new THREE.BoxGeometry(1.55, 0.14, 2.75), roofC, 0, 1.88, 0);
    m(new THREE.BoxGeometry(1.47, 0.12, 2.62), C.cream, 0, 0.95, 0);
    for (const z of [-0.75, 0, 0.75]) for (const x of [-0.74, 0.74]) m(new THREE.BoxGeometry(0.04, 0.42, 0.5), 0xffd27a, x, 1.38, z).material = mat(0xffd27a, { emissive: 0x7a4a10, emissiveIntensity: 0.6 });
    for (const z of [-0.9, 0.9]) for (const x of [-0.66, 0.66]) { const w = m(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10), C.ink, x, 0.32, z); w.rotation.z = Math.PI / 2; }
    if (isEngine) {
      m(new THREE.BoxGeometry(1.2, 0.5, 0.4), C.ink, 0, 1.1, 1.45);
      m(new THREE.BoxGeometry(0.9, 0.3, 0.08), mat(0xfff1c0, { emissive: 0xffd27a, emissiveIntensity: 1 }), 0, 1.15, 1.66).material = mat(0xfff1c0, { emissive: 0xffd27a, emissiveIntensity: 1 });
      m(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8), C.ink, 0.35, 2.1, 0.7);
    }
    mergeGroupByMat(g, { trackPalette: true });
    g.userData.dynamic = true;
    root.add(g);
    return g;
  };
  train.push(car(C.accent, C.ink, true), car(C.teal, C.ink, false), car(C.yellow, C.ink, false));

  // Sliding doors on the middle carriage (both sides; only the platform side opens during an arrival).
  // Added after the merge so the panels stay separate meshes we can move.
  const DOOR_CAR = 1;
  const doors = [-1, 1].map((sgn) => {
    const mk = (w, h, d, color, x, y, z) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
      o.position.set(x, y, z); train[DOOR_CAR].add(o); return o;
    };
    mk(0.03, 0.95, 0.64, C.ink, sgn * 0.74, 1.08, 0);                       // dark doorway
    const a = mk(0.04, 0.95, 0.32, C.teal, sgn * 0.765, 1.08, -0.16);       // sliding halves
    const b = mk(0.04, 0.95, 0.32, C.teal, sgn * 0.765, 1.08, 0.16);
    return { sgn, a, b, k: 0 };
  });
  const door = { sgn: 1, target: 0, k: 0 };

  // Arc-length position of each station along the loop
  const SAMPLES = 400;
  const samplePts = curve.getSpacedPoints(SAMPLES);
  const stops = stations.map((st) => {
    let best = 0, bestD = Infinity;
    samplePts.forEach((q, i) => { const d = Math.hypot(q.x - st.x, q.z - st.z); if (d < bestD) { bestD = d; best = i; } });
    return { s: (best / SAMPLES) * L, station: st };
  }).sort((a, b) => a.s - b.s);

  const state = { s: stops.length ? stops[0].s - 20 : 0, v: 0, wait: 0, nextStop: 0, last: 0, script: false };
  const VMAX = 6.5, ACC = 2.2;
  animated.push((t) => {
    const dt = Math.min(0.05, Math.max(0, t - state.last)); state.last = t;
    door.k += Math.sign(door.target - door.k) * Math.min(Math.abs(door.target - door.k), dt / 0.4);
    for (const d of doors) {
      const k = d.sgn === door.sgn ? door.k * door.k * (3 - 2 * door.k) : 0;
      d.a.position.z = -0.16 - k * 0.3; d.b.position.z = 0.16 + k * 0.3;
    }
    if (state.script) { /* driven by an arrival cutscene */ }
    else if (state.wait > 0) { state.wait -= dt; }
    else if (stops.length) {
      const target = stops[state.nextStop].s;
      let dist = (target - state.s) % L; if (dist < 0) dist += L;
      const brake = Math.sqrt(2 * ACC * Math.max(0, dist - 1.5));
      state.v = Math.min(VMAX, state.v + ACC * dt, brake + 0.6);
      state.s += state.v * dt;
      if (dist < 0.6) { state.v = 0; state.wait = 3.5; state.nextStop = (state.nextStop + 1) % stops.length; }
    }
    train.forEach((g, i) => {
      let s = (state.s - i * 3.0) % L; if (s < 0) s += L;
      const u = s / L;
      const p = curve.getPointAt(u), tan = curve.getTangentAt(u);
      g.position.set(p.x, 0.12, p.z);
      g.rotation.y = Math.atan2(tan.x, tan.z);
    });
  });
  const stopOf = (st) => stops.findIndex((q) => q.station === st);
  return {
    curve, length: L, train, get speed() { return state.v; },
    /** Where a station's track point is, the track direction, which way the platform lies, and how far away it is. */
    stopGeometry(st) {
      const q = stops[stopOf(st)]; if (!q) return null;
      const u = q.s / L, p = curve.getPointAt(u), tan = curve.getTangentAt(u);
      let nx = tan.z, nz = -tan.x;
      if ((st.x - p.x) * nx + (st.z - p.z) * nz < 0) { nx = -nx; nz = -nz; }
      return { p, tan, side: { x: nx, z: nz }, dist: (st.x - p.x) * nx + (st.z - p.z) * nz, doorCar: DOOR_CAR, carGap: 3.0 };
    },
    /** Cutscene control: put the door carriage `back` metres short of the platform centre, moving at v. */
    drive(st, back, v) {
      const q = stops[stopOf(st)]; if (!q) return;
      state.script = true; state.v = v; state.wait = 0;
      state.s = ((q.s + DOOR_CAR * 3.0 - back) % L + L) % L;
    },
    setDoor(sgnTowardPlatform, open) { door.sgn = sgnTowardPlatform; door.target = open ? 1 : 0; },
    /** Hand the train back to its normal loop: it waits a moment, then heads for the next stop. */
    release(st) {
      state.script = false; state.v = 0; state.wait = 2.4;
      const i = stopOf(st); if (i >= 0) state.nextStop = (i + 1) % stops.length;
      door.target = 0;
    },
  };
}
