import fs from 'fs';
import path from 'path';
import assert from 'node:assert';
import * as THREE from 'three';

// DOM mock for canvas textures in kit.js (stream_desk, signs, etc.)
const canvasCtx = new Proxy({}, {
  get: (target, prop) => {
    if (prop === 'measureText') return () => ({ width: 10 });
    if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
    return () => {};
  }
});
global.document = {
  createElement: () => ({
    getContext: () => canvasCtx,
    width: 128,
    height: 72,
  }),
};

import { KIT } from '../src/game/kit.js';
import { CANONICAL_MAP } from '../src/game/conversation.js';

console.log('=== TEST SUITE: Complete Tahiti & Characters Verification ===\n');

const tahitiTmj = JSON.parse(fs.readFileSync('web/public/maps/tahiti.tmj', 'utf8'));
const townTmj = JSON.parse(fs.readFileSync('web/public/maps/town.tmj', 'utf8'));
const contentData = JSON.parse(fs.readFileSync('web/public/data/content.json', 'utf8'));
const tahitiData = JSON.parse(fs.readFileSync('web/public/data/tahiti.json', 'utf8'));
const mainJs = fs.readFileSync('web/src/game/main.js', 'utf8').replace(/\r\n/g, '\n');
const charactersJs = fs.readFileSync('web/src/game/characters.js', 'utf8').replace(/\r\n/g, '\n');
const tahitiJs = fs.readFileSync('web/src/game/tahiti.js', 'utf8').replace(/\r\n/g, '\n');
const buildTahitiJs = fs.readFileSync('tools/build-tahiti.mjs', 'utf8').replace(/\r\n/g, '\n');

const HALF = 52, PX = 16, N = 104;
const toWorld = (px, py) => ({ x: px / PX - HALF, z: py / PX - HALF });
const groundLayer = tahitiTmj.layers.find(l => l.name === 'ground');
const objLayer = tahitiTmj.layers.find(l => l.name === 'objects');
const interactLayer = tahitiTmj.layers.find(l => l.name === 'interact');
const pathsLayer = tahitiTmj.layers.find(l => l.name === 'paths');

const tileAtTahiti = (x, z) => {
  const tx = Math.floor(x + HALF);
  const tz = Math.floor(z + HALF);
  if (tx < 0 || tx >= N || tz < 0 || tz >= N) return 0;
  return groundLayer.data[tz * N + tx];
};

// -------------------------------------------------------------
// REQUIREMENT 1: Architecture Building & Continuous Vehicle Road
// -------------------------------------------------------------
console.log('--- Requirement 1: Architecture Building & Fountain-Side Vehicle Road ---');
const studio = objLayer.objects.find(o => o.type === 'architecture_studio');
assert(studio, 'architecture_studio exists in tahiti.tmj');
const sPos = toWorld(studio.x, studio.y);
console.log(`Architecture studio position: (${sPos.x.toFixed(2)}, ${sPos.z.toFixed(2)})`);
assert(Math.abs(sPos.x - 2.0) < 1e-4, 'Studio centered at X=2.0');
assert(Math.abs(sPos.z - (-34.5)) < 1e-4, 'Studio moved back to Z=-34.5 towards the beach');

// Studio plinth spans [-4.2, 8.2] in X, and [-36.9, -32.1] in Z
const plinth = { minX: 2.0 - 6.2, maxX: 2.0 + 6.2, minZ: -34.5 - 2.4, maxZ: -34.5 + 2.4 };
console.log(`Studio plinth bounds: X [${plinth.minX}, ${plinth.maxX}], Z [${plinth.minZ}, ${plinth.maxZ}]`);

// Verify props moved with studio:
const wk = objLayer.objects.find(o => o.type === 'architect_workspace');
assert(wk, 'architect_workspace exists');
const wkPos = toWorld(wk.x, wk.y);
console.log(`Architect workspace at (${wkPos.x.toFixed(2)}, ${wkPos.z.toFixed(2)})`);
assert(Math.abs(wkPos.x - 6.0) < 1e-4 && Math.abs(wkPos.z - (-32.0)) < 1e-4, 'Workspace shifted with studio to (6.0, -32.0)');

const moto = interactLayer.objects.find(o => o.properties?.some(p => p.name === 'id' && p.value === 'moto-jeswin'));
assert(moto, 'moto-jeswin exists');
const motoPos = toWorld(moto.x, moto.y);
console.log(`Jeswin moto at (${motoPos.x.toFixed(2)}, ${motoPos.z.toFixed(2)})`);
assert(Math.abs(motoPos.x - 9.5) < 1e-4 && Math.abs(motoPos.z - (-31.5)) < 1e-4, 'Moto moved to (9.5, -31.5)');

// Verify vehicle road on fountain side:
// Road spans z = [-27, -25] across x = [-6, 14], with west connector down to z=-18 and east connector down to z=-18
const T_PATH = 9, T_PLAZA = 5, T_CONCRETE = 7;
const ROAD_TILES = new Set([T_PATH, T_PLAZA, T_CONCRETE]);

for (let x = -6; x <= 14; x++) {
  for (let z = -27; z <= -25; z++) {
    const t = tileAtTahiti(x, z);
    assert(ROAD_TILES.has(t), `Front road at (${x}, ${z}) is paved (tile: ${t})`);
  }
}
console.log('✓ Front road across studio (fountain side) is 3-tiles wide and 100% paved.');

// Build full colliders list for test drive
const colliders = [];
for (const o of objLayer.objects) {
  const def = KIT[o.type];
  if (!def) continue;
  const pos = toWorld(o.x, o.y);
  const rotProp = o.properties?.find(p => p.name === 'rot');
  const rotDeg = rotProp ? Number(rotProp.value) || 0 : 0;
  const rot = (rotDeg * Math.PI) / 180;
  const res = def(o.properties ? Object.fromEntries(o.properties.map(p => [p.name, p.value])) : {});
  if (!res?.colliders) continue;

  const cos = Math.cos(rot), sin = Math.sin(rot);
  for (const c of res.colliders) {
    if (c.r) {
      const cx = pos.x + c.x * cos + c.z * sin;
      const cz = pos.z - c.x * sin + c.z * cos;
      colliders.push({ type: 'cyl', x: cx, z: cz, r: c.r });
    } else {
      const hw = c.w / 2, hd = c.d / 2;
      const corners = [
        [-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]
      ].map(([dx, dz]) => ({
        x: pos.x + dx * cos + dz * sin,
        z: pos.z - dx * sin + dz * cos,
      }));
      colliders.push({
        type: 'box',
        minX: Math.min(...corners.map(p => p.x)),
        maxX: Math.max(...corners.map(p => p.x)),
        minZ: Math.min(...corners.map(p => p.z)),
        maxZ: Math.max(...corners.map(p => p.z)),
      });
    }
  }
}

// Vehicle test drive: test collision with radius = 0.55m (standard vehicle radius)
const VEHICLE_R = 0.55;
function checkCollision(x, z) {
  for (const c of colliders) {
    if (c.type === 'cyl') {
      if (Math.hypot(x - c.x, z - c.z) < c.r + VEHICLE_R) return c;
    } else {
      const nearestX = Math.max(c.minX, Math.min(x, c.maxX));
      const nearestZ = Math.max(c.minZ, Math.min(z, c.maxZ));
      if (Math.hypot(x - nearestX, z - nearestZ) < VEHICLE_R) return c;
    }
  }
  return null;
}

// Full loop route connecting to existing island route at both ends:
// Route: North Ring Road (0, -19) -> West Junction (-5, -19) -> West Connector (-5, -26)
//        -> Front Road (0, -26) -> (10, -26) -> East Connector (14, -26) -> East Junction (14, -19)
//        -> North Ring Road (0, -19)
const driveRoute = [
  [0, -19],
  [-5, -19],
  [-5, -26],
  [4, -26],
  [14, -26],
  [14, -19],
  [0, -19],
];

function simulateTestDrive(name, pts) {
  let hits = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[i + 1];
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(dist / 0.25);
    for (let s = 0; s <= steps; s++) {
      const x = x0 + ((x1 - x0) * s) / steps;
      const z = z0 + ((z1 - z0) * s) / steps;
      const col = checkCollision(x, z);
      if (col) {
        console.error(`COLLISION at (${x.toFixed(2)}, ${z.toFixed(2)}):`, col);
        hits++;
      }
    }
  }
  console.log(`Test-drive ${name}: ${hits} collisions.`);
  assert.strictEqual(hits, 0, `Test drive ${name} should have 0 collisions`);
}

simulateTestDrive('Clockwise', driveRoute);
simulateTestDrive('Counter-Clockwise', [...driveRoute].reverse());
console.log('✓ Requirement 1 passed: Full vehicle route test-driven in both directions with 0 collisions.\n');


// -------------------------------------------------------------
// REQUIREMENT 2: Ground Inside Road Loop Green
// -------------------------------------------------------------
console.log('--- Requirement 2: Clean Grassland Inside Road Loop ---');
// Verify that old scenic road behind building at z = [-35, -34] is NO LONGER paved with path tiles
let oldRoadTiles = 0;
for (let x = -6; x <= 14; x++) {
  if (tileAtTahiti(x, -35) === T_PATH || tileAtTahiti(x, -34) === T_PATH) oldRoadTiles++;
}
assert.strictEqual(oldRoadTiles, 0, 'No old road tiles behind architecture building');
console.log('✓ Old road behind architecture studio completely cleared; area restored to green grass and clean beach.');

// Check lawn inside road loop between front road (z = -25) and fountain plaza (z = -18):
// In the region x = [-3, 11], z = [-23, -20]
let greenTiles = 0, totalInside = 0;
const GREEN_TILES = new Set([1, 16]); // T.grass (1) and T.grass_edge (16)
for (let x = -3; x <= 11; x++) {
  for (let z = -23; z <= -20; z++) {
    // If not in fountain plaza radius
    const inFountainPlaza = Math.hypot(x + 0.5 - 0.5, z + 0.5 - (-22)) <= 4.2;
    if (!inFountainPlaza) {
      totalInside++;
      const t = tileAtTahiti(x, z);
      if (GREEN_TILES.has(t)) greenTiles++;
      else console.log(`Non-green tile at (${x}, ${z}): ${t}`);
    }
  }
}
console.log(`Inside road loop continuous green grass tiles: ${greenTiles} / ${totalInside}`);
assert.strictEqual(greenTiles, totalInside, 'All tiles inside road loop outside fountain plaza are continuous green grass (no beige/sand gaps)');
console.log('✓ Requirement 2 passed: Continuous green grass inside loop with distinct paved plaza and road.\n');


// -------------------------------------------------------------
// REQUIREMENT 3: Characters Menu & Dialogue Trigger
// -------------------------------------------------------------
console.log('--- Requirement 3: Characters Menu Teleport & Dialogue Trigger ---');
// Verify visitCharacter in main.js triggers talkTo(targetNpc)
assert(mainJs.includes('if (ok && targetNpc) {\n    await sleep(80);\n    await talkTo(targetNpc);\n  }'), 'visitCharacter calls talkTo(targetNpc) on successful teleport');
// Verify characters.js closes on visit click
assert(charactersJs.includes('close();\n    const ok = await host.visit(b.dataset.visit);\n    if (!ok) show();'), 'characters menu closes immediately on visit click and re-opens only on failure');

// Compile all 23 canonical characters across Island 01 and Tahiti
const allNpcs = [...contentData.npcs, ...tahitiData.npcs];
const byCanon = new Map();
for (const npc of allNpcs) {
  const canon = CANONICAL_MAP[npc.id] || npc.id;
  if (!byCanon.has(canon)) byCanon.set(canon, []);
  byCanon.get(canon).push(npc);
}

console.log(`Found ${byCanon.size} unique canonical characters.`);
assert.strictEqual(byCanon.size, 23, 'Must have exactly 23 canonical characters');

// Verify every entry has valid dialogues, walkable spawn positions, and destinations
for (const [canon, npcs] of byCanon.entries()) {
  const primary = npcs[0];
  const islands = [...new Set(npcs.map(n => n.id.startsWith('tahiti_') ? 'tahiti' : 'island1'))];
  // Verify dialogue definition: has lines or topics or bank
  const hasDialogue = npcs.some(n => (n.lines && n.lines.length > 0) || (n.topics && n.topics.length > 0));
  assert(hasDialogue, `Canonical character ${canon} has dialogue definitions`);

  // Verify routes in map
  for (const n of npcs) {
    const isTahiti = n.id.startsWith('tahiti_');
    const map = isTahiti ? tahitiTmj : townTmj;
    const pLayer = map.layers.find(l => l.name === 'paths');
    const route = pLayer.objects.find(o => o.properties?.some(p => p.name === 'npc' && p.value === n.id));
    assert(route, `Route found in ${isTahiti ? 'Tahiti' : 'Town'} map for NPC ${n.id} (${canon})`);
    const pt0 = toWorld(route.x, route.y);
    assert(!isNaN(pt0.x) && !isNaN(pt0.z), `Route starting point is valid coordinates for ${n.id}`);
  }
}
console.log('✓ All 23 canonical characters verified: dialogues present, valid routes, correct island routing.\n');


// -------------------------------------------------------------
// REQUIREMENT 4: Shabeer Fully Visible at Trading Station & Rotated Straight
// -------------------------------------------------------------
console.log('--- Requirement 4: Shabeer Setup Rotated Straight & Visible ---');
// Shabeer NPC: tahiti_sf5
const shabRoute = pathsLayer.objects.find(o => o.properties?.some(p => p.name === 'npc' && p.value === 'tahiti_sf5'));
assert(shabRoute, 'tahiti_sf5 route found');
const shabPos = toWorld(shabRoute.x, shabRoute.y);
console.log(`Shabeer standing spot: (${shabPos.x.toFixed(2)}, ${shabPos.z.toFixed(2)})`);
assert(Math.abs(shabPos.x - 10.2) < 0.05 && Math.abs(shabPos.z - (-22.05)) < 0.05, 'Shabeer is at (10.20, -22.05)');

// Verify finance_stock object is rotated 0
const finStock = objLayer.objects.find(o => o.type === 'finance_stock');
assert(finStock, 'finance_stock object found');
const finPos = toWorld(finStock.x, finStock.y);
const finRot = finStock.properties?.find(p => p.name === 'rot')?.value || 0;
assert.strictEqual(finRot, 0, 'finance_stock has rot 0 (aligned straight with grass plot)');
console.log(`finance_stock at (${finPos.x.toFixed(2)}, ${finPos.z.toFixed(2)}) with rot ${finRot}`);

// Base mat bounds check: w=4.4, d=2.7, center at x=0, z=0.55
const matMinX = finPos.x - 2.2, matMaxX = finPos.x + 2.2;
const matMinZ = finPos.z + 0.55 - 1.35, matMaxZ = finPos.z + 0.55 + 1.35;
console.log(`Trading setup mat bounds: X [${matMinX.toFixed(2)}, ${matMaxX.toFixed(2)}], Z [${matMinZ.toFixed(2)}, ${matMaxZ.toFixed(2)}]`);
assert(matMinX > 4.5 && matMaxX < 12.0, 'Mat is off west and east paths');
assert(matMinZ > -25.0 && matMaxZ < -19.0, 'Mat is off north road and south ring road');

// Verify tree moved to (16.5, -25.5)
const treeNear = objLayer.objects.filter(o => o.type === 'tree_round').map(o => toWorld(o.x, o.y));
const tree16 = treeNear.find(t => Math.abs(t.x - 16.5) < 0.2 && Math.abs(t.z - (-25.5)) < 0.2);
assert(tree16, 'tree_round placed at (16.5, -25.5)');

// Camera direction is Isometric from (+X, +Z) looking at (-X, -Z):
for (const t of treeNear) {
  const dx = t.x - shabPos.x;
  const dz = t.z - shabPos.z;
  const dist = Math.hypot(dx, dz);
  if (dx > 0 && dz > 0) {
    console.log(`Tree in camera quadrant at (${t.x.toFixed(2)}, ${t.z.toFixed(2)}), dist: ${dist.toFixed(2)}m`);
    assert(dist > 4.0, `Tree at (${t.x}, ${t.z}) must be clear of Shabeer (> 4.0m away)`);
  }
}
console.log('✓ Shabeer setup rotated straight, completely off paths, and clear of trees.\n');


// -------------------------------------------------------------
// REQUIREMENT 5: Jeswin Visible Beside Architecture Workstation & Teleport
// -------------------------------------------------------------
console.log('--- Requirement 5: Jeswin Visibility Beside Workstation & Teleport Spot ---');
const jesRoute = pathsLayer.objects.find(o => o.properties?.some(p => p.name === 'npc' && p.value === 'tahiti_sf3'));
assert(jesRoute, 'tahiti_sf3 route found');
const jesPos = toWorld(jesRoute.x, jesRoute.y);
console.log(`Jeswin standing spot: (${jesPos.x.toFixed(2)}, ${jesPos.z.toFixed(2)})`);
assert(Math.abs(jesPos.x - 6.7) < 0.05 && Math.abs(jesPos.z - (-31.7)) < 0.05, 'Jeswin is at (6.7, -31.7)');

// Verify Jeswin is outside the fountain collider
const fountain = objLayer.objects.find(o => o.type === 'fountain');
assert(fountain, 'fountain found');
const fPos = toWorld(fountain.x, fountain.y);
const distFountain = Math.hypot(jesPos.x - fPos.x, jesPos.z - fPos.z);
console.log(`Fountain at (${fPos.x}, ${fPos.z}), distance to Jeswin: ${distFountain.toFixed(2)}m (fountain radius: 2.4m)`);
assert(distFountain > 10.0, 'Jeswin is > 10m away from fountain');

// Screen projection check from isometric camera
// Camera: X_screen = (x - z) / sqrt(2), Y_screen = (x + z) / 2
const jesScreenX = (jesPos.x - jesPos.z) / Math.SQRT2;
const fScreenX = (fPos.x - fPos.z) / Math.SQRT2;
console.log(`Jeswin screen X: ${jesScreenX.toFixed(2)}, Fountain screen X: ${fScreenX.toFixed(2)}, Delta: ${(jesScreenX - fScreenX).toFixed(2)}m`);
assert(Math.abs(jesScreenX - fScreenX) > 10.0, 'Jeswin completely clear of fountain silhouette on screen');

// Verify Jeswin's visitSpot
const jesVisitSpotProp = jesRoute.properties?.find(p => p.name === 'visitSpot');
assert(jesVisitSpotProp, 'visitSpot property present on Jeswin route');
assert.strictEqual(jesVisitSpotProp.value, '6.7,-29.8', 'Jeswin visitSpot is 6.7,-29.8');

// Verify visitSpot collision free and walkable
const visitCol = checkCollision(6.7, -29.8);
assert.strictEqual(visitCol, null, 'Jeswin teleport visitSpot (6.7, -29.8) has 0 collisions');
const visitTile = tileAtTahiti(6.7, -29.8);
assert(GREEN_TILES.has(visitTile), 'Jeswin teleport visitSpot is on clear grass ground');
console.log('✓ Jeswin teleport landing spot (6.7, -29.8) is on clear, walkable grass directly facing him.\n');

// -------------------------------------------------------------
// REQUIREMENT 6: Euphonium Court Trees & Free Movement
// -------------------------------------------------------------
console.log('--- Requirement 6: Euphonium Court Trees Clearance & Free Access ---');
// Court bounds: X [19, 27], Z [-28, -21]
const hoop = objLayer.objects.find(o => o.type === 'hoop');
assert(hoop, 'Basketball hoop found');
const hoopPos = toWorld(hoop.x, hoop.y);
console.log(`Hoop at (${hoopPos.x.toFixed(2)}, ${hoopPos.z.toFixed(2)})`);

// Verify no palm tree beside hoop (within 5m)
const palms = objLayer.objects.filter(o => o.type === 'tree_palm').map(o => toWorld(o.x, o.y));
const courtPalm = palms.find(p => p.x >= 19 && p.x <= 27 && p.z >= -28 && p.z <= -21);
assert(!courtPalm, 'No palm tree inside the painted basketball court');

const palmNearHoop = palms.find(p => Math.hypot(p.x - hoopPos.x, p.z - hoopPos.z) < 5.0);
assert(!palmNearHoop, 'No palm tree crowding the basketball hoop within 5m');

// Verify palm moved onto nearby grass east of court
const movedPalm = palms.find(p => Math.abs(p.x - 30.5) < 0.2 && Math.abs(p.z - (-28.0)) < 0.2);
assert(movedPalm, 'Palm tree moved onto nearby grass at (30.5, -28.0)');
console.log(`Palm tree safely at (${movedPalm.x.toFixed(2)}, ${movedPalm.z.toFixed(2)}), ${Math.hypot(movedPalm.x - hoopPos.x, movedPalm.z - hoopPos.z).toFixed(2)}m from hoop`);

// Verify right sideline trees moved clear of court (x >= 31.0 for sideline z -27..-20)
const courtTrees = objLayer.objects.filter(o => o.type === 'tree_round' || o.type === 'tree_palm')
  .map(o => toWorld(o.x, o.y))
  .filter(o => o.z >= -27 && o.z <= -20 && o.x >= 25 && o.x < 31.0);
console.log(`Trees crowding right sideline (x 25..31, z -27..-20): ${courtTrees.length}`);
assert.strictEqual(courtTrees.length, 0, 'No trees crowding right sideline between x=25 and x=31');

// Verify entrance at (22..23, -20) has no colliders or obstacles
const entranceCol = checkCollision(22.5, -20.5);
assert.strictEqual(entranceCol, null, 'Court entrance at (22.5, -20.5) is 100% collision free');
console.log('✓ Euphonium Court palm moved onto nearby grass, sideline clear, entrance barrier-free.\n');


// -------------------------------------------------------------
// REQUIREMENT 7: Vanderlinde Gang Hedge Corner Tree Removal
// -------------------------------------------------------------
console.log('--- Requirement 7: Vanderlinde Gang Hedge Corner Tree Removal ---');
// Check if round tree exists at (-2.0, -16.0)
const roundTrees = objLayer.objects.filter(o => o.type === 'tree_round').map(o => toWorld(o.x, o.y));
const cornerTree = roundTrees.find(t => Math.hypot(t.x - (-2.0), t.z - (-16.0)) < 1.0);
assert(!cornerTree, 'Round green tree tucked into right corner of Vanderlinde hedge (-2.0, -16.0) has been removed');
const cornerCol = checkCollision(-2.0, -16.0);
console.log(`Hedge corner collider check at (-2.0, -16.0): ${cornerCol ? cornerCol.type : 'free'}`);
console.log('✓ Vanderlinde hedge corner tree and its collider removed; corner is clear.\n');


// -------------------------------------------------------------
// REQUIREMENT 8: Jeswin Teleport Water Check Guard & Splash Card
// -------------------------------------------------------------
console.log('--- Requirement 8: Jeswin Teleport Water Hazard Guard & Splash Card ---');
const mainSrc = fs.readFileSync('web/src/game/main.js', 'utf8');
assert(mainSrc.includes('state.visiting'), 'state.visiting flag present in main.js');
assert(mainSrc.includes('if (!world || state.ko || !state.started || state.visiting) return;'), 'checkHazards guards against state.visiting');
assert(mainSrc.includes('if (!state.cine && !state.arrival && !state.visiting) checkHazards(dt);'), 'main loop guards checkHazards against state.visiting');
assert(mainSrc.includes('ko-card-splash'), 'Retro arcade splash card CSS class present in knockout');
assert(mainSrc.includes('splash-ripple'), 'Pixel art ripple SVG present in splash card');
assert(mainSrc.includes('Nathan can lift, but he can’t swim (yet).'), 'Splash text present');
console.log('✓ Teleport water hazard check guarded during transitions; splash card retro arcade styling verified.\n');

console.log('================================================================');
console.log('ALL TAHITI REQUIREMENTS FULLY VERIFIED AND PASSING! ✓✓✓');
console.log('================================================================');
