import * as THREE from 'three';

// Monsoon showers: rain streaks inside a rectangular zone (a Tiled "rain_zone"
// rectangle on the objects layer). Showers come and go on a cycle so the
// campus alternates between sun and rain.

const PERIOD = 34;   // seconds per weather cycle
const SHOWER = 15;   // seconds of rain per cycle
const FADE = 3;

export function buildRain(root, zone, animated) {
  const N = 420, H = 11;
  const x0 = zone.x - zone.w / 2, z0 = zone.z - zone.d / 2;
  const pos = new Float32Array(N * 6);
  const drops = [];
  for (let i = 0; i < N; i++) drops.push({ x: x0 + Math.random() * zone.w, z: z0 + Math.random() * zone.d, y: Math.random() * H, v: 16 + Math.random() * 6 });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const matl = new THREE.LineBasicMaterial({ color: 0xd6f0ff, transparent: true, opacity: 0, depthWrite: false });
  const lines = new THREE.LineSegments(geo, matl);
  lines.frustumCulled = false;
  lines.userData.dynamic = true;
  root.add(lines);

  // splash rings on the ground
  const splashes = [];
  const ringGeo = new THREE.RingGeometry(0.08, 0.14, 8);
  for (let i = 0; i < 24; i++) {
    const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xe6f6ff, transparent: true, opacity: 0, depthWrite: false }));
    r.rotation.x = -Math.PI / 2; r.userData = { dynamic: true, t: Math.random() };
    root.add(r); splashes.push(r);
  }

  let last = 0;
  const intensityAt = (t) => {
    const c = t % PERIOD;
    if (c > SHOWER) return 0;
    return Math.min(1, c / FADE, (SHOWER - c) / FADE);
  };
  animated.push((t) => {
    const dt = Math.min(0.05, Math.max(0, t - last)); last = t;
    const k = intensityAt(t);
    matl.opacity = 0.55 * k;
    lines.visible = k > 0.01;
    if (lines.visible) {
      for (let i = 0; i < N; i++) {
        const d = drops[i];
        d.y -= d.v * dt;
        if (d.y < 0) { d.y = H; d.x = x0 + Math.random() * zone.w; d.z = z0 + Math.random() * zone.d; }
        const o = i * 6;
        pos[o] = d.x; pos[o + 1] = d.y; pos[o + 2] = d.z;
        pos[o + 3] = d.x - 0.08; pos[o + 4] = d.y + 0.55; pos[o + 5] = d.z - 0.04;
      }
      geo.attributes.position.needsUpdate = true;
    }
    for (const s of splashes) {
      s.userData.t += dt * 2.2;
      if (s.userData.t > 1) { s.userData.t = 0; s.position.set(x0 + Math.random() * zone.w, 0.06, z0 + Math.random() * zone.d); }
      const q = s.userData.t;
      s.scale.setScalar(1 + q * 3);
      s.material.opacity = (1 - q) * 0.6 * k;
    }
  });

  return {
    zone,
    intensity: intensityAt,
    contains: (x, z) => Math.abs(x - zone.x) <= zone.w / 2 && Math.abs(z - zone.z) <= zone.d / 2,
  };
}
