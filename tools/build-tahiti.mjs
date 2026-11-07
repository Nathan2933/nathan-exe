#!/usr/bin/env node
// Generates Island 02, TAHITI: web/public/maps/tahiti.tmj
// Same tileset (ground.tsj) and object conventions as town.tmj, so the game's
// world builder, nav grid, minimap and big map all work unchanged.
// Usage:  node tools/build-tahiti.mjs
//
// Layout (world metres, origin = island centre, +z = south):
//   SW  Tahiti Airstrip: runway (west approach), apron, jet, terminal, Harris
//   NW  Vanderlinde Gang Hideout: house whose interior is Nathan's bedroom
//   E   The Outlaws' Villa: two-storey villa + ocean-facing balcony deck
//   C   small connecting plaza: palms, benches (neutral ground)
//   Each gang has its own land: Vanderlinde Gang to the west/north-west with
//   its own campfire and beach, the Outlaws to the east with theirs. The
//   south beach (race, volleyball) is neutral.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'web/public/maps');
const N = 104, HALF = N / 2, PX = 16, ISLAND_R = 42;

// must match the GROUND order in build-map.mjs (shared ground.tsj)
const TYPES = ['grass', 'road', 'road_line', 'sidewalk', 'plaza', 'rubber', 'concrete', 'snow', 'path', 'water', 'sand', 'flowerbed', 'lawn', 'terracotta', 'boardwalk', 'grass_edge'];
// landscaping parameters
const PATH_W = 2;          // every walk is 2 tiles wide
const BORDER = 1;          // darker grass trim, 1 tile, along every paved edge
const T = Object.fromEntries(TYPES.map((t, i) => [t, i + 1]));

const ground = new Array(N * N).fill(0);
const idx = (x, z) => (z + HALF) * N + (x + HALF);
const inside = (x, z) => x >= -HALF && x < HALF && z >= -HALF && z < HALF;
const set = (x, z, t) => { if (inside(x, z) && ground[idx(x, z)] !== 0) ground[idx(x, z)] = t; };
const rect = (x0, z0, x1, z1, t) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, z, t); };
const disc = (cx, cz, r, t) => { for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 <= r * r) set(x, z, t); };
const walk = (x0, z0, x1, z1, t = T.path, w = 1.1) => { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) * 2); for (let i = 0; i <= n; i++) disc(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, w, t); };
// a softer, rounder outline than Island 01, with a bulge for the airstrip
// wide beaches: Vanderlinde (WNW), Outlaws (E), neutral south beach
const inArc = (a, lo, hi) => a >= lo && a <= hi;
function beachW(a) {
  if (inArc(a, -2.95, -2.0)) return 10;      // Vanderlinde beach
  if (inArc(a, -0.5, 0.5)) return 10;        // Outlaws beach
  if (inArc(a, 1.1, 2.05)) return 7.5;       // south beach
  return 4.5;
}
const islandR = (a) => ISLAND_R * (1 + 0.05 * Math.sin(a * 2 + 2.2) + 0.03 * Math.sin(a * 5 + 0.7) + 0.015 * Math.sin(a * 9));

for (let z = -HALF; z < HALF; z++) for (let x = -HALF; x < HALF; x++) {
  const d = Math.hypot(x + 0.5, z + 0.5), r = islandR(Math.atan2(z + 0.5, x + 0.5));
  if (d < r) ground[idx(x, z)] = d > r - beachW(Math.atan2(z + 0.5, x + 0.5)) ? T.sand : T.grass;
}
// airstrip (SW): runway west–east, apron in front of the terminal
rect(-28, 15, -1, 18, T.concrete);
rect(-21, 9, -2, 14, T.concrete);
// ---- paths: straight 2-tile walks meeting at one square junction ----
const walkRect = (x0, z0, x1, z1) => rect(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), T.path);
rect(-3, -3, 2, 2, T.plaza);                // central junction
walkRect(-7, -4, -4, -3);                    // west: to the hideout courtyard
walkRect(-2, 3, -1, 8);                      // south: to the airstrip apron
walkRect(3, 2, 12, 3);                       // east: towards the villa
walkRect(13, 2, 14, 7); walkRect(13, 6, 19, 7);   // round the villa to its stairs
rect(-18, -5, -8, -1, T.plaza);              // hideout courtyard (light stone)
rect(-14, -6, -12, -5, T.plaza);             //   doorstep
disc(21, 8.8, 2.2, T.sand);                  // little beach below the villa stairs
// gang roads: Vanderlinde west then north to their beach; Outlaws east to theirs
walkRect(-29, -4, -19, -3); walkRect(-30, -24, -29, -3);
walkRect(20, 6, 34, 7);
// neutral: from the runway down to the south beach
walkRect(1, 19, 2, 34);
// neutral fountain plaza north of the junction
walkRect(-1, -18, 0, -4); disc(0.5, -22, 4.2, T.plaza);
// Vanderlinde: little walk to the banyan hangout
walkRect(-34, -2, -31, -1);
// Outlaws: half court for shooting hoops (concrete), path round the villa to it
rect(14, -28, 22, -21, T.concrete); walkRect(10, -20, 11, -1); walkRect(10, -21, 17, -20);
// grass dividers between the lands: a 2-tile strip of lighter lawn under hedges
rect(-7, -38, -6, -8, T.lawn); rect(9, -36, 10, -22, T.lawn); rect(6, 20, 7, 30, T.lawn);
// flowerbeds: Vanderlinde garden, fountain plaza ring
rect(-12, -28, -10, -28, T.flowerbed); rect(-14, -18, -12, -18, T.flowerbed);

// ---- cleanup + borders ----
const paved = new Set([T.path, T.plaza, T.concrete, T.terracotta]);
const at = (x, z) => (inside(x, z) ? ground[idx(x, z)] : 0);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// grass slivers mostly surrounded by paving become paving
for (let pass = 0; pass < 2; pass++) for (let z = -HALF; z < HALF; z++) for (let x = -HALF; x < HALF; x++) {
  if (at(x, z) !== T.grass) continue;
  const n = N4.map(([dx, dz]) => at(x + dx, z + dz)).filter((t) => paved.has(t));
  if (n.length >= 3) ground[idx(x, z)] = n[0];
}
// one even row of darker grass wherever grass meets paving (never on sand or paving)
for (let b = 0; b < BORDER; b++) {
  const mark = [];
  for (let z = -HALF; z < HALF; z++) for (let x = -HALF; x < HALF; x++) {
    if (at(x, z) !== T.grass) continue;
    if (N4.some(([dx, dz]) => paved.has(at(x + dx, z + dz)) || (b > 0 && at(x + dx, z + dz) === T.grass_edge))) mark.push(idx(x, z));
  }
  for (const i of mark) ground[i] = T.grass_edge;
}

let nextId = 1;
const toPx = (v) => (v + HALF) * PX;
const props = (o) => Object.entries(o).map(([name, value]) => ({ name, value, type: typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float') : typeof value === 'boolean' ? 'bool' : 'string' }));
const point = (type, x, z, p = {}) => ({ id: nextId++, name: '', type, x: toPx(x), y: toPx(z), point: true, rotation: 0, visible: true, width: 0, height: 0, properties: props(p) });
const line = (type, pts, p = {}) => ({ id: nextId++, name: '', type, x: toPx(pts[0][0]), y: toPx(pts[0][1]), polyline: pts.map(([x, z]) => ({ x: (x - pts[0][0]) * PX, y: (z - pts[0][1]) * PX })), rotation: 0, visible: true, width: 0, height: 0, properties: props(p) });
const objects = [], interact = [], labels = [], paths = [], spawn = [];
const O = (piece, x, z, p = {}) => objects.push(point(piece, x, z, p));
const route = (npc, pts, extra = {}) => paths.push(line('npc_route', pts, { npc, loop: false, ...extra }));

// ---- Tahiti Airstrip (SW) ----
O('runway', -14.5, 16.5, { len: 26, w: 2.6 });
O('airport_terminal', -17, 10.5, { rot: 0, text: 'TAHITI' });
O('private_jet', -6, 11.8, { rot: 0 });
O('windsock', -24, 12.6);
labels.push(point('label', -14, 12, { text: 'TAHITI AIRSTRIP', color: '#c4402f', height: 5 }));
route('harris', [[-10.5, 14.2], [-8.4, 14.5]], { idles: 'look,check', faces: '0,0' });

// ---- Vanderlinde Gang Hideout (NW) ----
O('hideout_house', -13, -11, { rot: 0 });
labels.push(point('label', -13, -11, { text: 'VANDERLINDE GANG HIDEOUT', color: '#5a3a26', height: 7.4 }));
// school friends hang out inside the bedroom (seat/stand/lean, little roaming)
route('tahiti_sf1', [[-10.45, -14.6]], { idles: 'sit', faces: '-90' });                        // on the bed
route('tahiti_sf2', [[-13.4, -14.6], [-15.6, -12.0]], { idles: 'look,phone', faces: '0,90' });  // by the wardrobe
route('tahiti_sf3', [[-19.25, -13.0]], { idles: 'lean', faces: '90' });                         // against the west wall
route('tahiti_sf4', [[-7.6, -7.35]], { idles: 'sit', faces: '180' });                           // at the small table
interact.push(point('group', -13.0, -10.6, { id: 'vanderlinde', title: 'Join the gang' }));
interact.push(point('panel', 17.6, 8.4, { id: 'place-villa', panel: 'place', place: 'villa', title: "The Outlaws' Villa" }));

// ---- The Outlaws' Villa (E) ----
O('outlaws_villa', 12, -3, { rot: 0 });
labels.push(point('label', 14, -3, { text: "THE OUTLAWS' VILLA", color: '#2a2440', height: 9.2 }));
route('tahiti_cf1', [[23.3, -2.0]], { idles: 'gaze', faces: '90' });                              // at the railing, facing the ocean
route('tahiti_cf2', [[18.7, -4.5]], { idles: 'sit', faces: '90' });
route('tahiti_cf3', [[20.5, -4.5]], { idles: 'sit', faces: '-90' });
route('tahiti_cf4', [[19.6, -6.4]], { idles: 'look', faces: '0' });
route('tahiti_cf5', [[23.2, -7.2]], { idles: 'lean', faces: '-90' });
route('tahiti_cf6', [[21.6, 1.4]], { idles: 'phone', faces: '90' });
route('tahiti_cf7', [[18.2, -1.0], [20.2, 2.4]], { idles: 'look,gaze', faces: '90,90' });
route('tahiti_cf8', [[17.4, -1.6]], { idles: 'phone', faces: '135' });
route('tahiti_cf9', [[18.2, 2.0]], { idles: 'look', faces: '90' });
interact.push(point('group', 21.4, -2.6, { id: 'outlaws', title: 'Join the Outlaws' }));

// ---- Vanderlinde land: their own campfire beside the road ----
O('campfire', -24.5, -14.0);
O('bench', -24.5, -17.2, { rot: 0 });
labels.push(point('label', -29, -23, { text: 'VANDERLINDE BEACH', color: '#5a3a26', height: 3 }));
labels.push(point('label', 38.5, 0, { text: 'OUTLAWS BEACH', color: '#2a2440', height: 3 }));
labels.push(point('label', 2, 38, { text: 'SOUTH BEACH', color: '#c4402f', height: 3 }));
// ---- land dividers: hedge rows on the lawn strips (gaps to walk through) ----
const hedgeRow = (x, z0, z1, gapEvery = 4) => { for (let z = z0; z < z1; z += gapEvery + 1.5) O('hedge', x, z + gapEvery / 2, { w: 1, d: gapEvery }); };
hedgeRow(-6, -37, -9); hedgeRow(10, -35, -23); hedgeRow(7, 20.5, 30);
// ---- Vanderlinde garden (north of the hideout): blossoms, picnics, flowers ----
O('picnic_blanket', -11.5, -21.5); O('picnic_blanket', -9.0, -23.5);
for (const [x, z] of [[-13.5, -19], [-8, -19], [-14, -26.5], [-8.5, -27.5], [-11, -30.5], [-20.5, -19.5]]) O('tree_blossom', x, z, { scale: 0.9 + Math.abs(x % 3) * 0.06 });
O('flower_patch', -11.2, -25.8, { w: 3, d: 1 }); O('lamp', -11, -18.6);
labels.push(point('label', -11, -24, { text: 'VANDERLINDE GARDEN', color: '#5a3a26', height: 2.6 }));
// ---- Vanderlinde banyan hangout (west) ----
O('banyan', -36.5, -1.5); O('bench', -36.5, 2.2, { rot: 180 }); O('lantern_post', -33.2, -3.2);
for (const [x, z] of [[-38, -8], [-34, 6], [-39, 4], [-31, -9]]) O('tree_palm', x, z, { scale: 0.95 });
// ---- neutral fountain plaza ----
O('fountain', 0.5, -22); O('bench', -3.4, -22, { rot: 90 }); O('bench', 4.4, -22, { rot: -90 }); O('bench', 0.5, -26.2, { rot: 0 });
for (const [x, z] of [[-4, -26.5], [5, -26.5], [-4, -17.5], [5, -17.5]]) O('tree_round', x, z, { scale: 0.9 });
O('flower_patch', -2.6, -18.6, { w: 2, d: 1 }); O('flower_patch', 3.6, -18.6, { w: 2, d: 1 });
O('lamp', -2.0, -14); O('lamp', 3.0, -9);
// ---- Outlaws outdoors: half court, firepit lounge, hammocks, snack cart ----
O('hoop', 18, -27.4, { rot: 0 });
O('campfire', 28, -14); O('bench', 28, -17.0, { rot: 0 }); O('bench', 31.0, -14, { rot: -90 }); O('bench', 25.0, -14, { rot: 90 });
O('hammock', 27, 14); O('hammock', 31, 17, { rot: 30 });
for (const [x, z] of [[24.6, 14], [29.6, 11.6], [33.4, 18], [26, 19]]) O('tree_palm', x, z, { scale: 1 });
O('food_cart', 15, 16, { rot: 0 }); O('bench', 13.2, 18.6, { rot: 180 }); O('bench', 16.8, 18.6, { rot: 180 });
for (const [x, z] of [[24, -24], [30, -22], [14, -32], [26, -30], [32, -6], [28, -2], [16, 24], [22, 26], [12, 26]]) O(z < 0 ? 'tree_round' : 'tree_palm', x, z, { scale: 0.95 });
O('flower_patch', 25.6, 5.0, { w: 2, d: 1 }); O('lantern_post', 25.4, -10.6); O('lantern_post', 22.6, -21);
labels.push(point('label', 18, -24, { text: 'OUTLAWS COURT', color: '#2a2440', height: 3.2 }));
// ---- neutral south-west and south-east: palm groves ----
for (const [x, z] of [[-30, 22], [-24, 26], [-34, 16], [-18, 28], [-36, 24], [24, 22], [28, 26], [18, 30], [30, 20]]) O('tree_palm', x, z, { scale: 0.9 });
for (const [x, z] of [[-28, 28], [20, 28]]) O('rock', x, z, { scale: 1 });
// ---- centre: kept simple so the junction reads clearly ----
O('bench', -0.6, -4.6, { rot: 0 }); O('bench', 3.8, -1.2, { rot: -90 });
for (const [x, z, sc] of [[-5.5, 2.4, 1], [6.2, -2.4, 0.9], [0.5, -7.2, 1.05], [-8.6, -0.4, 0.95], [8.4, 6.2, 1], [-4.2, 7.4, 0.9]]) O('tree_palm', x, z, { scale: sc });
// path lights along each walk (warm bollards, outside the walking width)
for (const [x, z] of [[-5.5, -4.9], [-3.2, 5.0], [-3.2, 8.0], [5.5, 1.4], [9.5, 1.4], [12.2, 5.0], [16.5, 8.4]]) O('path_light', x, z);

// ---- hideout courtyard: paved, a bench, plants, warm lantern posts, open middle ----
O('lantern_post', -17.6, -1.4); O('lantern_post', -8.4, -1.4);
O('bench', -16.2, -1.6, { rot: 0 });
O('shrub', -17.6, -4.8); O('shrub', -8.4, -4.8); O('shrub', -10.6, -5.6, { scale: 0.7 }); O('shrub', -15.4, -5.6, { scale: 0.7 });
interact.push(point('panel', -11.2, -3.0, { id: 'place-hideout', panel: 'place', place: 'hideout', title: 'Vanderlinde Gang Hideout' }));

// ---- villa surroundings ----
O('lantern_post', 21.4, 7.4); O('lantern_post', 12.4, 1.2);
O('shrub', 15.6, 7.8); O('shrub', 21.6, 5.2, { scale: 0.8 }); O('shrub', 9.6, 1.2, { scale: 0.8 });

// ---- shoreline dressing: palms and rocks around the rim ----
for (let a = 0; a < Math.PI * 2; a += 0.21) {
  const r = islandR(a) - 6.2, x = Math.cos(a) * r, z = Math.sin(a) * r;
  const near = (cx, cz, rr) => Math.hypot(x - cx, z - cz) < rr;
  if (near(-14, 15, 15) || near(-14, 12, 9) || near(20, -2, 9) || near(21, 8, 5) || near(-13, -8, 11) || inArc(a > Math.PI ? a - 2 * Math.PI : a, -2.95, -2.0) || inArc(a > Math.PI ? a - 2 * Math.PI : a, -0.5, 0.5) || inArc(a, 1.1, 2.05)) continue;
  const i = Math.round(a / 0.21);
  if (i % 5 === 0) O('rock', +x.toFixed(2), +z.toFixed(2), { scale: 0.8 + (i % 4) * 0.15 });
  else O('tree_palm', +x.toFixed(2), +z.toFixed(2), { scale: 0.85 + (i % 5) * 0.06 });
}

// ---- Tahiti activities ----
const A = (act, x, z, p = {}) => interact.push(point('activity', x, z, { id: p.id || act, act, ...p }));
// villa: DJ booth on the deck (dance battle), barbecue by the stairs (eating contest)
O('dj_booth', 21.5, -7.4, { lift: 1.4 }); A('dance', 21.5, -5.8, { title: 'Dance battle' });
O('bbq_grill', 13.6, 9.6); A('food', 11.6, 9.0, { title: 'Eating contest' });
// each gang's beach: speaker, string lights and its own party
O('beach_speaker', -27.6, -18.6); O('party_lights', -31.6, -25.6, { len: 10, rot: -50, variant: 'vg' }); A('party', -28.8, -19.6, { id: 'party-vg', gang: 'vg', title: 'Vanderlinde beach party' });
O('beach_speaker', 34.4, -2.0); O('party_lights', 42.2, 0, { len: 10, rot: 90, variant: 'ol' }); A('party', 35.8, -3.8, { id: 'party-ol', gang: 'ol', title: 'Outlaws beach party' });
// neutral south beach: race and volleyball
O('race_flag', -4.0, 38.4); O('race_flag', 9.0, 38.0, { color: '#2bb3a3' }); A('race', -3.4, 35.6, { title: 'Beach race' });
// each gang's beach volleyball court (net spans the court's width)
const COURTS = [{ c: [-17.95, -28.5], u: [0.638, -0.77], w: [-0.77, -0.638], rot: 129.7 }, { c: [35.3, -10], u: [0, 1], w: [1, 0], rot: -90 }];
O('volley_net', ...COURTS[0].c, { len: 6.8, L: 11, rot: COURTS[0].rot }); A('volley', -22.3, -23.3, { id: 'volley-vg', gang: 'vg', title: 'Vanderlinde volleyball' });
O('volley_net', ...COURTS[1].c, { len: 6.8, L: 11, rot: COURTS[1].rot }); A('volley', 35.3, -16.9, { id: 'volley-ol', gang: 'ol', title: 'Outlaws volleyball' });
// basketball: one shooter at a time
A('hoop', 18, -20.6, { id: 'hoop-ol', gang: 'ol', title: 'Shootout' });
// treasure hunt: clue board at the junction, five chests hidden around the island
O('clue_board', -4.4, -1.6); A('clues', -4.4, -0.6, { title: 'Treasure hunt clues' });
for (const [id, x, z] of [['palm', -8.6, 0.8], ['beach', 11.6, 35.4], ['stairs', 21.6, 9.6], ['rock', -24.2, 8.2], ['hideout', -21.4, -9.0]]) { O('treasure_chest', x, z); A('treasure_item', x + 0.6, z + 0.6, { id: 'treasure-' + id, treasure: id, title: 'Something shiny' }); }
// group photos end up on this board in the courtyard
// gang photo spots: the camera tripod looks at the spot from the front
O('photo_tripod', -11.0, -0.4); A('photo', -13.4, -2.8, { id: 'photo-vg', gang: 'vg', title: 'Vanderlinde Gang photo' });
O('photo_tripod', 22.2, 0.6, { lift: 1.4 }); A('photo', 20.0, -1.6, { id: 'photo-ol', gang: 'ol', title: 'Outlaws photo' });
O('photo_board', -9.4, -0.6); A('gallery', -9.4, 0.4, { title: 'Tahiti photos' });
// motorcycles: two parking spots (central junction, villa)
O('parking_pad', -4.8, 4.8); interact.push(point('vehicle', -4.8, 4.8, { id: 'moto-centre', vtype: 'moto', rot: 0, color: '#c4302b' }));
O('parking_pad', 11.6, 6.4); interact.push(point('vehicle', 11.6, 6.4, { id: 'moto-villa', vtype: 'moto', rot: 0, color: '#2f6fc6' }));

spawn.push(point('spawn', -4.4, 14.8));

const layer = (name, objs) => ({ id: nextId++, name, type: 'objectgroup', draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects: objs });
// courts get a clean sandy footprint: paint sand, drop any decor standing on it
const inCourt = (x, z, m = 0) => COURTS.some(({ c, u, w }) => { const dx = x - c[0], dz = z - c[1]; return Math.abs(dx * u[0] + dz * u[1]) < 6.2 + m && Math.abs(dx * w[0] + dz * w[1]) < 4.2 + m; });
for (let z = -HALF; z < HALF; z++) for (let x = -HALF; x < HALF; x++) if (ground[idx(x, z)] !== 0 && ground[idx(x, z)] !== T.water && inCourt(x + 0.5, z + 0.5)) ground[idx(x, z)] = T.sand;
const DECOR = new Set(['tree_blossom', 'tree_palm', 'tree_round', 'rock', 'picnic_blanket', 'flower_patch', 'lamp', 'shrub', 'hedge', 'lantern_post', 'bench']);
for (let i = objects.length - 1; i >= 0; i--) { const o = objects[i]; if (DECOR.has(o.type) && inCourt(o.x / PX - HALF, o.y / PX - HALF, 0.6)) objects.splice(i, 1); }
const tmj = {
  type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: 'orthogonal', renderorder: 'right-down',
  width: N, height: N, tilewidth: PX, tileheight: PX, infinite: false, compressionlevel: -1, backgroundcolor: '#2fc4c9',
  properties: props({ metresPerTile: 1, islandRadius: ISLAND_R, navRadius: 46, island: 'tahiti', note: 'Island 02 (Tahiti). Generated by tools/build-tahiti.mjs.' }),
  tilesets: [{ firstgid: 1, source: 'ground.tsj' }],
  layers: [
    { id: nextId++, name: 'ground', type: 'tilelayer', width: N, height: N, x: 0, y: 0, opacity: 1, visible: true, data: ground },
    layer('objects', objects), layer('interact', interact), layer('collision', []),
    layer('labels', labels), layer('paths', paths), layer('spawn', spawn), layer('rail', []),
  ],
  nextlayerid: 0, nextobjectid: 0,
};
tmj.nextobjectid = nextId; tmj.nextlayerid = nextId;
fs.writeFileSync(path.join(OUT, 'tahiti.tmj'), JSON.stringify(tmj));
console.log(`Wrote web/public/maps/tahiti.tmj: ${objects.length} props, ${interact.length} interactables, ${paths.length} NPC paths.`);
