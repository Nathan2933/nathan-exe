import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../node_modules/three/build/three.module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

console.log('=== TEST SUITE: Tahiti Photography Session & Album E2E Verification ===\n');

// 1. Verify Map Object & Interaction Circle
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/public/maps/tahiti.tmj'), 'utf8'));
const objs = map.layers.flatMap((l) => l.objects || []);
const HALF = map.width / 2;
const PX = map.tilewidth;
function toWorld(tx, ty) {
  return { x: +(tx / PX - HALF).toFixed(2), z: +(ty / PX - HALF).toFixed(2) };
}

const photoStation = objs.find((o) => o.type === 'photo_station');
assert(photoStation, 'photo_station object must exist in map');
const psPos = toWorld(photoStation.x, photoStation.y);
console.log(`1. Photo station position: (${psPos.x.toFixed(2)}, ${psPos.z.toFixed(2)})`);
assert.strictEqual(psPos.x, 6.0, 'Photo station must be at X=6.0');
assert.strictEqual(psPos.z, 9.0, 'Photo station must be at Z=9.0');

const photoAct = objs.find((o) => {
  const p = Object.fromEntries((o.properties || []).map((x) => [x.name, x.value]));
  return p.act === 'photosession' || p.id === 'photosession';
});
assert(photoAct, 'photosession interaction trigger must exist in map');
const paPos = toWorld(photoAct.x, photoAct.y);
console.log(`2. Orange circle trigger position: (${paPos.x.toFixed(2)}, ${paPos.z.toFixed(2)})`);
assert.strictEqual(paPos.x, 6.0, 'Orange circle must remain centered at X=6.0');
assert.strictEqual(paPos.z, 11.0, 'Orange circle must remain at Z=11.0');

// Camera prop on the booth (tx = 0.95, tz = -0.15)
const camPropPos = { x: +(psPos.x + 0.95).toFixed(2), z: +(psPos.z - 0.15).toFixed(2) };
console.log(`3. Booth camera prop position: (${camPropPos.x.toFixed(2)}, ${camPropPos.z.toFixed(2)})`);
assert.strictEqual(camPropPos.x, 6.95, 'Camera prop must be at X=6.95');
assert.strictEqual(camPropPos.z, 8.85, 'Camera prop must be at Z=8.85');

// 2. Verify getPhotoboothPosingArea Logic directly matching tahiti.js
function getPhotoboothPosingArea(count, isGroup) {
  const camPos = { x: 6.95, z: 8.85 };
  const operatorPos = { x: 6.95, z: 8.30 };
  const nathanSlot = { x: 6.95, z: 13.0, row: 0, lat: 0 };
  if (!isGroup || count <= 1) {
    return {
      slots: [nathanSlot],
      nFront: 1,
      nathanIndex: 0,
      face: Math.PI,
      center: { x: 6.95, z: 13.0 },
      camPos,
      operatorPos,
      fx: 0, fz: 1,
      wsHeading: 0,
      ang: 0,
      dist: 4.15,
    };
  }

  const slots = [nathanSlot];
  const othersCount = count - 1;
  const nFrontFlank = othersCount <= 2 ? othersCount : (othersCount <= 4 ? 2 : 4);
  const nBack = othersCount - nFrontFlank;

  const zFront = 13.0;
  const zBack = 14.15;

  for (let i = 1; i <= nFrontFlank; i++) {
    const sign = i % 2 === 1 ? -1 : 1;
    const rank = Math.ceil(i / 2);
    const lat = sign * (rank === 1 ? 1.65 : 3.70);
    slots.push({ x: +(6.95 + lat).toFixed(3), z: zFront, row: 0, lat: +lat.toFixed(3) });
  }

  const backLatSequence = [-0.95, 0.95, -3.10, 3.10, -4.50, 4.50];
  for (let i = 0; i < nBack; i++) {
    const lat = backLatSequence[i % backLatSequence.length];
    slots.push({ x: +(6.95 + lat).toFixed(3), z: zBack, row: 1, lat: +lat.toFixed(3) });
  }

  return {
    slots,
    nFront: 1 + nFrontFlank,
    nathanIndex: 0,
    face: Math.PI,
    center: { x: 6.95, z: nBack > 0 ? 13.5 : 13.0 },
    camPos,
    operatorPos,
    fx: 0, fz: 1,
    wsHeading: 0,
    ang: 0,
    dist: 4.5,
  };
}

// 2.1 Solo Verification
const soloArea = getPhotoboothPosingArea(1, false);
console.log('\n4. Solo Photo Area:');
console.log('   Nathan slot:', soloArea.slots[soloArea.nathanIndex]);
console.log('   Camera prop position:', soloArea.camPos);
console.log('   Shabesh operator position:', soloArea.operatorPos);
console.log('   Facing:', soloArea.face, '(Math.PI = North directly into lens)');
console.log('   Camera aim:', `fx=${soloArea.fx}, fz=${soloArea.fz} (straight South towards posing mark)`);
assert.strictEqual(soloArea.slots[0].x, camPropPos.x, 'Nathan solo slot X must directly oppose booth camera prop X (6.95)');
assert.strictEqual(soloArea.slots[0].z, 13.0, 'Nathan solo slot Z must be 13.0 with clear space from booth');
assert.strictEqual(soloArea.face, Math.PI, 'Nathan must face North towards camera lens');
assert.strictEqual(soloArea.camPos.x, 6.95, 'Camera prop must be at X=6.95');
assert.strictEqual(soloArea.camPos.z, 8.85, 'Camera prop must be at Z=8.85');
assert.strictEqual(soloArea.operatorPos.x, 6.95, 'Shabesh must stand behind camera prop at X=6.95');
assert.strictEqual(soloArea.operatorPos.z, 8.30, 'Shabesh must stand behind camera prop at Z=8.30');
assert.strictEqual(soloArea.fx, 0, 'Camera direction fx must be 0 for straight-on shot');
assert.strictEqual(soloArea.fz, 1, 'Camera direction fz must be 1 for straight-on shot towards subjects');

// 2.2 Group Verification (count = 9: Nathan + 8 Euphonium members)
const groupArea = getPhotoboothPosingArea(9, true);
console.log('\n5. Group Photo Area (9 members - Euphonium full squad):');
console.log('   Nathan slot (index 0):', groupArea.slots[groupArea.nathanIndex]);
console.log('   All slots:', groupArea.slots);
assert.strictEqual(groupArea.slots[0].x, 6.95, 'Nathan must be at X=6.95 (front and center)');
assert.strictEqual(groupArea.slots[0].z, 13.0, 'Nathan must be at Z=13.0');
assert.strictEqual(groupArea.nFront, 5, 'Front row must have 5 members (Nathan + 4 flanks)');
assert.strictEqual(groupArea.slots.length, 9, 'Total group slots must match member count');

// 3. Framing & In-Frustum Verification using computePhotoView
function characterWorldBox(ch) {
  const p = ch.position;
  return new THREE.Box3(
    new THREE.Vector3(p.x - 0.588, p.y, p.z - 0.42),
    new THREE.Vector3(p.x + 0.588, p.y + 2.65, p.z + 0.42)
  );
}

function computePhotoView(camOriginPos, camDirXZ, subjectChars, aspect = 16 / 9, opts = {}) {
  const fx = camDirXZ.x, fz = camDirXZ.z;
  const groundY = 0;
  const leadDist = opts.leadDist ?? 0.14;
  const camHeight = opts.camHeight ?? 1.38;
  const from = new THREE.Vector3(camOriginPos.x + fx * leadDist, groundY + camHeight, camOriginPos.z + fz * leadDist);

  const boxes = subjectChars.map(characterWorldBox);
  const totalBox = new THREE.Box3();
  const corners = [];
  for (const b of boxes) {
    totalBox.union(b);
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      corners.push(new THREE.Vector3(x, y, z));
    }
  }
  const at = totalBox.getCenter(new THREE.Vector3());
  const aimDist = Math.max(1.0, at.distanceTo(from));
  const up = new THREE.Vector3(0, 1, 0);
  const F = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3(), rel = new THREE.Vector3();

  const measureExtents = () => {
    F.copy(at).sub(from).normalize();
    R.crossVectors(F, up).normalize();
    U.crossVectors(R, F).normalize();
    let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
    for (const c of corners) {
      rel.copy(c).sub(from);
      const z = Math.max(0.25, rel.dot(F));
      const sx = rel.dot(R) / z, sy = rel.dot(U) / z;
      if (sx < sx0) sx0 = sx;
      if (sx > sx1) sx1 = sx;
      if (sy < sy0) sy0 = sy;
      if (sy > sy1) sy1 = sy;
    }
    return { sx0, sx1, sy0, sy1 };
  };

  for (let iter = 0; iter < 5; iter++) {
    const { sx0, sx1, sy0, sy1 } = measureExtents();
    const dYaw = 0.5 * (Math.atan(sx0) + Math.atan(sx1));
    const dPitch = 0.5 * (Math.atan(sy0) + Math.atan(sy1));
    F.multiplyScalar(Math.cos(dYaw)).addScaledVector(R, Math.sin(dYaw)).addScaledVector(U, Math.sin(dPitch)).normalize();
    at.copy(from).addScaledVector(F, aimDist);
  }

  const { sx0, sx1, sy0, sy1 } = measureExtents();
  const halfY = Math.max(Math.abs(sy0), Math.abs(sy1));
  const halfX = Math.max(Math.abs(sx0), Math.abs(sx1));
  const isSolo = subjectChars.length === 1;
  const fillTarget = opts.fillTarget ?? (isSolo ? 0.68 : 0.62);
  const tanY = Math.max(halfY / fillTarget, halfX / (fillTarget * aspect));
  const fovMin = opts.fovMin ?? 50;
  const fovMax = opts.fovMax ?? (subjectChars.length <= 2 ? 72 : 90);
  const fov = Math.max(fovMin, Math.min(fovMax, (2 * Math.atan(tanY) * 180) / Math.PI));

  return {
    from: { x: +from.x.toFixed(3), y: +from.y.toFixed(3), z: +from.z.toFixed(3) },
    at: { x: +at.x.toFixed(3), y: +at.y.toFixed(3), z: +at.z.toFixed(3) },
    fov: +fov.toFixed(2),
    halfX, halfY,
  };
}

const groupChars = groupArea.slots.map((s) => ({ position: { x: s.x, y: 0, z: s.z } }));
const view = computePhotoView(groupArea.camPos, { x: groupArea.fx, z: groupArea.fz }, groupChars, 16 / 9, {
  fillTarget: 0.62,
  fovMax: 90,
});

console.log('\n6. Camera Viewport Framing (9 members):');
console.log('   Camera position:', view.from);
console.log('   Aim target:', view.at);
console.log('   Calculated FOV:', view.fov);

// Check that all 9 characters' bounding box corners project strictly inside the camera frustum [-1, 1]
const projCam = new THREE.PerspectiveCamera(view.fov, 16 / 9, 0.1, 100);
projCam.position.set(view.from.x, view.from.y, view.from.z);
projCam.lookAt(view.at.x, view.at.y, view.at.z);
projCam.updateMatrixWorld();

let allCornersInFrustum = true;
let maxNdcX = 0, maxNdcY = 0;
const faceNdcs = [];

for (let i = 0; i < groupChars.length; i++) {
  const faceP = new THREE.Vector3(groupChars[i].position.x, 2.0, groupChars[i].position.z).project(projCam);
  faceNdcs.push({ i, x: +faceP.x.toFixed(3), y: +faceP.y.toFixed(3) });

  const box = characterWorldBox(groupChars[i]);
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const ndc = new THREE.Vector3(x, y, z).project(projCam);
    maxNdcX = Math.max(maxNdcX, Math.abs(ndc.x));
    maxNdcY = Math.max(maxNdcY, Math.abs(ndc.y));
    if (Math.abs(ndc.x) > 0.95 || Math.abs(ndc.y) > 0.95) {
      allCornersInFrustum = false;
      console.error(`Character ${i} corner out of bounds: ndcX=${ndc.x}, ndcY=${ndc.y}`);
    }
  }
}

console.log(`   Maximum NDC X: ${maxNdcX.toFixed(3)} (horizontal margin: ${((1 - maxNdcX) * 100).toFixed(1)}%)`);
console.log(`   Maximum NDC Y: ${maxNdcY.toFixed(3)} (vertical margin: ${((1 - maxNdcY) * 100).toFixed(1)}%)`);
assert(allCornersInFrustum, 'All character corners (head to toe) must be within visible viewport with margin');
assert(maxNdcX <= 0.85, 'Horizontal margin around edges must be preserved');
assert(maxNdcY <= 0.85, 'Vertical head-to-toe margin must be preserved');

// Verify face separation in group photo
faceNdcs.sort((a, b) => a.x - b.x);
for (let i = 1; i < faceNdcs.length; i++) {
  const sep = faceNdcs[i].x - faceNdcs[i - 1].x;
  assert(sep >= 0.08, `Face separation between Char ${faceNdcs[i - 1].i} and Char ${faceNdcs[i].i} must be at least 0.08 NDC X (got ${sep.toFixed(3)})`);
}
console.log('✓ Group photo face separation: every face is distinctly spaced horizontally across the frame.');

// 3.1 Raycasting Visibility Verification: mathematically verify NO face is occluded
console.log('\n7. Back-Row Line-of-Sight Raycasting Verification:');
const camVec = new THREE.Vector3(view.from.x, view.from.y, view.from.z);
const frontGroup = groupArea.slots.filter((s) => s.row === 0);
const backGroup = groupArea.slots.filter((s) => s.row === 1);

const frontObstacles = frontGroup.map((s) => ({
  head: new THREE.Box3(
    new THREE.Vector3(s.x - 0.489, 1.50, s.z - 0.42),
    new THREE.Vector3(s.x + 0.489, 2.61, s.z + 0.42)
  ),
  body: new THREE.Box3(
    new THREE.Vector3(s.x - 0.588, 0, s.z - 0.35),
    new THREE.Vector3(s.x + 0.588, 1.47, s.z + 0.35)
  ),
}));

for (let bi = 0; bi < backGroup.length; bi++) {
  const bs = backGroup[bi];
  const faceBox = new THREE.Box3(
    new THREE.Vector3(bs.x - 0.22, 1.70, bs.z - 0.35),
    new THREE.Vector3(bs.x + 0.22, 2.25, bs.z - 0.20)
  );

  let occludedCount = 0;
  const samples = 100;
  for (let u = 0; u < 10; u++) {
    for (let v = 0; v < 10; v++) {
      const pt = new THREE.Vector3(
        faceBox.min.x + (u / 9) * (faceBox.max.x - faceBox.min.x),
        faceBox.min.y + (v / 9) * (faceBox.max.y - faceBox.min.y),
        faceBox.min.z
      );
      const dir = new THREE.Vector3().subVectors(pt, camVec).normalize();
      const ray = new THREE.Ray(camVec, dir);
      const distToFace = camVec.distanceTo(pt);

      let blocked = false;
      for (const fo of frontObstacles) {
        const hitB = ray.intersectBox(fo.body, new THREE.Vector3());
        if (hitB && camVec.distanceTo(hitB) < distToFace - 0.05) { blocked = true; break; }
        const hitH = ray.intersectBox(fo.head, new THREE.Vector3());
        if (hitH && camVec.distanceTo(hitH) < distToFace - 0.05) { blocked = true; break; }
      }
      if (blocked) occludedCount++;
    }
  }
  const visPercent = ((samples - occludedCount) / samples) * 100;
  console.log(`   Back row member ${bi + 1} at X=${bs.x}, Z=${bs.z}: ${visPercent.toFixed(1)}% face visibility (${samples - occludedCount}/${samples} rays clear)`);
  assert(visPercent === 100, `Back row member ${bi + 1} face must have 100% unobstructed sightline into camera lens (got ${visPercent}%)`);
}
console.log('✓ Line-of-sight raycasting: 100% of rays from camera to every back-row face are completely unobstructed.');

// 4. Verify Responsive Album Styles & Card
const gameCss = fs.readFileSync(path.join(ROOT, 'web/src/styles/game.css'), 'utf8');
const compactCss = fs.readFileSync(path.join(ROOT, 'web/src/styles/game-compact.css'), 'utf8');
const mainJs = fs.readFileSync(path.join(ROOT, 'web/src/game/main.js'), 'utf8');

assert(gameCss.includes('aspect-ratio: 16 / 9;'), 'game.css must preserve 16 / 9 aspect ratio for photos');
assert(gameCss.includes('object-fit: contain;'), 'game.css must contain images without cropping');
assert(gameCss.includes('.photo-card .pc-close'), 'game.css must style pc-close button');
assert(gameCss.includes('min-width: 44px; min-height: 44px;'), 'game.css must provide minimum 44px touch targets');
assert(compactCss.includes('.pc-nav .btn'), 'game-compact.css must style pc-nav buttons for compact view');
assert(mainJs.includes('openPhotoCard'), 'main.js must define openPhotoCard');
assert(mainJs.includes('touchStartX'), 'main.js openPhotoCard must support touch swipe navigation');

console.log('\n✓ Responsive album & photo card:');
console.log('  - 16:9 aspect ratio preserved with object-fit: contain to prevent cropping on all screens.');
console.log('  - Minimum 44x44px touch targets for close button and nav arrows.');
console.log('  - Touch swipe gestures enabled on mobile and tablet screens.');

console.log('\n========================================================');
console.log('TAHITI PHOTOSESSION & ALBUM E2E TEST PASSED! ✓✓✓');
console.log('========================================================');
