import * as THREE from 'three';

// Tahiti life: NPC brains (activity scheduling on the nav grid), Harris as a
// travelling companion, speech bubbles, joining activities, group photos,
// motorcycle passengers and small playable events. Only runs on Tahiti.
//
// Every Tahiti NPC gets a "brain": it picks an activity for its group, takes a
// free slot, walks there along a nav path, then holds the activity's pose for a
// while. Activities have a limited number of slots, so the crowd naturally
// splits up (some dance, some sit, some eat, some swim...).

const V = (x, z) => ({ x, z });
// each gang's own beach: centre, plus tangent (along the shore) and normal (out to sea)
const BEACH = {
  vg: { c: V(-28.5, -23.6), t: V(0.638, -0.77), n: V(-0.77, -0.638), sea: 4.6 },
  ol: { c: V(38.5, 0), t: V(0, 1), n: V(1, 0), sea: 5.2 },
};
const on = (g, along, out) => { const b = BEACH[g]; return [+(b.c.x + b.t.x * along + b.n.x * out).toFixed(2), +(b.c.z + b.t.z * along + b.n.z * out).toFixed(2)]; };
const seaFace = (g) => (Math.atan2(BEACH[g].n.x, BEACH[g].n.z) * 180) / Math.PI;   // facing the water
const landFace = (g) => seaFace(g) + 180;
// party: two rows of dancers on each gang's own beach, facing inland
const PARTY = Object.fromEntries(['vg', 'ol'].map((g) => [g, [-4.5, -1.5, 1.5, 4.5, -3, 0, 3, -4.5, -1.5, 1.5, 4.5].map((s, i) => on(g, s, i < 4 ? 0.8 : i < 7 ? -0.8 : -2.4))]));
// Anu and Shabesh keep their distance from each other
const AVOID = { tahiti_cf1: 'tahiti_cf2', tahiti_cf2: 'tahiti_cf1' };
// slot: [x, z, pose, faceDeg, opts]
const ACTIVITIES = {
  vg: {
    room: { w: 2, slots: [[-15.0, -12.4, 'look', 0], [-12.6, -11.6, 'phone', 180], [-17.2, -11.2, 'lean', 90], [-10.45, -14.6, 'sit', -90, { free: true }]], lines: ['Who moved my charger?', 'Same room, same chaos.', 'Five more minutes.'] },
    campfire: { w: 3, slots: [[-26.1, -14.0, 'sing', 90, { free: true }], [-22.9, -14.0, 'sing', -90, { free: true }], [-24.5, -12.4, 'sing', 180, { free: true }], [-24.5, -15.6, 'sing', 0]], lines: ['♪ la la la ♪', '♪ one more verse ♪', 'Okay, okay, story time.', 'And then the bike just stopped. In the middle of the road.'] },
    courtyard: { w: 2, slots: [[-15.0, -2.6, 'dance1', 20], [-12.6, -2.2, 'dance2', 0], [-10.6, -3.0, 'dance3', -20]], lines: ['Woo!', 'Watch this move.', 'That was NOT a dance.'] },
    eat: { w: 2, slots: [[-16.2, -1.2, 'eat', 180, { free: true }], [-16.9, -2.7, 'eat', 90], [-15.3, -2.9, 'eat', -90]], lines: ['Mmm.', 'Who made this?', 'Pass the chips.'] },
    beach: { w: 2, slots: [[...on('vg', -2, 1.5), 'look', seaFace('vg')], [...on('vg', -1.2, BEACH.vg.sea), 'swim', seaFace('vg'), { free: true, water: true }], [...on('vg', 1.6, BEACH.vg.sea), 'swim', seaFace('vg') - 20, { free: true, water: true }], [...on('vg', 2.4, 1.5), 'cheer', seaFace('vg')]], lines: ["We're heading to the beach. You coming?", 'Water\'s warm!', 'Race you to the rocks!'] },
  },
  ol: {
    deck: { w: 3, slots: [[19.0, 0.6, 'dance1', 90], [20.6, 1.6, 'dance2', 90], [18.4, 2.6, 'dance3', 60]], lines: ['Oi Nathan! Come join the party!', 'Turn it up!', 'That\'s my song!'] },
    dj: { w: 1, slots: [[21.5, -6.5, 'dj', 180]], lines: ['Next track!', 'Requests? No requests.'] },
    table: { w: 2, slots: [[18.7, -4.5, 'sit', 90, { free: true }], [20.5, -4.5, 'sit', -90, { free: true }], [19.6, -5.4, 'sit', 0, { free: true }], [19.6, -3.6, 'sit', 180, { free: true }]], lines: ['Your move.', 'That\'s cheating.', 'Best of three?'] },
    railing: { w: 2, slots: [[23.3, -2.0, 'gaze', 90], [22.8, -5.6, 'look', 90]], lines: ['Look at that sunset.', 'Could stay here forever.'] },
    lounge: { w: 1, slots: [[22.6, 0.2, 'sit', -90, { free: true }], [22.6, 2.2, 'sit', -90, { free: true }]], lines: ['Wake me up for food.'] },
    bbq: { w: 2, slots: [[13.6, 8.6, 'cook', 180], [12.0, 10.4, 'eat', 90], [15.2, 10.4, 'eat', -90]], lines: ['Who wants seconds?', 'Don\'t touch the grill.', 'This is the best part.'] },
    beach: { w: 2, slots: [[...on('ol', -2, 1.5), 'look', seaFace('ol')], [...on('ol', -1.2, BEACH.ol.sea), 'swim', seaFace('ol'), { free: true, water: true }], [...on('ol', 1.6, BEACH.ol.sea), 'swim', seaFace('ol') + 20, { free: true, water: true }], [...on('ol', 2.4, 1.5), 'cheer', seaFace('ol')], [...on('ol', 0.4, 0.2), 'sit', seaFace('ol'), { free: true }]], lines: ['Last one in buys dinner!', 'This beach is ours.', 'Sun, sand, zero emails.'] },
    selfie: { w: 1, slots: [[17.4, -1.6, 'phone', 135], [17.9, -2.5, 'cheer', 135], [16.9, -2.7, 'look', 135]], lines: ['Smile!', 'One more, someone blinked.'] },
  },
};
const TERMINAL = V(-15.6, 13.2);       // where Harris meets Nathan
const VG_MEET = V(-13.8, -1.4);        // courtyard
const POSE_DANCES = ['dance1', 'dance2', 'dance3'];
const GANG_NAME = { vg: 'Vanderlinde Gang', ol: 'The Outlaws' };

export function createTahiti(ctx) {
  const { state, player } = ctx;
  let brains = [], bubbles = [], layer = null, party = { vg: 0, ol: 0 }, partyLights = {}, passenger = null, buddy = null;
  let photo = null, race = null, hunt = null, lastHint = 0;
  const harris = () => brains.find((b) => b.id === 'harris');
  const P = () => player.group.position;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const def = (id) => (state.content.npcs || []).find((n) => n.id === id) || {};

  // ---------- speech bubbles ----------
  function bubble(npcOrPlayer, text, secs = 3) {
    if (!layer) return;
    const el = document.createElement('div');
    el.className = 'tahiti-bubble'; el.textContent = text;
    layer.append(el);
    bubbles.push({ el, who: npcOrPlayer, until: performance.now() + secs * 1000 });
  }
  const pv = new THREE.Vector3();
  function drawBubbles() {
    const now = performance.now(), w = innerWidth, h = innerHeight;
    bubbles = bubbles.filter((b) => {
      if (now > b.until) { b.el.remove(); return false; }
      const g = b.who.character ? b.who.character.group : b.who.group;
      pv.set(g.position.x, g.position.y + 2.75, g.position.z).project(ctx.camera);
      const x = (pv.x * 0.5 + 0.5) * w, y = (-pv.y * 0.5 + 0.5) * h;
      b.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
      b.el.style.display = pv.z > 1 || x < -80 || x > w + 80 ? 'none' : '';
      return true;
    });
  }

  // ---------- brains ----------
  function slotOf(group, act, i) { const s = ACTIVITIES[group][act].slots[i]; return { x: s[0], z: s[1], pose: s[2], face: (s[3] * Math.PI) / 180, opts: s[4] || {} }; }
  function taken(group, act, i, except) { return brains.some((b) => b !== except && b.group === group && b.act === act && b.slotI === i); }
  function freeSlot(group, act, except) {
    const n = ACTIVITIES[group][act].slots.length;
    const order = [...Array(n).keys()].sort(() => Math.random() - 0.5);
    return order.find((i) => !taken(group, act, i, except));
  }
  function pickActivity(b) {
    const acts = Object.entries(ACTIVITIES[b.group]).filter(([k]) => k !== b.act);
    const night = ctx.isNight?.();
    const rival = AVOID[b.id] && brains.find((o) => o.id === AVOID[b.id]);
    const options = acts.filter(([k]) => freeSlot(b.group, k, b) !== undefined && !(rival && rival.act === k));
    if (!options.length) return null;
    let total = 0; const w = options.map(([k, a]) => { const x = (a.w || 1) * (night && (k === 'deck' || k === 'campfire') ? 2 : 1) * (b.id === 'tahiti_cf1' && k === 'railing' ? 4 : 1); total += x; return x; });
    let r = Math.random() * total;
    for (let i = 0; i < options.length; i++) { r -= w[i]; if (r <= 0) return options[i][0]; }
    return options[0][0];
  }
  function goTo(b, x, z, then, run = false) {
    const p = b.it.character.group.position;
    const path = ctx.nav.findPath(p.x, p.z, x, z);
    b.path = path.length ? path : [{ x, z }];
    b.goal = { x, z }; b.then = then; b.run = run; b.mode = 'walk';
    b.it.character.pose = null;
  }
  function assign(b, act) {
    const i = freeSlot(b.group, act, b);
    if (i === undefined) return false;
    b.act = act; b.slotI = i; b.mode = 'walk';
    const s = slotOf(b.group, act, i);
    goTo(b, s.x, s.z, () => arrive(b));
    return true;
  }
  function arrive(b) {
    const s = slotOf(b.group, b.act, b.slotI);
    b.mode = 'stay'; b.until = performance.now() + (14 + Math.random() * 14) * 1000;
    const ch = b.it.character;
    ch.group.position.x = s.x; ch.group.position.z = s.z;
    ch.heading = s.face; b.face = s.face;
    ch.pose = s.pose; b.swim = !!s.opts.water;
    // friendly shoulder tap / hug with whoever is already there
    const mate = brains.find((o) => o !== b && o.mode === 'stay' && dist(o.it.character.group.position, ch.group.position) < 1.8);
    if (mate && Math.random() < 0.45) { ch.play(Math.random() < 0.5 ? 'hug' : 'tap'); }
    if (Math.random() < 0.35) bubble(b.it, rand(ACTIVITIES[b.group][b.act].lines), 3.2);
  }
  const rand = (a) => a[Math.floor(Math.random() * a.length)];

  function harrisTick(b, now) {
    // companion states: ARRIVING → WALKING_TO_VANDERLINDE → SOCIALIZING ⇄
    // RETURNING_TO_TERMINAL → WAITING_FOR_NATHAN → BOARDING → TRAVELLING
    const p = P(), hp = b.it.character.group.position;
    const atTerminal = dist(p, TERMINAL) < 9 || dist(p, ctx.jetPoint()) < 7;
    if (!atTerminal && dist(p, ctx.jetPoint()) > 12) b.leftTerminal = true;      // Nathan has gone exploring
    const nearTerminal = atTerminal && b.leftTerminal;
    if (b.hstate === 'ARRIVING') { b.hstate = 'WALKING_TO_VANDERLINDE'; bubble(b.it, 'Nathan, the gang\'s waiting for us!', 3); goTo(b, VG_MEET.x, VG_MEET.z, () => { b.hstate = 'SOCIALIZING'; b.mode = 'idle'; }); return true; }
    if ((b.hstate === 'SOCIALIZING' || b.hstate === 'WALKING_TO_VANDERLINDE') && nearTerminal) {
      release(b); b.hstate = 'RETURNING_TO_TERMINAL';
      goTo(b, TERMINAL.x + 1.2, TERMINAL.z + 0.8, () => { b.hstate = 'WAITING_FOR_NATHAN'; b.mode = 'wait'; bubble(b.it, 'Ready for the next destination?', 3.4); }, true);
      return true;
    }
    if (b.hstate === 'RETURNING_TO_TERMINAL' && b.mode !== 'walk') { b.hstate = 'WAITING_FOR_NATHAN'; b.mode = 'wait'; }
    if (b.hstate === 'WAITING_FOR_NATHAN') {
      if (!nearTerminal && dist(p, TERMINAL) > 14) { b.hstate = 'WALKING_TO_VANDERLINDE'; goTo(b, VG_MEET.x, VG_MEET.z, () => { b.hstate = 'SOCIALIZING'; b.mode = 'idle'; }); return true; }
      // stand beside Nathan, facing him
      if (b.mode === 'wait') {
        const side = { x: p.x + 1.3, z: p.z + 0.6 };
        if ((dist(hp, side) > 1.0 || dist(hp, p) < 0.9) && ctx.nav.isWalkable(side.x, side.z)) { goTo(b, side.x, side.z, () => { b.mode = 'wait'; }); b.mode = 'walk'; }
        b.it.character.heading += Math.atan2(Math.sin(Math.atan2(p.x - hp.x, p.z - hp.z) - b.it.character.heading), Math.cos(Math.atan2(p.x - hp.x, p.z - hp.z) - b.it.character.heading)) * 0.1;
      }
      return b.mode === 'wait';
    }
    return false;
  }
  function release(b) { b.act = null; b.slotI = null; b.it.character.pose = null; b.swim = false; }

  const vel = new THREE.Vector3();
  function tickBrain(b, dt, t, now) {
    const it = b.it, ch = it.character, gp = ch.group.position;
    if (it.frozen || b.riding) return;                           // cinematic or on a bike
    vel.set(0, 0, 0);
    const talking = state.talkingTo === it;
    if (talking) {
      ch.pose = null;
      const p = P(); ch.heading += Math.atan2(Math.sin(Math.atan2(p.x - gp.x, p.z - gp.z) - ch.heading), Math.cos(Math.atan2(p.x - gp.x, p.z - gp.z) - ch.heading)) * Math.min(1, dt * 8);
    } else if (b.mode === 'walk' && b.path?.length) {
      const wp = b.path[0], dx = wp.x - gp.x, dz = wp.z - gp.z, d = Math.hypot(dx, dz);
      const sp = b.run ? 3.4 : 1.8;
      if (d < 0.12) { b.path.shift(); if (!b.path.length) { const f = b.then; b.then = null; b.mode = 'idle'; f?.(); } }
      else {
        // give way to someone right ahead
        const ahead = brains.some((o) => o !== b && dist(o.it.character.group.position, { x: gp.x + (dx / d) * 0.6, z: gp.z + (dz / d) * 0.6 }) < 0.55);
        if (!ahead) { b.stuck = 0; const s = Math.min(sp * dt, d); gp.x += (dx / d) * s; gp.z += (dz / d) * s; vel.set(dx / d, 0, dz / d).multiplyScalar(sp); }
        else if ((b.stuck = (b.stuck || 0) + dt) > 1.2) {
          // someone is standing in the way: close enough counts as arrived, otherwise sidestep
          const last = b.path[b.path.length - 1];
          if (dist(gp, last) < 1.8) { b.path = []; b.stuck = 0; const f = b.then; b.then = null; b.mode = 'idle'; f?.(); }
          else { const sx = gp.x - (dz / d) * 0.5, sz = gp.z + (dx / d) * 0.5; if (ctx.nav.isWalkable(sx, sz)) { gp.x = sx; gp.z = sz; } b.stuck = 0.6; }
        }
      }
    } else if (b.mode === 'stay') {
      ch.heading += Math.atan2(Math.sin(b.face - ch.heading), Math.cos(b.face - ch.heading)) * Math.min(1, dt * 3);
      // chatty: occasionally say something, or invite Nathan when he's close
      if (Math.random() < dt * 0.02) bubble(it, rand(ACTIVITIES[b.group][b.act].lines), 3);
      const dP = dist(P(), gp);
      if (dP < 3.2 && now - (b.invited || 0) > 30000 && !state.joined) { b.invited = now; bubble(it, b.group === 'ol' ? 'Oi Nathan! Come join us!' : "Nathan! Get over here!", 3); }
      if (hunt && huntTarget() && dP < 4 && now - lastHint > 20000 && Math.random() < dt * 0.3) { lastHint = now; bubble(it, huntTarget().hint, 3.6); }
      if (now > b.until && !party[b.group]) { release(b); const a = pickActivity(b); if (a) assign(b, a); }
    } else if (b.mode === 'idle' && !b.forced) {
      const a = pickActivity(b); if (a) assign(b, a);
    }
    // swimming: drop into the water and paddle
    const ground = ctx.heightAt(gp.x, gp.z);
    gp.y = b.swim && b.mode === 'stay' ? -0.55 + Math.sin(t * 2 + gp.x) * 0.04 : ground;
    ch.update(dt, vel, t);
    it.x = gp.x; it.z = gp.z;
    it.beacon.group.position.set(gp.x, ground + 0.04, gp.z);
    it.hit.position.set(gp.x, 1.3, gp.z);
  }

  // ---------- treasure hunt ----------
  // a trail: the clue board gives the first clue, each chest holds the next one
  const TREASURE = [
    { id: 'palm', x: -8.6, z: 0.8, prize: 'a lucky shell', clue: 'Start where the four walks meet. Head west towards the hideout and check under the first palm you pass.', hint: 'Palms on the west walk. Just saying.' },
    { id: 'hideout', x: -21.4, z: -9.0, prize: 'an old bottle cap', clue: 'Nobody ever uses the west side of the Vanderlinde hideout. Walk round the outside wall.', hint: 'Round the back of the hideout, west side.' },
    { id: 'rock', x: -24.2, z: 8.2, prize: 'a tiny compass', clue: 'Something tells the pilots which way the wind blows. Look a few steps north of it.', hint: 'Ask the windsock. North of it.' },
    { id: 'beach', x: 11.6, z: 35.4, prize: 'a pirate coin', clue: 'Find the finish flag of the beach race on the south beach, then keep walking east along the sand.', hint: 'East of the race finish, on the sand.' },
    { id: 'stairs', x: 21.6, z: 9.6, prize: 'a captain\'s ring', clue: 'Last one. The Outlaws climb their stairs every day. Look at the bottom, by the tiny beach.', hint: 'Bottom of the villa stairs.' },
  ];
  const huntTarget = () => TREASURE.find((tr) => !(state.save.tahitiTreasure || []).includes(tr.id));
  const HUNT_HINTS = ['I saw something shiny earlier...'];

  // ---------- public API ----------
  const api = {
    enter() {
      layer = document.createElement('div'); layer.className = 'tahiti-bubbles'; document.body.append(layer);
      brains = ctx.world.npcs.filter((it) => it.npcId === 'harris' || it.npcId.startsWith('tahiti_')).map((it) => {
        const group = it.npcId.startsWith('tahiti_cf') ? 'ol' : 'vg';
        it.brain = true;
        return { id: it.npcId, it, group, mode: 'idle', act: null, slotI: null, hstate: it.npcId === 'harris' ? 'ARRIVING' : null };
      });
      // start everyone already in place (no rush hour on arrival)
      for (const b of brains) {
        if (b.id === 'harris') continue;
        const a = pickActivity(b); if (!a) continue;
        const i = freeSlot(b.group, a, b); b.act = a; b.slotI = i;
        const s = slotOf(b.group, a, i); const g = b.it.character.group.position; g.x = s.x; g.z = s.z; arrive(b);
      }
      partyLights = { vg: ctx.world.apis.party_lights_vg, ol: ctx.world.apis.party_lights_ol };
      const saved = state.save.tahitiTreasure || [];
      for (const it of ctx.world.interactables) if (it.kind === 'activity' && it.act === 'treasure_item' && saved.includes(it.treasureId)) it.found = true;
    },
    exit() { layer?.remove(); layer = null; bubbles = []; brains = []; party = { vg: 0, ol: 0 }; passenger = null; buddy = null; photo = null; race = null; state.joined = null; },
    harrisState() { return harris()?.hstate; },
    _debug: () => ({ brains, ACTIVITIES, party, race, photo, passenger }),
    onArrive() { const h = harris(); if (h) { h.hstate = 'ARRIVING'; h.mode = 'idle'; h.leftTerminal = false; release(h); } },
    harrisNearJet() { const h = harris(); return !!h && dist(P(), ctx.jetPoint()) < 12 && (h.hstate === 'WAITING_FOR_NATHAN' || dist(h.it.character.group.position, P()) < 4); },
    callHarrisToJet() {
      const h = harris(); if (!h) return;
      bubble(h.it, dist(P(), ctx.jetPoint()) < 12 ? 'On my way!' : 'Meet me at the jet!', 3);
      h.leftTerminal = true; h.forced = false; release(h); h.hstate = 'RETURNING_TO_TERMINAL';
      goTo(h, TERMINAL.x + 1.2, TERMINAL.z + 0.8, () => { h.hstate = 'WAITING_FOR_NATHAN'; h.mode = 'wait'; bubble(h.it, 'Ready for the next destination?', 3.4); }, true);
    },
    musicOverride() { const p = P(); return ['vg', 'ol'].some((g) => party[g] > 0 && dist(p, BEACH[g].c) < 22) ? 'party' : null; },

    update(dt, t) {
      const now = performance.now();
      if (state.cine) { const h = harris(); if (h) h.hstate = state.cine.phase === 'board' ? 'BOARDING' : 'TRAVELLING'; drawBubbles(); return; }
      for (const g of ['vg', 'ol']) if (party[g] > 0) { party[g] -= dt; if (party[g] <= 0) endParty(g); }
      for (const b of brains) {
        if (b.id === 'harris' && !b.riding && harrisTick(b, now)) { tickBrain(b, dt, t, now); continue; }
        tickBrain(b, dt, t, now);
      }
      // Nathan joined an activity: hold the slot and pose until he moves
      if (state.joined) { const j = state.joined, p = P(); p.set(j.x, ctx.heightAt(j.x, j.z) + (j.swim ? -0.55 : 0), j.z); player.heading = j.face; player.pose = j.pose; }
      if (passenger) updatePassenger(dt, t);
      if (photo) photoTick(dt);
      if (race) raceTick(dt);
      for (const it of ctx.world.interactables) if (it.kind === 'activity' && it.act === 'treasure_item') {
        const vis = !it.found && !!hunt && huntTarget()?.id === it.treasureId && dist(P(), it) < 9;
        it.beacon.group.visible = vis; it.hit.visible = vis; it.disabled = !vis;
      }
      drawBubbles();
    },

    // context hints for the prompt (R / F / G)
    hints() {
      const h = [];
      if (state.mount || state.joined) return state.joined ? ['Move to leave'] : [];
      if (nearestNpc(2.4) && ctx.hasMoto()) h.push('R Invite for a ride');
      if (joinable()) h.push('F Join activity');
      const ps = nearPhotoSpot(); if (ps) h.push(`G ${GANG_NAME[ps.gang]} photo`);
      const tg = hunt && huntTarget(); if (tg) { const d = dist(P(), tg); h.push(`Treasure ${(state.save.tahitiTreasure || []).length + 1}/5: ${d < 6 ? 'HOT!' : d < 14 ? 'warm' : d < 28 ? 'cool' : 'cold'}`); }
      return h;
    },
    key(k) {
      if (state.cine || state.minigame || state.groupScene || ctx.dialogue.open) return false;
      if (k === 'r') return inviteRide();
      if (k === 'f') return joinActivity();
      if (k === 'g') return startPhoto();
      return false;
    },
    leaveJoin() { if (!state.joined) return; state.joined = null; player.pose = null; const p = P(); p.y = ctx.heightAt(p.x, p.z); },
    interact(it) { return activityInteract(it); },
    // motorcycle passengers
    onMotoMount(m) {
      if (buddy) { const b = buddy; buddy = null; boardPassenger(b, m); return; }
      ctx.choose('Who do you want to ride with?', [...brains.filter((b) => !b.riding && dist(b.it.character.group.position, P()) < 30).map((b) => ({ label: def(b.id).name || b.id, value: b })), { label: 'Ride alone', value: null }], (b) => { if (b) boardPassenger(b, m); });
    },
    passengerReady() { return !passenger || passenger.seated; },
    onMotoDismount(spot) {
      if (!passenger) return;
      const b = passenger.b; const side = spot ? { x: spot.x + 0.9, z: spot.z + 0.5 } : null;
      const gp = b.it.character.group.position;
      const s = side && ctx.solidFree(side.x, side.z) ? side : spot || { x: gp.x, z: gp.z };
      gp.set(s.x, ctx.heightAt(s.x, s.z), s.z);
      b.riding = false; b.it.passenger = false; b.forced = false; b.it.character.pose = null; b.mode = 'idle'; release(b); b.it.beacon.group.visible = true;
      bubble(b.it, 'That was fun!', 2.5);
      passenger = null;
    },
  };

  // ---------- joining activities ----------
  function joinable() {
    if (state.joined) return null;
    const p = P();
    let best = null, bd = 3.2;
    const pz = ['vg', 'ol'].find((g) => party[g] > 0 && dist(p, BEACH[g].c) < 8);
    for (const [g, acts] of Object.entries(ACTIVITIES)) for (const [k, a] of Object.entries(acts)) {
      if (!brains.some((b) => b.group === g && b.act === k && b.mode === 'stay')) continue;
      a.slots.forEach((s, i) => { if (taken(g, k, i)) return; const d = Math.hypot(s[0] - p.x, s[1] - p.z); if (d < bd) { bd = d; best = { g, k, i }; } });
    }
    if (!best && pz) return { party: pz };
    return best;
  }
  function joinActivity() {
    const j = joinable(); if (!j) return false;
    if (j.party) { const p = P(); state.joined = { x: p.x, z: p.z, pose: rand(POSE_DANCES), face: (landFace(j.party) * Math.PI) / 180 }; ctx.toast('Dancing! Move to stop.'); return true; }
    const s = slotOf(j.g, j.k, j.i);
    state.joined = { x: s.x, z: s.z, pose: s.pose === 'swim' ? 'swim' : s.pose, face: s.face, swim: !!s.opts.water };
    state.path = [];
    const mates = brains.filter((b) => b.group === j.g && b.act === j.k);
    if (mates[0]) bubble(mates[0].it, rand(['Yes! Nathan\'s in!', 'Finally!', 'Make room!']), 2.6);
    ctx.sfx.open();
    return true;
  }

  // ---------- motorcycle: invite + passenger ----------
  function nearestNpc(r) { let best = null, bd = r; for (const b of brains) { const d = dist(b.it.character.group.position, P()); if (d < bd && !b.riding) { bd = d; best = b; } } return best; }
  function inviteRide() {
    const b = nearestNpc(2.4); if (!b || !ctx.hasMoto()) return false;
    buddy = b; release(b); b.forced = true; b.mode = 'follow';
    bubble(b.it, rand(["Let's go for a ride!", 'Finally, a ride!', 'You drive, I DJ.']), 3);
    ctx.toast(`${def(b.id).name || 'Friend'} is coming along. Get on a motorcycle.`);
    return true;
  }
  function boardPassenger(b, m) {
    release(b); b.forced = true;
    passenger = { b, m, seated: false };
    const bp = m.it.model.group.position;
    goTo(b, bp.x - 0.9, bp.z + 0.4, () => { passenger && (passenger.seated = true); b.riding = true; b.it.passenger = true; bubble(b.it, 'Hold on tight? You hold on tight.', 2.6); }, true);
    b.mode = 'walk';
  }
  function updatePassenger(dt, t) {
    const { b, m } = passenger;
    if (!state.mount || state.mount !== m) { passenger = null; b.riding = false; b.it.passenger = false; b.forced = false; return; }
    if (!passenger.seated) return;
    const ch = b.it.character, g = m.it.model.group, h = m.heading;
    ch.group.position.set(g.position.x - Math.sin(h) * 0.62, g.position.y + 0.74, g.position.z - Math.cos(h) * 0.62);
    ch.heading = h; ch.pose = 'ride';
    ch.update(dt, new THREE.Vector3(), t);
    b.it.x = ch.group.position.x; b.it.z = ch.group.position.z;
    b.it.beacon.group.visible = false;
  }
  // follow mode (invited, walking with Nathan to a bike)
  setInterval(() => {
    if (!buddy || buddy.riding || state.cine) return;
    const gp = buddy.it.character.group.position, p = P();
    if (dist(gp, p) > 2.4 && buddy.mode !== 'walk') { goTo(buddy, p.x + 0.9, p.z + 0.9, () => { if (buddy) buddy.mode = 'follow'; }, dist(gp, p) > 6); buddy.mode = 'walk'; }
  }, 500);

  // ---------- group photo ----------
  // each gang has its own photo spot (camera tripod); only that gang lines up there
  const photoSpots = () => ctx.world.interactables.filter((i) => i.kind === 'activity' && i.act === 'photo');
  function nearPhotoSpot(r = 6) { let best = null, bd = r; for (const s of photoSpots()) { const d = dist(s, P()); if (d < bd) { bd = d; best = s; } } return best; }
  const FORMATION = [[1, 0], [-1, 0], [2, 0], [-2, 0], [0.5, 1], [-0.5, 1], [1.5, 1], [-1.5, 1], [2.5, 1], [-2.5, 1]];
  function startPhoto(spot = nearPhotoSpot()) {
    if (!spot) { ctx.toast('Find a gang photo spot (look for the camera tripod).'); return false; }
    if (photo) return false;
    const gang = spot.gang;
    const crew = brains.filter((b) => b.group === gang && b.id !== 'harris' && !b.riding);
    if (!crew.length) return false;
    for (const [id, at] of [['tahiti_cf1', 2], ['tahiti_cf2', 3]]) { const i = crew.findIndex((b) => b.id === id); if (i >= 0 && crew.length > at) { const [x] = crew.splice(i, 1); crew.splice(at, 0, x); } }
    state.joined = null; state.path = [];
    const c = { x: spot.x, z: spot.z };
    P().set(c.x, ctx.heightAt(c.x, c.z), c.z);       // Nathan stands in the middle
    const face = Math.PI / 4;                       // towards the camera
    const rx = Math.cos(face), rz = -Math.sin(face);  // camera-right in world space
    const bx = -Math.sin(face), bz = -Math.cos(face); // one step back, away from the camera
    const spots = crew.map((b, i) => {
      const [side, row] = FORMATION[i % FORMATION.length];
      let x = c.x + rx * side * 0.9 + bx * row * 0.9, z = c.z + rz * side * 0.9 + bz * row * 0.9;
      if (!ctx.nav.isWalkable(x, z)) { x = c.x + rx * side * 0.6; z = c.z + rz * side * 0.6; }
      return { b, x, z };
    });
    bubble(crew[0].it, `${GANG_NAME[gang]}, photo time!`, 2.6);
    for (const s of spots) { release(s.b); s.b.forced = true; goTo(s.b, s.x, s.z, () => { s.b.mode = 'pose'; }, true); s.b.mode = 'walk'; }
    player.heading = face;
    photo = { spots, t: 0, shot: false, gang };
    ctx.toast(`${GANG_NAME[gang]} photo. Everyone in!`);
    return true;
  }
  function photoTick(dt) {
    photo.t += dt;
    const ready = photo.spots.every((s) => s.b.mode === 'pose') || photo.t > 8;
    for (const s of photo.spots) if (s.b.mode === 'pose') { const ch = s.b.it.character; ch.heading += Math.atan2(Math.sin(Math.PI / 4 - ch.heading), Math.cos(Math.PI / 4 - ch.heading)) * 0.2; ch.pose = 'cheer'; }
    if (ready && !photo.count) { photo.count = 3.2; }
    if (photo.count) {
      const before = Math.ceil(photo.count); photo.count -= dt; const after = Math.ceil(photo.count);
      if (after !== before && after > 0) { ctx.flash(String(after)); ctx.sfx.open(); }
      if (photo.count <= 0 && !photo.shot) {
        photo.shot = true; player.pose = 'cheer';
        const url = ctx.capture(); ctx.flash('', true); ctx.sfx.memory();
        const key = 'nathan-exe:tahiti-photos';
        let list = []; try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch { /* ignore */ }
        if (url) { list.unshift({ url, at: Date.now(), gang: GANG_NAME[photo.gang] }); list = list.slice(0, 8); try { localStorage.setItem(key, JSON.stringify(list)); } catch { list = list.slice(0, 2); } }
        setTimeout(() => { for (const s of photo?.spots || []) { s.b.forced = false; s.b.mode = 'idle'; release(s.b); } player.pose = null; photo = null; ctx.openGallery(); }, 900);
      }
    }
  }

  // ---------- events ----------
  function startParty(g = 'vg') {
    if (party[g] > 0) return;
    party[g] = 45; ctx.toast(`${GANG_NAME[g]} beach party! F to dance.`);
    partyLights[g]?.setOn?.(true);
    const crew = brains.filter((b) => b.group === g && b.id !== 'harris' && !b.riding && !(photo && photo.spots.some((s) => s.b === b)));
    // Anu takes one end of the front row, Shabesh the other
    const order = [...crew].sort((a, b) => (a.id === 'tahiti_cf1' ? -1 : b.id === 'tahiti_cf1' ? 1 : 0));
    const sh = order.findIndex((b) => b.id === 'tahiti_cf2'); if (sh > 0 && order.length > 3) { const [x] = order.splice(sh, 1); order.splice(3, 0, x); }
    const face = (landFace(g) * Math.PI) / 180;
    order.forEach((b, i) => { release(b); b.forced = true; const s = PARTY[g][i % PARTY[g].length]; goTo(b, s[0], s[1], () => { b.mode = 'party'; b.it.character.pose = POSE_DANCES[i % 3]; b.it.character.heading = face + (i % 3 - 1) * 0.4; }, true); });
  }
  function endParty(g) {
    party[g] = 0; partyLights[g]?.setOn?.(false);
    brains.forEach((b) => { if (b.group === g && b.id !== 'harris' && (b.mode === 'party' || (b.forced && !b.riding))) { b.forced = false; b.mode = 'idle'; release(b); } });
  }
  function opponent(group) {
    const c = brains.filter((b) => !b.riding && (!group || b.group === group)).sort((a, b) => dist(a.it.character.group.position, P()) - dist(b.it.character.group.position, P()));
    return c[0];
  }
  function startRace() {
    const b = opponent(); if (!b) return;
    const A = { x: -4.0, z: 37.0 }, B = { x: 9.0, z: 36.8 };
    release(b); b.forced = true;
    const p = P(); p.set(A.x + 0.4, ctx.heightAt(A.x, A.z), A.z); state.path = []; player.heading = Math.PI / 2;
    b.it.character.group.position.set(A.x + 0.4, 0, A.z - 0.9); b.it.character.heading = Math.PI / 2; b.mode = 'race-wait';
    race = { b, A, B, t: -3.5, done: false };
    ctx.toast(`Beach race vs ${def(b.id).name}! Run to the flag at the far end.`);
  }
  function raceTick(dt) {
    const r = race; r.t += dt;
    if (r.t < 0) { const n = Math.ceil(-r.t); if (n !== r.last) { r.last = n; ctx.flash(String(n)); ctx.sfx.open(); } state.minigame = 'race'; return; }
    if (state.minigame === 'race') { state.minigame = null; ctx.flash('GO!'); goTo(r.b, r.B.x, r.B.z, () => { if (!r.done) finish(false); }, true); r.b.mode = 'walk'; }
    if (!r.done && dist(P(), r.B) < 1.4) finish(true);
    function finish(win) {
      r.done = true;
      const name = def(r.b.id).name;
      bubble(r.b.it, win ? rand(['Rematch. Now.', 'You cheated. Somehow.', 'Okay, okay, you win.']) : rand(['Too slow!', 'Easy!', 'Better luck next time!']), 3);
      ctx.toast(win ? `You beat ${name}!` : `${name} wins the race.`);
      brains.forEach((o) => { if (o !== r.b && dist(o.it.character.group.position, r.B) < 10) o.it.character.play('wave'); });
      setTimeout(() => { r.b.forced = false; r.b.mode = 'idle'; release(r.b); race = null; }, 1500);
    }
  }
  function activityInteract(it) {
    switch (it.act) {
      case 'party': startParty(it.gang); return true;
      case 'race': startRace(); return true;
      case 'dance': danceBattle(); return true;
      case 'food': foodChallenge(); return true;
      case 'volley': volley(); return true;
      case 'gallery': ctx.openGallery(); return true;
      case 'photo': startPhoto(it); return true;
      case 'clues': clues(); return true;
      case 'treasure_item': if (!it.found && hunt) foundTreasure(it); return true;
      default: return false;
    }
  }
  function cluePanel(note = '') {
    const got = state.save.tahitiTreasure || [], next = huntTarget();
    ctx.panel('tahiti/treasure.txt', `<p class="eyebrow">TAHITI · TREASURE HUNT · ${got.length}/5</p><h2 id="panel-title">${next ? `Clue ${got.length + 1}` : 'Hunt complete'}</h2>
      ${note ? `<p class="subtitle">${note}</p>` : ''}
      ${next ? `<p class="clue-text">“${next.clue}”</p><p class="muted">The chest glows when you're close. The hint bar says how warm you are, and friends drop hints too.</p>` : '<p>All five found. The bandana is yours.</p>'}
      <ol class="highlights">${TREASURE.map((tr, i) => `<li>${got.includes(tr.id) ? `✓ ${tr.prize}` : i === got.length ? 'You are here' : '???'}</li>`).join('')}</ol>`);
  }
  function clues() { hunt = hunt || { started: true }; cluePanel(); }
  function foundTreasure(it) {
    if (huntTarget()?.id !== it.treasureId) return;
    it.found = true; const s = state.save; s.tahitiTreasure = [...new Set([...(s.tahitiTreasure || []), it.treasureId])]; ctx.persist();
    ctx.sfx.memory();
    const n = s.tahitiTreasure.length, tr = TREASURE.find((x) => x.id === it.treasureId);
    if (n >= 5) { ctx.toast('All five found! You earned the captain\'s bandana.'); ctx.giveBandana(); const h = harris(); if (h) bubble(h.it, 'Captain Nathan. Has a ring to it.', 3.4); cluePanel(`You found ${tr.prize}.`); }
    else { ctx.toast(`Treasure ${n}/5: ${tr.prize}`); cluePanel(`You found ${tr.prize}. Tucked inside is the next clue.`); }
  }
  function danceBattle() {
    const b = opponent('ol') || opponent(); if (!b) return;
    const name = def(b.id).name;
    const seq = Array.from({ length: 8 }, () => rand(['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight']));
    const glyph = { ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', ArrowRight: '→' };
    let i = 0, hits = 0, timer = null;
    const npcScore = 4 + Math.floor(Math.random() * 4);
    release(b); b.forced = true; b.it.character.pose = 'dance2';
    const crowd = brains.filter((o) => o !== b && dist(o.it.character.group.position, P()) < 10);
    crowd.forEach((o) => { o.it.character.pose = 'cheer'; });
    ctx.minigame(`<h2>Dance battle vs ${name}</h2><p class="muted">Hit the arrow keys as they appear (tap them on mobile).</p><div class="dance-arrow" id="dance-arrow">Ready…</div><div class="dance-pad">${Object.entries(glyph).map(([k, g]) => `<button type="button" data-key="${k}">${g}</button>`).join('')}</div><p id="dance-score">Hits: 0</p>`, (root, close) => {
      const show = () => {
        if (i >= seq.length) {
          const win = hits > npcScore, tie = hits === npcScore;
          root.querySelector('#dance-arrow').textContent = win ? 'You win!' : tie ? 'Draw!' : `${name} wins!`;
          bubble(b.it, win ? 'Okay that was clean.' : tie ? 'Rematch!' : 'Still the champ.', 3);
          crowd.forEach((o) => o.it.character.play('wave'));
          setTimeout(() => { close(); b.forced = false; b.mode = 'idle'; release(b); crowd.forEach((o) => { if (o.mode === 'stay') o.it.character.pose = slotOf(o.group, o.act, o.slotI).pose; }); }, 1600);
          return;
        }
        root.querySelector('#dance-arrow').textContent = glyph[seq[i]];
        const want = seq[i];
        timer = setTimeout(() => { i++; show(); }, 900);
        root.onkey = (k) => { if (k === want) { hits++; ctx.sfx.rep(); } else ctx.sfx.miss(); root.querySelector('#dance-score').textContent = `Hits: ${hits}`; clearTimeout(timer); i++; show(); };
      };
      root.querySelectorAll('[data-key]').forEach((btn) => btn.addEventListener('click', () => root.onkey?.(btn.dataset.key)));
      setTimeout(show, 800);
      return () => clearTimeout(timer);
    });
  }
  function foodChallenge() {
    const b = opponent('ol') || opponent(); if (!b) return;
    const name = def(b.id).name, rate = 5 + Math.random() * 2.5;
    let bites = 0, left = 8, done = false;
    release(b); b.forced = true; b.it.character.pose = 'eat';
    ctx.minigame(`<h2>Eating contest vs ${name}</h2><p class="muted">Mash SPACE (or tap EAT) for 8 seconds.</p><p class="food-count"><span id="food-you">0</span> vs <span id="food-npc">0</span></p><button type="button" class="btn primary" id="food-eat">EAT!</button><p id="food-left">8.0 s</p>`, (root, close) => {
      const bite = () => { if (done) return; bites++; ctx.sfx.step(); root.querySelector('#food-you').textContent = bites; };
      root.querySelector('#food-eat').addEventListener('click', bite);
      root.onkey = (k) => { if (k === ' ' || k === 'e' || k === 'Enter') bite(); };
      const start = performance.now();
      const iv = setInterval(() => {
        left = 8 - (performance.now() - start) / 1000;
        root.querySelector('#food-npc').textContent = Math.floor((8 - Math.max(0, left)) * rate);
        root.querySelector('#food-left').textContent = `${Math.max(0, left).toFixed(1)} s`;
        if (left <= 0 && !done) {
          done = true; clearInterval(iv);
          const npc = Math.floor(8 * rate), win = bites > npc;
          root.querySelector('#food-left').textContent = win ? 'You win! Champion eater.' : `${name} wins. Impressive.`;
          bubble(b.it, win ? rand(['I let you win.', 'I need a nap.']) : rand(['Never challenge me at food.', 'Seconds, anyone?']), 3);
          setTimeout(() => { close(); b.forced = false; b.mode = 'idle'; release(b); }, 1600);
        }
      }, 100);
      return () => clearInterval(iv);
    });
  }
  function volley() {
    const b = opponent(); if (!b) return;
    const name = def(b.id).name;
    let rally = 0, best = 0;
    ctx.minigame(`<h2>Beach volleyball with ${name}</h2><p class="muted">Press SPACE (or tap HIT) when the ball is in your zone.</p><canvas id="volley" width="320" height="120" style="width:100%;image-rendering:pixelated;background:#ffe9b8"></canvas><p id="volley-msg">Rally: 0</p><button type="button" class="btn primary" id="volley-hit">HIT</button>`, (root, close) => {
      const cv = root.querySelector('#volley'), g = cv.getContext('2d');
      let x = 300, dir = -1, speed = 120, over = false, raf = 0, last = performance.now();
      const hit = () => {
        if (over) return;
        if (x < 70) { rally++; dir = 1; speed = Math.min(320, speed + 12); ctx.sfx.rep(); root.querySelector('#volley-msg').textContent = `Rally: ${rally}`; }
      };
      root.querySelector('#volley-hit').addEventListener('click', hit);
      root.onkey = (k) => { if (k === ' ' || k === 'e') hit(); };
      const loop = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        x += dir * speed * dt;
        if (x > 290 && dir > 0) { if (Math.random() < Math.max(0.55, 0.97 - rally * 0.03)) { dir = -1; speed += 6; } else { over = true; best = rally; root.querySelector('#volley-msg').textContent = `${name} missed! You win with a ${rally}-hit rally.`; } }
        if (x < 10) { over = true; best = rally; root.querySelector('#volley-msg').textContent = `Missed! Rally of ${rally}.`; }
        g.clearRect(0, 0, 320, 120);
        g.fillStyle = '#2a2440'; g.fillRect(158, 50, 4, 70);
        g.fillStyle = 'rgba(255,106,61,.25)'; g.fillRect(0, 0, 70, 120);
        const y = 90 - Math.sin(((x - 10) / 280) * Math.PI) * 70;
        g.fillStyle = '#ffffff'; g.fillRect(x - 5, y - 5, 10, 10); g.fillStyle = '#ff6a3d'; g.fillRect(x - 5, y - 1, 10, 2);
        g.fillStyle = '#c4402f'; g.fillRect(30, 96, 12, 22); g.fillStyle = '#2f6fc6'; g.fillRect(280, 96, 12, 22);
        if (!over) raf = requestAnimationFrame(loop); else setTimeout(() => { bubble(b.it, best > 5 ? 'Great rally!' : 'Again!', 2.6); close(); }, 1600);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    });
  }
  return api;
}
