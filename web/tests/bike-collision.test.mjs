import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  isBikeVehicle,
  getBikeRadius,
  getBikePairKey,
  createBikeCollisionSystem
} from '../src/game/bike-collision.js';

function createMockWorld() {
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
    heading: Math.PI, // Facing -Z
    x: 0,
    z: 5,
    model: { group: new THREE.Group() }
  };
  scooty.model.group.position.set(0, 0, 5);

  const playerBike = {
    id: 'vehicle:moto-tce',
    kind: 'vehicle',
    vtype: 'moto',
    heading: 0, // Facing +Z
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
    x: 10,
    z: 10,
    model: { group: new THREE.Group() }
  };
  parkedBike.model.group.position.set(10, 0, 10);

  const state = {
    mount: {
      it: playerBike,
      heading: 0,
      speed: 5.0
    }
  };

  let shakeDuration = 0;
  const bonkCalls = [];
  const sfx = {
    bonk: () => bonkCalls.push(true)
  };

  const world = {
    vehicles: [playerBike, scooty, parkedBike],
    npcs: [
      {
        npcId: 'guru',
        character: guruChar
      }
    ]
  };

  const collisionSystem = createBikeCollisionSystem({
    scene,
    state,
    player,
    world,
    heightAt: () => 0,
    sfx,
    guruRoutine,
    triggerCameraShake: (dur) => {
      shakeDuration = dur;
    }
  });

  return {
    scene,
    state,
    player,
    playerBike,
    scooty,
    parkedBike,
    guruChar,
    guruRoutine,
    world,
    sfx,
    bonkCalls,
    collisionSystem,
    getShakeDuration: () => shakeDuration,
    setGuruMounted: (m) => { guruMounted = m; },
    setGuruSpeed: (s) => { guruSpeed = s; }
  };
}

test('isBikeVehicle correctly identifies bikes, motos, and scooties', () => {
  assert.equal(isBikeVehicle({ kind: 'vehicle', vtype: 'bike' }), true);
  assert.equal(isBikeVehicle({ kind: 'vehicle', vtype: 'moto' }), true);
  assert.equal(isBikeVehicle({ kind: 'vehicle', vtype: 'scooty' }), true);
  assert.equal(isBikeVehicle({ kind: 'vehicle', vtype: 'horse' }), false);
  assert.equal(isBikeVehicle({ kind: 'npc' }), false);
  assert.equal(isBikeVehicle(null), false);
});

test('Head-on hits: triggers burst, recoils both bikes, jolts both riders, adds camera shake, resolves overlap', () => {
  const env = createMockWorld();
  const { player, playerBike, scooty, guruChar, collisionSystem } = env;

  // Move bikes towards each other into collision range
  // Player bike at z=1.5, Scooty at z=2.4 -> distance = 0.9m <= hitDist (~1.01m)
  player.group.position.set(0, 0, 1.5);
  playerBike.x = 0;
  playerBike.z = 1.5;
  env.state.mount.speed = 6.0;

  scooty.x = 0;
  scooty.z = 2.4;
  scooty.model.group.position.set(0, 0, 2.4);
  env.setGuruSpeed(5.0);

  // Check collision
  collisionSystem.update(0.016, 0.1);

  // 1. Pixel-art burst spawned
  const bursts = collisionSystem.getActiveBursts();
  assert.ok(bursts.length >= 1, 'Should spawn a pixel burst at point of contact');
  assert.ok(bursts[0].sparks.length >= 6, 'Burst should include flying pixel spark voxels');

  // 2. Both bikes recoil
  const recoils = collisionSystem.getActiveRecoils();
  assert.ok(recoils.has(playerBike), 'Player bike should have active recoil');
  assert.ok(recoils.has(scooty), 'Scooty should have active recoil');

  // 3. Both riders jolt in their seats
  const jolts = collisionSystem.getActiveJolts();
  assert.ok(jolts.has(player), 'Player rider should jolt in seat');
  assert.ok(jolts.has(guruChar), 'Guru rider should jolt in seat');
  assert.ok(player.joltY > 0, 'Player should have positive vertical jolt');
  assert.ok(guruChar.joltY > 0, 'Guru should have positive vertical jolt');

  // 4. Camera shake triggered for hard head-on hit
  assert.ok(env.getShakeDuration() > 0.05, 'Camera shake should be triggered for hard hit');

  // 5. Sound played
  assert.ok(env.bonkCalls.length >= 1, 'Impact sound should be played');

  // 6. Overlap resolved immediately (bikes pushed apart to contact distance)
  const newDist = Math.hypot(scooty.x - player.group.position.x, scooty.z - player.group.position.z);
  const minRequiredDist = getBikeRadius(playerBike) + getBikeRadius(scooty);
  assert.ok(newDist >= minRequiredDist - 0.001, `Overlap should be resolved immediately: dist ${newDist} >= ${minRequiredDist}`);

  // 7. Player remains mounted and speed is dampened
  assert.equal(env.state.mount.it, playerBike, 'Player must remain mounted');
  assert.ok(env.state.mount.speed <= 0, 'Player forward speed should be arrested on head-on collision');

  // 8. Both riders and bikes settle over time
  for (let step = 0; step < 25; step++) {
    collisionSystem.update(0.02, 0.1 + step * 0.02);
  }
  assert.equal(player.joltY, 0, 'Player jolt should settle to 0');
  assert.equal(player.joltPitch, 0, 'Player pitch should settle to 0');
  assert.equal(guruChar.joltY, 0, 'Guru jolt should settle to 0');
  assert.equal(playerBike.recoilX, 0, 'Player bike recoil should settle to 0');
  assert.equal(scooty.recoilX, 0, 'Scooty recoil should settle to 0');
});

test('Slow bump gets tiny jolt and NO camera shake', () => {
  const env = createMockWorld();
  const { player, playerBike, scooty, guruChar, collisionSystem } = env;

  // Slow creeping speed
  env.state.mount.speed = 1.0;
  env.setGuruSpeed(0.5);

  player.group.position.set(0, 0, 1.5);
  playerBike.x = 0;
  playerBike.z = 1.5;

  scooty.x = 0;
  scooty.z = 2.4;
  scooty.model.group.position.set(0, 0, 2.4);

  collisionSystem.update(0.016, 0.1);

  // Tiny jolt
  const jolts = collisionSystem.getActiveJolts();
  assert.ok(jolts.has(player), 'Player should have active jolt');
  assert.ok(jolts.get(player).maxAmpY < 0.07, 'Slow bump should produce a tiny jolt (< 0.07m)');

  // No camera shake for slow bump
  assert.equal(env.getShakeDuration(), 0, 'Slow bump must NOT trigger camera shake');
});

test('Side bumps: glancing hit triggers burst and resolves overlap', () => {
  const env = createMockWorld();
  const { player, playerBike, scooty, collisionSystem } = env;

  // Side-by-side collision (X offset 0.85m, Z offset 0.1m)
  player.group.position.set(0, 0, 0);
  playerBike.x = 0;
  playerBike.z = 0;
  playerBike.heading = 0;
  env.state.mount.speed = 3.5;

  scooty.x = 0.85;
  scooty.z = 0.1;
  scooty.model.group.position.set(0.85, 0, 0.1);
  scooty.heading = 0;
  env.setGuruSpeed(3.0);

  collisionSystem.update(0.016, 0.1);

  assert.ok(collisionSystem.getActiveBursts().length >= 1, 'Side bump should spawn a burst');
  assert.ok(collisionSystem.getActiveRecoils().has(playerBike), 'Player bike should recoil from side bump');
  assert.ok(collisionSystem.getActiveRecoils().has(scooty), 'Other bike should recoil from side bump');

  // Overlap resolved sideways
  const dx = Math.abs(scooty.x - player.group.position.x);
  const minRequiredX = getBikeRadius(playerBike) + getBikeRadius(scooty);
  assert.ok(dx >= minRequiredX - 0.001, 'Sideways overlap should be resolved immediately');
});

test('Collisions with a parked bike: player recoils and jolts, parked bike recoils slightly, parked bike has NO rider jolt', () => {
  const env = createMockWorld();
  const { player, playerBike, parkedBike, collisionSystem } = env;

  // Player collides with Prince\'s parked black bike
  player.group.position.set(10, 0, 9.15);
  playerBike.x = 10;
  playerBike.z = 9.15;
  playerBike.heading = 0;
  env.state.mount.speed = 5.0;

  parkedBike.x = 10;
  parkedBike.z = 10;
  parkedBike.model.group.position.set(10, 0, 10);

  collisionSystem.update(0.016, 0.1);

  // 1. Burst spawned at point of contact
  assert.ok(collisionSystem.getActiveBursts().length >= 1, 'Burst spawned at parked bike contact point');

  // 2. Player rider jolts
  const jolts = collisionSystem.getActiveJolts();
  assert.ok(jolts.has(player), 'Player rider must jolt in seat');
  assert.equal(jolts.size, 1, 'Only player rider should jolt; parked bike has no rider');

  // 3. Both bikes recoil (player bike recoils away, parked bike nudges slightly)
  const recoils = collisionSystem.getActiveRecoils();
  assert.ok(recoils.has(playerBike), 'Player bike should recoil');
  assert.ok(recoils.has(parkedBike), 'Parked bike should recoil slightly in place');
  assert.ok(recoils.get(parkedBike).maxDist < recoils.get(playerBike).maxDist, 'Parked bike recoil is smaller than hitting bike');

  // 4. Overlap resolved immediately (player pushed out)
  const dist = Math.hypot(parkedBike.x - player.group.position.x, parkedBike.z - player.group.position.z);
  const minRequiredDist = getBikeRadius(playerBike) + getBikeRadius(parkedBike);
  assert.ok(dist >= minRequiredDist - 0.001, 'Player should be pushed clear of parked bike immediately');
});

test('Animation plays ONCE per hit, and triggers again after bikes separate', () => {
  const env = createMockWorld();
  const { player, playerBike, parkedBike, collisionSystem } = env;

  // Step 1: Initial collision
  player.group.position.set(10, 0, 9.15);
  playerBike.x = 10;
  playerBike.z = 9.15;

  parkedBike.x = 10;
  parkedBike.z = 10;
  parkedBike.model.group.position.set(10, 0, 10);

  collisionSystem.update(0.016, 0.1);
  assert.equal(collisionSystem.getActiveBursts().length, 1, 'Initial hit creates 1 burst');
  assert.equal(env.bonkCalls.length, 1, 'Initial hit plays 1 sound');

  // Step 2: Bikes stay in contact on subsequent frames
  collisionSystem.update(0.016, 0.12);
  collisionSystem.update(0.016, 0.14);
  collisionSystem.update(0.016, 0.16);
  assert.equal(collisionSystem.getActiveBursts().length, 1, 'Animation should NOT repeat while staying in contact');
  assert.equal(env.bonkCalls.length, 1, 'Sound should NOT repeat while staying in contact');

  // Step 3: Player reverses/steers away beyond separation threshold
  // sepDist is ~1.36m. Move player back to z = 8.0 (dist = 2.0m > sepDist)
  player.group.position.set(10, 0, 8.0);
  playerBike.x = 10;
  playerBike.z = 8.0;

  collisionSystem.update(0.016, 0.20);
  assert.equal(collisionSystem.getActiveHits().size, 0, 'Collision pair should clear after bikes separate');

  // Step 4: Player rides in and collides again
  player.group.position.set(10, 0, 9.15);
  playerBike.x = 10;
  playerBike.z = 9.15;

  collisionSystem.update(0.016, 0.30);
  assert.equal(collisionSystem.getActiveBursts().length, 2, 'New hit after separation must trigger animation again');
  assert.equal(env.bonkCalls.length, 2, 'Sound plays again on second hit');
});
