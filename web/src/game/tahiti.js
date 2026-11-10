import * as THREE from 'three';
import { separateNpcs } from './world.js';

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
    coding: { w: 5, owner: 'tahiti_sf1', slots: [[-2.5, -9.72, 'sittype', 180]], lines: ['Just one more commit.', "It works. Don't touch it."] },
    memories: { w: 4, owner: 'tahiti_sf5', slots: [[-22.2, -5.4, 'film', -90]], lines: ['Hold still!', "That one's going on the board."] },
    photowalk: { w: 2, owner: 'tahiti_sf5', roam: true, slots: [[-12.4, -23.6, 'film', 150], [...on('vg', 2.8, 1.2), 'film', seaFace('vg')], [-14.6, -2.2, 'film', 200]], lines: ['Golden hour. Perfect.', 'Got it.'] },
    rest: { w: 4, owner: 'harris', slots: [[-9.25, -14.05, 'sleep', 0, { bed: { y: 0.83, approach: [-11.1, -14.05] } }]], lines: ['Five minutes. Then I fly.', "Pilot's break.", 'Zzz...'] },
    campfire: { w: 3, slots: [[-18.0, -3.6, 'sing', 90, { free: true }], [-14.8, -3.6, 'sing', -90, { free: true }], [-16.4, -5.1, 'sing', 0]], lines: ['♪ la la la ♪', '♪ one more verse ♪', 'Okay, okay, story time.', 'And then the bike just stopped. In the middle of the road.'] },
    courtyard: { w: 2, slots: [[-12.2, -1.8, 'dance1', 20], [-10.6, -2.4, 'dance2', 0], [-12.0, -3.8, 'dance3', -20]], lines: ['Woo!', 'Watch this move.', 'That was NOT a dance.'] },
    eat: { w: 2, slots: [[-16.6, -1.75, 'eat', 0, { free: true }], [-15.8, -1.75, 'eat', 0, { free: true }], [-13.8, -1.9, 'eat', -120]], lines: ['Mmm.', 'Who made this?', 'Pass the chips.'] },
    picnic: { w: 2, slots: [[-12.4, -20.8, 'eat', 135, { free: true }], [-10.6, -20.8, 'sit', -135, { free: true }], [-9.9, -22.8, 'sit', 135, { free: true }], [-8.1, -23.0, 'phone', -120, { free: true }]], lines: ['Best spot on the island.', 'Who brought the snacks?', 'Look at those flowers.'] },
    volley: { w: 3, slots: volleySlots('vg'), lines: ['Mine!', 'Set it up!', 'Nice one!', 'Out! That was out!'] },
    beach: { w: 2, slots: [[...on('vg', -2, 1.5), 'look', seaFace('vg')], [...on('vg', -1.2, BEACH.vg.sea), 'swim', seaFace('vg'), { free: true, water: true }], [...on('vg', 1.6, BEACH.vg.sea), 'swim', seaFace('vg') - 20, { free: true, water: true }], [...on('vg', 2.4, 1.5), 'cheer', seaFace('vg')]], lines: ["We're heading to the beach. You coming?", 'Water\'s warm!', 'Race you to the rocks!'] },
  },
  ol: {
    deck: { w: 3, slots: [[19.0, 0.6, 'dance1', 90], [20.6, 1.6, 'dance2', 90], [18.4, 2.6, 'dance3', 60]], lines: ['Turn it up!', 'That\'s my song!'] },
    dj: { w: 1, slots: [[21.5, -6.5, 'dj', 180]], lines: ['Next track!', 'Requests? No requests.'] },
    table: { w: 2, slots: [[18.7, -4.5, 'sit', 90, { free: true }], [20.5, -4.5, 'sit', -90, { free: true }], [19.6, -5.4, 'sit', 0, { free: true }], [19.6, -3.6, 'sit', 180, { free: true }]], lines: ['Your move.', 'That\'s cheating.', 'Best of three?'] },
    railing: { w: 2, slots: [[23.3, -2.0, 'gaze', 90], [22.8, -5.6, 'look', 90]], lines: ['Look at that sunset.', 'Could stay here forever.'] },
    lounge: { w: 1, slots: [[22.6, 0.2, 'sit', -90, { free: true }], [22.6, 2.2, 'sit', -90, { free: true }]], lines: ['Wake me up for food.'] },
    bbq: { w: 2, slots: [[13.6, 8.6, 'cook', 180], [12.0, 10.4, 'eat', 90], [15.2, 10.4, 'eat', -90]], lines: ['Who wants seconds?', 'Don\'t touch the grill.', 'This is the best part.'] },
    beach: { w: 2, slots: [[...on('ol', -2, 1.5), 'look', seaFace('ol')], [...on('ol', -1.2, BEACH.ol.sea), 'swim', seaFace('ol'), { free: true, water: true }], [...on('ol', 1.6, BEACH.ol.sea), 'swim', seaFace('ol') + 20, { free: true, water: true }], [...on('ol', 2.4, 1.5), 'cheer', seaFace('ol')], [...on('ol', 0.4, 0.2), 'sit', seaFace('ol'), { free: true }]], lines: ['Last one in buys dinner!', 'This beach is ours.', 'Sun, sand, zero emails.'] },
    // personal stations: Anu's court, the photo corner, the food contest, Akshay's TV, the volleyball three
    hoop: { w: 2, owner: 'tahiti_cf1', slots: [[18.0, -24.4, 'cheer', 180]], lines: ['Swish!', 'Nothing but net.', 'Airball. Again.'] },
    photo_sa: { w: 5, owner: 'tahiti_cf7', slots: [[12.3, -12.25, 'film', 200]], poses: ['film', 'look', 'phone', 'film', 'look'], lines: ['Let me fix the white balance.', 'Shutter at 1/250. Nice.', 'Shabesh, look at this frame.'] },
    photo_sh: { w: 5, owner: 'tahiti_cf2', slots: [[14.3, -12.3, 'film', 160]], poses: ['look', 'film', 'phone', 'cheer', 'film'], lines: ['Okay that one is wallpaper material.', 'Sathesh, check the light over there.', 'Hold on, reviewing the shots.'] },
    photowalk_ol: { w: 3, owners: ['tahiti_cf2', 'tahiti_cf7'], roam: true, slots: [[...on('ol', -4, 1.0), 'film', seaFace('ol')], [26.6, -17.8, 'film', 200], [8.6, -12.2, 'film', 250], [32.6, -15.0, 'film', 90]], lines: ['Golden hour!', 'One for the album.', 'Look at that sky.'] },
    feast: { w: 5, owner: 'tahiti_cf4', slots: [[18.6, -12.35, 'eat', 180]], poses: ['eat', 'eat', 'sit', 'eat', 'cheer'], lines: ['Round two of snacks.', 'This is training. For the contest.', 'Who wants to challenge me?', 'Mmm. Undefeated.'] },
    tvgame: { w: 5, owner: 'tahiti_cf5', slots: [[7.8, 4.15, 'sittype', 180]], poses: ['sittype', 'sittype', 'cheer', 'sittype'], lines: ['Boss level!', 'Nathan, grab the other controller.', 'NO. One more try.', 'High score!'] },
    firepit: { w: 2, slots: [[28.0, -16.2, 'sing', 0, { free: true }], [30.2, -14.0, 'sing', -90, { free: true }], [25.8, -14.0, 'sing', 90, { free: true }], [28.0, -12.2, 'sit', 180]], lines: ['Fire\'s perfect tonight.', '♪ one more song ♪', 'Who\'s got the marshmallows?'] },
    volley: { w: 3, owners: ['tahiti_cf3', 'tahiti_cf6', 'tahiti_cf8'], slots: volleySlots('ol'), lines: ['Mine!', 'Set it up!', 'Spike it!', 'Out! That was out!'] },
    selfie: { w: 1, slots: [[17.4, -1.6, 'phone', 135], [17.9, -2.5, 'cheer', 135], [16.9, -2.7, 'look', 135]], lines: ['Smile!', 'One more, someone blinked.'] },
  },
};
const TERMINAL = V(-15.6, 13.2);       // where Harris meets Nathan
const VG_MEET = V(-13.8, -1.4);        // courtyard
const POSE_DANCES = ['dance1', 'dance2', 'dance3'];
const GANG_NAME = { vg: 'Vanderlinde Gang', ol: 'The Outlaws' };
// ---- independent schedules ----
// Every NPC has its own time at home (seconds) and its own chance to head out
// when that time is up. Departures per gang go through a gate: one at a time,
// a gap between departures, and a cap on how many are out at once.
const PROFILE = {
  harris: { home: [50, 100], roam: 0.4 },
  tahiti_sf1: { home: [70, 130], roam: 0.45 },   // Guru
  tahiti_sf2: { home: [80, 140], roam: 0.35 },   // Prince
  tahiti_sf3: { home: [65, 120], roam: 0.45 },   // Jeswin
  tahiti_sf4: { home: [90, 160], roam: 0.3 },    // Arok
  tahiti_sf5: { home: [45, 90], roam: 0.7 },     // Shabeer
  tahiti_cf1: { home: [50, 95], roam: 0.55 },    // Anu
  tahiti_cf2: { home: [45, 85], roam: 0.6 },     // Shabesh
  tahiti_cf3: { home: [55, 100], roam: 0.5 },    // Logesh
  tahiti_cf4: { home: [55, 105], roam: 0.5 },    // Thianish
  tahiti_cf5: { home: [75, 135], roam: 0.35 },   // Akshay
  tahiti_cf6: { home: [55, 100], roam: 0.5 },    // Pranav
  tahiti_cf7: { home: [50, 95], roam: 0.55 },    // Sathesh
  tahiti_cf8: { home: [55, 100], roam: 0.5 },    // Naveen (third volleyball player)
};
const STAGGER = { vg: 24000, ol: 15000 };        // min ms between two optional departures
const ROAM_CAP = { vg: 2, ol: 3 };               // most members out roaming at once
const HIDEOUT = { x0: -20.5, x1: -5.5, z0: -16.5, z1: -4.6 };
const owns = (a, id) => a.owner === id || !!a.owners?.includes(id);
const isHome = (g, k, id) => { const a = ACTIVITIES[g][k]; return !!a && owns(a, id) && !a.roam; };

const _festCol = new THREE.Color();
const _festM4 = new THREE.Matrix4();
const _zeroV = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const _sepList = [];
const _qBuf = [];

function disposeObj(obj) {
  if (!obj) return;
  obj.traverse((o) => {
    o.geometry?.dispose?.();
    if (Array.isArray(o.material)) o.material.forEach((m) => m?.dispose?.());
    else o.material?.dispose?.();
  });
}

export function createTahiti(ctx) {
  const { state, player } = ctx;
  let partyMood = { vg: 'party', ol: 'party' }, partyView = null, partyNathan = null;
  let brains = [], bubbles = [], layer = null, party = { vg: 0, ol: 0 }, partyLights = {}, passenger = null, buddy = null;
  let photo = null, session = null, lastPhotoInfo = null, race = null, hunt = null, lastHint = 0;
  let lastDepart = { vg: 0, ol: 0 }, inHideout = false, hideoutSince = 0;
  let epoch = 0, buddyTimer = 0, treasureItems = [], photoSpotList = [];
  const harris = () => brains.find((b) => b.id === 'harris');
  const P = () => player.group.position;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const def = (id) => (state.content.npcs || []).find((n) => n.id === id) || {};

  // ---------- speech bubbles ----------
  function bubble(npcOrPlayer, text, secs = 3) {
    if (!layer) return;
    const posOf = (w) => (w?.character ? w.character.group : w?.group)?.position;
    const gp0 = posOf(npcOrPlayer);
    if (gp0 && bubbles.some((o) => { const q = posOf(o.who); return q && Math.hypot(q.x - gp0.x, q.z - gp0.z) < 2.4; })) return;   // one card per spot: no overlapping bubbles
    const el = document.createElement('div');
    el.className = 'tahiti-bubble'; el.textContent = text;
    layer.append(el);
    bubbles.push({ el, who: npcOrPlayer, until: performance.now() + secs * 1000, disp: null, tf: '' });
  }
  const pv = new THREE.Vector3();
  function drawBubbles() {
    if (!bubbles.length) return;
    const now = performance.now(), w = innerWidth, h = innerHeight;
    bubbles = bubbles.filter((b) => {
      if (now > b.until) { b.el.remove(); return false; }
      const g = b.who.character ? b.who.character.group : b.who.group;
      const yOff = b.who.character?.pose === 'sleep' ? 1.25 : 2.75;
      pv.set(g.position.x, g.position.y + yOff, g.position.z).project(ctx.camera);
      const x = (pv.x * 0.5 + 0.5) * w, y = (-pv.y * 0.5 + 0.5) * h;
      const disp = pv.z > 1 || x < -80 || x > w + 80 ? 'none' : '';
      if (b.disp !== disp) { b.el.style.display = disp; b.disp = disp; }
      if (!disp) {
        const tf = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
        if (b.tf !== tf) { b.el.style.transform = tf; b.tf = tf; }
      }
      return true;
    });
  }

  // ---------- festive night: Christmas-style bulbs on a beach night ----------
  // Every palm is wrapped in coloured bulbs and nearby palms are strung together.
  // One instanced mesh (cheap on phones); shown at night, twinkling.
  let festive = null, festiveStep = -1;
  const FEST_COLORS = [0xff3b4a, 0x3dff7a, 0xffd23f, 0x3fa9ff, 0xff6ad5, 0x5ff6ff];
  function buildFestive() {
    const palms = (ctx.world.map?.objects || []).filter((o) => o.type === 'tree_palm').map((o) => ({ x: o.x, z: o.z, s: o.props?.scale || 1 }));
    if (!palms.length) return;
    const pts = [];
    for (const p of palms) for (let i = 0; i < 12; i++) { const a = i * 1.9, h = 0.35 + i * 0.21 * p.s; pts.push([p.x + Math.cos(a) * 0.2 * p.s, h, p.z + Math.sin(a) * 0.2 * p.s]); }
    const seen = new Set();
    for (const p of palms) {
      let best = null, bd = 7.5;
      for (const q of palms) { if (q === p) continue; const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; } }
      if (!best) continue;
      const key = [p, best].map((o) => `${o.x},${o.z}`).sort().join('|'); if (seen.has(key)) continue; seen.add(key);
      const n = Math.max(4, Math.round(bd / 0.6));
      for (let i = 1; i < n; i++) { const u = i / n; pts.push([p.x + (best.x - p.x) * u, 2.5 - Math.sin(u * Math.PI) * 0.7, p.z + (best.z - p.z) * u]); }
    }
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), new THREE.MeshBasicMaterial({ color: 0xffffff }), pts.length);
    pts.forEach(([x, y, z], i) => { _festM4.makeTranslation(x, ctx.heightAt(x, z) + y, z); mesh.setMatrixAt(i, _festM4); mesh.setColorAt(i, _festCol.setHex(FEST_COLORS[i % FEST_COLORS.length])); });
    mesh.userData.dynamic = true; mesh.frustumCulled = false; mesh.visible = false;
    ctx.world.root.add(mesh);
    festive = mesh; festiveStep = -1;
  }
  function festiveTick(t) {
    if (!festive) return;
    festive.visible = !!ctx.isNight?.();
    if (!festive.visible) return;
    const step = Math.floor(t * 2);   // twinkle: colours chase along the strands twice a second
    if (step === festiveStep) return; festiveStep = step;
    for (let i = 0; i < festive.count; i++) festive.setColorAt(i, _festCol.setHex(FEST_COLORS[(i + step) % FEST_COLORS.length]).multiplyScalar((i + step) % 7 === 0 ? 0.35 : 1));
    festive.instanceColor.needsUpdate = true;
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
    const last = b.last, wasHome = !!(last && isHome(b.group, last, b.id));
    const acts = Object.entries(ACTIVITIES[b.group]).filter(([k, a]) => k !== b.act && k !== last && (!(a.owner || a.owners) || owns(a, b.id)) && !(wasHome && isHome(b.group, k, b.id)));
    const night = ctx.isNight?.();
    const rival = AVOID[b.id] && brains.find((o) => o.id === AVOID[b.id]);
    const options = acts.filter(([k]) => freeSlot(b.group, k, b) !== undefined && !(rival && rival.act === k) && !(k === 'hoop' && state.hoop));
    if (!options.length) return null;
    let total = 0; const w = options.map(([k, a]) => { const x = (isHome(b.group, k, b.id) ? (wasHome ? 0 : 20) : owns(a, b.id) ? 3 : 1) * (a.w || 1) * (night && (k === 'deck' || k === 'campfire') ? 2 : 1) * (b.id === 'tahiti_cf1' && k === 'railing' ? 4 : 1); total += x; return x; });
    let r = Math.random() * total;
    for (let i = 0; i < options.length; i++) { r -= w[i]; if (r <= 0) return options[i][0]; }
    return options[0][0];
  }
  const homeOf = (b) => Object.keys(ACTIVITIES[b.group]).find((k) => isHome(b.group, k, b.id));
  const pilotBusy = (b) => ['RETURNING_TO_TERMINAL', 'WAITING_FOR_NATHAN', 'BOARDING', 'TRAVELLING'].includes(b.hstate);
  // members out and about (not at their own station); free spirits without a station don't count
  const roamingCount = (g, except) => brains.filter((o) => o !== except && o.group === g && o.id !== 'harris' && homeOf(o) && !o.forced && !(o.act && isHome(g, o.act, o.id))).length;
  function mayDepart(b, now) {
    const g = b.group, pr = PROFILE[b.id] || { roam: 0.5 };
    if (now - lastDepart[g] < STAGGER[g]) return false;               // stagger: one departure at a time
    let cap = ROAM_CAP[g];
    if (g === 'vg' && inHideout) {                                   // Nathan's home: keep it lively
      if (now - hideoutSince < 35000) return false;                  // nobody walks out as he walks in
      cap = 1; if (Math.random() < 0.5) return false;
    }
    if (roamingCount(g, b) >= cap) return false;
    if (Math.random() > pr.roam) return false;
    lastDepart[g] = now; return true;
  }
  // after an event: everyone heads back to their own station, a few seconds apart
  function resume(list) {
    const now = performance.now();
    list.forEach((b, i) => { b.forced = false; b.mode = 'idle'; b.snack = 0; release(b); b.wake = now + 500 + i * 1500 + Math.random() * 1200; b.goHome = true; });
  }
  function climbOnBed(b, s) {
    const ch = b.it.character, gp = ch.group.position;
    b.mode = 'bed'; b.path = []; b.then = null;
    b.bedMove = {
      fromX: gp.x, fromY: gp.y, fromZ: gp.z,
      toX: s.x, toY: s.opts.bed.y, toZ: s.z,
      curY: gp.y, face: s.face, pose: s.pose,
      t: 0, dur: 0.45, entering: true, bed: s.opts.bed,
      onDone: () => { b.onBed = s.opts.bed; arrive(b); },
    };
  }
  function stepOffBed(b, then) {
    if (b.bedMove && !b.bedMove.entering) { b.bedMove.onDone = () => { b.mode = 'idle'; then?.(); }; return; }
    const bed = b.onBed || b.bedMove?.bed;
    if (!bed) { then?.(); return; }
    const ch = b.it.character, gp = ch.group.position;
    const [ax, az] = bed.approach, ay = ctx.heightAt(ax, az);
    ch.pose = null; b.onBed = null; b.mode = 'bed';
    b.bedMove = {
      fromX: gp.x, fromY: gp.y, fromZ: gp.z,
      toX: ax, toY: ay, toZ: az,
      curY: gp.y, face: Math.atan2(ax - gp.x, az - gp.z), pose: null,
      t: 0, dur: 0.45, entering: false, bed,
      onDone: () => { b.mode = 'idle'; then?.(); },
    };
  }
  function goTo(b, x, z, then, run = false) {
    if (b.onBed || b.bedMove) {
      const bed = b.onBed || b.bedMove.bed;
      const [ax, az] = bed.approach;
      const path = ctx.nav.findPath(ax, az, x, z);
      if (!path.length && !b.forced && ctx.nav.isWalkable(x, z) && Math.hypot(x - ax, z - az) > 0.6) {
        stepOffBed(b, () => { release(b); b.mode = 'idle'; b.then = null; b.wake = performance.now() + 3000 + Math.random() * 3000; b.goHome = true; });
        return false;
      }
      stepOffBed(b, () => {
        b.path = path.length ? path : [{ x, z }];
        b.goal = { x, z }; b.then = then; b.run = run; b.mode = 'walk';
        b.it.character.pose = null;
      });
      return true;
    }
    const p = b.it.character.group.position;
    const path = ctx.nav.findPath(p.x, p.z, x, z);
    // unreachable land goal (swim spots and group events keep the direct walk): never beeline through water/buildings or park at the rim; wait and head home instead
    if (!path.length && !b.forced && ctx.nav.isWalkable(x, z) && Math.hypot(x - p.x, z - p.z) > 0.6) { release(b); b.mode = 'idle'; b.then = null; b.wake = performance.now() + 3000 + Math.random() * 3000; b.goHome = true; return false; }
    b.path = path.length ? path : [{ x, z }];
    b.goal = { x, z }; b.then = then; b.run = run; b.mode = 'walk';
    b.it.character.pose = null;
    return true;
  }
  function assign(b, act) {
    const i = freeSlot(b.group, act, b);
    if (i === undefined) return false;
    b.act = act; b.slotI = i; b.mode = 'walk';
    const s = slotOf(b.group, act, i);
    if (s.opts.bed) return goTo(b, s.opts.bed.approach[0], s.opts.bed.approach[1], () => climbOnBed(b, s));
    return goTo(b, s.x, s.z, () => arrive(b));
  }
  function arrive(b) {
    const s = slotOf(b.group, b.act, b.slotI);
    const pr = PROFILE[b.id] || {}, [lo, hi] = isHome(b.group, b.act, b.id) ? (pr.home || [40, 80]) : [16, 34];
    b.mode = 'stay'; b.until = performance.now() + (lo + Math.random() * (hi - lo)) * 1000; b.poseAt = performance.now() + 3000 + Math.random() * 6000;
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
    if (b.hstate === 'RETURNING_TO_TERMINAL' && b.mode !== 'walk' && b.mode !== 'bed') { b.hstate = 'WAITING_FOR_NATHAN'; b.mode = 'wait'; }
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
  // Courts belong to the players: anyone else is pushed back to the edge and slides round it.
  function keepOffCourts(b, gp) {
    if (b.vball || b.forced) return false;
    const goal = b.path?.[b.path.length - 1];
    let pushed = false;
    for (const g of ['vg', 'ol']) {
      if (b.act === 'volley' && b.group === g) continue;
      const k = COURT[g], dx = gp.x - k.c.x, dz = gp.z - k.c.z;
      let a = dx * k.u.x + dz * k.u.z, w = dx * k.w.x + dz * k.w.z;
      const HA = HL + 0.8, HB = HW + 0.8;
      if (Math.abs(a) < HA && Math.abs(w) < HB) {
        if (goal) { const gx = goal.x - k.c.x, gz = goal.z - k.c.z; if (Math.abs(gx * k.u.x + gz * k.u.z) < HA && Math.abs(gx * k.w.x + gz * k.w.z) < HB) continue; }
        if (HA - Math.abs(a) < HB - Math.abs(w)) a = Math.sign(a || 1) * HA; else w = Math.sign(w || 1) * HB;
        gp.x = k.c.x + k.u.x * a + k.w.x * w; gp.z = k.c.z + k.u.z * a + k.w.z * w; pushed = true;
      }
    }
    if (b.act !== 'hoop') {
      const cx = 18, cz = -25.2, r = 3.4, dx = gp.x - cx, dz = gp.z - cz, d = Math.hypot(dx, dz);
      const inGoal = goal && Math.hypot(goal.x - cx, goal.z - cz) < r;
      if (d < r && !inGoal) { const s = r / (d || 1); gp.x = cx + (d ? dx : 1) * s; gp.z = cz + dz * s; pushed = true; }
    }
    return pushed;
  }
  function release(b) { b.act = null; b.slotI = null; b.it.character.pose = null; b.swim = false; }

  const vel = new THREE.Vector3();
  function tickBrain(b, dt, t, now) {
    const it = b.it, ch = it.character, gp = ch.group.position;
    if (it.frozen || b.riding || b.vball) return;                // cinematic, on a bike, or playing volleyball
    vel.set(0, 0, 0);
    const talking = state.talkingTo === it;
    if (talking && (b.onBed || b.bedMove?.entering)) stepOffBed(b, () => { b.mode = 'talk'; });
    if (b.bedMove) {
      const m = b.bedMove;
      m.t += dt;
      const u = Math.min(1, m.t / m.dur);
      const s = u * u * (3 - 2 * u);
      gp.x = m.fromX + (m.toX - m.fromX) * s;
      gp.z = m.fromZ + (m.toZ - m.fromZ) * s;
      m.curY = m.fromY + (m.toY - m.fromY) * s + Math.sin(u * Math.PI) * 0.22;
      ch.heading += angDiff(ch.heading, m.face) * Math.min(1, dt * 10);
      if (m.entering && u > 0.3) ch.pose = m.pose;
      if (!m.entering) ch.pose = null;
      if (u >= 1) {
        gp.x = m.toX; gp.z = m.toZ; m.curY = m.toY;
        const done = m.onDone;
        b.bedMove = null;
        done?.();
      }
    } else if (talking) {
      ch.pose = null;
      const p = P(); ch.heading += Math.atan2(Math.sin(Math.atan2(p.x - gp.x, p.z - gp.z) - ch.heading), Math.cos(Math.atan2(p.x - gp.x, p.z - gp.z) - ch.heading)) * Math.min(1, dt * 8);
    } else if (b.mode === 'talk') {
      if (b.act === 'rest' && b.slotI != null) climbOnBed(b, slotOf(b.group, b.act, b.slotI));
      else b.mode = 'idle';
    } else if (b.mode === 'walk' && b.path?.length) {
      const wp = b.path[0], dx = wp.x - gp.x, dz = wp.z - gp.z, d = Math.hypot(dx, dz);
      const sp = b.forced ? 7.2 : b.run ? 3.4 : 1.8;
      if (d < 0.12) { b.path.shift(); if (!b.path.length) { const f = b.then; b.then = null; b.mode = 'idle'; f?.(); } }
      else {
        // give way to someone right ahead, with agile sidestep/bypass during photo gathering so no one stalls
        const aheadR = b.photoWalk ? 0.36 : 0.55;
        const aheadR2 = aheadR * aheadR;
        const bypass = b.photoWalk && (b.bypassT || 0) > 0;
        if (b.bypassT > 0) b.bypassT = Math.max(0, b.bypassT - dt);
        let ahead = false;
        if (!bypass) {
          const ax = gp.x + (dx / d) * 0.55, az = gp.z + (dz / d) * 0.55;
          for (let i = 0; i < brains.length; i++) {
            const o = brains[i];
            if (o === b) continue;
            const op = o.it.character.group.position;
            const ex = op.x - ax, ez = op.z - az;
            if (ex * ex + ez * ez < aheadR2) { ahead = true; break; }
          }
        }
        if (!ahead) {
          b.stuck = 0; b.stallCount = 0;
          const s = Math.min(sp * dt, d); gp.x += (dx / d) * s; gp.z += (dz / d) * s;
          if (keepOffCourts(b, gp)) { if ((b.pushT = (b.pushT || 0) + dt) > 1.2) { b.pushT = 0; b.path.shift(); if (!b.path.length) { const f = b.then; b.then = null; b.mode = 'idle'; f?.(); } } } else b.pushT = 0;
          vel.set(dx / d, 0, dz / d).multiplyScalar(sp);
        } else if ((b.stuck = (b.stuck || 0) + dt) > (b.photoWalk ? 0.45 : 1.2)) {
          // someone is standing in the way: close enough counts as arrived, otherwise sidestep or pass
          const last = b.path[b.path.length - 1];
          if (dist(gp, last) < (b.photoWalk ? 0.25 : 1.8)) { b.path = []; b.stuck = 0; b.stallCount = 0; const f = b.then; b.then = null; b.mode = 'idle'; f?.(); }
          else {
            let stepped = false;
            const dirs = b.photoWalk
              ? [[-dz / d, dx / d], [dz / d, -dx / d], [(dx - dz) / (d * 1.414), (dz + dx) / (d * 1.414)], [(dx + dz) / (d * 1.414), (dz - dx) / (d * 1.414)]]
              : [[-dz / d, dx / d]];
            for (const [ux, uz] of dirs) {
              const sx = gp.x + ux * 0.55, sz = gp.z + uz * 0.55;
              if (ctx.nav.isWalkable(sx, sz)) { gp.x = sx; gp.z = sz; stepped = true; break; }
            }
            if (!stepped && b.photoWalk) b.bypassT = 0.7;
            b.stuck = b.photoWalk ? 0.15 : 0.6;
            if (b.photoWalk && (b.stallCount = (b.stallCount || 0) + 1) >= 2) { b.bypassT = 0.9; b.stallCount = 0; }
          }
        }
      }
    } else if (b.mode === 'stay') {
      ch.heading += Math.atan2(Math.sin(b.face - ch.heading), Math.cos(b.face - ch.heading)) * Math.min(1, dt * 3);
      // chatty: occasionally say something, or invite Nathan when he's close
      if (Math.random() < dt * 0.02) bubble(it, rand(ACTIVITIES[b.group][b.act].lines), 3);
      const dP = dist(P(), gp);
      if (hunt && huntTarget() && dP < 4 && now - lastHint > 20000 && Math.random() < dt * 0.3) { lastHint = now; bubble(it, huntTarget().hint, 3.6); }
      const A = ACTIVITIES[b.group][b.act];
      if (A?.poses && now > b.poseAt) { ch.pose = rand(A.poses); b.poseAt = now + 4000 + Math.random() * 7000; }
      if ((b.act === 'photo_sa' || b.act === 'photo_sh') && Math.random() < dt * 0.012) { const mate = brains.find((o) => o !== b && o.mode === 'stay' && (o.act === 'photo_sa' || o.act === 'photo_sh')); if (mate) { const myEpoch = epoch; bubble(it, b.act === 'photo_sa' ? 'Shabesh, try a wider lens.' : 'Sathesh, this one is sharp!', 2.6); setTimeout(() => { if (epoch === myEpoch && mate.it) bubble(mate.it, rand(['Nice!', 'Send me that one.', 'Okay, okay, show me.']), 2.4); }, 1600); } }
      if (now > b.until && !party[b.group]) {
        if (b.act && isHome(b.group, b.act, b.id) && !mayDepart(b, now)) b.until = now + (8 + Math.random() * 16) * 1000;   // stays a bit longer
        else { b.last = b.act; release(b); b.mode = 'idle'; const a = pickActivity(b); if (a) assign(b, a); else stepOffBed(b); }
      }
    } else if (b.mode === 'idle' && !b.forced && now > (b.wake || 0)) {
      const h = b.goHome && homeOf(b); b.goHome = false;
      const a = h && freeSlot(b.group, h, b) !== undefined ? h : pickActivity(b); if (a) assign(b, a);
    }
    // Shabeer (and anyone filming) snaps a photo now and then: a little white flash
    if (b.mode === 'stay' && ch.pose === 'film' && Math.random() < dt * 0.25) camFlash(gp, ch.heading);
    // parties: dancers now and then grab a snack or cheer, then dance again
    if (b.mode === 'party') {
      if (!b.snack && Math.random() < dt * 0.06) { b.snack = now + 2500 + Math.random() * 2000; b.dance = ch.pose; ch.pose = rand(['eat', 'cheer', 'eat']); }
      else if (b.snack && now > b.snack) { b.snack = 0; ch.pose = b.dance || 'dance1'; }
    }
    // swimming: drop into the water and paddle; sleeping: rest on top of the mattress
    const ground = ctx.heightAt(gp.x, gp.z);
    gp.y = b.bedMove ? b.bedMove.curY : b.onBed ? b.onBed.y : b.swim && b.mode === 'stay' ? -0.55 + Math.sin(t * 2 + gp.x) * 0.04 : ground;
    let onScreen = true;
    if (ctx.camera?.isOrthographicCamera && !b.forced && !b.vball && !b.bedMove && dist(P(), gp) > 10) {
      _ndc.set(gp.x, gp.y + 1, gp.z).project(ctx.camera);
      onScreen = Math.abs(_ndc.x) <= 1.45 && Math.abs(_ndc.y) <= 1.45;
    }
    if (onScreen) {
      const stepDt = (b._offDt || 0) + dt;
      b._offDt = 0;
      ch.update(stepDt, vel, t);
    } else {
      b._offDt = (b._offDt || 0) + dt;
      if (b._offDt >= 0.1) {
        const stepDt = b._offDt;
        b._offDt = 0;
        ch.update(stepDt, vel, t);
      }
    }
    it.x = gp.x; it.z = gp.z;
    it.beacon.group.visible = !(b.onBed || b.bedMove || b.riding);
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
      epoch++;
      layer = document.createElement('div'); layer.className = 'tahiti-bubbles'; document.body.append(layer);
      brains = ctx.world.npcs.filter((it) => it.npcId === 'harris' || it.npcId.startsWith('tahiti_')).map((it) => {
        const group = it.npcId.startsWith('tahiti_cf') ? 'ol' : 'vg';
        it.brain = true;
        const b = { id: it.npcId, it, group, mode: 'idle', act: null, slotI: null, hstate: it.npcId === 'harris' ? 'ARRIVING' : null, _offDt: 0 };
        it._b = b;
        return b;
      });
      // start everyone already in place (no rush hour on arrival)
      const t0 = performance.now();
      for (const b of brains) {
        if (b.id === 'harris') continue;
        const h = homeOf(b), a = h && freeSlot(b.group, h, b) !== undefined ? h : pickActivity(b); if (!a) continue;
        const i = freeSlot(b.group, a, b); b.act = a; b.slotI = i;
        const s = slotOf(b.group, a, i); const g = b.it.character.group.position; g.x = s.x; g.z = s.z; arrive(b);
        b.until = t0 + (0.35 + Math.random() * 0.65) * (b.until - t0);   // each on their own clock
      }
      lastDepart = { vg: t0, ol: t0 - 6000 };
      partyLights = { vg: ctx.world.apis.party_lights_vg, ol: ctx.world.apis.party_lights_ol };
      courts = { vg: newCourt('vg'), ol: newCourt('ol') }; ballMesh(); hoopMesh(); buildFestive();
      const saved = state.save.tahitiTreasure || [];
      treasureItems = ctx.world.interactables.filter((it) => it.kind === 'activity' && it.act === 'treasure_item');
      for (const it of treasureItems) {
        if (saved.includes(it.treasureId)) it.found = true;
        it.beacon.group.visible = false; it.hit.visible = false; it.disabled = true;
      }
      photoSpotList = ctx.world.interactables.filter((i) => i.kind === 'activity' && i.act === 'photo');
      if (buddyTimer) clearInterval(buddyTimer);
      buddyTimer = setInterval(() => {
        if (!buddy || buddy.riding || state.cine) return;
        const gp = buddy.it.character.group.position, p = P();
        if (dist(gp, p) > 2.4 && buddy.mode !== 'walk' && buddy.mode !== 'bed') { goTo(buddy, p.x + 0.9, p.z + 0.9, () => { if (buddy) buddy.mode = 'follow'; }, dist(gp, p) > 6); }
      }, 500);
    },
    exit() {
      epoch++;
      if (buddyTimer) { clearInterval(buddyTimer); buddyTimer = 0; }
      endMatch(true); endShootout(true);
      if (flashM) { clearTimeout(flashM.t); disposeObj(flashM); flashM = null; }
      disposeObj(ball); ball = null; disposeObj(shadow); shadow = null; disposeObj(ring); ring = null;
      disposeObj(festive); festive = null;
      disposeObj(bb.mesh); bb.mesh = null; disposeObj(bb.ring); bb.ring = null;
      treasureItems = []; photoSpotList = []; _sepList.length = 0;
      hud?.remove(); hud = null; layer?.remove(); layer = null;
      bubbles = []; brains = []; party = { vg: 0, ol: 0 }; partyNathan = null;
      if (partyView) { ctx.setView(null); partyView = null; }
      passenger = null; buddy = null; photo = null; session = null; lastPhotoInfo = null; race = null;
      state.joined = null; state.photoPath = false;
    },
    harrisState() { return harris()?.hstate; },
    inMatch: () => !!state.volley || !!state.hoop,
    getNpcActivity(npcId) {
      const b = brains.find((x) => x.id === npcId);
      if (!b) return null;
      return { act: b.act, mode: b.mode, pose: b.it?.character?.pose };
    },
    _debug: () => ({ brains, ACTIVITIES, party, race, photo, session, lastPhotoInfo, passenger, courts, bb, startShabeshSession, startPhoto, computePhotoView, findPosingArea, characterWorldBox }),
    onArrive() { const h = harris(); if (h) { h.hstate = 'ARRIVING'; h.mode = 'idle'; h.leftTerminal = false; h.onBed = null; h.bedMove = null; release(h); } },
    harrisNearJet() { const h = harris(); return !!h && dist(P(), ctx.jetPoint()) < 12 && (h.hstate === 'WAITING_FOR_NATHAN' || dist(h.it.character.group.position, P()) < 4); },
    callHarrisToJet() {
      const h = harris(); if (!h) return;
      bubble(h.it, dist(P(), ctx.jetPoint()) < 12 ? 'On my way!' : 'Meet me at the jet!', 3);
      h.leftTerminal = true; h.hstate = 'RETURNING_TO_TERMINAL';
      rushTo(h, TERMINAL.x + 1.2, TERMINAL.z + 0.8, () => { h.hstate = 'WAITING_FOR_NATHAN'; h.mode = 'wait'; bubble(h.it, 'Ready for the next destination?', 3.4); });
    },
    musicOverride() { const p = P(); const g = ['vg', 'ol'].find((x) => party[x] > 0 && dist(p, BEACH[x].c) < 22); return g ? partyMood[g] : null; },

    update(dt, t) {
      const now = performance.now();
      if (state.cine) { const h = harris(); if (h) h.hstate = state.cine.phase === 'board' ? 'BOARDING' : 'TRAVELLING'; drawBubbles(); return; }
      for (const g of ['vg', 'ol']) if (party[g] > 0) { party[g] -= dt; if (party[g] <= 0) endParty(g); }
      { const p = P(), inside = p.x > HIDEOUT.x0 && p.x < HIDEOUT.x1 && p.z > HIDEOUT.z0 && p.z < HIDEOUT.z1; if (inside && !inHideout) hideoutSince = now; inHideout = inside; }
      for (const b of brains) {
        if (b.id === 'harris' && !b.riding && harrisTick(b, now)) { tickBrain(b, dt, t, now); continue; }
        tickBrain(b, dt, t, now);
      }
      // personal space: walkers and idlers step around each other; people at their
      // station or in a group event (party, photo, volleyball, riding) hold their spot
      _sepList.length = 0;
      for (let i = 0; i < brains.length; i++) {
        const b = brains[i];
        if (!b.it.frozen && !b.riding && !b.vball && !b.it.passenger) _sepList.push(b.it);
      }
      separateNpcs(_sepList,
        (it) => (it._b.forced || it._b.mode === 'party' || it._b.swim || it._b.onBed || it._b.bedMove ? 0 : it._b.mode === 'stay' ? 0.15 : 1), dt, (x, z) => ctx.nav.isWalkable(x, z));
      // Nathan joined an activity: hold the slot and pose until he moves
      if (state.joined) { const j = state.joined, p = P(); p.set(j.x, ctx.heightAt(j.x, j.z) + (j.swim ? -0.55 : 0), j.z); player.heading = j.face; player.pose = j.pose; }
      if (passenger) updatePassenger(dt, t);
      if (session) sessionTick(dt);
      if (photo) photoTick(dt);
      if (race) raceTick(dt);
      partyNathanTick();
      for (const g of ['vg', 'ol']) courtTick(courts[g], dt, t, now);
      hoopTick(dt, t, now);
      festiveTick(t);
      if (hunt) {
        const targetId = huntTarget()?.id;
        for (let i = 0; i < treasureItems.length; i++) {
          const it = treasureItems[i];
          const vis = !it.found && targetId === it.treasureId && dist(P(), it) < 9;
          it.beacon.group.visible = vis; it.hit.visible = vis; it.disabled = !vis;
        }
      }
      drawBubbles();
    },

    // context hints for the prompt (R / F / G)
    hints() {
      const h = [];
      if (state.volley) return [state.volley.phase === 'serve' && state.volley.server?.nathan ? 'Space Serve' : 'Space Spike'];
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
    leaveJoin() { if (!state.joined) return; const wasPhoto = !!state.joined.photo; state.joined = null; player.pose = null; const p = P(); p.y = ctx.heightAt(p.x, p.z); if (wasPhoto && session && session.phase === 'gather') cancelSession(true); if (wasPhoto && photo && photo.phase === 'gather') cancelPhoto(true); },
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
    buddy = b; release(b); b.forced = true;
    stepOffBed(b, () => { if (buddy === b) b.mode = 'follow'; });
    bubble(b.it, rand(["Let's go for a ride!", 'Finally, a ride!', 'You drive, I DJ.']), 3);
    ctx.toast(`${def(b.id).name || 'Friend'} is coming along. Get on a motorcycle.`);
    return true;
  }
  function boardPassenger(b, m) {
    release(b); b.forced = true;
    passenger = { b, m, seated: false };
    const bp = m.it.model.group.position;
    goTo(b, bp.x - 0.9, bp.z + 0.4, () => { passenger && (passenger.seated = true); b.riding = true; b.it.passenger = true; bubble(b.it, 'Hold on tight? You hold on tight.', 2.6); }, true);
  }
  function updatePassenger(dt, t) {
    const { b, m } = passenger;
    if (!state.mount || state.mount !== m) { passenger = null; b.riding = false; b.it.passenger = false; b.forced = false; return; }
    if (!passenger.seated) return;
    const ch = b.it.character, g = m.it.model.group, h = m.heading;
    // rear of the two-up seat, level with Nathan, so the passenger never covers him
    ch.group.position.set(g.position.x - Math.sin(h) * 0.92, g.position.y + 0.6, g.position.z - Math.cos(h) * 0.92);
    ch.heading = h; ch.pose = 'ride';
    ch.update(dt, _zeroV, t);
    b.it.x = ch.group.position.x; b.it.z = ch.group.position.z;
    b.it.beacon.group.visible = false;
  }

  // ---------- group photo ----------
  // each gang has its own photo spot (camera tripod); only that gang lines up there
  const photoSpots = () => photoSpotList;
  function nearPhotoSpot(r = 6) { let best = null, bd = r; for (const s of photoSpots()) { const d = dist(s, P()); if (d < bd) { bd = d; best = s; } } return best; }
  function cancelPhoto(silent = false) {
    if (!photo) return;
    for (const s of photo.spots) { s.b.photoWalk = false; s.b.bypassT = 0; }
    resume(photo.spots.map((s) => s.b));
    if (state.joined?.photo) { state.joined = null; player.pose = null; }
    state.path = [];
    state.photoPath = false;
    photo = null;
    if (!silent) ctx.toast('Group photo cancelled.');
  }
  function startPhoto(spot = nearPhotoSpot(), opts = {}) {
    if (!spot) { ctx.toast('Find a gang photo spot (look for the camera tripod).'); return false; }
    if (photo || session) return false;
    const gang = spot.gang;
    const crew = brains.filter((b) => b.group === gang && !b.riding && !(b.id === 'harris' && pilotBusy(b)));
    if (!crew.length) return false;
    for (const [id, at] of [['tahiti_cf1', 0], ['tahiti_cf2', 3]]) { const i = crew.findIndex((b) => b.id === id); if (i >= 0 && crew.length > at) { const [x] = crew.splice(i, 1); crew.splice(at, 0, x); } }
    const tripodPos = tripodPosForSpot(spot);
    const total = 1 + crew.length;
    const areaOpts = gang === 'ol'
      ? { preferAngle: -90, stepX: 1.15, rowD: 1.1, d0: 3.8 }
      : { preferAngle: -135, stepX: 1.38, rowD: 1.22, d0: 4.6 };
    const area = findPosingArea(tripodPos, total, areaOpts);
    const nathanSlot = area.slots[area.nathanIndex];
    const otherSlots = orderedOtherSlots(area.slots, area.nathanIndex);

    state.joined = null; ctx.clearMarker?.();
    const nathanPath = dist(P(), nathanSlot) < 0.25 ? [] : ctx.nav.findPath(P().x, P().z, nathanSlot.x, nathanSlot.z);
    state.path = dist(P(), nathanSlot) < 0.25 ? [] : (nathanPath.length ? nathanPath : [{ x: nathanSlot.x, z: nathanSlot.z }]);
    state.photoPath = state.path.length > 0;

    const spots = crew.map((b, i) => {
      const sl = otherSlots[i % otherSlots.length];
      b.photoWalk = true; b.bypassT = 0;
      const item = { b, x: sl.x, z: sl.z, arrived: false };
      rushTo(b, sl.x, sl.z, () => {
        b.photoWalk = false; b.bypassT = 0;
        b.mode = 'photo-pose';
        b.it.character.pose = 'photo';
        item.arrived = true;
      });
      return item;
    });

    bubble(crew[0].it, `${GANG_NAME[gang]}, photo time!`, 2.6);
    photo = {
      spots, tripodPos, area, nathanSlot, nathanArrived: false, curFace: player.heading,
      t: 0, phase: 'gather', count: 0, lastCount: 0, shot: false, gang,
      fast: !!opts.fast, doneT: 0, view: null, refreshMark: 0,
    };
    ctx.toast(`${GANG_NAME[gang]} photo. Everyone in!`);
    return true;
  }
  function photoTick(dt) {
    const p = photo;
    p.t += dt;
    const { area, nathanSlot } = p;
    if (p.phase === 'gather') {
      if (!p.nathanArrived) {
        if (dist(P(), nathanSlot) < 0.35 && !state.path.length) {
          p.nathanArrived = true;
          state.photoPath = false;
          p.curFace = player.heading;
          state.joined = { x: nathanSlot.x, z: nathanSlot.z, pose: 'photo', face: p.curFace, swim: false, photo: true };
        } else if (state.path.length) {
          const last = state.path[state.path.length - 1];
          if (dist(last, nathanSlot) > 0.6) { cancelPhoto(); return; }
        } else if (p.t > 0.15) {
          cancelPhoto(); return;
        }
      } else {
        if (!state.joined?.photo) { cancelPhoto(true); return; }
        p.curFace += angDiff(p.curFace, area.face) * Math.min(1, dt * 10);
        state.joined.face = p.curFace;
      }
      const step = Math.floor(p.t / 6);
      if (step > p.refreshMark) {
        p.refreshMark = step;
        for (const s of p.spots) {
          if (!s.arrived && !s.b.path?.length && dist(s.b.it.character.group.position, s) >= 0.3) {
            s.b.bypassT = 1.2;
            rushTo(s.b, s.x, s.z, () => {
              s.b.photoWalk = false; s.b.bypassT = 0;
              s.b.mode = 'photo-pose'; s.b.it.character.pose = 'photo';
              s.arrived = true;
            });
          }
        }
      }
      for (const s of p.spots) {
        if (!s.arrived) continue;
        const ch = s.b.it.character, gp = ch.group.position;
        gp.x += (s.x - gp.x) * Math.min(1, dt * 10);
        gp.z += (s.z - gp.z) * Math.min(1, dt * 10);
        ch.heading += angDiff(ch.heading, area.face) * Math.min(1, dt * 10);
        ch.pose = 'photo';
      }
      const nReady = p.nathanArrived && player.pose === 'photo' && player.speed < 0.08 && (player.poseW || 0) > 0.92 && Math.abs(angDiff(player.group.rotation.y, area.face)) < 0.08;
      const crewReady = p.spots.every((s) => {
        if (!s.arrived) return false;
        const ch = s.b.it.character;
        return dist(ch.group.position, s) < 0.45 && ch.pose === 'photo' && ch.speed < 0.08 && (ch.poseW || 0) > 0.92 && Math.abs(angDiff(ch.group.rotation.y, area.face)) < 0.08;
      });
      if (nReady && crewReady) {
        p.phase = 'countdown';
        p.count = p.fast ? 0.25 : 2.6;
        p.lastCount = Math.ceil(p.count) + 1;
      }
    } else if (p.phase === 'countdown') {
      if (!state.joined?.photo) { cancelPhoto(true); return; }
      state.joined.face = area.face;
      for (const s of p.spots) { s.b.it.character.heading = area.face; s.b.it.character.pose = 'photo'; }
      p.count -= dt;
      const shown = Math.ceil(p.count);
      if (shown !== p.lastCount && shown > 0 && shown <= 3 && !p.fast) { p.lastCount = shown; ctx.flash(String(shown)); ctx.sfx.open(); }
      if (p.count <= 0 && !p.shot) {
        p.shot = true;
        const subjChars = [player, ...p.spots.map((s) => s.b.it.character)];
        const view = computePhotoView(p.tripodPos, { x: area.fx, z: area.fz }, subjChars, ctx.aspect?.() || 16 / 9, { leadDist: 0.58, camHeight: 1.40, fovMax: 76 });
        p.view = view;
        const url = snapPhoto(view, p.spots.map((x) => x.b));
        ctx.flash('', true); ctx.sfx.memory();
        savePhoto(url, GANG_NAME[p.gang]);
        lastPhotoInfo = {
          mode: 'tripod-' + p.gang, url, view,
          camPos: { ...p.tripodPos }, area,
          subjectBoxes: subjChars.map(characterWorldBox),
          subjectCount: subjChars.length,
        };
        p.phase = 'done'; p.doneT = 0;
      }
    } else if (p.phase === 'done') {
      p.doneT += dt;
      if (p.doneT >= (p.fast ? 0.05 : 0.9)) {
        for (const s of p.spots) s.b.photoWalk = false;
        resume(p.spots.map((s) => s.b));
        state.joined = null; player.pose = null;
        photo = null;
        ctx.openGallery();
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
    resume(brains.filter((b) => b.group === g && (b.mode === 'party' || (b.forced && !b.riding && !b.vball))));
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
    release(b); b.onBed = null; b.bedMove = null; b.forced = true;
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
      const myEpoch = epoch;
      const name = def(r.b.id).name;
      bubble(r.b.it, win ? rand(['Rematch. Now.', 'You cheated. Somehow.', 'Okay, okay, you win.']) : rand(['Too slow!', 'Easy!', 'Better luck next time!']), 3);
      ctx.toast(win ? `You beat ${name}!` : `${name} wins the race.`);
      brains.forEach((o) => { if (o !== r.b && dist(o.it.character.group.position, r.B) < 10) o.it.character.play('wave'); });
      setTimeout(() => { if (epoch !== myEpoch) return; resume([r.b]); race = null; }, 1500);
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
      case 'anuhoop': anuHoop(); return true;
      case 'photosession': photoSession(); return true;
      case 'foodcontest': feastChallenge(); return true;
      case 'tvgame': tvGame(); return true;
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
    const myEpoch = epoch;
    ctx.minigame(`<h2>Dance battle vs ${name}</h2><p class="muted">Hit the arrow keys as they appear (tap them on mobile).</p><div class="dance-arrow" id="dance-arrow">Ready…</div><div class="dance-pad">${Object.entries(glyph).map(([k, g]) => `<button type="button" data-key="${k}">${g}</button>`).join('')}</div><p id="dance-score">Hits: 0</p>`, (root, close) => {
      const show = () => {
        if (epoch !== myEpoch) return;
        if (i >= seq.length) {
          const win = hits > npcScore, tie = hits === npcScore;
          root.querySelector('#dance-arrow').textContent = win ? 'You win!' : tie ? 'Draw!' : `${name} wins!`;
          bubble(b.it, win ? 'Okay that was clean.' : tie ? 'Rematch!' : 'Still the champ.', 3);
          crowd.forEach((o) => o.it.character.play('wave'));
          setTimeout(() => { if (epoch !== myEpoch) return; close(); resume([b]); crowd.forEach((o) => { if (o.mode === 'stay') o.it.character.pose = slotOf(o.group, o.act, o.slotI).pose; }); }, 1600);
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
    const myEpoch = epoch;
    ctx.minigame(`<h2>Eating contest vs ${name}</h2><p class="muted">Mash SPACE (or tap EAT) for 8 seconds.</p><p class="food-count"><span id="food-you">0</span> vs <span id="food-npc">0</span></p><button type="button" class="btn primary" id="food-eat">EAT!</button><p id="food-left">8.0 s</p>`, (root, close) => {
      const bite = () => { if (done) return; bites++; ctx.sfx.step(); root.querySelector('#food-you').textContent = bites; };
      root.querySelector('#food-eat').addEventListener('click', bite);
      root.onkey = (k) => { if (k === ' ' || k === 'e' || k === 'Enter') bite(); };
      const start = performance.now();
      const iv = setInterval(() => {
        if (epoch !== myEpoch) { clearInterval(iv); return; }
        left = 8 - (performance.now() - start) / 1000;
        root.querySelector('#food-npc').textContent = Math.floor((8 - Math.max(0, left)) * rate);
        root.querySelector('#food-left').textContent = `${Math.max(0, left).toFixed(1)} s`;
        if (left <= 0 && !done) {
          done = true; clearInterval(iv);
          const npc = Math.floor(8 * rate), win = bites > npc;
          root.querySelector('#food-left').textContent = win ? 'You win! Champion eater.' : `${name} wins. Impressive.`;
          bubble(b.it, win ? rand(['I let you win.', 'I need a nap.']) : rand(['Never challenge me at food.', 'Seconds, anyone?']), 3);
          setTimeout(() => { if (epoch !== myEpoch) return; close(); resume([b]); }, 1600);
        }
      }, 100);
      return () => clearInterval(iv);
    });
  }
  // ---------- Outlaws stations: photo corner, food contest, basketball with Anu, TV gaming ----------
  const brainOf = (id) => brains.find((b) => b.id === id && !b.riding);
  // Summon an NPC cleanly along the navigation grid without teleporting.
  function rushTo(b, x, z, then) {
    release(b); b.forced = true; b.vball = false;
    goTo(b, x, z, then, true);
  }
  // Walk a friend to a spot and hold a pose there.
  function bring(b, x, z, pose, faceDeg, then) {
    rushTo(b, x, z, () => {
      b.mode = 'held';
      const ch = b.it.character;
      ch.pose = pose;
      ch.heading = (faceDeg * Math.PI) / 180;
      b.face = ch.heading;
      then?.();
    });
  }

  const WORKSTATION_SH = V(14.3, -12.3);
  const WORKSTATION_SA = V(12.3, -12.25);
  const TRIPOD_POS = { vg: V(-11.0, -0.4), ol: V(22.2, 0.6) };
  const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

  function tripodPosForSpot(spot) {
    if (TRIPOD_POS[spot.gang]) return { ...TRIPOD_POS[spot.gang] };
    const objs = (ctx.world?.map?.objects || []).filter((o) => o.type === 'photo_tripod');
    let best = null, bd = Infinity;
    for (const o of objs) { const d = dist(o, spot); if (d < bd) { bd = d; best = { x: o.x, z: o.z }; } }
    return best || { x: spot.x, z: spot.z };
  }

  function colliderFree(x, z, r = 0.36, ignoreNear = null) {
    const list = ctx.world?.queryColliders ? ctx.world.queryColliders(x, z, r + 0.5, _qBuf) : ctx.world?.colliders || [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const cx = c.cx ?? c.x, cz = c.cz ?? c.z;
      if (ignoreNear && cx !== undefined && Math.hypot(cx - ignoreNear.x, cz - ignoreNear.z) < 0.45) continue;
      if (c.r !== undefined) {
        if (Math.hypot(x - cx, z - cz) < c.r + r) return false;
      } else if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) {
        return false;
      }
    }
    return true;
  }

  function isSpotWalkable(x, z, refH, r = 0.45) {
    if (Math.abs(ctx.heightAt(x, z) - refH) > 0.25) return false;
    return ctx.nav.isWalkable(x, z, 0.45) && colliderFree(x, z, r);
  }

  function buildStaggeredFormation(center, fx, fz, count, stepX = 1.25, rowD = 1.15, centerDist = 5.0) {
    const rx = -fz, rz = fx;
    const face = Math.atan2(-fx, -fz);
    const slots = [];
    if (count <= 4) {
      for (let i = 0; i < count; i++) {
        const lat = (i - (count - 1) / 2) * stepX;
        slots.push({ x: center.x + rx * lat, z: center.z + rz * lat, row: 0, lat });
      }
      return { slots, nFront: count, nathanIndex: Math.floor(count / 2), face };
    }
    const nFront = Math.ceil(count / 2), nBack = count - nFront;
    const sameParity = nFront % 2 === nBack % 2;
    const stagF = sameParity ? -0.25 * stepX : 0;
    const stagB = sameParity ? 0.25 * stepX : 0;
    const backScale = (centerDist + rowD) / Math.max(2.5, centerDist);
    for (let i = 0; i < nFront; i++) {
      const lat = (i - (nFront - 1) / 2) * stepX + stagF;
      slots.push({ x: center.x + rx * lat, z: center.z + rz * lat, row: 0, lat });
    }
    for (let i = 0; i < nBack; i++) {
      const lat = ((i - (nBack - 1) / 2) * stepX + stagB) * backScale;
      slots.push({ x: center.x + fx * rowD + rx * lat, z: center.z + fz * rowD + rz * lat, row: 1, lat });
    }
    return { slots, nFront, nathanIndex: Math.floor(nFront / 2), face };
  }

  function orderedOtherSlots(slots, nathanIndex) {
    return slots
      .map((s, idx) => ({ s, idx }))
      .filter((item) => item.idx !== nathanIndex)
      .sort((a, b) => a.s.row - b.s.row || Math.abs(a.s.lat) - Math.abs(b.s.lat))
      .map((item) => item.s);
  }

  function isPhotoConeClear(camPos, fx, fz, slots, refH) {
    const fromX = camPos.x + fx * 0.56, fromZ = camPos.z + fz * 0.56;
    const rx = -fz, rz = fx;
    if (!colliderFree(fromX, fromZ, 0.25, camPos)) return false;
    for (const s of slots) {
      for (const pad of [-0.42, 0, 0.42]) {
        const tx = s.x + rx * pad, tz = s.z + rz * pad;
        const dx = tx - fromX, dz = tz - fromZ, L = Math.hypot(dx, dz) || 1;
        for (let u = 0.25; u < L - 0.35; u += 0.4) {
          const px = fromX + (dx / L) * u, pz = fromZ + (dz / L) * u;
          if (!colliderFree(px, pz, 0.26, camPos)) return false;
          if (Math.abs(ctx.heightAt(px, pz) - refH) > 1.6) return false;
        }
      }
    }
    return true;
  }

  function findPosingArea(camPos, count, opts = {}) {
    const refH = ctx.heightAt(camPos.x, camPos.z);
    const stepX = opts.stepX ?? (count >= 5 ? 1.48 : count >= 3 ? 1.32 : 1.25);
    const rowD = opts.rowD ?? (count >= 5 ? 1.25 : 1.15);
    const baseD = opts.d0 ?? (count === 1 ? 4.25 : count === 2 ? 4.45 : count <= 4 ? 4.75 : 5.65);
    const dists = count === 1
      ? [baseD, baseD + 0.35, baseD + 0.75, Math.max(3.95, baseD - 0.28)]
      : [baseD, baseD + 0.45, baseD + 0.90, Math.max(3.20, baseD - 0.35)].filter((d) => d >= 2.8);

    const cands = [];
    const pushAng = (a) => {
      const n = ((Math.round(a) % 360) + 360) % 360;
      if (!cands.includes(n)) cands.push(n);
    };
    if (opts.preferAngle != null) {
      for (const off of [0, 5, -5, 10, -10, 15, -15]) pushAng(opts.preferAngle + off);
    } else if (P().z > camPos.z + 2.0 && count <= 3) {
      for (const a of [0, 355, 5, 350, 10, 152, 148, 145]) pushAng(a);
    }
    for (const a of [152, 155, 148, 145, 140, 160, 135, 0, 355, 5, 165, 170]) pushAng(a);
    for (let a = 0; a < 360; a += 10) pushAng(a);

    const tryFit = (checkPath) => {
      for (const ang of cands) {
        const rad = (ang * Math.PI) / 180;
        const fx = Math.sin(rad), fz = Math.cos(rad);
        for (const d of dists) {
          const center = { x: camPos.x + fx * d, z: camPos.z + fz * d };
          const form = buildStaggeredFormation(center, fx, fz, count, stepX, rowD, d);
          if (!form.slots.every((s) => isSpotWalkable(s.x, s.z, refH, 0.45))) continue;
          if (!isPhotoConeClear(camPos, fx, fz, form.slots, refH)) continue;
          const ns = form.slots[form.nathanIndex];
          if (checkPath && dist(P(), ns) > 1.2 && !ctx.nav.findPath(P().x, P().z, ns.x, ns.z).length) continue;
          return { ...form, center, fx, fz, ang, dist: d };
        }
      }
      return null;
    };

    const hit = tryFit(true) || tryFit(false);
    if (hit) return hit;

    const rad = ((opts.preferAngle ?? 152) * Math.PI) / 180;
    const fx = Math.sin(rad), fz = Math.cos(rad);
    const center = { x: camPos.x + fx * baseD, z: camPos.z + fz * baseD };
    return { ...buildStaggeredFormation(center, fx, fz, count, stepX, rowD, baseD), center, fx, fz, ang: opts.preferAngle ?? 152, dist: baseD };
  }

  function characterWorldBox(ch) {
    ch.group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const partBox = new THREE.Box3();
    ch.group.traverse((o) => {
      if (!o.isMesh || !o.visible || o.userData?.xray || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      partBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      box.union(partBox);
    });
    if (box.isEmpty()) {
      const p = ch.group.position;
      box.set(new THREE.Vector3(p.x - 0.48, p.y, p.z - 0.35), new THREE.Vector3(p.x + 0.48, p.y + 2.66, p.z + 0.35));
    }
    return box;
  }

  function computePhotoView(camOriginPos, camDirXZ, subjectChars, aspect = 16 / 9, opts = {}) {
    const fx = camDirXZ.x, fz = camDirXZ.z;
    const groundY = ctx.heightAt(camOriginPos.x, camOriginPos.z);
    const leadDist = opts.leadDist ?? 0.56;
    const camHeight = opts.camHeight ?? 1.44;
    const from = new THREE.Vector3(camOriginPos.x + fx * leadDist, groundY + camHeight, camOriginPos.z + fz * leadDist);

    const boxes = subjectChars.map(characterWorldBox);
    const totalBox = new THREE.Box3();
    const corners = [];
    for (const b of boxes) {
      totalBox.union(b);
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        corners.push(new THREE.Vector3(x, y, z));
      }
    }
    const at = totalBox.getCenter(new THREE.Vector3());
    const aimDist = Math.max(1.0, at.distanceTo(from));
    const up = new THREE.Vector3(0, 1, 0);
    const F = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3(), rel = new THREE.Vector3();

    const measureExtents = () => {
      F.copy(at).sub(from).normalize();
      R.crossVectors(F, up).normalize();
      U.crossVectors(R, F).normalize();
      let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
      for (const c of corners) {
        rel.copy(c).sub(from);
        const z = Math.max(0.25, rel.dot(F));
        const sx = rel.dot(R) / z, sy = rel.dot(U) / z;
        if (sx < sx0) sx0 = sx;
        if (sx > sx1) sx1 = sx;
        if (sy < sy0) sy0 = sy;
        if (sy > sy1) sy1 = sy;
      }
      return { sx0, sx1, sy0, sy1 };
    };

    for (let iter = 0; iter < 5; iter++) {
      const { sx0, sx1, sy0, sy1 } = measureExtents();
      const dYaw = 0.5 * (Math.atan(sx0) + Math.atan(sx1));
      const dPitch = 0.5 * (Math.atan(sy0) + Math.atan(sy1));
      F.multiplyScalar(Math.cos(dYaw)).addScaledVector(R, Math.sin(dYaw)).addScaledVector(U, Math.sin(dPitch)).normalize();
      at.copy(from).addScaledVector(F, aimDist);
    }

    const { sx0, sx1, sy0, sy1 } = measureExtents();
    const halfY = Math.max(Math.abs(sy0), Math.abs(sy1));
    const halfX = Math.max(Math.abs(sx0), Math.abs(sx1));
    const isSolo = subjectChars.length === 1;
    const fillTarget = isSolo ? 0.70 : 0.74;
    const tanY = Math.max(halfY / fillTarget, halfX / (0.86 * aspect));
    const fovMin = opts.fovMin ?? 60;
    const fovMax = opts.fovMax ?? (subjectChars.length <= 2 ? 70 : 76);
    const fov = Math.max(fovMin, Math.min(fovMax, (2 * Math.atan(tanY) * 180) / Math.PI));

    return {
      from: { x: +from.x.toFixed(3), y: +from.y.toFixed(3), z: +from.z.toFixed(3) },
      at: { x: +at.x.toFixed(3), y: +at.y.toFixed(3), z: +at.z.toFixed(3) },
      fov: +fov.toFixed(2),
    };
  }

  // Take a picture from the dedicated perspective camera; hide non-subject characters and any flash or small dynamic props intersecting the cone.
  function snapPhoto(view, keep = [], photographer = null) {
    const fx = view.at.x - view.from.x, fy = view.at.y - view.from.y, fz = view.at.z - view.from.z;
    const L = Math.hypot(fx, fy, fz) || 1;
    const dx = fx / L, dy = fy / L, dz = fz / L;
    const Lxz = Math.hypot(fx, fz) || 1;
    const halfTanX = Math.tan(((view.fov || 64) * Math.PI) / 360) * (ctx.aspect?.() || 16 / 9);
    const hidden = [];

    if (flashM && flashM.visible) { flashM.visible = false; hidden.push(flashM); }
    const pg = photographer?.it?.character?.group;
    if (pg && pg.visible) { pg.visible = false; hidden.push(pg); }

    for (const b of brains) {
      if (keep.includes(b) || !b.it?.character) continue;
      const g = b.it.character.group, p = g.position;
      const u = ((p.x - view.from.x) * fx + (p.z - view.from.z) * fz) / Lxz;
      const side = Math.abs((p.x - view.from.x) * fz - (p.z - view.from.z) * fx) / Lxz;
      if (u > -0.6 && u < L + 1.2 && side < Math.max(1.0, u * halfTanX + 0.85) && g.visible) {
        g.visible = false;
        hidden.push(g);
      }
    }
    for (const w of ctx.world?.walkers || []) {
      const g = w.ch?.group;
      if (!g || !g.visible) continue;
      const p = g.position;
      const u = ((p.x - view.from.x) * fx + (p.z - view.from.z) * fz) / Lxz;
      const side = Math.abs((p.x - view.from.x) * fz - (p.z - view.from.z) * fx) / Lxz;
      if (u > -0.6 && u < L + 1.2 && side < Math.max(1.0, u * halfTanX + 0.85)) {
        g.visible = false;
        hidden.push(g);
      }
    }
    // Check only unmerged small dynamic props near the lens corridor (never merged ground slabs or buildings).
    const box = new THREE.Box3(), sz = new THREE.Vector3();
    for (const obj of ctx.world?.root?.children || []) {
      if (!obj.visible || obj.userData?.isBeacon || (!obj.userData?.dynamic && !obj.material?.map)) continue;
      if (obj === pg || obj.userData?.interactable) continue;
      const p = obj.position;
      if (!p) continue;
      const u = (p.x - view.from.x) * dx + (p.y - view.from.y) * dy + (p.z - view.from.z) * dz;
      const side = Math.abs((p.x - view.from.x) * fz - (p.z - view.from.z) * fx) / Lxz;
      if (u > 0.08 && u < L - 0.85 && side < 0.7) {
        box.setFromObject(obj);
        box.getSize(sz);
        if (sz.y > 0.35 && Math.max(sz.x, sz.z) < 3.0) {
          obj.visible = false;
          hidden.push(obj);
        }
      }
    }
    const url = ctx.capture(view);
    for (const g of hidden) g.visible = true;
    return url;
  }
  function savePhoto(url, label) {
    const key = 'nathan-exe:tahiti-photos';           // this device only, never uploaded
    let list = []; try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch { /* ignore */ }
    if (url) { list.unshift({ url, at: Date.now(), gang: label }); list = list.slice(0, 8); try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* full: keep what we have */ } }
  }

  function cancelSession(silent = false) {
    if (!session) return;
    session.cam.photoWalk = false; session.cam.bypassT = 0;
    for (const s of session.crewSlots) { s.b.photoWalk = false; s.b.bypassT = 0; }
    resume([session.cam, ...session.crewSlots.map((s) => s.b)]);
    if (state.joined?.photo) { state.joined = null; player.pose = null; }
    state.path = [];
    state.photoPath = false;
    session = null;
    if (!silent) ctx.toast('Photography session cancelled.');
  }

  function startShabeshSession(opts = {}) {
    if (session || photo) return false;
    const sh = brainOf('tahiti_cf2');
    const sa = brainOf('tahiti_cf7');
    const cam = opts.photographer === 'sathesh' ? (sa || sh) : (sh || sa);
    if (!cam) { ctx.toast('Shabesh is out right now. Try again in a moment.'); return false; }

    const wsHome = cam.id === 'tahiti_cf2' ? WORKSTATION_SH : WORKSTATION_SA;
    const camPos = cam.it.character.group.position;
    const atWorkstation = dist(camPos, wsHome) <= 0.65;
    const ws = atWorkstation ? { x: camPos.x, z: camPos.z } : { x: wsHome.x, z: wsHome.z };

    const isGroup = opts.mode === 'group' || (opts.crewCount || 0) > 0 || (opts.crewIds?.length || 0) > 0;
    let crew = [];
    if (isGroup) {
      if (opts.crewIds?.length) {
        crew = opts.crewIds.map((id) => brainOf(id)).filter((b) => b && b !== cam && !b.riding);
      } else {
        crew = brains.filter((b) => b.group === 'ol' && b !== cam && !b.riding && !(b.id === 'harris' && pilotBusy(b)));
        for (const [id, at] of [['tahiti_cf1', 0], ['tahiti_cf7', 1]]) {
          const idx = crew.findIndex((b) => b.id === id);
          if (idx >= 0 && crew.length > at) { const [item] = crew.splice(idx, 1); crew.splice(at, 0, item); }
        }
        if (typeof opts.crewCount === 'number') crew = crew.slice(0, Math.max(0, opts.crewCount));
      }
    }

    const area = findPosingArea(ws, 1 + crew.length, { preferAngle: opts.preferAngle });
    const nathanSlot = area.slots[area.nathanIndex];
    const otherSlots = orderedOtherSlots(area.slots, area.nathanIndex);
    const wsHeading = Math.atan2(area.fx, area.fz);

    release(cam); cam.forced = true; cam.vball = false;
    if (atWorkstation) {
      cam.path = [];
      cam.mode = 'photo-cam';
      cam.photoWalk = false; cam.bypassT = 0;
      cam.it.character.pose = 'aim';
    } else {
      cam.photoWalk = true; cam.bypassT = 0;
      goTo(cam, ws.x, ws.z, () => {
        cam.photoWalk = false; cam.bypassT = 0;
        cam.mode = 'photo-cam';
        cam.it.character.pose = 'aim';
      }, true);
    }

    const crewSlots = crew.map((b, i) => {
      const sl = otherSlots[i % otherSlots.length];
      b.photoWalk = true; b.bypassT = 0;
      const item = { b, x: sl.x, z: sl.z, arrived: false };
      rushTo(b, sl.x, sl.z, () => {
        b.photoWalk = false; b.bypassT = 0;
        b.mode = 'photo-pose';
        b.it.character.pose = 'photo';
        item.arrived = true;
      });
      return item;
    });

    state.joined = null; ctx.clearMarker?.();
    if (dist(P(), nathanSlot) < 0.25) {
      state.path = [];
    } else {
      const nathanPath = ctx.nav.findPath(P().x, P().z, nathanSlot.x, nathanSlot.z);
      state.path = nathanPath.length ? nathanPath : [{ x: nathanSlot.x, z: nathanSlot.z }];
    }
    state.photoPath = state.path.length > 0;

    const camName = def(cam.id).name || 'Shabesh';
    session = {
      mode: isGroup ? 'group' : 'pose',
      cam, ws, camStart: { x: camPos.x, z: camPos.z },
      camArrived: atWorkstation, wsHeading, area,
      nathanSlot, nathanArrived: false, curFace: player.heading,
      crewSlots, t: 0, phase: 'gather', count: 0, lastCount: 0,
      shot: false, fast: !!opts.fast, doneT: 0, view: null, refreshMark: 0,
      label: isGroup ? `${GANG_NAME.ol} · Portrait by ${camName}` : `Portrait by ${camName}`,
    };

    bubble(cam.it, isGroup ? 'Outlaws, assemble in front of my lens!' : 'Step over to your mark, Nathan. Hold right there!', 2.6);
    ctx.toast(isGroup ? 'Everyone assemble in front of Shabesh.' : 'Walk to your posing mark in front of Shabesh.');
    return true;
  }

  function sessionTick(dt) {
    const s = session;
    s.t += dt;
    const { cam, ws, wsHeading, area, nathanSlot } = s;
    const camCh = cam.it.character, camGp = camCh.group.position;

    if (cam.mode === 'photo-cam') {
      s.camArrived = true;
      camGp.x += (ws.x - camGp.x) * Math.min(1, dt * 10);
      camGp.z += (ws.z - camGp.z) * Math.min(1, dt * 10);
      camCh.heading += angDiff(camCh.heading, wsHeading) * Math.min(1, dt * 10);
      camCh.pose = 'aim';
    }

    if (s.phase === 'gather') {
      if (!s.nathanArrived) {
        if (dist(P(), nathanSlot) < 0.35 && !state.path.length) {
          s.nathanArrived = true;
          state.photoPath = false;
          s.curFace = player.heading;
          state.joined = { x: nathanSlot.x, z: nathanSlot.z, pose: 'photo', face: s.curFace, swim: false, photo: true };
        } else if (state.path.length) {
          const last = state.path[state.path.length - 1];
          if (dist(last, nathanSlot) > 0.6) { cancelSession(); return; }
        } else if (s.t > 0.15) {
          cancelSession(); return;
        }
      } else {
        if (!state.joined?.photo) { cancelSession(true); return; }
        s.curFace += angDiff(s.curFace, area.face) * Math.min(1, dt * 10);
        state.joined.face = s.curFace;
      }

      const step = Math.floor(s.t / 5);
      if (step > s.refreshMark) {
        s.refreshMark = step;
        if (!s.camArrived && dist(camGp, ws) >= 0.3) {
          cam.bypassT = 1.2;
          goTo(cam, ws.x, ws.z, () => { cam.photoWalk = false; cam.bypassT = 0; cam.mode = 'photo-cam'; camCh.pose = 'aim'; }, true);
        }
        for (const item of s.crewSlots) {
          if (!item.arrived && dist(item.b.it.character.group.position, item) >= 0.3) {
            item.b.bypassT = 1.2;
            rushTo(item.b, item.x, item.z, () => {
              item.b.photoWalk = false; item.b.bypassT = 0;
              item.b.mode = 'photo-pose'; item.b.it.character.pose = 'photo';
              item.arrived = true;
            });
          }
        }
      }

      for (const item of s.crewSlots) {
        if (!item.arrived) continue;
        const ch = item.b.it.character, gp = ch.group.position;
        gp.x += (item.x - gp.x) * Math.min(1, dt * 10);
        gp.z += (item.z - gp.z) * Math.min(1, dt * 10);
        ch.heading += angDiff(ch.heading, area.face) * Math.min(1, dt * 10);
        ch.pose = 'photo';
      }

      const camReady = s.camArrived && camCh.pose === 'aim' && camCh.speed < 0.08 && (camCh.poseW || 0) > 0.90 && Math.abs(angDiff(camCh.group.rotation.y, wsHeading)) < 0.08;
      const nReady = s.nathanArrived && player.pose === 'photo' && player.speed < 0.08 && (player.poseW || 0) > 0.92 && Math.abs(angDiff(player.group.rotation.y, area.face)) < 0.08;
      const crewReady = s.crewSlots.every((item) => {
        if (!item.arrived) return false;
        const ch = item.b.it.character;
        return dist(ch.group.position, item) < 0.45 && ch.pose === 'photo' && ch.speed < 0.08 && (ch.poseW || 0) > 0.92 && Math.abs(angDiff(ch.group.rotation.y, area.face)) < 0.08;
      });

      if (camReady && nReady && crewReady) {
        s.phase = 'countdown';
        s.count = s.fast ? 0.25 : 2.6;
        s.lastCount = Math.ceil(s.count) + 1;
        bubble(cam.it, 'Say cheese!', 2.2);
      }
    } else if (s.phase === 'countdown') {
      if (!state.joined?.photo) { cancelSession(true); return; }
      state.joined.face = area.face;
      camCh.heading = wsHeading; camCh.pose = 'aim';
      for (const item of s.crewSlots) { item.b.it.character.heading = area.face; item.b.it.character.pose = 'photo'; }

      s.count -= dt;
      const shown = Math.ceil(s.count);
      if (shown !== s.lastCount && shown > 0 && shown <= 3 && !s.fast) {
        s.lastCount = shown;
        ctx.flash(String(shown));
        ctx.sfx.open();
      }
      if (s.count <= 0 && !s.shot) {
        s.shot = true;
        const subjChars = [player, ...s.crewSlots.map((item) => item.b.it.character)];
        const view = computePhotoView(ws, { x: area.fx, z: area.fz }, subjChars, ctx.aspect?.() || 16 / 9);
        s.view = view;
        const url = snapPhoto(view, s.crewSlots.map((item) => item.b), cam);
        camFlash(camCh.group.position, camCh.heading);
        ctx.flash('', true);
        ctx.sfx.memory();
        savePhoto(url, s.label);
        lastPhotoInfo = {
          mode: s.mode,
          url,
          view,
          camStart: s.camStart,
          camEnd: { x: +camGp.x.toFixed(3), z: +camGp.z.toFixed(3) },
          ws: { ...ws },
          nathanPos: { x: +P().x.toFixed(3), y: +P().y.toFixed(3), z: +P().z.toFixed(3) },
          nathanHeading: +player.heading.toFixed(3),
          nathanPose: player.pose,
          nathanPoseW: +(player.poseW || 0).toFixed(3),
          nathanSpeed: +player.speed.toFixed(3),
          camPose: camCh.pose,
          camPoseW: +(camCh.poseW || 0).toFixed(3),
          area,
          subjectBoxes: subjChars.map(characterWorldBox),
          subjectCount: subjChars.length,
        };
        s.phase = 'done';
        s.doneT = 0;
      }
    } else if (s.phase === 'done') {
      s.doneT += dt;
      if (s.doneT >= (s.fast ? 0.05 : 1.0)) {
        cam.photoWalk = false;
        for (const item of s.crewSlots) item.b.photoWalk = false;
        resume([cam, ...s.crewSlots.map((item) => item.b)]);
        state.joined = null;
        player.pose = null;
        session = null;
        ctx.toast('Saved to the Tahiti photo album (this device only).');
        ctx.openGallery();
      }
    }
  }

  function photoSession() {
    const sh = brainOf('tahiti_cf2');
    const sa = brainOf('tahiti_cf7');
    const ep = epoch;

    ctx.choose('Photography session', [
      { label: 'Pose for a photograph (Shabesh takes your picture)', value: 'pose' },
      { label: 'Join the photo session', value: 'join' },
      { label: 'Take a group picture', value: 'group' },
      { label: 'Exit', value: null },
    ], (v) => {
      if (ep !== epoch) return;
      if (v === 'join') {
        const spot = { x: P().x, z: P().z };
        state.joined = { x: spot.x, z: spot.z, pose: 'film', face: player.heading, swim: false };
        state.path = [];
        if (sh) bubble(sh.it, 'Grab a lens, Nathan.', 2.4);
        if (sa) setTimeout(() => { if (ep === epoch) bubble(sa.it, 'Welcome to the camera club!', 2.6); }, 1200);
        ctx.toast('Shooting with Shabesh and Sathesh. Move to leave.');
      } else if (v === 'pose') {
        startShabeshSession({ mode: 'pose' });
      } else if (v === 'group') {
        startShabeshSession({ mode: 'group' });
      }
    });
  }
  function anuHoop() {
    const anu = brainOf('tahiti_cf1');
    ctx.choose('Play basketball', [
      { label: 'Practice shooting', value: 'practice' },
      ...(anu ? [{ label: 'Shooting challenge with Anu', value: 'anu' }] : []),
      { label: 'Exit', value: null },
    ], (v) => {
      if (v === 'practice') startShootout({ crew: [], rounds: 5, msg: 'Practice: five shots. Walk onto the ring, Space in the green.' });
      else if (v === 'anu' && anu) { bubble(anu.it, 'You and me. Five each.', 2.4); startShootout({ crew: [anu], rounds: 5, msg: 'Shooting challenge vs Anu: take turns, five shots each.' }); }
    });
  }
  // Thianish's food challenge: a timing game, not a mash-fest. Hit Space while
  // the marker is over the plate; Thianish eats at his own (cartoon) pace.
  function feastChallenge() {
    const th = brainOf('tahiti_cf4');
    if (!th) { foodChallenge(); return; }
    const ROUND = 10, ep = epoch;
    state.joined = { x: 18.6, z: -14.05, pose: 'eat', face: 0, swim: false }; state.path = [];
    bring(th, 18.6, -12.35, 'eat', 180);
    bubble(th.it, rand(['You sure about this?', 'I was born for this.', 'Pull up a chair.']), 2.6);
    ctx.minigame(`<h2>Food challenge vs Thianish</h2><p class="muted">Press SPACE (or tap BITE) when the marker is over the plate. Ten seconds.</p>
      <div class="feast-bar" style="position:relative;height:22px;background:#2a2440;border:2px solid #fff6e6;margin:10px 0;image-rendering:pixelated"><i id="feast-zone" style="position:absolute;top:0;bottom:0;background:#6fbf4a"></i><b id="feast-mark" style="position:absolute;top:-4px;bottom:-4px;width:6px;background:#ffd257"></b></div>
      <p class="food-count">You <span id="feast-you">0</span> · <span id="feast-th">0</span> Thianish</p>
      <button type="button" class="btn primary" id="feast-bite">BITE!</button><p id="feast-msg">Get ready…</p>`, (root, close) => {
      const $ = (s) => root.querySelector(s);
      let t = -3, you = 0, them = 0, zone = 0.4, zw = 0.22, cool = 0, nextNpc = 1, done = false, last = performance.now(), raf = 0, count = 4;
      const setZone = () => { zone = 0.05 + Math.random() * (0.9 - zw); $('#feast-zone').style.left = `${zone * 100}%`; $('#feast-zone').style.width = `${zw * 100}%`; };
      setZone();
      const mark = () => (Math.sin(Math.max(0, t) * 3.1) + 1) / 2;
      const bite = () => {
        if (done || t < 0 || cool > 0) return;
        const m = mark();
        if (m >= zone && m <= zone + zw) { you++; ctx.sfx.rep?.(); player.play?.('tap'); $('#feast-you').textContent = you; $('#feast-msg').textContent = rand(['Nom!', 'Crunch!', 'Delicious!']); zw = Math.max(0.12, zw - 0.008); setZone(); }
        else { ctx.sfx.miss?.(); cool = 0.45; $('#feast-msg').textContent = rand(['Missed the plate!', 'Too early!', 'Chew slower!']); }
      };
      $('#feast-bite').addEventListener('click', bite);
      root.onkey = (k) => { if (k === ' ' || k === 'e' || k === 'Enter') bite(); };
      const loop = (now) => {
        if (ep !== epoch) return;
        const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt; cool -= dt;
        if (t < 0) { const c = Math.ceil(-t); if (c !== count) { count = c; $('#feast-msg').textContent = String(c); ctx.sfx.open?.(); } }
        else if (!done) {
          if (count) { count = 0; $('#feast-msg').textContent = 'EAT!'; }
          nextNpc -= dt;
          if (nextNpc <= 0) { nextNpc = 0.75 + Math.random() * 0.6; if (Math.random() < 0.82) { them++; $('#feast-th').textContent = them; th.it.character.play?.('tap'); } }
          if (t >= ROUND) {
            done = true;
            const win = you > them, tie = you === them;
            $('#feast-msg').textContent = win ? 'You win! Snack champion.' : tie ? 'A tie! Shared dessert.' : 'Thianish wins. The legend lives on.';
            bubble(th.it, win ? rand(['I let you win.', 'Rematch after a nap.']) : tie ? 'Respect.' : rand(['Never challenge me at food.', 'Seconds, anyone?']), 3);
            setTimeout(() => { if (ep === epoch) close(); }, 1900);
          }
        }
        $('#feast-mark').style.left = `calc(${(mark() * 100).toFixed(1)}% - 3px)`;
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => { cancelAnimationFrame(raf); state.joined = null; player.pose = null; resume([th]); };
    });
  }
  // Akshay's TV: Nathan sits down and plays PIXEL DEFENDERS (an original tiny arcade shooter) with him
  function tvGame() {
    const ak = brainOf('tahiti_cf5');
    const tv = ctx.world.apis.tv_corner;
    state.joined = { x: 9.0, z: 4.15, pose: 'sittype', face: Math.PI, swim: false }; state.path = [];
    if (ak) {
      const ap = ak.it.character.group.position; ap.x = 7.8; ap.z = 4.15;   // already on his seat: no walk while the game runs
      bring(ak, 7.8, 4.15, 'sittype', 180); bubble(ak.it, 'Player two has entered the game!', 2.6); }
    tv?.setBusy?.(true);
    ctx.minigame(`<h2>PIXEL DEFENDERS</h2><p class="muted">← → (or A / D) move · SPACE fire · Akshay plays the orange ship. 60 seconds, 3 lives.</p>
      <canvas id="pd" width="240" height="180" style="width:100%;max-width:480px;aspect-ratio:4/3;image-rendering:pixelated;background:#0d0f24;display:block;margin:0 auto;border:2px solid #fff6e6"></canvas>
      <div class="dance-pad pd-pad"><button type="button" data-pd="left">◀</button><button type="button" data-pd="fire">FIRE</button><button type="button" data-pd="right">▶</button></div>`, (root, close) => {
      const cv = root.querySelector('#pd'), g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      const W = 240, H = 180, keys = { left: false, right: false, fire: false };
      const me = { x: 100, cd: 0, inv: 0 }, mate = { x: 140, cd: 0 };
      let shots = [], bombs = [], foes = [], dir = 1, speed = 14, wave = 0, score = 0, akScore = 0, lives = 3, time = 60, over = false, raf = 0, last = performance.now(), endT = 0;
      const ALIEN = ['..X..X..', '...XX...', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', '.X....X.'];
      const SHIP = ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX'];
      const sprite = (rows, x, y, c) => { g.fillStyle = c; rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === 'X') g.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1); }); };
      const spawn = () => { wave++; speed = 12 + wave * 4; foes = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) foes.push({ x: 30 + c * 24, y: 16 + r * 14, c: ['#ff8fb1', '#9fe6f2', '#b5e48c'][r] }); };
      spawn();
      const fire = (who, isMe) => { if (who.cd > 0) return; who.cd = isMe ? 0.28 : 0.5; shots.push({ x: who.x + 3, y: 160, me: isMe }); if (isMe) ctx.sfx.step?.(); };
      const kd = (e) => { const k = e.key.toLowerCase(); if (k === 'arrowleft' || k === 'a') keys.left = true; else if (k === 'arrowright' || k === 'd') keys.right = true; else if (k === ' ') keys.fire = true; };
      const ku = (e) => { const k = e.key.toLowerCase(); if (k === 'arrowleft' || k === 'a') keys.left = false; else if (k === 'arrowright' || k === 'd') keys.right = false; else if (k === ' ') keys.fire = false; };
      addEventListener('keydown', kd); addEventListener('keyup', ku);
      root.onkey = (k) => { if (over && (k === ' ' || k === 'Enter' || k === 'e') && performance.now() > endT) close(); };
      root.querySelectorAll('[data-pd]').forEach((b) => {
        const k = b.dataset.pd;
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (over) { if (performance.now() > endT) close(); return; } keys[k] = true; });
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { keys[k] = false; });
      });
      const loop = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (!over) {
          time -= dt; me.cd -= dt; mate.cd -= dt; me.inv -= dt;
          if (keys.left) me.x -= 90 * dt; if (keys.right) me.x += 90 * dt; me.x = Math.max(2, Math.min(W - 9, me.x));
          if (keys.fire) fire(me, true);
          // Akshay: line up under the lowest invader near him and fire
          const tgt = foes.slice().sort((a, b) => (b.y - a.y) || (Math.abs(a.x - mate.x) - Math.abs(b.x - mate.x)))[0];
          if (tgt) { const dx = tgt.x + 1 - mate.x; mate.x += Math.sign(dx) * Math.min(Math.abs(dx), 60 * dt); if (Math.abs(dx) < 5) fire(mate, false); }
          mate.x = Math.max(2, Math.min(W - 9, mate.x));
          // invaders march, step down at the edges, drop bombs
          let edge = false;
          for (const f of foes) { f.x += dir * speed * dt; if (f.x < 4 || f.x > W - 12) edge = true; }
          if (edge) { dir *= -1; for (const f of foes) f.y += 6; }
          if (foes.length && Math.random() < dt * (0.9 + wave * 0.3)) { const f = foes[Math.floor(Math.random() * foes.length)]; bombs.push({ x: f.x + 4, y: f.y + 6 }); }
          for (const s of shots) s.y -= 170 * dt;
          for (const b of bombs) b.y += 70 * dt;
          for (const s of shots) for (const f of foes) if (!s.hit && !f.dead && s.x >= f.x && s.x <= f.x + 8 && s.y >= f.y && s.y <= f.y + 6) { s.hit = f.dead = true; if (s.me) score += 10; else akScore += 10; ctx.sfx.rep?.(); }
          for (const b of bombs) if (!b.hit && me.inv <= 0 && b.y >= 160 && b.y <= 166 && b.x >= me.x && b.x <= me.x + 7) { b.hit = true; lives--; me.inv = 1.2; ctx.sfx.miss?.(); }
          for (const f of foes) if (!f.dead && f.y > 150) { f.dead = true; lives--; ctx.sfx.miss?.(); }
          shots = shots.filter((s) => !s.hit && s.y > 0); bombs = bombs.filter((b) => !b.hit && b.y < H); foes = foes.filter((f) => !f.dead);
          if (!foes.length) { spawn(); if (ak) bubble(ak.it, rand(['Next wave!', 'Clean sweep!']), 1.6); }
          if (time <= 0 || lives <= 0) {
            over = true; endT = performance.now() + 900;
            const total = score + akScore;
            if (ak) bubble(ak.it, lives > 0 ? rand(['We held the line!', 'Team high score!']) : rand(['They got us. Again!', 'One more round later.']), 3);
            ctx.toast(`PIXEL DEFENDERS: you ${score}, Akshay ${akScore} · team ${total}`);
          }
        }
        // draw
        g.fillStyle = '#0d0f24'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#2a2f5a'; for (let i = 0; i < 24; i++) g.fillRect((i * 53) % W, (i * 37 + Math.floor(now / 60)) % H, 1, 1);
        for (const f of foes) sprite(ALIEN, f.x, f.y, f.c);
        g.fillStyle = '#fff6e6'; for (const s of shots) g.fillRect(Math.round(s.x), Math.round(s.y), 1, 4);
        g.fillStyle = '#ff6a3d'; for (const b of bombs) g.fillRect(Math.round(b.x), Math.round(b.y), 2, 3);
        if (me.inv <= 0 || Math.floor(now / 100) % 2) sprite(SHIP, me.x, 162, '#9fe6f2');
        sprite(SHIP, mate.x, 162, '#ffb347');
        g.fillStyle = '#fff6e6'; g.font = '8px monospace'; g.textBaseline = 'top';
        g.fillText(`YOU ${score}`, 4, 3); g.fillText(`AKSHAY ${akScore}`, 84, 3); g.fillText(`${'♥'.repeat(Math.max(0, lives))} ${Math.max(0, Math.ceil(time))}s`, 180, 3);
        if (over) { g.fillStyle = 'rgba(13,15,36,.8)'; g.fillRect(30, 62, 180, 56); g.fillStyle = '#ffd257'; g.textAlign = 'center'; g.fillText(lives > 0 ? 'TIME! WELL DEFENDED' : 'GAME OVER', W / 2, 70); g.fillStyle = '#fff6e6'; g.fillText(`TEAM SCORE ${score + akScore}`, W / 2, 86); g.fillText('SPACE / TAP TO EXIT', W / 2, 102); g.textAlign = 'left'; }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => { cancelAnimationFrame(raf); removeEventListener('keydown', kd); removeEventListener('keyup', ku); tv?.setBusy?.(false); state.joined = null; player.pose = null; if (ak) resume([ak]); };
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
      if (ready === c.players.length) { c.phase = 'serve'; c.wait = 6; c.server = c.players[0]; ctx.toast('Everyone\'s in. Press Space to serve!'); }
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
      if (c.wait <= 0) { c.phase = 'serve'; c.server = rand(sides[c.serveSide]); c.wait = c.match && c.server.nathan ? 6 : 1.0; }
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
      const bgY = ctx.heightAt(B.x, B.z);
      ball.visible = shadow.visible = true;
      ball.position.set(B.x, B.y + bgY, B.z); ball.rotation.x += dt * 6; ball.rotation.z += dt * 4;
      shadow.position.set(B.x, bgY + 0.03, B.z);
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
        const ep = epoch;
        ctx.toast(scorer === 0 ? `Your team wins ${c.score[0]}–${c.score[1]}!` : `${teamName(c, 1)} wins ${c.score[1]}–${c.score[0]}.`);
        setTimeout(() => { if (ep === epoch) endMatch(); }, 1800); c.phase = 'over';
      }
    }
  }
  function startMatch(g) {
    if (state.volley) return;
    const c = courts[g]; if (!c) return;
    let crew = brains.filter((b) => b.group === g && b.id !== 'harris' && !b.riding).sort((a, b) => dist(a.it.character.group.position, COURT[g].c) - dist(b.it.character.group.position, COURT[g].c)).slice(0, 3);   // 2 v 2: Nathan + 1 against 2
    if (crew.length < 2) return;
    const teamA = [], teamB = [];
    const byId = (id) => brains.find((b) => b.id === id && !b.riding);
    const lo = byId('tahiti_cf3'), pr = byId('tahiti_cf6');
    if (g === 'ol' && lo && pr) {
      // Logesh + Pranav on one side; Nathan's teammate is the first Outlaw who isn't busy elsewhere
      const busy = (b) => b.forced || (b.mode === 'stay' && b.act && isHome('ol', b.act, b.id) && b.act !== 'volley');
      const third = ['tahiti_cf8', 'tahiti_cf9', 'tahiti_cf1', 'tahiti_cf2', 'tahiti_cf7', 'tahiti_cf4', 'tahiti_cf5'].map(byId).find((b) => b && !busy(b))
        || ['tahiti_cf8', 'tahiti_cf9'].map(byId).find(Boolean);
      if (third) { teamA.push(third); teamB.push(lo, pr); }
    }
    if (!teamB.length) {
      // Anu and Shabesh always end up on opposite teams
      for (const b of crew) {
        if (b.id === 'tahiti_cf1') teamA.push(b); else if (b.id === 'tahiti_cf2') teamB.push(b);
      }
      for (const b of crew) if (!teamA.includes(b) && !teamB.includes(b)) (teamA.length < 1 && teamA.length + 1 <= teamB.length ? teamA : teamB.length < 2 ? teamB : teamA).push(b);
      while (teamA.length > 1) teamA.pop(); while (teamB.length > 2) teamB.pop();
    }
    const homes = (n, s) => { const sg = s ? 1 : -1, rows = [[3.4, -1.9], [3.4, 1.9], [1.8, 0], [4.6, 0]]; return Array.from({ length: n }, (_, i) => cpt(g, sg * rows[i % 4][0], rows[i % 4][1])); };
    const hA = homes(teamA.length + 1, 0), hB = homes(teamB.length, 1);
    c.players = [{ nathan: true, side: 0, home: hA[0] }, ...teamA.map((b, i) => ({ b, side: 0, home: hA[i + 1] })), ...teamB.map((b, i) => ({ b, side: 1, home: hB[i] }))];
    // everyone walks over first (nav paths); the first serve waits until all are in position
    for (const p of c.players) if (p.b) { p.skill = 1; const b = p.b; rushTo(b, p.home.x, p.home.z, () => { b.mode = 'vb'; b.vball = true; bubble(b.it, rand(['I\'m in!', 'Let\'s go!', 'Ready!']), 1.6); }); }
    state.joined = null; state.path = [];
    const h = hA[0]; P().set(h.x, ctx.heightAt(h.x, h.z), h.z); player.heading = (cface(g, 0) * Math.PI) / 180;
    c.match = true; c.score = [0, 0]; c.phase = 'gather'; c.gatherT = 0; c.serveSide = 0; c.server = c.players[0];
    state.volley = c;
    ctx.toast(`Beach volleyball! Waiting for both teams to take the court. First to ${WIN}.`);
  }
  function endMatch(silent) {
    const c = state.volley; if (!c) return;
    const crew = c.players.filter((p) => p.b).map((p) => p.b); crew.forEach((b) => { b.vball = false; }); resume(crew);
    c.match = false; c.players = []; c.phase = 'idle'; state.volley = null;
    hideBall(); hud?.classList.add('hidden');
    if (!silent) player.pose = null;
  }
  function spikeTry() {
    const c = state.volley; if (!c) return true;
    if (c.phase === 'serve' && c.server?.nathan) { c.wait = 0; return true; }
    if (c.phase !== 'fly') return true;
    const me = c.players.find((p) => p.nathan), B = c.ball, p = P();
    if (c.last !== me.side && local(c.g, B.x, B.z).a < 0.3 && Math.hypot(B.x - p.x, B.z - p.z) < 1.6 && B.y < 3.0 && B.y > 0.6) { c.checked = true; hit(c, me, true); }
    else player.jump?.();
    return true;
  }
  function drawHud(c) {
    if (!hud) { hud = document.createElement('div'); hud.className = 'volley-hud'; document.body.append(hud); }
    hud.classList.remove('hidden');
    const waiting = c.phase === 'serve' && c.server?.nathan ? 'Your serve · Space to serve' : c.phase === 'gather' ? `Waiting for players ${c.players.filter((p) => p.nathan || p.b.vball).length}/${c.players.length}` : 'Get under the ball · Space to spike · walk away to quit';
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
    r.userData.isBeacon = true;
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

  function startShootout(opts = {}) {
    if (state.hoop || state.volley) return;
    const crew = opts.crew || brains.filter((b) => b.group === 'ol' && !b.riding && !b.vball && dist(b.it.character.group.position, RIM) < 30).sort((a, b) => dist(a.it.character.group.position, RIM) - dist(b.it.character.group.position, RIM)).slice(0, 3);
    const players = [{ nathan: true, name: 'Nathan', score: 0 }, ...crew.map((b, i) => ({ b, name: def(b.id).name, score: 0, side: SIDELINE[i] }))];
    for (const p of players) if (p.b) { const b = p.b; rushTo(b, p.side.x, p.side.z, () => { b.mode = 'bb'; p.ready = true; faceRimB(b); }); }
    bb.q = []; bb.cur = null; bb.busy = false; bb.hold = null;
    state.joined = null; state.path = [];
    state.hoop = { players, turn: 0, round: 0, rounds: opts.rounds || 3, phase: 'gather', t: 0, meter: 0, shooting: false };
    ctx.toast(opts.msg || 'Shootout! One shooter at a time, three rounds. Waiting for everyone...');
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
    if (s.round >= s.rounds) {
      const ep = epoch;
      const best = Math.max(...s.players.map((p) => p.score)), winners = s.players.filter((p) => p.score === best);
      ctx.toast(s.players.length === 1 ? `Practice done: ${best}/${s.rounds} baskets.` : winners.length > 1 ? `Tie at ${best}! ${winners.map((w) => w.name).join(' & ')}` : `${winners[0].name} wins the shootout with ${best}!`);
      if (winners.some((w) => w.nathan)) player.play('flex');
      setTimeout(() => { if (ep === epoch) endShootout(); }, 1500); s.phase = 'over'; return;
    }
    s.phase = 'next';
  }
  function endShootout(silent) {
    const s = state.hoop; if (!s) return;
    resume(s.players.filter((p) => p.b).map((p) => p.b));
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
    const html = `<div class="hoop-board">${s.players.map((p, i) => `<span class="${i === s.turn && s.phase !== 'over' ? 'on' : ''}">${esc(p.name)} ${p.score}</span>`).join('')}</div><small>Round ${Math.min(s.rounds, s.round + 1)}/${s.rounds} · ${msg}</small>${meter}`;
    if (hud.dataset.t !== html) { hud.innerHTML = html; hud.dataset.t = html; }
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  return api;
}
