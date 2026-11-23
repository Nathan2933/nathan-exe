import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// Provide mock document for procedural textures
global.document = global.document || {
  createElement: () => ({
    getContext: () => ({
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
    }),
  }),
};

const { buildMotorbike, buildScooty } = await import('../src/game/kit.js');
const { Player, Character } = await import('../src/game/player.js');
const { RIDE_SEATS } = await import('../src/game/tahiti.js');

test('Motorcycle models have steering bars and grips', () => {
  for (const style of ['yamaha', 'shine', '']) {
    const moto = buildMotorbike(0xf4f6fa, style);
    assert.ok(moto.bars, `Motorcycle style "${style}" should have a steering bars group`);
    assert.ok(moto.bars instanceof THREE.Group, 'bars should be a THREE.Group');
    assert.equal(moto.bars.position.y, 0.98, 'bars should be at handlebar height y = 0.98');
    assert.equal(moto.bars.position.z, 0.50, 'bars should be at handlebar position z = 0.50');
  }
});

test('Mounted player pose: hands align with handlebar grips while stopped', () => {
  const moto = buildMotorbike(0xf4f6fa, 'yamaha');
  const player = new Player();
  const scene = new THREE.Scene();
  scene.add(moto.group);
  scene.add(player.group);

  // Mounted on motorcycle
  player.pose = 'ride';
  player.riding = true;
  player.steer = 0;
  player.group.position.set(0, 0.46, 0);
  moto.group.position.set(0, 0, 0);

  // Run update loop to allow joints to ease into pose
  const zeroV = new THREE.Vector3();
  for (let i = 0; i < 40; i++) {
    player.update(0.016, zeroV, i * 0.016);
  }

  player.group.updateMatrixWorld(true);
  moto.group.updateMatrixWorld(true);

  // Check torso lean and elbow bend
  assert.ok(player.joints.spineX >= 0.45, `Torso lean spineX should be natural forward lean (~0.50), got ${player.joints.spineX}`);
  assert.ok(player.joints.el0 < -0.40, `Left elbow bend should be natural bent pose, got ${player.joints.el0}`);
  assert.ok(player.joints.el1 < -0.40, `Right elbow bend should be natural bent pose, got ${player.joints.el1}`);

  // Hand world positions
  const leftHand = new THREE.Vector3();
  const rightHand = new THREE.Vector3();
  player.arms[0].elbow.localToWorld(leftHand.set(0, -0.27, 0));
  player.arms[1].elbow.localToWorld(rightHand.set(0, -0.27, 0));

  // Handlebar grip positions in world space (at x = +/- 0.24, y = 0.98, z = 0.50)
  const leftGripWorld = new THREE.Vector3(-0.24, 0.98, 0.50);
  const rightGripWorld = new THREE.Vector3(0.24, 0.98, 0.50);

  const distL = leftHand.distanceTo(leftGripWorld);
  const distR = rightHand.distanceTo(rightGripWorld);

  assert.ok(distL < 0.05, `Left hand should align with left grip within 5 cm, got ${(distL * 100).toFixed(1)} cm`);
  assert.ok(distR < 0.05, `Right hand should align with right grip within 5 cm, got ${(distR * 100).toFixed(1)} cm`);
});

test('Handlebars turn and hands follow grips when steering while stopped or riding', () => {
  const moto = buildMotorbike(0xf4f6fa, 'yamaha');
  const player = new Player();
  const scene = new THREE.Scene();
  scene.add(moto.group);
  scene.add(player.group);

  player.pose = 'ride';
  player.riding = true;
  player.group.position.set(0, 0.46, 0);
  moto.group.position.set(0, 0, 0);

  const zeroV = new THREE.Vector3();

  // Test turn left (steer = -0.40) and turn right (steer = +0.40)
  for (const steer of [-0.40, 0.40]) {
    moto.bars.rotation.y = steer;
    player.steer = steer;

    for (let i = 0; i < 40; i++) {
      player.update(0.016, zeroV, i * 0.016);
    }

    player.group.updateMatrixWorld(true);
    moto.group.updateMatrixWorld(true);

    const leftHand = new THREE.Vector3();
    const rightHand = new THREE.Vector3();
    player.arms[0].elbow.localToWorld(leftHand.set(0, -0.27, 0));
    player.arms[1].elbow.localToWorld(rightHand.set(0, -0.27, 0));

    // Handlebar grip positions rotated by bars.rotation.y
    const leftGripWorld = new THREE.Vector3(-0.24, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), steer).add(new THREE.Vector3(0, 0.98, 0.50));
    const rightGripWorld = new THREE.Vector3(0.24, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), steer).add(new THREE.Vector3(0, 0.98, 0.50));

    const distL = leftHand.distanceTo(leftGripWorld);
    const distR = rightHand.distanceTo(rightGripWorld);

    assert.ok(distL < 0.08, `Left hand should follow grip during turn (${steer}), got ${(distL * 100).toFixed(1)} cm`);
    assert.ok(distR < 0.08, `Right hand should follow grip during turn (${steer}), got ${(distR * 100).toFixed(1)} cm`);
  }
});

test('Dismount restores normal player pose and recenters handlebars', () => {
  const moto = buildMotorbike(0xf4f6fa, 'yamaha');
  const player = new Player();
  const scene = new THREE.Scene();
  scene.add(moto.group);
  scene.add(player.group);

  // First mount and steer
  player.pose = 'ride';
  player.riding = true;
  player.steer = 0.45;
  moto.bars.rotation.y = 0.45;

  const zeroV = new THREE.Vector3();
  for (let i = 0; i < 30; i++) player.update(0.016, zeroV, i * 0.016);

  // Dismount
  if (moto.bars) moto.bars.rotation.y = 0;
  player.pose = null;
  player.lastPose = null;
  player.poseW = 0;
  player.steer = 0;
  player.riding = false;

  for (let i = 0; i < 60; i++) player.update(0.016, zeroV, 1 + i * 0.016);

  assert.equal(moto.bars.rotation.y, 0, 'Handlebars should be centered on dismount');
  assert.equal(player.steer, 0, 'Player steer should be reset to 0');
  assert.equal(player.riding, false, 'Player riding should be false');
  assert.ok(Math.abs(player.joints.spineX) < 0.01, `Player torso lean should return to upright standing (<0.01), got ${player.joints.spineX}`);
  assert.ok(Math.abs(player.joints.sx0) < 0.05, 'Shoulder angle should return to normal standing');
  assert.ok(player.joints.el0 > -0.25, 'Elbow bend should return to relaxed standing');
});

test('Dismount prompt anchors above the rider head with clear gap', () => {
  const player = new Player();
  const scene = new THREE.Scene();
  scene.add(player.group);

  player.pose = 'ride';
  player.riding = true;
  player.group.position.set(10, 0.46, 20);

  const zeroV = new THREE.Vector3();
  for (let i = 0; i < 30; i++) player.update(0.016, zeroV, i * 0.016);
  player.group.updateMatrixWorld(true);

  const headPos = new THREE.Vector3();
  player.head.getWorldPosition(headPos);

  // Dismount prompt anchor: elevated above the head
  const promptAnchor = headPos.clone();
  promptAnchor.y += 1.30;

  // Verify that the prompt anchor is strictly above the head and clear of face
  assert.ok(promptAnchor.y > headPos.y + 0.8, `Prompt anchor Y (${promptAnchor.y}) must be well above head center Y (${headPos.y})`);
  assert.equal(promptAnchor.x, headPos.x, 'Prompt anchor X tracks rider head X exactly');
  assert.equal(promptAnchor.z, headPos.z, 'Prompt anchor Z tracks rider head Z exactly');
});

test('RIDE_SEATS configuration seats pillion passenger centered on rear seat for both bikes', () => {
  assert.ok(RIDE_SEATS.moto, 'RIDE_SEATS.moto exists');
  assert.equal(RIDE_SEATS.moto.rear, 0.58, 'moto passenger rear offset is 0.58m (centered on pillion cushion behind driver)');
  assert.equal(RIDE_SEATS.moto.pillionPose, 'pillion_moto', 'moto passenger uses pillion_moto pose');
  assert.ok(RIDE_SEATS.moto.pillionSeatY >= 0.46, 'moto pillion seat height is properly aligned');

  assert.ok(RIDE_SEATS.scooty, 'RIDE_SEATS.scooty exists');
  assert.equal(RIDE_SEATS.scooty.back, -0.18, 'scooty driver back offset is -0.18m (keeps driver position)');
  assert.equal(RIDE_SEATS.scooty.rear, 0.64, 'scooty passenger rear offset is 0.64m (shifted back with clear gap)');
  assert.equal(RIDE_SEATS.scooty.pillionPose, 'pillion_scooty', 'scooty passenger uses pillion_scooty pose');
  assert.ok(RIDE_SEATS.scooty.pillionSeatY >= 0.15, 'scooty pillion seat height is properly aligned');
});

test('Scooty models have extended rear seat and aligned pillion footrests', () => {
  for (const color of [0x1f6fe0, 0x1c1c22]) {
    const scooty = buildScooty(color);
    assert.ok(scooty.group, 'scooty should have group');
    // Verify children meshes exist
    assert.ok(scooty.wheels.length === 2, 'scooty has 2 wheels');
    assert.ok(scooty.bars, 'scooty has steering bars');
  }
});

test('Pillion passenger poses (pillion_moto forward lean, pillion_scooty upright) have bent knees and waist hold', () => {
  for (const poseType of ['pillion_moto', 'pillion_scooty']) {
    const passenger = new Character({ top: 'hoodie', pants: 'jeans' });
    passenger.pose = poseType;
    passenger.riding = true;
    passenger.group.position.set(0, 0.48, -0.58);

    const zeroV = new THREE.Vector3();
    for (let i = 0; i < 40; i++) passenger.update(0.016, zeroV, i * 0.016);
    passenger.group.updateMatrixWorld(true);

    const isMoto = poseType === 'pillion_moto';
    const expectedSpine = isMoto ? 0.28 : 0.06;

    // Check joints
    assert.ok(passenger.joints.kn0 >= 1.20, `${poseType} knee bend kn0 should be bent comfortably (>=1.20), got ${passenger.joints.kn0}`);
    assert.ok(passenger.joints.kn1 >= 1.20, `${poseType} knee bend kn1 should be bent comfortably (>=1.20), got ${passenger.joints.kn1}`);
    assert.ok(passenger.joints.th0 < -0.70, `${poseType} thigh angle th0 should be seated forward (<-0.70), got ${passenger.joints.th0}`);
    assert.ok(passenger.joints.tz0 < -0.15, `${poseType} left thigh tz0 should flare outward (<-0.15), got ${passenger.joints.tz0}`);
    assert.ok(passenger.joints.tz1 > 0.15, `${poseType} right thigh tz1 should flare outward (>0.15), got ${passenger.joints.tz1}`);
    assert.ok(Math.abs(passenger.joints.spineX - expectedSpine) < 0.04, `${poseType} spine lean should match tuned posture (~${expectedSpine}), got ${passenger.joints.spineX}`);
    assert.ok(passenger.joints.sx0 < -0.35, `${poseType} shoulder forward sx0 should reach forward toward waist, got ${passenger.joints.sx0}`);
    assert.ok(passenger.joints.el0 < -0.50, `${poseType} elbow bend el0 should be bent holding driver waist, got ${passenger.joints.el0}`);

    // Foot positions aligned with rear footpegs
    const leftFoot = new THREE.Vector3();
    const rightFoot = new THREE.Vector3();
    passenger.legs[0].knee.localToWorld(leftFoot.set(0, -0.32, 0));
    passenger.legs[1].knee.localToWorld(rightFoot.set(0, -0.32, 0));

    assert.ok(leftFoot.x < -0.20, `${poseType} left foot x (${leftFoot.x.toFixed(2)}) should align with left rear footpeg (~-0.25)`);
    assert.ok(rightFoot.x > 0.20, `${poseType} right foot x (${rightFoot.x.toFixed(2)}) should align with right rear footpeg (~+0.25)`);
    assert.ok(Math.abs(leftFoot.y - rightFoot.y) < 0.05, `${poseType} feet should be level on footpegs`);
  }
});

test('Two-up riding alignment: centered behind driver with natural gap and no silhouette overlap at gameplay camera angle', () => {
  // Test both motorcycle and scooty variants
  const setups = [
    { name: 'motorcycle', bike: buildMotorbike(0xf4f6fa, 'yamaha'), dPos: [0, 0.46, 0], pPos: [0, 0.48, -0.58], pPose: 'pillion_moto', minGap: 0.50, maxGap: 0.65 },
    { name: 'scooty_blue', bike: buildScooty(0x1f6fe0), dPos: [0, 0.15, -0.18], pPos: [0, 0.18, -0.82], pPose: 'pillion_scooty', minGap: 0.60, maxGap: 0.68 },
    { name: 'scooty_black', bike: buildScooty(0x1c1c22), dPos: [0, 0.15, -0.18], pPos: [0, 0.18, -0.82], pPose: 'pillion_scooty', minGap: 0.60, maxGap: 0.68 }
  ];

  // Isometric camera setup matching gameplay
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);
  const camDir = new THREE.Vector3(0.59, 0.55, 0.59).normalize();
  camera.position.copy(camDir.clone().multiplyScalar(18));
  camera.lookAt(0, 0.8, 0);
  camera.updateMatrixWorld(true);

  for (const s of setups) {
    const driver = new Player();
    driver.pose = s.name === 'motorcycle' ? 'ride' : 'scooty';
    driver.riding = true;
    driver.group.position.set(...s.dPos);

    const passenger = new Character({ top: 'hoodie', pants: 'jeans' });
    passenger.pose = s.pPose;
    passenger.riding = true;
    passenger.group.position.set(...s.pPos);

    const zeroV = new THREE.Vector3();
    for (let i = 0; i < 40; i++) {
      driver.update(0.016, zeroV, i * 0.016);
      passenger.update(0.016, zeroV, i * 0.016);
    }

    driver.group.updateMatrixWorld(true);
    passenger.group.updateMatrixWorld(true);

    const dHips = new THREE.Vector3(); driver.hips.getWorldPosition(dHips);
    const pHips = new THREE.Vector3(); passenger.hips.getWorldPosition(pHips);

    assert.ok(Math.abs(pHips.x - dHips.x) < 0.005, `${s.name}: Passenger should be laterally centered behind driver (x = 0)`);
    const hipDist = dHips.distanceTo(pHips);
    assert.ok(hipDist >= s.minGap && hipDist <= s.maxGap, `${s.name}: Hip distance between riders should be ~${((s.minGap + s.maxGap) / 2).toFixed(2)}m, got ${hipDist.toFixed(2)}m`);

    // Screen-space separation at 225° isometric camera angle (where heads and shoulders previously overlapped)
    const dHead = new THREE.Vector3(); driver.head.getWorldPosition(dHead);
    const pHead = new THREE.Vector3(); passenger.head.getWorldPosition(pHead);
    const dHeadScreen = dHead.clone().project(camera);
    const pHeadScreen = pHead.clone().project(camera);
    const screenDist = Math.hypot(dHeadScreen.x - pHeadScreen.x, dHeadScreen.y - pHeadScreen.y);

    assert.ok(screenDist > 0.025, `${s.name}: Driver and passenger heads must be clearly separated on screen (screenDist = ${screenDist.toFixed(3)})`);
    assert.ok(pHead.z < dHead.z, `${s.name}: Passenger head must be behind driver head along vehicle axis`);
  }
});

test('Delayed upper body lean: passenger hips follow bike roll while torso exhibits subtle delay', () => {
  const passenger = new Character({ top: 'hoodie', pants: 'jeans' });
  passenger.pose = 'pillion_moto';
  passenger.riding = true;

  const zeroV = new THREE.Vector3();
  // Warm up upright
  for (let i = 0; i < 30; i++) passenger.update(0.016, zeroV, i * 0.016);

  // Bike suddenly leans into a turn (bikeLean = 0.25 rad)
  const bikeLean = 0.25;
  passenger.bikeLean = bikeLean;
  passenger.group.rotation.z = bikeLean;

  // Frame 1: right after entering turn
  passenger.update(0.016, zeroV, 0.5);

  // Hips roll with the bike
  assert.equal(passenger.group.rotation.z, bikeLean, 'Passenger group roll follows bike lean immediately');

  // Upper body should have subtle counter-rotation (spineLeanOffset) delaying the lean
  assert.ok(passenger.spineLeanOffset < -0.10, `Spine lean offset should resist roll initially (got ${passenger.spineLeanOffset.toFixed(3)})`);

  // Run for 0.8 seconds (approx 50 frames)
  for (let i = 0; i < 50; i++) {
    passenger.update(0.016, zeroV, 0.5 + (i + 1) * 0.016);
  }

  // Steady state: upper lean catches up to bike lean, spineLeanOffset approaches 0
  assert.ok(Math.abs(passenger.spineLeanOffset) < 0.03, `In steady turn, spine offset should settle to ~0, got ${passenger.spineLeanOffset.toFixed(3)}`);
  assert.ok(Math.abs(passenger.upperLean - bikeLean) < 0.03, `In steady turn, upperLean should reach bikeLean (~${bikeLean}), got ${passenger.upperLean.toFixed(3)}`);

  // Dismount / straighten: bikeLean goes to 0
  passenger.bikeLean = 0;
  for (let i = 0; i < 60; i++) passenger.update(0.016, zeroV, 1.0 + i * 0.016);
  assert.ok(Math.abs(passenger.upperLean) < 0.01, 'upperLean resets to 0 when bike straightens');
  assert.ok(Math.abs(passenger.spineLeanOffset) < 0.01, 'spineLeanOffset resets to 0 when bike straightens');
});

test('Passenger remains attached to motorcycle rear seat while turning and leaning', () => {
  const moto = buildMotorbike(0xf4f6fa, 'yamaha');
  const S = RIDE_SEATS.moto;
  const passenger = new Character({ top: 'hoodie', pants: 'jeans' });
  passenger.pose = 'pillion_moto';
  passenger.riding = true;

  // Simulate motorcycle positioned and leaning into a right turn
  moto.group.position.set(15, 1.2, -8);
  const heading = 1.1;
  const lean = 0.22;
  moto.group.rotation.y = heading;
  moto.group.rotation.z = lean;
  moto.group.updateMatrixWorld(true);

  // Pillion seat transformed via motorcycle localToWorld
  const localSeat = new THREE.Vector3(0, S.pillionSeatY, S.back - S.rear);
  const worldSeat = moto.group.localToWorld(localSeat.clone());

  passenger.group.position.copy(worldSeat);
  passenger.group.rotation.y = heading;
  passenger.group.rotation.z = moto.group.rotation.z;
  passenger.bikeLean = lean;
  passenger.group.updateMatrixWorld(true);

  // Verify passenger is firmly attached to the rear seat position
  const pPos = passenger.group.position;
  assert.ok(pPos.distanceTo(worldSeat) < 0.001, 'Passenger position tracks motorcycle rear seat world position exactly');
  assert.equal(passenger.group.rotation.z, lean, 'Passenger group roll tracks motorcycle lean into turn');
});

test('Dismount prompt clears both riders heads in tandem riding', () => {
  const driver = new Player();
  driver.pose = 'ride'; driver.riding = true;
  driver.group.position.set(0, 0.46, 0);

  const passenger = new Character({ top: 'hoodie', pants: 'jeans' });
  passenger.pose = 'pillion'; passenger.riding = true;
  passenger.group.position.set(0, 0.48, -0.48);

  const zeroV = new THREE.Vector3();
  for (let i = 0; i < 40; i++) {
    driver.update(0.016, zeroV, i * 0.016);
    passenger.update(0.016, zeroV, i * 0.016);
  }
  driver.group.updateMatrixWorld(true);
  passenger.group.updateMatrixWorld(true);

  const dHead = new THREE.Vector3(); driver.head.getWorldPosition(dHead);
  const pHead = new THREE.Vector3(); passenger.head.getWorldPosition(pHead);

  const highestHeadY = Math.max(dHead.y, pHead.y);
  const promptAnchor = new THREE.Vector3(
    (dHead.x + pHead.x) * 0.5,
    highestHeadY + 1.30,
    (dHead.z + pHead.z) * 0.5
  );

  assert.ok(promptAnchor.y >= highestHeadY + 1.20, `Prompt must be at least 1.20m above the highest head (${highestHeadY.toFixed(2)}m), got ${promptAnchor.y.toFixed(2)}m`);
  assert.ok(promptAnchor.y > dHead.y + 1.20, 'Prompt clears driver head with clear gap');
  assert.ok(promptAnchor.y > pHead.y + 1.20, 'Prompt clears passenger head with clear gap');
});
