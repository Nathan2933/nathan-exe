import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mapPath = path.join(ROOT, 'web/public/maps/tahiti.tmj');
assert(fs.existsSync(mapPath), 'tahiti.tmj must exist');

const tmj = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const N = tmj.width;
const HALF = N / 2;
const PX = tmj.tilewidth;

const toWorld = (px, py) => ({ x: px / PX - HALF, z: py / PX - HALF });
const ground = tmj.layers.find((l) => l.name === 'ground').data;
const objects = tmj.layers.find((l) => l.name === 'objects').objects;
const interact = tmj.layers.find((l) => l.name === 'interact').objects;

const TYPES = ['grass', 'road', 'road_line', 'sidewalk', 'plaza', 'rubber', 'concrete', 'snow', 'path', 'water', 'sand', 'flowerbed', 'lawn', 'terracotta', 'boardwalk', 'grass_edge'];
const T = Object.fromEntries(TYPES.map((t, i) => [t, i + 1]));

const tileAt = (x, z) => {
  const ix = Math.floor(x + HALF);
  const iz = Math.floor(z + HALF);
  if (ix < 0 || ix >= N || iz < 0 || iz >= N) return null;
  return ground[iz * N + ix];
};

console.log('--- Test 1: Hedge Asset and Reuse from Island 01 ---');
const hedges = objects.filter((o) => o.type === 'hedge');
console.log(`Found ${hedges.length} hedge segments.`);
assert(hedges.length >= 10, 'Must have at least 10 perimeter hedge segments');
for (const h of hedges) {
  assert(h.width > 0 && h.height > 0, `Hedge id ${h.id} must be an area rectangle with width and height`);
  const w = h.width / PX;
  const d = h.height / PX;
  assert(Math.min(w, d) >= 0.6 && Math.min(w, d) <= 1.2, `Hedge thickness should match Island 01 standard (~0.8-1m), got ${Math.min(w, d)}`);
}
console.log('✓ All hedges are valid Island 01 rectangle area objects with correct thickness.');

console.log('\n--- Test 2: Separate Perimeters for Both Compounds ---');
const vgHedges = hedges.filter((h) => {
  const w = toWorld(h.x + h.width / 2, h.y + h.height / 2);
  return w.x < 0;
});
const olHedges = hedges.filter((h) => {
  const w = toWorld(h.x + h.width / 2, h.y + h.height / 2);
  return w.x > 0;
});
console.log(`Vanderlinde compound hedges: ${vgHedges.length}, Outlaws Villa hedges: ${olHedges.length}`);
assert(vgHedges.length >= 5, 'Vanderlinde compound must have separate perimeter hedges');
assert(olHedges.length >= 5, 'Outlaws Villa compound must have separate perimeter hedges');
console.log('✓ Both compounds have dedicated separate perimeter hedges.');

console.log('\n--- Test 3: Wide Entrance Gaps and Accessibility ---');
// Vanderlinde entrance gap: around x = -4.5, z = -3.5 (connecting path walkRect(-6, -4, -2, -3))
let vgGapOpen = true;
for (let z = -4; z <= -3; z += 0.5) {
  for (const h of vgHedges) {
    const x0 = h.x / PX - HALF, x1 = (h.x + h.width) / PX - HALF;
    const z0 = h.y / PX - HALF, z1 = (h.y + h.height) / PX - HALF;
    if (x0 <= -3.5 && x1 >= -3.5 && z0 <= z && z1 >= z) {
      vgGapOpen = false;
    }
  }
}
assert(vgGapOpen, 'Vanderlinde entrance gap connected to the path must be open');

// Outlaws Villa south entrance gap: around x = 9.5, z = 5.8
let olSouthGapOpen = true;
for (let x = 8.0; x <= 11.0; x += 0.5) {
  for (const h of olHedges) {
    const x0 = h.x / PX - HALF, x1 = (h.x + h.width) / PX - HALF;
    const z0 = h.y / PX - HALF, z1 = (h.y + h.height) / PX - HALF;
    if (x0 <= x && x1 >= x && z0 <= 5.8 && z1 >= 5.8) {
      olSouthGapOpen = false;
    }
  }
}
assert(olSouthGapOpen, 'Outlaws Villa south entrance gap must be open');

// Outlaws Villa deck stairs: x = 17..20, z = 5.8
let deckStairsOpen = true;
for (let x = 17.0; x <= 19.5; x += 0.5) {
  for (const h of olHedges) {
    const x0 = h.x / PX - HALF, x1 = (h.x + h.width) / PX - HALF;
    const z0 = h.y / PX - HALF, z1 = (h.y + h.height) / PX - HALF;
    if (x0 <= x && x1 >= x && z0 <= 5.8 && z1 >= 5.8) {
      deckStairsOpen = false;
    }
  }
}
assert(deckStairsOpen, 'Outlaws Villa deck stairs landing must be unobstructed');
console.log('✓ All entrance gaps and stairs are wide and unobstructed.');

console.log('\n--- Test 4: Continuous Green Grass Inside Both Compounds ---');
// Check Vanderlinde courtyard: inside x = -19..-8, z = -5..0
for (let x = -18; x <= -8; x++) {
  for (let z = -5; z <= 0; z++) {
    const t = tileAt(x, z);
    assert(t !== T.plaza, `Vanderlinde courtyard at (${x}, ${z}) must not be plaza sand`);
    assert(t !== T.lawn, `Vanderlinde courtyard at (${x}, ${z}) must not be dark green lawn strip`);
  }
}
// Check Outlaws photo/food yard: inside x = 12..20, z = -15..-10
for (let x = 12; x <= 20; x++) {
  for (let z = -15; z <= -10; z++) {
    const t = tileAt(x, z);
    assert(t !== T.plaza, `Outlaws photo yard at (${x}, ${z}) must not be plaza sand`);
    assert(t !== T.lawn, `Outlaws photo yard at (${x}, ${z}) must not be dark green lawn strip`);
  }
}
// Check Akshay's TV corner: x = 4..7, z = -6..-2
for (let x = 4; x <= 7; x++) {
  for (let z = -6; z <= -2; z++) {
    const t = tileAt(x, z);
    assert(t !== T.plaza, `Akshay gaming area at (${x}, ${z}) must not be plaza sand`);
    assert(t !== T.lawn, `Akshay gaming area at (${x}, ${z}) must not be dark green lawn strip`);
  }
}
// Ensure no T.lawn exists on island
const lawnCount = ground.filter((t) => t === T.lawn).length;
assert(lawnCount === 0, `There must be 0 T.lawn tiles on Tahiti, found ${lawnCount}`);
console.log('✓ Ground inside both compounds is continuous green grass with zero redundant plaza or lawn strips.');

console.log('\n--- Test 5: Open Public Spaces (Fountain, Benches, Basketball Court) ---');
// Fountain area at x = 0.5, z = -22
const fountainHedges = hedges.filter((h) => {
  const w = toWorld(h.x + h.width / 2, h.y + h.height / 2);
  return Math.hypot(w.x - 0.5, w.z - (-22)) < 6;
});
assert(fountainHedges.length === 0, `Fountain plaza must have 0 hedges, found ${fountainHedges.length}`);

// Basketball court at x = 14..22, z = -28..-21
const courtHedges = hedges.filter((h) => {
  const w = toWorld(h.x + h.width / 2, h.y + h.height / 2);
  return w.x >= 13 && w.x <= 23 && w.z >= -29 && w.z <= -20;
});
assert(courtHedges.length === 0, `Basketball court must have 0 hedges, found ${courtHedges.length}`);
console.log('✓ Fountain plaza and basketball court remain completely open without hedges.');

console.log('\n--- Test 6: Preserved Props and Interactables ---');
const requiredProps = ['hideout_house', 'outlaws_villa', 'fountain', 'hoop', 'campfire', 'tv_corner', 'contest_table', 'photo_station', 'photo_tripod'];
for (const p of requiredProps) {
  assert(objects.some((o) => o.type === p), `Map must preserve prop ${p}`);
}
const requiredActs = ['anuhoop', 'foodcontest', 'tvgame', 'photosession', 'dance', 'party-vg', 'party-ol'];
for (const a of requiredActs) {
  assert(interact.some((o) => {
    const props = Object.fromEntries((o.properties || []).map((x) => [x.name, x.value]));
    return props.id === a || props.act === a;
  }), `Map must preserve interaction ${a}`);
}
console.log('✓ All buildings, workstations, furniture, and interactions are preserved.');

console.log('\n========================================');
console.log('ALL TAHITI LANDSCAPING TESTS PASSED! ✓');
console.log('========================================');
