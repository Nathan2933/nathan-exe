/* Dedicated collision verification suite for NATHAN.EXE bike impacts */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBikeCollisionSystem, getBikeRadius } from '../src/game/bike-collision.js';

let passed = 0;
let total = 0;

function check(desc, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  PASS: ${desc}`);
  } catch (err) {
    console.error(`  FAIL: ${desc}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('=== Running Bike Collision Verification Suite ===\n');

// 1. Setup mock world
const scene = new THREE.Scene();
const player = {
  group: new THREE.Group(),
  joltY: 0,
  joltPitch: 0
};
player.group.position.set(0, 0, 0);

const guruChar = {
  group: new THREE.Group(),
  joltY: 0,
  joltPitch: 0,
  pose: 'scooty'
};
guruChar.group.position.set(0, 0, 0);

let guruSpeed = 4.0;
let guruMounted = true;
const guruRoutine = {
  isGuruMounted: () => guruMounted,
  getSpeed: () => guruSpeed,
  reduceSpeed: (amt) => { guruSpeed = Math.max(0, guruSpeed - amt); },
  nudge: (dx, dz) => { scooty.x += dx; scooty.z += dz; },
  getGuruCharacter: () => guruChar
};

const scooty = {
  id: 'vehicle:scooty',
  kind: 'vehicle',
  vtype: 'scooty',
  heading: Math.PI,
  x: 0,
  z: 5,
  model: { group: new THREE.Group() }
};
scooty.model.group.position.set(0, 0, 5);

const playerBike = {
  id: 'vehicle:moto-tce',
  kind: 'vehicle',
  vtype: 'moto',
  heading: 0,
  x: 0,
  z: 0,
  model: { group: new THREE.Group() }
};
playerBike.model.group.position.set(0, 0, 0);

const parkedBike = {
  id: 'vehicle:moto-prince',
  kind: 'vehicle',
  vtype: 'moto',
  heading: Math.PI / 2,
  x: 20,
  z: 20,
  model: { group: new THREE.Group() }
};
parkedBike.model.group.position.set(20, 0, 20);

const state = {
  mount: {
    it: playerBike,
    heading: 0,
    speed: 5.0
  }
};

let cameraShakeDuration = 0;
let bonkCount = 0;
const sfx = {
  bonk: () => { bonkCount++; }
};

const world = {
  vehicles: [playerBike, scooty, parkedBike],
  npcs: [{ npcId: 'guru', character: guruChar }]
};

const sys = createBikeCollisionSystem({
  scene,
  state,
  player,
  world,
  heightAt: () => 0,
  sfx,
  guruRoutine,
  triggerCameraShake: (dur) => {
    cameraShakeDuration = dur;
  }
});

console.log('Test Scenario 1: Head-on Hit (Hard Hit)');
check('Head-on collision spawns pixel-art burst at contact point', () => {
  player.group.position.set(0, 0, 1.5);
  playerBike.x = 0;
  playerBike.z = 1.5;
  state.mount.speed = 6.0;

  scooty.x = 0;
  scooty.z = 2.4;
  scooty.model.group.position.set(0, 0, 2.4);
  guruSpeed = 4.5;

  sys.update(0.016, 0.1);

  const bursts = sys.getActiveBursts();
  assert.equal(bursts.length, 1, 'Exactly one burst spawned');
  assert.ok(bursts[0].sparks.length >= 8, 'Hard hit spawns 8+ pixel sparks');
  // Burst is positioned at contact point between the bikes (~z = 1.95)
  assert.ok(Math.abs(bursts[0].group.position.z - 1.95) < 0.2, 'Burst is at contact point');
});

check('Both bikes recoil and both riders jolt in their seats', () => {
  const recoils = sys.getActiveRecoils();
  assert.ok(recoils.has(playerBike), 'Player bike recoils');
  assert.ok(recoils.has(scooty), 'Scooty recoils');

  const jolts = sys.getActiveJolts();
  assert.ok(jolts.has(player), 'Player rider jolts');
  assert.ok(jolts.has(guruChar), 'Guru rider jolts');
  assert.ok(jolts.get(player).maxAmpY > 0.08, 'Player jolt maxAmpY is significant for hard hit');
  assert.ok(jolts.get(guruChar).maxAmpY > 0.08, 'Guru jolt maxAmpY is significant for hard hit');

  // Advance to peak of jolt animation
  sys.update(0.08, 0.18);
  assert.ok(player.joltY > 0.05, 'Player jolt Y reaches peak above 0.05m');
  assert.ok(guruChar.joltY > 0.05, 'Guru jolt Y reaches peak above 0.05m');
});

check('Hard hit triggers brief, subtle camera shake and sfx', () => {
  assert.ok(cameraShakeDuration > 0.08 && cameraShakeDuration <= 0.20, `Camera shake duration: ${cameraShakeDuration}`);
  assert.equal(bonkCount, 1, 'Bonk sound played once');
});

check('Immediate overlap resolution pushes bikes to safe distance', () => {
  const d = Math.hypot(scooty.x - player.group.position.x, scooty.z - player.group.position.z);
  const minD = getBikeRadius(playerBike) + getBikeRadius(scooty);
  assert.ok(d >= minD - 0.001, `Distance ${d} >= minRequired ${minD}`);
});

console.log('\nTest Scenario 2: Animation Once Per Hit and Separation');
check('Animation does not repeat while remaining in contact', () => {
  sys.update(0.016, 0.12);
  sys.update(0.016, 0.14);
  sys.update(0.016, 0.16);
  assert.equal(bonkCount, 1, 'Bonk should not be repeated while in contact');
  assert.equal(sys.getActiveBursts().length, 1, 'No new bursts spawned while in contact');
});

check('Riders and bikes settle smoothly back to resting positions', () => {
  for (let i = 0; i < 30; i++) {
    sys.update(0.02, 0.2 + i * 0.02);
  }
  assert.equal(player.joltY, 0, 'Player settled');
  assert.equal(guruChar.joltY, 0, 'Guru settled');
  assert.equal(playerBike.recoilX, 0, 'Bike settled');
});

check('Player can reverse or steer away and separation resets collision trigger', () => {
  // Player reverses away
  player.group.position.set(0, 0, -1.0);
  playerBike.x = 0;
  playerBike.z = -1.0;
  sys.update(0.016, 1.0);

  assert.equal(sys.getActiveHits().size, 0, 'Collision state reset after separation');
});

check('Subsequent hit triggers impact animation again', () => {
  player.group.position.set(0, 0, 1.5);
  playerBike.x = 0;
  playerBike.z = 1.5;
  sys.update(0.016, 1.2);

  assert.equal(bonkCount, 2, 'Bonk sound plays again on second hit');
  assert.equal(sys.getActiveBursts().length, 1, 'New burst spawned on second hit');
});

console.log('\nTest Scenario 3: Slow Bump');
check('Slow bump gets tiny jolt and NO camera shake', () => {
  // Clear state
  sys.reset();
  cameraShakeDuration = 0;
  bonkCount = 0;

  // Slow bump against parked bike
  player.group.position.set(20, 0, 19.15);
  playerBike.x = 20;
  playerBike.z = 19.15;
  state.mount.speed = 1.2; // slow creeping speed

  sys.update(0.016, 2.0);

  assert.equal(bonkCount, 1, 'Bonk sound played');
  assert.equal(cameraShakeDuration, 0, 'Slow bump must NOT trigger camera shake');
  const jolts = sys.getActiveJolts();
  assert.ok(jolts.has(player), 'Player jolts');
  assert.ok(jolts.get(player).maxAmpY < 0.07, 'Jolt is tiny for slow bump');
});

console.log('\nTest Scenario 4: Collision with Parked Bike');
check('Player hits parked bike: player recoils and jolts, parked bike nudges, parked bike has NO rider jolt', () => {
  sys.reset();
  player.group.position.set(20, 0, 19.15);
  playerBike.x = 20;
  playerBike.z = 19.15;
  state.mount.speed = 5.0; // hard hit into parked bike

  sys.update(0.016, 3.0);

  const bursts = sys.getActiveBursts();
  assert.equal(bursts.length, 1, 'Burst spawned at contact point with parked bike');

  const jolts = sys.getActiveJolts();
  assert.ok(jolts.has(player), 'Player rider jolts');
  assert.equal(jolts.size, 1, 'Only player rider jolts; parked bike has no rider');

  const recoils = sys.getActiveRecoils();
  assert.ok(recoils.has(playerBike), 'Player bike recoils');
  assert.ok(recoils.has(parkedBike), 'Parked bike recoils in place');
  assert.ok(recoils.get(parkedBike).maxDist < recoils.get(playerBike).maxDist, 'Parked bike recoil is smaller');

  // Player pushed out immediately so player can reverse or steer away
  const dist = Math.hypot(parkedBike.x - player.group.position.x, parkedBike.z - player.group.position.z);
  const minD = getBikeRadius(playerBike) + getBikeRadius(parkedBike);
  assert.ok(dist >= minD - 0.001, `Player pushed out: dist ${dist} >= ${minD}`);
});

console.log('\nTest Scenario 5: Side Bump');
check('Side bump glances, spawns burst, recoils, and resolves overlap', () => {
  sys.reset();
  player.group.position.set(0, 0, 0);
  playerBike.x = 0;
  playerBike.z = 0;
  state.mount.speed = 3.5;

  scooty.x = 0.85;
  scooty.z = 0.1;
  scooty.model.group.position.set(0.85, 0, 0.1);
  guruSpeed = 3.0;

  sys.update(0.016, 4.0);

  assert.equal(sys.getActiveBursts().length, 1, 'Side bump spawns burst');
  const recoils = sys.getActiveRecoils();
  assert.ok(recoils.has(playerBike), 'Player bike recoils from side bump');
  assert.ok(recoils.has(scooty), 'Other bike recoils from side bump');

  const dx = Math.abs(scooty.x - player.group.position.x);
  const minRequiredX = getBikeRadius(playerBike) + getBikeRadius(scooty);
  assert.ok(dx >= minRequiredX - 0.001, 'Sideways overlap resolved immediately');
});

console.log(`\n=== Verification Complete: ${passed}/${total} passed ===`);
