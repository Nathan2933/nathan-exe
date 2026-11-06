import * as THREE from 'three';

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
let current = 'bright';

/** Track a material so palette changes can recolour it. Returns the material. */
export function registerMaterial(m) {
  if (!m || seen.has(m) || !m.color) return m;
  seen.add(m);
  registry.push({ m, orig: m.color.clone() });
  if (current !== 'bright') m.color.copy(pastelize(m.color));
  return m;
}

const cache = new Map();
export function pastelize(color) {
  const key = color.getHex();
  if (cache.has(key)) return cache.get(key).clone();
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
  return out.clone();
}

export function applyPalette(name) {
  current = name === 'pastel' ? 'pastel' : 'bright';
  for (const { m, orig } of registry) {
    if (current === 'pastel') m.color.copy(pastelize(orig));
    else m.color.copy(orig);
  }
}

export const currentPalette = () => current;
