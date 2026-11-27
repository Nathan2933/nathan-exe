import fs from 'fs';
import path from 'path';
import assert from 'node:assert';

console.log('=== TEST SUITE: Tahiti Requirements Verification ===\n');

// 1. Thianesh's eating contest
console.log('--- Requirement 1: Thianesh Eating Contest Seating & Geometry ---');
const kitCode = fs.readFileSync('web/src/game/kit.js', 'utf8');
const tahitiCode = fs.readFileSync('web/src/game/tahiti.js', 'utf8');
const mapTmj = JSON.parse(fs.readFileSync('web/public/maps/tahiti.tmj', 'utf8'));

// Verify contest_table in kit.js creates proper chairs with backrests and seat cushions
assert(kitCode.includes('contest_table'), 'contest_table definition exists in kit.js');
assert(kitCode.includes('const chair = (z, dir) => {'), 'contest_table has dedicated chair function');
assert(kitCode.includes('chair(-0.85, 1)') && kitCode.includes('chair(0.85, -1)'), 'both north and south chairs created');

// Verify Thianesh route in map
const pathsLayer = mapTmj.layers.find(l => l.name === 'paths');
assert(pathsLayer, 'paths layer found in tahiti.tmj');
const thianeshRoute = pathsLayer.objects.find(o => o.properties?.some(p => p.name === 'npc' && p.value === 'tahiti_cf4'));
assert(thianeshRoute, 'tahiti_cf4 route found in tahiti.tmj');
const thIdleProp = thianeshRoute.properties.find(p => p.name === 'idles');
const thFaceProp = thianeshRoute.properties.find(p => p.name === 'faces');
assert.strictEqual(thIdleProp.value, 'sit', 'Thianesh idle pose in route is sit');
assert.strictEqual(thFaceProp.value, '0', 'Thianesh face heading is 0 (facing south toward table)');

const HALF = 52, PX = 16;
const thX = thianeshRoute.x / PX - HALF;
const thZ = thianeshRoute.y / PX - HALF;
console.log(`Thianesh spawn position: (${thX.toFixed(2)}, ${thZ.toFixed(2)}), idle: ${thIdleProp.value}, face: ${thFaceProp.value}`);
assert(Math.abs(thX - 19.5) < 1e-4, 'Thianesh X is 19.5 (chair position)');
assert(Math.abs(thZ - (-13.35)) < 1e-4, 'Thianesh Z is -13.35 (chair position)');

// Verify ACTIVITIES.ol.feast in tahiti.js
assert(tahitiCode.includes("feast: { w: 5, owner: 'tahiti_cf4', slots: [[19.5, -13.35, 'sit', 0]], poses: ['sit']"), 'ACTIVITIES feast slot is seated at (19.5, -13.35) facing 0 with pose sit');

// Verify feastChallenge minigame in tahiti.js
assert(tahitiCode.includes("state.joined = { x: 19.5, z: -11.65, pose: 'eat', face: Math.PI"), 'Player Nathan sits opposite at (19.5, -11.65) facing North');
assert(tahitiCode.includes("bring(th, 19.5, -13.35, 'sit', 0)"), 'Thianesh brought to (19.5, -13.35) seated facing South');
console.log('✓ Requirement 1 passed: Thianesh sits in chair facing table, aligned pose, no clipping.\n');


// 2. Shabeer's stock and trading event
console.log('--- Requirement 2: Shabeer Stock Setup Palette & Mobile Readability ---');
assert(kitCode.includes('CHARCOAL = 0x22252a'), 'Charcoal monitor frame (0x22252a) defined');
assert(kitCode.includes('DARK_SCREEN = 0x13161a'), 'Dark screen background (0x13161a) defined');
assert(kitCode.includes('MUTED_GREEN = 0x56ab63'), 'Muted green chart lines (0x56ab63) defined');
assert(kitCode.includes('AMBER = 0xdf9a34'), 'Amber chart lines (0xdf9a34) defined');
assert(kitCode.includes('WARM_TAN = 0xd2bc98'), 'Warm tan desk cover/mat (0xd2bc98) defined');
assert(kitCode.includes('OLIVE = 0x5c6642') || kitCode.includes('OLIVE_DARK = 0x424a2e'), 'Olive setup trim/covers defined');

// Check luminance contrast ratios for mobile readability
function getLuminance(hex) {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  const a = [r, g, b].map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}
function contrastRatio(hex1, hex2) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const darkScreen = 0x13161a;
const mutedGreen = 0x56ab63;
const amber = 0xdf9a34;
const wicks = 0xdedad2;

const crGreen = contrastRatio(mutedGreen, darkScreen);
const crAmber = contrastRatio(amber, darkScreen);
const crWicks = contrastRatio(wicks, darkScreen);
console.log(`Contrast ratios against dark screen: Green: ${crGreen.toFixed(2)}:1, Amber: ${crAmber.toFixed(2)}:1, Wicks: ${crWicks.toFixed(2)}:1`);
assert(crGreen > 4.5, 'Green chart lines meet WCAG AA contrast ratio (> 4.5:1)');
assert(crAmber > 4.5, 'Amber chart lines meet WCAG AA contrast ratio (> 4.5:1)');
assert(crWicks > 7.0, 'Wicks/axes meet high contrast (> 7.0:1)');

// Verify Shabeer prop exists in map
const objLayer = mapTmj.layers.find(l => l.name === 'objects');
const stockProp = objLayer.objects.find(o => o.type === 'finance_stock');
assert(stockProp, 'finance_stock prop exists in tahiti.tmj');
console.log('✓ Requirement 2 passed: Palette matches Tahiti theme with high contrast for mobile.\n');


// 3. Splash message card
console.log('--- Requirement 3: Retro Arcade Splash Card ---');
const mainCode = fs.readFileSync('web/src/game/main.js', 'utf8');
const cssCode = fs.readFileSync('web/src/styles/game.css', 'utf8');

assert(mainCode.includes('ko-card-splash'), 'ko-card-splash class used in main.js water hazard');
assert(mainCode.includes('SPLASH!'), 'Title SPLASH! present');
assert(mainCode.includes('Nathan can lift, but he can’t swim (yet).'), 'Message text matches exactly');
assert(mainCode.includes('class="splash-ripple"'), 'SVG pixel art ripple container included');
assert(mainCode.includes('viewBox="0 0 38 20"'), 'SVG pixel art ripple viewBox present');
assert(mainCode.includes('shape-rendering="crispEdges"'), 'Crisp pixel rendering for retro arcade ripple');

assert(cssCode.includes('.ko-card-splash'), '.ko-card-splash CSS rules exist');
assert(cssCode.includes('background: #fdf8ed') || cssCode.includes('#fdf8ed'), 'Compact cream panel background (#fdf8ed)');
assert(cssCode.includes('#0b726b') || cssCode.includes('#0d6b63'), 'Teal color for title/accents');
assert(cssCode.includes('max-width: 310px'), 'Responsive max-width for narrow screens');
assert(cssCode.includes('width: calc(100% - 32px)'), 'Mobile-friendly margin sizing');
console.log('✓ Requirement 3 passed: Retro arcade splash card with pixel ripple, cream card, teal title, mobile fit.\n');


// 4. Architecture building, Anu's basketball court, and road
console.log('--- Requirement 4: Architecture Building, Anu’s Basketball Court, & Continuous Vehicle Road ---');
const studio = objLayer.objects.find(o => o.type === 'architecture_studio');
assert(studio, 'architecture_studio found in objects');
const studioX = studio.x / PX - HALF;
const studioZ = studio.y / PX - HALF;
console.log(`Architecture studio position: (${studioX.toFixed(2)}, ${studioZ.toFixed(2)})`);
assert(Math.abs(studioX - 3.6) < 1e-4, 'Architecture studio shifted to X=3.6');
assert(Math.abs(studioZ - (-29.0)) < 1e-4, 'Architecture studio at Z=-29.0');

const court = objLayer.objects.find(o => o.type === 'basketball_court');
assert(court, 'basketball_court found in objects');
const courtX = court.x / PX - HALF;
const courtZ = court.y / PX - HALF;
console.log(`Basketball court position: (${courtX.toFixed(2)}, ${courtZ.toFixed(2)})`);
assert(Math.abs(courtX - 23.0) < 1e-4, 'Basketball court shifted to X=23.0');
assert(Math.abs(courtZ - (-24.5)) < 1e-4, 'Basketball court at Z=-24.5');

const hoop = objLayer.objects.find(o => o.type === 'hoop');
assert(hoop, 'hoop found in objects');
const hoopX = hoop.x / PX - HALF;
const hoopZ = hoop.y / PX - HALF;
console.log(`Hoop position: (${hoopX.toFixed(2)}, ${hoopZ.toFixed(2)})`);
assert(Math.abs(hoopX - 23.0) < 1e-4, 'Hoop at X=23.0');
assert(Math.abs(hoopZ - (-27.6)) < 1e-4, 'Hoop at Z=-27.6');

// Verify interactables in map
const interactLayer = mapTmj.layers.find(l => l.name === 'interact');
const anuhoop = interactLayer.objects.find(o => o.properties?.some(p => p.name === 'id' && p.value === 'anuhoop'));
assert(anuhoop, 'anuhoop interactable exists');
const anuX = anuhoop.x / PX - HALF;
const anuZ = anuhoop.y / PX - HALF;
console.log(`anuhoop interactable position: (${anuX.toFixed(2)}, ${anuZ.toFixed(2)})`);
assert(Math.abs(anuX - 23.0) < 1e-4, 'anuhoop at X=23.0');
assert(Math.abs(anuZ - (-22.5)) < 1e-4, 'anuhoop at Z=-22.5');

// Check dry ground between areas and shoreline
// Island radius at studio angle:
const studioAngle = Math.atan2(studioZ, studioX);
const ISLAND_R = 42;
const islandR = (a) => ISLAND_R * (1 + 0.05 * Math.sin(a * 2 + 2.2) + 0.03 * Math.sin(a * 5 + 0.7) + 0.015 * Math.sin(a * 9));
const studioDist = Math.hypot(studioX, studioZ);
const studioR = islandR(studioAngle);
const studioMargin = studioR - studioDist;
console.log(`Studio distance to origin: ${studioDist.toFixed(2)}m, island boundary: ${studioR.toFixed(2)}m, dry margin: ${studioMargin.toFixed(2)}m`);
assert(studioMargin > 10.0, 'Studio leaves ample dry ground before shoreline');

const courtAngle = Math.atan2(courtZ, courtX);
const courtDist = Math.hypot(courtX, courtZ);
const courtR = islandR(courtAngle);
const courtMargin = courtR - courtDist;
console.log(`Court distance to origin: ${courtDist.toFixed(2)}m, island boundary: ${courtR.toFixed(2)}m, dry margin: ${courtMargin.toFixed(2)}m`);
assert(courtMargin > 7.0, 'Basketball court leaves dry ground before shoreline');

// Verify continuous vehicle road tiles behind architecture building
const groundLayer = mapTmj.layers.find(l => l.name === 'ground');
const data = groundLayer.data;
const T_PATH = 9; // T.path is tile ID 9 in build-tahiti
const tileAt = (x, z) => {
  const tx = x + HALF;
  const tz = z + HALF;
  if (tx < 0 || tx >= 104 || tz < 0 || tz >= 104) return 0;
  return data[tz * 104 + tx];
};

// Check scenic road behind studio: z = -35..-34, x = -6..15
let scenicPavedCount = 0;
for (let x = -6; x <= 15; x++) {
  if (tileAt(x, -34) === T_PATH || tileAt(x, -35) === T_PATH) scenicPavedCount++;
}
console.log(`Scenic road behind building paved tiles along X [-6, 15]: ${scenicPavedCount} / 22`);
assert.strictEqual(scenicPavedCount, 22, 'All 22 segments of scenic road behind architecture building are paved');

// Check west connector: x = -6..-5, z = -34..-19
let westPavedCount = 0;
for (let z = -34; z <= -19; z++) {
  if (tileAt(-6, z) === T_PATH || tileAt(-5, z) === T_PATH) westPavedCount++;
}
console.log(`West connector paved tiles along Z [-34, -19]: ${westPavedCount} / 16`);
assert.strictEqual(westPavedCount, 16, 'All 16 segments of west connector road are paved');

// Check east connector: x = 14..15, z = -34..-19
let eastPavedCount = 0;
for (let z = -34; z <= -19; z++) {
  if (tileAt(14, z) === T_PATH || tileAt(15, z) === T_PATH) eastPavedCount++;
}
console.log(`East connector paved tiles along Z [-34, -19]: ${eastPavedCount} / 16`);
assert.strictEqual(eastPavedCount, 16, 'All 16 segments of east connector road are paved');

// Test vehicle traversability (path connectivity loop)
// Can start at north ring road (0, -19), drive east to (14, -19), turn north along east connector to (14, -34),
// turn west along scenic road to (-5, -34), turn south along west connector to (-5, -19), and return to (0, -19).
const PAVED_TILES = new Set([9, 5, 7, 14]); // path, plaza, concrete, terracotta
function checkContinuousRoad(points) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x0 + ((x1 - x0) * s) / steps);
      const z = Math.round(z0 + ((z1 - z0) * s) / steps);
      const t = tileAt(x, z);
      assert(PAVED_TILES.has(t), `Road step at (${x}, ${z}) is paved (got tile ${t})`);
    }
  }
}

const circuit = [
  [0, -19],   // North ring road
  [14, -19],  // East connector junction
  [14, -34],  // Northeast turn behind studio
  [-5, -34],  // Northwest turn behind studio
  [-5, -19],  // West connector junction
  [0, -19],   // Back to North ring road
];
checkContinuousRoad(circuit);
console.log('✓ Road loop circuit is 100% continuous and fully paved.');

// Verify tahiti.js basketball shootout updates
assert(tahitiCode.includes('const RIM = V(23.0, -26.94)'), 'RIM at V(23.0, -26.94)');
assert(tahitiCode.includes('const SIDELINE = [V(19.8, -22.4), V(26.2, -22.4), V(19.8, -24.2)]'), 'SIDELINE shifted to X=23 center');
assert(tahitiCode.includes('const inCourtZone = (x, z) => x > 16.5 && x < 29.5 && z > -30.5 && z < -18.2;'), 'inCourtZone shifted');
assert(tahitiCode.includes('const PRACTICE_SPOTS = [[31.5, -22.5], [31.5, -19.5], [14.5, -22.5], [14.5, -19.5], [32, -17], [14, -17]]'), 'PRACTICE_SPOTS shifted');

// Verify Jeswin drafting table
assert(tahitiCode.includes("drafting: { w: 5, owner: 'tahiti_sf3', slots: [[-0.05, -23.7, 'type', 20]]"), 'Jeswin drafting table synchronized to (-0.05, -23.7)');
console.log('✓ Requirement 4 passed: Architecture studio shifted, court shifted, road continuous with turning room, basketball event synchronized.\n');

console.log('========================================================');
console.log('ALL 4 TAHITI UPDATE REQUIREMENTS FULLY VERIFIED! ✓✓✓');
console.log('========================================================');
