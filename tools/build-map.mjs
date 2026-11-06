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
const N = 120;           // tiles per side, 1 tile = 1 metre
const HALF = N / 2;
const PX = 16;           // Tiled pixels per tile
const ISLAND_R = 54;     // grown so the north and east districts could move outward

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
  { type: 'grass_edge', color: '#86b85a' },   // darker trim along Tahiti's paths
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
  [-2, -36, 2, 30],    // north–south avenue (5 m)
  [-30, -2, 31, 2],    // east–west avenue (ends at the Memory Line crossing)
  [-27, -31, -24, 28], // ring: west
  [-27, -31, 28, -28], // ring: north (moved 6 m out so the Pop Culture Park block is big)
  [25, -31, 28, 29],   // ring: east (moved 6 m out)
  [-27, 26, 28, 29],   // ring: south (moved south so the Garage lot is big)
];
for (const [x0, z0, x1, z1] of ROADS) rect(x0, z0, x1, z1, T.road);
// Centre dashes on the avenues
for (let z = -36; z <= 30; z++) if (Math.abs(z) > 9 && z % 3 !== 0) set(0, z, T.road_line);
for (let x = -30; x <= 31; x++) if (Math.abs(x) > 9 && x % 3 !== 0) set(x, 0, T.road_line);

// District grounds (before sidewalks so sidewalks wrap them cleanly)
rect(-21, -19, -4, -4, T.lawn);           // Iron Yard lot
rect(-20, -19, -9, -13, T.concrete);      //   gym slab
rect(-12, -11, -5, -6, T.rubber);         //   outdoor training floor (smaller, calmer)
rect(-9, -4, -8, -4, T.path);             //   gate
rect(3, -27, 24, -3, T.lawn);             // Pop Culture Park: the enlarged NE block, up to the roads on all four sides
rect(9, -26, 10, -3, T.path); rect(3, -16, 24, -15, T.path); rect(8, -18, 11, -13, T.path); // walks + arcade square
rect(3, -24, 9, -18, T.rubber);           //   Hell's Kitchen alley floor
disc(9.5, -11.5, 3.2, T.plaza);
rect(-21, 4, -4, 25, T.lawn);             // Guild Hall lot (was Signal Tower), down to the south ring road
rect(-6, 4, -4, 14, T.path); rect(-14, 12, -4, 14, T.path); rect(-14, 14, -12, 24, T.path); // entrance walk, front walk, courtyard walk
rect(3, 3, 17, 24, T.concrete);           // Garage: big open lot
rect(-14, -49, 13, -35, T.snow);          // Winter Campus
rect(-2, -39, 2, -35, T.concrete);        //   cleared entrance walk
rect(-21, -37, -11, -35, T.concrete);     //   station forecourt (west of the university, with open ground between)
rect(32, -13, 48, 13, T.lawn);            // Monsoon Campus grounds
rect(32, -1, 46, 1, T.terracotta);        //   main red-earth walk from the arch
rect(35, -5, 47, -3, T.terracotta);       //   veranda forecourt
disc(40, 3.6, 3.3, T.terracotta);         //   small paved court
rect(35, 1, 37, 8, T.terracotta);         //   path to the tea stall
for (let a = 0; a < Math.PI * 2; a += 0.05) set(Math.round(-35 + Math.cos(a) * 7.4), Math.round(-2 + Math.sin(a) * 8.4), T.path);
rect(-30, -1, -28, 1, T.path);
rect(-1, 30, 1, 34, T.path);              // path down to the airport
rect(-12, 34, 10, 39, T.concrete);        // airport apron
rect(-8, 39, 8, 42, T.concrete);          // runway strip
rect(-35, -11, -31, 0, T.concrete);       // Montfort schoolyard
rect(-34, -15, -32, -11, T.path);         //   path from the station
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
const O = (piece, x, z, p = {}) => {
  // street furniture never lands on a road tile
  if (piece === 'lamp') { const t = get(Math.floor(x), Math.floor(z)); if (t === T.road || t === T.road_line) return; }
  if (piece === 'lamp' && x === -3.4 && z === 20) return; // sits in the Guild Hall's east hedge line
  objects.push(point(piece, x, z, p));
};
const hedge = (x0, z0, x1, z1) => objects.push(area('hedge', x0, z0, x1, z1));

// --- Plaza ---
// Avenue axes stay clear; furniture sits in tidy clusters on the diagonals
// (bench facing the monument → planter → lamp), so the square reads calm.
O('crt_monument', 0, 0);
for (let i = 0; i < 4; i++) {
  const a = Math.PI / 4 + i * Math.PI / 2, cx = Math.cos(a), sz = Math.sin(a);
  if (i === 0) continue; // south-east diagonal belongs to the Garage lot
  O('bench', +(cx * 5.6).toFixed(2), +(sz * 5.6).toFixed(2), { rot: Math.round((a * 180) / Math.PI + 90) });
  if (i !== 1) O('planter', +(cx * 7.2).toFixed(2), +(sz * 7.2).toFixed(2));
  O('lamp', +(cx * 8.7).toFixed(2), +(sz * 8.7).toFixed(2));
}
spawn.push(point('spawn', 0, 5.4));      // in front of the CRT, facing it
interact.push(point('about', 0, 3.7, { id: 'about' }));      // directly in front of the CRT screen
labels.push(point('label', 0, 0, { text: 'NATHAN.EXE', color: '#ff6a3d', height: 7.4 }));

// --- Street furniture along avenues and the ring (regular rhythm, both sides staggered) ---
for (let d = 12, i = 0; d <= 28; d += 8, i++) {
  const s = i % 2 ? 1 : -1;
  O('lamp', 3.4 * s, -d); O('lamp', -3.4 * s, d);
  O('lamp', -d, 3.4 * s); O('lamp', d, -3.4 * s);
}
for (const [x, z] of [[-23, -27], [24, 25], [-23, 25]]) O('lamp', x, z);   // NE corner is inside the park now

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
interact.push(point('minigame', -8.5, -8.2, { id: 'lift', district: 'iron-yard' }));
interact.push(point('memory', -18.6, -10.6, { id: 'starting-line' }));
interact.push(point('memory', -11.8, -12.6, { id: 'checkpoint-60' }));
interact.push(point('memory', -5.6, -5.2, { id: 'fitness-chapter' }));

// --- Pop Culture Park (was City Park) ---
// The NE block grew when the north and east ring roads moved out (about 21 x 24 m).
// Six themed areas around a central arcade, one character each:
//   NW Hell's Kitchen alley (Daredevil) · N rooftop (Spider-Man) · NE camp + paddock (Arthur Morgan)
//   SW basement (Tyler Durden) · S moonlit court (Moon Knight) · SE Pied Piper (Richard Hendricks)
hedge(2.2, -27.8, 24.9, -27); hedge(24.2, -27, 24.9, -2.1); hedge(2.2, -27, 2.9, -16.5); hedge(2.2, -13, 2.9, -5.2);
hedge(5.2, -2.9, 8, -2.1);   // corner cut back: a clear walk around the CRT plinth hedge(11, -2.9, 24.9, -2.1);
O('pop_arcade', 9.5, -15.5);
// Hell's Kitchen alley + rooftop signal
O('pop_rooftop', 5.0, -25.4, { variant: 'signal' });
O('pop_rooftop', 7.4, -25.5, { variant: 'red' });
O('neon_sign', 6.15, -24.2, { text: "HELL'S KITCHEN", w: 3.8 });
O('alley_props', 4.2, -21.4);
// rooftop + web agility frame
O('pop_web', 13.5, -25.6);
O('rooftop_props', 13.5, -25.6);
// western camp + round paddock where Arthur rides
O('pop_camp', 20.8, -25.0, { horse: false });
O('paddock', 20.6, -19.6, { r: 2.7 });
interact.push(point('vehicle', 17.2, -23.4, { id: 'horse-camp', vtype: 'horse', rot: 0, district: 'city-park' }));   // saddled horse you can ride
// Tyler's basement + the soap
O('pop_boxing', 6.2, -11.6);
O('bench', 4.2, -8.6, { rot: 90 });
O('giant_soap', 7.6, -8.0, { text: 'FIGHT CLUB' });
// moonlit court
O('moon_court', 13.5, -8.0);
O('pop_moon', 13.5, -11.0);
// Pied Piper house + Richard's desk
O('pied_piper', 21.0, -11.6, { rot: 0, w: 4.4, d: 3.0 });
O('pop_startup', 20.6, -7.6, { board: false });
O('lamp', 11.2, -17.8); O('lamp', 8.4, -12.6); O('lamp', 17.0, -13.6);
for (const [x, z, sc] of [[16.3, -26.0, 0.9], [4.0, -14.2, 0.8], [23.4, -14.0, 0.85], [16.6, -4.0, 0.8]]) O('tree_blossom', x, z, { scale: sc });
interact.push(point('panel', 3.7, -23.4, { id: 'pop-batman', district: 'city-park', panel: 'pop', interest: 'batman', attraction: 'pop_rooftop_signal', title: 'Rooftop signal' }));
labels.push(point('label', 9.5, -15.5, { text: 'POP CULTURE PARK', color: '#3b6d11', height: 5 }));

// Freed strips beside the moved roads: tree-lined greenways
for (let x = -19; x <= -6; x += 4.3) O('tree_round', x, -24.6, { scale: 0.9 });
O('bench', -12.6, -22.6, { rot: 180 });
for (let z = 5; z <= 23; z += 4.5) O('tree_round', 21.6, z, { scale: 0.9 });
O('bench', 20.2, 11.6, { rot: -90 }); O('lamp', 22.8, 9.2); O('lamp', 22.8, 18.2);

// --- Guild Hall (was Signal Tower): skills, trophies, quests, profile ---
// The lot runs from the plaza road down to the south ring road. The walk-in hall
// fills the north end; the Toolbox (chapter) is inside it. The courtyard holds
// the quest board, trophy podium, skill tree, character profile and a small
// training yard, joined by stone walks.
hedge(-22, 3, -3, 4); hedge(-22, 4, -21, 24.6); hedge(-4, 7, -3, 24.6); hedge(-22, 24.6, -3, 25.4);
O('guild_hall', -13.0, 8.2, { rot: 0, w: 12.4, d: 7 });
O('guild_quest_board', -17.8, 14.8, { rot: 0 });
O('guild_trophy_stand', -8.2, 14.8, { rot: 0 });
O('guild_skill_tree', -13.0, 18.4);
O('guild_profile_stand', -17.8, 21.2, { rot: 0 });
O('training_dummy', -8.0, 21.0); O('training_dummy', -6.2, 22.6);
O('bench', -10.0, 23.6, { rot: 0 });
O('lamp', -5.2, 16.0); O('lamp', -20.2, 13.0); O('lamp', -15.4, 23.6);
labels.push(point('label', -13.0, 8.2, { text: 'GUILD HALL', color: '#2a2440', height: 9.6 }));
interact.push(point('chapter', -14.6, 8.9, { id: 'signal-tower', district: 'signal-tower' }));   // the Toolbox, inside the hall
interact.push(point('panel', -13.0, 20.8, { id: 'skilltree', district: 'signal-tower', panel: 'skilltree', title: 'Skill tree' }));
interact.push(point('panel', -8.2, 16.6, { id: 'trophies', district: 'signal-tower', panel: 'trophies', title: 'Trophy collection' }));
interact.push(point('panel', -17.8, 16.4, { id: 'quests', district: 'signal-tower', panel: 'quests', title: 'Quest log' }));
interact.push(point('panel', -17.8, 22.8, { id: 'profile', district: 'signal-tower', panel: 'profile', title: 'Character profile' }));
interact.push(point('memory', -20.0, 19.0, { id: 'the-pitch' }));
interact.push(point('memory', -5.6, 19.4, { id: 'bug-report' }));
interact.push(point('memory', -10.4, 9.0, { id: 'cluster-alert' }));   // inside the hall, by the map table

// --- The Garage (projects + tech stack) ---
// An open inventor's workshop: two lean-to roofs run along the back (north and
// west) edges only, so from the fixed camera a roof can never cover the
// exhibits, the NPCs or the plaza CRT. The north roof carries the GARAGE sign.
// The north-west corner stays open as the entrance from the plaza.
// Five handcrafted exhibits sit around a central aisle and wake up on approach.
// Project index = order in content.json projects.
hedge(17, 3, 18, 25.2); hedge(3, 24.4, 17, 25.2);
O('workshop_shed', 13.1, 4.45, { len: 7.4, depth: 2.2, pillars: [-3.7, -0.7, 3.7], sign: 'GARAGE', rot: 0 });   // north roof, x 9.4..16.8
O('workshop_shed', 3.85, 17.5, { len: 13, depth: 1.7, pillars: [-6.5, -1, 6.5], rot: -90 });                       // west roof, z 11..24
O('tool_wall', 10.9, 3.55, { len: 2.4, rot: 0 });
O('skills_board', 13.6, 4.4, { rot: 0 });
O('server_rack', 15.4, 4.2);
O('tool_wall', 3.6, 18.6, { len: 8, rot: -90 });
const EXHIBITS = [
  // [piece, x, z, interact x, interact z]
  ['exhibit_aratro', 6.6, 8.6, 6.6, 11.0],            // 0 Aratro
  ['exhibit_microservices', 14.0, 9.2, 14.0, 11.5],   // 1 Microservices Security
  ['exhibit_scheduler', 6.6, 15.4, 6.6, 17.7],        // 2 TCE Event Scheduler
  ['exhibit_cauverysite', 14.0, 15.4, 14.0, 17.7],    // 3 CauverySite
  ['exhibit_nathanexe', 10.3, 21.0, 13.0, 21.0],      // 4 NATHAN.EXE (centre workbench)
];
EXHIBITS.forEach(([piece, x, z, ix, iz], i) => {
  O(piece, x, z, { index: i });
  interact.push(point('project', ix, iz, { index: i }));
});
// (The Builder chapter unlocks when the first Garage exhibit is opened.)
interact.push(point('panel', 13.6, 5.6, { id: 'skills', district: 'garage', panel: 'skills', title: 'Tech stack' }));
interact.push(point('memory', 9.6, 6.8, { id: 'hack-odyssey' }));      // by the Aratro trophy
interact.push(point('memory', 3.9, 11.8, { id: 'warehouse-node' }));   // by the Aratro warehouse
interact.push(point('memory', 9.4, 15.4, { id: 'six-hours' }));        // by the Event Scheduler
interact.push(point('memory', 11.6, 12.4, { id: 'property-dashboard' })); // by CauverySite
// --- Winter Campus (Russia chapter) ---
O('faculty_building', 0, -43.6, { text: 'TOMSK STATE UNIVERSITY' });
labels.push(point('label', 0, -43.6, { text: 'TOMSK STATE UNIVERSITY', color: '#2f5f9a', height: 9.6 }));
interact.push(point('chapter', 0, -37, { id: 'winter-campus', district: 'winter-campus' }));
for (const z of [-46, -42.8, -39.6]) { O('birch', -10.2, z, { scale: 1.05 }); O('birch', 10.4, z + 0.4, { scale: 0.95 }); }
O('birch', -12.4, -41.2, { scale: 0.9 }); O('birch', 12.3, -44.4, { scale: 1.1 });
O('lamp', -2.9, -37.6); O('lamp', 2.9, -37.6);
O('bench', 7, -36.4, { rot: 0, snow: true });
O('notice_board', 9.8, -39, { rot: 0, text: 'EXAMS' });
O('snow_pile', -12.6, -38.4); O('snow_pile', 12.4, -36.6, { scale: 0.8 }); O('snow_pile', 5.2, -39.6, { scale: 0.7 });
interact.push(point('memory', 7.9, -35.8, { id: 'new-campus' }));
interact.push(point('memory', 9.8, -37.9, { id: 'two-semesters' }));
interact.push(point('memory', -11.6, -44.2, { id: 'campus-sign' }));
// Rideable bicycles at the two universities (E to ride, E again to get off)
interact.push(point('vehicle', 4.6, -36.2, { id: 'bike-tomsk', vtype: 'bike', rot: 90, color: '#2f5f9a', district: 'winter-campus' }));
interact.push(point('vehicle', 46.4, -0.2, { id: 'bike-tce', vtype: 'bike', rot: 180, color: '#b5523b', district: 'monsoon-campus' }));
// --- Monsoon Campus (India chapter, Tamil Nadu college) ---
O('college_building', 41.5, -9.2, { text: 'TCE Madurai', subtitle: 'Thiagarajar College of Engineering', logo: 'assets/logos/tce.png' });
O('gate_arch', 33.4, 0, { text: 'TCE Madurai' });
O('tea_stall', 36, 9.2, { rot: -90 });
O('cycle_stand', 45.4, -1.8, { rot: 0 });
O('notice_board', 37, -2.6, { rot: 0, text: 'FEST' });
O('lamp', 37.6, 1.6); O('lamp', 43.6, 1.6);
O('laptop_table', 43.6, 6.4);
O('puddle', 38.6, 0.4); O('puddle', 43.2, -0.3, { scale: 0.7 }); O('puddle', 36, 4.6, { scale: 0.8 });
labels.push(point('label', 41.5, -9.2, { text: 'THIAGARAJAR COLLEGE OF ENGINEERING', color: '#b5523b', height: 9.2 }));
interact.push(point('chapter', 35.6, 1.8, { id: 'monsoon-campus', district: 'monsoon-campus' }));
interact.push(point('memory', 34.2, 4.4, { id: 'madurai-checkpoint' }));
interact.push(point('memory', 37, -1.6, { id: 'association-badge' }));
interact.push(point('memory', 40, 3.6, { id: 'ecell-crowd' }));
// --- Montfort (was Lake Park): St. Montfort school + a childhood hangout ---
O('school_building', -36.6, -5.5, { rot: -90, text: 'ST. MONTFORT' });
O('hangout_corner', -35.2, 4.4, { rot: -90 });
O('lamp', -32.4, -1.0); O('lamp', -32.4, 8.4);
labels.push(point('label', -36.6, -5.5, { text: 'MONTFORT', color: '#2f5f9a', height: 7 }));
interact.push(point('chapter', -33.6, -5.5, { id: 'lake-park', district: 'lake-park' }));
interact.push(point('memory', -33.2, -2.2, { id: 'montfort' }));

// --- Airport (was Lighthouse): The Departure. The jet stays parked; Island 02 comes later. ---
O('airport_terminal', -5.5, 35.9, { rot: 0 });
O('control_tower', -10.6, 36.2);
O('private_jet', 2.4, 36.8, { rot: 0 });
O('runway', 0, 40.6, { len: 15, w: 2.6 });
O('windsock', 9.4, 38.4);
labels.push(point('label', -5.5, 35.9, { text: 'AIRPORT', color: '#c4402f', height: 6 }));
interact.push(point('chapter', -7.4, 38.6, { id: 'lighthouse', district: 'lighthouse' }));
interact.push(point('finale', -3.4, 38.6, { id: 'finale', district: 'lighthouse' }));
interact.push(point('memory', -10.6, 38.4, { id: 'new-save-file' }));

// --- Memory Line: a loop railway between the ring road and the outer districts.
// It stands for moving between chapters of life; boarding is fast travel.
const RAIL = { x0: -30, x1: 31, z0: -34, z1: 32.5, r: 7 };
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
  ['lake', 'lake-park', 'Montfort', -32, -16, -90, 1, 'The Beginning'],
  ['winter', 'winter-campus', 'Tomsk', -16, -36, 0, 2, 'The Detour'],
  ['monsoon', 'monsoon-campus', 'TCE', 33, -8.4, 90, 3, 'The Restart'],
  ['lighthouse', 'lighthouse', 'Airport', 7, 34.8, 180, 4, 'The Departure'],
];
for (const [id, district, name, x, z, rot, order, tagline] of STATIONS) {
  O('station', x, z, { rot, name: `${name} STN` });
  const a = (-rot * Math.PI) / 180, lx = 1.2, lz = 0.25;   // stand point on the platform
  interact.push(point('station', +(x + lx * Math.cos(a) + lz * Math.sin(a)).toFixed(2), +(z - lx * Math.sin(a) + lz * Math.cos(a)).toFixed(2), { id, district, name, order, tagline }));
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

// ---------------- Named NPC roaming routes ----------------
// One polyline per character on the "paths" layer (type "npc_route", property
// npc = the character's id in content.json). Each route stays inside its own
// district and on walkable ground; edit them in Tiled to change where people roam.
// loop: true walks the polyline as a circuit, otherwise back and forth.
const route = (npc, pts, loop = false, extra = {}) => paths.push(line('npc_route', pts, { npc, loop, ...extra }));
route('thianesh', [[-17, -9.0], [-11.5, -8.0], [-10.5, -5.5], [-16.5, -5.5]], true);     // Iron Yard
route('guru', [[-3.4, -38.2], [-8.6, -38.4], [-7.8, -36.0]]);                              // Winter Campus (west)
route('shabeer', [[-33.4, 2.6], [-33.0, 5.6], [-33.8, 7.6]]);                              // Montfort, the childhood hangout
route('anu', [[39.0, 7.6], [39.0, 10.2]], false, { idles: 'look,look', faces: '-90,-90' });   // by the tea stall                  // TCE forecourt
route('harris', [[-4.6, 38.6], [0.8, 39.3], [4.0, 39.3], [5.8, 37.8]], false, { idles: ',look,check,check', faces: ',,0,-90' });                     // Airport, terminal to the jet
route('soap', [[6.2, -10.4], [5.0, -8.8], [5.6, -6.6]], false, { idles: 'punch,lean,look', faces: '180,90,125' });                 // boxing basement
route('cal', [[22.35, -19.6], [22.12, -18.73], [21.48, -18.08], [20.6, -17.85], [19.73, -18.08], [19.08, -18.73], [18.85, -19.6], [19.08, -20.48], [19.73, -21.12], [20.6, -21.35], [21.48, -21.12], [22.12, -20.48]], true, { ride: 1 });   // rides circles in the paddock             // western camp
route('vesper', [[13.5, -8.2], [13.5, -5.0], [11.0, -5.0]], false, { idles: 'gaze,look,look', faces: '180,,' });                  // moonlit court
route('skip', [[12.0, -21.6], [15.6, -20.4], [13.6, -18.2]], false, { idles: 'look,check,look', faces: '0,180,' });               // rooftop
route('hale', [[5.4, -23.0], [7.6, -23.0], [6.4, -19.4]], false, { idles: 'lean,look,gaze', faces: '0,45,' });                     // red alley
route('ollie', [[20.6, -6.6], [18.4, -6.0], [18.4, -9.0]], false, { idles: 'type,look,gaze', faces: '180,,90' });               // startup desk
route('akshai', [[10.3, 5.8], [10.3, 12.2], [10.3, 17.9]]);                                // Garage, centre aisle past the exhibits
route('naveen', [[4.8, 23.3], [7.6, 23.3], [7.6, 18.6]]);                                  // Garage, tool wall to the centre bench
route('shabesh', [[38.4, -2.4], [42.8, -2.4]], false, { idles: 'film,film', faces: '180,180' });   // TCE, filming the college
route('logeshwaran', [[11.6, 12.3], [16.4, 12.3]], false, { idles: 'look,check', faces: ',180' });   // Garage, between the exhibit rows
route('piranav', [[43.6, 7.15], [43.62, 7.16]], false, { idles: 'sittype,sittype', faces: '180,180' });   // seated at the laptop table           // TCE, laptop table
// (Shabesh moved from the Garage)                        // Garage, east side by the exhibits

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
