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
// Shabeer rides an inner lane so he and Guru pass side by side instead of through each other.
const LANE = 1.3;
for (const p of ROUTE) {
  if (p.x < -24 && p.x > -26) p.x += LANE; else if (p.x > 25) p.x -= LANE;
  if (p.z < -28) p.z += LANE; else if (p.z > 26.5) p.z -= LANE;
}
// Seats along the bike's own axis (+z is the direction of travel): the driver sits forward, the passenger directly behind
const DRIVER_Z = -0.05, PASSENGER_Z = -0.52, SEAT_Y = 0.3;
const still = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };

export function createShabeerRoutine(ctx) {
  let phase = 'idle';          // idle | walk | ride
  let wp = 0, speed = 0, stuck = 0, guruFree = 0;
  let passenger = false, dismounting = false, hold = 0, grace = 0, bypass = 0;
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
      if (pp && !passenger && grace <= 0 && Math.hypot(pp.x - x, pp.z - z) < 1.1) return d;
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
    if (passenger) placeNathanBeside(true);
    parkBike();
    ch.pose = null; ch.steer = 0;
    setNpc(STAND.x, ctx.heightAt(STAND.x, STAND.z), STAND.z);
    n.brain = false;            // normal route takes over again
    phase = 'idle'; guruFree = 0;
  }

  /* Nathan steps off onto walkable ground beside the bike (right, left, then behind, then wider rings) */
  function placeNathanBeside(silent) {
    if (!passenger) return;
    passenger = false; dismounting = false;
    const st = ctx.state, pl = ctx.player;
    st.passengerOf = null;
    pl.pose = null; pl.riding = false;
    const px = Math.cos(heading), pz = -Math.sin(heading), fx = Math.sin(heading), fz = Math.cos(heading);
    const cands = [];
    for (const r of [1.3, 1.8, 2.4]) cands.push([px * r, pz * r], [-px * r, -pz * r], [-fx * r, -fz * r], [px * r - fx * r, pz * r - fz * r], [-px * r - fx * r, -pz * r - fz * r], [fx * r, fz * r]);
    let spot = null;
    for (const [ox, oz] of cands) {
      const x = pos.x + ox, z = pos.z + oz;
      if (ctx.solidFree?.(x, z) !== false && (!ctx.nav || ctx.nav.isWalkable(x, z, 0.32)) && (ctx.world?.floorAt?.(x, z) ?? null) === null) { spot = { x, z }; break; }
    }
    if (!spot) spot = { x: pos.x + px * 1.3, z: pos.z + pz * 1.3 };
    pl.group.position.set(spot.x, ctx.heightAt(spot.x, spot.z), spot.z);
    pl.group.rotation.set(0, 0, 0);
    pl.heading = Math.atan2(pos.x - spot.x, pos.z - spot.z);
    ctx.velocity?.set(0, 0, 0);
    st.path = []; st.nearby = null;
    hold = 1.6; stuck = 0; grace = 4;
    if (!silent) ctx.toast('Got off the bike.');
  }

  /* Nathan climbs on behind Shabeer. Works whether the bike is parked, being walked to, or already out on the road */
  function boardNathanAsPassenger() {
    const n = getNpc(), b = getBike();
    const st = ctx.state;
    if (!n || !b || passenger || st.passengerOf || st.mount || st.seated || ctx.dialogue?.open) return false;
    if (phase !== 'ride') {
      phase = 'ride'; wp = 0; speed = 0; stuck = 0; n.brain = true; n.character.pose = 'scooty';
    }
    if (b.beacon?.group) b.beacon.group.visible = false;
    passenger = true; dismounting = false; hold = 0.5;
    st.passengerOf = 'shabeer'; st.path = []; st.nearby = null;
    ctx.player.pose = 'ride'; ctx.player.riding = true;
    ctx.toast(`Riding with Shabeer! ${ctx.isTouch ? 'Tap Get off' : 'Press E'} to get off.`);
    return true;
  }
  /* Ask Shabeer to pull up; Nathan steps off once the bike has stopped (immediately when force is set) */
  function dismountNathanPassenger(force = false) {
    if (!passenger) return;
    if (force || speed < 0.3) placeNathanBeside(force); else dismounting = true;
  }

  function enter() { phase = 'idle'; wp = 0; guruFree = 0; npc = null; bike = null; passenger = false; dismounting = false; hold = 0; parkBike(); }
  function exit() {
    if (passenger) placeNathanBeside(true);
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
    if (hold > 0) hold -= dt;
    if (grace > 0) grace -= dt;
    const tw = ROUTE[wp], dx = tw.x - pos.x, dz = tw.z - pos.z;
    if (Math.hypot(dx, dz) < 1.2) {
      if (wp < ROUTE.length - 1) wp++; else { const wasPassenger = passenger; finishRide(n); if (wasPassenger) ctx.toast('Full circle! Back where we started.'); return; }
    }
    const th = Math.atan2(dx, dz), diff = Math.atan2(Math.sin(th - heading), Math.cos(th - heading));
    heading += diff * Math.min(1, dt * TURN);
    const steer = Math.max(-0.45, Math.min(0.45, diff * 0.75));
    if (b.model.bars) b.model.bars.rotation.y = steer;
    ch.steer = steer;
    if (bypass > 0) bypass -= dt;
    const hit = bypass > 0 ? 0 : blocked(Math.max(1.8, speed * 0.75));   // after a long wait, edge past whatever is in the way
    let target = Math.abs(diff) > 0.5 ? 3.2 : CRUISE;
    if (dismounting || (hold > 0 && !passenger)) { target = 0; speed = Math.max(0, speed - BRAKE * dt); }
    else if (hit) { target = hit < 1.25 ? 0 : 1.5; speed = Math.max(0, speed - BRAKE * dt); }
    else speed = speed < target ? Math.min(target, speed + ACCEL * dt) : Math.max(target, speed - BRAKE * 0.5 * dt);
    stuck = speed < 0.15 && !dismounting && hold <= 0 && grace <= 0 ? stuck + dt : 0;
    if (stuck > 3) {
      // with Nathan on the back the ride always completes the full circle: wait, then edge past the blocker instead of teleporting home
      if (passenger) { bypass = 2.5; stuck = 0; } else { finishRide(n); return; }
    }
    const step = speed * dt;
    pos.x += Math.sin(heading) * step; pos.z += Math.cos(heading) * step;
    const y = ctx.heightAt(pos.x, pos.z);
    b.model.group.position.set(pos.x, y, pos.z);
    b.model.group.rotation.y = heading;
    b.model.group.rotation.z = -steer * 0.25 * Math.min(1, speed / 4);
    for (const w of b.model.wheels || []) w.rotation.x += step / 0.36;
    b.x = pos.x; b.z = pos.z; b.heading = heading;
    if (b.hit) b.hit.position.set(pos.x, 1.3, pos.z);
    const fx = Math.sin(heading), fz = Math.cos(heading);
    ch.group.position.set(pos.x + fx * DRIVER_Z, y + SEAT_Y, pos.z + fz * DRIVER_Z);
    ch.heading = heading; ch.pose = 'scooty';
    ch.update(dt, still, t);
    if (passenger) {
      const pl = ctx.player;
      pl.group.position.set(pos.x + fx * PASSENGER_Z, y + SEAT_Y, pos.z + fz * PASSENGER_Z);
      pl.group.rotation.set(0, 0, 0);
      pl.heading = heading; pl.pose = 'ride'; pl.riding = true;
      ctx.velocity?.set(fx * speed, 0, fz * speed);
      if (dismounting && speed < 0.25) placeNathanBeside(false);
    }
    n.x = pos.x; n.z = pos.z;
    if (n.beacon?.group) n.beacon.group.position.set(pos.x, y + 0.04, pos.z);
    if (n.hit) n.hit.position.set(pos.x, 1.3, pos.z);
  }
  return {
    enter, exit, update, boardNathanAsPassenger, dismountNathanPassenger,
    getPhase: () => phase, isPassengerActive: () => passenger
  };
}
