import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import * as THREE from 'three';

// DOM mock for canvas textures in kit.js (stream_desk, signs, etc.)
const canvasCtx = new Proxy({}, {
  get: () => () => ({ width: 10, addColorStop: () => {} })
});
global.document = { createElement: () => ({ getContext: () => canvasCtx, width: 128, height: 72 }) };

import { KIT } from '../src/game/kit.js';
import { CANONICAL_MAP } from '../src/game/conversation.js';
import { BANK } from '../src/game/dialogue-bank.js';

test('Harish study setup - kit.js contains desk, chair, and study props', () => {
  assert(typeof KIT.study_corner === 'function', 'KIT.study_corner exists');
  const piece = KIT.study_corner();
  assert(piece.obj, 'study_corner has a 3D group');
  assert(piece.colliders && piece.colliders.length >= 3, 'study_corner has chair, table, and planter colliders');

  // Verify chair collider at (0, 0)
  const chairCol = piece.colliders.find(c => Math.abs(c.x) < 0.1 && Math.abs(c.z) < 0.1);
  assert(chairCol, 'Chair collider centered at origin (0, 0)');

  // Verify table collider at (0, 0.95)
  const tableCol = piece.colliders.find(c => Math.abs(c.x) < 0.1 && Math.abs(c.z - 0.95) < 0.1);
  assert(tableCol, 'Table collider centered in front of chair at (0, 0.95)');

  // Verify planter collider
  const planterCol = piece.colliders.find(c => Math.abs(c.x - 1.05) < 0.1 && Math.abs(c.z - (-0.45)) < 0.1);
  assert(planterCol, 'Planter box collider beside chair');
});

test('Harish study setup - tahiti.tmj has study_corner prop and tahiti_cf10 at (-32.0, 5.0)', () => {
  const tmj = JSON.parse(fs.readFileSync('public/maps/tahiti.tmj', 'utf8'));
  const HALF = 52, PX = 16;
  const toWorld = (px, py) => ({ x: px / PX - HALF, z: py / PX - HALF });

  // 1. Check study_corner prop
  const objLayer = tmj.layers.find(l => l.name === 'objects');
  const cornerObj = objLayer.objects.find(o => o.type === 'study_corner');
  assert(cornerObj, 'study_corner prop is in tahiti.tmj');
  const cornerPos = toWorld(cornerObj.x, cornerObj.y);
  assert.strictEqual(cornerPos.x, -32.0, 'study_corner placed at world X = -32.0');
  assert.strictEqual(cornerPos.z, 5.0, 'study_corner placed at world Z = 5.0');

  // 2. Check Harish route
  const pathsLayer = tmj.layers.find(l => l.name === 'paths');
  const hRoute = pathsLayer.objects.find(o => o.properties?.some(p => p.name === 'npc' && p.value === 'tahiti_cf10'));
  assert(hRoute, 'tahiti_cf10 route is in tahiti.tmj');
  const hPos = toWorld(hRoute.x, hRoute.y);
  assert.strictEqual(hPos.x, -32.0, 'Harish route placed at world X = -32.0');
  assert.strictEqual(hPos.z, 5.0, 'Harish route placed at world Z = 5.0');

  const idleProp = hRoute.properties.find(p => p.name === 'idles');
  const faceProp = hRoute.properties.find(p => p.name === 'faces');
  const visitProp = hRoute.properties.find(p => p.name === 'visitSpot');
  assert.strictEqual(idleProp?.value, 'study', 'Harish idle pose is study');
  assert.strictEqual(faceProp?.value, '0', 'Harish faces heading 0 (facing south towards the table)');
  assert.strictEqual(visitProp?.value, '-32.0,7.15', 'Harish visitSpot is -32.0,7.15');
});

test('Harish study setup - path clearance and terrain grass placement', () => {
  const tmj = JSON.parse(fs.readFileSync('public/maps/tahiti.tmj', 'utf8'));
  const HALF = 52, N = 104;
  const ground = tmj.layers.find(l => l.name === 'ground').data;
  const tileAt = (x, z) => ground[Math.floor(z + HALF) * N + Math.floor(x + HALF)];

  const corner = KIT.study_corner();
  const box = new THREE.Box3().setFromObject(corner.obj);
  const worldMinX = -32.0 + box.min.x;
  const worldMaxX = -32.0 + box.max.x;
  const worldMinZ = 5.0 + box.min.z;
  const worldMaxZ = 5.0 + box.max.z;

  // Verify setup is on grass
  const chairTile = tileAt(-32, 5);
  const tableTile = tileAt(-32, 6);
  assert(chairTile === 1 || chairTile === 16, 'Chair is placed on grass ground');
  assert(tableTile === 1 || tableTile === 16, 'Table is placed on grass ground');

  // Verify none of the study_corner meshes touch the road (T.path = 9)
  const T_PATH = 9;
  for (let x = Math.floor(worldMinX); x <= Math.ceil(worldMaxX); x++) {
    for (let z = Math.floor(worldMinZ); z <= Math.ceil(worldMaxZ); z++) {
      const t = tileAt(x, z);
      assert.notStrictEqual(t, T_PATH, `study_corner mesh at (${x}, ${z}) does not touch path`);
    }
  }

  // The path at z = 7..8 starts at x = -29.0
  // worldMaxX is ~ -30.45, leaving a clear grass buffer of > 1.4m
  assert(worldMaxX < -29.0 - 1.0, 'study_corner leaves > 1m clear buffer to the road path');
});

test('Harish study setup - visible from default camera with no occluders', () => {
  const tmj = JSON.parse(fs.readFileSync('public/maps/tahiti.tmj', 'utf8'));
  const HALF = 52, PX = 16;
  const toWorld = (px, py) => ({ x: px / PX - HALF, z: py / PX - HALF });
  const objs = tmj.layers.find(l => l.name === 'objects').objects;

  // Default camera direction in main.js is from (+X, +Y, +Z) looking at (-X, -Y, -Z).
  // Any large obstacle in the camera cone (x in [-32, -26], z in [5, 12]) would block Harish.
  for (const o of objs) {
    if (o.type === 'study_corner') continue;
    const pos = toWorld(o.x, o.y);
    const dx = pos.x - (-32.0);
    const dz = pos.z - 5.0;
    if (dx > 0 && dz > 0 && dx < 6 && dz < 6) {
      assert.fail(`Obstacle ${o.type} at (${pos.x}, ${pos.z}) blocks camera line of sight to Harish`);
    }
  }
});

test('Harish study setup - tahiti.js seated study pose, enter positioning, and visitSpot', () => {
  const tahitiJs = fs.readFileSync('src/game/tahiti.js', 'utf8');
  assert(tahitiJs.includes("STUDY = { seat: V(-32.0, 5.0), ring: V(-32.0, 7.15), face: 0 }"), 'STUDY position constants match');
  assert(tahitiJs.includes("ch.pose = 'study'"), 'studyTick sets pose to study');
  assert(tahitiJs.includes("hIt.seated = true"), 'Harish marked as seated');
  assert(tahitiJs.includes("hIt.visitSpot = { x: STUDY.ring.x, z: STUDY.ring.z }"), 'Harish visitSpot set to ring');
  assert(tahitiJs.includes("hIt.character.pose = 'study'"), 'Harish pose initialized to study in enter()');
});

test('Harish study setup - dialogue bank and canonical mapping', () => {
  assert.strictEqual(CANONICAL_MAP.tahiti_cf10, 'harish', 'tahiti_cf10 maps canonically to harish');
  assert(BANK.harish, 'BANK has dialogue for harish');
  assert(BANK.harish.first && BANK.harish.first.length > 0, 'Harish has first meeting dialogue');
  assert(BANK.harish.repeats && BANK.harish.repeats.length > 0, 'Harish has repeat dialogue');
  assert(BANK.harish.activity && BANK.harish.activity.length > 0, 'Harish has activity-specific dialogue');
  assert(BANK.harish.topics && BANK.harish.topics.length > 0, 'Harish has talk topics');
});
