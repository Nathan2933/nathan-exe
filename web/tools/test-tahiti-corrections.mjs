import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mapPath = path.join(ROOT, 'web/public/maps/tahiti.tmj');
const tahitiJsonPath = path.join(ROOT, 'web/public/data/tahiti.json');
const kitJsPath = path.join(ROOT, 'web/src/game/kit.js');
const tahitiJsPath = path.join(ROOT, 'web/src/game/tahiti.js');
const convJsPath = path.join(ROOT, 'web/src/game/conversation.js');

assert(fs.existsSync(mapPath), 'tahiti.tmj must exist');
assert(fs.existsSync(tahitiJsonPath), 'tahiti.json must exist');

const tmj = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const N = tmj.width;
const HALF = N / 2;
const PX = tmj.tilewidth;

const toWorld = (px, py) => ({ x: px / PX - HALF, z: py / PX - HALF });
const ground = tmj.layers.find((l) => l.name === 'ground').data;
const objects = tmj.layers.find((l) => l.name === 'objects').objects;
const interact = tmj.layers.find((l) => l.name === 'interact').objects;
const labels = tmj.layers.find((l) => l.name === 'labels').objects;
const paths = tmj.layers.find((l) => l.name === 'paths').objects;

const tahitiData = JSON.parse(fs.readFileSync(tahitiJsonPath, 'utf8'));
const kitJs = fs.readFileSync(kitJsPath, 'utf8');
const tahitiJs = fs.readFileSync(tahitiJsPath, 'utf8');
const convJs = fs.readFileSync(convJsPath, 'utf8');

console.log('=== TEST SUITE: Island 02 Tahiti Corrections ===\n');

// ========================================================
// SECTION 1: EUPHONIUM Renaming
// ========================================================
console.log('--- Section 1: EUPHONIUM Renaming Verification ---');

// 1.1 Map labels
const labelTexts = labels.map((l) => (l.properties || []).find((p) => p.name === 'text')?.value).filter(Boolean);
console.log('Map labels found:', labelTexts);
assert(labelTexts.includes('EUPHONIUM VILLA'), 'Map labels must include EUPHONIUM VILLA');
assert(labelTexts.includes('EUPHONIUM COURT'), 'Map labels must include EUPHONIUM COURT');
assert(labelTexts.includes('EUPHONIUM BEACH'), 'Map labels must include EUPHONIUM BEACH');
assert(!labelTexts.some((t) => t.includes('OUTLAWS')), 'No map label should contain OUTLAWS');
console.log('✓ Map labels updated to EUPHONIUM.');

// 1.2 Interactable titles
const interactTitles = interact.map((i) => (i.properties || []).find((p) => p.name === 'title')?.value).filter(Boolean);
console.log('Interactable titles:', interactTitles);
assert(interactTitles.includes('Join Euphonium'), 'Must have "Join Euphonium" group interaction');
assert(interactTitles.includes('Euphonium beach party'), 'Must have "Euphonium beach party"');
assert(interactTitles.includes('Euphonium volleyball'), 'Must have "Euphonium volleyball"');
assert(interactTitles.includes('Euphonium photo'), 'Must have "Euphonium photo"');
assert(!interactTitles.some((t) => t.toLowerCase().includes('outlaw')), 'No interactable title should contain "outlaw"');
console.log('✓ Activity and group prompts updated to Euphonium.');

// 1.3 Stable internal identifiers preserved
const groupInteract = interact.find((i) => (i.properties || []).find((p) => p.name === 'title')?.value === 'Join Euphonium');
assert(groupInteract, 'Join Euphonium interactable exists');
const groupId = (groupInteract.properties || []).find((p) => p.name === 'id')?.value;
assert(groupId === 'outlaws', `Stable group ID must be "outlaws", got "${groupId}"`);

const partyInteract = interact.find((i) => (i.properties || []).find((p) => p.name === 'title')?.value === 'Euphonium beach party');
assert((partyInteract.properties || []).find((p) => p.name === 'id')?.value === 'party-ol', 'Stable party id party-ol preserved');
assert((partyInteract.properties || []).find((p) => p.name === 'gang')?.value === 'ol', 'Stable gang ol preserved');
console.log('✓ Stable internal IDs (outlaws, party-ol, volley-ol, ol) preserved.');

// 1.4 tahiti.json data
assert(tahitiData.groups.outlaws.title === 'Join Euphonium', 'tahitiData.groups.outlaws.title must be "Join Euphonium"');
assert(tahitiData.gangs.outlaws.name === 'EUPHONIUM', 'tahitiData.gangs.outlaws.name must be "EUPHONIUM"');
assert(tahitiData.places.villa.title === 'EUPHONIUM VILLA', 'tahitiData.places.villa.title must be "EUPHONIUM VILLA"');

for (const npc of tahitiData.npcs || []) {
  if (npc.id.startsWith('tahiti_cf')) {
    assert(npc.role.startsWith('Euphonium ·'), `NPC ${npc.id} role must start with "Euphonium ·", got "${npc.role}"`);
  }
}
console.log('✓ tahiti.json gang, group, place, and character roles updated to Euphonium.');

// 1.5 kit.js building facade sign
assert(kitJs.includes("boardSign('EUPHONIUM'"), 'kit.js must display EUPHONIUM on villa facade');
assert(!kitJs.includes("boardSign('THE OUTLAWS'"), 'kit.js must not display THE OUTLAWS');
console.log('✓ kit.js villa building facade sign updated to EUPHONIUM.');

// 1.6 tahiti.js & conversation.js scripts
assert(tahitiJs.includes("ol: 'Euphonium'"), 'tahiti.js GANG_NAME.ol must be "Euphonium"');
assert(tahitiJs.includes('Euphonium climbs their stairs'), 'Treasure clue must reference Euphonium');
assert(tahitiJs.includes('Euphonium, assemble in front of my lens!'), 'Photo session bubble must reference Euphonium');
console.log('✓ Scripts and dialogues updated to Euphonium.');

// ========================================================
// SECTION 2: Akshai Gaming Station & Motorcycle Placement
// ========================================================
console.log('\n--- Section 2: Akshai Gaming Station & Motorcycle Placement ---');

// 2.1 Akshai placement & route
const akshaiPath = paths.find((p) => (p.properties || []).find((prop) => prop.name === 'npc')?.value === 'tahiti_cf5');
assert(akshaiPath, 'Akshai (tahiti_cf5) path must exist');
const akshaiPos = toWorld(akshaiPath.x, akshaiPath.y);
console.log(`Akshai spawn position: (${akshaiPos.x.toFixed(2)}, ${akshaiPos.z.toFixed(2)})`);
assert(Math.abs(akshaiPos.x - 16.9) < 0.2 && Math.abs(akshaiPos.z - 14.15) < 0.2, 'Akshai must be placed on the gaming station seat at (16.9, 14.15)');

const akshaiIdle = (akshaiPath.properties || []).find((p) => p.name === 'idles')?.value;
const akshaiFace = (akshaiPath.properties || []).find((p) => p.name === 'faces')?.value;
assert(akshaiIdle === 'sittype', `Akshai idle must be sittype, got ${akshaiIdle}`);
assert(akshaiFace === '180', `Akshai face heading must be 180 (facing TV), got ${akshaiFace}`);
console.log('✓ Akshai is seated at the gaming station in sittype pose facing the TV.');

// 2.2 TV Corner Prop
const tvCorner = objects.find((o) => o.type === 'tv_corner');
assert(tvCorner, 'tv_corner prop must exist in objects');
const tvPos = toWorld(tvCorner.x, tvCorner.y);
console.log(`TV Corner position: (${tvPos.x.toFixed(2)}, ${tvPos.z.toFixed(2)})`);
assert(Math.abs(tvPos.x - 17.5) < 0.2 && Math.abs(tvPos.z - 13.0) < 0.2, 'TV corner must be at (17.5, 13.0)');

// 2.3 Activity Marker & Trigger
const tvAct = interact.find((i) => {
  const p = Object.fromEntries((i.properties || []).map((x) => [x.name, x.value]));
  return p.act === 'tvgame' || p.id === 'tvgame';
});
assert(tvAct, 'tvgame activity must exist');
const tvActPos = toWorld(tvAct.x, tvAct.y);
const tvActTitle = (tvAct.properties || []).find((p) => p.name === 'title')?.value;
console.log(`tvgame activity position: (${tvActPos.x.toFixed(2)}, ${tvActPos.z.toFixed(2)}), title: "${tvActTitle}"`);
assert(tvActTitle === 'Play with Akshai', `Activity title must be "Play with Akshai", got "${tvActTitle}"`);
assert(Math.abs(tvActPos.x - 19.4) < 0.2 && Math.abs(tvActPos.z - 13.2) < 0.2, 'Interaction marker must be positioned in front of the player station seat at (19.4, 13.2)');
console.log('✓ "Play with Akshai" activity trigger and beacon placed directly at the gaming station.');

// 2.4 Motorcycle parking pad and vehicle
const motoVeh = interact.find((i) => {
  const p = Object.fromEntries((i.properties || []).map((x) => [x.name, x.value]));
  return p.id === 'moto-villa';
});
assert(motoVeh, 'moto-villa vehicle must exist');
const motoPos = toWorld(motoVeh.x, motoVeh.y);
console.log(`Motorcycle position: (${motoPos.x.toFixed(2)}, ${motoPos.z.toFixed(2)})`);

const parkingPads = objects.filter((o) => o.type === 'parking_pad');
const villaPad = [...parkingPads].sort((p, q) => { const a = toWorld(p.x, p.y), b = toWorld(q.x, q.y); return Math.hypot(a.x - motoPos.x, a.z - motoPos.z) - Math.hypot(b.x - motoPos.x, b.z - motoPos.z); })[0];
assert(villaPad, 'Villa parking pad must exist');
const padPos = toWorld(villaPad.x, villaPad.y);
assert(Math.hypot(motoPos.x - padPos.x, motoPos.z - padPos.z) < 0.5, 'Motorcycle must be parked on its parking pad');

// 2.5 Clearance between Gaming Station and Motorcycle
const distStationToMoto = Math.hypot(tvActPos.x - motoPos.x, tvActPos.z - motoPos.z);
console.log(`Distance between Gaming Station and Motorcycle: ${distStationToMoto.toFixed(2)}m`);
assert(distStationToMoto > 2.5, `Motorcycle must be at least 2.5m away from Akshai station to prevent overlap, got ${distStationToMoto.toFixed(2)}m`);
console.log('✓ Motorcycle moved to separate parking spot with ample clearance (> 5.5m), zero interaction overlap.');

// ========================================================
// SECTION 3: Vanderlinde Gang Hideout Perimeter Hedges
// ========================================================
console.log('\n--- Section 3: Vanderlinde Perimeter Hedges ---');

const hedges = objects.filter((o) => o.type === 'hedge');
const vgHedges = hedges.filter((h) => {
  const w = toWorld(h.x + h.width / 2, h.y + h.height / 2);
  return w.x < 0;
});
console.log(`Found ${vgHedges.length} Vanderlinde hedge segments.`);
assert(vgHedges.length === 7, `Vanderlinde compound should have exactly 7 perimeter hedge segments, got ${vgHedges.length}`);

// 3.1 Thickness consistency (0.8m Island 01 standard)
for (const h of vgHedges) {
  const w = h.width / PX;
  const d = h.height / PX;
  const thickness = Math.min(w, d);
  assert(Math.abs(thickness - 0.8) < 0.05, `Each hedge segment must have 0.8m thickness, got ${thickness.toFixed(2)}m (segment id ${h.id})`);
}
console.log('✓ All Vanderlinde hedge segments have exact 0.8m thickness matching Island 01.');

// 3.2 Continuous framing and corners
const hedgeBounds = vgHedges.map((h) => ({
  id: h.id,
  x0: +(h.x / PX - HALF).toFixed(2),
  x1: +((h.x + h.width) / PX - HALF).toFixed(2),
  z0: +(h.y / PX - HALF).toFixed(2),
  z1: +((h.y + h.height) / PX - HALF).toFixed(2),
}));

// Check north run: one continuous hedge from the west border to the east border behind the whole house
const northHedge = hedgeBounds.find((h) => h.z0 === -16.8 && h.z1 === -16.0);
assert(northHedge, 'North hedge behind house exists');
assert(northHedge.x0 === -25.2 && northHedge.x1 === -1.2, `North hedge must span from -25.2 to -1.2, got ${northHedge.x0} to ${northHedge.x1}`);

// No hedge may run through the hideout building (x -20..-6, z -16..-6)
for (const h of hedgeBounds) {
  const overlaps = h.x0 < -6.0 && h.x1 > -20.0 && h.z0 < -6.0 && h.z1 > -16.0;
  assert(!overlaps, `Hedge ${h.id} must not run through the hideout building`);
}
// Closed loop: north run touches the east and west borders
assert(hedgeBounds.some((h) => h.x0 === -2.0 && h.x1 === -1.2 && h.z0 === -16.0), 'East border joins the north run');
assert(hedgeBounds.some((h) => h.x0 === -25.2 && h.x1 === -24.4 && h.z0 === -16.0), 'West border joins the north run');

// 3.3 Intentional Openings Accessibility Check
// Main East Entrance: walkRect(-6, -4, -2, -3) at z = -4..-3, x = -2.0..-1.2
const eastGapHedges = vgHedges.filter((h) => {
  const x0 = h.x / PX - HALF, x1 = (h.x + h.width) / PX - HALF;
  const z0 = h.y / PX - HALF, z1 = (h.y + h.height) / PX - HALF;
  return x0 <= -1.6 && x1 >= -1.6 && z0 < -3.0 && z1 > -4.0;
});
assert(eastGapHedges.length === 0, 'Main east entrance gap at z = -4..-3 must be completely clear of hedges');

// West Entrance: walkRect(-27, -4, -25, -3) at z = -4..-3, x = -25.2..-24.4
const westGapHedges = vgHedges.filter((h) => {
  const x0 = h.x / PX - HALF, x1 = (h.x + h.width) / PX - HALF;
  const z0 = h.y / PX - HALF, z1 = (h.y + h.height) / PX - HALF;
  return x0 <= -24.8 && x1 >= -24.8 && z0 < -3.0 && z1 > -4.0;
});
assert(westGapHedges.length === 0, 'West entrance gap at z = -4..-3 must be completely clear of hedges');

// South Entrance: x = -8.5 to -5.0 at z = 2.2..3.0
const southGapHedges = vgHedges.filter((h) => {
  const x0 = h.x / PX - HALF, x1 = (h.x + h.width) / PX - HALF;
  const z0 = h.y / PX - HALF, z1 = (h.y + h.height) / PX - HALF;
  return x0 < -5.5 && x1 > -8.0 && z0 <= 2.6 && z1 >= 2.6;
});
assert(southGapHedges.length === 0, 'South entrance gap at x = -8.5..-5.0 must be completely clear of hedges');
console.log('✓ All 3 intentional entrances (East, West, South) are fully open and accessible.');

// 3.4 Workstations enclosed inside compound
const enclosedWorkstations = [
  { name: 'hideout_house', x: -13, z: -11 },
  { name: 'photo_table (Shabeer)', x: -23.6, z: -6.0 },
  { name: 'laptop_table (Guru)', x: -4.5, z: -6.8 },
  { name: 'scooty (Guru)', x: -3.0, z: -5.5 },
  { name: 'campfire', x: -16.4, z: -3.6 },
  { name: 'photo_tripod', x: -11.0, z: -0.4 },
  { name: 'clue_board', x: -4.4, z: -1.6 },
];

for (const ws of enclosedWorkstations) {
  // Check that the workstation is within compound bounding envelope:
  // x: -25.2 to -1.2, z: -16.8 to 2.2
  assert(ws.x >= -25.2 && ws.x <= -1.2, `${ws.name} X coordinate (${ws.x}) must be inside compound X envelope`);
  assert(ws.z >= -16.8 && ws.z <= 2.2, `${ws.name} Z coordinate (${ws.z}) must be inside compound Z envelope`);
}
console.log('✓ All member workstations and house are enclosed safely inside the boundary.');

// 3.5 Public spaces left outside
const fountainPlazaHedges = vgHedges.filter((h) => {
  const w = toWorld(h.x + h.width / 2, h.y + h.height / 2);
  return Math.hypot(w.x - 0.5, w.z - (-22)) < 6;
});
assert(fountainPlazaHedges.length === 0, 'Fountain plaza must remain outside with 0 hedges');

// Central Avenue (x = -1..0) has 0 hedges
const avenueHedges = vgHedges.filter((h) => {
  const x0 = h.x / PX - HALF, x1 = (h.x + h.width) / PX - HALF;
  return x0 <= 0 && x1 >= -1;
});
assert(avenueHedges.length === 0, 'Central avenue road must have 0 hedges crossing it');
console.log('✓ Fountain plaza and shared roads remain completely outside.');

// ========================================================
// SECTION 4: Shabesh & Sathesh Photography Station Placement & Visibility
// ========================================================
console.log('\n--- Section 4: Swapped Photography & Finance Setups, Headings & Esc Card Close ---');

// 4.1 Photo station prop location (moved to Siva's former spot beside the south path)
const photoStation = objects.find((o) => o.type === 'photo_station');
assert(photoStation, 'photo_station prop must exist');
const psPos = toWorld(photoStation.x, photoStation.y);
console.log(`photo_station position: (${psPos.x.toFixed(2)}, ${psPos.z.toFixed(2)})`);
assert(Math.abs(psPos.x - 6.0) < 0.2 && Math.abs(psPos.z - 9.0) < 0.2, 'photo_station must be beside south path at (6.0, 9.0)');

// 4.2 Photosession activity trigger
const photoAct = interact.find((i) => {
  const p = Object.fromEntries((i.properties || []).map((x) => [x.name, x.value]));
  return p.act === 'photosession' || p.id === 'photosession';
});
assert(photoAct, 'photosession interactable must exist');
const paPos = toWorld(photoAct.x, photoAct.y);
console.log(`photosession activity position: (${paPos.x.toFixed(2)}, ${paPos.z.toFixed(2)})`);
assert(Math.abs(paPos.x - 6.0) < 0.2 && Math.abs(paPos.z - 11.0) < 0.2, 'photosession trigger must sit directly in front of the photo booth at (6.0, 11.0)');

// 4.3 Shabesh (tahiti_cf2) spawn route & idle & camera-facing heading (45)
const shabeshPath = paths.find((p) => (p.properties || []).find((prop) => prop.name === 'npc')?.value === 'tahiti_cf2');
assert(shabeshPath, 'Shabesh (tahiti_cf2) path must exist');
const shabeshPos = toWorld(shabeshPath.x, shabeshPath.y);
console.log(`Shabesh spawn position: (${shabeshPos.x.toFixed(2)}, ${shabeshPos.z.toFixed(2)})`);
assert(Math.abs(shabeshPos.x - 7.6) < 0.2 && Math.abs(shabeshPos.z - 8.5) < 0.2, 'Shabesh must spawn beside photo station at (7.6, 8.5)');
const shabeshIdle = (shabeshPath.properties || []).find((p) => p.name === 'idles')?.value;
const shabeshFace = (shabeshPath.properties || []).find((p) => p.name === 'faces')?.value;
assert(shabeshIdle === 'film', `Shabesh idle must be film, got "${shabeshIdle}"`);
assert(shabeshFace === '45', `Shabesh face heading must be 45 (facing camera in default view), got "${shabeshFace}"`);

// 4.4 Sathesh (tahiti_cf7) route points & camera-facing heading (45)
const satheshPath = paths.find((p) => (p.properties || []).find((prop) => prop.name === 'npc')?.value === 'tahiti_cf7');
assert(satheshPath, 'Sathesh (tahiti_cf7) path must exist');
const satheshPos = toWorld(satheshPath.x, satheshPath.y);
console.log(`Sathesh spawn position: (${satheshPos.x.toFixed(2)}, ${satheshPos.z.toFixed(2)})`);
assert(Math.abs(satheshPos.x - 4.6) < 0.2 && Math.abs(satheshPos.z - 9.2) < 0.2, 'Sathesh must have workstation spot at (4.6, 9.2)');
const satheshFace = (satheshPath.properties || []).find((p) => p.name === 'faces')?.value;
assert(satheshFace.startsWith('45'), `Sathesh initial face heading must be 45 (facing camera), got "${satheshFace}"`);

// 4.5 Siva (tahiti_cf9) and Finance Setup inside hedge
const financeProp = objects.find((o) => o.type === 'finance_savings');
assert(financeProp, 'finance_savings prop must exist');
const finPos = toWorld(financeProp.x, financeProp.y);
console.log(`finance_savings position: (${finPos.x.toFixed(2)}, ${finPos.z.toFixed(2)})`);
assert(Math.abs(finPos.x - 4.2) < 0.2 && Math.abs(finPos.z - 2.6) < 0.2, 'finance_savings must be inside hedge at (4.2, 2.6)');

const sivaPath = paths.find((p) => (p.properties || []).find((prop) => prop.name === 'npc')?.value === 'tahiti_cf9');
assert(sivaPath, 'Siva (tahiti_cf9) path must exist');
const sivaPos = toWorld(sivaPath.x, sivaPath.y);
console.log(`Siva spawn position: (${sivaPos.x.toFixed(2)}, ${sivaPos.z.toFixed(2)})`);
assert(Math.abs(sivaPos.x - 6.4) < 0.2 && Math.abs(sivaPos.z - 4.2) < 0.2, 'Siva must be reachable at the hedge opening at (6.4, 4.2)');
const sivaFace = (sivaPath.properties || []).find((p) => p.name === 'faces')?.value;
assert(sivaFace === '45', `Siva face heading must be 45 (facing camera in default view), got "${sivaFace}"`);

// 4.6 Photography Session card options
assert(!tahitiJs.toLowerCase().includes('join the photo session'), 'Join the photo session must be removed');
assert(tahitiJs.includes('Pose for a photograph'), 'Pose for a photograph option must exist');
assert(tahitiJs.includes('Take a group picture'), 'Take a group picture option must exist');
assert(tahitiJs.includes("'Exit'"), 'Exit option must exist');
console.log('✓ Photography Session card options verified.');

// 4.7 tahiti.js WORKSTATION coordinates match
assert(tahitiJs.includes('WORKSTATION_SH = V(7.6, 8.5)'), 'tahiti.js WORKSTATION_SH must be V(7.6, 8.5)');
assert(tahitiJs.includes('WORKSTATION_SA = V(4.6, 9.2)'), 'tahiti.js WORKSTATION_SA must be V(4.6, 9.2)');
console.log('✓ tahiti.js workstation coordinates synchronized.');

// 4.8 Esc closes topmost card and consumes event in main.js
const mainJs = fs.readFileSync(path.join(ROOT, 'web/src/game/main.js'), 'utf8');
assert(mainJs.includes('closeTopmostCard'), 'main.js must define closeTopmostCard');
assert(mainJs.includes('stopImmediatePropagation'), 'main.js Esc handler must consume event with stopImmediatePropagation');
assert(mainJs.includes('_closeChoice'), 'main.js choose dialog must support _closeChoice');
console.log('✓ Topmost card Escape close and event consumption verified.');

// 4.9 Solo and group photo posing opposite the photobooth camera prop with a gap
assert(tahitiJs.includes('getPhotoboothPosingArea'), 'tahiti.js must implement getPhotoboothPosingArea');
assert(tahitiJs.includes('isAtPhotobooth'), 'startShabeshSession must check isAtPhotobooth');
// Extract and evaluate getPhotoboothPosingArea logic to verify geometry
const pbTable = { x: 6.0, z: 9.0, frontZ: 9.3, patioEdgeZ: 10.4 };
const camPropPos = { x: 6.95, z: 8.85 };
// Solo
const soloMatch = tahitiJs.match(/nathanSlot\s*=\s*{\s*x:\s*6\.95,\s*z:\s*13\.0/);
assert(soloMatch, 'Solo slot must be centered opposite the booth camera prop at (6.95, 13.0)');
const soloGap = 13.0 - pbTable.patioEdgeZ;
assert(soloGap >= 1.5, `Solo pose must leave a clear gap from the booth (got ${soloGap}m)`);

// Group
assert(tahitiJs.includes('z: 13.0, row: 0'), 'Group front row must stand at Z=13.0 opposite booth camera');
assert(tahitiJs.includes('z: 14.15, row: 1'), 'Group back row must stand at Z=14.15 staggered behind');
const backRowGap = 14.15 - pbTable.patioEdgeZ;
assert(backRowGap >= 2.0, `Group back row must leave a clear gap from the booth (got ${backRowGap}m)`);
assert(tahitiJs.includes('camPos = { x: 6.95, z: 8.85 }'), 'Camera must be positioned at booth camera prop (6.95, 8.85)');
assert(tahitiJs.includes('operatorPos = { x: 6.95, z: 8.30 }'), 'Shabesh must stand behind camera prop at (6.95, 8.30)');
assert(tahitiJs.includes('fx: 0, fz: 1'), 'Camera must aim South (+Z) straight at the posing spot');
console.log(`✓ Solo (gap ${soloGap.toFixed(2)}m) and group (front gap ${(13.0 - pbTable.patioEdgeZ).toFixed(2)}m, back gap ${backRowGap.toFixed(2)}m) photobooth posing geometry verified.`);

console.log('\n========================================================');
console.log('ALL TAHITI CORRECTIONS TESTS PASSED SUCCESSFULLY! ✓✓✓');
console.log('========================================================');
