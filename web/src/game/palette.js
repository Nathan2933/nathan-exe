import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Palette switching for the whole world. Every Lambert material created by the
// kit, the ground builder and the characters is registered here with its
// original ("bright") colour. In pastel mode each colour is remapped to the
// closest-hue swatch from the pastel chart below, keeping the original
// light/dark relationship so shapes and silhouettes still read.

// Swatches from the reference chart (8 palettes × 5).
export const PASTEL_SWATCHES = [
  '#FCD1E5', '#E9BBE0', '#B795E4', '#9B9BE3', '#9DDFF2',
  '#B7EDF7', '#B4D4F0', '#FCE0EC', '#FBB1D3', '#FFF1C2',
  '#EFFFDF', '#CEEFC4', '#D3F0FF', '#BCD4F0', '#FFD1E9',
  '#F7A0D5', '#FF9DCC', '#FFA690', '#FFC597', '#FFE791',
  '#EFEFEF', '#B1E0F3', '#72D0F7', '#78BBF4', '#8993F1',
  '#EEEAF0', '#D8CAF0', '#C2A9EF', '#AC88E8', '#8667C0',
  '#BBE9FF', '#CAFFBF', '#FDFFB6', '#FFD6A5', '#FFADAD',
  '#FFADFF', '#B2FFA3', '#94F0FF', '#7FB0FF',
].map((h) => {
  const c = new THREE.Color(h);
  const hsl = {}; c.getHSL(hsl);
  return { color: c, ...hsl };
});

export const SKY = {
  bright: { start: 0x8fdcf0, end: 0xffc98f, sea: 0x2fb3c9 },
  pastel: { start: 0xbbe9ff, end: 0xffd6a5, sea: 0x9ddff2 },
};

const registry = [];
const seen = new WeakSet();
const origColors = new WeakMap();
const vcRegistry = [];
let current = 'bright';

/** Track a material so palette changes can recolour it. Returns the material. */
export function registerMaterial(m) {
  if (!m || seen.has(m) || !m.color) return m;
  seen.add(m);
  const orig = m.color.clone();
  origColors.set(m, orig);
  registry.push({ m, orig });
  if (current !== 'bright') m.color.copy(pastelizeRef(orig));
  return m;
}

/** Drop disposed non-shared materials when tearing down an island world. */
export function unregisterMaterials(matSet) {
  if (!matSet || !matSet.size) return;
  for (let i = registry.length - 1; i >= 0; i--) {
    if (matSet.has(registry[i].m)) registry.splice(i, 1);
  }
}

/** Drop disposed vertex-colored geometries when tearing down a world or character. */
export function unregisterVertexColors(geoSet) {
  if (!geoSet || !geoSet.size) return;
  for (let i = vcRegistry.length - 1; i >= 0; i--) {
    if (geoSet.has(vcRegistry[i].geo)) vcRegistry.splice(i, 1);
  }
}

const cache = new Map();
function pastelizeRef(color) {
  const key = color.getHex();
  if (cache.has(key)) return cache.get(key);
  const hsl = {}; color.getHSL(hsl);
  let out;
  if (hsl.l < 0.2) {
    // Deep inks become a soft plum so outlines and roofs still anchor the scene.
    out = new THREE.Color().setHSL(0.72, 0.28, 0.24 + hsl.l * 0.6);
  } else if (hsl.s < 0.22 || (hsl.s < 0.32 && hsl.l < 0.62)) {
    // Neutrals (concrete, steel, cream) → the chart's lavender greys.
    out = new THREE.Color().setHSL(0.74, 0.16, 0.5 + hsl.l * 0.42);
  } else {
    // Nearest swatch by hue (circular), lightly weighted by saturation match.
    let best = PASTEL_SWATCHES[0], bestD = Infinity;
    for (const sw of PASTEL_SWATCHES) {
      if (sw.s < 0.2) continue;
      let dh = Math.abs(sw.h - hsl.h); dh = Math.min(dh, 1 - dh);
      const d = dh * 3 + Math.abs(sw.l - (0.66 + hsl.l * 0.28)) * 0.8 + sw.s * 0.35;
      if (d < bestD) { bestD = d; best = sw; }
    }
    // Keep relative lightness: darker originals → darker version of the swatch.
    const l = Math.min(0.94, Math.max(0.42, best.l * (0.72 + hsl.l * 0.5)));
    out = new THREE.Color().setHSL(best.h, Math.min(0.7, best.s * 0.72), l);
  }
  cache.set(key, out);
  return out;
}

export function pastelize(color) {
  return pastelizeRef(color).clone();
}

function applyVcRuns(attr, runs, mode) {
  const arr = attr.array;
  const pastel = mode === 'pastel';
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r];
    const col = pastel && run.recolor ? pastelizeRef(run.orig) : run.orig;
    const cr = col.r, cg = col.g, cb = col.b;
    let idx = run.start * 3;
    const end = idx + run.count * 3;
    while (idx < end) {
      arr[idx++] = cr;
      arr[idx++] = cg;
      arr[idx++] = cb;
    }
  }
  attr.needsUpdate = true;
}

export function isVertexColorCandidate(mat) {
  return !!(
    mat &&
    mat.isMeshLambertMaterial &&
    !Array.isArray(mat) &&
    !mat.map &&
    !mat.alphaMap &&
    !mat.transparent &&
    mat.opacity === 1 &&
    mat.alphaTest === 0 &&
    !mat.vertexColors &&
    mat.color &&
    (!mat.emissive || mat.emissive.getHex() === 0)
  );
}

/**
 * Merge opaque, untextured Lambert meshes into a single vertex-coloured BufferGeometry
 * so multi-colour pieces collapse into one draw call while preserving Bright/Pastel shifts.
 */
export function mergeVertexColorMeshes(meshes, { worldSpace = false, trackPalette = true } = {}) {
  if (!meshes || meshes.length < 2) return null;
  const geos = [];
  const runs = [];
  let offset = 0;
  for (let i = 0; i < meshes.length; i++) {
    const o = meshes[i];
    if (!o.geometry) continue;
    const mat4 = worldSpace ? o.matrixWorld : (o.updateMatrix(), o.matrix);
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(mat4);
    const count = g.attributes.position.count;
    const orig = origColors.get(o.material) || o.material.color;
    const recolor = seen.has(o.material);
    const hexVal = orig.getHex();
    const last = runs.length ? runs[runs.length - 1] : null;
    if (last && last.hex === hexVal && last.recolor === recolor) {
      last.count += count;
    } else {
      runs.push({ start: offset, count, orig: orig.clone(), hex: hexVal, recolor });
    }
    offset += count;
    geos.push(g);
  }
  if (!geos.length) return null;
  const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  if (geos.length > 1) {
    for (let i = 0; i < geos.length; i++) geos[i].dispose();
  }
  if (!merged) return null;
  const attr = new THREE.Float32BufferAttribute(new Float32Array(offset * 3), 3);
  merged.setAttribute('color', attr);
  applyVcRuns(attr, runs, current);
  if (trackPalette) vcRegistry.push({ geo: merged, attr, runs });
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function applyPalette(name) {
  current = name === 'pastel' ? 'pastel' : 'bright';
  for (const { m, orig } of registry) {
    if (current === 'pastel') m.color.copy(pastelizeRef(orig));
    else m.color.copy(orig);
  }
  for (let i = 0; i < vcRegistry.length; i++) {
    applyVcRuns(vcRegistry[i].attr, vcRegistry[i].runs, current);
  }
}

export const currentPalette = () => current;
