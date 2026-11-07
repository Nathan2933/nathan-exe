// Small isometric snapshots of the real Island 01 campus buildings, rendered
// once from the game's kit pieces (lazy-loaded, so the portfolio stays light).
import * as THREE from 'three';
import { KIT } from './game/kit.js';

const SHOTS = {
  montfort: ['school_building', { text: 'ST. MONTFORT' }],
  tomsk: ['faculty_building', { text: 'TOMSK STATE UNIVERSITY' }],
  tce: ['college_building', { text: 'TCE Madurai', subtitle: 'Thiagarajar College of Engineering', logo: 'assets/logos/tce.png' }],
};

/** Returns { id: dataURL } for the requested buildings. */
export async function renderBuildings(ids, { w = 360, h = 220 } = {}) {
  const canvas = document.createElement('canvas');
  const r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(w, h, false); r.outputColorSpace = THREE.SRGBColorSpace;
  const out = {};
  for (const id of ids) {
    const [type, props] = SHOTS[id] || [];
    if (!type || !KIT[type]) continue;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff6e6, 0x5a7a8a, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9); sun.position.set(-6, 12, 9); scene.add(sun);
    const piece = KIT[type](props);
    scene.add(piece.obj);
    // grass pad under the building
    const box = new THREE.Box3().setFromObject(piece.obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const pad = new THREE.Mesh(new THREE.BoxGeometry(size.x + 3, 0.3, size.z + 3), new THREE.MeshLambertMaterial({ color: 0x6fbf4a }));
    pad.position.set(c.x, -0.15, c.z); scene.add(pad);
    const span = Math.max(size.x, size.z) * 0.62 + 2;
    const cam = new THREE.OrthographicCamera(-span * (w / h), span * (w / h), span, -span, 0.1, 200);
    cam.position.set(c.x + 22, c.y + 18, c.z + 30); cam.lookAt(c.x, c.y * 0.7, c.z);
    if (type === 'college_building') await new Promise((res) => setTimeout(res, 400));   // let the logo texture arrive
    r.render(scene, cam);
    out[id] = canvas.toDataURL('image/png');
  }
  r.dispose();
  return out;
}
