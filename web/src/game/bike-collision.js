import * as THREE from 'three';

/**
 * Checks whether an interactable or vehicle is a two-wheeler / bike.
 * In NATHAN.EXE, vehicles include bicycles ('bike'), motorcycles ('moto'), and scooters ('scooty').
 */
export function isBikeVehicle(it) {
  return !!(it && it.kind === 'vehicle' && ['bike', 'moto', 'scooty'].includes(it.vtype));
}

/**
 * Gets the standard collision radius for a vehicle.
 */
export function getBikeRadius(it) {
  if (!it) return 0.45;
  if (it.vtype === 'moto') return 0.50;
  if (it.vtype === 'scooty') return 0.45;
  if (it.vtype === 'bike') return 0.42;
  return it.radius || 0.45;
}

/**
 * Generates a consistent pair key for two vehicles.
 */
export function getBikePairKey(bikeA, bikeB) {
  const idA = bikeA.id || 'bikeA';
  const idB = bikeB.id || 'bikeB';
  return idA < idB ? `${idA}::${idB}` : `${idB}::${idA}`;
}

/**
 * Material helper for burst particles.
 */
const fxMat = (color, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

/**
 * Creates and manages the bike collision system in NATHAN.EXE.
 *
 * Handles:
 * - Contact detection and hysteresis (once per hit, re-triggers after separation)
 * - Immediate overlap resolution to prevent getting stuck
 * - Small pixel-art burst at point of contact
 * - Bike recoil animations (position impulse & pitch tilt, then settle)
 * - Rider jolt animations (vertical bump in seat & spine pitch, tiny for slow bump, then settle)
 * - Subtle camera shake on harder hits
 * - Complete dialogue suppression
 */
export function createBikeCollisionSystem(ctx = {}) {
  // Active pair hits currently touching/in contact
  const activeHits = new Map();

  // Active recoil animations: bike -> { nx, nz, maxDist, maxPitch, t, dur }
  const activeRecoils = new Map();

  // Active rider jolt animations: character -> { maxAmpY, maxAmpPitch, t, dur }
  const activeJolts = new Map();

  // Active particle bursts
  const activeBursts = [];

  // Reusable vector buffers
  const _tmpV = new THREE.Vector3();

  /**
   * Spawns a small pixel-art burst at the exact point of contact.
   * Consists of an expanding retro pixel star flash and outward cubic voxel sparks.
   */
  function spawnPixelBurst(contactPos, nx, nz, intensity) {
    const scene = ctx.scene;
    if (!scene) return null;

    const group = new THREE.Group();
    group.position.copy(contactPos);
    scene.add(group);

    // 1. Central 8-bit / pixel impact cross flash
    const starGroup = new THREE.Group();
    const flashMat = fxMat(0xffffff);
    const starCore = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), flashMat);
    starGroup.add(starCore);

    const armOffsets = [
      [0.09, 0, 0],
      [-0.09, 0, 0],
      [0, 0.09, 0],
      [0, -0.09, 0],
      [0, 0, 0.09],
      [0, 0, -0.09],
    ];
    const armGeom = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    const armMat = fxMat(0xffe83b);
    for (const [ox, oy, oz] of armOffsets) {
      const arm = new THREE.Mesh(armGeom, armMat);
      arm.position.set(ox, oy, oz);
      starGroup.add(arm);
    }
    group.add(starGroup);

    // 2. Flying pixel / voxel sparks
    const sparkCount = Math.round(6 + 6 * intensity);
    const sparkColors = [0xffffff, 0xffeb3b, 0xffa01c, 0xffd000, 0xff471a];
    const sparkGeom = new THREE.BoxGeometry(0.055, 0.055, 0.055);
    const sparks = [];

    for (let i = 0; i < sparkCount; i++) {
      const sMat = fxMat(sparkColors[i % sparkColors.length]);
      const mesh = new THREE.Mesh(sparkGeom, sMat);
      group.add(mesh);

      const angle = (i / sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const sp = (1.4 + Math.random() * 2.2) * (0.8 + 0.5 * intensity);
      // Explode radially outward from the contact plane
      const vx = (-nx * 0.4 + Math.cos(angle) * 0.9) * sp;
      const vy = (1.4 + Math.random() * 2.4) * (0.8 + 0.4 * intensity);
      const vz = (-nz * 0.4 + Math.sin(angle) * 0.9) * sp;

      sparks.push({
        mesh,
        mat: sMat,
        vx,
        vy,
        vz,
        g: 13 + Math.random() * 4,
      });
    }

    const burstRecord = {
      group,
      starGroup,
      sparks,
      flashMat,
      armMat,
      armGeom,
      sparkGeom,
      starCoreGeom: starCore.geometry,
      t: 0,
      dur: 0.28,
    };

    activeBursts.push(burstRecord);
    return burstRecord;
  }

  /**
   * Adds or updates a bike recoil animation.
   */
  function addBikeRecoil(bike, nx, nz, maxDist, maxPitch, dur = 0.32) {
    if (!bike) return;
    activeRecoils.set(bike, {
      nx,
      nz,
      maxDist,
      maxPitch,
      t: 0,
      dur,
    });
    bike.recoilX = 0;
    bike.recoilZ = 0;
    bike.recoilPitch = 0;
  }

  /**
   * Adds or updates a rider seat jolt animation.
   */
  function addRiderJolt(character, maxAmpY, maxAmpPitch, dur = 0.32) {
    if (!character) return;
    activeJolts.set(character, {
      maxAmpY,
      maxAmpPitch,
      t: 0,
      dur,
    });
    character.joltY = 0;
    character.joltPitch = 0;
  }

  /**
   * Applies an immediate positional displacement to resolve overlap.
   */
  function applyDisplacement(bike, dx, dz) {
    if (!bike) return;
    const isPlayer = ctx.state?.mount?.it === bike;
    if (isPlayer && ctx.player?.group?.position) {
      ctx.player.group.position.x += dx;
      ctx.player.group.position.z += dz;
      bike.x = ctx.player.group.position.x;
      bike.z = ctx.player.group.position.z;
    } else {
      bike.x = (bike.x || 0) + dx;
      bike.z = (bike.z || 0) + dz;
    }

    if (bike.model?.group) {
      bike.model.group.position.x += dx;
      bike.model.group.position.z += dz;
    }

    // Sync NPC routine positions if applicable
    if (bike.id === 'vehicle:scooty' && ctx.guruRoutine?.nudge) {
      ctx.guruRoutine.nudge(dx, dz);
    }
    if (bike.id === 'vehicle:moto-shabeer' && ctx.shabeerRoutine?.nudge) {
      ctx.shabeerRoutine.nudge(dx, dz);
    }
  }

  /**
   * Resolves rider for a bike.
   * If player is mounted, player is rider.
   * If Guru or Shabeer is riding their respective bikes, their character is rider.
   * If parked bike, returns null.
   */
  function getRiderForBike(bike) {
    if (!bike) return null;
    if (ctx.state?.mount?.it === bike) {
      return ctx.player;
    }
    if (bike.id === 'vehicle:scooty') {
      if (ctx.guruRoutine?.isGuruMounted?.()) {
        return ctx.guruRoutine.getGuruCharacter?.() || null;
      }
    }
    if (bike.id === 'vehicle:moto-shabeer') {
      if (ctx.shabeerRoutine?.getPhase?.() === 'ride') {
        return ctx.shabeerRoutine.getShabeerCharacter?.() || null;
      }
    }
    // Check general NPC riding
    for (const n of ctx.world?.npcs || []) {
      if (n.character?.pose === 'scooty' || n.character?.pose === 'ride' || n.character?.pose === 'cycle') {
        const np = n.character?.group?.position;
        if (np && Math.hypot(np.x - (bike.x || 0), np.z - (bike.z || 0)) < 0.8) {
          return n.character;
        }
      }
    }
    return null;
  }

  /**
   * Retrieves current position of a bike in world coordinates.
   */
  function getBikePos(bike) {
    if (ctx.state?.mount?.it === bike && ctx.player?.group?.position) {
      return { x: ctx.player.group.position.x, z: ctx.player.group.position.z };
    }
    if (typeof bike.x === 'number' && typeof bike.z === 'number') {
      return { x: bike.x, z: bike.z };
    }
    if (bike.model?.group?.position) {
      return { x: bike.model.group.position.x, z: bike.model.group.position.z };
    }
    return { x: 0, z: 0 };
  }

  /**
   * Retrieves current velocity/speed and heading for a bike.
   */
  function getBikeVelocity(bike) {
    if (ctx.state?.mount?.it === bike) {
      const sp = ctx.state.mount.speed || 0;
      const h = ctx.state.mount.heading || 0;
      return { speed: sp, heading: h, vx: Math.sin(h) * sp, vz: Math.cos(h) * sp };
    }
    if (bike.id === 'vehicle:scooty' && ctx.guruRoutine?.isGuruMounted?.()) {
      const sp = ctx.guruRoutine.getSpeed?.() || 4.0;
      const h = bike.heading || 0;
      return { speed: sp, heading: h, vx: Math.sin(h) * sp, vz: Math.cos(h) * sp };
    }
    if (bike.id === 'vehicle:moto-shabeer' && ctx.shabeerRoutine?.getPhase?.() === 'ride') {
      const sp = ctx.shabeerRoutine.getSpeed?.() || 4.2;
      const h = bike.heading || 0;
      return { speed: sp, heading: h, vx: Math.sin(h) * sp, vz: Math.cos(h) * sp };
    }
    return { speed: 0, heading: bike.heading || 0, vx: 0, vz: 0 };
  }

  /**
   * Triggers the full impact animation sequence for a collision between two bikes.
   */
  function triggerImpact(bikeA, bikeB, nx, nz, dist) {
    const rA = getBikeRadius(bikeA);
    const rB = getBikeRadius(bikeB);
    const posA = getBikePos(bikeA);
    const posB = getBikePos(bikeB);

    // Calculate closing velocity and impact force
    const vA = getBikeVelocity(bikeA);
    const vB = getBikeVelocity(bikeB);
    const relVx = vA.vx - vB.vx;
    const relVz = vA.vz - vB.vz;
    const closingSpeed = relVx * nx + relVz * nz;
    const speedMag = Math.hypot(relVx, relVz);

    // Impact speed combines relative closing speed and bike forward speeds
    let impactSpeed = Math.max(closingSpeed, speedMag * 0.7, Math.abs(vA.speed), Math.abs(vB.speed));
    impactSpeed = Math.max(0.6, impactSpeed);

    // Intensity: 0.15 (slow bump) to 1.0 (hard hit)
    const intensity = Math.min(1.0, Math.max(0.15, (impactSpeed - 0.5) / 5.5));
    const isSlowBump = impactSpeed < 2.5;

    // Contact point at interface between bikes
    const contactX = posA.x + nx * rA;
    const contactZ = posA.z + nz * rA;
    const contactY = (ctx.heightAt ? ctx.heightAt(contactX, contactZ) : 0) + 0.38;
    _tmpV.set(contactX, contactY, contactZ);

    // 1. Pixel-art burst at contact point
    spawnPixelBurst(_tmpV, nx, nz, intensity);

    // 2. Bikes recoil
    const recoilDistA = 0.06 + 0.14 * intensity;
    const recoilPitchA = 0.04 + 0.08 * intensity;
    addBikeRecoil(bikeA, -nx, -nz, recoilDistA, recoilPitchA, 0.32);

    const riderB = getRiderForBike(bikeB);
    const isParkedB = !riderB && vB.speed === 0;
    if (isParkedB) {
      // Parked bike nudges slightly in place without rider
      addBikeRecoil(bikeB, nx, nz, 0.03 + 0.06 * intensity, 0.02 + 0.04 * intensity, 0.26);
    } else {
      const recoilDistB = 0.06 + 0.14 * intensity;
      const recoilPitchB = 0.04 + 0.08 * intensity;
      addBikeRecoil(bikeB, nx, nz, recoilDistB, recoilPitchB, 0.32);
    }

    // Dampen speeds on collision
    if (ctx.state?.mount?.it === bikeA) {
      ctx.state.mount.speed = Math.max(-0.6 * intensity, ctx.state.mount.speed * -0.15);
    }
    if (ctx.state?.mount?.it === bikeB) {
      ctx.state.mount.speed = Math.max(-0.6 * intensity, ctx.state.mount.speed * -0.15);
    }
    if (bikeA.id === 'vehicle:scooty' && ctx.guruRoutine?.reduceSpeed) {
      ctx.guruRoutine.reduceSpeed(2.8 * intensity);
    }
    if (bikeB.id === 'vehicle:scooty' && ctx.guruRoutine?.reduceSpeed) {
      ctx.guruRoutine.reduceSpeed(2.8 * intensity);
    }
    if (bikeA.id === 'vehicle:moto-shabeer' && ctx.shabeerRoutine?.reduceSpeed) {
      ctx.shabeerRoutine.reduceSpeed(2.8 * intensity);
    }
    if (bikeB.id === 'vehicle:moto-shabeer' && ctx.shabeerRoutine?.reduceSpeed) {
      ctx.shabeerRoutine.reduceSpeed(2.8 * intensity);
    }

    // 3. Riders jolt in their seats
    // Tiny jolt for slow bump (~0.05m Y, ~0.10 rad pitch); larger jolt for hard hit
    const joltAmpY = isSlowBump ? 0.035 + 0.04 * intensity : 0.06 + 0.10 * intensity;
    const joltAmpPitch = isSlowBump ? 0.07 + 0.08 * intensity : 0.12 + 0.18 * intensity;

    const riderA = getRiderForBike(bikeA);
    if (riderA) {
      addRiderJolt(riderA, joltAmpY, joltAmpPitch, 0.32);
    }
    if (riderB) {
      addRiderJolt(riderB, joltAmpY, joltAmpPitch, 0.32);
    }

    // 4. Subtle brief camera shake for harder hits (never for slow bump)
    if (!isSlowBump && ctx.triggerCameraShake) {
      const shakeDuration = Math.min(0.20, 0.08 + 0.12 * intensity);
      ctx.triggerCameraShake(shakeDuration);
    }

    // 5. Retro impact bonk / tap sound
    ctx.sfx?.bonk?.();

    // 6. Complete dialogue suppression: ensure no dialogue bubbles pop up on collision
    // (Handled by design: no dialogue or toast is called)
  }

  /**
   * Checks collisions among all bikes in the world and resolves overlaps.
   */
  function checkCollisions(dt, t) {
    const vehicles = ctx.world?.vehicles || ctx.world?.interactables?.filter((i) => i.kind === 'vehicle') || [];
    const bikes = vehicles.filter(isBikeVehicle);

    if (bikes.length < 2) return;

    for (let i = 0; i < bikes.length; i++) {
      for (let j = i + 1; j < bikes.length; j++) {
        const bikeA = bikes[i];
        const bikeB = bikes[j];

        const rA = getBikeRadius(bikeA);
        const rB = getBikeRadius(bikeB);
        const posA = getBikePos(bikeA);
        const posB = getBikePos(bikeB);

        const dx = posB.x - posA.x;
        const dz = posB.z - posA.z;
        const dist = Math.hypot(dx, dz);

        const contactDist = rA + rB + 0.06;
        const separateDist = rA + rB + 0.36;
        const pairKey = getBikePairKey(bikeA, bikeB);

        if (dist <= contactDist) {
          // Normalize collision axis
          let nx = dist > 0.001 ? dx / dist : Math.sin(bikeA.heading || 0);
          let nz = dist > 0.001 ? dz / dist : Math.cos(bikeA.heading || 0);
          if (dist <= 0.001) {
            nx = 1;
            nz = 0;
          }

          // Immediate overlap resolution so player can reverse or steer away
          const overlap = (rA + rB) - dist;
          if (overlap > 0) {
            const riderA = getRiderForBike(bikeA);
            const riderB = getRiderForBike(bikeB);
            const isParkedA = !riderA;
            const isParkedB = !riderB;

            if (isParkedB && !isParkedA) {
              // Bike A pushes out of parked Bike B
              applyDisplacement(bikeA, -nx * overlap, -nz * overlap);
            } else if (isParkedA && !isParkedB) {
              // Bike B pushes out of parked Bike A
              applyDisplacement(bikeB, nx * overlap, nz * overlap);
            } else {
              // Both bikes dynamic: push each apart equally
              applyDisplacement(bikeA, -nx * (overlap * 0.5), -nz * (overlap * 0.5));
              applyDisplacement(bikeB, nx * (overlap * 0.5), nz * (overlap * 0.5));
            }
          }

          // Trigger animation once per hit; re-triggers only after separating
          if (!activeHits.has(pairKey)) {
            activeHits.set(pairKey, { time: t, hit: true });
            triggerImpact(bikeA, bikeB, nx, nz, dist);
          }
        } else if (dist > separateDist) {
          // Beyond separation threshold: allow triggering again on next contact
          if (activeHits.has(pairKey)) {
            activeHits.delete(pairKey);
          }
        }
      }
    }
  }

  /**
   * Advances recoil, rider jolt, and burst animations by dt.
   */
  function updateAnimations(dt) {
    // 1. Update bike recoils
    for (const [bike, r] of activeRecoils.entries()) {
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) {
        bike.recoilX = 0;
        bike.recoilZ = 0;
        bike.recoilPitch = 0;
        activeRecoils.delete(bike);
      } else {
        const env = Math.sin(k * Math.PI) * (1 - k * 0.45);
        bike.recoilX = r.nx * r.maxDist * env;
        bike.recoilZ = r.nz * r.maxDist * env;
        bike.recoilPitch = r.maxPitch * env;
      }
      // Apply directly to parked bike group if not player mount
      if (bike !== ctx.state?.mount?.it && bike.model?.group) {
        const by = ctx.heightAt ? ctx.heightAt(bike.x, bike.z) : bike.model.group.position.y;
        bike.model.group.position.set(bike.x + (bike.recoilX || 0), by, bike.z + (bike.recoilZ || 0));
        bike.model.group.rotation.x = bike.recoilPitch || 0;
      }
    }

    // 2. Update rider jolts
    for (const [ch, j] of activeJolts.entries()) {
      j.t += dt;
      const k = j.t / j.dur;
      if (k >= 1) {
        ch.joltY = 0;
        ch.joltPitch = 0;
        activeJolts.delete(ch);
      } else {
        const env = Math.sin(k * Math.PI) * Math.max(0, 1 - k * 0.55);
        ch.joltY = j.maxAmpY * env;
        ch.joltPitch = j.maxAmpPitch * env;
      }
    }

    // 3. Update particle bursts
    for (let i = activeBursts.length - 1; i >= 0; i--) {
      const b = activeBursts[i];
      b.t += dt;
      const k = b.t / b.dur;

      if (k >= 1) {
        if (b.group.parent) b.group.parent.remove(b.group);
        b.armGeom?.dispose();
        b.sparkGeom?.dispose();
        b.starCoreGeom?.dispose();
        b.flashMat?.dispose();
        b.armMat?.dispose();
        for (const s of b.sparks) s.mat?.dispose();
        activeBursts.splice(i, 1);
      } else {
        // Stepped growth & fade for retro pixel feel
        const u = k / 0.25;
        let starScale = 1;
        if (k < 0.25) {
          starScale = Math.round(u * 1.35 * 4) / 4;
        } else {
          starScale = Math.round(Math.max(0, 1.35 - ((k - 0.25) / 0.75) * 1.35) * 4) / 4;
        }
        b.starGroup.scale.setScalar(Math.max(0.01, starScale));
        b.flashMat.opacity = Math.max(0, 1 - k * 1.2);
        b.armMat.opacity = Math.max(0, 1 - k * 1.2);

        // Sparks fly and fall
        for (const s of b.sparks) {
          s.mesh.position.x += s.vx * dt;
          s.mesh.position.y += s.vy * dt;
          s.mesh.position.z += s.vz * dt;
          s.vy -= s.g * dt;
          s.mat.opacity = Math.max(0, 1 - k);
          const sScale = Math.round(Math.max(0.1, 1 - k * 0.7) * 4) / 4;
          s.mesh.scale.setScalar(sScale);
        }
      }
    }
  }

  /**
   * Main per-frame update loop.
   */
  function update(dt, t) {
    checkCollisions(dt, t);
    updateAnimations(dt);
  }

  /**
   * Resets all tracking state (e.g. on level transition).
   */
  function reset() {
    activeHits.clear();
    for (const [bike] of activeRecoils) {
      bike.recoilX = 0;
      bike.recoilZ = 0;
      bike.recoilPitch = 0;
    }
    activeRecoils.clear();
    for (const [ch] of activeJolts) {
      ch.joltY = 0;
      ch.joltPitch = 0;
    }
    activeJolts.clear();
    for (const b of activeBursts) {
      if (b.group.parent) b.group.parent.remove(b.group);
      b.armGeom?.dispose();
      b.sparkGeom?.dispose();
      b.starCoreGeom?.dispose();
      b.flashMat?.dispose();
      b.armMat?.dispose();
      for (const s of b.sparks) s.mat?.dispose();
    }
    activeBursts.length = 0;
  }

  return {
    checkCollisions,
    updateAnimations,
    update,
    reset,
    triggerImpact,
    spawnPixelBurst,
    addBikeRecoil,
    addRiderJolt,
    getActiveHits: () => activeHits,
    getActiveRecoils: () => activeRecoils,
    getActiveJolts: () => activeJolts,
    getActiveBursts: () => activeBursts,
  };
}
