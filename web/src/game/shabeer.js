/*
 * Shabeer's Island 01 bike routine.
 * Shabeer waits beside his black bike. He rides the ring roads the opposite way round to Guru, so the two can be out together.
 */
const IDLE_BEFORE_RIDE = 6.0;
const CRUISE = 5.4, ACCEL = 3.6, BRAKE = 7.5, TURN = 3.8;
const PARK = { x: -31.75, z: 3.0, heading: Math.PI / 2 };
const STAND = { x: -31.6, z: 4.4 };
const ROUTE = [
  { x: -28.5, z: 3 },
  { x: -25.5, z: 2.2 },
  { x: -25.5, z: -10 },
  { x: -25.5, z: -18 },
  { x: -25.5, z: -25 },
  { x: -25.2, z: -27.5 },
  { x: -24.2, z: -28.8 },
  { x: -22.5, z: -29.5 },
  { x: -10, z: -29.5 },
  { x: 0, z: -29.5 },
  { x: 10, z: -29.5 },
  { x: 20, z: -29.5 },
  { x: 23.5, z: -29.5 },
  { x: 25.2, z: -29 },
  { x: 26.2, z: -27.8 },
  { x: 26.5, z: -26 },
  { x: 26.5, z: -10 },
  { x: 26.5, z: 0 },
  { x: 26.5, z: 10 },
  { x: 26.5, z: 18 },
  { x: 26.5, z: 23.5 },
  { x: 26.2, z: 25.5 },
  { x: 25.2, z: 26.8 },
  { x: 23.5, z: 27.5 },
  { x: 10, z: 27.5 },
  { x: 0, z: 27.5 },
  { x: -10, z: 27.5 },
  { x: -18, z: 27.5 },
  { x: -22.5, z: 27.5 },
  { x: -24.5, z: 26.8 },
  { x: -25.3, z: 25.5 },
  { x: -25.5, z: 23.5 },
  { x: -25.5, z: 18 },
  { x: -25.5, z: 10 },
  { x: -25.5, z: 4 },
  { x: -28.5, z: 3 },
  { x: -31.75, z: 3 }
].reverse().slice(1).concat([{ x: PARK.x, z: PARK.z }]);
const still = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };

export function createShabeerRoutine(ctx) {
  let phase = 'idle';          // idle | walk | ride
  let wp = 0, speed = 0, stuck = 0, guruFree = 0;
  const pos = { x: PARK.x, z: PARK.z };
  let heading = PARK.heading, npc = null, bike = null;
  const vel = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };

  const getNpc = () => (npc && ctx.world?.npcs?.includes(npc) ? npc : (npc = ctx.world?.npcs?.find((n) => n.npcId === 'shabeer') || null));
  const getBike = () => (bike && ctx.world?.interactables?.includes(bike) ? bike : (bike = ctx.world?.interactables?.find((i) => i.kind === 'vehicle' && i.id === 'vehicle:moto-shabeer') || null));

  function placeBike(y, beacon) {
    const b = getBike(); if (!b?.model?.group) return;
    b.model.group.position.set(pos.x, y, pos.z);
    b.model.group.rotation.set(0, heading, 0);
    b.x = pos.x; b.z = pos.z; b.heading = heading;
    if (b.hit) b.hit.position.set(pos.x, 1.3, pos.z);
    if (b.beacon?.group) { b.beacon.group.position.set(pos.x, y + 0.04, pos.z); b.beacon.group.visible = beacon; }
  }
  function parkBike() {
    pos.x = PARK.x; pos.z = PARK.z; heading = PARK.heading; speed = 0;
    const b = getBike();
    if (b?.model?.bars) b.model.bars.rotation.y = 0;
    placeBike(ctx.heightAt(pos.x, pos.z), true);
  }
  function setNpc(x, y, z) {
    const n = getNpc(); if (!n) return;
    n.character.group.position.set(x, y, z);
    n.x = x; n.z = z;
    if (n.beacon?.group) n.beacon.group.position.set(x, y + 0.04, z);
    if (n.hit) n.hit.position.set(x, 1.3, z);
  }
  function blocked(dist) {
    const sx = Math.sin(heading), cz = Math.cos(heading);
    const pp = ctx.player?.group?.position;
    for (let d = 0.4; d <= dist; d += 0.4) {
      const x = pos.x + sx * d, z = pos.z + cz * d;
      if (pp && Math.hypot(pp.x - x, pp.z - z) < 1.1) return d;
      for (const n of ctx.world?.npcs || []) {
        if (n === npc || n.npcId === 'guru') continue;   // riders pass each other
        const p = n.character?.group?.position;
        if (p && Math.hypot(p.x - x, p.z - z) < 0.9) return d;
      }
      const cols = ctx.world?.queryColliders ? ctx.world.queryColliders(x, z, 0.9, []) : ctx.world?.colliders;
      for (const c of cols || []) {
        const hit = c.r !== undefined
          ? Math.hypot(x - c.cx, z - c.cz) < c.r + 0.45
          : (x > c.minX - 0.45 && x < c.maxX + 0.45 && z > c.minZ - 0.45 && z < c.maxZ + 0.45);
        if (hit) return d;
      }
    }
    return 0;
  }
  function finishRide(n) {
    const ch = n.character;
    parkBike();
    ch.pose = null; ch.steer = 0;
    setNpc(STAND.x, ctx.heightAt(STAND.x, STAND.z), STAND.z);
    n.brain = false;            // normal route takes over again
    phase = 'idle'; guruFree = 0;
  }

  function enter() { phase = 'idle'; wp = 0; guruFree = 0; npc = null; bike = null; parkBike(); }
  function exit() {
    const n = getNpc(); if (n) { n.brain = false; n.character.pose = null; }
    npc = null; bike = null; phase = 'idle';
  }

  function update(dt, t) {
    const n = getNpc(), b = getBike(); if (!n || !b) return;
    const ch = n.character;
    const talking = ctx.dialogue?.open && ctx.state.talkingTo === n;
    
    if (phase === 'idle') {
      guruFree += dt;
      if (Math.hypot(b.x - PARK.x, b.z - PARK.z) > 0.05 && !ctx.state.mount) parkBike();
      if (guruFree >= IDLE_BEFORE_RIDE && !talking && !ctx.state.mount) { phase = 'walk'; n.brain = true; ch.pose = null; }
      return;
    }
    if (talking) { ch.update(dt, still, t); return; }

    const gp = ch.group.position;
    if (phase === 'walk') {
      const dx = STAND.x - gp.x, dz = STAND.z - gp.z, dist = Math.hypot(dx, dz);
      if (dist < 0.25) {
        phase = 'ride'; wp = 0; speed = 0; stuck = 0; ch.pose = 'scooty';
        if (b.beacon?.group) b.beacon.group.visible = false;
        return;
      }
      const s = Math.min(1.7 * dt, dist);
      gp.x += dx / dist * s; gp.z += dz / dist * s; gp.y = ctx.heightAt(gp.x, gp.z);
      ch.heading = Math.atan2(dx, dz);
      vel.set(dx / dist * 1.7, 0, dz / dist * 1.7);
      ch.update(dt, vel, t);
      setNpc(gp.x, gp.y, gp.z);
      return;
    }

    // ride
    const tw = ROUTE[wp], dx = tw.x - pos.x, dz = tw.z - pos.z;
    if (Math.hypot(dx, dz) < 1.2) {
      if (wp < ROUTE.length - 1) wp++; else { finishRide(n); return; }
    }
    const th = Math.atan2(dx, dz), diff = Math.atan2(Math.sin(th - heading), Math.cos(th - heading));
    heading += diff * Math.min(1, dt * TURN);
    const steer = Math.max(-0.45, Math.min(0.45, diff * 0.75));
    if (b.model.bars) b.model.bars.rotation.y = steer;
    ch.steer = steer;
    const hit = blocked(Math.max(1.8, speed * 0.75));
    let target = Math.abs(diff) > 0.5 ? 3.2 : CRUISE;
    if (hit) { target = hit < 1.25 ? 0 : 1.5; speed = Math.max(0, speed - BRAKE * dt); }
    else speed = speed < target ? Math.min(target, speed + ACCEL * dt) : Math.max(target, speed - BRAKE * 0.5 * dt);
    stuck = speed < 0.15 ? stuck + dt : 0;
    if (stuck > 3) { finishRide(n); return; }   // boxed in: give up and park
    const step = speed * dt;
    pos.x += Math.sin(heading) * step; pos.z += Math.cos(heading) * step;
    const y = ctx.heightAt(pos.x, pos.z);
    b.model.group.position.set(pos.x, y, pos.z);
    b.model.group.rotation.y = heading;
    b.model.group.rotation.z = -steer * 0.25 * Math.min(1, speed / 4);
    for (const w of b.model.wheels || []) w.rotation.x += step / 0.36;
    b.x = pos.x; b.z = pos.z; b.heading = heading;
    if (b.hit) b.hit.position.set(pos.x, 1.3, pos.z);
    ch.group.position.set(pos.x - Math.sin(heading) * 0.1, y + 0.3, pos.z - Math.cos(heading) * 0.1);
    ch.heading = heading; ch.pose = 'scooty';
    ch.update(dt, still, t);
    n.x = pos.x; n.z = pos.z;
    if (n.beacon?.group) n.beacon.group.position.set(pos.x, y + 0.04, pos.z);
    if (n.hit) n.hit.position.set(pos.x, 1.3, pos.z);
  }
  return { enter, exit, update, getPhase: () => phase };
}
