import * as THREE from 'three';

/**
 * Gate for Nathan's orange X-ray silhouette. Only pieces explicitly tagged
 * `userData.xrayOccluder` (buildings and other large solid structures, see
 * XRAY_OCCLUDER_TYPES) can trigger it. Lamps, NPCs, trees, hedges, signs,
 * furniture, vehicles and small props never do.
 *
 * Several rays are cast from points spread over Nathan's body toward the
 * camera; the effect needs a meaningful share of them blocked for a short
 * activation delay, and drops again the moment he is mostly visible.
 */

/** Kit piece types that count as large solid structures. */
export const XRAY_OCCLUDER_TYPES = new Set([
  'gym_building', 'faculty_building', 'college_building', 'school_building', 'airport_terminal',
  'control_tower', 'station', 'hideout_house', 'outlaws_villa', 'guild_hall', 'workshop',
  'radio_shack', 'cottage', 'lighthouse', 'district_placeholder', 'clubhouse_front',
  'architecture_studio', 'workshop_shed', 'pop_rooftop', 'pop_cinema', 'pop_arcade',
]);

const ON_DELAY = 0.1;      // seconds a block must persist before X-ray shows
const ON_COUNT = 4;        // blocked sample points needed (of SAMPLES.length)
const OFF_COUNT = 2;       // below this the silhouette is removed immediately
const MIN_MESH_SIZE = 1.2; // ignore trim/decor pieces smaller than this
const SAMPLES = [
  // [height, lateral offset (camera-right)]
  [0.2, 0], [0.7, 0], [1.2, 0], [1.7, 0], [2.2, 0], [2.5, 0],
  [0.8, -0.3], [0.8, 0.3], [1.8, -0.3], [1.8, 0.3],
];

export function createXrayOcclusion({ camera, player, getScene }) {
  const ray = new THREE.Ray();
  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const right = new THREE.Vector3();
  const hits = [];
  const tmpBox = new THREE.Box3();
  const tmpV = new THREE.Vector3();
  let cacheScene = null, roots = [], rebuildAt = 0;
  let blockedFor = 0, active = false;

  function collect(scene) {
    roots = [];
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!o.userData?.xrayOccluder) return;
      const meshes = [];
      const box = new THREE.Box3();
      o.traverse((m) => {
        if (!m.isMesh || !m.geometry || m.userData?.xray) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        tmpBox.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
        tmpBox.getSize(tmpV);
        if (Math.max(tmpV.x, tmpV.y, tmpV.z) < MIN_MESH_SIZE) return;
        meshes.push(m);
        box.union(tmpBox);
      });
      if (meshes.length) roots.push({ root: o, meshes, box, api: o.userData.xrayApi || null });
    });
  }

  function meshSolid(m, root) {
    for (let c = m; c; c = c.parent) {
      if (!c.visible) return false;
      if (c === root) break;
    }
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    // Walls/roofs faded or hidden by an interior cutaway no longer block.
    return mats.some((mt) => mt && mt.visible !== false && (mt.opacity ?? 1) >= 0.6);
  }

  function pointBlocked(p) {
    if (camera.isOrthographicCamera) camera.getWorldDirection(dir).negate();
    else dir.copy(camera.position).sub(p).normalize();
    ray.set(p, dir);
    const maxDist = camera.isOrthographicCamera ? 300 : p.distanceTo(camera.position);
    for (const r of roots) {
      if (r.api?.isInside?.()) continue; // Nathan is in the interior-reveal state
      if (!ray.intersectsBox(r.box)) continue;
      for (const m of r.meshes) {
        if (!meshSolid(m, r.root)) continue;
        hits.length = 0;
        const rc = _rc;
        rc.set(p, dir); rc.far = maxDist; rc.near = 0.05;
        m.raycast(rc, hits);
        if (hits.length) return true;
      }
    }
    return false;
  }
  const _rc = new THREE.Raycaster();

  function set(v) {
    if (active === v) return;
    active = v;
    player.xrayBlocked = v;
  }

  return {
    update(dt, now = performance.now() / 1000) {
      const scene = getScene();
      if (!scene) return;
      if (scene !== cacheScene || now > rebuildAt) {
        // Tagged structures are static; refresh occasionally for late additions.
        cacheScene = scene; rebuildAt = now + 5;
        collect(scene);
      }
      if (!roots.length || player.riding || player.xrayEnabled === false) { blockedFor = 0; set(false); return; }
      const base = player.group.position;
      camera.updateMatrixWorld();
      right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      let blocked = 0;
      for (const [h, side] of SAMPLES) {
        origin.set(base.x + right.x * side, base.y + h, base.z + right.z * side);
        if (pointBlocked(origin)) blocked++;
      }
      if (blocked >= ON_COUNT) {
        blockedFor += dt;
        if (blockedFor >= ON_DELAY) set(true);
      } else if (blocked < OFF_COUNT || !active) {
        blockedFor = 0;
        set(false);
      }
    },
    reset() { blockedFor = 0; set(false); },
    get active() { return active; },
  };
}
