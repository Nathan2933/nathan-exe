/* Comprehensive verification test for Vanderlinde Gang Hideout cutaway fade logic */
import * as THREE from 'three';

// Mock document for canvas creation in kit.js when running under Node
if (typeof document === 'undefined') {
  global.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillRect: () => {},
        fillStyle: '',
        measureText: () => ({ width: 10 }),
        fillText: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        drawImage: () => {},
        createImageData: () => ({ data: [] }),
        getImageData: () => ({ data: [] }),
        putImageData: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
      }),
    }),
  };
}

const { KIT } = await import('../src/game/kit.js');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error('FAIL: ' + message);
    process.exitCode = 1;
  } else {
    passedTests++;
    console.log('PASS: ' + message);
  }
}

async function runTests() {
  console.log('Starting Vanderlinde Gang Hideout Cutaway Fade verification suite...\n');

  // Test 1: Instantiation & initial state
  console.log('== Test 1: Initial Construction & Exterior State ==');
  const piece = KIT.hideout_house();
  assert(!!piece.obj, 'hideout_house returns Three.js obj group');
  assert(!!piece.api, 'hideout_house returns api object');
  assert(typeof piece.animate === 'function', 'hideout_house provides animate function');
  assert(piece.api.isInside() === false, 'isInside() starts false when player is outside');

  // Locate the shell group and signs
  let shellGroup = null;
  const signs = [];
  piece.obj.traverse((child) => {
    if (child.userData?.dynamic && child.children.length === 3 && child.children[0].geometry?.attributes?.color) {
      shellGroup = child;
    }
  });
  assert(!!shellGroup, 'Shell group identified inside hideout object');

  // Check initial material properties
  const shellMeshes = shellGroup.children;
  for (const m of shellMeshes) {
    assert(m.material.opacity === 1, `Shell mesh initial opacity is 1.0 (found ${m.material.opacity})`);
    assert(m.material.transparent === false, 'Shell mesh initially opaque (transparent: false)');
    assert(m.material.depthWrite === true, 'Shell mesh initially depthWrite: true');
    assert(m.visible === true, 'Shell mesh initially visible: true');
    assert(m.castShadow === true, 'Shell mesh initially castShadow: true');
  }

  // Check interior pieces (rear walls, floor, bed, wardrobe) are outside the shell
  let interiorPiecesFound = 0;
  piece.obj.children.forEach((c) => {
    if (c !== shellGroup && c.isMesh) interiorPiecesFound++;
  });
  assert(interiorPiecesFound > 50, `Interior furniture, rear walls, and floor are independent of shell (${interiorPiecesFound} meshes)`);

  // Test 2: Walk-in transition & full fade-out
  console.log('\n== Test 2: Walk-In Transition & Zero-Opacity Cutaway ==');
  // Outside: player at (0, 7) in hideout local space
  piece.animate(0, { playerPos: { x: 0, z: 7 } });
  assert(piece.api.isInside() === false, 'Still outside at z = 7');
  assert(shellMeshes[0].material.opacity === 1, 'Opacity remains 1 when standing outside');

  // Step inside doorway: player at (0, 4) in hideout local space (door threshold is z < hd + 0.45 = 5.45)
  piece.animate(0.016, { playerPos: { x: 0, z: 4 } });
  const firstFrameOpacity = shellMeshes[0].material.opacity;
  assert(firstFrameOpacity < 1.0 && firstFrameOpacity > 0.8, `Fade eases smoothly on entry (first frame opacity: ${firstFrameOpacity.toFixed(3)})`);
  assert(shellMeshes[0].material.transparent === true, 'Becomes transparent during fade');
  assert(shellMeshes[0].material.depthWrite === false, 'Disables depthWrite during fade to prevent depth blocking');

  // Simulate inward progression to steady state (50 frames)
  for (let f = 1; f <= 50; f++) {
    piece.animate(0.016 * f, { playerPos: { x: 0, z: 0 } });
  }

  assert(shellMeshes[0].material.opacity === 0, `Opacity fades all the way to 0 (found ${shellMeshes[0].material.opacity})`);
  assert(shellMeshes[0].material.visible === false, 'Shell materials are completely hidden (material.visible: false) eliminating red overlay');
  assert(shellMeshes[0].castShadow === false, 'Shell shadows disabled when faded (castShadow: false)');
  assert(piece.api.isInside() === true, 'api.isInside() reports true when faded in');

  // Test 3: Walk-out transition & restoration of solid exterior
  console.log('\n== Test 3: Walk-Out Transition & Full Solid Restoration ==');
  // Step outside: player at (0, 6) in hideout local space (outside door boundary)
  piece.animate(1.0, { playerPos: { x: 0, z: 6 } });
  assert(shellMeshes[0].material.visible === true, 'Shell materials become visible again as fade begins recovering');
  assert(shellMeshes[0].material.opacity > 0, `Opacity begins increasing (found ${shellMeshes[0].material.opacity.toFixed(3)})`);

  // Simulate outward progression to steady state (50 frames)
  for (let f = 1; f <= 50; f++) {
    piece.animate(1.0 + 0.016 * f, { playerPos: { x: 0, z: 7 } });
  }

  assert(shellMeshes[0].material.opacity === 1, `Opacity finishes at exact 1.0 (found ${shellMeshes[0].material.opacity})`);
  assert(shellMeshes[0].material.transparent === false, 'Exterior returns to opaque (transparent: false)');
  assert(shellMeshes[0].material.depthWrite === true, 'Exterior depthWrite restored (depthWrite: true)');
  assert(shellMeshes[0].material.visible === true, 'Exterior fully visible (material.visible: true)');
  assert(shellMeshes[0].castShadow === true, 'Exterior shadows restored (castShadow: true)');
  assert(piece.api.isInside() === false, 'api.isInside() reports false when outside');

  // Test 4: Midway turnaround and smooth reversal
  console.log('\n== Test 4: Midway Turnaround & Bidirectional Reversal ==');
  // Start from outside (fade = 1.0)
  // Step inside for 5 frames to reach ~0.5 fade
  for (let f = 1; f <= 5; f++) {
    piece.animate(2.0 + 0.016 * f, { playerPos: { x: 0, z: 2 } });
  }
  const midFadeEnter = shellMeshes[0].material.opacity;
  assert(midFadeEnter > 0.4 && midFadeEnter < 0.65, `Reached midway fade entering: ${midFadeEnter.toFixed(3)}`);

  // Turn around immediately and step outside
  piece.animate(2.1, { playerPos: { x: 0, z: 7 } });
  const midFadeReverse1 = shellMeshes[0].material.opacity;
  assert(midFadeReverse1 > midFadeEnter, `Fade immediately reverses upward towards 1.0: ${midFadeReverse1.toFixed(3)} > ${midFadeEnter.toFixed(3)}`);

  // Let it fully recover outside
  for (let f = 1; f <= 50; f++) {
    piece.animate(2.1 + 0.016 * f, { playerPos: { x: 0, z: 7 } });
  }
  assert(shellMeshes[0].material.opacity === 1.0, 'Smoothly recovered back to 1.0 after mid-entry reversal');

  // Reverse test: start entering again, go midway, and continue inside
  for (let f = 1; f <= 5; f++) {
    piece.animate(3.0 + 0.016 * f, { playerPos: { x: 0, z: 0 } });
  }
  const midFadeEnter2 = shellMeshes[0].material.opacity;
  assert(midFadeEnter2 > 0.4 && midFadeEnter2 < 0.65, `Reached midway fade entering again: ${midFadeEnter2.toFixed(3)}`);

  // Continue inside to completion
  for (let f = 1; f <= 50; f++) {
    piece.animate(3.1 + 0.016 * f, { playerPos: { x: 0, z: 0 } });
  }
  assert(shellMeshes[0].material.opacity === 0.0, 'Smoothly finished down to 0.0 after resuming entry');
  assert(shellMeshes[0].material.visible === false, 'Finished completely hidden with no lingering overlay');

  // Test 5: Exterior perimeter check (west clue side, north garden, east yard)
  console.log('\n== Test 5: Perimeter & Clue Path Invariance ==');
  // Reset to outside
  for (let f = 1; f <= 50; f++) {
    piece.animate(4.0 + 0.016 * f, { playerPos: { x: 0, z: 8 } });
  }

  // West side clue spot: world x = -21.4 (hideout at -13 -> local x = -8.4)
  piece.animate(5.0, { playerPos: { x: -8.4, z: 0 } });
  assert(shellMeshes[0].material.opacity === 1.0, 'West side outside wall (bottle cap path) does not trigger interior fade');

  // North garden: world z = -18 (hideout at -11 -> local z = -7)
  piece.animate(5.1, { playerPos: { x: 0, z: -7 } });
  assert(shellMeshes[0].material.opacity === 1.0, 'North garden path does not trigger interior fade');

  // East yard: local x = 8.4
  piece.animate(5.2, { playerPos: { x: 8.4, z: 0 } });
  assert(shellMeshes[0].material.opacity === 1.0, 'East yard does not trigger interior fade');

  console.log(`\nVerification complete: ${passedTests}/${totalTests} tests passed.`);
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
