#!/usr/bin/env node
// Generates the STARTING Tiled map for NATHAN.EXE:
//   web/public/maps/town.tmj   (open this in Tiled to edit the town)
//   web/public/maps/ground.tsj + ground.png (ground tileset)
//
// After the first run, edit town.tmj in Tiled directly. Re-running this script
// OVERWRITES town.tmj (a timestamped backup is kept), so only re-run it if you
// want to reset the layout. Usage:  node tools/build-map.mjs [--force]

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'web/public/maps');
const N = 96;            // tiles per side, 1 tile = 1 metre
const HALF = N / 2;
const PX = 16;           // Tiled pixels per tile
const ISLAND_R = 44;

// ---------------- Ground tileset ----------------
// Order = tile id (gid - 1). `walk: false` tiles block movement.
export const GROUND = [
  { type: 'grass', color: '#a6cf72' },
  { type: 'road', color: '#8b8fae' },
  { type: 'road_line', color: '#8b8fae', mark: '#fff6dc' },
  { type: 'sidewalk', color: '#f1e2c4' },
  { type: 'plaza', color: '#fbe8c4' },
  { type: 'rubber', color: '#7f8db0' },
  { type: 'concrete', color: '#dcd8d0' },
  { type: 'snow', color: '#f4f8ff' },
  { type: 'path', color: '#efcf8f' },
  { type: 'water', color: '#3fb9d6', walk: false },
  { type: 'sand', color: '#fbe2b0' },
  { type: 'flowerbed', color: '#9a6a45', walk: false },
  { type: 'lawn', color: '#93c86a' },
  { type: 'terracotta', color: '#d9ccb2' },
  { type: 'boardwalk', color: '#c98b55' },
];
const T = Object.fromEntries(GROUND.map((g, i) => [g.type, i + 1]));

function writeTileset() {
  const w = GROUND.length * PX, h = PX;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const t = GROUND[Math.floor(x / PX)];
      const lx = x % PX;
      let hex = t.color;
      if (t.mark && y >= 7 && y <= 8 && lx >= 3 && lx <= 12) hex = t.mark;
      if ((lx === 0 || y === 0) && !t.mark) hex = shade(hex, -10); // subtle grid so tiles read in Tiled
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  fs.writeFileSync(path.join(OUT, 'ground.png'), png(w, h, raw));
  const tsj = {
    type: 'tileset', version: '1.10', tiledversion: '1.10.2', name: 'ground',
    tilewidth: PX, tileheight: PX, tilecount: GROUND.length, columns: GROUND.length,
    image: 'ground.png', imagewidth: w, imageheight: h, margin: 0, spacing: 0,
    tiles: GROUND.map((g, id) => ({
      id, type: g.type,
      properties: [
        { name: 'color', type: 'color', value: '#ff' + g.color.slice(1) },
        { name: 'walkable', type: 'bool', value: g.walk !== false },
      ],
    })),
  };
  fs.writeFileSync(path.join(OUT, 'ground.tsj'), JSON.stringify(tsj, null, 1));
}

// ---------------- Painting helpers (world metres, origin = plaza centre) ----------------
const ground = new Array(N * N).fill(0);
const idx = (x, z) => (z + HALF) * N + (x + HALF);
const inside = (x, z) => x >= -HALF && x < HALF && z >= -HALF && z < HALF;
const get = (x, z) => (inside(x, z) ? ground[idx(x, z)] : 0);
const set = (x, z, t) => { if (inside(x, z) && ground[idx(x, z)] !== 0) ground[idx(x, z)] = t; };
const rect = (x0, z0, x1, z1, t) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, z, t); };
const disc = (cx, cz, r, t, rz = r) => {
  for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      if (((x + 0.5 - cx) / r) ** 2 + ((z + 0.5 - cz) / rz) ** 2 <= 1) set(x, z, t);
};
const islandR = (a) => ISLAND_R * (1 + 0.035 * Math.sin(a * 3 + 0.4) + 0.02 * Math.sin(a * 5 + 1) + 0.012 * Math.sin(a * 11));

// Island base: sand rim, grass interior
for (let z = -HALF; z < HALF; z++) {
  for (let x = -HALF; x < HALF; x++) {
    const d = Math.hypot(x + 0.5, z + 0.5), r = islandR(Math.atan2(z + 0.5, x + 0.5));
    if (d < r) ground[idx(x, z)] = d > r - 4 ? T.sand : T.grass;
  }
}

// Roads: two avenues + a deliberately irregular ring (west/north sit further out).
const ROADS = [
  [-2, -30, 2, 30],    // north–south avenue (5 m)
  [-30, -2, 25, 2],    // east–west avenue (ends at the Memory Line crossing)
  [-27, -25, -24, 22], // ring: west
  [-27, -25, 21, -22], // ring: north
  [19, -25, 22, 24],   // ring: east
  [-27, 21, 22, 24],   // ring: south
];
for (const [x0, z0, x1, z1] of ROADS) rect(x0, z0, x1, z1, T.road);
// Centre dashes on the avenues
for (let z = -30; z <= 30; z++) if (Math.abs(z) > 9 && z % 3 !== 0) set(0, z, T.road_line);
for (let x = -30; x <= 25; x++) if (Math.abs(x) > 9 && x % 3 !== 0) set(x, 0, T.road_line);

// District grounds (before sidewalks so sidewalks wrap them cleanly)
rect(-21, -19, -4, -4, T.lawn);           // Iron Yard lot
rect(-20, -19, -9, -13, T.concrete);      //   gym slab
rect(-12, -11, -5, -6, T.rubber);         //   outdoor training floor (smaller, calmer)
rect(-9, -4, -8, -4, T.path);             //   gate
rect(4, -19, 16, -4, T.lawn);             // City Park
rect(9, -19, 10, -4, T.path); rect(4, -12, 16, -11, T.path);
disc(9.5, -11.5, 3.2, T.plaza);
rect(-21, 4, -4, 18, T.lawn);             // Signal Tower lot
rect(4, 4, 16, 18, T.concrete);           // Garage lot
rect(-14, -43, 13, -29, T.snow);          // Winter Campus
rect(-2, -33, 2, -29, T.concrete);        //   cleared entrance walk
rect(-13, -31, -4, -29, T.concrete);      //   station forecourt
rect(26, -13, 42, 13, T.lawn);            // Monsoon Campus grounds
rect(26, -1, 40, 1, T.terracotta);        //   main red-earth walk from the arch
rect(29, -5, 41, -3, T.terracotta);       //   veranda forecourt
disc(34, 3.6, 3.3, T.terracotta);         //   small paved court
rect(29, 1, 31, 8, T.terracotta);         //   path to the tea stall
disc(-35.5, -2, 6, T.water, 7);             // Lake
for (let a = 0; a < Math.PI * 2; a += 0.05) set(Math.round(-35 + Math.cos(a) * 7.4), Math.round(-2 + Math.sin(a) * 8.4), T.path);
rect(-30, -1, -28, 1, T.path);
rect(-1, 30, 1, 34, T.path);              // Lighthouse path + pier
rect(0, 35, 1, 44, T.boardwalk);
rect(1, 37, 3, 39, T.path);              //   path to the lighthouse door
disc(0, 0, 8.5, T.plaza);                 // Central plaza (paints over the avenue ends)
disc(0, 0, 9.5, T.plaza);

// Sidewalks: any walkable non-road tile touching a road becomes pavement
const isRoad = (t) => t === T.road || t === T.road_line;
const snapshot = ground.slice();
for (let z = -HALF; z < HALF; z++) for (let x = -HALF; x < HALF; x++) {
  const t = snapshot[idx(x, z)];
  if (!t || isRoad(t) || t === T.plaza || t === T.water) continue;
  let near = false;
  for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) if (isRoad(inside(x + dx, z + dz) ? snapshot[idx(x + dx, z + dz)] : 0)) { near = true; break; }
  if (near) ground[idx(x, z)] = T.sidewalk;
}

// ---------------- Objects ----------------
let nextId = 1;
const toPx = (v) => (v + HALF) * PX;
const props = (o) => Object.entries(o).map(([name, value]) => ({
  name, value,
  type: typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float') : typeof value === 'boolean' ? 'bool' : 'string',
}));
const point = (type, x, z, p = {}, name = '') => ({ id: nextId++, name, type, x: toPx(x), y: toPx(z), point: true, rotation: 0, visible: true, width: 0, height: 0, properties: props(p) });
const area = (type, x0, z0, x1, z1, p = {}, name = '') => ({ id: nextId++, name, type, x: toPx(x0), y: toPx(z0), width: (x1 - x0) * PX, height: (z1 - z0) * PX, rotation: 0, visible: true, properties: props(p) });
const line = (type, pts, p = {}, name = '') => ({ id: nextId++, name, type, x: toPx(pts[0][0]), y: toPx(pts[0][1]), polyline: pts.map(([x, z]) => ({ x: (x - pts[0][0]) * PX, y: (z - pts[0][1]) * PX })), rotation: 0, visible: true, width: 0, height: 0, properties: props(p) });

const objects = [], interact = [], collision = [], labels = [], paths = [], spawn = [];
const O = (piece, x, z, p = {}) => objects.push(point(piece, x, z, p));
const hedge = (x0, z0, x1, z1) => objects.push(area('hedge', x0, z0, x1, z1));

// --- Plaza ---
// Avenue axes stay clear; furniture sits in tidy clusters on the diagonals
// (bench facing the monument → planter → lamp), so the square reads calm.
O('crt_monument', 0, 0);
for (let i = 0; i < 4; i++) {
  const a = Math.PI / 4 + i * Math.PI / 2, cx = Math.cos(a), sz = Math.sin(a);
  O('bench', +(cx * 5.6).toFixed(2), +(sz * 5.6).toFixed(2), { rot: Math.round((a * 180) / Math.PI + 90) });
  if (i !== 1) O('planter', +(cx * 7.2).toFixed(2), +(sz * 7.2).toFixed(2));
  O('lamp', +(cx * 8.7).toFixed(2), +(sz * 8.7).toFixed(2));
}
O('notice_board', 6.4, 2.7, { rot: 0 });
O('bin', 3.4, 8.6);
spawn.push(point('spawn', 1.2, 6.2));
interact.push(point('about', 6.4, 4.1, { id: 'about' }));
labels.push(point('label', 0, 0, { text: 'NATHAN.EXE', color: '#ff6a3d', height: 7.4 }));

// --- Street furniture along avenues and the ring (regular rhythm, both sides staggered) ---
for (let d = 12, i = 0; d <= 28; d += 8, i++) {
  const s = i % 2 ? 1 : -1;
  O('lamp', 3.4 * s, -d); O('lamp', -3.4 * s, d);
  O('lamp', -d, 3.4 * s); O('lamp', d, -3.4 * s);
}
for (const [x, z] of [[-23, -21], [18, -21], [18, 20], [-23, 20]]) O('lamp', x, z);

// --- Iron Yard (vertical slice district) ---
hedge(-22, -20, -3, -19);                // north
hedge(-22, -19, -21, -4);                // west
hedge(-4, -19, -3, -4);                  // east
hedge(-22, -4, -10, -3);                 // south, left of gate
hedge(-7, -4, -3, -3);                   // south, right of gate
O('gym_building', -14.5, -16, { rot: 0 });
O('squat_rack', -8.5, -9.5, { rot: 0 });
O('pullup_rig', -6, -11.2, { rot: 90 });
O('plyo_boxes', -14.6, -7.2, { rot: 0 });
O('tyre', -5.6, -6.3);
O('chalk_board', -18.6, -11.6, { rot: 0 });
O('bike_rack', -19, -6.2, { rot: 0 });
for (const z of [-17.5, -13.5, -9, -5.5]) O('tree_round', -20.2, z, { scale: 0.9 + ((z * 7) % 3) * 0.05 });
O('tree_round', -5.2, -17.6); O('tree_round', -8.6, -17.8, { scale: 0.85 });
O('lot_sign', -11, -2.9, { text: 'IRON YARD', color: '#ff6a3d', rot: 0 });
labels.push(point('label', -14.5, -16, { text: 'IRON YARD', color: '#1e1b2e', height: 7.2 }));
interact.push(point('chapter', -8.5, -5.6, { id: 'iron-yard', district: 'iron-yard' }));
interact.push(point('npc', -11.2, -9.6, { id: 'coach', rot: 90 }));
interact.push(point('minigame', -8.5, -8.2, { id: 'lift', district: 'iron-yard' }));
interact.push(point('memory', -18.6, -10.6, { id: 'before-photo' }));
interact.push(point('memory', -11.8, -12.6, { id: 'first-logbook' }));
interact.push(point('memory', -5.6, -5.2, { id: 'running-shoes' }));

// --- City Park (placeholder pass: layout only) ---
hedge(3, -20, 17, -19); hedge(17, -19, 18, -4); hedge(3, -19, 4, -13); hedge(3, -10, 4, -4);
hedge(3, -4, 8, -3); hedge(11, -4, 18, -3);
O('fountain', 9.5, -11.5);
for (const [x, z] of [[5.5, -17.5], [13.5, -17.5], [15.8, -14.5], [15.8, -7], [5.5, -6.2], [13.5, -6.2]]) O('tree_blossom', x, z);
O('bench', 7, -11.5, { rot: 90 }); O('bench', 12, -11.5, { rot: -90 });
O('food_cart', 14.4, -8.2, { rot: 0 });
O('picnic_blanket', 6.4, -15.8);
O('bench', 12.6, -16.6, { rot: 0 });
O('lamp', 7.2, -8.4); O('lamp', 12.0, -14.8);
labels.push(point('label', 9.5, -11.5, { text: 'CITY PARK', color: '#3b6d11', height: 5 }));
interact.push(point('npc', 7.6, -7.4, { id: 'guide', rot: 45 }));
paths.push(line('walk', [[6.2, -14.6], [12.8, -14.6], [12.8, -8.6], [6.2, -8.6], [6.2, -14.6]], { outfit: 'teal', loop: true }));

// --- Signal Tower (skills, achievements, experience) ---
hedge(-22, 3, -3, 4); hedge(-22, 4, -21, 19); hedge(-4, 7, -3, 19); hedge(-22, 19, -3, 20);
O('lattice_tower', -16, 13.4);
O('radio_shack', -9.8, 14.2, { rot: -90, text: 'RADIO' });
O('trophy_case', -12.6, 8.2, { rot: 0 });
O('bench', -17.4, 7.6, { rot: 0 });
O('lamp', -6.4, 9.6); O('lamp', -18.6, 16.8);
for (const z of [6.2, 10.4]) O('tree_round', -20, z, { scale: 0.9 });
labels.push(point('label', -16, 13.4, { text: 'SIGNAL TOWER', color: '#2a2440', height: 15.2 }));
interact.push(point('chapter', -6.8, 5.6, { id: 'signal-tower', district: 'signal-tower' }));
interact.push(point('panel', -12.6, 9.6, { id: 'achievements', district: 'signal-tower', panel: 'achievements', title: 'Trophy case' }));
interact.push(point('panel', -7.2, 15.1, { id: 'experience', district: 'signal-tower', panel: 'experience', title: 'Radio log' }));
interact.push(point('memory', -14.6, 9.6, { id: 'first-award' }));
interact.push(point('memory', -7.4, 12.0, { id: 'first-internship' }));

// --- The Garage (projects + tech stack) ---
hedge(17, 3, 18, 19); hedge(10, 18, 18, 19);
O('workshop', 7.4, 12.6, { rot: -90, text: 'THE GARAGE' });
O('skills_board', 11.6, 5.4, { rot: 0 });
O('server_rack', 16.2, 5.0);
O('lamp', 16.2, 9.4); O('bin', 16.2, 17.0);
[0, 1, 2, 3, 4, 5].forEach((i) => {
  const x = i < 3 ? 11.8 : 14.6, z = 7.8 + (i % 3) * 3.4;
  O('project_bench', x, z, { rot: -90 });
  interact.push(point('project', x + 1.25, z, { index: i }));
});
labels.push(point('label', 7.4, 12.6, { text: 'THE GARAGE', color: '#2a2440', height: 6.4 }));
interact.push(point('chapter', 13.8, 4.9, { id: 'garage', district: 'garage' }));
interact.push(point('panel', 11.6, 6.7, { id: 'skills', district: 'garage', panel: 'skills', title: 'Tech stack' }));
interact.push(point('memory', 15.4, 6.3, { id: 'first-commit' }));
interact.push(point('memory', 16.0, 15.8, { id: 'late-night-debug' }));
// --- Winter Campus (Russia chapter) ---
O('faculty_building', 0, -37.6, { text: 'UNIVERSITY' });
labels.push(point('label', 0, -37.6, { text: 'WINTER CAMPUS', color: '#2f5f9a', height: 9.6 }));
interact.push(point('chapter', 0, -31, { id: 'winter-campus', district: 'winter-campus' }));
for (const z of [-40, -36.8, -33.6]) { O('birch', -10.2, z, { scale: 1.05 }); O('birch', 10.4, z + 0.4, { scale: 0.95 }); }
O('birch', -12.4, -35.2, { scale: 0.9 }); O('birch', 12.3, -38.4, { scale: 1.1 });
O('lamp', -2.9, -31.6); O('lamp', 2.9, -31.6);
O('bench', 7, -30.4, { rot: 0, snow: true });
O('notice_board', 9.8, -33, { rot: 0, text: 'EXAMS' });
O('snow_pile', -12.6, -32.4); O('snow_pile', 12.4, -30.6, { scale: 0.8 }); O('snow_pile', 5.2, -33.6, { scale: 0.7 });
interact.push(point('npc', 4.4, -31.4, { id: 'classmate', rot: -90 }));
interact.push(point('memory', 7.9, -29.8, { id: 'student-id' }));
interact.push(point('memory', 9.8, -31.9, { id: 'exam-results' }));
interact.push(point('memory', -11.6, -38.2, { id: 'first-snow' }));
interact.push(point('memory', 1.9, -32.4, { id: 'last-lecture' }));
// --- Monsoon Campus (India chapter, Tamil Nadu college) ---
O('college_building', 35.5, -9.2, { text: 'TCE Madurai', subtitle: 'Thiagarajar College of Engineering', logo: 'assets/logos/tce.png' });
objects.push(area('rain_zone', 25.5, -14, 43, 14));   // monsoon showers fall inside this rectangle
O('gate_arch', 27.4, 0, { text: 'TCE Madurai' });
O('tea_stall', 30, 9.2, { rot: -90 });
O('cycle_stand', 39.4, -1.8, { rot: 0 });
O('notice_board', 31, -2.6, { rot: 0, text: 'FEST' });
O('lamp', 31.6, 1.6); O('lamp', 37.6, 1.6);
for (const [x, z] of [[40.6, 4.5], [39.8, 9.2], [36.6, 11.4], [26.8, 11.2], [26.6, 5.4], [41.2, -6.2]]) O('tree_palm', x, z, { scale: 0.95 + ((x * 3) % 1) * 0.2 });
O('puddle', 32.6, 0.4); O('puddle', 37.2, -0.3, { scale: 0.7 }); O('puddle', 30, 4.6, { scale: 0.8 });
labels.push(point('label', 35.5, -9.2, { text: 'MONSOON CAMPUS', color: '#b5523b', height: 9.2 }));
interact.push(point('chapter', 29.6, 1.8, { id: 'monsoon-campus', district: 'monsoon-campus' }));
interact.push(point('npc', 36.6, 1.6, { id: 'batchmate', rot: -90 }));
interact.push(point('memory', 28.6, 2.9, { id: 'admission-letter' }));
interact.push(point('memory', 32.6, 7.4, { id: 'chai-break' }));
interact.push(point('memory', 31, -1.6, { id: 'first-hackathon' }));
interact.push(point('memory', 34, 3.6, { id: 'monsoon-day' }));
// --- Lake Park (reflection) ---
O('jetty', -35.5, 6.4, { rot: 0, length: 5 });
O('rowboat', -38, -3);
O('ducks', -34, -4, { r: 2.4 });
for (const [x, z, sc] of [[-40.6, 2.6, 1], [-41.2, -4.2, 0.9], [-33.2, -8.8, 1.1], [-38.6, -8.2, 0.8], [-31.4, 3.4, 0.9]]) O('reeds', x, z, { scale: sc });
O('willow', -40.6, 8.2, { scale: 1.05 }); O('willow', -39.6, -11.6, { scale: 0.95 });
O('lamp', -32.6, 7.8); O('lamp', -38.6, 7.6);
O('bench', -31.6, 9.6, { rot: 180 });
labels.push(point('label', -35.5, -2, { text: 'LAKE PARK', color: '#2f5f9a', height: 4 }));
interact.push(point('chapter', -35.5, 2.6, { id: 'lake-park', district: 'lake-park' }));
interact.push(point('memory', -38.8, 7.0, { id: 'letter-to-self' }));
interact.push(point('memory', -32.2, 6.2, { id: 'people-who-helped' }));

// --- Lighthouse (the ending) ---
O('lighthouse', 5, 38.6, { rot: 90 });
O('cottage', -4.6, 37, { rot: 0 });
O('lamp', 2.6, 31); O('lamp', -2.6, 33.4);
O('bench', 2.8, 35.2, { rot: 180 });
labels.push(point('label', 5, 38.6, { text: 'LIGHTHOUSE', color: '#c4402f', height: 13.2 }));
interact.push(point('chapter', 1.8, 32, { id: 'lighthouse', district: 'lighthouse' }));
interact.push(point('finale', 2.4, 38.6, { id: 'finale', district: 'lighthouse' }));
interact.push(point('memory', 1.6, 36.8, { id: 'next-goal' }));

// --- Memory Line: a loop railway between the ring road and the outer districts.
// It stands for moving between chapters of life; boarding is fast travel.
const RAIL = { x0: -30, x1: 25, z0: -28, z1: 27, r: 7 };
const railPts = [];
{
  const { x0, x1, z0, z1, r } = RAIL;
  const corner = (cx, cz, a0) => { for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * (Math.PI / 2); railPts.push([+(cx + Math.cos(a) * r).toFixed(2), +(cz + Math.sin(a) * r).toFixed(2)]); } };
  corner(x1 - r, z0 + r, -Math.PI / 2);   // NE
  corner(x1 - r, z1 - r, 0);              // SE
  corner(x0 + r, z1 - r, Math.PI / 2);    // SW
  corner(x0 + r, z0 + r, Math.PI);        // NW
}
const rail = [{ id: nextId++, name: 'memory-line', type: 'rail', x: toPx(railPts[0][0]), y: toPx(railPts[0][1]), polygon: railPts.map(([x, z]) => ({ x: (x - railPts[0][0]) * PX, y: (z - railPts[0][1]) * PX })), rotation: 0, visible: true, width: 0, height: 0, properties: [] }];
const distToRail = (x, z) => {
  let best = Infinity;
  for (let i = 0; i < railPts.length; i++) {
    const [ax, az] = railPts[i], [bx, bz] = railPts[(i + 1) % railPts.length];
    const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
};
// Stations: [id, district, name, x, z, rot] — the rail runs along each platform's front edge.
const STATIONS = [
  ['winter', 'winter-campus', 'Winter Campus', -8.5, -30, 0],
  ['monsoon', 'monsoon-campus', 'Monsoon', 27, -8.4, 90],
  ['lake', 'lake-park', 'Lake Park', -32, -16, -90],
  ['lighthouse', 'lighthouse', 'Lighthouse', 7, 29, 180],
];
for (const [id, district, name, x, z, rot] of STATIONS) {
  O('station', x, z, { rot, name: `${name} STN` });
  const a = (-rot * Math.PI) / 180, lx = 1.2, lz = 0.25;   // stand point on the platform
  interact.push(point('station', +(x + lx * Math.cos(a) + lz * Math.sin(a)).toFixed(2), +(z - lx * Math.sin(a) + lz * Math.cos(a)).toFixed(2), { id, district, name }));
}

// Forest belt: an intentional ring of trees just inside the beach, left open
// at district approaches and the south beach.
const gaps = [[-Math.PI / 2, 0.45], [0, 0.45], [Math.PI, 0.5], [Math.PI / 2, 0.55]];
for (let a = 0; a < Math.PI * 2; a += 0.085) {
  const off = (a + Math.PI) % (Math.PI * 2) - Math.PI;
  if (gaps.some(([g, w]) => Math.abs(Math.atan2(Math.sin(off - g), Math.cos(off - g))) < w)) continue;
  const row = Math.round(a / 0.085) % 2;
  const r = islandR(a) - 6 - row * 1.6;
  const kind = Math.sin(a) < -0.45 ? 'tree_pine' : Math.cos(a) > 0.5 ? 'tree_palm' : 'tree_round';
  const tx = Math.cos(a) * r, tz = Math.sin(a) * r;
  if (distToRail(tx, tz) < 3 || STATIONS.some(([, , , sx, sz]) => Math.hypot(sx - tx, sz - tz) < 7)) continue;
  O(kind, +tx.toFixed(2), +tz.toFixed(2), { scale: +(0.85 + ((a * 13) % 1) * 0.35).toFixed(2) });
}

// NPC walking routes (ambient townsfolk follow these polylines back and forth)
paths.push(line('walk', [[2.7, 29], [2.7, 2.7], [23.5, 2.7]], { outfit: 'teal' }));          // along the sidewalks
paths.push(line('walk', [[-29.5, -2.7], [-2.7, -2.7], [-2.7, -27]], { outfit: 'saffron' }));
paths.push(line('walk', [[-6.2, 0.5], [-4.4, 4.4], [0.5, 6.2], [4.4, 4.4], [6.2, -0.5], [4.4, -4.4], [-0.5, -6.2], [-4.4, -4.4], [-6.2, 0.5]], { outfit: 'pink', loop: true }));

// ---------------- Write map ----------------
const layer = (name, objs) => ({ id: nextId++, name, type: 'objectgroup', draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects: objs });
const tmj = {
  type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: 'orthogonal', renderorder: 'right-down',
  width: N, height: N, tilewidth: PX, tileheight: PX, infinite: false, compressionlevel: -1,
  backgroundcolor: '#2fb3c9',
  properties: props({ metresPerTile: 1, islandRadius: ISLAND_R, note: 'Edit in Tiled. 1 tile = 1 m. Point objects: type = kit piece name.' }),
  tilesets: [{ firstgid: 1, source: 'ground.tsj' }],
  layers: [
    { id: nextId++, name: 'ground', type: 'tilelayer', width: N, height: N, x: 0, y: 0, opacity: 1, visible: true, data: ground },
    layer('objects', objects), layer('interact', interact), layer('collision', collision),
    layer('labels', labels), layer('paths', paths), layer('spawn', spawn), layer('rail', rail),
  ],
  nextlayerid: 0, nextobjectid: 0,
};
tmj.nextobjectid = nextId; tmj.nextlayerid = nextId;

fs.mkdirSync(OUT, { recursive: true });
writeTileset();
const mapFile = path.join(OUT, 'town.tmj');
if (fs.existsSync(mapFile)) {
  if (!process.argv.includes('--force')) {
    console.error('town.tmj already exists. Re-run with --force to overwrite it (a backup will be kept).');
    process.exit(1);
  }
  fs.copyFileSync(mapFile, mapFile.replace('.tmj', `.backup-${Date.now()}.tmj`));
}
fs.writeFileSync(mapFile, JSON.stringify(tmj));
console.log(`Wrote ${path.relative(ROOT, mapFile)}: ${objects.length} props, ${interact.length} interactables, ${paths.length} NPC paths.`);

// ---------------- tiny PNG encoder ----------------
function shade(hex, amt) {
  return '#' + [1, 3, 5].map((i) => Math.max(0, Math.min(255, parseInt(hex.slice(i, i + 2), 16) + amt)).toString(16).padStart(2, '0')).join('');
}
function png(w, h, raw) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return crc ^ 0xffffffff;
}
