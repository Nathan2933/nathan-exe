import test from 'node:test';
import assert from 'node:assert/strict';
import { NavGrid } from '../src/game/nav.js';

test('NavGrid blocks pathfinding through dynamic train obstacle', () => {
  // Train parked along z = [-2, 2], x = [-6, 6]
  const isTrain = (x, z) => Math.abs(z) < 2 && Math.abs(x) < 6;

  const nav = new NavGrid({
    size: 64,
    cell: 0.5,
    islandRadius: 30,
    colliders: [],
    dynamicBlocked: isTrain,
  });

  // Test isWalkable inside train
  assert.equal(nav.isWalkable(0, 0), false, 'Inside train should not be walkable');
  assert.equal(nav.isWalkable(0, 5), true, 'Outside train should be walkable');

  // Test gridFree and lineFree
  assert.equal(nav.gridFree(0, 0), false, 'gridFree inside train should be false');
  assert.equal(nav.lineFree(0, -5, 0, 5), false, 'lineFree across train should be false');

  // Test findPath routes AROUND train
  const path = nav.findPath(0, -5, 0, 5);
  assert.ok(path.length >= 2, 'Path should route around the train with waypoints');

  // Ensure no point on the path penetrates the train
  for (const wp of path) {
    assert.equal(isTrain(wp.x, wp.z), false, `Waypoint (${wp.x}, ${wp.z}) should not be inside train`);
  }
});

test('NavGrid allows direct crossing when no train is present', () => {
  let trainPresent = false;
  const nav = new NavGrid({
    size: 64,
    cell: 0.5,
    islandRadius: 30,
    colliders: [],
    dynamicBlocked: (x, z) => trainPresent && Math.abs(z) < 2 && Math.abs(x) < 6,
  });

  // When train is not there:
  const directPath = nav.findPath(0, -5, 0, 5);
  assert.equal(directPath.length, 1, 'Path without train should be direct single waypoint');
  assert.deepEqual(directPath[0], { x: 0, z: 5 });

  // When train arrives:
  trainPresent = true;
  assert.equal(nav.lineFree(0, -5, 0, 5), false, 'lineFree should now be false');
  const pathAround = nav.findPath(0, -5, 0, 5);
  assert.ok(pathAround.length > 1, 'Path with train should divert around');
});

test('Front of engine hit detection covers locomotive front extension', () => {
  // Test local boxHit logic for engine vs standard carriage
  const UP_AXIS = { x: 0, y: 1, z: 0 };
  function boxHitTest(x, z, cx, cz, ry, padX, padZ, isEngine = false) {
    // Delta vector in world coords
    const dx = x - cx, dz = z - cz;
    // Rotate by -ry around UP
    const cos = Math.cos(-ry), sin = Math.sin(-ry);
    const localX = dx * cos + dz * sin;
    const localZ = -dx * sin + dz * cos;
    const maxZ = isEngine ? (1.85 + padZ) : (1.35 + padZ);
    const minZ = -(1.35 + padZ);
    return localZ >= minZ && localZ <= maxZ && Math.abs(localX) < (0.85 + padX);
  }

  // Suppose engine is at (10, 20) facing along world +Z (ry = 0)
  const enginePos = { x: 10, z: 20, ry: 0 };
  const charR = 0.32;

  // Nathan stands directly in front of the engine cowcatcher (local z = 1.65, world z = 21.65)
  assert.equal(
    boxHitTest(10, 21.65, enginePos.x, enginePos.z, enginePos.ry, charR, charR, true),
    true,
    'Player in front of engine cowcatcher should be detected as a hit'
  );

  // Nathan stands far ahead in front of the engine (local z = 3.0, world z = 23.0)
  assert.equal(
    boxHitTest(10, 23.0, enginePos.x, enginePos.z, enginePos.ry, charR, charR, true),
    false,
    'Player far in front should not be hit'
  );

  // Nathan stands to the side of the engine (local x = 2.0, world x = 12.0)
  assert.equal(
    boxHitTest(12.0, 20, enginePos.x, enginePos.z, enginePos.ry, charR, charR, true),
    false,
    'Player clearly to the side should not be hit'
  );
});

