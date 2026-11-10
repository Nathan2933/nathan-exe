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
  lines.visible = false;
  lines.userData.dynamic = true;
  root.add(lines);

  // splash rings on the ground (batched as a single InstancedMesh, hidden when dry)
  const S_COUNT = 24;
  const ringGeo = new THREE.RingGeometry(0.08, 0.14, 8);
  ringGeo.rotateX(-Math.PI / 2);
  const alphas = new Float32Array(S_COUNT);
  const alphaAttr = new THREE.InstancedBufferAttribute(alphas, 1);
  ringGeo.setAttribute('aAlpha', alphaAttr);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xe6f6ff, transparent: true, opacity: 1, depthWrite: false });
  ringMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vInstAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstAlpha = aAlpha;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vInstAlpha;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vInstAlpha;');
  };
  ringMat.customProgramCacheKey = () => 'inst-alpha-v1';
  const splashInst = new THREE.InstancedMesh(ringGeo, ringMat, S_COUNT);
  splashInst.frustumCulled = false;
  splashInst.visible = false;
  splashInst.userData.dynamic = true;
  root.add(splashInst);

  const splashes = [];
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < S_COUNT; i++) {
    splashes.push({ x: x0 + Math.random() * zone.w, z: z0 + Math.random() * zone.d, t: Math.random() });
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
    const active = k > 0.01;
    lines.visible = active;
    splashInst.visible = active;
    if (!active) return;

    matl.opacity = 0.55 * k;
    for (let i = 0; i < N; i++) {
      const d = drops[i];
      d.y -= d.v * dt;
      if (d.y < 0) { d.y = H; d.x = x0 + Math.random() * zone.w; d.z = z0 + Math.random() * zone.d; }
      const o = i * 6;
      pos[o] = d.x; pos[o + 1] = d.y; pos[o + 2] = d.z;
      pos[o + 3] = d.x - 0.08; pos[o + 4] = d.y + 0.55; pos[o + 5] = d.z - 0.04;
    }
    geo.attributes.position.needsUpdate = true;

    for (let i = 0; i < S_COUNT; i++) {
      const s = splashes[i];
      s.t += dt * 2.2;
      if (s.t > 1) { s.t = 0; s.x = x0 + Math.random() * zone.w; s.z = z0 + Math.random() * zone.d; }
      const q = s.t, sc = 1 + q * 3;
      m4.makeScale(sc, 1, sc);
      m4.setPosition(s.x, 0.06, s.z);
      splashInst.setMatrixAt(i, m4);
      alphas[i] = (1 - q) * 0.6 * k;
    }
    splashInst.instanceMatrix.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  });

  return {
    zone,
    intensity: intensityAt,
    contains: (x, z) => Math.abs(x - zone.x) <= zone.w / 2 && Math.abs(z - zone.z) <= zone.d / 2,
  };
}
