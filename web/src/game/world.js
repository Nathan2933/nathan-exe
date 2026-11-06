import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KIT, mat, C } from './kit.js';
import { tileAt } from './tiled.js';
import { Character, OUTFITS } from './player.js';
import { buildRailway } from './railway.js';
import { buildRain } from './weather.js';

// Builds the 3D town from a Tiled map (see tiled.js) using kit pieces.
// Static meshes are merged by material afterwards to keep draw calls low.

// Top surface height per ground material (sidewalks get a real kerb).
const HEIGHT = { road: 0.02, road_line: 0.02, sidewalk: 0.14, plaza: 0.08, concrete: 0.07, rubber: 0.06, water: 0.008, flowerbed: 0.2, boardwalk: 0.25 };
const DEFAULT_H = 0.04;
export const groundHeight = (type) => HEIGHT[type] ?? DEFAULT_H;

/** Optional Blender replacements listed in public/assets/kit/manifest.json */
export async function loadKitOverrides(base) {
  const out = new Map();
  try {
    const res = await fetch(`${base}assets/kit/manifest.json`, { cache: 'no-store' });
    if (!res.ok) return out;
    const list = await res.json();
    const loader = new GLTFLoader();
    await Promise.all((list.pieces || []).map(async (name) => {
      try {
        const gltf = await loader.loadAsync(`${base}assets/kit/${name}.glb`);
        gltf.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        out.set(name, gltf.scene);
      } catch (e) { console.warn(`Kit override ${name}.glb failed to load`, e); }
    }));
  } catch { /* no manifest: use built-in pieces */ }
  return out;
}

export function buildWorld(scene, content, map, overrides = new Map()) {
  const root = new THREE.Group();
  scene.add(root);
  const colliders = [];
  const animated = [];
  const interactables = [];
  const npcs = [];
  const walkers = [];
  const weather = []; // rain zones
  const apis = {};    // pieces that expose controls (e.g. lighthouse.setLit)
  const floors = []; // raised walkable surfaces (station platforms…): {minX,maxX,minZ,maxZ,h}
  const R = map.props.islandRadius || 44;

  // ---------- island, sea ----------
  const islandR = (a) => R * (1 + 0.035 * Math.sin(a * 3 + 0.4) + 0.02 * Math.sin(a * 5 + 1) + 0.012 * Math.sin(a * 11));
  const geo = new THREE.CylinderGeometry(R + 1.5, R - 1, 3, 96, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), k = islandR(Math.atan2(z, x)) / R;
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  const island = new THREE.Mesh(geo, [mat(0xd9a86a), mat(0xffe3a6), mat(0xa9774a)]);
  island.position.y = -1.5; island.receiveShadow = true; island.userData.dynamic = true;
  root.add(island);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat(0x2fb3c9));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -1.1; sea.userData.dynamic = true;
  root.add(sea);
  const foam = new THREE.Mesh(new THREE.RingGeometry(R + 1.2, R + 2.6, 96), new THREE.MeshBasicMaterial({ color: 0xe9fbff }));
  foam.rotation.x = -Math.PI / 2; foam.position.y = -1.08; foam.userData.dynamic = true;
  root.add(foam);
  animated.push((t) => foam.scale.setScalar(1 + Math.sin(t * 0.8) * 0.005));

  // ---------- ground tiles (greedy runs per row → few boxes) ----------
  const W = map.width, half = map.half;
  for (let j = 0; j < map.height; j++) {
    let i = 0;
    while (i < W) {
      const gid = map.ground[j * W + i];
      if (!gid) { i++; continue; }
      let e = i + 1;
      while (e < W && map.ground[j * W + e] === gid) e++;
      const tile = map.tiles.get(gid);
      const h = groundHeight(tile.type);
      const top = Math.max(h, -0.3);
      const box = new THREE.Mesh(new THREE.BoxGeometry(e - i, top + 0.3, 1), mat(new THREE.Color(tile.color).getHex()));
      box.position.set(i - half + (e - i) / 2, (top - 0.3) / 2, j - half + 0.5);
      box.receiveShadow = true; box.castShadow = false;
      root.add(box);
      if (tile.type === 'road_line') {
        for (let x = i; x < e; x++) {
          const horiz = tileType(map, x - half - 1, j - half) === 'road_line' || tileType(map, x - half + 1, j - half) === 'road_line';
          const dash = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 0.7 : 0.14, 0.02, horiz ? 0.14 : 0.7), mat(C.cream));
          dash.position.set(x - half + 0.5, h + 0.01, j - half + 0.5);
          dash.receiveShadow = true; root.add(dash);
        }
      }
      if (tile.type === 'flowerbed') {
        for (let x = i; x < e; x++) for (let q = 0; q < 3; q++) {
          const f = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), mat([C.accent, C.pink, C.cream][(x + j + q) % 3]));
          f.position.set(x - half + 0.25 + q * 0.25, h + 0.1, j - half + 0.3 + ((q * 7 + x) % 3) * 0.2);
          root.add(f);
        }
      }
      i = e;
    }
  }

  // ---------- kit pieces ----------
  const place = (type, x, z, props) => {
    const rot = props.rot || 0;
    let piece;
    if (overrides.has(type)) {
      piece = { obj: overrides.get(type).clone(true), colliders: KIT[type] ? KIT[type](props).colliders : [{ x: 0, z: 0, r: 0.5 }] };
    } else if (KIT[type]) {
      piece = KIT[type](props);
    } else {
      console.warn(`Unknown kit piece "${type}" at ${x.toFixed(1)}, ${z.toFixed(1)}`);
      piece = { obj: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat(0xff00ff)), colliders: [] };
    }
    const tile = tileAt(map, x, z);
    piece.obj.position.set(x, tile ? Math.max(0, groundHeight(tile.type)) : 0, z);
    piece.obj.rotation.y = (-rot * Math.PI) / 180;
    root.add(piece.obj);
    if (piece.dynamic) piece.obj.userData.dynamic = true;
    if (piece.animate) animated.push(piece.animate);
    if (piece.api) apis[type] = piece.api;
    for (const c of piece.colliders || []) colliders.push(transformCollider(c, x, z, rot));
    for (const f of piece.floors || []) {
      const r = transformCollider(f, x, z, rot);
      if (r.minX !== undefined) floors.push({ ...r, h: f.h + piece.obj.position.y });
    }
    return piece;
  };
  for (const o of map.objects) {
    if (o.type === 'rain_zone') { if (o.w) weather.push(buildRain(root, o, animated)); continue; }
    if (o.type === 'hedge') place('hedge', o.x, o.z, { ...o.props, w: o.w, d: o.d });
    else place(o.type, o.x, o.z, o.props);
  }
  for (const c of map.collision) {
    if (c.ellipse) colliders.push({ cx: c.x, cz: c.z, r: Math.max(c.w, c.d) / 2 });
    else if (c.w) colliders.push({ minX: c.x - c.w / 2, maxX: c.x + c.w / 2, minZ: c.z - c.d / 2, maxZ: c.z + c.d / 2 });
  }

  // ---------- interactables ----------
  const beacon = (x, y, z, { small = false } = {}) => {
    const g = new THREE.Group();
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(small ? 0.24 : 0.34, 0), mat(C.accent, { emissive: 0x7a2a10, keep: true }));
    gem.castShadow = true; g.add(gem);
    const ring = new THREE.Mesh(new THREE.RingGeometry(small ? 0.5 : 0.75, small ? 0.62 : 0.95, 20), new THREE.MeshBasicMaterial({ color: C.accent, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -y + 0.18; g.add(ring);
    g.position.set(x, y, z); g.userData.dynamic = true;
    root.add(g);
    animated.push((t) => { gem.rotation.y = t * 1.6; gem.position.y = Math.sin(t * 2.2 + x) * 0.12; ring.scale.setScalar(1 + Math.sin(t * 3 + z) * 0.06); });
    return { group: g, gem, ring };
  };
  const sparkle = (x, z) => {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), mat(0xfff3d6, { emissive: 0xffb347, emissiveIntensity: 0.9, keep: true }));
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 4), new THREE.MeshBasicMaterial({ color: C.accent, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    g.add(core, halo); g.position.set(x, 1.1, z); g.userData.dynamic = true;
    root.add(g);
    animated.push((t) => {
      core.rotation.y = t * 2.4; core.position.y = Math.sin(t * 3 + x) * 0.08;
      halo.lookAt(halo.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(1, 0.8, 1)));
      halo.rotation.z = t; halo.material.opacity = 0.5 + Math.sin(t * 4 + z) * 0.35;
    });
    return { group: g, gem: core, ring: halo };
  };
  const hitBox = (it, w = 2.4, h = 3, d = 2.4) => {
    const hit = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(it.x, h / 2, it.z); hit.userData = { dynamic: true, interactable: it };
    root.add(hit); it.hit = hit;
  };

  for (const o of map.interact) {
    const pr = o.props;
    const base = { x: o.x, z: o.z, visited: false };
    if (o.type === 'chapter' || o.type === 'about') {
      const it = { ...base, id: pr.id, kind: o.type, district: pr.district || 'plaza', radius: 2.0 };
      it.beacon = beacon(o.x, 2.4, o.z); hitBox(it); interactables.push(it);
    } else if (o.type === 'project') {
      const project = (content.projects || [])[pr.index];
      if (!project) continue;
      const it = { ...base, id: `project:${project.id}`, kind: 'project', district: 'garage', projectId: project.id, radius: 1.5 };
      it.beacon = beacon(o.x, 1.9, o.z, { small: true }); hitBox(it, 1.6, 3, 1.8); interactables.push(it);
    } else if (o.type === 'minigame') {
      const it = { ...base, id: `minigame:${pr.id}`, kind: 'minigame', game: pr.id, district: pr.district, radius: 1.6 };
      it.beacon = beacon(o.x, 2.7, o.z, { small: true }); hitBox(it, 2, 3, 2); interactables.push(it);
    } else if (o.type === 'memory') {
      const memory = (content.memories || []).find((m) => m.id === pr.id);
      if (!memory) continue;
      const it = { ...base, id: `memory:${memory.id}`, kind: 'memory', memoryId: memory.id, district: memory.district, radius: 1.4 };
      it.beacon = sparkle(o.x, o.z); hitBox(it, 1.4, 2.4, 1.4); interactables.push(it);
    } else if (o.type === 'panel') {
      const it = { ...base, id: `panel:${pr.id}`, kind: 'panel', panel: pr.panel, title: pr.title || pr.panel, district: pr.district, radius: 1.8 };
      it.beacon = beacon(o.x, 2.2, o.z, { small: true }); hitBox(it, 2, 3, 2); interactables.push(it);
    } else if (o.type === 'finale') {
      const it = { ...base, id: 'finale', kind: 'finale', district: 'lighthouse', radius: 2.0 };
      it.beacon = beacon(o.x, 2.6, o.z); hitBox(it); interactables.push(it);
    } else if (o.type === 'station') {
      const it = { ...base, id: `station:${pr.id}`, kind: 'station', stationId: pr.id, name: pr.name || pr.id, district: pr.district, radius: 2.4 };
      it.beacon = beacon(o.x, 2.3, o.z, { small: true }); hitBox(it, 2.4, 3, 2.4); interactables.push(it);
    } else if (o.type === 'npc') {
      const def = (content.npcs || []).find((n) => n.id === pr.id);
      if (!def) continue;
      const ch = new Character(OUTFITS[def.outfit] || OUTFITS[def.id] || OUTFITS.coach);
      const tile = tileAt(map, o.x, o.z);
      ch.group.position.set(o.x, tile ? Math.max(0, groundHeight(tile.type)) : 0, o.z);
      ch.heading = ((pr.rot ?? 0) * Math.PI) / 180; // 0 = facing +z (towards the camera)
      ch.group.userData.dynamic = true;
      root.add(ch.group);
      colliders.push({ cx: o.x, cz: o.z, r: 0.45 });
      const it = { ...base, id: `npc:${def.id}`, kind: 'npc', npcId: def.id, district: def.district, radius: 2.0, character: ch, homeHeading: ch.heading };
      hitBox(it, 1.2, 2.6, 1.2);
      interactables.push(it); npcs.push(it);
    }
  }

  // ---------- ambient walkers ----------
  for (const path of map.paths) {
    if (!path.points || path.points.length < 2) continue;
    const ch = new Character(OUTFITS[path.props.outfit] || OUTFITS.teal);
    ch.group.userData.dynamic = true;
    root.add(ch.group);
    const pts = path.points.map((q) => new THREE.Vector3(q.x, 0, q.z));
    walkers.push({ ch, pts, loop: !!path.props.loop || path.closed, seg: 0, dir: 1, t: 0, wait: Math.random() * 2 });
    ch.group.position.copy(pts[0]);
  }

  // ---------- labels ----------
  const labels = map.labels.map((l) => ({ text: l.props.text || l.name, color: l.props.color || '#1e1b2e', pos: new THREE.Vector3(l.x, l.props.height || 5, l.z) }));

  // ---------- Memory Line ----------
  const stations = interactables.filter((i) => i.kind === 'station');
  const railway = buildRailway(root, map, stations, animated);

  mergeStatic(root);
  return { root, colliders, interactables, animated, labels, npcs, walkers, map, floors, railway, stations, weather, apis };
}

function tileType(map, x, z) { return tileAt(map, x + 0.5, z + 0.5)?.type; }

function transformCollider(c, x, z, rotDeg) {
  const a = (-rotDeg * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const cx = x + c.x * cos + c.z * sin, cz = z - c.x * sin + c.z * cos;
  if (c.r !== undefined) return { cx, cz, r: c.r };
  const q = ((Math.round(rotDeg / 90) % 4) + 4) % 4;
  const axisAligned = Math.abs(rotDeg / 90 - Math.round(rotDeg / 90)) < 0.01;
  if (!axisAligned) return { cx, cz, r: Math.hypot(c.w, c.d) / 2 };
  const w = q % 2 ? c.d : c.w, d = q % 2 ? c.w : c.d;
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
}

/** Walker NPCs stroll along their Tiled polylines, pausing at the ends. */
export function updateWalkers(walkers, dt, t, heightAt) {
  for (const w of walkers) {
    const v = new THREE.Vector3();
    if (w.wait > 0) {
      w.wait -= dt;
    } else {
      const a = w.pts[w.seg], b = w.pts[w.seg + w.dir];
      const len = a.distanceTo(b);
      w.t += (dt * 1.35) / Math.max(0.01, len);
      if (w.t >= 1) {
        w.t = 0; w.seg += w.dir;
        const end = w.dir > 0 ? w.seg >= w.pts.length - 1 : w.seg <= 0;
        if (end) {
          if (w.loop) w.seg = 0;
          else { w.dir *= -1; w.wait = 2 + Math.random() * 3; }
        }
      } else {
        w.ch.group.position.lerpVectors(a, b, w.t);
        v.subVectors(b, a).normalize().multiplyScalar(1.35);
      }
    }
    w.ch.group.position.y = heightAt(w.ch.group.position.x, w.ch.group.position.z);
    w.ch.update(dt, v, t);
  }
}

function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  const victims = [];
  root.traverse((o) => {
    if (o === root) return;
    // skip anything inside a dynamic subtree
    for (let p = o; p && p !== root; p = p.parent) if (p.userData.dynamic) return;
    if (!o.isMesh || Array.isArray(o.material) || o.material.map || !o.visible) return;
    const key = `${o.material.uuid}|${o.castShadow}`;
    if (!groups.has(key)) groups.set(key, { material: o.material, cast: o.castShadow, geos: [] });
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(o.matrixWorld);
    groups.get(key).geos.push(g);
    victims.push(o);
  });
  for (const v of victims) v.parent.remove(v);
  // remove now-empty groups
  const empties = [];
  root.traverse((o) => { if (o !== root && !o.isMesh && !o.isLight && o.children.length === 0 && !o.userData.dynamic) empties.push(o); });
  empties.forEach((e) => e.parent && e.parent.remove(e));
  for (const { material, cast, geos } of groups.values()) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, material);
    m.castShadow = cast; m.receiveShadow = true;
    root.add(m);
  }
}
