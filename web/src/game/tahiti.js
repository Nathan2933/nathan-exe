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
// beach volleyball courts: centre, u = along the court (side A at -u), w = across
const COURT = {
  vg: { c: V(-17.95, -28.5), u: V(0.638, -0.77), w: V(-0.77, -0.638) },
  ol: { c: V(35.3, -10), u: V(0, 1), w: V(1, 0) },
};
const cpt = (g, a, b) => { const k = COURT[g]; return V(k.c.x + k.u.x * a + k.w.x * b, k.c.z + k.u.z * a + k.w.z * b); };
const cface = (g, side) => { const u = COURT[g].u, s = side ? -1 : 1; return (Math.atan2(u.x * s, u.z * s) * 180) / Math.PI; };
const HL = 5.4, HW = 3.3;                 // half length / half width of the (wider) court
const volleySlots = (g) => [[-3.4, -1.6, 0], [-3.4, 1.6, 0], [3.4, -1.6, 1], [3.4, 1.6, 1]].map(([a, b, s]) => { const p = cpt(g, a, b); return [+p.x.toFixed(2), +p.z.toFixed(2), 'look', cface(g, s), { vb: s }]; });
// Anu and Shabesh keep their distance from each other
const AVOID = { tahiti_cf1: 'tahiti_cf2', tahiti_cf2: 'tahiti_cf1' };
// slot: [x, z, pose, faceDeg, opts]
const ACTIVITIES = {
  vg: {
    // personal routines: only the owner uses these, and they come back to them between roams
    drafting: { w: 5, owner: 'tahiti_sf3', slots: [[-17.6, -14.1, 'type', 180]], lines: ["Something that won't collapse after one update.", 'Measure twice, build once.'] },
    stream: { w: 5, owner: 'tahiti_sf4', slots: [[-18.45, -7.4, 'sittype', -90]], lines: ['Chat, say hi to Nathan!', "We're live!", 'Thanks for the follow!'] },
    gaming: { w: 5, owner: 'tahiti_sf2', slots: [[-16.6, -8.65, 'sittype', 180]], lines: ['One more round.', 'Arok, did you see that?', 'Clutch!'] },
    coding: { w: 5, owner: 'tahiti_sf1', slots: [[-23.5, -5.85, 'sittype', 180]], lines: ['Just one more commit.', "It works. Don't touch it."] },
    memories: { w: 4, owner: 'tahiti_sf5', slots: [[-8.8, -2.4, 'film', 45]], lines: ['Hold still!', "That one's going on the board."] },
    photowalk: { w: 2, owner: 'tahiti_sf5', slots: [[-12.4, -23.6, 'film', 150], [-26.8, -20.8, 'film', 225], [-14.6, -2.2, 'film', 200]], lines: ['Golden hour. Perfect.', 'Got it.'] },
    rest: { w: 4, owner: 'harris', slots: [[-9.4, -12.6, 'sit', 0]], lines: ['Five minutes. Then I fly.', "Pilot's break."] },
    campfire: { w: 3, slots: [[-18.0, -3.6, 'sing', 90, { free: true }], [-14.8, -3.6, 'sing', -90, { free: true }], [-16.4, -5.1, 'sing', 0]], lines: ['♪ la la la ♪', '♪ one more verse ♪', 'Okay, okay, story time.', 'And then the bike just stopped. In the middle of the road.'] },
    courtyard: { w: 2, slots: [[-12.2, -1.8, 'dance1', 20], [-10.6, -2.4, 'dance2', 0], [-12.0, -3.8, 'dance3', -20]], lines: ['Woo!', 'Watch this move.', 'That was NOT a dance.'] },
    eat: { w: 2, slots: [[-16.6, -1.75, 'eat', 0, { free: true }], [-15.8, -1.75, 'eat', 0, { free: true }], [-13.8, -1.9, 'eat', -120]], lines: ['Mmm.', 'Who made this?', 'Pass the chips.'] },
    picnic: { w: 2, slots: [[-12.4, -20.8, 'eat', 135, { free: true }], [-10.6, -20.8, 'sit', -135, { free: true }], [-9.9, -22.8, 'sit', 135, { free: true }], [-8.1, -23.0, 'phone', -120, { free: true }]], lines: ['Best spot on the island.', 'Who brought the snacks?', 'Look at those flowers.'] },
    banyan: { w: 2, slots: [[-35.2, -2.8, 'look', 135], [-38.4, -1.6, 'phone', 90], [-35.2, -0.2, 'lean', 45]], lines: ['This tree is older than all of us.', 'Shade. Finally.', 'Story time under the tree.'] },
    volley: { w: 3, slots: volleySlots('vg'), lines: ['Mine!', 'Set it up!', 'Nice one!', 'Out! That was out!'] },
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
    hoop: { w: 2, slots: [[18.0, -24.4, 'cheer', 180], [16.4, -23.2, 'look', 150], [19.8, -23.0, 'cheer', 210]], lines: ['Swish!', 'Nothing but net.', 'Airball. Again.'] },
    firepit: { w: 2, slots: [[28.0, -16.2, 'sing', 0, { free: true }], [30.2, -14.0, 'sing', -90, { free: true }], [25.8, -14.0, 'sing', 90, { free: true }], [28.0, -12.2, 'sit', 180]], lines: ['Fire\'s perfect tonight.', '♪ one more song ♪', 'Who\'s got the marshmallows?'] },
    hammock: { w: 1, slots: [[27.0, 14.0, 'sit', 180, { free: true }], [31.0, 17.0, 'sit', 150, { free: true }]], lines: ['Do not disturb.', 'This is the life.'] },
    snack: { w: 1, slots: [[13.4, 17.8, 'eat', 180], [16.6, 17.8, 'eat', 180], [15.0, 17.4, 'phone', 180]], lines: ['Best snacks on the island.', 'One more round of fries.'] },
    volley: { w: 3, slots: volleySlots('ol'), lines: ['Mine!', 'Set it up!', 'Spike it!', 'Out! That was out!'] },
    selfie: { w: 1, slots: [[17.4, -1.6, 'phone', 135], [17.9, -2.5, 'cheer', 135], [16.9, -2.7, 'look', 135]], lines: ['Smile!', 'One more, someone blinked.'] },
  },
};
const TERMINAL = V(-15.6, 13.2);       // where Harris meets Nathan
const VG_MEET = V(-13.8, -1.4);        // courtyard
const POSE_DANCES = ['dance1', 'dance2', 'dance3'];
const GANG_NAME = { vg: 'Vanderlinde Gang', ol: 'The Outlaws' };

export function createTahiti(ctx) {
  const { state, player } = ctx;
  let partyMood = { vg: 'party', ol: 'party' }, partyView = null, partyNathan = null;
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
  // routine loop: own corner -> roam somewhere -> back to own corner
  function pickActivity(b) {
    const last = b.last, wasHome = !!(last && ACTIVITIES[b.group][last]?.owner === b.id);
    const acts = Object.entries(ACTIVITIES[b.group]).filter(([k, a]) => k !== b.act && k !== last && (!a.owner || a.owner === b.id) && !(wasHome && a.owner === b.id));
    const night = ctx.isNight?.();
    const rival = AVOID[b.id] && brains.find((o) => o.id === AVOID[b.id]);
    const options = acts.filter(([k]) => freeSlot(b.group, k, b) !== undefined && !(rival && rival.act === k) && !(k === 'hoop' && state.hoop));
    if (!options.length) return null;
    let total = 0; const w = options.map(([k, a]) => { const x = (a.owner ? (wasHome ? 0 : 8) : 1) * (a.w || 1) * (night && (k === 'deck' || k === 'campfire') ? 2 : 1) * (b.id === 'tahiti_cf1' && k === 'railing' ? 4 : 1); total += x; return x; });
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
  let flashM = null;
  function camFlash(gp, h) {
    if (!flashM) { flashM = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })); flashM.userData.dynamic = true; ctx.world.root.add(flashM); }
    flashM.position.set(gp.x + Math.sin(h) * 0.35, gp.y + 1.75, gp.z + Math.cos(h) * 0.35); flashM.visible = true;
    clearTimeout(flashM.t); flashM.t = setTimeout(() => { flashM.visible = false; }, 90);
  }

  function harrisTick(b, now) {
    // companion states: ARRIVING → WALKING_TO_VANDERLINDE → SOCIALIZING ⇄
    // RETURNING_TO_TERMINAL → WAITING_FOR_NATHAN → BOARDING → TRAVELLING
    const p = P(), hp = b.it.character.group.position;
    const atTerminal = dist(p, TERMINAL) < 9 || dist(p, ctx.jetPoint()) < 7;
    if (!atTerminal && dist(p, ctx.jetPoint()) > 12) b.leftTerminal = true;      // Nathan has gone exploring
    const nearTerminal = atTerminal && b.leftTerminal;
    if (b.hstate === 'ARRIVING') { b.hstate = 'WALKING_TO_VANDERLINDE'; bubble(b.it, "Nathan, the gang's waiting. I need a nap.", 3); release(b); if (!assign(b, 'rest')) goTo(b, VG_MEET.x, VG_MEET.z, () => { b.mode = 'idle'; }); return false; }
    if (b.hstate === 'WALKING_TO_VANDERLINDE' || b.hstate === 'SOCIALIZING' || b.hstate === 'RESTING') {
      if (b.mode === 'stay' || b.mode === 'party') b.hstate = b.act === 'rest' ? 'RESTING' : 'SOCIALIZING';
    }
    if ((b.hstate === 'SOCIALIZING' || b.hstate === 'WALKING_TO_VANDERLINDE' || b.hstate === 'RESTING') && nearTerminal) {
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
    if (it.frozen || b.riding || b.vball) return;                // cinematic, on a bike, or playing volleyball
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
      if (now > b.until && !party[b.group]) { b.last = b.act; release(b); const a = pickActivity(b); if (a) assign(b, a); }
    } else if (b.mode === 'idle' && !b.forced) {
      const a = pickActivity(b); if (a) assign(b, a);
    }
    // Shabeer (and anyone filming) snaps a photo now and then: a little white flash
    if (b.mode === 'stay' && ch.pose === 'film' && Math.random() < dt * 0.25) camFlash(gp, ch.heading);
    // parties: dancers now and then grab a snack or cheer, then dance again
    if (b.mode === 'party') {
      if (!b.snack && Math.random() < dt * 0.06) { b.snack = now + 2500 + Math.random() * 2000; b.dance = ch.pose; ch.pose = rand(['eat', 'cheer', 'eat']); }
      else if (b.snack && now > b.snack) { b.snack = 0; ch.pose = b.dance || 'dance1'; }
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
    { id: 'stairs', x: 21.6, z: 9.6, prize: 'a captain\'s ring', clue: 'Last one. The Outlaws climb their stairs every day. Look at the bottom of them.', hint: 'Bottom of the villa stairs.' },
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
      courts = { vg: newCourt('vg'), ol: newCourt('ol') }; ballMesh(); hoopMesh();
      const saved = state.save.tahitiTreasure || [];
      for (const it of ctx.world.interactables) if (it.kind === 'activity' && it.act === 'treasure_item' && saved.includes(it.treasureId)) it.found = true;
    },
    exit() { endMatch(true); endShootout(true); bb.mesh = null; hud?.remove(); hud = null; layer?.remove(); layer = null; bubbles = []; brains = []; party = { vg: 0, ol: 0 }; partyNathan = null; if (partyView) { ctx.setView(null); partyView = null; } passenger = null; buddy = null; photo = null; race = null; state.joined = null; },
    harrisState() { return harris()?.hstate; },
    inMatch: () => !!state.volley || !!state.hoop,
    _debug: () => ({ brains, ACTIVITIES, party, race, photo, passenger, courts, bb }),
    onArrive() { const h = harris(); if (h) { h.hstate = 'ARRIVING'; h.mode = 'idle'; h.leftTerminal = false; release(h); } },
    harrisNearJet() { const h = harris(); return !!h && dist(P(), ctx.jetPoint()) < 12 && (h.hstate === 'WAITING_FOR_NATHAN' || dist(h.it.character.group.position, P()) < 4); },
    callHarrisToJet() {
      const h = harris(); if (!h) return;
      bubble(h.it, dist(P(), ctx.jetPoint()) < 12 ? 'On my way!' : 'Meet me at the jet!', 3);
      h.leftTerminal = true; h.forced = false; release(h); h.hstate = 'RETURNING_TO_TERMINAL';
      goTo(h, TERMINAL.x + 1.2, TERMINAL.z + 0.8, () => { h.hstate = 'WAITING_FOR_NATHAN'; h.mode = 'wait'; bubble(h.it, 'Ready for the next destination?', 3.4); }, true);
    },
    musicOverride() { const p = P(); const g = ['vg', 'ol'].find((x) => party[x] > 0 && dist(p, BEACH[x].c) < 22); return g ? partyMood[g] : null; },

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
      partyNathanTick();
      for (const g of ['vg', 'ol']) courtTick(courts[g], dt, t, now);
      hoopTick(dt, t, now);
      for (const it of ctx.world.interactables) if (it.kind === 'activity' && it.act === 'treasure_item') {
        const vis = !it.found && !!hunt && huntTarget()?.id === it.treasureId && dist(P(), it) < 9;
        it.beacon.group.visible = vis; it.hit.visible = vis; it.disabled = !vis;
      }
      drawBubbles();
    },

    // context hints for the prompt (R / F / G)
    hints() {
      const h = [];
      if (state.volley) return ['Space Spike'];
      if (state.hoop) return state.hoop.turnNathan ? ['Space Shoot'] : [];
      if (state.mount || state.joined) return state.joined ? ['Move to leave'] : [];
      if (nearestNpc(2.4) && ctx.hasMoto()) h.push('R Invite for a ride');
      if (joinable()) h.push('F Join activity');
      const ps = nearPhotoSpot(); if (ps) h.push(`G ${GANG_NAME[ps.gang]} photo`);
      const tg = hunt && huntTarget(); if (tg) { const d = dist(P(), tg); h.push(`Treasure ${(state.save.tahitiTreasure || []).length + 1}/5: ${d < 6 ? 'HOT!' : d < 14 ? 'warm' : d < 28 ? 'cool' : 'cold'}`); }
      return h;
    },
    key(k) {
      if (state.cine || state.minigame || state.groupScene || ctx.dialogue.open) return false;
      if (k === ' ' && state.volley) return spikeTry();
      if (k === ' ' && state.hoop) return shootTry();
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
      if (k === 'volley') continue;                      // the court is joined with E (a proper match)
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
    // rear of the two-up seat, level with Nathan, so the passenger never covers him
    ch.group.position.set(g.position.x - Math.sin(h) * 0.92, g.position.y + 0.6, g.position.z - Math.cos(h) * 0.92);
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
    for (const [id, at] of [['tahiti_cf1', 0], ['tahiti_cf2', 3]]) { const i = crew.findIndex((b) => b.id === id); if (i >= 0 && crew.length > at) { const [x] = crew.splice(i, 1); crew.splice(at, 0, x); } }
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
    ctx.choose('Pick the party mood', [{ label: 'Retro Dance', value: 'retro' }, { label: 'Chill Beach', value: 'chill' }, { label: 'Party Beats', value: 'party' }], (mood) => runParty(g, mood || 'party'));
  }
  function runParty(g, mood) {
    if (party[g] > 0) return;
    party[g] = 50; partyMood[g] = mood; ctx.toast(`${GANG_NAME[g]} beach party! Everyone's on the way.`);
    partyLights[g]?.setOn?.(true);
    const crew = brains.filter((b) => b.group === g && !b.riding && !(state.volley && state.volley.players.some((p) => p.b === b)) && !(b.id === 'harris' && (b.hstate === 'WAITING_FOR_NATHAN' || b.hstate === 'RETURNING_TO_TERMINAL')) && !(photo && photo.spots.some((s) => s.b === b)));
    // Anu takes one end of the front row, Shabesh the other
    const order = [...crew].sort((a, b) => (a.id === 'tahiti_cf1' ? -1 : b.id === 'tahiti_cf1' ? 1 : 0));
    const sh = order.findIndex((b) => b.id === 'tahiti_cf2'); if (sh > 0 && order.length > 3) { const [x] = order.splice(sh, 1); order.splice(3, 0, x); }
    const face = (landFace(g) * Math.PI) / 180;
    order.forEach((b, i) => { release(b); b.vball = false; b.forced = true; b.snack = 0; const s = PARTY[g][i % PARTY[g].length]; goTo(b, s[0], s[1], () => { b.mode = 'party'; b.it.character.pose = POSE_DANCES[i % 3]; b.it.character.heading = face + (i % 3 - 1) * 0.4; }, true); });
    // Nathan's own spot: front and centre with his school gang, next to Anu with the Outlaws
    const ns = g === 'ol' ? on(g, -3, 0.8) : on(g, 0, 0.8);
    partyNathan = { g, x: ns[0], z: ns[1], face };
    if (dist(P(), BEACH[g].c) < 30) { const path = ctx.nav.findPath(P().x, P().z, ns[0], ns[1]); state.path = path.length ? path : [{ x: ns[0], z: ns[1] }]; }
    // group camera: frame the whole party (front row + back row) while Nathan is there
    if (dist(P(), BEACH[g].c) < 30) { const c = BEACH[g].c, n = BEACH[g].n; ctx.setView({ x: c.x - n.x * 0.6, z: c.z - n.z * 0.6, zoom: 0.78 }); partyView = g; }
  }
  // Nathan reaches his party spot -> he dances too; walking away hands the camera back
  function partyNathanTick() {
    if (!partyNathan) return;
    const pn = partyNathan;
    if (!party[pn.g]) { partyNathan = null; return; }
    if (!state.joined && !state.path.length && dist(P(), pn) < 0.6) state.joined = { x: pn.x, z: pn.z, pose: rand(POSE_DANCES), face: pn.face };
    if (partyView && dist(P(), BEACH[partyView].c) > 22) { ctx.setView(null); partyView = null; }
  }
  function endParty(g) {
    party[g] = 0; partyLights[g]?.setOn?.(false);
    brains.forEach((b) => { if (b.group === g && (b.mode === 'party' || (b.forced && !b.riding && !b.vball))) { b.forced = false; b.mode = 'idle'; b.snack = 0; release(b); } });
    if (partyView === g) { ctx.setView(null); partyView = null; }
    if (partyNathan?.g === g) { partyNathan = null; if (state.joined) { state.joined = null; player.pose = null; } }
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
      case 'volley': startMatch(it.gang); return true;
      case 'hoop': startShootout(); return true;
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
  // ---------- beach volleyball: real players, real ball ----------
  // Ambient: gang members on the court's activity slots rally on their own.
  // Match (E at the court): the whole gang splits into two teams, Nathan joins
  // team A. He moves with the normal controls; standing under the ball bumps
  // it, Space near the ball spikes (with a jump). First to 5 wins.
  const G = 9.8, WIN = 5;
  let courts = { vg: null, ol: null }, ball = null, shadow = null, ring = null, hud = null;
  function newCourt(g) { return { g, players: [], ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, phase: 'idle', cache: new Map(), wait: 1.2, serveSide: 0, recv: null, score: [0, 0], match: false, last: null }; }
  function ballMesh() {
    const root = ctx.world.root;
    ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), new THREE.MeshLambertMaterial({ color: 0xfff6e6 }));
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 4, 12), new THREE.MeshBasicMaterial({ color: 0xff6a3d })); ball.add(stripe);
    shadow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 20), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    for (const m of [ball, shadow, ring]) { m.visible = false; m.userData.dynamic = true; root.add(m); }
  }
  const posOf = (p) => (p.nathan ? P() : p.b.it.character.group.position);
  const local = (g, x, z) => { const k = COURT[g], dx = x - k.c.x, dz = z - k.c.z; return { a: dx * k.u.x + dz * k.u.z, b: dx * k.w.x + dz * k.w.z }; };
  const teamName = (c, s) => { const p = c.players.find((q) => q.side === s && !q.nathan); return s === 0 && c.match ? 'Team Nathan' : `Team ${p ? def(p.b.id).name : '?'}`; };

  function ambientPlayers(c, now) {
    const list = [];
    for (const b of brains) {
      if (b.group !== c.g) continue;
      const on = b.mode === 'stay' && b.act === 'volley' && now <= b.until;
      if (on) { const s = slotOf(b.group, 'volley', b.slotI); const p = c.cache.get(b) || { b, skill: 1 }; p.side = s.opts.vb; p.home = V(s.x, s.z); c.cache.set(b, p); list.push(p); }
      if (!c.match) b.vball = on;
    }
    return list;
  }
  function courtTick(c, dt, t, now) {
    if (!c) return;
    if (!c.match) c.players = ambientPlayers(c, now);
    const sides = [0, 1].map((s) => c.players.filter((p) => p.side === s));
    const live = sides[0].length && sides[1].length;
    const mine = state.volley === c;
    if (!live) { if (c.phase !== 'idle') { c.phase = 'idle'; if (!courts.vg?.match && !courts.ol?.match) hideBall(); } return; }
    if (c.phase === 'idle') { c.phase = 'serve'; c.wait = 1.4; c.server = rand(sides[c.serveSide]); }
    if (c.phase === 'gather') {
      const ready = c.players.filter((p) => p.nathan || p.b.vball).length;
      c.gatherT += dt;
      if (ready === c.players.length) { c.phase = 'serve'; c.wait = 1.6; c.server = c.players[0]; ctx.toast('Everyone\'s in. Serve!'); }
      else if (c.gatherT > 25) { for (const p of c.players) if (p.b && !p.b.vball) { const gp = p.b.it.character.group.position; gp.x = p.home.x; gp.z = p.home.z; p.b.mode = 'vb'; p.b.vball = true; } }
    }
    // only one ball in the world: the match court, else the nearest live court
    const showMe = mine || (!state.volley && dist(P(), COURT[c.g].c) < 30);
    const B = c.ball;
    if (c.phase === 'gather') { const sp = P(); B.x = sp.x; B.z = sp.z; B.y = 1.9; }
    else if (c.phase === 'serve') {
      if (!c.players.includes(c.server)) c.server = rand(sides[c.serveSide]);
      const sp = posOf(c.server); B.x = sp.x; B.z = sp.z; B.y = 2.0 + Math.sin(t * 6) * 0.1;
      c.wait -= dt;
      if (c.wait <= 0) { c.phase = 'fly'; hit(c, c.server, false); }
    } else if (c.phase === 'fly') {
      B.x += B.vx * dt; B.z += B.vz * dt; B.y += B.vy * dt; B.vy -= G * dt;
      if (B.vy < 0 && B.y <= 1.15 && !c.checked) {
        c.checked = true;
        const r = c.recv, rp = r && posOf(r);
        if (r && Math.hypot(rp.x - B.x, rp.z - B.z) < (r.nathan ? 1.15 : 0.95)) hit(c, r, false);
      }
      if (B.y <= 0.15) { // landed
        const side = local(c.g, B.x, B.z).a < 0 ? 0 : 1, out = Math.abs(local(c.g, B.x, B.z).a) > HL + 0.3 || Math.abs(local(c.g, B.x, B.z).b) > HW + 0.3;
        const scorer = out ? 1 - c.last : 1 - side;
        point(c, scorer);
      }
    } else if (c.phase === 'dead') {
      B.y = Math.max(0.15, B.y); c.wait -= dt;
      if (c.wait <= 0) { c.phase = 'serve'; c.wait = 1.0; c.server = rand(sides[c.serveSide]); }
    }
    // players: receiver runs to the landing spot, everyone else drifts home
    for (const p of c.players) {
      if (p.nathan || !p.b.vball) continue;                 // still walking over to the court
      const ch = p.b.it.character, gp = ch.group.position;
      let tx = p.home.x, tz = p.home.z, sp = 1.6;
      if (c.phase === 'fly' && c.recv === p && !c.checked) { tx = c.land.x + (p.off?.x || 0); tz = c.land.z + (p.off?.z || 0); sp = 3.8; }
      const dx = tx - gp.x, dz = tz - gp.z, d = Math.hypot(dx, dz);
      vel.set(0, 0, 0);
      if (d > 0.08) { const s = Math.min(sp * dt, d); gp.x += (dx / d) * s; gp.z += (dz / d) * s; vel.set(dx / d, 0, dz / d).multiplyScalar(sp); }
      // never run into Nathan or a teammate: keep a little personal space
      for (const o of c.players) { if (o === p) continue; const op = posOf(o), ox = gp.x - op.x, oz = gp.z - op.z, od = Math.hypot(ox, oz); if (od < 0.7 && od > 1e-4) { gp.x = op.x + (ox / od) * 0.7; gp.z = op.z + (oz / od) * 0.7; } }
      const look = c.phase === 'fly' || c.phase === 'serve' ? Math.atan2(B.x - gp.x, B.z - gp.z) : (cface(c.g, p.side) * Math.PI) / 180;
      ch.heading += Math.atan2(Math.sin(look - ch.heading), Math.cos(look - ch.heading)) * Math.min(1, dt * 8);
      ch.pose = null; gp.y = ctx.heightAt(gp.x, gp.z);
      ch.update(dt, vel, t);
      p.b.it.x = gp.x; p.b.it.z = gp.z;
      p.b.it.beacon.group.position.set(gp.x, gp.y + 0.04, gp.z); p.b.it.hit.position.set(gp.x, 1.3, gp.z);
    }
    if (showMe && ball) {
      ball.visible = shadow.visible = true;
      ball.position.set(B.x, B.y + ctx.heightAt(B.x, B.z), B.z); ball.rotation.x += dt * 6; ball.rotation.z += dt * 4;
      shadow.position.set(B.x, ctx.heightAt(B.x, B.z) + 0.03, B.z);
      ring.visible = mine && c.phase === 'fly' && c.recv?.nathan && !c.checked;
      if (ring.visible) { ring.position.set(c.land.x, ctx.heightAt(c.land.x, c.land.z) + 0.04, c.land.z); ring.scale.setScalar(0.9 + Math.sin(t * 10) * 0.1); }
    }
    if (mine) {
      drawHud(c);
      if (dist(P(), COURT[c.g].c) > 12) { ctx.toast('You left the court.'); endMatch(); }
    }
  }
  function hideBall() { if (ball) ball.visible = shadow.visible = ring.visible = false; }
  function hit(c, who, spike) {
    const B = c.ball, wp = posOf(who), side = who.side;
    (who.nathan ? player : who.b.it.character).play(spike ? 'spike' : 'bump');
    if (who.nathan && spike) player.jump?.();
    ctx.sfx.rep?.();
    B.x = wp.x; B.z = wp.z; B.y = spike ? 2.3 : 1.15;
    const other = 1 - side, sgn = other ? 1 : -1;
    const land = cpt(c.g, sgn * (1.0 + Math.random() * (HL - 1.6)), (Math.random() - 0.5) * 2 * (HW - 0.5));
    const T = spike ? 0.85 : 1.45 + Math.random() * 0.4;
    B.vx = (land.x - B.x) / T; B.vz = (land.z - B.z) / T; B.vy = (1.15 - B.y + 0.5 * G * T * T) / T;
    c.land = land; c.last = side; c.checked = false; c.phase = 'fly';
    // whoever on the other side is closest to where it's coming down goes for it
    let best = null, bd = Infinity;
    for (const p of c.players) if (p.side === other) { const pp = posOf(p), d = Math.hypot(pp.x - land.x, pp.z - land.z); if (d < bd) { bd = d; best = p; } }
    c.recv = best;
    if (best && !best.nathan) { const miss = Math.random() < (spike ? 0.5 : c.match ? 0.22 : 0.16), a = Math.random() * Math.PI * 2; best.off = miss ? V(Math.cos(a) * 1.7, Math.sin(a) * 1.7) : null; }   // sometimes they misread it
    if (!who.nathan && Math.random() < 0.15) bubble(who.b.it, rand(ACTIVITIES[c.g].volley.lines), 1.6);
  }
  function point(c, scorer) {
    c.phase = 'dead'; c.wait = 1.6; c.serveSide = scorer;
    if (c.match) {
      c.score[scorer]++;
      const won = c.score[scorer] >= WIN;
      const fans = c.players.filter((p) => p.side === scorer && !p.nathan);
      if (fans[0]) bubble(fans[0].b.it, won ? 'GAME!' : rand(['Point!', 'Yes!', 'Too easy!']), 1.8);
      fans.forEach((p) => p.b.it.character.play('wave'));
      if (scorer === 0) player.play('flex');
      if (won) {
        ctx.toast(scorer === 0 ? `Your team wins ${c.score[0]}–${c.score[1]}!` : `${teamName(c, 1)} wins ${c.score[1]}–${c.score[0]}.`);
        setTimeout(() => endMatch(), 1800); c.phase = 'over';
      }
    }
  }
  function startMatch(g) {
    if (state.volley) return;
    const c = courts[g]; if (!c) return;
    let crew = brains.filter((b) => b.group === g && b.id !== 'harris' && !b.riding).sort((a, b) => dist(a.it.character.group.position, COURT[g].c) - dist(b.it.character.group.position, COURT[g].c)).slice(0, 3);   // 2 v 2: Nathan + 1 against 2
    if (crew.length < 2) return;
    // Anu and Shabesh always end up on opposite teams
    const teamA = [], teamB = [];
    for (const b of crew) {
      if (b.id === 'tahiti_cf1') teamA.push(b); else if (b.id === 'tahiti_cf2') teamB.push(b);
    }
    for (const b of crew) if (!teamA.includes(b) && !teamB.includes(b)) (teamA.length < 1 && teamA.length + 1 <= teamB.length ? teamA : teamB.length < 2 ? teamB : teamA).push(b);
    while (teamA.length > 1) teamA.pop(); while (teamB.length > 2) teamB.pop();
    const homes = (n, s) => { const sg = s ? 1 : -1, rows = [[3.4, -1.9], [3.4, 1.9], [1.8, 0], [4.6, 0]]; return Array.from({ length: n }, (_, i) => cpt(g, sg * rows[i % 4][0], rows[i % 4][1])); };
    const hA = homes(teamA.length + 1, 0), hB = homes(teamB.length, 1);
    c.players = [{ nathan: true, side: 0, home: hA[0] }, ...teamA.map((b, i) => ({ b, side: 0, home: hA[i + 1] })), ...teamB.map((b, i) => ({ b, side: 1, home: hB[i] }))];
    // everyone walks over first (nav paths); the first serve waits until all are in position
    for (const p of c.players) if (p.b) { release(p.b); p.b.forced = true; p.b.vball = false; p.skill = 1; const b = p.b; goTo(b, p.home.x, p.home.z, () => { b.mode = 'vb'; b.vball = true; bubble(b.it, rand(['I\'m in!', 'Let\'s go!', 'Ready!']), 1.6); }, true); }
    state.joined = null; state.path = [];
    const h = hA[0]; P().set(h.x, ctx.heightAt(h.x, h.z), h.z); player.heading = (cface(g, 0) * Math.PI) / 180;
    c.match = true; c.score = [0, 0]; c.phase = 'gather'; c.gatherT = 0; c.serveSide = 0; c.server = c.players[0];
    state.volley = c;
    ctx.toast(`Beach volleyball! Waiting for both teams to take the court. First to ${WIN}.`);
  }
  function endMatch(silent) {
    const c = state.volley; if (!c) return;
    for (const p of c.players) if (p.b) { p.b.forced = false; p.b.vball = false; p.b.mode = 'idle'; release(p.b); }
    c.match = false; c.players = []; c.phase = 'idle'; state.volley = null;
    hideBall(); hud?.classList.add('hidden');
    if (!silent) player.pose = null;
  }
  function spikeTry() {
    const c = state.volley; if (!c || c.phase !== 'fly') return true;
    const me = c.players.find((p) => p.nathan), B = c.ball, p = P();
    if (c.last !== me.side && local(c.g, B.x, B.z).a < 0.3 && Math.hypot(B.x - p.x, B.z - p.z) < 1.6 && B.y < 3.0 && B.y > 0.6) { c.checked = true; hit(c, me, true); }
    else player.jump?.();
    return true;
  }
  function drawHud(c) {
    if (!hud) { hud = document.createElement('div'); hud.className = 'volley-hud'; document.body.append(hud); }
    hud.classList.remove('hidden');
    const waiting = c.phase === 'gather' ? `Waiting for players ${c.players.filter((p) => p.nathan || p.b.vball).length}/${c.players.length}` : 'Get under the ball · Space to spike · walk away to quit';
    const txt = `<b>${esc(teamName(c, 0))}</b><span>${c.score[0]} : ${c.score[1]}</span><b>${esc(teamName(c, 1))}</b><small>${waiting}</small>`;
    if (hud.dataset.t !== txt) { hud.innerHTML = txt; hud.dataset.t = txt; }
  }
  // ---------- basketball: one shooter at a time ----------
  // Ambient: Outlaws on the half court take turns shooting while the rest watch.
  // Shootout (E at the court): Nathan and up to three Outlaws, three rounds,
  // one shooter at a time. Nathan stands on the ring and presses Space when
  // the meter is in the green.
  const RIM = V(18, -26.94), RIM_Y = 2.45;
  const SPOTS = [-50, -25, 0, 25, 50].map((d) => { const a = (d * Math.PI) / 180; return V(RIM.x + Math.sin(a) * 3.8, RIM.z + Math.cos(a) * 3.8); });
  const SIDELINE = [V(14.8, -22.4), V(21.2, -22.4), V(14.8, -24.2)];
  const bb = { mesh: null, ring: null, q: [], cur: null, hold: null, x: RIM.x, y: 0.15, z: RIM.z - 1, busy: false, wait: 1, idx: 0 };
  function hoopMesh() {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), new THREE.MeshLambertMaterial({ color: 0xe0702a }));
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 4, 12), new THREE.MeshBasicMaterial({ color: 0x2a1a12 })); m.add(seam);
    const r = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 20), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85, depthWrite: false }));
    r.rotation.x = -Math.PI / 2;
    for (const o of [m, r]) { o.visible = false; o.userData.dynamic = true; ctx.world.root.add(o); }
    bb.mesh = m; bb.ring = r; bb.q = []; bb.cur = null; bb.hold = null; bb.busy = false;
  }
  const whoPos = (w) => (w.nathan ? P() : w.b ? w.b.it.character.group.position : w.it.character.group.position);
  const whoChar = (w) => (w.nathan ? player : w.b ? w.b.it.character : w.it.character);
  function hands(w) { const p = whoPos(w), h = whoChar(w).heading; return { x: p.x + Math.sin(h) * 0.3, y: p.y + 1.9, z: p.z + Math.cos(h) * 0.3 }; }
  function arc(p0, p1, T, h, on) { bb.q.push({ p0: { ...p0 }, p1: { ...p1 }, T, h, on, t: 0 }); }
  function faceRim(w) { const p = whoPos(w); whoChar(w).heading = Math.atan2(RIM.x - p.x, RIM.z - p.z); }
  function shoot(w, make, done) {
    faceRim(w); whoChar(w).play('spike'); if (w.nathan) player.jump?.();
    const h = hands(w); bb.hold = null;
    const top = { x: RIM.x, y: RIM_Y + 0.12, z: RIM.z };
    if (make) {
      arc(h, top, 1.0, 1.7);
      arc(top, { x: RIM.x, y: 0.2, z: RIM.z }, 0.42, 0, () => { ctx.sfx.rep?.(); done(true); });
    } else {
      const a = Math.random() * Math.PI * 2, off = { x: RIM.x + Math.cos(a) * 0.32, y: RIM_Y + 0.08, z: RIM.z + Math.abs(Math.sin(a)) * 0.32 };
      const out = { x: off.x + (off.x - RIM.x) * 5, y: 0.2, z: off.z + 1.6 };
      arc(h, off, 1.0, 1.7);
      arc(off, out, 0.65, 0.9, () => { ctx.sfx.miss?.(); });
      arc(out, { x: out.x + (out.x - RIM.x) * 0.2, y: 0.2, z: out.z + 0.6 }, 0.35, 0.3, () => done(false));
    }
  }
  function passTo(w, then) { const p = { x: bb.x, y: bb.y, z: bb.z }; bb.hold = null; arc(p, hands(w), 0.6, 0.8, () => { bb.hold = w; then?.(); }); }
  function hoopTick(dt, t, now) {
    if (!bb.mesh) return;
    // ball motion
    if (!bb.cur && bb.q.length) bb.cur = bb.q.shift();
    const a = bb.cur;
    if (a) {
      a.t += dt; const u = Math.min(1, a.t / a.T);
      bb.x = a.p0.x + (a.p1.x - a.p0.x) * u; bb.z = a.p0.z + (a.p1.z - a.p0.z) * u;
      bb.y = a.p0.y + (a.p1.y - a.p0.y) * u + a.h * 4 * u * (1 - u);
      if (u >= 1) { bb.cur = null; a.on?.(); }
    } else if (bb.hold) { const h = hands(bb.hold); bb.x = h.x; bb.y = h.y + (bb.hold.nathan && !state.hoop?.shooting ? Math.abs(Math.sin(t * 7)) * -0.9 : 0); bb.z = h.z; }
    if (state.hoop) shootoutTick(dt, t);
    else {
      // ambient: whoever is on the court shoots in turn
      const crew = brains.filter((b) => b.group === 'ol' && b.mode === 'stay' && b.act === 'hoop');
      if (!crew.length) { if (!bb.cur && !bb.q.length) bb.hold = null; }
      else if (!bb.busy) {
        bb.idx %= crew.length; const s = crew[bb.idx];
        if (bb.hold !== s && !bb.cur && !bb.q.length) passTo(s);
        else if (bb.hold === s) {
          bb.wait -= dt;
          crew.forEach((o) => { if (o !== s) o.it.character.pose = 'look'; }); s.it.character.pose = null;
          if (bb.wait <= 0) {
            bb.busy = true;
            shoot(s, Math.random() < 0.55, (made) => {
              if (made) { crew.forEach((o) => { if (o !== s) o.it.character.play('wave'); }); if (Math.random() < 0.5) bubble(s.it, rand(ACTIVITIES.ol.hoop.lines.slice(0, 2)), 1.6); }
              else if (Math.random() < 0.4) bubble(s.it, 'Airball. Again.', 1.6);
              bb.idx++; bb.busy = false; bb.wait = 1.4;
            });
          }
        }
      }
    }
    const show = dist(P(), RIM) < 26 && (bb.hold || bb.cur || bb.q.length || state.hoop);
    bb.mesh.visible = !!show;
    bb.mesh.position.set(bb.x, bb.y + 0.02, bb.z); bb.mesh.rotation.x += dt * 5;
  }

  function startShootout() {
    if (state.hoop || state.volley) return;
    const crew = brains.filter((b) => b.group === 'ol' && !b.riding && !b.vball && dist(b.it.character.group.position, RIM) < 30).sort((a, b) => dist(a.it.character.group.position, RIM) - dist(b.it.character.group.position, RIM)).slice(0, 3);
    const players = [{ nathan: true, name: 'Nathan', score: 0 }, ...crew.map((b, i) => ({ b, name: def(b.id).name, score: 0, side: SIDELINE[i] }))];
    for (const p of players) if (p.b) { const b = p.b; release(b); b.forced = true; goTo(b, p.side.x, p.side.z, () => { b.mode = 'bb'; p.ready = true; faceRimB(b); }, true); }
    bb.q = []; bb.cur = null; bb.busy = false; bb.hold = null;
    state.joined = null; state.path = [];
    state.hoop = { players, turn: 0, round: 0, phase: 'gather', t: 0, meter: 0, shooting: false };
    ctx.toast('Shootout! One shooter at a time, three rounds. Waiting for everyone...');
  }
  function faceRimB(b) { const p = b.it.character.group.position; b.it.character.heading = Math.atan2(RIM.x - p.x, RIM.z - p.z); b.it.character.pose = 'look'; }
  function shootoutTick(dt, t) {
    const s = state.hoop; s.t += dt;
    const who = s.players[s.turn], spot = SPOTS[(s.round * 2 + s.turn) % SPOTS.length];
    s.turnNathan = who.nathan && s.phase === 'aim';
    bb.ring.visible = who.nathan && (s.phase === 'aim' || s.phase === 'walk');
    if (bb.ring.visible) { bb.ring.position.set(spot.x, ctx.heightAt(spot.x, spot.z) + 0.04, spot.z); bb.ring.scale.setScalar(1 + Math.sin(t * 8) * 0.08); }
    if (s.phase === 'gather') {
      if (s.players.every((p) => p.nathan || p.ready) || s.t > 6) { s.players.forEach((p) => { if (p.b && !p.ready) { const gp = p.b.it.character.group.position; gp.x = p.side.x; gp.z = p.side.z; p.b.path = []; p.b.mode = 'bb'; faceRimB(p.b); } p.ready = true; }); s.phase = 'next'; ctx.toast('Everyone\'s here. Nathan shoots first!'); }
    } else if (s.phase === 'next') {
      s.phase = 'walk'; s.t = 0;
      if (!who.nathan) { const b = who.b; goTo(b, spot.x, spot.z, () => { b.mode = 'bb'; s.phase = 'npcAim'; s.t = 0; faceRimB(b); b.it.character.pose = null; }, false); }
      else state.path = [{ x: spot.x, z: spot.z }];
      passTo(who);
    } else if (s.phase === 'walk' && who.nathan) {
      if (dist(P(), spot) < 0.7 || (bb.hold === who && s.t > 2.5)) { s.phase = 'aim'; s.t = 0; faceRim(who); }
    } else if (s.phase === 'aim') {
      s.meter = (Math.sin(s.t * 3.4 - Math.PI / 2) + 1) / 2;
    } else if (s.phase === 'npcAim' && s.t > 1.0 && bb.hold === who) {
      s.phase = 'flight'; s.shooting = true;
      shoot(who, Math.random() < 0.5, (made) => afterShot(made));
    }
    if (dist(P(), RIM) > 13) { ctx.toast('You left the court.'); endShootout(); return; }
    drawHoopHud(s);
  }
  function shootTry() {
    const s = state.hoop; if (!s) return true;
    const who = s.players[s.turn];
    if (!who.nathan || s.phase !== 'aim' || bb.hold !== who) return true;
    const m = s.meter, make = m > 0.4 && m < 0.6 ? true : m > 0.32 && m < 0.68 ? Math.random() < 0.4 : false;
    s.phase = 'flight'; s.shooting = true;
    shoot(who, make, (made) => afterShot(made));
    return true;
  }
  function afterShot(made) {
    const s = state.hoop; if (!s) return;
    const who = s.players[s.turn]; s.shooting = false;
    if (made) { who.score++; s.players.forEach((p) => { if (p !== who && p.b) p.b.it.character.play('wave'); }); }
    if (who.b) bubble(who.b.it, made ? rand(['Swish!', 'Nothing but net.', 'Too easy.']) : rand(['Rim! So close.', 'That doesn\'t count.', 'Ugh.']), 1.8);
    else ctx.toast(made ? 'Swish!' : 'Off the rim.');
    if (who.b) { const b = who.b; goTo(b, who.side.x, who.side.z, () => { b.mode = 'bb'; faceRimB(b); }, false); }
    s.turn++;
    if (s.turn >= s.players.length) { s.turn = 0; s.round++; }
    if (s.round >= 3) {
      const best = Math.max(...s.players.map((p) => p.score)), winners = s.players.filter((p) => p.score === best);
      ctx.toast(winners.length > 1 ? `Tie at ${best}! ${winners.map((w) => w.name).join(' & ')}` : `${winners[0].name} wins the shootout with ${best}!`);
      if (winners.some((w) => w.nathan)) player.play('flex');
      setTimeout(() => endShootout(), 1500); s.phase = 'over'; return;
    }
    s.phase = 'next';
  }
  function endShootout(silent) {
    const s = state.hoop; if (!s) return;
    for (const p of s.players) if (p.b) { p.b.forced = false; p.b.mode = 'idle'; release(p.b); }
    state.hoop = null; bb.q = []; bb.cur = null; bb.hold = null; bb.busy = false;
    if (bb.ring) bb.ring.visible = false; hud?.classList.add('hidden');
    if (!silent) player.pose = null;
  }
  function drawHoopHud(s) {
    if (!hud) { hud = document.createElement('div'); hud.className = 'volley-hud'; document.body.append(hud); }
    hud.classList.remove('hidden');
    const who = s.players[s.turn];
    const msg = s.phase === 'gather' ? `Waiting for players ${s.players.filter((p) => p.nathan || p.ready).length}/${s.players.length}`
      : s.phase === 'over' ? 'Final score'
      : who.nathan ? (s.phase === 'aim' ? 'Space when the marker is in the green' : 'Walk onto the glowing ring') : `${who.name} is shooting...`;
    const meter = who.nathan && s.phase === 'aim' ? `<div class="hoop-meter"><i></i><b style="left:${(s.meter * 100).toFixed(1)}%"></b></div>` : '';
    const html = `<div class="hoop-board">${s.players.map((p, i) => `<span class="${i === s.turn && s.phase !== 'over' ? 'on' : ''}">${esc(p.name)} ${p.score}</span>`).join('')}</div><small>Round ${Math.min(3, s.round + 1)}/3 · ${msg}</small>${meter}`;
    if (hud.dataset.t !== html) { hud.innerHTML = html; hud.dataset.t = html; }
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  return api;
}
