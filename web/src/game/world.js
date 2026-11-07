import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KIT, buildHorse, buildBicycle, buildMotorbike, mat, C } from './kit.js';
import { tileAt } from './tiled.js';
import { Character, OUTFITS, appearanceToOutfit } from './player.js';
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
  const nightGlow = []; // light pools etc. faded in at night
  const bayScreens = []; // Garage project bays, by index
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
  // (no foam ring: a perfect circle never matched the island's real outline)

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
  const seats = []; // benches become seats once the E-spot helpers exist
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
    if (type === 'bench') {
      // every bench is a seat: E to sit, E again (or walk) to stand
      const a = (-rot * Math.PI) / 180, sx = x + 0.06 * Math.sin(a), sz = z + 0.06 * Math.cos(a);
      seats.push({ x: x + 0.85 * Math.sin(a), z: z + 0.85 * Math.cos(a), id: `seat:${x.toFixed(1)},${z.toFixed(1)}`, kind: 'seat', seat: { x: sx, z: sz, heading: a }, radius: 1.3, visited: false, district: 'plaza' });
    }
    if (piece.api) apis[props.variant ? `${type}_${props.variant}` : type] = piece.api;
    if (piece.nightGlow) nightGlow.push(...piece.nightGlow);
    if (piece.screen && props.index !== undefined) bayScreens[props.index] = piece.screen;
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
  // Checkpoint marker: a glowing ring on the ground, a soft lit disc inside it
  // and a faint column of light so it reads from across the map.
  const beacon = (x, _y, z, { small = false, pillar: withPillar = true } = {}) => {
    const g = new THREE.Group();
    const R = small ? 0.62 : 0.95;
    const tile = tileAt(map, x, z);
    g.position.set(x, (tile ? Math.max(0, groundHeight(tile.type)) : 0) + 0.04, z);
    const add = (m) => { m.renderOrder = 2; g.add(m); return m; };
    const glowMat = (opacity, map2 = null, additive = true) => new THREE.MeshBasicMaterial({ color: 0xffa040, map: map2, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide });
    const disc = add(new THREE.Mesh(new THREE.CircleGeometry(R * 1.25, 32), glowMat(0.75, radialTex(), false)));
    disc.rotation.x = -Math.PI / 2;
    const ring = add(new THREE.Mesh(new THREE.RingGeometry(R * 0.86, R, 40), new THREE.MeshBasicMaterial({ color: 0xff7a35, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide })));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01;
    const pillar = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.82, R * 0.9, small ? 1.6 : 2.4, 24, 1, true), glowMat(0.5, pillarTex())));
    pillar.position.y = (small ? 1.6 : 2.4) / 2;
    pillar.visible = true; void withPillar;
    g.userData.dynamic = true;
    root.add(g);
    const api = {
      group: g, gem: disc, ring,
      prom: 1, // 1 = normal; main.js lowers it for far-away spots and raises the nearest
      setVisited() { /* every E spot looks the same, visited or not */ },
    };
    let pr = 1;
    animated.push((t) => {
      pr += (api.prom - pr) * 0.1;
      const k = 0.5 + 0.5 * Math.sin(t * 2.6 + x);
      ring.scale.setScalar((1 + k * 0.07) * (pr > 1 ? 1 + (pr - 1) * 0.35 : 1));
      ring.material.opacity = Math.min(1, 0.35 + 0.65 * pr);
      disc.material.opacity = (0.4 + k * 0.3) * Math.min(1.2, pr);
      pillar.material.opacity = (0.28 + k * 0.22) * Math.min(1.3, pr);
    });
    return api;
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

  for (const it of seats) { it.beacon = beacon(it.x, 1.2, it.z, { small: true }); hitBox(it, 1.4, 1.6, 1.4); interactables.push(it); }
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
      it.beacon = sparkle(o.x, o.z); it.ground = beacon(o.x, 0, o.z, { small: true, pillar: false });
      hitBox(it, 1.4, 2.4, 1.4); interactables.push(it);
    } else if (o.type === 'panel') {
      const it = { ...base, id: `panel:${pr.id}`, kind: 'panel', panel: pr.panel, title: pr.title || pr.panel, district: pr.district, attraction: pr.attraction, interest: pr.interest, place: pr.place, radius: 1.8 };
      it.beacon = beacon(o.x, 2.2, o.z, { small: true }); hitBox(it, 2, 3, 2); interactables.push(it);
    } else if (o.type === 'finale') {
      const it = { ...base, id: 'finale', kind: 'finale', district: 'lighthouse', radius: 2.0 };
      it.beacon = beacon(o.x, 2.6, o.z); hitBox(it); interactables.push(it);
    } else if (o.type === 'activity') {
      // Tahiti activity spot (party, race, dance battle, food, volleyball, clues, treasure, gallery)
      const it = { ...base, id: `activity:${pr.id}`, kind: 'activity', act: pr.act, title: pr.title || pr.act, treasureId: pr.treasure, gang: pr.gang, district: 'tahiti', radius: 1.6 };
      it.beacon = beacon(o.x, 1.6, o.z, { small: true }); hitBox(it, 1.4, 2.2, 1.4); interactables.push(it);
    } else if (o.type === 'group') {
      // shared group conversation spot (Join the Gang / Join the Outlaws)
      const it = { ...base, id: `group:${pr.id}`, kind: 'group', groupId: pr.id, title: pr.title || 'Join in', district: 'tahiti', radius: 1.6 };
      it.beacon = beacon(o.x, 2.0, o.z, { small: true }); hitBox(it, 1.6, 2.6, 1.6); interactables.push(it);
    } else if (o.type === 'vehicle') {
      // rideable bicycle / horse, parked at its rack or post
      const vt = pr.vtype === 'horse' ? 'horse' : pr.vtype === 'moto' ? 'moto' : 'bike';
      const model = vt === 'horse' ? buildHorse(0x8a5a36, 0x2a1a12) : vt === 'moto' ? buildMotorbike(pr.color ? parseInt(String(pr.color).replace('#', ''), 16) : 0xc4302b) : buildBicycle(pr.color ? parseInt(String(pr.color).replace('#', ''), 16) : 0x2f5fb0);
      const heading = ((pr.rot ?? 0) * Math.PI) / 180;
      const tile = tileAt(map, o.x, o.z);
      model.group.position.set(o.x, tile ? Math.max(0, groundHeight(tile.type)) : 0, o.z);
      model.group.rotation.y = heading + (vt === 'horse' ? -Math.PI / 2 : 0);
      root.add(model.group);
      const it = { ...base, id: `vehicle:${pr.id}`, kind: 'vehicle', vtype: vt, model, heading, home: { x: o.x, z: o.z, heading }, district: pr.district, radius: 1.5 };
      it.beacon = beacon(o.x, 1.6, o.z, { small: true }); hitBox(it, 1.4, 2, 1.4); interactables.push(it);
    } else if (o.type === 'station') {
      const it = { ...base, id: `station:${pr.id}`, kind: 'station', stationId: pr.id, name: pr.name || pr.id, district: pr.district, order: pr.order || 0, tagline: pr.tagline || '', radius: 2.4 };
      it.beacon = beacon(o.x, 2.3, o.z, { small: true }); hitBox(it, 2.4, 3, 2.4); interactables.push(it);
    } else if (o.type === 'npc') {
      const def = (content.npcs || []).find((n) => n.id === pr.id);
      if (!def) continue;
      if (npcs.some((n) => n.npcId === def.id)) continue;
      npcs.push(makeNpc(def, [new THREE.Vector3(o.x, 0, o.z)], false, ((pr.rot ?? 0) * Math.PI) / 180));
    }
  }

  // ---------- named NPCs on their Tiled routes ----------
  for (const path of map.paths) {
    if (path.type !== 'npc_route' || !path.points?.length) continue;
    const def = (content.npcs || []).find((n) => n.id === path.props.npc);
    if (!def) { console.warn(`Route for unknown NPC "${path.props.npc}"`); continue; }
    if (npcs.some((n) => n.npcId === def.id)) continue;
    const pts = path.points.map((q) => new THREE.Vector3(q.x, 0, q.z));
    npcs.push(makeNpc(def, pts, !!path.props.loop || path.closed, 0, path.props));
  }
  function makeNpc(def, pts, loop, heading, props = {}) {
    const ch = new Character(def.outfit && OUTFITS[def.outfit] ? OUTFITS[def.outfit] : appearanceToOutfit(def));
    const p0 = pts[0];
    const tile = tileAt(map, p0.x, p0.z);
    ch.group.position.set(p0.x, tile ? Math.max(0, groundHeight(tile.type)) : 0, p0.z);
    ch.heading = heading;
    ch.group.userData.dynamic = true;
    root.add(ch.group);
    const it = {
      x: p0.x, z: p0.z, visited: false, id: `npc:${def.id}`, kind: 'npc', npcId: def.id, district: def.district,
      radius: 2.0, character: ch, homeHeading: heading,
      route: {
        pts, loop, seg: 0, dir: 1, t: 0, wait: 1 + Math.random() * 2,
        // optional per-waypoint idle pose ("sit,look,check") and facing in degrees ("0,,90")
        idles: String(props.idles || '').split(',').map((v) => v.trim()),
        faces: String(props.faces || '').split(',').map((v) => (v.trim() === '' ? null : (Number(v) * Math.PI) / 180)),
      },
    };
    if (def.companion === 'horse') {
      // a horse that ambles along behind its rider and stops beside them
      const h = buildHorse(def.horseColor === 'brown' ? 0x7a4a2a : 0xf2efe8, def.horseColor === 'brown' ? 0x2a1a12 : 0xd6d0c4);
      h.group.position.set(p0.x - 1.4, ch.group.position.y, p0.z + 0.8);
      root.add(h.group);
      it.companion = { ...h, phase: 0 };
      it.ride = !!props.ride; // rider sits on the horse and they move as one
    }
    if (it.route.idles[0]) { ch.pose = it.route.idles[0]; it.route.wait = 3 + Math.random() * 3; }
    if (it.route.faces[0] != null) { ch.heading = it.route.faces[0]; it.homeHeading = it.route.faces[0]; }
    it.beacon = beacon(p0.x, 0, p0.z, { pillar: false });
    hitBox(it, 1.2, 2.6, 1.2);
    interactables.push(it);
    return it;
  }

  // ---------- ambient walkers (legacy "walk" paths) ----------
  for (const path of map.paths) {
    if (path.type === 'npc_route' || !path.points || path.points.length < 2) continue;
    const ch = new Character(OUTFITS[path.props.outfit] || OUTFITS.teal);
    ch.group.userData.dynamic = true;
    root.add(ch.group);
    const pts = path.points.map((q) => new THREE.Vector3(q.x, 0, q.z));
    walkers.push({ ch, pts, loop: !!path.props.loop || path.closed, seg: 0, dir: 1, t: 0, wait: Math.random() * 2 });
    ch.group.position.copy(pts[0]);
  }

  // ---------- labels ----------
  const labels = map.labels.map((l) => ({ text: l.props.text || l.name, color: l.props.color || '#1e1b2e', pos: new THREE.Vector3(l.x, l.props.height || 5, l.z) }));

  // ---------- Garage bays: one project per bay ----------
  bayScreens.forEach((screen, i) => { if (screen) setBayScreen(screen, (content.projects || [])[i]); });

  // ---------- Memory Line ----------
  const stations = interactables.filter((i) => i.kind === 'station');
  const railway = buildRailway(root, map, stations, animated);

  mergeStatic(root);
  return { root, colliders, interactables, animated, labels, npcs, walkers, map, floors, railway, stations, weather, apis, nightGlow };
}

let _radial = null, _pillar = null;
function radialTex() {
  if (_radial) return _radial;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (_radial = new THREE.CanvasTexture(c));
}
function pillarTex() {
  if (_pillar) return _pillar;
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 64, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  return (_pillar = new THREE.CanvasTexture(c));
}

/** Title card for a project bay; swapped for the project's image when it has one. */
function setBayScreen(screen, project) {
  const c = document.createElement('canvas'); c.width = 640; c.height = 360;
  const g = c.getContext('2d');
  g.fillStyle = '#261e3a'; g.fillRect(0, 0, 640, 360);
  g.strokeStyle = '#f3e3c3'; g.lineWidth = 6; g.strokeRect(14, 14, 612, 332);
  g.textBaseline = 'top';
  if (!project) {
    g.fillStyle = '#9d91bd'; g.font = '30px Silkscreen, monospace'; g.textAlign = 'center';
    g.fillText('BAY OPEN', 320, 150); g.font = '18px Silkscreen, monospace'; g.fillText('next project goes here', 320, 196);
  } else {
    g.textAlign = 'left';
    g.fillStyle = '#ffb347'; g.font = '18px Silkscreen, monospace';
    g.fillText(project.year ? `PROJECT · ${project.year}` : 'PROJECT', 40, 40);
    g.fillStyle = '#fff6e6';
    let size = 40; g.font = `${size}px Silkscreen, monospace`;
    const title = String(project.title || '').split(':')[0].toUpperCase();
    while (size > 18 && g.measureText(title).width > 560) { size -= 2; g.font = `${size}px Silkscreen, monospace`; }
    g.fillText(title, 40, 74);
    g.fillStyle = '#cfc3e6'; g.font = '20px Inter, sans-serif';
    const words = String(project.pitch || '').split(' '); let line = '', y = 74 + size + 26;
    for (const w of words) {
      if (g.measureText(line + w).width > 560) { g.fillText(line, 40, y); line = ''; y += 28; if (y > 250) break; }
      line += w + ' ';
    }
    if (y <= 250) g.fillText(line, 40, y);
    g.font = '15px Silkscreen, monospace'; let x = 40;
    for (const t of (project.stack || []).slice(0, 5)) {
      const tw = g.measureText(t).width + 18;
      if (x + tw > 600) break;
      g.strokeStyle = '#9d91bd'; g.lineWidth = 2; g.strokeRect(x, 292, tw, 30);
      g.fillStyle = '#fff6e6'; g.fillText(t, x + 9, 300); x += tw + 10;
    }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  screen.material = new THREE.MeshBasicMaterial({ map: tex });
  if (project?.image) {
    const base = import.meta.env.BASE_URL || '/';
    const url = /^https?:/.test(project.image) ? project.image : base + String(project.image).replace(/^\//, '');
    new THREE.TextureLoader().load(url, (img) => { img.colorSpace = THREE.SRGBColorSpace; screen.material = new THREE.MeshBasicMaterial({ map: img }); }, undefined, () => {});
  }
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
/**
 * Named NPCs roam their own route (inside their district), pausing now and
 * then. They stop and turn to Nathan when he comes close, stay put while
 * talking, then carry on. The interaction circle and hit box follow them.
 */
const NPC_SPEED = 1.1, STOP_DIST = 2.4;
const _v = new THREE.Vector3(), _ahead = new THREE.Vector3();
export function updateNpcs(npcs, dt, t, heightAt, player, talkingTo) {
  for (const it of npcs) {
    if (it.frozen || it.brain) continue; // driven by a cinematic or by Tahiti's activity brains
    const ch = it.character, gp = ch.group.position, r = it.route;
    _v.set(0, 0, 0);
    const dP = player ? Math.hypot(player.x - gp.x, player.z - gp.z) : 99;
    const turnTo = (x, z, rate) => {
      const target = Math.atan2(x - gp.x, z - gp.z);
      ch.heading += Math.atan2(Math.sin(target - ch.heading), Math.cos(target - ch.heading)) * Math.min(1, dt * rate);
    };
    if (it.focus) {
      // in a group scene: stay put (seated people stay seated) and turn to whoever is talking
      ch.lookAt(it.focus);
      turnTo(it.focus.x, it.focus.z, 3);
      if (r) r.wait = Math.max(r.wait, 0.8);
      if (!ch.pose && r?.idles?.[r.seg] && r.pts.length === 1) ch.pose = r.idles[r.seg];
    } else if (it === talkingTo || dP < STOP_DIST) {
      // Nathan is here: stop and face him (people who roam stand up; settled ones stay put)
      if (it === talkingTo || (r && r.pts.length > 1)) ch.pose = null;
      ch.lookAt(player);
      turnTo(player.x, player.z, it === talkingTo ? 8 : 4);
      if (r) r.wait = Math.max(r.wait, 0.8);
    } else if (r && r.pts.length > 1) {
      ch.lookAt(null);
      if (r.wait > 0) {
        r.wait -= dt;
        const idle = r.idles?.[r.seg];
        if (idle && !ch.pose && r.wait > 0.6) ch.pose = idle;          // back to the idle after a chat
        const face = r.faces?.[r.seg];
        if (face != null) ch.heading += Math.atan2(Math.sin(face - ch.heading), Math.cos(face - ch.heading)) * Math.min(1, dt * 3);
        if (r.wait < 0.5) ch.pose = null;                              // stand up before walking on
        if (!idle && r.wait < 1 && Math.sin(t * 0.7 + gp.x) > 0.6) ch.lookAt(_ahead.set(gp.x + Math.sin(t) * 3, 0, gp.z + Math.cos(t) * 3));
      } else {
        const a = r.pts[r.seg], b = r.pts[(r.seg + r.dir + r.pts.length) % r.pts.length];
        const len = Math.max(0.01, a.distanceTo(b));
        // give way to another NPC just ahead
        const dirx = (b.x - a.x) / len, dirz = (b.z - a.z) / len;
        const blocked = npcs.some((o) => o !== it && Math.hypot(o.character.group.position.x - (gp.x + dirx * 0.7), o.character.group.position.z - (gp.z + dirz * 0.7)) < 0.75);
        if (blocked) { r.wait = 0.6; }
        else {
          r.t += (dt * NPC_SPEED) / len;
          if (r.t >= 1) {
            r.t = 0;
            r.seg = (r.seg + r.dir + r.pts.length) % r.pts.length;
            const atEnd = !r.loop && (r.seg === r.pts.length - 1 || r.seg === 0);
            if (atEnd) r.dir *= -1;
            r.wait = r.idles?.[r.seg] ? 4 + Math.random() * 4 : Math.random() < 0.5 ? 1.5 + Math.random() * 2.5 : 0.2;   // idle spots hold longer
          } else {
            gp.x = a.x + (b.x - a.x) * r.t; gp.z = a.z + (b.z - a.z) * r.t;
            _v.set(dirx, 0, dirz).multiplyScalar(NPC_SPEED);
          }
        }
      }
    } else {
      if (!ch.pose && r?.idles?.[0]) ch.pose = r.idles[0];   // settled people return to their idle
      ch.lookAt(dP < 5 ? player : null);
      ch.heading += Math.atan2(Math.sin(it.homeHeading - ch.heading), Math.cos(it.homeHeading - ch.heading)) * Math.min(1, dt * 2);
    }
    // mounted riders: face the way the horse moves, sit still in the saddle
    const rideSp = it.ride ? Math.hypot(_v.x, _v.z) : 0;
    if (it.ride) { if (rideSp > 0.05) ch.heading = Math.atan2(_v.x, _v.z); _v.set(0, 0, 0); ch.pose = 'ride'; }
    gp.y = heightAt(gp.x, gp.z) + (it.ride ? 0.7 : 0);
    ch.update(dt, _v, t);
    if (it.ride) {
      // mounted: the horse carries the rider along the route
      const c = it.companion, ground = heightAt(gp.x, gp.z), sp = rideSp;
      c.group.position.set(gp.x, ground, gp.z);
      c.group.rotation.y = ch.heading - Math.PI / 2;
      c.phase += dt * sp * 5;
      c.legs.forEach((l, i) => { l.rotation.z = Math.sin(c.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.5 * Math.min(1, sp); });
      c.head.rotation.z = sp > 0.05 ? Math.sin(c.phase) * 0.08 : Math.sin(t * 0.9) * 0.1 - 0.12;
      c.tail.rotation.x = Math.sin(t * 2.2) * 0.3;
    } else if (it.companion) {
      const c = it.companion, hp = c.group.position;
      // stand 1.5 m to the rider's left-behind; walk there, then face the same way
      const side = ch.heading + Math.PI * 0.72;
      const tx = gp.x + Math.sin(side) * 1.5, tz = gp.z + Math.cos(side) * 1.5;
      const dx = tx - hp.x, dz = tz - hp.z, dist = Math.hypot(dx, dz);
      const speed = dist > 0.25 ? Math.min(dist * 1.6, 2.2) : 0;
      if (speed > 0) { hp.x += (dx / dist) * speed * dt; hp.z += (dz / dist) * speed * dt; }
      const want = speed > 0.3 ? Math.atan2(dx, dz) - Math.PI / 2 : ch.heading - Math.PI / 2;
      c.group.rotation.y += Math.atan2(Math.sin(want - c.group.rotation.y), Math.cos(want - c.group.rotation.y)) * Math.min(1, dt * 3);
      hp.y = heightAt(hp.x, hp.z);
      c.phase += dt * speed * 5;
      c.legs.forEach((l, i) => { l.rotation.z = Math.sin(c.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.45 * Math.min(1, speed); });
      c.head.rotation.z = speed > 0 ? Math.sin(c.phase) * 0.06 : Math.sin(t * 0.9) * 0.1 - 0.15;
      c.tail.rotation.x = Math.sin(t * 2.2) * 0.3;
    }
    // keep the interaction spot glued to the character
    it.x = gp.x; it.z = gp.z;
    it.beacon.group.position.set(gp.x, heightAt(gp.x, gp.z) + 0.04, gp.z);
    it.hit.position.set(gp.x, 1.3, gp.z);
  }
}

export function updateWalkers(walkers, dt, t, heightAt, avoid = null) {
  for (const w of walkers) {
    const v = new THREE.Vector3();
    // Step aside for the player: if Nathan is right ahead, pause and look at him.
    const gp = w.ch.group.position;
    const blocked = avoid && Math.hypot(avoid.x - gp.x, avoid.z - gp.z) < 1.1;
    w.ch.lookAt(blocked ? avoid : null);
    if (blocked && w.wait <= 0) { w.ch.group.position.y = heightAt(gp.x, gp.z); w.ch.update(dt, v, t); continue; }
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
