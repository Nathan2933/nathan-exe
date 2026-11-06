// Loads a Tiled JSON map (.tmj) + its external tilesets (.tsj) and converts it
// into world-space data (1 tile = 1 metre, origin at the map centre).
//
// Conventions (see docs/WORKFLOW.md):
//   tile layer  "ground"     — tile class/type = ground material (grass, road, …)
//   object layer "objects"   — point = kit piece (type = piece name), rect "hedge" = hedge run
//   object layer "interact"  — chapter / memory / npc / minigame / project / about
//   object layer "collision" — extra rectangles / ellipses that block movement
//   object layer "labels"    — floating district names
//   object layer "paths"     — polylines for ambient NPC walkers
//   object layer "spawn"     — player start point
//   object layer "rail"      — one closed polygon: the Memory Line track

export async function loadTiledMap(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Map ${url}: ${res.status}`);
  const map = await res.json();
  const base = url.slice(0, url.lastIndexOf('/') + 1);

  // gid -> { type, color, walkable }
  const tiles = new Map();
  for (const ts of map.tilesets) {
    const def = ts.source ? await (await fetch(base + ts.source, { cache: 'no-store' })).json() : ts;
    for (const t of def.tiles || []) {
      const p = propsOf(t);
      tiles.set(ts.firstgid + t.id, {
        type: t.type || t.class || `tile${t.id}`,
        color: p.color ? argbToHex(p.color) : '#ff00ff',
        walkable: p.walkable !== false,
      });
    }
  }

  const px = map.tilewidth;
  const half = map.width / 2;
  const toWorld = (x, y) => ({ x: x / px - half, z: y / px - half });

  const out = {
    width: map.width, height: map.height, half,
    props: propsOf(map),
    ground: null, tiles,
    objects: [], interact: [], collision: [], labels: [], paths: [], spawn: null, rail: null,
  };

  for (const layer of map.layers) {
    if (layer.type === 'tilelayer' && layer.name === 'ground') {
      out.ground = Uint16Array.from(layer.data);
      continue;
    }
    if (layer.type !== 'objectgroup' || layer.visible === false) continue;
    for (const o of layer.objects) {
      if (o.visible === false) continue;
      const type = o.type || o.class || '';
      const p = propsOf(o);
      let entry;
      if (o.point) {
        entry = { type, name: o.name, ...toWorld(o.x, o.y), props: p };
      } else if (o.polyline || o.polygon) {
        const pts = (o.polyline || o.polygon).map((q) => toWorld(o.x + q.x, o.y + q.y));
        entry = { type, name: o.name, points: pts, closed: !!o.polygon, props: p };
      } else {
        const a = toWorld(o.x, o.y), b = toWorld(o.x + o.width, o.y + o.height);
        entry = { type, name: o.name, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, w: b.x - a.x, d: b.z - a.z, ellipse: !!o.ellipse, props: p };
      }
      if (o.rotation) entry.props.rot = (entry.props.rot || 0) + o.rotation;
      switch (layer.name) {
        case 'objects': out.objects.push(entry); break;
        case 'interact': out.interact.push(entry); break;
        case 'collision': out.collision.push(entry); break;
        case 'labels': out.labels.push(entry); break;
        case 'paths': out.paths.push(entry); break;
        case 'spawn': out.spawn = entry; break;
        case 'rail': if (entry.points) out.rail = entry; break;
        default: break;
      }
    }
  }
  return out;
}

/** Ground tile info at a world position. */
export function tileAt(map, x, z) {
  const i = Math.floor(x + map.half), j = Math.floor(z + map.half);
  if (i < 0 || j < 0 || i >= map.width || j >= map.height) return null;
  const gid = map.ground[j * map.width + i];
  return gid ? map.tiles.get(gid) : null;
}

function propsOf(o) {
  const p = {};
  for (const prop of o.properties || []) p[prop.name] = prop.value;
  return p;
}
function argbToHex(c) {
  // Tiled stores colours as #AARRGGBB
  return c.length === 9 ? '#' + c.slice(3) : c;
}
