import * as THREE from 'three';

/*
 * Guru's Island 01 Routine:
 * 1. Coding: Guru sits at his PC and codes for exactly 30 seconds of active gameplay.
 * 2. Break: Guru stands up, stretches briefly, and walks toward his blue Zest scooty.
 * 3. Mount: Properly sits on the scooter with his hands on the handlebars.
 * 4. Riding: Follows Island 01 road network and ring road with smooth turns and collision detection.
 * 5. Return: Parks at his workstation and dismounts.
 * 6. Coding Again: Walks back to his PC and resumes coding for another 30 seconds.
 * 7. Repeat: Naturally continues throughout gameplay.
 *
 * Interruption: Nathan can talk to Guru or join him for a ride. Guru safely resumes after.
 * Note: Never use double hyphens in comments or narrative text.
 */

export const GURU_STATE = {
  CODING: 'coding',
  BREAK: 'break',
  WALK_TO_SCOOTY: 'walk_to_scooty',
  MOUNT: 'mount',
  RIDING: 'riding',
  RETURN: 'return',
  WALK_TO_PC: 'walk_to_pc'
};

const CODING_DURATION = 30.0;
const CRUISE_SPEED = 5.2;
const ACCEL_RATE = 3.6;
const BRAKE_RATE = 7.5;
const TURN_RATE = 3.8;

const PC_POS = { x: -6.5, z: -37.72, heading: Math.PI };
const PARK_POS = { x: -5.0, z: -36.6, heading: (-15 * Math.PI) / 180 };
const MOUNT_STAND_POS = { x: -5.5, z: -36.8 };

/* Full circuit of Island 01 roads: North Avenue, North Ring, East Ring, South Ring, West Ring, return */
const ROUTE_WAYPOINTS = [
  /* Pull out from parking spot onto North Avenue */
  { x: -5.0, z: -36.6 },
  { x: -4.2, z: -36.2 },
  { x: -3.0, z: -35.5 },
  { x: -1.5, z: -35.0 },
  { x: 0.0, z: -35.0 },
  /* North Avenue Southbound */
  { x: 0.0, z: -33.0 },
  { x: 0.0, z: -31.2 },
  /* Turn East onto North Ring Road */
  { x: 0.8, z: -30.4 },
  { x: 2.0, z: -29.7 },
  { x: 3.5, z: -29.5 },
  /* North Ring Road Eastbound */
  { x: 8.0, z: -29.5 },
  { x: 14.0, z: -29.5 },
  { x: 20.0, z: -29.5 },
  { x: 23.5, z: -29.5 },
  /* Northeast corner: North Ring to East Ring */
  { x: 25.2, z: -29.0 },
  { x: 26.2, z: -27.8 },
  { x: 26.5, z: -26.0 },
  /* East Ring Road Southbound */
  { x: 26.5, z: -18.0 },
  { x: 26.5, z: -10.0 },
  { x: 26.5, z: 0.0 },
  { x: 26.5, z: 10.0 },
  { x: 26.5, z: 18.0 },
  { x: 26.5, z: 23.5 },
  /* Southeast corner: East Ring to South Ring */
  { x: 26.2, z: 25.5 },
  { x: 25.2, z: 26.8 },
  { x: 23.5, z: 27.5 },
  /* South Ring Road Westbound */
  { x: 18.0, z: 27.5 },
  { x: 10.0, z: 27.5 },
  { x: 0.0, z: 27.5 },
  { x: -10.0, z: 27.5 },
  { x: -18.0, z: 27.5 },
  { x: -22.5, z: 27.5 },
  /* Southwest corner: South Ring to West Ring */
  { x: -24.5, z: 26.8 },
  { x: -25.3, z: 25.5 },
  { x: -25.5, z: 23.5 },
  /* West Ring Road Northbound */
  { x: -25.5, z: 18.0 },
  { x: -25.5, z: 10.0 },
  { x: -25.5, z: 0.0 },
  { x: -25.5, z: -10.0 },
  { x: -25.5, z: -18.0 },
  { x: -25.5, z: -25.0 },
  /* Northwest corner: West Ring to North Ring */
  { x: -25.2, z: -27.5 },
  { x: -24.2, z: -28.8 },
  { x: -22.5, z: -29.5 },
  /* North Ring Road Eastbound toward North Avenue */
  { x: -16.0, z: -29.5 },
  { x: -10.0, z: -29.5 },
  { x: -4.5, z: -29.5 },
  /* Turn North onto North Avenue */
  { x: -2.5, z: -29.8 },
  { x: -1.2, z: -30.5 },
  { x: 0.0, z: -32.0 },
  /* North Avenue Northbound back to Winter Campus */
  { x: 0.0, z: -34.0 },
  { x: 0.0, z: -35.0 },
  /* Turn West back into Workstation parking spot */
  { x: -1.5, z: -35.2 },
  { x: -3.0, z: -35.6 },
  { x: -4.2, z: -36.2 },
  { x: -5.0, z: -36.6 }
];

const zeroV = new THREE.Vector3();
const moveV = new THREE.Vector3();
const projVec = new THREE.Vector3();
const _qBuf = [];

export function createGuruRoutine(ctx) {
  let phase = GURU_STATE.CODING;
  let codingTimer = 0.0;
  let stretchTimer = 0.0;
  let mountTimer = 0.0;
  let returnTimer = 0.0;
  let wpIndex = 0;
  let currentSpeed = 0.0;
  let pausedForDialogue = false;
  let hornCooldown = 0.0;
  let bubbleTimer = 0.0;
  let passengerActive = false;
  let pendingRideWithNathan = false;

  const scootyPos = { x: PARK_POS.x, z: PARK_POS.z };
  let scootyHeading = PARK_POS.heading;

  let bubbleLayer = null;
  let activeBubbles = [];
  let cachedGuru = null;
  let cachedScooty = null;
  let pcY = 0;
  let parkY = 0;
  let parkedSynced = false;
  let offDt = 0;

  function getGuruNpc() {
    if (cachedGuru && ctx.world?.npcs?.includes(cachedGuru)) return cachedGuru;
    cachedGuru = ctx.world?.npcs?.find((n) => n.npcId === 'guru') || null;
    return cachedGuru;
  }

  function getScootyVehicle() {
    if (cachedScooty && ctx.world?.interactables?.includes(cachedScooty)) return cachedScooty;
    cachedScooty = ctx.world?.interactables?.find((i) => i.kind === 'vehicle' && i.vtype === 'scooty') || null;
    return cachedScooty;
  }

  function ensureBubbleLayer() {
    if (typeof document === 'undefined') return;
    if (!bubbleLayer) {
      bubbleLayer = document.createElement('div');
      bubbleLayer.className = 'tahiti-bubbles guru-bubbles';
      document.body.append(bubbleLayer);
    }
  }

  function showBubble(text, secs = 3) {
    if (typeof document === 'undefined') return;
    ensureBubbleLayer();
    const guru = getGuruNpc();
    if (!guru || !bubbleLayer) return;
    const el = document.createElement('div');
    el.className = 'tahiti-bubble';
    el.textContent = text;
    bubbleLayer.append(el);
    activeBubbles.push({ el, who: guru, until: performance.now() + secs * 1000, disp: null, tf: '' });
  }

  function updateBubbles() {
    if (!activeBubbles.length || typeof window === 'undefined' || typeof document === 'undefined') return;
    const now = performance.now();
    activeBubbles = activeBubbles.filter((b) => {
      if (now > b.until) {
        b.el.remove();
        return false;
      }
      const charPos = b.who.character?.group?.position;
      if (!charPos || !ctx.camera) return false;
      projVec.copy(charPos);
      projVec.y += 2.05;
      projVec.project(ctx.camera);
      const sx = (projVec.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-projVec.y * 0.5 + 0.5) * window.innerHeight;
      const off = sx < -120 || sx > window.innerWidth + 120 || sy < -40 || sy > window.innerHeight + 40;
      const disp = off ? 'none' : '';
      if (b.disp !== disp) { b.el.style.display = disp; b.disp = disp; }
      if (!off) {
        const tf = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) translate(-50%, -100%)`;
        if (b.tf !== tf) { b.el.style.transform = tf; b.tf = tf; }
      }
      return true;
    });
  }

  /* Checks forward collision against colliders, floors, other npcs, and player */
  function checkCollisionAhead(pos, heading, checkDist = 2.4) {
    const cos = Math.cos(heading), sin = Math.sin(heading);
    const vehicleRadius = 0.45;
    const step = 0.35;
    const steps = Math.ceil(checkDist / step);
    const guru = getGuruNpc();
    const halfDist = checkDist * 0.5;
    const colCandidates = ctx.world?.queryColliders
      ? ctx.world.queryColliders(pos.x + sin * halfDist, pos.z + cos * halfDist, halfDist + vehicleRadius, _qBuf)
      : ctx.world?.colliders;
    const hasFloorAt = typeof ctx.world?.floorAt === 'function';
    const floors = ctx.world?.floors;
    const npcs = ctx.world?.npcs;
    const playerPos = !passengerActive ? ctx.player?.group?.position : null;

    for (let s = 1; s <= steps; s++) {
      const d = s * step;
      const cx = pos.x + sin * d;
      const cz = pos.z + cos * d;

      /* 1. World colliders: buildings, trees, hedges, lamps, fences (spatial query) */
      if (colCandidates) {
        for (let i = 0; i < colCandidates.length; i++) {
          const c = colCandidates[i];
          if (c.r !== undefined) {
            if (Math.hypot(cx - c.cx, cz - c.cz) < c.r + vehicleRadius) {
              return { hit: true, dist: d, type: 'building_or_prop' };
            }
          } else if (cx > c.minX - vehicleRadius && cx < c.maxX + vehicleRadius &&
                     cz > c.minZ - vehicleRadius && cz < c.maxZ + vehicleRadius) {
            return { hit: true, dist: d, type: 'building_or_prop' };
          }
        }
      }

      /* 2. World floors: indoor zones and elevated platforms */
      if (hasFloorAt) {
        if (ctx.world.floorAt(cx, cz) !== null) return { hit: true, dist: d, type: 'floor' };
      } else if (floors) {
        for (let i = 0; i < floors.length; i++) {
          const f = floors[i];
          if (cx >= f.minX && cx <= f.maxX && cz >= f.minZ && cz <= f.maxZ) {
            return { hit: true, dist: d, type: 'floor' };
          }
        }
      }

      /* 3. NPCs: pedestrians and characters */
      if (npcs) {
        for (let i = 0; i < npcs.length; i++) {
          const n = npcs[i];
          if (n === guru || n.passenger) continue;
          const np = n.character?.group?.position;
          if (np && Math.hypot(np.x - cx, np.z - cz) < 0.95) {
            return { hit: true, dist: d, type: 'npc', name: n.npcId };
          }
        }
      }

      /* 4. Nathan: the player (unless riding along as passenger) */
      if (playerPos && Math.hypot(playerPos.x - cx, playerPos.z - cz) < 1.15) {
        return { hit: true, dist: d, type: 'player' };
      }
    }

    return { hit: false };
  }

  function tickCharAnim(ch, dt, vel, t) {
    if (!passengerActive && ctx.camera?.isOrthographicCamera && ch.group?.position) {
      projVec.copy(ch.group.position);
      projVec.y += 1.0;
      projVec.project(ctx.camera);
      if (Math.abs(projVec.x) > 1.45 || Math.abs(projVec.y) > 1.45) {
        offDt += dt;
        if (offDt < 0.1) return;
        const step = offDt;
        offDt = 0;
        ch.update(step, vel, t);
        return;
      }
    }
    offDt = 0;
    ch.update(dt, vel, t);
  }

  function enter() {
    phase = GURU_STATE.CODING;
    codingTimer = 0.0;
    stretchTimer = 0.0;
    mountTimer = 0.0;
    returnTimer = 0.0;
    wpIndex = 0;
    currentSpeed = 0.0;
    pausedForDialogue = false;
    passengerActive = false;
    pendingRideWithNathan = false;
    offDt = 0;
    parkedSynced = false;
    pcY = ctx.heightAt(PC_POS.x, PC_POS.z);
    parkY = ctx.heightAt(PARK_POS.x, PARK_POS.z);

    scootyPos.x = PARK_POS.x;
    scootyPos.z = PARK_POS.z;
    scootyHeading = PARK_POS.heading;

    const guru = getGuruNpc();
    if (guru) {
      guru.brain = true; /* Prevents default wandering conflict */
      guru.passenger = false;
      const ch = guru.character;
      ch.group.position.set(PC_POS.x, pcY, PC_POS.z);
      ch.heading = PC_POS.heading;
      ch.pose = 'sittype';
      ch.steer = 0;
      guru.x = PC_POS.x;
      guru.z = PC_POS.z;
      if (guru.beacon?.group) {
        guru.beacon.group.position.set(guru.x, pcY + 0.04, guru.z);
        guru.beacon.group.visible = true;
      }
      if (guru.hit) guru.hit.position.set(guru.x, 1.3, guru.z);
    }

    const scooty = getScootyVehicle();
    if (scooty && scooty.model?.group) {
      const g = scooty.model.group;
      g.position.set(PARK_POS.x, parkY, PARK_POS.z);
      g.rotation.set(0, PARK_POS.heading, 0);
      if (scooty.model.bars) scooty.model.bars.rotation.y = 0;
      scooty.x = PARK_POS.x;
      scooty.z = PARK_POS.z;
      scooty.heading = PARK_POS.heading;
      if (scooty.beacon?.group) {
        scooty.beacon.group.position.set(scooty.x, parkY + 0.04, scooty.z);
        scooty.beacon.group.visible = true;
      }
      if (scooty.hit) scooty.hit.position.set(scooty.x, 1.3, scooty.z);
    }
  }

  function exit() {
    if (passengerActive) dismountNathanPassenger(true);
    for (const b of activeBubbles) b.el.remove();
    activeBubbles = [];
    if (bubbleLayer) {
      bubbleLayer.remove();
      bubbleLayer = null;
    }
    const guru = getGuruNpc();
    if (guru) guru.brain = false;
    cachedGuru = null;
    cachedScooty = null;
    parkedSynced = false;
    offDt = 0;
  }

  function boardNathanAsPassenger() {
    if (passengerActive) return;
    passengerActive = true;
    ctx.state.passengerOf = 'guru';
    ctx.player.pose = 'ride';
    ctx.toast('Riding with Guru! Press E anytime to dismount.');
    showBubble('Hold on tight, Nathan! Taking the scenic ring road.', 2.8);
  }

  function dismountNathanPassenger(silent = false) {
    if (!passengerActive) return;
    passengerActive = false;
    ctx.state.passengerOf = null;
    ctx.player.pose = null;

    /* Step off to a safe walkable spot beside the scooter */
    const h = scootyHeading;
    const sideOffsets = [
      { x: Math.cos(h) * 1.2, z: -Math.sin(h) * 1.2 },
      { x: -Math.cos(h) * 1.2, z: Math.sin(h) * 1.2 },
      { x: -Math.sin(h) * 1.2, z: -Math.cos(h) * 1.2 }
    ];
    let spot = { x: scootyPos.x + sideOffsets[0].x, z: scootyPos.z + sideOffsets[0].z };
    for (const o of sideOffsets) {
      const cx = scootyPos.x + o.x, cz = scootyPos.z + o.z;
      if (ctx.solidFree && ctx.solidFree(cx, cz) && ctx.nav?.isWalkable(cx, cz, 0.32)) {
        spot = { x: cx, z: cz };
        break;
      }
    }
    ctx.player.group.position.set(spot.x, ctx.heightAt(spot.x, spot.z), spot.z);
    ctx.player.heading = Math.atan2(scootyPos.x - spot.x, scootyPos.z - spot.z);
    if (!silent) {
      showBubble('Catch you later, Nathan!', 2.2);
      ctx.toast('Dismounted from the scooty.');
    }
  }

  function pauseForDialogue() {
    pausedForDialogue = true;
    const guru = getGuruNpc();
    if (guru && ctx.player) {
      const gp = guru.character.group.position;
      const pp = ctx.player.group.position;
      guru.character.lookAt(pp);
      guru.character.heading = Math.atan2(pp.x - gp.x, pp.z - gp.z);
    }
  }

  function resumeFromDialogue() {
    pausedForDialogue = false;
    const guru = getGuruNpc();
    if (guru) guru.character.lookAt(null);

    if (pendingRideWithNathan) {
      if (phase === GURU_STATE.CODING || phase === GURU_STATE.WALK_TO_PC) {
        /* Guru stands up from desk, stretches, and heads to scooty with Nathan */
        phase = GURU_STATE.BREAK;
        stretchTimer = 0.0;
        guru.character.pose = null;
        guru.character.play('flex');
        showBubble('Let us take the scooty for a spin! Follow me to the scooter.', 2.8);
      } else if (phase === GURU_STATE.BREAK || phase === GURU_STATE.WALK_TO_SCOOTY) {
        showBubble('Heading to the scooty right now! Hop on when we reach it.', 2.8);
      } else if (phase === GURU_STATE.MOUNT || phase === GURU_STATE.RIDING) {
        pendingRideWithNathan = false;
        boardNathanAsPassenger();
      }
    } else {
      /* Return to whatever pose matched the current phase */
      if (phase === GURU_STATE.CODING && guru) {
        guru.character.heading = PC_POS.heading;
        guru.character.pose = 'sittype';
        parkedSynced = false;
      } else if ((phase === GURU_STATE.MOUNT || phase === GURU_STATE.RIDING) && guru) {
        guru.character.heading = scootyHeading;
        guru.character.pose = 'scooty';
      }
    }
  }

  function triggerRideTogether() {
    pendingRideWithNathan = true;
    if (ctx.dialogue?.open) {
      ctx.dialogue.close();
    } else {
      resumeFromDialogue();
    }
  }

  function isGuruMounted() {
    return phase === GURU_STATE.MOUNT || phase === GURU_STATE.RIDING;
  }

  function getRoutinePhase() {
    return phase;
  }

  /* Main frame tick */
  function update(dt, t) {
    updateBubbles();

    const guru = getGuruNpc();
    const scooty = getScootyVehicle();
    if (!guru || !scooty) return;

    const ch = guru.character;
    const scootyModel = scooty.model;

    if (hornCooldown > 0) hornCooldown -= dt;

    /* If talking to Nathan, wait in place safely */
    if (pausedForDialogue || (ctx.dialogue?.open && ctx.state.talkingTo === guru)) {
      if (!pausedForDialogue) pauseForDialogue();
      tickCharAnim(ch, dt, zeroV, t);
      return;
    }

    /* 1. CODING (30 seconds of active gameplay) */
    if (phase === GURU_STATE.CODING) {
      if (!parkedSynced) {
        pcY = ctx.heightAt(PC_POS.x, PC_POS.z);
        parkY = ctx.heightAt(PARK_POS.x, PARK_POS.z);
        ch.group.position.set(PC_POS.x, pcY, PC_POS.z);
        ch.heading = PC_POS.heading;
        ch.pose = 'sittype';
        ch.steer = 0;

        guru.x = PC_POS.x;
        guru.z = PC_POS.z;
        if (guru.beacon?.group) {
          guru.beacon.group.position.set(guru.x, pcY + 0.04, guru.z);
          guru.beacon.group.visible = true;
        }
        if (guru.hit) guru.hit.position.set(guru.x, 1.3, guru.z);

        /* Keep scooty parked neatly at its designated spot */
        scootyPos.x = PARK_POS.x;
        scootyPos.z = PARK_POS.z;
        scootyHeading = PARK_POS.heading;
        if (scootyModel?.group) {
          scootyModel.group.position.set(PARK_POS.x, parkY, PARK_POS.z);
          scootyModel.group.rotation.set(0, PARK_POS.heading, 0);
          if (scootyModel.bars) scootyModel.bars.rotation.y = 0;
        }
        scooty.x = PARK_POS.x;
        scooty.z = PARK_POS.z;
        scooty.heading = PARK_POS.heading;
        if (scooty.beacon?.group) {
          scooty.beacon.group.position.set(scooty.x, parkY + 0.04, scooty.z);
          scooty.beacon.group.visible = true;
        }
        if (scooty.hit) scooty.hit.position.set(scooty.x, 1.3, scooty.z);
        parkedSynced = true;
      }

      tickCharAnim(ch, dt, zeroV, t);

      codingTimer += dt;
      if (codingTimer >= CODING_DURATION) {
        parkedSynced = false;
        phase = GURU_STATE.BREAK;
        stretchTimer = 0.0;
        ch.pose = null;
        ch.play('flex');
        showBubble('Code compiles clean! Time for a scooty ride around the island.', 2.8);
      }
      return;
    }

    /* 2. BREAK (Stand up, stretch briefly) */
    if (phase === GURU_STATE.BREAK) {
      stretchTimer += dt;
      ch.group.position.set(PC_POS.x, pcY, PC_POS.z);
      tickCharAnim(ch, dt, zeroV, t);
      guru.x = PC_POS.x;
      guru.z = PC_POS.z;
      if (guru.beacon?.group) guru.beacon.group.position.set(PC_POS.x, pcY + 0.04, PC_POS.z);
      if (guru.hit) guru.hit.position.set(PC_POS.x, 1.3, PC_POS.z);
      if (stretchTimer >= 1.6) {
        phase = GURU_STATE.WALK_TO_SCOOTY;
        ch.pose = null;
      }
      return;
    }

    /* 3. WALK TO SCOOTY */
    if (phase === GURU_STATE.WALK_TO_SCOOTY) {
      const target = MOUNT_STAND_POS;
      const gp = ch.group.position;
      const dx = target.x - gp.x, dz = target.z - gp.z;
      const dist = Math.hypot(dx, dz);
      const walkSpeed = 1.6;

      if (dist < 0.15) {
        phase = GURU_STATE.MOUNT;
        mountTimer = 0.0;
        ch.heading = PARK_POS.heading;
        ch.pose = 'scooty';
        if (scooty.beacon?.group) scooty.beacon.group.visible = false;
        showBubble('Zest is fueled and ready.', 2.0);
      } else {
        const step = Math.min(walkSpeed * dt, dist);
        const vx = (dx / dist) * walkSpeed, vz = (dz / dist) * walkSpeed;
        gp.x += (dx / dist) * step;
        gp.z += (dz / dist) * step;
        gp.y = ctx.heightAt(gp.x, gp.z);
        ch.heading = Math.atan2(dx, dz);
        ch.pose = null;
        moveV.set(vx, 0, vz);
        tickCharAnim(ch, dt, moveV, t);

        guru.x = gp.x;
        guru.z = gp.z;
        if (guru.beacon?.group) guru.beacon.group.position.set(gp.x, gp.y + 0.04, gp.z);
        if (guru.hit) guru.hit.position.set(gp.x, 1.3, gp.z);
      }
      return;
    }

    /* 4. MOUNT */
    if (phase === GURU_STATE.MOUNT) {
      if (pendingRideWithNathan) {
        pendingRideWithNathan = false;
        boardNathanAsPassenger();
      }
      const ground = ctx.heightAt(scootyPos.x, scootyPos.z);
      mountTimer += dt;
      scootyPos.x = PARK_POS.x;
      scootyPos.z = PARK_POS.z;
      scootyHeading = PARK_POS.heading;

      /* Align scooty model */
      if (scootyModel?.group) {
        scootyModel.group.position.set(scootyPos.x, ground, scootyPos.z);
        scootyModel.group.rotation.set(0, scootyHeading, 0);
        if (scootyModel.bars) scootyModel.bars.rotation.y = 0;
      }
      if (scooty.beacon?.group) scooty.beacon.group.visible = false;

      /* Place Guru seated on the front scooter seat */
      const seatOffset = -0.36, seatY = 0.15;
      ch.group.position.set(
        scootyPos.x - Math.sin(scootyHeading) * seatOffset,
        ground + seatY,
        scootyPos.z - Math.cos(scootyHeading) * seatOffset
      );
      ch.heading = scootyHeading;
      ch.pose = 'scooty';
      ch.steer = 0;
      tickCharAnim(ch, dt, zeroV, t);

      guru.x = scootyPos.x;
      guru.z = scootyPos.z;
      if (guru.beacon?.group) guru.beacon.group.position.set(scootyPos.x, ground + 0.04, scootyPos.z);
      if (guru.hit) guru.hit.position.set(scootyPos.x, 1.3, scootyPos.z);
      scooty.x = scootyPos.x;
      scooty.z = scootyPos.z;
      if (scooty.hit) scooty.hit.position.set(scootyPos.x, 1.3, scootyPos.z);

      /* If Nathan is riding along as passenger */
      if (passengerActive && ctx.player) {
        const passOffset = -0.72;
        ctx.player.group.position.set(
          scootyPos.x - Math.sin(scootyHeading) * passOffset,
          ground + seatY,
          scootyPos.z - Math.cos(scootyHeading) * passOffset
        );
        ctx.player.heading = scootyHeading;
        ctx.player.pose = 'ride';
        ctx.player.update(dt, zeroV, t);
      }

      if (mountTimer >= 0.6) {
        phase = GURU_STATE.RIDING;
        wpIndex = 0;
        currentSpeed = 0.0;
      }
      return;
    }

    /* 5. RIDING (Road network & ring road) */
    if (phase === GURU_STATE.RIDING) {
      const targetWp = ROUTE_WAYPOINTS[wpIndex];
      const dx = targetWp.x - scootyPos.x;
      const dz = targetWp.z - scootyPos.z;
      const distToWp = Math.hypot(dx, dz);

      /* Advance waypoint when close */
      if (distToWp < 1.3) {
        if (wpIndex < ROUTE_WAYPOINTS.length - 1) {
          wpIndex++;
        } else {
          /* Completed the full road circuit! Return and dismount */
          phase = GURU_STATE.RETURN;
          returnTimer = 0.0;
          scootyPos.x = PARK_POS.x;
          scootyPos.z = PARK_POS.z;
          scootyHeading = PARK_POS.heading;
          scooty.x = PARK_POS.x;
          scooty.z = PARK_POS.z;
          scooty.heading = PARK_POS.heading;
          if (scooty.hit) scooty.hit.position.set(PARK_POS.x, 1.3, PARK_POS.z);
          return;
        }
      }

      /* Steering towards target waypoint */
      const targetHeading = Math.atan2(dx, dz);
      const angleDiff = Math.atan2(Math.sin(targetHeading - scootyHeading), Math.cos(targetHeading - scootyHeading));
      scootyHeading += angleDiff * Math.min(1, dt * TURN_RATE);

      const steerAngle = Math.max(-0.45, Math.min(0.45, angleDiff * 0.75));
      if (scootyModel?.bars) scootyModel.bars.rotation.y = steerAngle;
      ch.steer = steerAngle;

      /* Collision check ahead */
      const checkDist = Math.max(1.8, currentSpeed * 0.75);
      const obstacle = checkCollisionAhead(scootyPos, scootyHeading, checkDist);

      let targetSpeed = CRUISE_SPEED;
      if (Math.abs(angleDiff) > 0.5) targetSpeed = 3.2; /* Slow down for tight corners */

      if (obstacle.hit) {
        if (obstacle.dist < 1.25) {
          targetSpeed = 0.0;
          currentSpeed = Math.max(0.0, currentSpeed - BRAKE_RATE * 1.5 * dt);
        } else {
          targetSpeed = Math.min(targetSpeed, 1.5);
          currentSpeed = Math.max(0.0, currentSpeed - BRAKE_RATE * dt);
        }

        if (obstacle.type === 'player' && hornCooldown <= 0) {
          hornCooldown = 3.5;
          showBubble('Beep beep! Watch the road, Nathan!', 2.2);
          ctx.sfx?.tap?.();
        } else if (obstacle.type === 'npc' && hornCooldown <= 0) {
          hornCooldown = 3.5;
          showBubble('Honk honk, coming through!', 2.2);
        }
      } else {
        if (currentSpeed < targetSpeed) {
          currentSpeed = Math.min(targetSpeed, currentSpeed + ACCEL_RATE * dt);
        } else {
          currentSpeed = Math.max(targetSpeed, currentSpeed - BRAKE_RATE * 0.5 * dt);
        }
      }

      /* Advance scooty along heading */
      const stepDist = currentSpeed * dt;
      scootyPos.x += Math.sin(scootyHeading) * stepDist;
      scootyPos.z += Math.cos(scootyHeading) * stepDist;
      const currentGround = ctx.heightAt(scootyPos.x, scootyPos.z);

      /* Animate scooty model */
      if (scootyModel?.group) {
        scootyModel.group.position.set(scootyPos.x, currentGround, scootyPos.z);
        scootyModel.group.rotation.y = scootyHeading;
        scootyModel.group.rotation.z = -steerAngle * 0.25 * Math.min(1, currentSpeed / 4);
        if (scootyModel.wheels) {
          for (const w of scootyModel.wheels) {
            w.rotation.x += stepDist / 0.24;
          }
        }
      }

      /* Position Guru seated on the front scooter seat */
      const seatOffset = -0.36, seatY = 0.15;
      ch.group.position.set(
        scootyPos.x - Math.sin(scootyHeading) * seatOffset,
        currentGround + seatY,
        scootyPos.z - Math.cos(scootyHeading) * seatOffset
      );
      ch.heading = scootyHeading;
      ch.pose = 'scooty';
      tickCharAnim(ch, dt, zeroV, t);

      /* Update interactables */
      guru.x = scootyPos.x;
      guru.z = scootyPos.z;
      if (guru.beacon?.group) guru.beacon.group.position.set(scootyPos.x, currentGround + 0.04, scootyPos.z);
      if (guru.hit) guru.hit.position.set(scootyPos.x, 1.3, scootyPos.z);
      scooty.x = scootyPos.x;
      scooty.z = scootyPos.z;
      scooty.heading = scootyHeading;
      if (scooty.hit) scooty.hit.position.set(scootyPos.x, 1.3, scootyPos.z);
      if (scooty.beacon?.group) scooty.beacon.group.visible = false;

      /* Update Nathan as passenger */
      if (passengerActive && ctx.player) {
        const passOffset = -0.72;
        ctx.player.group.position.set(
          scootyPos.x - Math.sin(scootyHeading) * passOffset,
          currentGround + seatY,
          scootyPos.z - Math.cos(scootyHeading) * passOffset
        );
        ctx.player.heading = scootyHeading;
        ctx.player.pose = 'ride';
        ctx.player.update(dt, zeroV, t);
        if (ctx.velocity) {
          ctx.velocity.set(Math.sin(scootyHeading) * currentSpeed, 0, Math.cos(scootyHeading) * currentSpeed);
        }
      }

      /* Friendly periodic banter while riding */
      bubbleTimer += dt;
      if (bubbleTimer > 18.0) {
        bubbleTimer = 0.0;
        if (passengerActive) {
          showBubble('Nothing beats an island circuit to clear the mind.', 2.8);
        }
      }
      return;
    }

    /* 6. RETURN (Park at workstation and dismount) */
    if (phase === GURU_STATE.RETURN) {
      const ground = ctx.heightAt(PARK_POS.x, PARK_POS.z);
      parkY = ground;
      returnTimer += dt;
      currentSpeed = 0.0;
      scootyPos.x = PARK_POS.x;
      scootyPos.z = PARK_POS.z;
      scootyHeading = PARK_POS.heading;

      scooty.x = PARK_POS.x;
      scooty.z = PARK_POS.z;
      scooty.heading = PARK_POS.heading;
      if (scooty.hit) scooty.hit.position.set(PARK_POS.x, 1.3, PARK_POS.z);

      if (scootyModel?.group) {
        scootyModel.group.position.set(PARK_POS.x, ground, PARK_POS.z);
        scootyModel.group.rotation.set(0, PARK_POS.heading, 0);
        if (scootyModel.bars) scootyModel.bars.rotation.y = 0;
      }
      if (scooty.beacon?.group) {
        scooty.beacon.group.position.set(PARK_POS.x, ground + 0.04, PARK_POS.z);
        scooty.beacon.group.visible = true;
      }

      /* Keep Guru seated on scooty until dismount threshold */
      const seatOffset = -0.36, seatY = 0.15;
      ch.group.position.set(
        PARK_POS.x - Math.sin(PARK_POS.heading) * seatOffset,
        ground + seatY,
        PARK_POS.z - Math.cos(PARK_POS.heading) * seatOffset
      );
      ch.heading = PARK_POS.heading;
      ch.pose = 'scooty';
      tickCharAnim(ch, dt, zeroV, t);
      guru.x = ch.group.position.x;
      guru.z = ch.group.position.z;
      if (guru.beacon?.group) guru.beacon.group.position.set(guru.x, ground + 0.04, guru.z);
      if (guru.hit) guru.hit.position.set(guru.x, 1.3, guru.z);

      if (passengerActive) {
        dismountNathanPassenger(true);
        showBubble('Route complete! Good ride, Nathan.', 2.8);
      }

      if (returnTimer >= 0.5) {
        phase = GURU_STATE.WALK_TO_PC;
        ch.pose = null;
        const standY = ctx.heightAt(MOUNT_STAND_POS.x, MOUNT_STAND_POS.z);
        ch.group.position.set(MOUNT_STAND_POS.x, standY, MOUNT_STAND_POS.z);
        guru.x = MOUNT_STAND_POS.x;
        guru.z = MOUNT_STAND_POS.z;
        if (guru.beacon?.group) guru.beacon.group.position.set(MOUNT_STAND_POS.x, standY + 0.04, MOUNT_STAND_POS.z);
        if (guru.hit) guru.hit.position.set(MOUNT_STAND_POS.x, 1.3, MOUNT_STAND_POS.z);
        showBubble('Back to the workstation. Next sprint starts now.', 2.8);
      }
      return;
    }

    /* 7. WALK TO PC (Walking back to workstation chair) */
    if (phase === GURU_STATE.WALK_TO_PC) {
      /* Keep scooty parked */
      scooty.x = PARK_POS.x;
      scooty.z = PARK_POS.z;
      scooty.heading = PARK_POS.heading;
      if (scooty.hit) scooty.hit.position.set(PARK_POS.x, 1.3, PARK_POS.z);

      const target = PC_POS;
      const gp = ch.group.position;
      const dx = target.x - gp.x, dz = target.z - gp.z;
      const dist = Math.hypot(dx, dz);
      const walkSpeed = 1.5;

      if (dist < 0.12) {
        phase = GURU_STATE.CODING;
        codingTimer = 0.0;
        parkedSynced = false;
        pcY = ctx.heightAt(PC_POS.x, PC_POS.z);
        parkY = ctx.heightAt(PARK_POS.x, PARK_POS.z);
        ch.group.position.set(PC_POS.x, pcY, PC_POS.z);
        ch.heading = PC_POS.heading;
        ch.pose = 'sittype';
        ch.steer = 0;
        tickCharAnim(ch, dt, zeroV, t);
        guru.x = PC_POS.x;
        guru.z = PC_POS.z;
        if (guru.beacon?.group) guru.beacon.group.position.set(PC_POS.x, pcY + 0.04, PC_POS.z);
        if (guru.hit) guru.hit.position.set(PC_POS.x, 1.3, PC_POS.z);
      } else {
        const step = Math.min(walkSpeed * dt, dist);
        const vx = (dx / dist) * walkSpeed, vz = (dz / dist) * walkSpeed;
        gp.x += (dx / dist) * step;
        gp.z += (dz / dist) * step;
        gp.y = ctx.heightAt(gp.x, gp.z);
        ch.heading = Math.atan2(dx, dz);
        ch.pose = null;
        moveV.set(vx, 0, vz);
        tickCharAnim(ch, dt, moveV, t);

        guru.x = gp.x;
        guru.z = gp.z;
        if (guru.beacon?.group) guru.beacon.group.position.set(gp.x, gp.y + 0.04, gp.z);
        if (guru.hit) guru.hit.position.set(gp.x, 1.3, gp.z);
      }
    }
  }

  return {
    enter,
    exit,
    update,
    pauseForDialogue,
    resumeFromDialogue,
    boardNathanAsPassenger,
    dismountNathanPassenger,
    triggerRideTogether,
    isGuruMounted,
    getRoutinePhase,
    isPassengerActive: () => passengerActive
  };
}
