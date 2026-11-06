import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { registerMaterial } from './palette.js';

// Characters for NATHAN.EXE. One jointed rig (hips → thighs/shins, spine →
// upper arms/forearms, neck → head) shared by Nathan and every NPC, with
// outfits as data. Animation is procedural and blended:
//   locomotion  idle ↔ walk ↔ run, driven by speed
//   turning     lean into turns from angular velocity
//   actions     interact / flex / wave / talk, faded in and out
//   look-at     head turns toward a nearby point of interest
// Every joint eases toward its target pose each frame, which gives smooth
// blending between all of the above. A rigged Blender GLB can replace the
// mesh later; the public API (group, update, play, lookAt, setBuff) stays.

const SKIN = { fair: 0xf2d3bd, tan: 0xd9a47c, brown: 0xb07a52, deep: 0x7a4e33 };

export const OUTFITS = {
  nathan: { skin: SKIN.fair, hair: 'curly', hairColor: 0x2a1d17, top: 'plaid', pants: 'jeans', shoes: 0xf6f3ec, glasses: true, teeth: true },
  coach: { skin: SKIN.brown, hair: 'buzz', hairColor: 0x1b1716, beard: true, top: 'tank', topColor: 0x1e1b2e, trim: 0xff6a3d, pants: 'shorts', pantsColor: 0x3d4250, shoes: 0xff6a3d, accessory: 'whistle', build: 1.15 },
  teal: { skin: SKIN.tan, hair: 'short', hairColor: 0x2b1e16, top: 'tee', topColor: 0x2f8f8a, pants: 'trousers', pantsColor: 0x2a2730, shoes: 0xf6f3ec },
  saffron: { skin: SKIN.brown, hair: 'long', hairColor: 0x1b1716, top: 'kurta', topColor: 0xf2a93b, pants: 'trousers', pantsColor: 0xf8f3e7, shoes: 0x8b5a3c },
  classmate: { skin: SKIN.fair, hair: 'beanie', hairColor: 0x6b3f2a, hatColor: 0xe0453a, top: 'coat', topColor: 0x2f5f9a, pants: 'trousers', pantsColor: 0x2a2730, shoes: 0x3a2a22, accessory: 'scarf', scarfColor: 0xffc14d },
  batchmate: { skin: SKIN.brown, hair: 'short', hairColor: 0x1b1716, top: 'tee', topColor: 0x6fa8dc, pants: 'jeans', shoes: 0xf6f3ec, accessory: 'bag', glasses: false },
  pink: { skin: SKIN.fair, hair: 'bun', hairColor: 0x6b3f2a, top: 'hoodie', topColor: 0xe07a8f, pants: 'jeans', shoes: 0x1e1b2e, accessory: 'bag' },
};

/**
 * Turn the flat appearance fields stored in content.json (editable in the
 * admin) into an outfit for Character. Unknown/missing fields fall back to
 * neutral defaults, so a new NPC only needs the fields that matter.
 */
const hex = (v, d) => (typeof v === 'number' ? v : typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v) ? parseInt(v.replace('#', ''), 16) : d);
export function appearanceToOutfit(a = {}) {
  if (a.species === 'panda') {
    return {
      species: 'panda', skin: 0xf7f6f1, limbColor: 0x1e1b26, hair: 'none', top: 'tee', topColor: 0xf7f6f1,
      pants: 'trousers', pantsColor: 0x1e1b26, shoes: 0x1e1b26, build: a.build ?? 1.15, height: a.height ?? 0.95,
      bowColor: hex(a.bowColor, 0xe8648e),
    };
  }
  return {
    skin: SKIN[a.skin] ?? hex(a.skin, SKIN.tan),
    hair: a.hair || 'short', hairColor: hex(a.hairColor, 0x1b1716), hatColor: hex(a.hatColor, 0xe0453a),
    top: a.top || 'tee', topColor: hex(a.topColor, 0x6fa8dc),
    pants: a.pants || 'jeans', pantsColor: hex(a.pantsColor, 0x2a2730), shoes: hex(a.shoes, 0xf6f3ec),
    glasses: !!a.glasses, beard: a.beard && a.beard !== 'none' ? a.beard : false, beardColor: hex(a.beardColor, hex(a.hairColor, 0x1b1716)),
    build: Number(a.build) || 1, height: Number(a.height) || 1,
    accessory: a.accessory || null, scarfColor: hex(a.scarfColor, 0xffc14d),
    extras: Array.isArray(a.extras) ? a.extras : String(a.extras || '').split(',').map((x) => x.trim()).filter(Boolean),
    extraColor: hex(a.extraColor, 0xf2f0ea),
  };
}

let plaidTex = null;
function plaid() {
  if (plaidTex) return plaidTex;
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d');
  g.fillStyle = '#b8393a'; g.fillRect(0, 0, 8, 8);
  g.fillStyle = 'rgba(30,27,46,.75)'; g.fillRect(0, 0, 3, 8); g.fillRect(0, 0, 8, 3);
  g.fillStyle = 'rgba(30,27,46,.35)'; g.fillRect(0, 0, 3, 3);
  g.fillStyle = 'rgba(250,248,242,.55)'; g.fillRect(5, 0, 1, 8); g.fillRect(0, 5, 8, 1);
  plaidTex = new THREE.CanvasTexture(c);
  plaidTex.magFilter = plaidTex.minFilter = THREE.NearestFilter;
  plaidTex.wrapS = plaidTex.wrapT = THREE.RepeatWrapping;
  plaidTex.repeat.set(2, 2);
  plaidTex.colorSpace = THREE.SRGBColorSpace;
  return plaidTex;
}
const cache = new Map();
const m = (c) => {
  if (c === 'plaid') { if (!cache.has('plaid')) cache.set('plaid', new THREE.MeshLambertMaterial({ map: plaid(), flatShading: true })); return cache.get('plaid'); }
  if (!cache.has(c)) cache.set(c, registerMaterial(new THREE.MeshLambertMaterial({ color: c, flatShading: true })));
  return cache.get(c);
};
const curlGeo = new THREE.IcosahedronGeometry(0.085, 0);

function part(w, h, d, mat, x, y, z, parent) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(mat));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function pivot(x, y, z, parent) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  parent.add(p);
  return p;
}
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

const ACTIONS = {
  interact: { dur: 0.75 },
  flex: { dur: 1.9 },
  wave: { dur: 1.4 },
  nod: { dur: 0.8 },
};

export class Character {
  constructor(outfit = OUTFITS.nathan) {
    const o = { topColor: 0xffffff, pantsColor: 0x3d5f8f, shoes: 0xf6f3ec, build: 1, ...outfit };
    this.outfit = o;
    this.group = new THREE.Group();
    this.group.scale.setScalar(1.25 * (o.height || 1));
    this.hips = pivot(0, 0.62, 0, this.group);

    const pants = o.pants === 'jeans' ? 0x3d5f8f : o.pantsColor;
    const top = o.top === 'plaid' ? 'plaid' : o.topColor;
    const sleeve = o.limbColor ?? (o.top === 'tank' ? o.skin : top);

    // Legs: thigh pivot at hip, shin pivot at knee
    this.legs = [-1, 1].map((s) => {
      const thigh = pivot(s * 0.135, 0, 0, this.hips);
      part(0.23, 0.3, 0.25, pants, 0, -0.15, 0, thigh);
      const knee = pivot(0, -0.3, 0, thigh);
      if (o.pants === 'shorts') { part(0.18, 0.24, 0.2, o.skin, 0, -0.12, 0, knee); }
      else { part(0.22, 0.26, 0.24, pants, 0, -0.13, 0, knee); if (o.pants === 'jeans') part(0.235, 0.05, 0.255, 0x2e4a72, 0, -0.24, 0, knee); }
      part(0.24, 0.1, 0.34, o.shoes, 0, -0.29, 0.04, knee);
      part(0.25, 0.03, 0.35, 0x2a2730, 0, -0.335, 0.04, knee);
      return { thigh, knee };
    });

    // Torso
    this.spine = pivot(0, 0.02, 0, this.hips);
    const bw = 0.56 * o.build;
    if (o.top === 'plaid') {
      part(bw, 0.56, 0.34, 0xfaf8f2, 0, 0.28, 0, this.spine);                 // white tee
      part(0.22, 0.58, 0.37, 'plaid', -0.18, 0.28, 0, this.spine);
      part(0.22, 0.58, 0.37, 'plaid', 0.18, 0.28, 0, this.spine);
      part(0.6, 0.58, 0.2, 'plaid', 0, 0.28, -0.09, this.spine);
      part(0.12, 0.08, 0.38, 'plaid', -0.12, 0.55, 0.01, this.spine);
      part(0.12, 0.08, 0.38, 'plaid', 0.12, 0.55, 0.01, this.spine);
    } else if (o.top === 'coat') {
      part(bw + 0.06, 0.74, 0.4, top, 0, 0.2, 0, this.spine);
      part(0.04, 0.6, 0.02, 0xd8dee8, 0, 0.26, 0.205, this.spine);
      for (const y of [0.18, 0.42]) part(0.16, 0.05, 0.03, 0x1e1b2e, 0.14, y, 0.205, this.spine);
    } else if (o.top === 'jacket') {
      // leather jacket over a dark tee, with a popped collar
      part(bw, 0.56, 0.34, 0x2a2430, 0, 0.28, 0, this.spine);
      part(0.2, 0.58, 0.37, top, -0.19, 0.28, 0, this.spine); part(0.2, 0.58, 0.37, top, 0.19, 0.28, 0, this.spine);
      part(0.6, 0.58, 0.2, top, 0, 0.28, -0.09, this.spine);
      part(0.16, 0.18, 0.34, top, -0.2, 0.62, 0.0, this.spine).rotation.z = 0.25;
      part(0.16, 0.18, 0.34, top, 0.2, 0.62, 0.0, this.spine).rotation.z = -0.25;
    } else if (o.top === 'kurta') {
      part(bw, 0.78, 0.34, top, 0, 0.18, 0, this.spine);
      part(0.06, 0.3, 0.02, 0xc96a43, 0, 0.36, 0.175, this.spine);
    } else {
      part(bw, 0.56, 0.34, top, 0, 0.28, 0, this.spine);
      if (o.top === 'hoodie') { part(0.3, 0.12, 0.05, new THREE.Color(top).multiplyScalar(0.78).getHex(), 0, 0.15, 0.18, this.spine); part(0.42, 0.14, 0.2, top, 0, 0.6, -0.12, this.spine); }
      if (o.top === 'tank' && o.trim) { part(bw + 0.01, 0.05, 0.35, o.trim, 0, 0.5, 0, this.spine); }
    }
    part(0.6 * o.build, 0.06, 0.36, o.pants === 'jeans' ? 0x2e4a72 : 0x2a2730, 0, 0.02, 0, this.spine); // belt
    if (o.accessory === 'whistle') { part(0.02, 0.24, 0.02, 0xffffff, 0, 0.42, 0.175, this.spine); part(0.07, 0.05, 0.08, 0xb3bcc6, 0, 0.28, 0.19, this.spine); }
    if (o.accessory === 'scarf') { part(0.46, 0.12, 0.42, o.scarfColor, 0, 0.56, 0, this.spine); part(0.12, 0.34, 0.06, o.scarfColor, 0.1, 0.32, 0.21, this.spine); }
    if (o.accessory === 'bag') { part(0.36, 0.42, 0.18, 0x6b7a3c, 0, 0.3, -0.26, this.spine); }

    // Arms: shoulder → upper arm, elbow → forearm + hand
    this.arms = [-1, 1].map((s) => {
      const shoulder = pivot(s * (0.37 * o.build + 0.015), 0.53, 0, this.spine);
      part(0.17, 0.27, 0.19, sleeve, 0, -0.13, 0, shoulder);
      const elbow = pivot(0, -0.27, 0, shoulder);
      part(0.155, 0.22, 0.175, o.limbColor ?? (o.top === 'tee' || o.top === 'tank' ? o.skin : sleeve), 0, -0.11, 0, elbow);
      part(0.15, 0.1, 0.17, o.limbColor ?? o.skin, 0, -0.27, 0, elbow);
      return { shoulder, elbow, side: s };
    });
    this.#extras(o);

    // Head
    this.neck = pivot(0, 0.6, 0, this.spine);
    this.head = pivot(0, 0, 0, this.neck);
    const H = this.head;
    part(0.2, 0.08, 0.18, o.skin, 0, 0.02, 0, H);
    part(0.58, 0.54, 0.52, o.skin, 0, 0.32, 0, H);
    part(0.06, 0.12, 0.1, o.skin, -0.31, 0.3, 0, H);
    part(0.06, 0.12, 0.1, o.skin, 0.31, 0.3, 0, H);
    this.eyes = [-0.13, 0.13].map((x) => part(0.09, 0.1, 0.02, 0x1e1b2e, x, 0.36, 0.265, H));
    part(0.06, 0.06, 0.03, 0xe2b99e, 0, 0.25, 0.27, H);
    part(0.22, 0.05, 0.02, 0x7a3b3b, 0, 0.17, 0.265, H);
    if (o.teeth) { part(0.075, 0.09, 0.035, 0xffffff, -0.042, 0.135, 0.272, H); part(0.075, 0.09, 0.035, 0xffffff, 0.042, 0.135, 0.272, H); }
    const bc = o.beardColor ?? o.hairColor;
    if (o.beard === 'stubble') {
      // light stubble: a thin jaw line and chin, mouth still visible
      part(0.6, 0.07, 0.05, bc, 0, 0.08, 0.245, H);
      part(0.05, 0.2, 0.3, bc, -0.29, 0.16, 0.1, H); part(0.05, 0.2, 0.3, bc, 0.29, 0.16, 0.1, H);
    } else if (o.beard) {
      // full beard around the jaw and chin, with a moustache
      part(0.6, 0.2, 0.12, bc, 0, 0.1, 0.22, H);
      part(0.08, 0.3, 0.36, bc, -0.29, 0.2, 0.07, H); part(0.08, 0.3, 0.36, bc, 0.29, 0.2, 0.07, H);
      part(0.26, 0.05, 0.03, bc, 0, 0.205, 0.275, H);
    }
    if (o.species === 'panda') {
      for (const sx of [-1, 1]) {
        part(0.18, 0.18, 0.1, o.limbColor, sx * 0.24, 0.62, -0.02, H);            // ears
        part(0.15, 0.16, 0.03, o.limbColor, sx * 0.13, 0.36, 0.262, H);           // eye patches
        part(0.04, 0.04, 0.02, 0xffffff, sx * 0.12, 0.38, 0.28, H);               // eye shine
      }
      part(0.1, 0.06, 0.04, o.limbColor, 0, 0.25, 0.28, H);                        // nose
      part(0.14, 0.12, 0.08, o.bowColor, 0.26, 0.56, 0.08, H);                     // bow
      part(0.1, 0.1, 0.06, o.bowColor, 0.17, 0.6, 0.1, H); part(0.1, 0.1, 0.06, o.bowColor, 0.35, 0.52, 0.06, H);
      part(0.62, 0.12, 0.5, o.limbColor, 0, 0.02, 0, this.spine).position.y = 0.58; // dark shoulders band
    }
    if (o.glasses) {
      for (const sx of [-0.13, 0.13]) {
        part(0.19, 0.03, 0.03, 0x1e1b2e, sx, 0.435, 0.28, H); part(0.19, 0.03, 0.03, 0x1e1b2e, sx, 0.29, 0.28, H);
        part(0.03, 0.17, 0.03, 0x1e1b2e, sx - 0.08, 0.3625, 0.28, H); part(0.03, 0.17, 0.03, 0x1e1b2e, sx + 0.08, 0.3625, 0.28, H);
        part(0.03, 0.03, 0.5, 0x1e1b2e, Math.sign(sx) * 0.3, 0.42, 0.04, H);
      }
      part(0.08, 0.03, 0.03, 0x1e1b2e, 0, 0.4, 0.28, H);
    }
    if (!(o.extras || []).includes('mask')) this.#hair(o, H);
    (this.laterExtras || []).forEach((f) => f());
    this.#mergeParts();

    // animation state
    this.heading = 0;
    this.speed = 0;
    this.phase = 0;
    this.lean = 0;
    this.action = null;
    this.actionT = 0;
    this.actionW = 0;
    this.talking = false;
    this.look = null;
    this.lookYaw = 0;
    this.blinkT = 2 + Math.random() * 3;
    this.idleLookT = 3;
    this.idleYaw = 0;
    this.buff = 0; this.buffTarget = 0;
    this.jumpY = 0; this.jumpV = 0; // vertical hop offset (metres) and velocity
    this.joints = {}; // smoothed joint values
  }

  #hair(o, H) {
    const c = o.hairColor;
    if (o.hair === 'curly') {
      part(0.62, 0.14, 0.56, c, 0, 0.62, -0.01, H);
      part(0.62, 0.3, 0.14, c, 0, 0.47, -0.22, H);
      const curls = [];
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2, ring = i % 2 ? 0.27 : 0.18;
        curls.push([Math.cos(a) * ring, 0.7 + (i % 3) * 0.035, Math.sin(a) * ring * 0.95]);
      }
      curls.push([0, 0.76, 0], [0.1, 0.74, 0.08], [-0.1, 0.74, -0.06], [-0.2, 0.55, 0.2], [0.2, 0.55, 0.2], [0, 0.6, 0.24], [-0.1, 0.62, 0.25], [0.11, 0.6, 0.25]);
      for (const s of [-1, 1]) for (const y of [0.42, 0.52]) curls.push([s * 0.31, y, -0.06]);
      curls.forEach(([x, y, z], i) => {
        const cm = new THREE.Mesh(curlGeo, m(i % 4 ? c : 0x3d2a20));
        cm.position.set(x, y, z); cm.rotation.set(i, i * 2, 0); cm.castShadow = true;
        H.add(cm);
      });
    } else if (o.hair === 'buzz') {
      part(0.6, 0.06, 0.54, c, 0, 0.6, 0, H);
    } else if (o.hair === 'short') {
      part(0.62, 0.14, 0.56, c, 0, 0.62, -0.01, H); part(0.62, 0.22, 0.14, c, 0, 0.5, -0.22, H); part(0.5, 0.08, 0.1, c, 0, 0.56, 0.24, H);
    } else if (o.hair === 'long') {
      part(0.62, 0.16, 0.56, c, 0, 0.62, -0.01, H); part(0.64, 0.6, 0.16, c, 0, 0.3, -0.24, H);
      part(0.08, 0.45, 0.4, c, -0.31, 0.35, -0.05, H); part(0.08, 0.45, 0.4, c, 0.31, 0.35, -0.05, H);
    } else if (o.hair === 'medium') {
      // shoulder-length: full top, sides down to the jaw, back to the nape
      part(0.64, 0.16, 0.58, c, 0, 0.62, -0.01, H);
      part(0.08, 0.42, 0.46, c, -0.31, 0.38, -0.03, H); part(0.08, 0.42, 0.46, c, 0.31, 0.38, -0.03, H);
      part(0.64, 0.5, 0.14, c, 0, 0.36, -0.24, H);
      part(0.5, 0.1, 0.08, c, 0, 0.55, 0.25, H);                                  // fringe
    } else if (o.hair === 'beanie') {
      part(0.62, 0.22, 0.14, c, 0, 0.44, -0.22, H);
      part(0.64, 0.3, 0.58, o.hatColor, 0, 0.66, 0, H);
      part(0.66, 0.08, 0.6, 0xf7faff, 0, 0.52, 0, H);
      const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), m(0xf7faff)); pom.position.set(0, 0.88, 0); H.add(pom);
    } else if (o.hair === 'bun') {
      part(0.62, 0.14, 0.56, c, 0, 0.62, -0.01, H); part(0.62, 0.26, 0.14, c, 0, 0.48, -0.22, H);
      const bun = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), m(c)); bun.position.set(0, 0.78, -0.18); H.add(bun);
    }
  }

  /** Merge the rigid meshes of each joint by material: ~100 meshes → ~25 draw calls. */
  #mergeParts() {
    const eyes = new Set(this.eyes);
    const pivots = [];
    this.group.traverse((o) => { if (!o.isMesh) pivots.push(o); });
    for (const p of pivots) {
      const byMat = new Map();
      for (const c of [...p.children]) {
        if (!c.isMesh || eyes.has(c)) continue;
        if (!byMat.has(c.material)) byMat.set(c.material, []);
        byMat.get(c.material).push(c);
      }
      for (const [material, meshes] of byMat) {
        if (meshes.length < 2) continue;
        const geos = meshes.map((c) => {
          c.updateMatrix();
          const g = (c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone()).applyMatrix4(c.matrix);
          for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
          if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
          p.remove(c);
          return g;
        });
        const merged = new THREE.Mesh(mergeGeometries(geos, false), material);
        merged.castShadow = true;
        p.add(merged);
      }
    }
  }

  /** Theme props for park characters (hats, hoods, capes, canes...). */
  #extras(o) {
    const ex = new Set(o.extras || []);
    if (!ex.size) return;
    const H = () => this.head, S = this.spine, c = o.extraColor;
    const later = []; // head-mounted extras are added after the head exists
    if (ex.has('cape')) { part(0.64, 1.0, 0.06, c, 0, 0.08, -0.22, S); part(0.68, 0.12, 0.44, c, 0, 0.56, 0, S); }
    if (ex.has('crescent')) { part(0.05, 0.2, 0.03, 0xc6d2e0, 0.03, 0.36, 0.215, S); part(0.08, 0.04, 0.03, 0xc6d2e0, -0.01, 0.46, 0.215, S); part(0.08, 0.04, 0.03, 0xc6d2e0, -0.01, 0.26, 0.215, S); }
    if (ex.has('web')) {
      const k = 0x1e1b2e;
      part(0.02, 0.54, 0.01, k, 0, 0.28, 0.172, S);
      for (const y of [0.12, 0.28, 0.44]) part(0.5, 0.02, 0.01, k, 0, y, 0.172, S);
      part(0.02, 0.54, 0.01, k, 0, 0.28, -0.172, S);
      for (const y of [0.12, 0.28, 0.44]) part(0.5, 0.02, 0.01, k, 0, y, -0.172, S);
    }
    if (ex.has('armor')) {
      // knight plate: pauldrons, chest plate with a crescent, belt and greaves
      const plate = 0xd8dde6, dark = 0x9aa3b2;
      for (const sx of [-1, 1]) { part(0.26, 0.14, 0.42, plate, sx * 0.33, 0.6, 0, S); part(0.22, 0.05, 0.38, dark, sx * 0.33, 0.53, 0, S); }
      part(0.46, 0.4, 0.06, plate, 0, 0.34, 0.2, S); part(0.46, 0.06, 0.07, dark, 0, 0.13, 0.2, S);
      part(0.6, 0.08, 0.38, dark, 0, 0.05, 0, S);
      for (const l of this.legs) part(0.24, 0.16, 0.27, plate, 0, -0.16, 0.02, l.knee);
    }
    if (ex.has('backpack')) part(0.36, 0.42, 0.16, c, 0, 0.3, -0.25, S);
    if (ex.has('bandana')) { part(0.46, 0.1, 0.42, 0xb8393a, 0, 0.57, 0, S); part(0.14, 0.14, 0.05, 0xb8393a, 0, 0.47, 0.2, S); }
    if (ex.has('lanyard')) { part(0.02, 0.3, 0.02, 0x2f5fb0, -0.09, 0.42, 0.18, S); part(0.02, 0.3, 0.02, 0x2f5fb0, 0.09, 0.42, 0.18, S); part(0.12, 0.14, 0.02, 0xffffff, 0, 0.24, 0.19, S); }
    const right = this.arms[1], left = this.arms[0];
    if (ex.has('cane')) { part(0.04, 1.0, 0.04, 0xf4f4f4, 0, -0.74, 0.06, right.elbow); part(0.045, 0.12, 0.045, 0xc4402f, 0, -1.22, 0.06, right.elbow); }
    if (ex.has('wraps')) for (const a of this.arms) part(0.17, 0.12, 0.19, 0xf2efe6, 0, -0.27, 0, a.elbow);
    if (ex.has('coffee')) { part(0.09, 0.13, 0.09, 0xffffff, 0, -0.34, 0.1, right.elbow); part(0.095, 0.04, 0.095, 0x8a5a36, 0, -0.29, 0.1, right.elbow); }
    if (ex.has('laptop')) part(0.04, 0.3, 0.4, 0x8a93a6, 0.13, -0.2, 0, left.shoulder);
    if (ex.has('cowboy')) later.push(() => { part(0.98, 0.05, 0.86, c, 0, 0.64, 0.02, H()); part(0.6, 0.24, 0.52, c, 0, 0.78, 0, H()); part(0.61, 0.06, 0.53, 0x2a1a12, 0, 0.69, 0, H()); });
    if (ex.has('hood')) later.push(() => {
      part(0.72, 0.68, 0.2, c, 0, 0.36, -0.28, H());
      part(0.07, 0.62, 0.56, c, -0.34, 0.34, -0.02, H()); part(0.07, 0.62, 0.56, c, 0.34, 0.34, -0.02, H());
      part(0.7, 0.08, 0.62, c, 0, 0.68, -0.02, H()); part(0.68, 0.07, 0.07, c, 0, 0.64, 0.28, H());
    });
    if (ex.has('mask')) later.push(() => {
      // full-head mask over the hair: red with black web lines and big white eyes
      const red = 0xc4302b, k2 = 0x1e1b2e;
      part(0.62, 0.6, 0.56, red, 0, 0.33, 0, H());
      for (const sx of [-1, 1]) { part(0.17, 0.12, 0.03, 0xffffff, sx * 0.13, 0.38, 0.285, H()); part(0.19, 0.03, 0.035, k2, sx * 0.13, 0.445, 0.285, H()); }
      part(0.02, 0.58, 0.01, k2, 0, 0.33, 0.283, H());
      for (const y of [0.16, 0.27, 0.52]) part(0.6, 0.02, 0.01, k2, 0, y, 0.283, H());
      part(0.62, 0.02, 0.57, k2, 0, 0.45, 0, H());
    });
    if (ex.has('shades')) later.push(() => { for (const x of [-0.13, 0.13]) part(0.2, 0.11, 0.03, 0x14101f, x, 0.37, 0.28, H()); part(0.08, 0.03, 0.03, 0x14101f, 0, 0.4, 0.28, H()); part(0.6, 0.03, 0.03, 0x14101f, 0, 0.41, 0.27, H()); });
    if (ex.has('redshades')) later.push(() => { for (const x of [-0.13, 0.13]) { part(0.17, 0.15, 0.03, 0x8a1f2a, x, 0.37, 0.285, H()); part(0.19, 0.03, 0.03, 0x2a1a1a, x, 0.45, 0.285, H()); } part(0.08, 0.03, 0.03, 0x2a1a1a, 0, 0.42, 0.285, H()); });
    this.laterExtras = later;
  }

  /** Fitness chapter easter egg: a little more muscle after the gym. */
  setBuff(on) { this.buffTarget = on ? 1 : 0; }
  /** One-shot action: 'interact' | 'flex' | 'wave' | 'nod' */
  play(name) { if (ACTIONS[name]) { this.action = name; this.actionT = 0; } }
  /** World-space point to look at (or null). */
  lookAt(v) { this.look = v; }
  get busy() { return !!this.action; }
  /** Hop. Returns false if already in the air. */
  jump() { if (this.jumpY > 0.001) return false; this.jumpV = 5.6; return true; }
  get airborne() { return this.jumpY > 0.001; }

  update(dt, velocity, t) {
    const J = this.joints;
    const set = (k, target, rate = 14) => (J[k] = damp(J[k] ?? 0, target, rate, dt));

    // --- heading + turn lean ---
    const v = Math.hypot(velocity.x, velocity.z);
    this.speed = damp(this.speed, v, 10, dt);
    let turnRate = 0;
    if (v > 0.05) {
      const target = Math.atan2(velocity.x, velocity.z);
      let d = Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading));
      const step = d * (1 - Math.exp(-14 * dt));
      this.heading += step;
      turnRate = step / Math.max(dt, 1e-4);
    }
    this.group.rotation.y = this.heading;
    this.lean = damp(this.lean, Math.max(-0.22, Math.min(0.22, -turnRate * 0.03 * Math.min(1, this.speed / 4))), 8, dt);

    // --- locomotion weights ---
    const walkW = Math.min(1, this.speed / 2.2);
    const runW = Math.max(0, Math.min(1, (this.speed - 5.6) / 1.6));
    const stride = 2.4 + runW * 1.4;
    this.phase += dt * this.speed * stride;
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const amp = walkW * (1 - runW) * 0.6 + runW * 1.0;

    // idle details
    const breathe = Math.sin(t * 2.1) * (1 - walkW);
    this.idleLookT -= dt;
    if (this.idleLookT < 0) { this.idleLookT = 2.5 + Math.random() * 4; this.idleYaw = (Math.random() - 0.5) * 0.9; }
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12;
    if (this.blinkT < 0) this.blinkT = 2.5 + Math.random() * 3.5;
    this.eyes.forEach((e) => (e.scale.y = blink ? 0.15 : 1));

    // --- base pose ---
    for (const [i, leg] of this.legs.entries()) {
      const ph = i === 0 ? s : -s;
      const back = i === 0 ? Math.max(0, -c) : Math.max(0, c);
      set(`th${i}`, ph * amp * 0.9, 18);
      set(`kn${i}`, back * (0.5 * walkW + 1.1 * runW) + (1 - walkW) * 0.04, 18);
    }
    for (const [i, arm] of this.arms.entries()) {
      const ph = i === 0 ? -s : s;
      set(`sx${i}`, ph * amp * 0.75, 16);
      set(`sz${i}`, arm.side * (0.06 + breathe * 0.02), 10);
      set(`el${i}`, -(0.15 + walkW * 0.25 + runW * 1.0), 14);
      set(`ez${i}`, 0, 14);
    }
    set('hipY', Math.abs(c) * (0.05 * walkW + 0.06 * runW) + breathe * 0.008, 20);
    set('hipX', Math.sin(t * 0.7) * 0.015 * (1 - walkW), 4);
    set('spineX', 0.05 * walkW + 0.16 * runW, 8);
    set('spineY', s * 0.08 * amp, 12);
    set('chest', 1 + breathe * 0.012, 6);

    // --- look-at (head yaw) ---
    let yaw = this.idleYaw * (1 - walkW);
    if (this.look) {
      const dx = this.look.x - this.group.position.x, dz = this.look.z - this.group.position.z;
      yaw = Math.atan2(Math.sin(Math.atan2(dx, dz) - this.heading), Math.cos(Math.atan2(dx, dz) - this.heading));
      yaw = Math.max(-1.0, Math.min(1.0, yaw));
    }
    set('headY', yaw, 6);
    set('headX', this.talking ? Math.sin(t * 7) * 0.06 : 0, 10);

    // --- idle poses for roaming characters (fade in only while standing still) ---
    this.poseW = damp(this.poseW || 0, this.pose && walkW < 0.2 ? 1 : 0, 4, dt);
    if (this.poseW > 0.01 && (this.pose || this.lastPose)) {
      if (this.pose) this.lastPose = this.pose;
      const pw = this.poseW, pm = (k, v) => (J[k] = J[k] * (1 - pw) + v * pw), P = this.lastPose;
      if (P === 'sit') {
        pm('hipY', -0.3); pm('th0', -1.45); pm('th1', -1.45); pm('kn0', 1.45); pm('kn1', 1.45); pm('spineX', -0.04);
        pm('sx0', -0.45); pm('sx1', -0.45); pm('el0', -0.7); pm('el1', -0.7);
      } else if (P === 'lean') {
        pm('hipX', 0.05); pm('spineX', -0.08);
        this.arms.forEach((a, i) => { pm(`sx${i}`, -0.95); pm(`sz${i}`, -a.side * 0.42); pm(`el${i}`, -1.75); });
      } else if (P === 'look') {
        pm('headY', Math.sin(t * 0.9) * 0.95); pm('headX', -0.08);
      } else if (P === 'check') {
        pm('spineX', 0.38); pm('sx1', -1.1); pm('el1', -0.5); pm('sx0', -0.55); pm('headX', 0.32);
      } else if (P === 'punch') {
        const k = Math.max(0, Math.sin(t * 6));
        pm('sx1', -0.4 - 1.2 * k); pm('el1', -1.7 + 1.5 * k); pm('sx0', -1.05); pm('el0', -1.85); pm('spineY', 0.22 * k); pm('th0', -0.2); pm('kn0', 0.25);
      } else if (P === 'type') {
        pm('sx0', -0.95); pm('sx1', -0.95); pm('el0', -0.75 + 0.12 * Math.sin(t * 14)); pm('el1', -0.75 + 0.12 * Math.sin(t * 15 + 1)); pm('headX', 0.22); pm('spineX', 0.12);
      } else if (P === 'cycle') {
        const ph = this.pedal || 0;
        pm('hipY', -0.16); pm('spineX', 0.32); pm('headX', -0.2);
        pm('th0', -1.05 + Math.sin(ph) * 0.42); pm('th1', -1.05 - Math.sin(ph) * 0.42);
        pm('kn0', 1.15 + Math.cos(ph) * 0.4); pm('kn1', 1.15 - Math.cos(ph) * 0.4);
        pm('sx0', -1.1); pm('sx1', -1.1); pm('el0', -0.35); pm('el1', -0.35);
      } else if (P === 'ride') {
        pm('hipY', -0.12); pm('th0', -0.95); pm('th1', -0.95); pm('kn0', 1.0); pm('kn1', 1.0); pm('spineX', 0.08);
        pm('sx0', -0.7); pm('sx1', -0.7); pm('el0', -0.9); pm('el1', -0.9); pm('hipX', 0);
      } else if (P === 'gaze') {
        pm('headX', -0.38); this.arms.forEach((a, i) => { pm(`sx${i}`, 0.4); pm(`el${i}`, -0.5); pm(`sz${i}`, a.side * 0.05); });
      }
    } else if (!this.pose) this.lastPose = null;

    // --- actions (override with fade) ---
    if (this.action) {
      this.actionT += dt;
      const dur = ACTIONS[this.action].dur;
      this.actionW = Math.min(1, this.actionT / 0.15, (dur - this.actionT) / 0.2);
      if (this.actionT >= dur) { this.action = null; this.actionW = 0; }
    }
    const w = this.action ? Math.max(0, this.actionW) : 0;
    const mix = (k, target) => (J[k] = J[k] * (1 - w) + target * w);
    if (this.action === 'interact') {
      mix('sx1', -1.25); mix('el1', -0.35); mix('spineX', 0.18); mix('headX', 0.15);
    } else if (this.action === 'flex') {
      for (let i = 0; i < 2; i++) { mix(`sx${i}`, 0); mix(`sz${i}`, this.arms[i].side * 1.45); mix(`el${i}`, 0); mix(`ez${i}`, this.arms[i].side * 1.69); }
      mix('hipY', 0.02 + Math.abs(Math.sin(this.actionT * 6)) * 0.03); mix('chest', 1.06);
    } else if (this.action === 'wave') {
      mix('sz1', 2.5); mix('sx1', 0); mix('el1', -0.4 + Math.sin(this.actionT * 12) * 0.45);
    } else if (this.action === 'nod') {
      mix('headX', Math.sin(this.actionT * 14) * 0.18);
    }
    if (this.talking && !this.action) J.sx1 += Math.sin(t * 3.1) * 0.12 - 0.25, J.el1 += -0.5;

    // --- apply ---
    this.legs.forEach((leg, i) => { leg.thigh.rotation.x = J[`th${i}`]; leg.knee.rotation.x = J[`kn${i}`]; });
    this.arms.forEach((arm, i) => { arm.shoulder.rotation.x = J[`sx${i}`]; arm.shoulder.rotation.z = J[`sz${i}`]; arm.elbow.rotation.x = J[`el${i}`]; arm.elbow.rotation.z = J[`ez${i}`]; });
    this.hips.position.y = 0.62 + J.hipY;
    this.hips.position.x = J.hipX;
    this.hips.rotation.z = this.lean;
    this.spine.rotation.x = J.spineX;
    this.spine.rotation.y = J.spineY;
    this.neck.rotation.x = -J.spineX * 0.6;
    this.head.rotation.y = J.headY;
    this.head.rotation.x = J.headX;

    // jump arc: tuck legs and raise arms while airborne
    if (this.jumpV !== 0 || this.jumpY > 0) {
      this.jumpV -= 18 * dt;
      this.jumpY = Math.max(0, this.jumpY + this.jumpV * dt);
      if (this.jumpY === 0) this.jumpV = 0;
    }
    if (this.jumpY > 0) {
      const a = Math.min(1, this.jumpY * 2);
      this.legs.forEach((leg) => { leg.thigh.rotation.x = -0.7 * a; leg.knee.rotation.x = 1.2 * a; });
      this.arms.forEach((arm) => { arm.shoulder.rotation.z = arm.side * 0.9 * a; arm.shoulder.rotation.x = -0.4 * a; });
    }
    this.hips.position.y += this.jumpY;

    this.buff = damp(this.buff, this.buffTarget, 2, dt);
    const b = 1 + this.buff * 0.14;
    this.spine.scale.set(b * J.chest, 1, (1 + this.buff * 0.06) * J.chest);
  }
}

/** Nathan himself. */
export class Player extends Character {
  constructor() {
    super(OUTFITS.nathan);
    this.#addXray();
  }

  /**
   * X-ray silhouette: a flat amber copy of every body part that only draws
   * where something (a building, tree, sign…) is in front of Nathan, so the
   * player never disappears behind scenery.
   */
  #addXray() {
    // Opaque on purpose: ghosts (renderOrder 20) draw after the scenery but
    // before Nathan's own body (renderOrder 30), so his limbs never trigger
    // the x-ray on each other, only buildings and props in front of him do.
    const xray = new THREE.MeshBasicMaterial({ color: 0xffb347, depthFunc: THREE.GreaterDepth, depthWrite: false });
    const meshes = [];
    this.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const mesh of meshes) {
      mesh.renderOrder = 30;
      const ghost = new THREE.Mesh(mesh.geometry, xray);
      ghost.renderOrder = 20;
      ghost.castShadow = false;
      ghost.userData.xray = true;
      mesh.add(ghost);
    }
  }
}
