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
// ---- ROAD NETWORK: the one authoritative layout ----
// Everything (terrain, minimap, big map, nav grid) is built from these tiles.
// One rectangular ring road (reads as a diamond in the isometric view), one
// central plaza, and short straight spurs. All roads are 2 tiles wide.
const walkRect = (x0, z0, x1, z1) => rect(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), T.path);
const RING = { x0: -29, x1: 24, z0: -19, z1: 7 };        // outer tile edges of the loop
walkRect(RING.x0, RING.z0, RING.x1 + 1, RING.z0 + 1);    // north side: garden, fountain plaza, Outlaws court
walkRect(RING.x0, RING.z1, RING.x1 + 1, RING.z1 + 1);    // south side: airstrip apron, villa stairs
walkRect(RING.x0, RING.z0, RING.x0 + 1, RING.z1 + 1);    // west side: Vanderlinde land
walkRect(RING.x1, RING.z0, RING.x1 + 1, RING.z1 + 1);    // east side: behind the villa deck
// centre: north-south avenue through the centre (between the two compounds)
walkRect(-1, RING.z0 + 2, 0, RING.z1 - 1);               // north-south through the centre
walkRect(-6, -4, -2, -3);                                // west spoke: entrance gap into Vanderlinde hideout
walkRect(RING.x0 + 2, -4, -25, -3);                      // west path to the west ring road
walkRect(10, 2, 11, RING.z1 - 1);                        // south walkway: connecting main ring road to Villa entrance steps
// destinations
disc(0.5, -22, 4.2, T.plaza);                            // fountain plaza (on the north ring)
rect(14, -28, 22, -21, T.concrete); walkRect(17, -20, 18, -20);   // Outlaws half court, joined to the ring
walkRect(RING.x0, -23, RING.x0 + 1, RING.z0 - 1);        // Vanderlinde beach
walkRect(-34, -2, RING.x0 - 1, -1);                      // banyan hangout
walkRect(RING.x1 + 2, RING.z1, 34, RING.z1 + 1);         // Outlaws beach
walkRect(1, RING.z1 + 2, 2, 34);                         // south beach
// flowerbeds (garden, kept off the road)
rect(-12, -28, -10, -28, T.flowerbed);

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
const area = (type, x0, z0, x1, z1, p = {}, name = '') => ({ id: nextId++, name, type, x: toPx(Math.min(x0, x1)), y: toPx(Math.min(z0, z1)), width: Math.abs(x1 - x0) * PX, height: Math.abs(z1 - z0) * PX, rotation: 0, visible: true, properties: props(p) });
const hedge = (x0, z0, x1, z1) => objects.push(area('hedge', x0, z0, x1, z1));
const line = (type, pts, p = {}) => ({ id: nextId++, name: '', type, x: toPx(pts[0][0]), y: toPx(pts[0][1]), polyline: pts.map(([x, z]) => ({ x: (x - pts[0][0]) * PX, y: (z - pts[0][1]) * PX })), rotation: 0, visible: true, width: 0, height: 0, properties: props(p) });
const objects = [], interact = [], labels = [], paths = [], spawn = [];
const O = (piece, x, z, p = {}) => objects.push(point(piece, x, z, p));
const route = (npc, pts, extra = {}) => paths.push(line('npc_route', pts, { npc, loop: false, ...extra }));

// ---- Tahiti Airstrip (SW) ----
O('runway', -14.5, 16.5, { len: 26, w: 2.6 });
O('airport_terminal', -17, 10.5, { rot: 0, text: 'TAHITI' });
O('private_jet', -6, 11.8, { rot: 0 });
O('windsock', -24, 12.6);
route('harris', [[-10.5, 14.2], [-8.4, 14.5]], { idles: 'look,check', faces: '0,0' });

// ---- Vanderlinde Gang Hideout (NW) ----
O('hideout_house', -13, -11, { rot: 0 });
// school friends hang out inside the bedroom (seat/stand/lean, little roaming)
route('tahiti_sf1', [[-10.45, -14.6]], { idles: 'sit', faces: '-90' });                        // on the bed
route('tahiti_sf2', [[-13.4, -14.6], [-15.6, -12.0]], { idles: 'look,phone', faces: '0,90' });  // by the wardrobe
route('tahiti_sf3', [[-6.05, -25.3]], { idles: 'type', faces: '20' });                           // Jeswin works outdoors, at his studio forecourt (see below)
route('tahiti_sf4', [[-7.6, -7.35]], { idles: 'sit', faces: '180' });                           // at the small table
interact.push(point('group', -13.0, -10.6, { id: 'vanderlinde', title: 'Join the gang' }));
// personal corners: Jeswin's drafting desk, Arok's stream desk, Prince's game corner (inside),
// Guru's laptop + blue scooter (his own corner outside the east wall), Shabeer's photo table (his own corner outside the west wall)
O('stream_desk', -19.2, -7.4);
O('game_setup', -16.6, -9.9);
O('coding_station', -4.5, -6.8); O('scooty', -2.9, -8.2, { rot: 15 });
O('photo_table', -23.6, -6.0);
// Shabeer now keeps his savings board in the shared finance corner (see below); the photo table stays as the gang's memory corner

// ---- Euphonium Villa (E) ----
O('outlaws_villa', 12, -3, { rot: 0 });
labels.push(point('label', 14, -3, { text: "EUPHONIUM VILLA", color: '#2a2440', height: 5.4 }));
route('tahiti_cf1', [[23.3, -2.0]], { idles: 'gaze', faces: '90' });                              // at the railing, facing the ocean
route('tahiti_cf2', [[4.2, 2.6]], { idles: 'film', faces: '180' });                                  // at photo station in west lawn facing south
route('tahiti_cf3', [[20.5, -4.5]], { idles: 'sit', faces: '-90' });
route('tahiti_cf4', [[19.6, -6.4]], { idles: 'look', faces: '0' });
route('tahiti_cf5', [[16.9, 14.15]], { idles: 'sittype', faces: '180' });                            // at his gaming station with TV, console & controllers
route('tahiti_cf6', [[21.6, 1.4]], { idles: 'phone', faces: '90' });
route('tahiti_cf7', [[2.6, 4.0], [18.2, -1.0]], { idles: 'film,gaze', faces: '180,90' });          // at photography workstation and ocean terrace
route('tahiti_cf8', [[17.4, -1.6]], { idles: 'phone', faces: '135' });
// Siva keeps his stock-market board in the shared finance corner (see below)
interact.push(point('group', 21.4, -2.6, { id: 'outlaws', title: 'Join Euphonium' }));

// ---- Finance & Ideas Corner: open lawn south of the villa (Siva and Shabeer, side by side) ----
// Boards face the default camera (south-east), each character stands just right of their board.
const FIN = { siva: [5.5, 20.0], shab: [11.8, 14.0] };
const finNpc = ([bx, bz]) => [+(bx + 2.2 * Math.SQRT1_2 + 0.55 * Math.SQRT1_2).toFixed(2), +(bz - 2.2 * Math.SQRT1_2 + 0.55 * Math.SQRT1_2).toFixed(2)];
O('finance_stock', ...FIN.siva, { rot: -45 });
O('finance_savings', ...FIN.shab, { rot: -45 });
route('tahiti_cf9', [finNpc(FIN.siva)], { idles: 'look', faces: '45' });
route('tahiti_sf5', [finNpc(FIN.shab)], { idles: 'look', faces: '45' });

// ---- Vanderlinde land: their own campfire beside the road ----
O('campfire', -16.4, -3.6);   // front courtyard, beside the bench (was round the west side)
labels.push(point('label', -29, -23, { text: 'VANDERLINDE BEACH', color: '#5a3a26', height: 3 }));
labels.push(point('label', 38.5, 0, { text: 'EUPHONIUM BEACH', color: '#2a2440', height: 3 }));
labels.push(point('label', 2, 38, { text: 'SOUTH BEACH', color: '#c4402f', height: 3 }));
// ---- Compound perimeter hedges (exact Island 01 asset & dimensions) ----
// Compound 1: Vanderlinde Gang Hideout and outdoor activity yard
hedge(-25.2, -16.8, -1.2, -16.0);  // north: one continuous run behind the whole hideout, corner to corner
hedge(-2.0, -16.0, -1.2, -4.5);    // east border (north of main entrance) along central road, joined to the north run
// main east entrance opening: z = -4.5 to -2.5 (connected to walkRect(-6, -4, -2, -3))
hedge(-2.0, -2.5, -1.2, 2.2);      // east border (south of main entrance) down to southeast corner
hedge(-5.0, 2.2, -1.2, 3.0);       // southeast corner / south border (east segment)
// south entrance opening: x = -8.5 to -5.0 (opening to south path, apron, scooty)
hedge(-25.2, 2.2, -8.5, 3.0);      // south border (west segment) along front yard
hedge(-25.2, -2.5, -24.4, 2.2);    // west border (south of west entrance)
// west access opening: z = -4.5 to -2.5 (connected to walkRect(-27, -4, -25, -3))
hedge(-25.2, -16.0, -24.4, -4.5);  // west border (north of west entrance) up to the north run, around Shabeer's photo corner

// Compound 2: The Outlaws' Villa and outdoor activity yard
hedge(10.0, -18.5, 24.5, -17.7);   // north border of photo/food yard along north ring road
hedge(23.7, -18.5, 24.5, -8.0);    // east border of photo yard down to deck
hedge(23.7, -8.0, 24.5, 6.2);      // east border along wooden deck
hedge(20.0, 5.4, 24.5, 6.2);       // south border right of deck stairs
// deck stairs open from x = 16.5 to 20.0 (unobstructed landing)
hedge(11.5, 5.4, 16.5, 6.2);       // south border left of deck stairs
// south entrance gap open from x = 7.5 to 11.5 (4m wide opening)
hedge(1.0, 5.4, 7.5, 6.2);         // southwest corner segment along south road
hedge(1.0, -6.5, 1.8, 6.2);        // west border along central road past Akshay's TV corner
// ---- Vanderlinde garden (north of the hideout): blossoms, picnics, flowers ----
O('picnic_blanket', -11.5, -21.5);
for (const [x, z] of [[-13.5, -19], [-8, -19], [-14, -26.5], [-11, -30.5], [-20.5, -19.5]]) O('tree_blossom', x, z, { scale: 0.9 + Math.abs(x % 3) * 0.06 });
O('flower_patch', -11.2, -25.8, { w: 3, d: 1 }); O('lamp', -11, -18.6);
labels.push(point('label', -11, -24, { text: 'VANDERLINDE GARDEN', color: '#5a3a26', height: 2.6 }));
// ---- Vanderlinde banyan hangout (west) ----
O('banyan', -36.5, -1.5); O('bench', -36.5, 2.2, { rot: 180 }); O('lantern_post', -33.2, -3.2);
for (const [x, z] of [[-38, -8], [-34, 6], [-39, 4], [-31, -9]]) O('tree_palm', x, z, { scale: 0.95 });
// ---- Jeswin's architecture studio: a broad stepped building at the north edge of the Vanderlinde garden,
// facing south, with his open-air workstation on the lawn in front of it and his black bike beside the entrance ----
O('architecture_studio', -2.4, -30.6, { w: 12, d: 4.8 });
O('architect_workspace', -6.6, -25.6);
O('shrub', -5.2, -27.3, { scale: 0.7 }); O('shrub', 0.5, -27.3, { scale: 0.7 });
O('parking_pad', 2.9, -26.9);
interact.push(point('vehicle', 2.9, -26.9, { id: 'moto-jeswin', vtype: 'moto', rot: 90, color: '#17171c', style: 'shine', name: "Jeswin's black bike" }));
// ---- neutral fountain plaza ----
O('fountain', 0.5, -22);
O('bench', 0.5, -18.5, { rot: 180 });
O('bench', 0.5, -25.5, { rot: 0 });
O('bench', -3.0, -22, { rot: 90 });
O('bench', 4.0, -22, { rot: -90 });
for (const [x, z] of [[7.4, -25.0], [-4, -17.5], [5, -17.5]]) O('tree_round', x, z, { scale: 0.9 });
O('flower_patch', -2.6, -18.6, { w: 2, d: 1 }); O('flower_patch', 3.6, -18.6, { w: 2, d: 1 });
O('lamp', -2.0, -14); O('lamp', 3.0, -9);
// ---- Outlaws outdoors: half court, firepit lounge, hammocks, snack cart ----
O('basketball_court', 18, -24.5, { w: 8, d: 7 });
O('hoop', 18, -27.6, { rot: 0 });
O('campfire', 28, -14); O('bench', 28, -16.5, { rot: 0 }); O('bench', 30.5, -14, { rot: -90 });
O('hammock', 27, 14); O('hammock', 31, 17, { rot: 30 });
for (const [x, z] of [[24.6, 14], [29.6, 11.6], [33.4, 18], [26, 19]]) O('tree_palm', x, z, { scale: 1 });
for (const [x, z] of [[24, -24], [30, -22], [14, -32], [26, -30], [32, -6], [28, -2], [16, 24], [22, 26], [12, 26]]) O(z < 0 ? 'tree_round' : 'tree_palm', x, z, { scale: 0.95 });
O('flower_patch', 25.6, 5.0, { w: 2, d: 1 }); O('lantern_post', 27.2, -10.6); O('lantern_post', 22.6, -21);
labels.push(point('label', 22.9, -20.4, { text: 'EUPHONIUM COURT', color: '#2a2440', height: 1.6 }));   // beside the court's south-east corner, clear of Anu's bubble
// ---- neutral south-west and south-east: palm groves ----
for (const [x, z] of [[-30, 22], [-24, 26], [-34, 16], [-18, 28], [-36, 24], [24, 22], [28, 26], [18, 30], [30, 20]]) O('tree_palm', x, z, { scale: 0.9 });
for (const [x, z] of [[-28, 28], [20, 28]]) O('rock', x, z, { scale: 1 });
// ---- centre: kept simple so the junction reads clearly ----
O('bench', 3.8, -1.2, { rot: -90 });   // (bench beside Guru's scooty removed: it sat on his E-ring)
for (const [x, z, sc] of [[-5.5, 2.4, 1], [7.6, -5.6, 0.9], [0.5, -7.2, 1.05], [-8.6, -0.4, 0.95], [4.4, 8.6, 1], [-4.2, 7.4, 0.9]]) O('tree_palm', x, z, { scale: sc });
// path lights along each walk (warm bollards, outside the walking width)
for (const [x, z] of [[-6.6, -4.9], [-3.2, 5.0], [-3.2, 8.0], [5.5, 1.4], [9.5, 1.4], [12.2, 5.0], [16.5, 8.4]]) O('path_light', x, z);

// ---- hideout courtyard: paved, a bench, plants, warm lantern posts, open middle ----
O('lantern_post', -17.6, -1.4); O('lantern_post', -8.4, -1.4);
O('bench', -16.2, -1.6, { rot: 0 });
O('shrub', -17.6, -4.8);
// clubhouse exterior: string lights, wall lamps and potted plants on the front wall,
// an illuminated gang sign at the west entrance, low edging stones along the courtyard
O('clubhouse_front', -13, -5.6, { w: 14 });
O('club_sign', -19.4, -1.0, { rot: 0 });
O('curb', -13, 0.15, { len: 10.4 });

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
// villa: DJ booth on the deck (dance battle)
O('dj_booth', 21.5, -7.4, { lift: 1.4 }); A('dance', 21.5, -6.0, { title: 'Dance battle' });
// each gang's beach: speaker, string lights and its own party
O('beach_speaker', -27.6, -18.6); O('food_table', -24.6, -21.0, { rot: 40 }); O('beach_chair', -23.2, -22.6, { rot: -50 }); O('beach_chair', -22.4, -23.7, { rot: -50, color: '#2bb3a3' }); O('beach_chair', -31.8, -19.6, { rot: 220, color: '#ffd257' }); O('party_lights', -31.6, -25.6, { len: 10, rot: -50, variant: 'vg' }); A('party', -28.8, -19.6, { id: 'party-vg', gang: 'vg', title: 'Vanderlinde beach party' });
O('beach_speaker', 34.4, -2.0); O('party_lights', 42.2, 0, { len: 10, rot: 90, variant: 'ol' }); A('party', 35.8, -3.8, { id: 'party-ol', gang: 'ol', title: 'Euphonium beach party' });
// neutral south beach: race and volleyball
O('race_flag', -4.0, 38.4); O('race_flag', 9.0, 38.0, { color: '#2bb3a3' }); A('race', -3.4, 35.6, { title: 'Beach race' });
// each gang's beach volleyball court (net spans the court's width)
const COURTS = [{ c: [-17.95, -28.5], u: [0.638, -0.77], w: [-0.77, -0.638], rot: 129.7 }, { c: [35.3, -10], u: [0, 1], w: [1, 0], rot: -90 }];
O('volley_net', ...COURTS[0].c, { len: 6.8, L: 11, rot: COURTS[0].rot }); A('volley', -22.3, -23.3, { id: 'volley-vg', gang: 'vg', title: 'Vanderlinde volleyball' });
O('volley_net', ...COURTS[1].c, { len: 6.8, L: 11, rot: COURTS[1].rot }); A('volley', 35.3, -16.9, { id: 'volley-ol', gang: 'ol', title: 'Euphonium volleyball' });
// Euphonium yard: Sathesh + Shabesh's photo corner in west lawn; Akshai's gaming station at west lawn
O('photo_station', 4.2, 2.6); A('photosession', 6.4, 4.2, { id: 'photosession', gang: 'ol', title: 'Photography session' });
O('contest_table', 19.5, -12.5); A('foodcontest', 21.0, -9.4, { id: 'foodcontest', gang: 'ol', title: 'Food challenge' });
O('tv_corner', 17.5, 13.0); A('tvgame', 19.4, 13.2, { id: 'tvgame', gang: 'ol', title: 'Play with Akshai' });
A('anuhoop', 18.0, -22.5, { id: 'anuhoop', gang: 'ol', title: 'Play basketball with Anu' });
// treasure hunt: clue board at the junction, five chests hidden around the island
O('clue_board', -4.4, -1.6); A('clues', -4.4, -0.6, { title: 'Treasure hunt clues' });
for (const [id, x, z] of [['palm', -8.6, 0.8], ['beach', 11.6, 35.4], ['stairs', 21.6, 9.6], ['rock', -24.2, 8.2], ['hideout', -22.0, -4.2]]) { O('treasure_chest', x, z); A('treasure_item', x + 0.6, z + 0.6, { id: 'treasure-' + id, treasure: id, title: 'Something shiny' }); }
// group photos end up on this board in the courtyard
// gang photo spots: the camera tripod looks at the spot from the front
O('photo_tripod', -11.0, -0.4); A('photo', -13.0, -3.0, { id: 'photo-vg', gang: 'vg', title: 'Vanderlinde Gang Photo' });
O('photo_tripod', 22.2, 0.6, { lift: 1.4 }); A('photo', 20.0, -1.6, { id: 'photo-ol', gang: 'ol', title: 'Euphonium photo' });
O('photo_board', -6.4, -0.6); A('gallery', -6.4, 0.4, { title: 'Tahiti photos' });
// motorcycles: two parking spots (central junction, villa south entrance road)
O('parking_pad', -4.8, 4.8); O('scooty', -4.8, 4.8, { rot: 0, color: '#1c1c22', name: 'Black Zest' });   // Vanderlinde gang's black Zest scooty
O('parking_pad', -9.5, 8.6); interact.push(point('vehicle', -9.5, 8.6, { id: 'moto-villa', vtype: 'moto', rot: 0, color: '#2f6fc6', style: 'shine' }));   // Honda Shine 125-style commuter

spawn.push(point('spawn', -4.4, 14.8));

const layer = (name, objs) => ({ id: nextId++, name, type: 'objectgroup', draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects: objs });
// courts get a clean sandy footprint: paint sand, drop any decor standing on it
const inCourt = (x, z, m = 0) => COURTS.some(({ c, u, w }) => { const dx = x - c[0], dz = z - c[1]; return Math.abs(dx * u[0] + dz * u[1]) < 6.2 + m && Math.abs(dx * w[0] + dz * w[1]) < 4.2 + m; });
for (let z = -HALF; z < HALF; z++) for (let x = -HALF; x < HALF; x++) if (ground[idx(x, z)] !== 0 && ground[idx(x, z)] !== T.water && inCourt(x + 0.5, z + 0.5)) ground[idx(x, z)] = T.sand;
const DECOR = new Set(['tree_blossom', 'tree_palm', 'tree_round', 'rock', 'picnic_blanket', 'flower_patch', 'lamp', 'shrub', 'hedge', 'lantern_post', 'bench']);
for (let i = objects.length - 1; i >= 0; i--) { const o = objects[i]; if (DECOR.has(o.type) && inCourt(o.x / PX - HALF, o.y / PX - HALF, 0.6)) objects.splice(i, 1); }
const onRoad = (x, z) => { for (const [dx, dz] of [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) { const tx = Math.floor(x + dx), tz = Math.floor(z + dz); if (inside(tx, tz) && ground[idx(tx, tz)] === T.path) return true; } return false; };
for (let i = objects.length - 1; i >= 0; i--) { const o = objects[i]; if (o.type !== 'hedge' && DECOR.has(o.type) && onRoad(o.x / PX - HALF, o.y / PX - HALF)) objects.splice(i, 1); }
const tmj = {
  type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: 'orthogonal', renderorder: 'right-down',
  width: N, height: N, tilewidth: PX, tileheight: PX, infinite: false, compressionlevel: -1, backgroundcolor: '#2fc4c9',
  properties: props({ metresPerTile: 1, islandRadius: ISLAND_R, navRadius: 46, island: 'tahiti', note: 'Island 02 (Tahiti). Generated by tools/build-tahiti.mjs.' }),
  tilesets: [{ firstgid: 1, source: 'tahiti_ground.tsj' }],
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
