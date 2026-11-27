import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

const tmjPath = fs.existsSync('public/maps/tahiti.tmj') ? 'public/maps/tahiti.tmj' : 'web/public/maps/tahiti.tmj';
const tmj = JSON.parse(fs.readFileSync(tmjPath, 'utf8'));
const HALF = 52;
const toWorld = (x, y) => ({ x: +(x / 16 - HALF).toFixed(2), z: +(y / 16 - HALF).toFixed(2) });

test('Euphonium Court - palm beside hoop moved onto nearby grass and hoop is fully visible', () => {
  const objLayer = tmj.layers.find(l => l.name === 'objects');
  const hoop = objLayer.objects.find(o => o.type === 'hoop');
  assert(hoop, 'Basketball hoop exists');
  const hoopPos = toWorld(hoop.x, hoop.y);

  const palms = objLayer.objects.filter(o => o.type === 'tree_palm').map(o => toWorld(o.x, o.y));
  
  // No palm inside painted court
  const palmInsideCourt = palms.find(p => p.x >= 19 && p.x <= 27 && p.z >= -28 && p.z <= -21);
  assert.strictEqual(palmInsideCourt, undefined, 'No palm tree inside painted court lines');

  // No palm crowding hoop within 5m
  const palmNearHoop = palms.find(p => Math.hypot(p.x - hoopPos.x, p.z - hoopPos.z) < 5.0);
  assert.strictEqual(palmNearHoop, undefined, 'No palm crowding hoop within 5m');

  // Palm safely placed on grass lawn east of court
  const movedPalm = palms.find(p => Math.abs(p.x - 30.5) < 0.2 && Math.abs(p.z - (-28.0)) < 0.2);
  assert(movedPalm, 'Palm tree moved onto nearby grass at (30.5, -28.0)');
});

test('Euphonium Court - sideline trees and entrance are clear of painted court and obstacles', () => {
  const objLayer = tmj.layers.find(l => l.name === 'objects');
  const courtTrees = objLayer.objects.filter(o => o.type === 'tree_round' || o.type === 'tree_palm')
    .map(o => toWorld(o.x, o.y))
    .filter(o => o.z >= -27 && o.z <= -20 && o.x >= 25 && o.x < 31.0);
  assert.strictEqual(courtTrees.length, 0, 'No trees crowding right sideline between x=25 and x=31');

  // Sideline trees placed on grass at x >= 32
  const sidelineTrees = objLayer.objects.filter(o => o.type === 'tree_round')
    .map(o => toWorld(o.x, o.y))
    .filter(o => o.z >= -27 && o.z <= -20 && o.x >= 32.0);
  assert(sidelineTrees.length >= 1, 'Trees safely positioned on grass lawn clear of court');
});

test('Vanderlinde Gang - round green tree in right corner of hedge removed along with collider', () => {
  const objLayer = tmj.layers.find(l => l.name === 'objects');
  const roundTrees = objLayer.objects.filter(o => o.type === 'tree_round').map(o => toWorld(o.x, o.y));
  const cornerTree = roundTrees.find(t => Math.hypot(t.x - (-2.0), t.z - (-16.0)) < 1.0);
  assert.strictEqual(cornerTree, undefined, 'Round green tree tucked into right corner of hedge (-2.0, -16.0) is removed');
});

test('Shabeer trading setup - rotated straight on grass plot and off path', () => {
  const objLayer = tmj.layers.find(l => l.name === 'objects');
  const fin = objLayer.objects.find(o => o.type === 'finance_stock');
  assert(fin, 'finance_stock found');
  const rot = fin.properties?.find(p => p.name === 'rot')?.value || 0;
  assert.strictEqual(rot, 0, 'finance_stock rot is 0 (aligned with grid)');

  const pos = toWorld(fin.x, fin.y);
  // Mat dimensions w=4.4, d=2.7 centered at x=0, z=0.55
  const minX = pos.x - 2.2, maxX = pos.x + 2.2;
  const minZ = pos.z + 0.55 - 1.35, maxZ = pos.z + 0.55 + 1.35;
  assert(minX > 4.5 && maxX < 12.0, 'Mat is off west and east paths');
  assert(minZ > -25.0 && maxZ < -19.0, 'Mat is off north road and south ring road');

  // Shabeer NPC tahiti_sf5 route
  const pathsLayer = tmj.layers.find(l => l.name === 'paths');
  const route = pathsLayer.objects.find(o => o.properties?.some(p => p.name === 'npc' && p.value === 'tahiti_sf5'));
  assert(route, 'Shabeer route found');
  const shabPos = toWorld(route.x, route.y);
  assert.strictEqual(shabPos.x, 10.2, 'Shabeer stands at x=10.2');
  assert.strictEqual(shabPos.z, -22.05, 'Shabeer stands at z=-22.05');
});

test('Jeswin teleport & water hazard - guarded during transition and splash card styled', () => {
  const mainPath = fs.existsSync('src/game/main.js') ? 'src/game/main.js' : 'web/src/game/main.js';
  const mainSrc = fs.readFileSync(mainPath, 'utf8');
  assert(mainSrc.includes('state.visiting'), 'state.visiting flag present');
  assert(mainSrc.includes('if (!world || state.ko || !state.started || state.visiting) return;'), 'checkHazards checks visiting flag');
  assert(mainSrc.includes('if (!state.cine && !state.arrival && !state.visiting) checkHazards(dt);'), 'main loop checks visiting flag');
  assert(mainSrc.includes('ko-card-splash'), 'Retro arcade splash card class in knockout');
});

test('Euphonium Court L-shaped hedge - uniform geometry, single continuous cap, no extra layer or protrusion', async () => {
  const objLayer = tmj.layers.find(l => l.name === 'objects');
  const hedges = objLayer.objects.filter(o => o.type === 'hedge');

  // Find the two hedge segments for the L-shaped hedge beside Euphonium Court
  const northHedge = hedges.find(h => h.properties?.some(p => p.name === 'courtL' && p.value === 'main'));
  const eastHedge = hedges.find(h => h.properties?.some(p => p.name === 'courtL' && p.value === 'sub'));

  assert(northHedge, 'North hedge segment with courtL: "main" exists');
  assert(eastHedge, 'East hedge segment with courtL: "sub" exists');

  const nPos = toWorld(northHedge.x, northHedge.y);
  const nW = +(northHedge.width / 16).toFixed(2);
  const nD = +(northHedge.height / 16).toFixed(2);

  const ePos = toWorld(eastHedge.x, eastHedge.y);
  const eW = +(eastHedge.width / 16).toFixed(2);
  const eD = +(eastHedge.height / 16).toFixed(2);

  // Check bounds
  const northBounds = { minX: nPos.x, maxX: nPos.x + nW, minZ: nPos.z, maxZ: nPos.z + nD };
  const eastBounds = { minX: ePos.x, maxX: ePos.x + eW, minZ: ePos.z, maxZ: ePos.z + eD };

  // 1. Neither hedge segment extends north of z = -17.5 (no extra 1m strip protruding north)
  assert(northBounds.minZ >= -17.51, `North hedge minZ is ${northBounds.minZ}, does not extend north of -17.5`);
  assert(eastBounds.minZ >= -16.71, `East hedge minZ is ${eastBounds.minZ}, does not extend north of corner at -16.7`);

  // 2. East hedge joins flush at south face of north hedge (z = -16.7), zero overlap
  assert.strictEqual(Math.abs(eastBounds.minZ - northBounds.maxZ) < 0.05, true, 'East hedge meets North hedge flush at z = -16.7 with zero overlap');

  // 3. Test 3D KIT geometry
  const THREE = await import('../node_modules/three/build/three.module.js');
  const { KIT } = await import('../src/game/kit.js');

  const mainHedge = KIT.hedge({ w: nW, d: nD, courtL: 'main' });
  const subHedge = KIT.hedge({ w: eW, d: eD, courtL: 'sub' });

  // Sub piece only provides colliders, no duplicate meshes
  assert.strictEqual(subHedge.obj.children.length, 0, 'Sub hedge piece generates no duplicate mesh geometry');
  assert.strictEqual(subHedge.colliders.length, 1, 'Sub hedge piece has collision box');

  // Main piece generates single extruded base and cap
  assert(mainHedge.obj.children.length > 0, 'Main hedge piece has meshes');
  const meshes = mainHedge.obj.children.filter(c => c.isMesh);
  
  // Base mesh and Cap mesh
  const baseMesh = meshes[0];
  const capMesh = meshes[1];
  assert(baseMesh && capMesh, 'Base and cap meshes present');

  baseMesh.geometry.computeBoundingBox();
  capMesh.geometry.computeBoundingBox();
  const bbBase = baseMesh.geometry.boundingBox;
  const bbCap = capMesh.geometry.boundingBox;

  // Height verification: base = 0.9m, cap = 0.18m at y = 0.9m, total = 1.08m
  assert.strictEqual(+(bbBase.max.y - bbBase.min.y).toFixed(2), 0.90, 'Base height is 0.9m');
  assert.strictEqual(+(bbCap.max.y - bbCap.min.y).toFixed(2), 0.18, 'Cap height is 0.18m');
  assert.strictEqual(+capMesh.position.y.toFixed(2), 0.90, 'Cap sits flush at top of base (y = 0.9m)');
  const totalTopY = +(capMesh.position.y + bbCap.max.y).toFixed(2);
  assert.strictEqual(totalTopY, 1.08, 'Top surface is a single continuous plane at y = 1.08m');
});
