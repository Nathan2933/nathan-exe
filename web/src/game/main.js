import * as THREE from 'three';
import { RetroRenderer } from './retro.js';
import { applyPalette, SKY } from './palette.js';
import { setGlowBoost } from './kit.js';
import { sfx, setSound, setRain, setMusic, setTheme, setOcean, setEngine } from './audio.js';
import { createTahiti } from './tahiti.js';
import { buildWorld, loadKitOverrides, updateWalkers, updateNpcs, groundHeight } from './world.js';
import { loadTiledMap, tileAt } from './tiled.js';
import { NavGrid } from './nav.js';
import { Player } from './player.js';
import { drawPortrait, portraitURL } from './portrait.js';
import { Dialogue } from './dialogue.js';
import { runLift } from './minigame.js';
import { loadSave, writeSave, resetSave, addUnique, formatTime } from './save.js';
import { loadContent, esc, safeUrl, chapterFor, projectCard, projectDetails, DISTRICTS, MAIN_DISTRICTS } from '../shared/content.js';

const $ = (s) => document.querySelector(s);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = matchMedia('(pointer: coarse)').matches;
const BASE = import.meta.env.BASE_URL || '/';
const DEBUG = new URLSearchParams(location.search).has('debug');

const state = {
  content: null,
  save: loadSave(),
  path: [],
  pendingOpen: null,
  nearby: null,
  panelOpen: null,
  talkingTo: null,
  minigame: null,
  complete: false,
  started: false,
  zoom: 1,
  intro: 0,
};
// Back-compat view used by world animations
Object.defineProperty(state, 'visited', { get: () => new Set(state.save.chapters) });

// ---------------- Boot sequence ----------------
const bootLines = [
  'NATHAN-BIOS v1.1  (c) 2026',
  '',
  'Memory check ......... DISCIPLINE   OK',
  '                       RESILIENCE   OK',
  '                       CURIOSITY    OK',
  'Detecting drives ..... /russia  /india  /garage',
  'Loading save file .... ',
];
// Title screen: the real Nathan rig walks in front of the NATHAN logo, waves,
// pushes up his glasses and idles while PRESS START blinks. Timeline (s):
// 0-0.5 logo · 0.5-1.5 walk in · 1.5-2.2 wave · 2.2-2.8 prompt · then idle.
function bootHero() {
  const cv = $('#boot-hero');
  const noop = { stop() {}, skip() {}, confirm() {}, ready: Promise.resolve() };
  if (!cv) return noop;
  let r;
  try { r = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: true }); } catch { return noop; }
  r.setPixelRatio(1);
  const W = 300, H = 240; r.setSize(W, H, false);              // low-res, scaled up crisp by CSS
  r.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xfff4e0, 0x5a3a8a, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.8); key.position.set(2, 4, 3); sc.add(key);
  const CAM_Z = 6.2, CAM_Y = 1.4;
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 50); cam.position.set(0, CAM_Y, CAM_Z); cam.lookAt(0, 1.15, 0);
  const hero = new Player();
  sc.add(hero.group);
  const START_X = -2.9, WALK = [0.5, 1.5];
  let T = reducedMotion ? 2.8 : 0;                               // timeline clock
  let raf = 0, last = performance.now(), alive = true, waved = false, adjusted = false, nextFidget = 6;
  let dolly = -1;                                                // confirm camera push (0..1)
  const vel = new THREE.Vector3();
  let readyRes; const ready = new Promise((res) => (readyRes = res));
  // the prompt never waits on rendering (background tabs pause rAF)
  setTimeout(() => { if (readyRes) { readyRes(); readyRes = null; } }, reducedMotion ? 0 : 2200);
  $('#boot').classList.add('title-anim');
  if (reducedMotion || T >= 2.8) $('#boot').classList.add('title-skip');
  const tick = (now) => {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    T += dt;
    vel.set(0, 0, 0);
    const p = hero.group.position;
    if (T < WALK[0]) { p.x = START_X; hero.heading = Math.PI / 2; }
    else if (T < WALK[1]) {
      const k = (T - WALK[0]) / (WALK[1] - WALK[0]);
      p.x = START_X * (1 - k); hero.heading = Math.PI / 2;
      vel.x = -START_X / (WALK[1] - WALK[0]);
    } else {
      p.x = 0;
      // turn to face the camera
      hero.heading += Math.atan2(Math.sin(-hero.heading), Math.cos(-hero.heading)) * Math.min(1, dt * 9);
      if (!waved && T >= 1.5) { waved = true; if (!reducedMotion) hero.play('wave'); }
      if (T >= 2.2 && readyRes) { readyRes(); readyRes = null; }
      if (T > 3.0 && !hero.action && dolly < 0 && !reducedMotion) {
        nextFidget -= dt;
        if (nextFidget < 0) { hero.play(Math.random() < 0.65 ? 'glasses' : 'wave'); nextFidget = 7 + Math.random() * 6; }
      }
      if (!adjusted && T > 2.9 && !hero.action) { adjusted = true; if (!reducedMotion) hero.play('glasses'); }
      // subtle idle: weight shift + breathing
      if (!reducedMotion) { hero.group.rotation.z = Math.sin(T * 1.3) * 0.015; p.y = Math.sin(T * 2.1) * 0.006; }
    }
    if (dolly >= 0) {
      dolly = Math.min(1, dolly + dt / 0.6);
      const e = 1 - (1 - dolly) * (1 - dolly);
      cam.position.set(0, CAM_Y - 0.1 * e, CAM_Z - 1.4 * e); cam.lookAt(0, 1.15, 0);
    }
    hero.update(dt, vel, now / 1000);
    r.render(sc, cam);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return {
    ready,
    // jump the intro straight to the idle loop (input during the opening)
    skip() { if (T < 2.8) { T = 2.8; waved = true; hero.action = null; hero.heading = 0; hero.group.position.x = 0; $('#boot').classList.add('title-skip'); if (readyRes) { readyRes(); readyRes = null; } } },
    confirm() { this.skip(); hero.play('cheer'); if (!reducedMotion) dolly = 0; },
    stop() { alive = false; cancelAnimationFrame(raf); r.dispose(); },
  };
}
let stopBootHero = () => {};

async function runBoot(loaded) {
  const title = bootHero();
  stopBootHero = () => title.stop();
  $('#boot-text').textContent = '';
  void bootLines;
  const btn = $('#boot-start');
  let isLoaded = false, armed = false, chosen = false;
  const onKey = (e) => {
    if (e.target.closest?.('a')) return;                            // Enter on "Skip to portfolio" follows the link
    if (e.key !== 'Enter' && e.key !== ' ') { if (!e.repeat && e.key.length === 1) title.skip(); return; }
    e.preventDefault(); press();
  };
  const onClick = (e) => { if (e.target.closest('a')) return; press(); };
  function press() {
    if (chosen) return;
    if (!armed) { title.skip(); return; }                          // still opening: skip ahead safely
    chosen = true;
    window.removeEventListener('keydown', onKey);
    $('#boot').removeEventListener('click', onClick);
    try { setSound(!!look.sound); sfx.select(); } catch { /* audio is optional */ }
    btn.classList.add('chosen');
    title.confirm();
    setTimeout(start, reducedMotion ? 120 : 650);
  }
  window.addEventListener('keydown', onKey);
  $('#boot').addEventListener('click', onClick);
  const arm = () => { if (!isLoaded || armed) return; armed = true; btn.classList.remove('hidden'); };
  title.ready.then(() => { isLoaded && arm(); });
  await loaded;
  isLoaded = true;
  try { sessionStorage.setItem('nathan-exe:booted', '1'); } catch { /* ignore */ }
  title.ready.then(arm);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- Renderer / scene ----------------
const canvas = $('#world');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch {
  location.replace('portfolio.html?nowebgl=1');
  throw new Error('WebGL unavailable');
}
renderer.setPixelRatio(1);
renderer.info.autoReset = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const retro = new RetroRenderer(renderer);
// "Look" preferences: palette (bright | pastel) and pixels (smooth | retro), remembered per browser.
const LOOK_KEY = 'nathan-exe:look';
const look = (() => { try { return { palette: 'bright', pixels: 'smooth', time: 'auto', ...JSON.parse(localStorage.getItem(LOOK_KEY) || '{}') }; } catch { return { palette: 'bright', pixels: 'smooth', time: 'auto' }; } })();
const qs = new URLSearchParams(location.search);
if (qs.get('palette')) look.palette = qs.get('palette');
if (qs.get('pixels')) look.pixels = qs.get('pixels');
if (qs.get('time')) look.time = qs.get('time');
if (!look.motion) look.motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : 'on';
if (!look.music) look.music = 'on';
if (typeof look.musicVol !== 'number') look.musicVol = 0.6;
function applyLook() {
  retro.setMode(look);
  applyPalette(look.palette);
  const sky = SKY[look.palette] || SKY.bright;
  SKY_START.setHex(sky.start); SKY_END.setHex(sky.end); scene.background.copy(SKY_START);
  document.body.classList.toggle('look-retro', look.pixels === 'retro');
  const pb = document.getElementById('look-palette'), xb = document.getElementById('look-pixels');
  if (pb) pb.textContent = look.palette === 'pastel' ? 'Pastel' : 'Bright';
  if (xb) xb.textContent = look.pixels === 'retro' ? 'Pixel' : 'Smooth';
  const tb = document.getElementById('look-time');
  if (tb) tb.textContent = { auto: '◐ Auto', day: '☀ Day', night: '☾ Night' }[look.time] || '◐ Auto';
  const mb = document.getElementById('look-motion');
  if (mb) { mb.textContent = look.motion === 'off' ? '⏸ Motion' : '▶ Motion'; mb.setAttribute('aria-pressed', String(look.motion !== 'off')); }
  const mu = document.getElementById('look-music');
  if (mu) { const on = look.music !== 'off'; mu.textContent = on ? '♫ Music' : '♫ Off'; mu.setAttribute('aria-pressed', String(on)); mu.classList.toggle('dim', !look.sound); mu.title = look.sound ? 'Character music on/off' : 'Turn sound on to hear character music'; }
  const mv = document.getElementById('music-vol');
  if (mv) { mv.value = Math.round(look.musicVol * 100); mv.disabled = !look.sound || look.music === 'off'; }
  setMusic(look.music !== 'off', look.musicVol);
  const sb = document.getElementById('look-sound');
  if (sb) { sb.textContent = look.sound ? '♪ On' : '♪ Off'; sb.setAttribute('aria-pressed', String(!!look.sound)); }
  if (look.sound && !state.started) { /* audio may only start after a user gesture */ } else setSound(!!look.sound);
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch { /* ignore */ }
}

const scene = new THREE.Scene();
const SKY_START = new THREE.Color(0x8fdcf0);
const SKY_END = new THREE.Color(0xffc98f);
const TAHITI_SKY = new THREE.Color(0xffa58a); // soft sunset over Tahiti
scene.background = SKY_START.clone();
applyLook();

const hemi = new THREE.HemisphereLight(0xfff6e6, 0x9aa6c8, 1.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d2, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(16, 34, 10);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
const CAM_DIR = new THREE.Vector3(Math.sin(Math.PI / 4) * Math.cos(0.58), Math.sin(0.58), Math.cos(Math.PI / 4) * Math.cos(0.58)).normalize();
const camTarget = new THREE.Vector3();
const camVel = new THREE.Vector3();

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  retro.setSize(w, h);
  const aspect = w / h;
  const base = aspect >= 1 ? 21 : 19 / aspect;
  const view = base / state.zoom / introZoom();
  camera.top = view / 2; camera.bottom = -view / 2;
  camera.left = (-view * aspect) / 2; camera.right = (view * aspect) / 2;
  camera.updateProjectionMatrix();
}
const introZoom = () => (reducedMotion ? 1 : 0.32 + 0.68 * easeOutCubic(state.intro));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// ---------------- World + player ----------------
let world, nav, map;
const player = new Player();
scene.add(player.group);
const velocity = new THREE.Vector3();
const heightAt = (x, z) => {
  if (world) for (const f of world.floors) if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) return f.h;
  const t = map && tileAt(map, x, z);
  return t ? Math.max(0, groundHeight(t.type)) : 0;
};

const marker = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.4, 12), new THREE.MeshBasicMaterial({ color: 0xff6a3d }));
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);

const dialogue = new Dialogue($('#dialogue'));

async function init() {
  await document.fonts.load('32px Silkscreen').catch(() => {});
  try {
    [state.content, map] = await Promise.all([loadContent(), loadTiledMap(`${BASE}maps/town.tmj`)]);
  } catch (err) {
    console.error(err);
    location.replace('portfolio.html?error=content');
    return;
  }
  const overrides = await loadKitOverrides(BASE);
  kitOverrides = overrides;
  mapCache.island1 = map; state.level = 'island1';
  world = buildWorld(scene, state.content, map, overrides);
  nav = makeNav();
  const s = state.save;
  const spawn = s.pos && nav.isWalkable(s.pos.x, s.pos.z) ? s.pos : map.spawn || { x: 2, z: 6 };
  player.group.position.set(spawn.x, heightAt(spawn.x, spawn.z), spawn.z);
  player.heading = spawn === s.pos ? Math.PI / 4 : Math.PI; // new game: face the CRT
  world.interactables.forEach((it) => { if (isDone(it)) markVisited(it, true); });
  state.complete = MAIN_DISTRICTS.every((d) => s.chapters.includes(d.id));
  if (s.chapters.includes('iron-yard') || s.minigames.includes('lift')) player.setBuff(true);
  if (s.finale) world.apis.lighthouse?.setLit(true);
  setupUI();
  setupLabels();
  setupMinimap();
  resize();
  camTarget.copy(player.group.position);
  if (DEBUG) setupDebug();
}

function isDone(it) {
  const s = state.save;
  if (it.kind === 'chapter') return s.chapters.includes(it.district);
  if (it.kind === 'memory') return s.memories.includes(it.memoryId);
  if (it.kind === 'minigame') return s.minigames.includes(it.game);
  if (it.kind === 'npc') return s.talked.includes(it.npcId);
  return s.chapters.includes(it.id);
}

// ---------------- UI ----------------
function setupUI() {
  const c = state.content;
  const resume = $('#nav-resume');
  const resumeUrl = safeUrl(c.profile?.resumeUrl);
  if (resumeUrl) resume.href = resumeUrl; else resume.remove();

  $('#menu-toggle').addEventListener('click', (e) => {
    const bar = $('#recruiter-bar');
    const open = bar.classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });

  drawPortrait($('#portrait'));
  $('#player-name').textContent = (c.profile?.name || 'Nathan').toUpperCase();
  renderJourney();
  $('#hint').innerHTML = isTouch
    ? 'Tap to walk · tap <b>◆</b> to interact'
    : '<kbd>WASD</kbd> walk <kbd>Space</kbd> jump <kbd>E</kbd> interact <kbd>M</kbd> map <kbd>H</kbd> help';
  $('#help-btn').addEventListener('click', () => toggleControls());
  $('#controls-close').addEventListener('click', () => toggleControls(false));
  $('#map-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleBigMap(true); });
  $('#bigmap-close').addEventListener('click', () => toggleBigMap(false));
  $('#bigmap').addEventListener('click', (e) => { if (e.target.id === 'bigmap') toggleBigMap(false); });
  $('#bigmap-canvas').addEventListener('click', onBigMapClick);

  $('#prompt').addEventListener('click', () => state.nearby && interact(state.nearby));
  $('#panel-close').addEventListener('click', closePanel);
  $('#album-btn').addEventListener('click', openAlbum);
  $('#look-palette').addEventListener('click', () => { look.palette = look.palette === 'pastel' ? 'bright' : 'pastel'; applyLook(); resize(); });
  $('#look-pixels').addEventListener('click', () => { look.pixels = look.pixels === 'retro' ? 'smooth' : 'retro'; applyLook(); resize(); });
  $('#look-time').addEventListener('click', cycleTime);
  $('#look-motion')?.addEventListener('click', () => { look.motion = look.motion === 'off' ? 'on' : 'off'; applyLook(); });
  $('#look-music')?.addEventListener('click', () => { look.music = look.music === 'off' ? 'on' : 'off'; if (look.music === 'on' && !look.sound) look.sound = true; applyLook(); });
  $('#music-vol')?.addEventListener('input', (e) => { look.musicVol = Number(e.target.value) / 100; setMusic(look.music !== 'off', look.musicVol); try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch { /* ignore */ } });
  $('#nav-education')?.addEventListener('click', (e) => { e.preventDefault(); $('#recruiter-bar').classList.remove('open'); $('#menu-toggle').setAttribute('aria-expanded', 'false'); openEducation(); });
  $('#look-sound').addEventListener('click', () => { look.sound = !look.sound; applyLook(); if (look.sound) sfx.open(); });
  applyLook();
  $('#journey-toggle').addEventListener('click', () => $('.journey').classList.toggle(innerWidth <= 760 ? 'open-m' : 'collapsed'));
  window.addEventListener('keydown', (e) => {
    if (state.minigame && mgRoot()?.onkey && !e.repeat) { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (k.startsWith('Arrow') || k === ' ' || k === 'e' || k === 'Enter') { e.preventDefault(); mgRoot().onkey(k); return; } }
    if (!state.started || state.minigame) return;
    if (e.target.closest?.('input, textarea')) return;
    if (state.level === 'tahiti' && !e.repeat && !state.mount && ['r', 'f', 'g'].includes(e.key.toLowerCase()) && tahiti.key(e.key.toLowerCase())) { e.preventDefault(); return; }
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === 'm' || e.key === 'M') { e.preventDefault(); toggleBigMap(); return; }
    if (e.key === 'h' || e.key === 'H') { e.preventDefault(); toggleControls(); return; }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); cycleTime(); return; }
    if ((e.key === 'r' || e.key === 'R') && state.mount) { e.preventDefault(); resetMount(); return; }
    if (e.key === 'Escape' && state.groupScene) { endGroupScene(); return; }
    if (e.key === 'Escape') {
      if (!$('#bigmap').classList.contains('hidden')) return toggleBigMap(false);
      if (!$('#controls').classList.contains('hidden')) return toggleControls(false);
      if (dialogue.open) dialogue.close(); else closePanel();
    }
    if (e.key === ' ' && !dialogue.open && (state.volley || state.hoop)) { e.preventDefault(); tahiti.key(' '); return; }
    if (e.key === ' ' && !dialogue.open) { e.preventDefault(); if (player.jump()) sfx.rep(); return; }
    const act = e.key === 'e' || e.key === 'E' || e.key === 'Enter' || (e.key === ' ' && dialogue.open);
    const focused = document.activeElement;
    if (!act || focused?.closest?.('input, textarea, select')) return;
    if (e.key === 'Enter' && focused?.closest?.('a, button')) return; // let Enter press the focused button
    e.preventDefault();
    if (dialogue.open) dialogue.advance();
    else if (state.nearby && !state.panelOpen) interact(state.nearby);
  });
  dialogue.onClose = () => {
    const it = state.talkingTo;
    state.talkingTo = null;
    if (it) { it.character.talking = false; it.character.lookAt(null); player.talking = false; }
  };
  dialogue.onMemory = (id) => unlockMemory(id);
  dialogue.onAction = (name) => {
    if (name === 'fly-tahiti') return void setTimeout(() => startFlight('tahiti'), 900);
    if (name === 'fly-home') { if (!tahiti.harrisNearJet()) { tahiti.callHarrisToJet(); toast('Harris will meet you at the jet.'); return; } return void setTimeout(() => startFlight('island1'), 900); }
    world.apis[name]?.trigger({ toast, sfx }); state.talkingTo?.character.play('nod');
  };
}

function renderJourney() {
  const s = state.save;
  const list = $('#journey-list');
  list.innerHTML = DISTRICTS.map((d) => {
    const ch = chapterFor(state.content, d.id);
    const done = s.chapters.includes(d.id);
    return `<li class="${done ? 'done' : ''}${d.optional ? ' optional' : ''}"><button type="button" data-goto="${d.id}">${esc(ch?.title || d.name)}</button></li>`;
  }).join('');
  list.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const it = world.interactables.find((i) => i.kind === 'chapter' && i.district === b.dataset.goto)
      || (b.dataset.goto === 'garage' && world.interactables.find((i) => i.kind === 'project'));
    if (it) walkToInteractable(it);
  }));
  const main = MAIN_DISTRICTS.filter((d) => s.chapters.includes(d.id)).length;
  const totalMem = (state.content.memories || []).length;
  $('#journey-count').textContent = `${main}/${MAIN_DISTRICTS.length}`;
  $('#mem-count').textContent = `${s.memories.length}/${totalMem}`;
}

// ---------------- Interactions ----------------
function interact(it) {
  if (state.mount) return dismount();
  if (state.seated) return standUp();
  if (it.kind === 'group') return runGroupScene(it);
  if (it.kind === 'activity') { tahiti.leaveJoin(); return void tahiti.interact(it); }
  if (it.kind === 'vehicle') return mount(it);
  if (it.kind === 'seat') return sitDown(it);
  if (it.kind === 'npc') return talkTo(it);
  if (it.kind === 'minigame') return startMinigame(it);
  if (it.kind === 'memory') return collectMemory(it);
  if (it.kind === 'station') return openStations(it);
  if (it.kind === 'panel') return openInfoPanel(it);
  if (it.kind === 'finale') return runFinale(it);
  openInteractable(it);
}

function face(target) {
  const p = player.group.position;
  player.heading = Math.atan2(target.x - p.x, target.z - p.z);
}

function chapterHeader(ch) {
  return `<div class="chapter-head"><img class="mini-portrait" src="${portraitURL()}" alt=""><div>
    <p class="eyebrow">${esc(ch.period || '')}</p><h2 id="panel-title">${esc(ch.title)}</h2>
    ${ch.subtitle ? `<p class="subtitle">${esc(ch.subtitle)}</p>` : ''}</div></div>`;
}

function openInteractable(it) {
  const c = state.content;
  let bar = '', html = '';
  face(it); player.play('interact');
  if (it.kind === 'project') {
    const p = c.projects.find((x) => x.id === it.projectId);
    if (!p) return;
    bar = `projects/${p.id}.exe`;
    html = `<h2 id="panel-title" class="sr-only">${esc(p.title)}</h2>${projectDetails(p)}`;
  } else if (it.kind === 'about') {
    const p = c.profile || {};
    bar = 'about/readme.txt';
    html = `
      ${chapterHeader({ period: p.availability, title: p.name, subtitle: `${p.role || ''}${p.location ? ` · ${p.location}` : ''}` })}
      <p>${esc(p.summary)}</p>
      ${(p.about || []).map((t) => `<p>${esc(t)}</p>`).join('')}
      <div class="transmit"><a class="btn" href="portfolio.html#about">Full profile →</a>${c.profile?.resumeUrl ? `<a class="btn" href="${esc(safeUrl(c.profile.resumeUrl))}" target="_blank" rel="noopener">Resume ↗</a>` : ''}</div>`;
  } else {
    const ch = chapterFor(c, it.district) || { title: it.district, body: [] };
    bar = `${it.district}/chapter.txt`;
    const mems = (c.memories || []).filter((m) => m.district === it.district);
    const found = mems.filter((m) => state.save.memories.includes(m.id)).length;
    html = `${chapterHeader(ch)}
      ${(ch.body || []).map((p) => `<p>${esc(p)}</p>`).join('')}
      ${ch.highlights?.length ? `<ul class="highlights">${ch.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      ${mems.length ? `<p class="mem-hint">Memories here: <b>${found}/${mems.length}</b>${found < mems.length ? ' — look for the glowing ✦ nearby.' : ' — all found.'}</p>` : ''}`;
    const edu = (c.education || []).find((e) => e.district === it.district);
    if (edu) html += educationExtras(edu);
    if (it.district === 'garage') {
      html += `<div class="panel-projects">${c.projects.map(projectCard).join('')}</div><a class="btn" href="portfolio.html#projects">All projects →</a>`;
    }
    if (it.district === 'signal-tower') {
      html += (c.skills || []).map((g) => `<p class="eyebrow" style="margin-top:14px">${esc(g.group)}</p><ul class="chips">${(g.items || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`).join('');
      if ((c.experience || []).length) html += `<p class="eyebrow" style="margin-top:18px">Experience</p><ul class="highlights">${c.experience.map((e) => `<li><b>${esc(e.role)}</b> · ${esc(e.org)} <span class="muted">${esc(e.period)}</span><br>${esc(e.summary)}</li>`).join('')}</ul>`;
      if ((c.achievements || []).length) html += `<p class="eyebrow" style="margin-top:18px">Achievements</p><ul class="highlights">${c.achievements.map((a) => `<li><b>${esc(a.title)}</b>${a.org ? ` · ${esc(a.org)}` : ''} <span class="muted">${esc(a.year)}</span>${a.detail ? `<br>${esc(a.detail)}` : ''}</li>`).join('')}</ul>`;
    }
    if (it.district === 'lighthouse') {
      const email = (c.links || []).find((l) => l.url.startsWith('mailto:'));
      html += `
        <div class="transmit">
          ${email ? `<a class="btn primary" href="${esc(safeUrl(email.url))}?subject=${encodeURIComponent('Hello from NATHAN.EXE')}">Send a message ✉</a>` : ''}
          ${c.profile?.resumeUrl ? `<a class="btn" href="${esc(safeUrl(c.profile.resumeUrl))}" target="_blank" rel="noopener">Resume ↗</a>` : ''}
        </div>
        <ul class="link-list">${(c.links || []).map((l) => `<li><a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label)} ↗</a></li>`).join('')}</ul>`;
    }
  }
  showPanel(bar, html, it);
  const eduHere = it.kind === 'chapter' && (c.education || []).find((e) => e.district === it.district);
  if (eduHere && addUnique(state.save.stamps, eduHere.id)) {
    persist(); sfx.memory();
    setTimeout(() => toast(`PASSPORT STAMPED · ${eduHere.label}`), 900);
  }

  // Garage exhibits open The Builder chapter (the Garage has no separate chapter spot)
  const chapterId = it.kind === 'chapter' ? it.district : it.kind === 'project' ? 'garage' : null;
  if (chapterId && addUnique(state.save.chapters, chapterId)) {
    if (it.kind === 'chapter') markVisited(it);
    persist();
    if (chapterId === 'iron-yard') { player.setBuff(true); toast('CHAPTER 1 UNLOCKED · Discipline +1'); }
    else toast(`CHAPTER UNLOCKED · ${chapterFor(c, chapterId)?.title || chapterId}`);
    sfx.chapter();
    renderJourney();
    const was = state.complete;
    state.complete = MAIN_DISTRICTS.every((d) => state.save.chapters.includes(d.id));
    if (state.complete && !was) setTimeout(() => toast('SAVE FILE COMPLETE · Thanks for playing my story.'), 1800);
  }
}

function showPanel(bar, html, it = null, cls = '') {
  $('#panel-bar').textContent = bar;
  $('#panel-body').innerHTML = html;
  $('#panel-body').scrollTop = 0;
  $('#panel').className = `panel window ${cls}`;
  sfx.open();
  state.panelOpen = it || { x: player.group.position.x, z: player.group.position.z, radius: 99 };
  $('#prompt').classList.add('hidden');
}

function closePanel() {
  if (!state.panelOpen) return;
  $('#panel').classList.add('hidden');
  sfx.close();
  state.panelOpen = null;
  state.nearby = null; // re-evaluate prompt next frame
}

function talkTo(it) {
  const base = (state.content.npcs || []).find((n) => n.id === it.npcId);
  const over = state.level === 'tahiti' && state.tahiti?.overrides?.[it.npcId];
  const def = base && over ? { ...base, ...over } : base;
  if (!def) return;
  closePanel();
  state.talkingTo = it;
  face(it);
  it.character.lookAt(player.group.position.clone());
  const ch = it.character, p = player.group.position;
  ch.heading = Math.atan2(p.x - it.x, p.z - it.z);
  ch.play('wave');
  ch.talking = true;
  dialogue.start(def, { asked: it.asked || (it.asked = new Set()) });
  $('#prompt').classList.add('hidden');
  if (addUnique(state.save.talked, it.npcId)) { markVisited(it); persist(); }
}

function startMinigame(it) {
  if (it.game !== 'lift') return;
  closePanel();
  face(it);
  const mem = (state.content.memories || []).find((m) => m.id === 'transformation');
  state.minigame = runLift($('#minigame'), {
    title: 'Progressive overload',
    intro: 'Three clean reps. The groove gets tighter every set — just like it did in real life.',
    onDone: ({ skipped }) => {
      state.minigame = null;
      player.play('flex');
      if (addUnique(state.save.minigames, 'lift')) { markVisited(it); persist(); }
      player.setBuff(true);
      if (!skipped) toast('SET COMPLETE · +3 reps');
      if (mem) setTimeout(() => unlockMemory(mem.id), 900);
    },
    onClose: () => { state.minigame = null; },
  });
}

function collectMemory(it) {
  face(it);
  player.play('interact');
  unlockMemory(it.memoryId, it);
}

function unlockMemory(id, it = world.interactables.find((i) => i.kind === 'memory' && i.memoryId === id)) {
  const m = (state.content.memories || []).find((x) => x.id === id);
  if (!m) return;
  const isNew = addUnique(state.save.memories, id);
  if (isNew) { persist(); renderJourney(); }
  if (it) { markVisited(it); it.beacon.group.visible = false; }
  const total = (state.content.memories || []).length;
  dialogue.close();
  showPanel(`memories/${id}.mem`, `
    <p class="eyebrow">${isNew ? 'MEMORY FOUND' : 'MEMORY'} · ${state.save.memories.length}/${total}</p>
    <h2 id="panel-title">${esc(m.title)}</h2>
    ${m.year ? `<p class="subtitle">${esc(m.year)}</p>` : ''}
    ${m.image ? `<img class="memory-img" src="${esc(safeUrl(m.image))}" alt="">` : ''}
    <p>${esc(m.text)}</p>
    <div class="transmit"><button class="btn" id="mem-album">Open memory album</button></div>`, it, 'memory-card');
  $('#mem-album').addEventListener('click', openAlbum);
  if (isNew) { toast(`✦ Memory found: ${m.title}`); sfx.memory(); }
}

// ---------------- Info panels: tech stack, trophy case, radio log ----------------
function openInfoPanel(it) {
  face(it); player.play('interact');
  const c = state.content;
  let html = '';
  if (it.panel === 'skills') {
    html = `<p class="eyebrow">THE GARAGE · PEGBOARD</p><h2 id="panel-title">Tech stack</h2>
      <p class="subtitle">The tools I reach for, grouped the way I use them.</p>
      ${(c.skills || []).map((g) => `<p class="eyebrow" style="margin-top:14px">${esc(g.group)}</p><ul class="chips">${(g.items || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`).join('') || '<p>Add skills in the admin.</p>'}`;
  } else if (it.panel === 'achievements') {
    html = `<p class="eyebrow">SIGNAL TOWER · TROPHY CASE</p><h2 id="panel-title">Achievements</h2>
      ${(c.achievements || []).length ? `<ul class="highlights">${c.achievements.map((a) => `<li><b>${esc(a.title)}</b>${a.org ? ` · ${esc(a.org)}` : ''} <span class="muted">${esc(a.year || '')}</span>${a.detail ? `<br>${esc(a.detail)}` : ''}</li>`).join('')}</ul>` : '<p>Add achievements in the admin.</p>'}`;
  } else if (it.panel === 'experience') {
    html = `<p class="eyebrow">SIGNAL TOWER · RADIO LOG</p><h2 id="panel-title">Experience</h2>
      ${(c.experience || []).length ? `<ul class="highlights">${c.experience.map((e) => `<li><b>${esc(e.role)}</b> · ${esc(e.org)} <span class="muted">${esc(e.period || '')}</span><br>${esc(e.summary || '')}</li>`).join('')}</ul>` : '<p>Add experience in the admin.</p>'}
      ${c.profile?.resumeUrl ? `<div class="transmit"><a class="btn" href="${esc(safeUrl(c.profile.resumeUrl))}" target="_blank" rel="noopener">Full resume ↗</a></div>` : ''}`;
  } else if (it.panel === 'skilltree') {
    const groups = c.skills || [];
    html = `<p class="eyebrow">GUILD HALL · SKILL TREE</p><h2 id="panel-title">Skill tree</h2>
      <p class="subtitle">Pick a branch to see what's on it.</p>
      <div class="gh-tree">${groups.map((g, i) => `<button type="button" class="gh-branch" data-branch="${i}" aria-expanded="false"><span class="gh-gem b${i % 5}"></span>${esc(g.group)}<em>${(g.items || []).length}</em></button>`).join('')}</div>
      <div class="gh-nodes" id="gh-nodes" aria-live="polite"><p class="muted">No branch selected.</p></div>`;
  } else if (it.panel === 'trophies') {
    const tier = (a) => /winner|first/i.test(a.title) ? 'gold' : /runner|second|third/i.test(a.title) ? 'silver' : 'bronze';
    html = `<p class="eyebrow">GUILD HALL · TROPHY COLLECTION</p><h2 id="panel-title">Trophies</h2>
      <p class="subtitle">${(c.achievements || []).length} trophies. Select one to read the plaque.</p>
      <div class="gh-trophies">${(c.achievements || []).map((a, i) => `<button type="button" class="gh-trophy ${tier(a)}" data-trophy="${i}"><span class="cup"></span><b>${esc(a.title)}</b></button>`).join('')}</div>
      <div class="gh-plaque" id="gh-plaque" aria-live="polite"></div>`;
  } else if (it.panel === 'quests') {
    const exp = c.experience || [];
    const main = exp.filter((e) => /hewlett|hpe|sez/i.test(e.org)), side = exp.filter((e) => !main.includes(e));
    const q = (e, kind) => `<details class="gh-quest ${kind}"${kind === 'main' ? ' open' : ''}><summary><span class="tag">${kind === 'main' ? 'MAIN QUEST' : 'SIDE QUEST'}</span><b>${esc(e.org)}</b><span class="muted">${esc(e.role)}${e.period ? ' · ' + esc(e.period) : ''}</span></summary><p>${esc(e.summary || '')}</p></details>`;
    html = `<p class="eyebrow">GUILD HALL · QUEST LOG</p><h2 id="panel-title">Quest log</h2>
      ${main.map((e) => q(e, 'main')).join('')}${side.map((e) => q(e, 'side')).join('')}`;
  } else if (it.panel === 'profile') {
    const p = c.profile || {};
    const edu = ['lake-park', 'winter-campus', 'monsoon-campus'].map((d) => chapterFor(c, d)).filter(Boolean);
    html = `<p class="eyebrow">GUILD HALL · CHARACTER PROFILE</p>
      <div class="gh-profile"><img class="mini-portrait" src="${portraitURL()}" alt=""><div><h2 id="panel-title">${esc(p.name || 'Nathan')}</h2><p class="subtitle">${esc(p.role || '')}${p.location ? ' · ' + esc(p.location) : ''}</p></div></div>
      ${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
      <p class="eyebrow" style="margin-top:14px">EDUCATION</p>
      <ol class="gh-edu">${edu.map((ch) => `<li><b>${esc(ch.subtitle || ch.title)}</b>${ch.period ? `<span class="muted"> · ${esc(ch.period)}</span>` : ''}${(ch.highlights || [])[0] ? `<br><span class="muted">${esc(ch.highlights[0])}</span>` : ''}</li>`).join('')}</ol>
      <div class="transmit">${p.resumeUrl ? `<a class="btn primary" href="${esc(safeUrl(p.resumeUrl))}" target="_blank" rel="noopener">Resume ↗</a>` : ''}${(c.links || []).filter((l) => !l.url.startsWith('mailto:')).map((l) => `<a class="btn" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</div>`;
  } else if (it.panel === 'place') {
    const pl = state.tahiti?.places?.[it.place] || {};
    const gang = state.tahiti?.gangs?.[pl.gang];
    html = `<p class="eyebrow">TAHITI</p><h2 id="panel-title">${esc(pl.title || it.title)}</h2>
      ${pl.text ? `<blockquote class="pop-card">${esc(pl.text)}</blockquote>` : ''}
      ${gang ? `<p class="eyebrow" style="margin-top:14px">${esc(gang.name)} · ${esc(gang.tagline || '')}</p><p>${esc(gang.text || '')}</p>
      <ul class="highlights">${gang.members.map((m) => `<li><b>${esc(m.name)}</b> · ${esc(m.role)}<br><span class="muted">${esc(m.text)}</span></li>`).join('')}</ul>` : ''}`;
  } else if (it.panel === 'pop') {
    const card = (c.interests || []).find((x) => x.id === it.interest) || {};
    html = `<p class="eyebrow">POP CULTURE PARK · ${esc((card.zone || '').toUpperCase())}</p><h2 id="panel-title">${esc(card.title || it.title)}</h2>
      ${card.card ? `<blockquote class="pop-card">${esc(card.card)}</blockquote>` : ''}
      ${card.action ? `<p class="muted">${esc(card.action)}</p>` : ''}
      ${it.interest === 'spider-man' ? '<div class="transmit"><button type="button" class="btn primary" id="pop-go">Start the challenge</button></div>' : ''}
      <p class="pop-note">A fan tribute made for this game. Not affiliated with or endorsed by the rights holders.</p>`;
  }
  showPanel(`${it.district}/${it.panel}.txt`, html, it);
  if (!it.visited) { markVisited(it); }
  const body = $('#panel-body');
  if (it.panel === 'skilltree') {
    const groups = c.skills || [];
    world.apis.guild_skill_tree?.trigger();
    body.querySelectorAll('[data-branch]').forEach((b) => b.addEventListener('click', () => {
      body.querySelectorAll('[data-branch]').forEach((x) => x.setAttribute('aria-expanded', String(x === b)));
      const g = groups[+b.dataset.branch];
      $('#gh-nodes').innerHTML = `<p class="eyebrow">${esc(g.group)}</p><ul class="gh-node-list">${(g.items || []).map((x, i) => `<li style="animation-delay:${i * 60}ms">${esc(x)}</li>`).join('')}</ul>`;
      sfx.open();
    }));
  } else if (it.panel === 'trophies') {
    world.apis.guild_trophy_stand?.trigger();
    body.querySelectorAll('[data-trophy]').forEach((b) => b.addEventListener('click', () => {
      const a = c.achievements[+b.dataset.trophy];
      body.querySelectorAll('[data-trophy]').forEach((x) => x.classList.toggle('on', x === b));
      $('#gh-plaque').innerHTML = `<b>${esc(a.title)}</b>${a.org ? `<span class="muted"> · ${esc(a.org)}</span>` : ''}${a.year ? `<span class="muted"> · ${esc(a.year)}</span>` : ''}${a.detail ? `<p>${esc(a.detail)}</p>` : ''}`;
      sfx.open();
    }));
  } else if (it.panel === 'pop') {
    const ctx = { toast, sfx };
    const api = world.apis[it.attraction];
    if (it.interest === 'spider-man') $('#pop-go')?.addEventListener('click', () => { closePanel(); api?.trigger(ctx); });
    else api?.trigger(ctx);
  }
}


// ---------------- Education journey ----------------
function passportHTML() {
  const c = state.content, got = state.save.stamps || [];
  return `<div class="passport" aria-label="Education passport"><p class="eyebrow">EDUCATION PASSPORT · ${got.length}/${(c.education || []).length}</p>
    <div class="stamps">${(c.education || []).map((e) => `<span class="stamp ${got.includes(e.id) ? 'on' : ''}" title="${got.includes(e.id) ? 'Stamped' : 'Visit the campus to stamp'}"><b>${esc(e.label)}</b><i>${got.includes(e.id) ? 'STAMPED' : '— — —'}</i></span>`).join('')}</div>
    <p class="muted passport-note">Optional. Stamps come from visiting each campus; everything here is open either way.</p></div>`;
}
function educationExtras(e) {
  const c = state.content, s = state.save;
  const mems = (c.memories || []).filter((m) => m.district === e.district);
  const npc = (c.npcs || []).find((n) => n.id === e.npc);
  let h = `<div class="edu-extra"><p class="eyebrow">EDUCATION · ${esc(e.num)} · ${esc(e.label)}: ${esc(e.tagline)}</p>
    <p><b>${esc(e.institution)}</b>${e.place ? `, ${esc(e.place)}` : ''}${e.detail ? `<br><span class="muted">${esc(e.detail)}</span>` : ''}</p>`;
  if (mems.length) h += `<p class="eyebrow" style="margin-top:12px">MEMORIES</p><ul class="highlights">${mems.map((m) => s.memories.includes(m.id) ? `<li><b>${esc(m.title)}</b><br>${esc(m.text)}</li>` : `<li class="muted">✦ ${esc(m.title)} · find it on campus</li>`).join('')}</ul>`;
  if (e.activities) {
    const acts = (c.experience || []).filter((x) => /tce/i.test(x.org));
    if (acts.length) h += `<p class="eyebrow" style="margin-top:12px">COLLEGE ACTIVITIES</p><ul class="highlights">${acts.map((x) => `<li><b>${esc(x.role)}</b> · ${esc(x.org)}<br>${esc(x.summary || '')}</li>`).join('')}</ul>`;
    if ((c.achievements || []).length) h += `<p class="eyebrow" style="margin-top:12px">ACHIEVEMENTS</p><ul class="highlights">${c.achievements.map((a) => `<li><b>${esc(a.title)}</b>${a.detail ? ` · <span class="muted">${esc(a.detail)}</span>` : ''}</li>`).join('')}</ul>`;
  }
  if (npc) h += `<p class="muted" style="margin-top:10px">${esc(npc.name)} is around here. Say hi.</p>`;
  return h + '</div>';
}
function openEducation(readId = null) {
  const c = state.content, list = c.education || [];
  if (readId) {
    const e = list.find((x) => x.id === readId);
    const ch = chapterFor(c, e.district) || { title: e.label, body: [] };
    showPanel(`education/${e.id}.txt`, `${chapterHeader({ ...ch, period: `${e.num} · ${e.label}: ${e.tagline}` })}
      ${(ch.body || []).map((p) => `<p>${esc(p)}</p>`).join('')}
      ${educationExtras(e)}
      <div class="transmit"><button type="button" class="btn primary" data-travel="${esc(e.id)}">Travel to campus →</button><button type="button" class="btn" data-edu-back>← All chapters</button></div>`, null, 'education');
  } else {
    showPanel('education/journey.txt', `<p class="eyebrow">EDUCATION</p><h2 id="panel-title">The education journey</h2>
      <p class="subtitle">Three chapters, three campuses.</p>
      <ol class="edu-list">${list.map((e) => `<li><div class="edu-num">${esc(e.num)}</div><div><p class="eyebrow">${esc(e.label)}: ${esc(e.tagline)}</p><b>${esc(e.institution)}</b><span class="muted">${esc(e.place || '')}</span>
        <div class="edu-actions"><button type="button" class="btn primary" data-read="${esc(e.id)}">Read journey</button><button type="button" class="btn" data-travel="${esc(e.id)}">Travel to campus</button></div></div></li>`).join('')}</ol>
      ${passportHTML()}`, null, 'education');
  }
  const body = $('#panel-body');
  body.querySelectorAll('[data-read]').forEach((b) => b.addEventListener('click', () => openEducation(b.dataset.read)));
  body.querySelector('[data-edu-back]')?.addEventListener('click', () => openEducation());
  body.querySelectorAll('[data-travel]').forEach((b) => b.addEventListener('click', () => {
    const e = list.find((x) => x.id === b.dataset.travel);
    const dest = world.stations.find((st) => st.stationId === e.station);
    if (!dest) return;
    const p = player.group.position;
    const from = world.stations.reduce((a, st) => (Math.hypot(st.x - p.x, st.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? st : a), world.stations[0]);
    travel(from, dest);
  }));
}

// ---------------- Benches ----------------
function sitDown(it) {
  if (dialogue.open || state.panelOpen || state.minigame || state.ko) return;
  state.path = []; marker.visible = false;
  state.seated = it; state.nearby = null;
  player.pose = 'sit'; sfx.close();
}
function standUp() {
  const it = state.seated; if (!it) return;
  state.seated = null; state.nearby = null; player.pose = null;
  // step off to the nearest free spot in front of / beside the bench
  const h = it.seat.heading, sx = it.seat.x, sz = it.seat.z;
  let spot = null;
  for (const d of [0.9, 1.2, 1.6, 2.0]) {
    for (const ang of [0, 0.6, -0.6, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const x = sx + Math.sin(h + ang) * d, z = sz + Math.cos(h + ang) * d;
      if (solidFree(x, z) && !charBlocks(x, z)) { spot = { x, z }; break; }
    }
    if (spot) break;
  }
  spot = spot || { x: it.x, z: it.z };
  player.group.position.set(spot.x, heightAt(spot.x, spot.z), spot.z);
}

// ---------------- Mounts: one controller for bicycles and the horse ----------------
// Each vehicle type is just a config; on foot movement is untouched and comes
// back as soon as Nathan gets off.
const VEHICLES = {
  bike: { speed: 5.2, boost: 7.0, accel: 5, brake: 9, turn: 4.2, seatY: 0.3, pose: 'cycle', r: 0.42, yaw: 0, avoid: ['water'], label: 'bicycle' },
  moto: { speed: 7.0, boost: 9.5, accel: 6, brake: 10, turn: 3.6, seatY: 0.62, pose: 'ride', r: 0.5, yaw: 0, avoid: ['water'], label: 'motorcycle' },
  horse: { speed: 4.0, boost: 6.6, accel: 3.5, brake: 7, turn: 3.0, seatY: 0.7, pose: 'ride', r: 0.6, yaw: -Math.PI / 2, avoid: ['water'], label: 'horse' },
};
let railPts = null;
function vehicleFree(x, z, cfg) {
  const r = cfg.r;
  for (const c of world.colliders) {
    if (c.r !== undefined) { if (Math.hypot(x - c.cx, z - c.cz) < c.r + r) return false; }
    else if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return false;
  }
  for (const f of world.floors) if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) return false;   // no riding indoors or onto platforms
  const tile = tileAt(map, x, z);
  if (!tile || !tile.walkable || cfg.avoid.includes(tile.type)) return false;
  if (Math.hypot(x, z) > (map.props.navRadius || (map.props.islandRadius || 44) - 2.5) - 0.5) return false;
  for (const n of world.npcs) { if (n.passenger) continue; const p = n.character.group.position; if (Math.hypot(p.x - x, p.z - z) < r + 0.45) return false; }
  for (const it of world.interactables) if (it.kind === 'vehicle' && it !== state.mount?.it && Math.hypot(it.x - x, it.z - z) < r + 0.6) return false;
  // the railway is just ground to roll over, but never through a train
  if (world.railway) {
    if (!railPts) railPts = world.railway.curve.getSpacedPoints(500);
    if (trainNear(x, z, 0.6)) return false;
  }
  return true;
}
function mount(it) {
  if (state.mount || dialogue.open || state.minigame || state.ko) return;
  const cfg = VEHICLES[it.vtype];
  closePanel(); state.path = []; marker.visible = false;
  state.mount = { it, cfg, speed: 0, heading: it.heading, lift: 0, phase: 0, from: player.group.position.clone() };
  it.beacon.group.visible = false; state.nearby = null; // refresh the prompt to 'Dismount'
  player.play('interact'); sfx.open();
  if (it.vtype === 'moto') tahiti.onMotoMount(state.mount);
  if (!state.rideHint) { state.rideHint = true; toast(`${isTouch ? 'Tap to steer' : 'WASD to steer · Shift for speed'} · E to get off${isTouch ? '' : ' · R returns it to its rack'}`); }
}
function dismount(force = false) {
  const m = state.mount; if (!m) return;
  const p = player.group.position, h = m.heading;
  const cands = [[Math.cos(h), -Math.sin(h)], [-Math.cos(h), Math.sin(h)], [-Math.sin(h), -Math.cos(h)], [Math.sin(h), Math.cos(h)]];
  let spot = null;
  for (const d of [1.1, 1.6]) for (const [ox, oz] of cands) { const x = p.x + ox * d, z = p.z + oz * d; if (solidFree(x, z) && nav.isWalkable(x, z, 0.32)) { spot = { x, z }; break; } if (spot) break; }
  if (!spot && !force) { toast('No room to get off here. Ride a little further.'); return; }
  spot = spot || { x: p.x, z: p.z };
  const it = m.it;
  it.x = p.x; it.z = p.z; it.heading = h;
  it.beacon.group.position.set(p.x, heightAt(p.x, p.z) + 0.04, p.z); it.beacon.group.visible = true;
  it.hit.position.set(p.x, 1.3, p.z);
  state.mount = null; state.nearby = null;
  player.pose = null;
  if (it.vtype === 'moto') { setEngine(null); tahiti.onMotoDismount(spot); }
  p.set(spot.x, heightAt(spot.x, spot.z), spot.z);
  player.heading = Math.atan2(it.x - spot.x, it.z - spot.z);
  sfx.close();
}
function resetMount() {
  const m = state.mount; if (!m) return;
  const home = m.it.home;
  player.group.position.set(home.x, heightAt(home.x, home.z), home.z);
  m.heading = home.heading; m.speed = 0;
  toast(`Back at the ${m.cfg.label} rack.`);
}
const rideDir = new THREE.Vector3();
function rideUpdate(dt, t, kx, kz, running) {
  const m = state.mount, cfg = m.cfg, it = m.it, pos = player.group.position;
  let want = false;
  if (!state.minigame && !state.ko) {
    if (kx || kz) { state.path = []; marker.visible = false; rideDir.set(0, 0, 0).addScaledVector(right, kx).addScaledVector(fwd, kz).normalize(); want = true; }
    else if (state.path.length) {
      const wp = state.path[0], dx = wp.x - pos.x, dz = wp.z - pos.z, d = Math.hypot(dx, dz);
      if (d < 0.5) { state.path.shift(); if (!state.path.length) { marker.visible = false; state.pendingOpen = null; } }
      else { rideDir.set(dx / d, 0, dz / d); want = true; }
    }
  }
  const hold = it.vtype === 'moto' && !tahiti.passengerReady();               // wait for the passenger to climb on
  const target = want && !hold ? (running || state.path.length > 6 ? cfg.boost : cfg.speed) : 0;
  const dv = target - m.speed;
  m.speed += Math.max(-cfg.brake * dt, Math.min(cfg.accel * dt, dv));
  if (want) {
    const h = Math.atan2(rideDir.x, rideDir.z);
    const turn = Math.atan2(Math.sin(h - m.heading), Math.cos(h - m.heading));
    m.heading += turn * Math.min(1, dt * cfg.turn);
    if (Math.abs(turn) > 2.2) m.speed *= 1 - Math.min(1, dt * 3);          // slow for a hard U-turn
  }
  const vx = Math.sin(m.heading) * m.speed, vz = Math.cos(m.heading) * m.speed;
  const nx = pos.x + vx * dt, nz = pos.z + vz * dt;
  let blocked = false;
  if (vehicleFree(nx, pos.z, cfg)) pos.x = nx; else blocked = true;
  if (vehicleFree(pos.x, nz, cfg)) pos.z = nz; else blocked = true;
  if (blocked) m.speed *= 1 - Math.min(1, dt * 6);
  velocity.set(vx, 0, vz);
  const ground = heightAt(pos.x, pos.z);
  m.lift = Math.min(1, m.lift + dt / 0.35);                                      // mount: hop up into the seat
  const hop = Math.sin(m.lift * Math.PI) * 0.25;
  // model follows Nathan
  const g = it.model.group;
  const back = it.vtype === 'moto' ? 0.28 : 0;                                  // bike sits a little behind the driver so the passenger fits
  g.position.set(pos.x - Math.sin(m.heading) * back, ground, pos.z - Math.cos(m.heading) * back);
  g.rotation.y = m.heading + cfg.yaw;
  it.x = pos.x; it.z = pos.z;
  const sp = Math.abs(m.speed);
  if (it.vtype === 'bike') {
    for (const w of it.model.wheels) w.rotation.x += (m.speed * dt) / 0.34;
    m.phase += (m.speed * dt) / 0.34 * 0.55;
    it.model.crank.rotation.x = m.phase;
    player.pedal = m.phase;
    g.rotation.z = Math.atan2(Math.sin(rideDir.x * 0), 1) * 0;                  // keep upright
    pos.y = ground + cfg.seatY * m.lift + hop;
  } else if (it.vtype === 'moto') {
    for (const w of it.model.wheels) w.rotation.x += (m.speed * dt) / 0.36;
    g.rotation.z = -Math.atan2(Math.sin(Math.atan2(rideDir.x, rideDir.z) - m.heading), 1) * Math.min(1, sp / 6) * 0.25 * (want ? 1 : 0);   // lean into turns
    pos.y = ground + cfg.seatY * m.lift + hop + (sp > 0.2 ? Math.sin(t * 40) * 0.006 : 0);
    setEngine(Math.min(1, sp / cfg.boost));
    if (sp > 2 && tileAt(map, pos.x, pos.z)?.type?.match(/sand|beach|dirt|path/) && Math.random() < dt * sp * 2) dust(pos.x - Math.sin(m.heading) * 0.8, pos.z - Math.cos(m.heading) * 0.8);
  } else {
    const trot = sp > 4.6;
    m.phase += dt * sp * (trot ? 5.5 : 4.2);
    const amp = Math.min(1, sp / 2) * (trot ? 0.7 : 0.45);
    it.model.legs.forEach((l, i) => { l.rotation.z = Math.sin(m.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? (trot ? Math.PI : Math.PI / 2) : 0)) * amp; });
    it.model.head.rotation.z = sp > 0.1 ? Math.sin(m.phase * 2) * 0.08 : Math.sin(t * 0.9) * 0.1 - 0.12;
    it.model.tail.rotation.x = Math.sin(t * 2.2) * 0.3 + (trot ? 0.3 : 0);
    const bounce = trot ? Math.abs(Math.sin(m.phase)) * 0.08 : Math.abs(Math.sin(m.phase)) * 0.03 * Math.min(1, sp);
    g.position.y = ground + bounce;
    pos.y = ground + cfg.seatY * m.lift + hop + bounce;
  }
  player.heading = m.heading;
  player.pose = cfg.pose;
  player.update(dt, zeroV, t);
}
const zeroV = new THREE.Vector3();
// little sand puffs behind the motorcycle
const dustPool = [];
function dust(x, z) {
  let d = dustPool.find((q) => !q.m.visible);
  if (!d) { if (dustPool.length > 40) return; const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), new THREE.MeshBasicMaterial({ color: 0xe9d6a8, transparent: true, depthWrite: false })); scene.add(m); d = { m }; dustPool.push(d); }
  d.t = 0; d.m.visible = true; d.m.position.set(x + (Math.random() - 0.5) * 0.3, heightAt(x, z) + 0.12, z + (Math.random() - 0.5) * 0.3);
}
function dustTick(dt) { for (const d of dustPool) if (d.m.visible) { d.t += dt; d.m.position.y += dt * 0.5; d.m.scale.setScalar(1 + d.t * 2.5); d.m.material.opacity = 0.55 * (1 - d.t / 0.8); if (d.t > 0.8) d.m.visible = false; } }

// ---------------- Islands: Island 01 (public) and Tahiti (Island 02) ----------------
// Each island is its own Tiled map; switching rebuilds the world in place
// behind the flight cinematic, so there is no loading screen.
const LEVELS = { island1: 'maps/town.tmj', tahiti: 'maps/tahiti.tmj' };
const mapCache = {};
let kitOverrides = null;
function makeNav() {
  return new NavGrid({
    size: map.width, cell: 0.5, islandRadius: map.props.navRadius || (map.props.islandRadius || 44) - 2.5, colliders: world.colliders,
    blocked: (x, z) => {
      for (const f of world.floors) if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) return false;
      const t = tileAt(map, x, z); return !t || !t.walkable;
    },
  });
}
/**
 * Private-island gate. Real protection lives on a server (see docs/TAHITI.md):
 * a Netlify Function answers /.netlify/functions/tahiti-session with
 * {allowed} for a signed session cookie. Until that exists the prototype
 * runs open, and ships only placeholder, non-personal Tahiti content.
 */
async function checkTahitiAccess() {
  try {
    const r = await fetch('/.netlify/functions/tahiti-session', { credentials: 'include', headers: { accept: 'application/json' } });
    if (r.status === 401 || r.status === 403) return { allowed: false };
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) { const j = await r.json(); if (typeof j.allowed === 'boolean') return { allowed: j.allowed }; }
  } catch { /* no access server yet */ }
  return { allowed: true, prototype: true };
}
async function loadTahitiData() {
  if (state.tahiti) return state.tahiti;
  const data = await fetch(`${BASE}data/tahiti.json`, { cache: 'no-cache' }).then((r) => r.json());
  const have = new Set((state.content.npcs || []).map((n) => n.id));
  const SKIP = new Set(['id', 'name', 'role', 'district', 'lines', 'topics', 'theme', 'companion', 'horseColor', 'scripted', 'sameAs']);
  for (const n of data.npcs || []) {
    if (have.has(n.id)) continue;
    // same person as on Island 01: same model (appearance), Tahiti name and lines
    const src = n.sameAs && state.content.npcs.find((x) => x.id === n.sameAs);
    const look = src ? Object.fromEntries(Object.entries(src).filter(([k]) => !SKIP.has(k))) : {};
    state.content.npcs.push({ ...look, ...n });
  }
  state.tahiti = data;
  return data;
}
async function switchLevel(name) {
  if (name === 'tahiti') await loadTahitiData();
  const m = mapCache[name] || (mapCache[name] = await loadTiledMap(`${BASE}${LEVELS[name]}`));
  if (state.level === 'tahiti') { tahiti.exit(); $('#tahiti-hints')?.classList.add('hidden'); hintKey = ''; }
  if (state.mount) dismount(true);
  setEngine(null);
  scene.remove(world.root);
  map = m; state.level = name;
  world = buildWorld(scene, state.content, map, kitOverrides);
  nav = makeNav();
  railPts = null;
  world.interactables.forEach((it) => { if (isDone(it)) markVisited(it, true); });
  const jet = world.apis.private_jet;
  if (jet) { jet.home = jet.group.position.clone(); jet.homeRot = jet.group.rotation.y; }
  setupLabels(); setupMinimap();
  state.nearby = null; state.talkingTo = null; state.path = [];
  if (name === 'tahiti') tahiti.enter();
}

// ---------------- Flight cinematic ----------------
// Keyframed jet paths per island (metres, relative to the parked jet's ground).
const FLIGHT = {
  island1: {
    out: [[2.4, 0, 36.8], [-2, 0, 38.6], [-6.5, 0, 40.6], [-6.5, 0, 40.6, 0], [8, 0, 40.6], [24, 3.5, 41.5], [62, 15, 47]],
    outT: [0, 0.8, 1.5, 2.0, 3.3, 4.3, 6.0],
    in: [[-95, 16, 40.6], [-40, 7, 40.6], [-7, 0, 40.6], [5, 0, 40.6], [5, 0, 38.6], [2.4, 0, 36.8, 0]],
    inT: [0, 2.2, 3.5, 4.7, 5.3, 6.0],
  },
  tahiti: {
    out: [[-6, 0, 11.8], [-2.5, 0, 13.5], [-1.5, 0, 16.5], [-1.5, 0, 16.5, Math.PI], [-18, 0, 16.5], [-32, 4, 16.2], [-82, 15, 12]],
    outT: [0, 0.7, 1.3, 1.8, 3.2, 4.2, 6.0],
    in: [[-95, 16, 16.5], [-45, 7, 16.5], [-26, 0, 16.5], [-10, 0, 16.5], [-9, 0, 14.2], [-6, 0, 11.8, 0]],
    inT: [0, 2.2, 3.5, 4.7, 5.3, 6.0],
  },
};
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
function samplePath(keys, times, tt) {
  const end = times[times.length - 1];
  const t = Math.max(0, Math.min(end, tt));
  let i = 0; while (i < times.length - 2 && t > times[i + 1]) i++;
  const u = ease((t - times[i]) / Math.max(1e-6, times[i + 1] - times[i]));
  const a = keys[i], b = keys[i + 1];
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, z: a[2] + (b[2] - a[2]) * u, rot: b[3], u, seg: i };
}
function poseJet(jet, s, prev) {
  const g = jet.group, base = jet.home.y;
  const dx = s.x - prev.x, dz = s.z - prev.z, dy = s.y - prev.y, h = Math.hypot(dx, dz);
  g.position.set(s.x, base + s.y, s.z);
  if (s.rot !== undefined && h < 0.02) {
    g.rotation.y += Math.atan2(Math.sin(s.rot - g.rotation.y), Math.cos(s.rot - g.rotation.y)) * 0.12;
  } else if (h > 0.004) {
    const want = Math.atan2(-dz, dx);
    g.rotation.y += Math.atan2(Math.sin(want - g.rotation.y), Math.cos(want - g.rotation.y)) * 0.25;
  }
  g.rotation.z += ((h > 0.004 ? Math.atan2(dy, h) * 0.8 : 0) - g.rotation.z) * 0.15;
}
function cineUI(on, { bars = true } = {}) {
  let el = $('#cine');
  if (!el) {
    el = document.createElement('div'); el.id = 'cine';
    el.innerHTML = '<div class="cine-bar top"></div><div class="cine-bar bottom"></div><div class="cine-clouds"></div><p class="cine-caption" aria-live="polite"></p><button type="button" class="btn cine-skip">Skip ▸</button>';
    document.body.append(el);
    el.querySelector('.cine-skip').addEventListener('click', () => (state.groupScene ? endGroupScene() : skipCine()));
  }
  el.classList.toggle('on', on); el.classList.toggle('bars', on && bars);
  document.body.classList.toggle('cine-on', on && bars); // HUD steps aside during the flight
  return el;
}
function cineCaption(text) { const c = $('#cine .cine-caption'); if (c) c.textContent = text || ''; }
function cineClouds(v) { const c = $('#cine .cine-clouds'); if (c) c.style.opacity = String(v); }

async function startFlight(to) {
  if (state.cine || state.groupScene) return;
  if (dialogue.open) dialogue.close();
  if (state.mount) dismount(true);
  if (state.seated) standUp();
  if (to === 'tahiti') {
    const access = await checkTahitiAccess();
    if (!access.allowed) { toast('Tahiti is a private island. Ask Nathan for an invite.'); return; }
    if (access.prototype) toast('Tahiti prototype: private access is not switched on yet.');
  }
  const from = state.level;
  const jet = world.apis.private_jet;
  if (!jet) return;
  if (!jet.home) { jet.home = jet.group.position.clone(); jet.homeRot = jet.group.rotation.y; }
  closePanel();
  state.minigame = 'flight';
  state.cine = { from, to, phase: 'board', t: 0, vel: new THREE.Vector3(), prev: { x: 0, y: 0, z: 0 }, zoom0: state.zoom };
  state.path = []; marker.visible = false;
  cineUI(true); cineCaption(to === 'tahiti' ? 'Next stop: Tahiti' : 'Heading home to Island 01');
}
function cineCamera(x, z, zoom) {
  state.camOverride = { x, z };
  if (Math.abs(state.zoom - zoom) > 0.002) { state.zoom = zoom; resize(); }
}
async function cineSwap(c) {
  c.swapping = true;
  await switchLevel(c.to);
  const jet = world.apis.private_jet;
  jet.setStairs(false); jet.setDoor(false); jet.setPilot(true);
  c.pilot = world.npcs.find((n) => n.npcId === 'harris');
  if (c.pilot) { c.pilot.frozen = true; c.pilot.character.group.visible = false; c.pilot.beacon.group.visible = false; }
  if (state.level === 'tahiti') cineCaption(state.tahiti?.places?.tahiti || 'Tahiti');
  const k = FLIGHT[c.to].in[0];
  jet.group.position.set(k[0], jet.home.y + k[1], k[2]); jet.group.rotation.y = 0;
  c.prev = { x: k[0], y: k[1], z: k[2] };
  c.phase = 'in'; c.t = 0; c.swapping = false;
}
function runCine(dt) {
  const c = state.cine; if (!c || c.swapping) return;
  const jet = world.apis.private_jet, p = player.group.position;
  c.t += dt;
  c.vel.set(0, 0, 0);
  if (c.phase === 'board') {
    // Nathan walks to the stairs, the door opens, he climbs aboard
    if (!c.door) {
      c.door = jet.doorPoint(); c.start = p.clone(); jet.setDoor(true); jet.setStairs(true);
      c.pilot = world.npcs.find((n) => n.npcId === 'harris');
      if (c.pilot) { c.pilot.frozen = true; c.pilotStart = c.pilot.character.group.position.clone(); }
    }
    // Harris boards first (0 – 0.7 s) and takes the controls
    if (c.pilot) {
      const hu = Math.min(1, c.t / 0.7), hp = c.pilot.character.group.position;
      hp.set(c.pilotStart.x + (c.door.x - c.pilotStart.x) * hu, heightAt(hp.x, hp.z) + hu * 0.7, c.pilotStart.z + (c.door.z - c.pilotStart.z) * hu);
      c.pilot.character.update(dt, hu < 1 ? new THREE.Vector3(c.door.x - c.pilotStart.x, 0, c.door.z - c.pilotStart.z).divideScalar(0.7) : new THREE.Vector3(), c.t);
      if (hu >= 1) { c.pilot.character.group.visible = false; c.pilot.beacon.group.visible = false; jet.setPilot(true); }
    }
    // then Nathan (0.3 – 1.2 s)
    const u = Math.max(0, Math.min(1, (c.t - 0.3) / 0.9));
    const tx = c.start.x + (c.door.x - c.start.x) * u, tz = c.start.z + (c.door.z - c.start.z) * u;
    if (u > 0 && u < 1) { c.vel.set(c.door.x - c.start.x, 0, c.door.z - c.start.z).divideScalar(0.9); p.set(tx, heightAt(tx, tz) + u * 0.7, tz); }
    cineCamera(p.x, p.z, state.zoom + (1.15 - state.zoom) * 0.08);
    if (c.t > 1.25) { player.group.visible = false; jet.setDoor(false); jet.setPilot(true); }
    if (c.t > 1.5) { jet.setStairs(false); c.phase = 'out'; c.t = 0; c.prev = { x: jet.home.x, y: 0, z: jet.home.z }; }
    return;
  }
  if (c.phase === 'out') {
    // taxi, take-off and climb out over the ocean while the camera pulls back
    const F = FLIGHT[c.from], end = F.outT[F.outT.length - 1];
    const s = samplePath(F.out, F.outT, c.t);
    poseJet(jet, s, c.prev); c.prev = s;
    const climb = Math.max(0, Math.min(1, (c.t - F.outT[3]) / (end - F.outT[3])));
    cineCamera(s.x, s.z, 1.15 - 0.85 * ease(climb));
    p.set(s.x, jet.home.y + s.y, s.z);
    if (c.t > end - 0.7) cineClouds(Math.min(1, (c.t - (end - 0.7)) / 0.6));
    if (c.t >= end) cineSwap(c);
    return;
  }
  if (c.phase === 'in') {
    // wide view of the island, the approach, touchdown, then the camera closes in
    const F = FLIGHT[c.to], end = F.inT[F.inT.length - 1];
    if (c.t < 0.7) cineClouds(1 - c.t / 0.7); else cineClouds(0);
    const s = samplePath(F.in, F.inT, c.t);
    poseJet(jet, s, c.prev); c.prev = s;
    const land = Math.max(0, Math.min(1, (c.t - F.inT[1]) / (end - F.inT[1])));
    const wide = 1 - Math.min(1, c.t / F.inT[2]);
    const cx = s.x * (1 - wide * 0.55), cz = s.z * (1 - wide * 0.55);
    cineCamera(cx, cz, 0.3 + 1.0 * ease(land));
    p.set(s.x, jet.home.y + s.y, s.z);
    if (c.t >= end) {
      jet.group.position.copy(jet.home); jet.group.rotation.set(0, jet.homeRot, 0);
      c.phase = 'off'; c.t = 0;
    }
    return;
  }
  if (c.phase === 'off') {
    // stairs down, door open, Nathan steps out and walks clear of the jet
    jet.setStairs(true); jet.setDoor(true);
    const door = jet.doorPoint(), spot = map.spawn && state.level === 'tahiti' ? map.spawn : { x: door.x, z: door.z + 1.4 };
    if (c.pilot) {
      // Harris climbs out first and heads back to his spot by the jet
      if (!c.pilotGoal) { const r = c.pilot.route, a = r.pts[r.seg]; c.pilotGoal = a.clone(); jet.setPilot(false); }
      const hu = Math.min(1, c.t / 1.1), hp = c.pilot.character.group.position;
      c.pilot.character.group.visible = true;
      hp.set(door.x + (c.pilotGoal.x - door.x) * hu, 0, door.z + (c.pilotGoal.z - door.z) * hu); hp.y = heightAt(hp.x, hp.z) + (1 - hu) * 0.7;
      c.pilot.character.update(dt, hu < 1 ? new THREE.Vector3(c.pilotGoal.x - door.x, 0, c.pilotGoal.z - door.z).divideScalar(1.1) : new THREE.Vector3(), c.t);
    }
    if (c.t > 0.4) {
      player.group.visible = true;
      const u = Math.min(1, (c.t - 0.4) / 1.0);
      const tx = door.x + (spot.x - door.x) * u, tz = door.z + (spot.z - door.z) * u;
      p.set(tx, heightAt(tx, tz) + (1 - u) * 0.7, tz);
      if (u < 1) c.vel.set(spot.x - door.x, 0, spot.z - door.z).divideScalar(1.0);
    }
    cineCamera(p.x, p.z, state.zoom + (1 - state.zoom) * 0.1);
    if (c.t > 1.6) endCine();
  }
}
async function skipCine() {
  const c = state.cine; if (!c || c.skipping) return;
  c.skipping = true;
  cineClouds(1);
  if (c.phase === 'board' || c.phase === 'out') { if (!c.swapping) await cineSwap(c); else while (c.swapping) await new Promise((r) => setTimeout(r, 50)); }
  const jet = world.apis.private_jet;
  jet.group.position.copy(jet.home); jet.group.rotation.set(0, jet.homeRot, 0);
  jet.setStairs(true); jet.setDoor(false);
  const door = jet.doorPoint(), spot = map.spawn && state.level === 'tahiti' ? map.spawn : { x: door.x, z: door.z + 1.4 };
  player.group.position.set(spot.x, heightAt(spot.x, spot.z), spot.z);
  endCine();
}
function endCine() {
  const jet = world.apis.private_jet;
  jet?.setDoor(false); jet?.setStairs(true); jet?.setPilot(false);
  const pilot = world.npcs.find((n) => n.npcId === 'harris');
  if (pilot) {
    const r = pilot.route, a = r.pts[r.seg], hp = pilot.character.group.position;
    if (!state.cine?.pilotGoal) hp.set(a.x, heightAt(a.x, a.z), a.z);
    pilot.frozen = false; pilot.character.group.visible = true; pilot.beacon.group.visible = true;
  }
  player.group.visible = true;
  const p = player.group.position; p.y = heightAt(p.x, p.z);
  state.cine = null; state.minigame = null; state.camOverride = null;
  state.zoom = 1; resize();
  camTarget.copy(p);
  cineClouds(0); cineCaption(''); cineUI(false);
  toast(state.level === 'tahiti' ? 'Welcome to Tahiti' : 'Back on Island 01');
  if (state.level === 'tahiti') tahiti.onArrive();
}

// ---------------- Group conversations (Join the Gang / Join the Outlaws) ----------------
function runGroupScene(it) {
  const g = state.tahiti?.groups?.[it.groupId];
  if (!g || state.groupScene || dialogue.open) return;
  closePanel(); state.path = []; marker.visible = false;
  if (state.seated) standUp();
  const members = (g.members || []).map((id) => world.npcs.find((n) => n.npcId === id)).filter(Boolean);
  const p = player.group.position;
  p.set(g.slot.x, heightAt(g.slot.x, g.slot.z), g.slot.z);
  player.heading = g.slot.heading ?? 0;
  const cx = members.reduce((a, n) => a + n.x, p.x) / (members.length + 1), cz = members.reduce((a, n) => a + n.z, p.z) / (members.length + 1);
  for (const n of members) n.focus = new THREE.Vector3(cx, 0, cz);
  state.groupScene = { g, members, i: -1, prevClose: dialogue.onClose, centre: { x: cx, z: cz } };
  $('#prompt').classList.add('hidden');
  state.camOverride = { x: cx, z: cz }; state.zoom = g.zoom || 1.35; resize();
  cineUI(true, { bars: false }); cineCaption('');
  dialogue.onClose = () => nextGroupLine();
  nextGroupLine();
}
function nextGroupLine() {
  const s = state.groupScene; if (!s) return;
  s.i++;
  const line = s.g.lines[s.i];
  for (const n of s.members) { n.character.talking = false; n.focus = new THREE.Vector3(s.centre.x, 0, s.centre.z); }
  player.talking = false;
  if (!line) return endGroupScene();
  const who = line.who === 'nathan' ? null : s.members.find((n) => n.npcId === line.who);
  const def = line.who === 'nathan' ? { name: state.content.profile?.name?.split(' ')[0] || 'Nathan', color: '#ff6a3d' } : (state.content.npcs || []).find((n) => n.id === line.who) || { name: '?' };
  const sp = who ? who.character.group.position : player.group.position;
  for (const n of s.members) if (n !== who) n.focus = sp.clone();
  if (who) { who.character.talking = true; who.character.play(line.gesture || 'nod'); } else { player.talking = true; player.play('wave'); player.lookAt(new THREE.Vector3(s.centre.x, 0, s.centre.z)); }
  setTimeout(() => { if (state.groupScene === s) dialogue.start({ name: def.name, color: def.color, role: def.role, lines: [line.text], topics: [] }); }, 0);
}
function endGroupScene() {
  const s = state.groupScene; if (!s) return;
  state.groupScene = null;
  dialogue.onClose = s.prevClose;
  if (dialogue.open) dialogue.close();
  for (const n of s.members) { n.focus = null; n.character.talking = false; }
  player.talking = false;
  state.camOverride = null; state.zoom = 1; resize();
  cineUI(false);
}

// ---------------- Lighthouse finale ----------------
function runFinale(it) {
  closePanel();
  face(it); player.play('interact');
  const lamp = world.apis.lighthouse;
  const c = state.content, s = state.save;
  state.minigame = 'finale';
  setTimeout(() => {
    lamp?.setLit(true);
    sfx.finale();
    if (!s.finale) { s.finale = true; persist(); }
    markVisited(it);
    // slow cinematic pull-back over the whole island
    const from = { zoom: state.zoom, x: camTarget.x, z: camTarget.z };
    const to = { zoom: 0.42, x: 0, z: 6 };
    const t0 = performance.now(), dur = reducedMotion ? 1 : 3200;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / dur), e = easeOutCubic(k);
      state.zoom = from.zoom + (to.zoom - from.zoom) * e;
      state.camOverride = { x: from.x + (to.x - from.x) * e, z: from.z + (to.z - from.z) * e };
      resize();
      if (k < 1) requestAnimationFrame(tick); else showCredits();
    };
    requestAnimationFrame(tick);
  }, reducedMotion ? 0 : 700);

  function showCredits() {
    const main = MAIN_DISTRICTS.filter((d) => s.chapters.includes(d.id)).length;
    const mems = (c.memories || []).length;
    const email = (c.links || []).find((l) => l.url.startsWith('mailto:'));
    const el = $('#finale');
    el.innerHTML = `
      <div class="finale-card window" role="dialog" aria-labelledby="finale-title">
        <div class="window-bar"><span class="title">nathan.exe — process complete</span></div>
        <div class="finale-body">
          <img class="mini-portrait" src="${portraitURL()}" alt="">
          <p class="eyebrow">END OF ISLAND 01</p>
          <h2 id="finale-title">Thanks for playing my story.</h2>
          <p>${esc(chapterFor(c, 'lighthouse')?.body?.[0] || "If you'd like to build something together, I'd love to hear from you.")}</p>
          <div class="finale-stats"><span>◆ ${main}/${MAIN_DISTRICTS.length} chapters</span><span>✦ ${s.memories.length}/${mems} memories</span><span>⏱ ${formatTime(s.seconds)}</span></div>
          <div class="transmit">
            ${email ? `<a class="btn primary" href="${esc(safeUrl(email.url))}?subject=${encodeURIComponent('Hello from NATHAN.EXE')}">Say hello ✉</a>` : ''}
            ${c.profile?.resumeUrl ? `<a class="btn" href="${esc(safeUrl(c.profile.resumeUrl))}" target="_blank" rel="noopener">Resume ↗</a>` : ''}
            ${(c.links || []).filter((l) => !l.url.startsWith('mailto:')).map((l) => `<a class="btn" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}
          </div>
          <p class="finale-credits">Designed, built and lived by ${esc(c.profile?.name || 'Nathan')}.</p>
          <button class="btn dark" id="finale-close">Keep exploring</button>
        </div>
      </div>`;
    el.classList.remove('hidden');
    $('#finale-close').focus();
    $('#finale-close').addEventListener('click', endFinale);
  }
  function endFinale() {
    $('#finale').classList.add('hidden');
    state.camOverride = null;
    state.zoom = 1; resize();
    state.minigame = null;
  }
}

// ---------------- Memory Line (fast travel between chapters) ----------------
function openStations(here) {
  face(here);
  const c = state.content;
  // Stops are listed in story order (Montfort → Tomsk → TCE → Airport), not track order
  const rows = [...world.stations].sort((a, b) => (a.order || 0) - (b.order || 0)).map((st) => {
    const ch = chapterFor(c, st.district);
    const cur = st === here;
    const sub = st.tagline || (ch ? `${ch.title}${ch.period ? ' · ' + ch.period : ''}` : '');
    return `<li class="${cur ? 'current' : ''}">
      <div><b>${st.order ? String(st.order).padStart(2, '0') + ' · ' : ''}${esc(st.name)}</b><span>${esc(sub)}</span></div>
      ${cur ? '<em>You are here</em>' : `<button class="btn primary" data-board="${esc(st.stationId)}">Board →</button>`}</li>`;
  }).join('');
  showPanel('memory-line/timetable.txt', `
    <p class="eyebrow">MEMORY LINE</p>
    <h2 id="panel-title">Where to next?</h2>
    <p class="subtitle">The line loops the town, one stop per chapter of my life.</p>
    <ol class="timetable">${rows}</ol>`, here, 'stations');
  $('#panel-body').querySelectorAll('[data-board]').forEach((b) => b.addEventListener('click', () => {
    const dest = world.stations.find((s) => s.stationId === b.dataset.board);
    if (dest) travel(here, dest);
  }));
}

// Pixel-art Memory Line train (engine + two carriages), drawn with crisp SVG rects.
const TRAIN_SVG = `<svg viewBox="0 0 66 22" width="132" height="44" shape-rendering="crispEdges" aria-hidden="true">
  <rect x="1" y="6" width="19" height="11" fill="#ffd257"/><rect x="1" y="5" width="19" height="2" fill="#2a2440"/>
  <rect x="3" y="9" width="4" height="4" fill="#fff1c0"/><rect x="9" y="9" width="4" height="4" fill="#fff1c0"/><rect x="15" y="9" width="3" height="4" fill="#fff1c0"/>
  <rect x="1" y="14" width="19" height="1" fill="#fff8ea"/>
  <rect x="22" y="6" width="19" height="11" fill="#2bb3a3"/><rect x="22" y="5" width="19" height="2" fill="#2a2440"/>
  <rect x="24" y="9" width="4" height="4" fill="#fff1c0"/><rect x="30" y="9" width="4" height="4" fill="#fff1c0"/><rect x="36" y="9" width="3" height="4" fill="#fff1c0"/>
  <rect x="22" y="14" width="19" height="1" fill="#fff8ea"/>
  <rect x="43" y="6" width="17" height="11" fill="#ff6a3d"/><rect x="43" y="5" width="13" height="2" fill="#2a2440"/>
  <rect x="45" y="8" width="6" height="5" fill="#fff1c0"/><rect x="56" y="2" width="3" height="5" fill="#2a2440"/>
  <rect x="60" y="11" width="4" height="6" fill="#2a2440"/><rect x="64" y="12" width="2" height="2" fill="#ffe48a"/>
  <rect x="43" y="14" width="17" height="1" fill="#fff8ea"/>
  <rect x="20" y="13" width="2" height="2" fill="#2a2440"/><rect x="41" y="13" width="2" height="2" fill="#2a2440"/>
  <g class="wheels" fill="#2a2440"><rect x="3" y="17" width="4" height="4"/><rect x="14" y="17" width="4" height="4"/><rect x="24" y="17" width="4" height="4"/><rect x="35" y="17" width="4" height="4"/><rect x="45" y="17" width="4" height="4"/><rect x="54" y="17" width="4" height="4"/></g>
</svg>`;

function travel(from, dest) {
  if (state.mount) dismount(true);
  closePanel();
  const c = state.content;
  const ch = chapterFor(c, dest.district) || {};
  const el = $('#travel');
  const order = world.stations;
  const i0 = order.indexOf(from), i1 = order.indexOf(dest);
  el.innerHTML = `
    <div class="travel-card">
      <p class="travel-line">MEMORY LINE · ${esc(from.name)} → ${esc(dest.name)}</p>
      <div class="travel-track">${order.map((s, i) => `<i class="${i === i0 ? 'from' : ''}${i === i1 ? ' to' : ''}"></i>`).join('')}<div class="travel-train${i1 < i0 ? ' reverse' : ''}" style="--from:${i0};--to:${i1};--n:${order.length - 1}">${TRAIN_SVG}<span class="puff"></span><span class="puff"></span><span class="puff"></span></div></div>
      <p class="travel-period">${esc(ch.period || '')}</p>
      <h2>${esc(ch.title || dest.name)}</h2>
      <p class="travel-sub">${esc(ch.subtitle || '')}</p>
      <button class="travel-skip" type="button">Skip ▸</button>
    </div>`;
  el.classList.remove('hidden');
  sfx.whistle();
  state.minigame = 'travel'; // freezes movement while the card is up
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener('keydown', onKey, true);
    const off = 1.2;
    const a = Math.atan2(dest.x, dest.z);
    player.group.position.set(dest.x, heightAt(dest.x, dest.z), dest.z);
    player.heading = a + Math.PI;
    state.path = []; state.pendingOpen = null; marker.visible = false;
    camTarget.copy(player.group.position); camTarget.y = 0;
    el.classList.add('leaving');
    setTimeout(() => { el.classList.add('hidden'); el.classList.remove('leaving'); state.minigame = null; persist(); }, reducedMotion ? 0 : 450);
    if (!state.save.chapters.includes(dest.district)) toast(`Arrived: ${dest.name}. Find the ◆ to open this chapter.`);
    void off;
  };
  const onKey = (e) => { e.preventDefault(); e.stopPropagation(); finish(); };
  window.addEventListener('keydown', onKey, true);
  el.querySelector('.travel-skip').addEventListener('click', finish);
  el.addEventListener('click', finish, { once: true });
  setTimeout(finish, reducedMotion ? 600 : 3200);
}

function openAlbum() {
  const s = state.save, mems = state.content.memories || [];
  const byDistrict = DISTRICTS.map((d) => ({ d, list: mems.filter((m) => m.district === d.id) })).filter((g) => g.list.length);
  showPanel('memories/album', `
    <p class="eyebrow">SAVE FILE · ${formatTime(s.seconds)} played</p>
    <h2 id="panel-title">Memory album</h2>
    <p class="subtitle">${s.memories.length} of ${mems.length} memories found · ${MAIN_DISTRICTS.filter((d) => s.chapters.includes(d.id)).length} of ${MAIN_DISTRICTS.length} chapters</p>
    ${byDistrict.map(({ d, list }) => `<p class="eyebrow" style="margin-top:14px">${esc(d.name)}</p>
      <ul class="album">${list.map((m) => s.memories.includes(m.id)
        ? `<li class="found"><button type="button" data-mem="${esc(m.id)}">✦ ${esc(m.title)}</button></li>`
        : '<li class="locked">✧ ???</li>').join('')}</ul>`).join('')}
    <div class="transmit"><button class="btn" id="new-game">New game</button></div>`);
  $('#panel-body').querySelectorAll('[data-mem]').forEach((b) => b.addEventListener('click', () => unlockMemory(b.dataset.mem, null)));
  $('#new-game').addEventListener('click', () => {
    if (!confirm('Start a new save file? Your progress in this browser will be cleared.')) return;
    state.resetting = true;
    state.save = resetSave();
    location.reload();
  });
}

function markVisited(it, silent) {
  it.visited = true;
  if (!it.beacon) return;
  if (it.kind === 'memory') { it.beacon.group.visible = false; if (it.ground) it.ground.group.visible = false; return; }
  if (it.beacon.setVisited) it.beacon.setVisited();
  if (!silent) it.beacon.gem.scale.setScalar(1.6);
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3600);
}

let lastPersist = 0;
function persist() {
  if (state.resetting) return;
  const p = player.group.position;
  if (state.level !== 'tahiti' && !state.cine) state.save.pos = { x: +p.x.toFixed(2), z: +p.z.toFixed(2) };
  writeSave(state.save);
}

// ---------------- Minimap (drawn from the Tiled ground layer) ----------------
const MM = { size: 150, scale: 0, bg: null, ctx: null, frame: 0 };
function setupMinimap() {
  const cv = $('#minimap');
  MM.ctx = cv.getContext('2d');
  cv.width = cv.height = MM.size;
  MM.scale = MM.size / map.width;
  const bg = document.createElement('canvas');
  bg.width = bg.height = MM.size;
  const g = bg.getContext('2d');
  g.fillStyle = '#2fb3c9'; g.fillRect(0, 0, MM.size, MM.size);
  for (let j = 0; j < map.height; j++) for (let i = 0; i < map.width; i++) {
    const gid = map.ground[j * map.width + i];
    if (!gid) continue;
    g.fillStyle = map.tiles.get(gid).color;
    g.fillRect(i * MM.scale, j * MM.scale, Math.ceil(MM.scale), Math.ceil(MM.scale));
  }
  g.fillStyle = '#1e1b2e';
  for (const o of map.objects) {
    if (o.type === 'hedge') { g.fillStyle = '#5f7f3f'; g.fillRect((o.x - o.w / 2 + map.half) * MM.scale, (o.z - o.d / 2 + map.half) * MM.scale, Math.max(1, o.w * MM.scale), Math.max(1, o.d * MM.scale)); }
    else if (/building|placeholder|monument/.test(o.type)) { g.fillStyle = '#1e1b2e'; g.fillRect((o.x + map.half) * MM.scale - 3, (o.z + map.half) * MM.scale - 3, 6, 6); }
  }
  MM.bg = bg;
  MM.toPx = (x, z) => [(x + map.half) * MM.scale, (z + map.half) * MM.scale];
  cv.onclick = ((e) => {
    const r = cv.getBoundingClientRect();
    const u = ((e.clientX - r.left) / r.width - 0.5) * map.width;
    const v = ((e.clientY - r.top) / r.height - 0.5) * map.width;
    const c = Math.cos(-Math.PI / 4), s = Math.sin(-Math.PI / 4);
    state.pendingOpen = null;
    walkTo(u * c - v * s, u * s + v * c);
  });
}
function drawMinimap(t) {
  if (!MM.ctx || (MM.frame++ % 3)) return;
  const g = MM.ctx;
  g.save();
  g.clearRect(0, 0, MM.size, MM.size);
  g.translate(MM.size / 2, MM.size / 2);
  g.rotate(Math.PI / 4);
  g.translate(-MM.size / 2, -MM.size / 2);
  g.drawImage(MM.bg, 0, 0);
  for (const it of world.interactables) {
    if (it.kind !== 'chapter') continue;
    const [x, y] = MM.toPx(it.x, it.z);
    g.fillStyle = it.visited ? '#7b7590' : '#ff6a3d';
    g.strokeStyle = '#1e1b2e'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  const p = player.group.position;
  const [px, py] = MM.toPx(p.x, p.z);
  g.fillStyle = '#1e1b2e';
  g.beginPath(); g.arc(px, py, 4 + Math.sin(t * 5) * 0.8, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f8f3e7';
  g.beginPath(); g.arc(px, py, 1.8, 0, Math.PI * 2); g.fill();
  g.restore();
}

// ---------------- Labels ----------------
const labelEls = [];
let labelLayer = null;
function setupLabels() {
  labelLayer?.remove(); labelEls.length = 0;
  const layer = document.createElement('div'); labelLayer = layer;
  layer.className = 'labels';
  layer.setAttribute('aria-hidden', 'true');
  canvas.after(layer);
  for (const l of world.labels) {
    const d = document.createElement('div');
    d.className = 'world-label';
    d.textContent = l.text;
    d.style.setProperty('--c', l.color);
    layer.append(d);
    labelEls.push({ el: d, pos: l.pos });
  }
}
const projV = new THREE.Vector3();
function updateLabels() {
  const w = window.innerWidth, h = window.innerHeight;
  for (const { el, pos } of labelEls) {
    projV.copy(pos).project(camera);
    const x = (projV.x * 0.5 + 0.5) * w, y = (-projV.y * 0.5 + 0.5) * h;
    const off = x < -100 || x > w + 100 || y < -40 || y > h + 40;
    el.style.display = off ? 'none' : '';
    if (!off) el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }
}

// ---------------- Input ----------------
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
const keys = new Set();

window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  keys.add(e.key.toLowerCase());
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

const pointers = new Map();
let pinchStart = 0, zoomStart = 1, downAt = null;
canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
    zoomStart = state.zoom;
    downAt = null;
  } else downAt = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()];
    setZoom(zoomStart * (Math.hypot(a.x - b.x, a.y - b.y) / pinchStart));
  }
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = 0;
  if (downAt && e.type === 'pointerup' && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 12) handleTap(e.clientX, e.clientY);
  downAt = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(state.zoom * (e.deltaY > 0 ? 0.9 : 1.1)); }, { passive: false });

function setZoom(z) {
  state.zoom = Math.max(0.7, Math.min(1.7, z));
  resize();
}

function handleTap(x, y) {
  if (!state.started || !world || state.minigame) return;
  if (dialogue.open) { dialogue.close(); }
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(world.interactables.filter((i) => i.hit && (i.kind !== 'memory' || !i.visited)).map((i) => i.hit), false);
  // a person under the cursor wins over benches/memories behind or around them
  const npcHit = hits.find((h) => h.object.userData.interactable.kind === 'npc');
  if (npcHit || hits.length) return walkToInteractable((npcHit || hits[0]).object.userData.interactable);
  if (world.railway && world.stations.length && raycaster.intersectObjects(world.railway.train, true).length) {
    const p = player.group.position;
    const nearest = world.stations.reduce((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) <= Math.hypot(b.x - p.x, b.z - p.z) ? a : b));
    toast(`Boarding at ${nearest.name} station…`);
    return walkToInteractable(nearest);
  }
  const p = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(groundPlane, p)) {
    state.pendingOpen = null;
    walkTo(p.x, p.z);
  }
}

function walkTo(x, z) {
  const pos = player.group.position;
  state.path = nav.findPath(pos.x, pos.z, x, z);
  const last = state.path[state.path.length - 1];
  if (last) { marker.position.set(last.x, heightAt(last.x, last.z) + 0.03, last.z); marker.visible = true; }
}

function walkToInteractable(it) {
  closePanel();
  const pos = player.group.position;
  if (Math.hypot(pos.x - it.x, pos.z - it.z) < it.radius) return interact(it);
  state.pendingOpen = it;
  walkTo(it.x, it.z);
}

// ---------------- Loop ----------------
const clock = new THREE.Clock();
const SPEED = 5.2, RUN = 7.6;
const fwd = new THREE.Vector3(-CAM_DIR.x, 0, -CAM_DIR.z).normalize();
const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
const lookV = new THREE.Vector3();

function start() {
  if (state.started) return;
  state.started = true;
  if ((state.save.tahitiTreasure || []).length >= 5) giveBandana(false);
  const boot = $('#boot');
  boot.classList.add('fade');
  setTimeout(() => { stopBootHero(); boot.remove(); }, 600);
  document.body.classList.add('started');
  setSound(!!look.sound);
}

function update(dt, t) {
  if (state.intro < 1 && state.started) { state.intro = Math.min(1, state.intro + dt / 2.2); resize(); }
  if (state.started) {
    state.save.seconds += dt;
    if (t - lastPersist > 5) { lastPersist = t; persist(); $('#play-time').textContent = formatTime(state.save.seconds); }
  }

  const kx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const kz = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const running = keys.has('shift');
  velocity.set(0, 0, 0);
  const pos = player.group.position;
  const frozen = !!state.minigame || !!state.groupScene;
  if (state.cine) runCine(dt);

  if (state.seated && (kx || kz || state.path.length)) standUp();
  if (state.joined && (kx || kz || state.path.length)) tahiti.leaveJoin();
  const keyboardMove = !state.mount && state.started && !frozen && !state.ko && !!(kx || kz);
  if (state.mount) {
    rideUpdate(dt, t, kx, kz, running);
  } else {
  if (keyboardMove) {
    state.path = []; state.pendingOpen = null; marker.visible = false;
    velocity.addScaledVector(right, kx).addScaledVector(fwd, kz).normalize().multiplyScalar(running ? RUN : SPEED);
  } else if (!frozen && !state.ko && state.path.length) {
    const wp = state.path[0];
    const dx = wp.x - pos.x, dz = wp.z - pos.z;
    const d = Math.hypot(dx, dz);
    let remaining = d, prev = wp;
    for (let i = 1; i < state.path.length; i++) { const q = state.path[i]; remaining += Math.hypot(q.x - prev.x, q.z - prev.z); prev = q; }
    if (d < 0.15) {
      state.path.shift();
      if (!state.path.length) {
        marker.visible = false;
        if (state.pendingOpen) { const it = state.pendingOpen; state.pendingOpen = null; interact(it); }
      }
    } else {
      // Long click-to-move trips jog automatically; ease in to the destination.
      const sp = remaining > 14 ? RUN : SPEED;
      velocity.set(dx / d, 0, dz / d).multiplyScalar(Math.min(sp, (remaining / dt) * 0.5 + 0.8));
    }
  }

  // Move with axis-separated sliding (feels better than stopping dead on walls).
  // Keyboard movement only respects solid things, so you *can* walk into the
  // lake or off the island (and pay for it); click-to-move uses the nav grid.
  const free = keyboardMove ? solidFree : (x, z) => nav.isWalkable(x, z, 0.32) && !charBlocks(x, z);
  if (velocity.lengthSq() > 0 && !state.ko) {
    const nx = pos.x + velocity.x * dt, nz = pos.z + velocity.z * dt;
    if (free(nx, pos.z)) pos.x = nx; else velocity.x = 0;
    if (free(pos.x, nz)) pos.z = nz; else velocity.z = 0;
  }
  if (!state.ko && !state.joined) pos.y += (heightAt(pos.x, pos.z) - pos.y) * Math.min(1, dt * 18);
  if (!state.cine) checkHazards(dt);
  if (state.cine) velocity.copy(state.cine.vel);
  player.update(dt, velocity, t);
  stepT -= dt * Math.hypot(velocity.x, velocity.z);
  if (stepT < 0) { stepT = 1.55; if (velocity.lengthSq() > 1) sfx.step(); }
  }

  // Nearby interactable + prompt
  let best = null, bestD = Infinity;
  for (const it of world.interactables) {
    if ((it.kind === 'memory' && it.visited) || it.disabled) continue;
    const d = Math.hypot(pos.x - it.x, pos.z - it.z);
    const score = it.kind === 'npc' ? d - 0.8 : d; // people take priority when you're beside them
    if (d < it.radius && score < bestD) { best = it; bestD = score; }
  }
  if (state.mount) best = state.mount.it;
  if (state.seated) { best = state.seated; player.group.position.set(state.seated.seat.x, heightAt(state.seated.seat.x, state.seated.seat.z), state.seated.seat.z); player.heading = state.seated.seat.heading; player.pose = 'sit'; } // while riding, the only action is getting off
  if (best && !dialogue.open) player.lookAt(lookV.set(best.x, 0, best.z)); else if (!dialogue.open) player.lookAt(null);
  if (dialogue.open && state.talkingTo) player.lookAt(lookV.set(state.talkingTo.x, 0, state.talkingTo.z));
  if (best !== state.nearby) {
    state.nearby = best;
    updatePrompt();
  }
  // E-spot circles: far ones fade back, the one you can use right now stands out
  for (const it of world.interactables) {
    if (!it.beacon || it.kind === 'memory') continue;
    const d = Math.hypot(pos.x - it.x, pos.z - it.z);
    it.beacon.prom = it === best ? 1.5 : d < 9 ? 1 : d < 18 ? 0.7 : 0.45;
  }
  // Character themes: the nearest park character's music fades in, a bit
  // louder while talking; only one theme ever plays
  {
    let theme = null, lvl = 0;
    const talk = state.talkingTo && (state.content.npcs || []).find((n) => n.id === state.talkingTo.npcId);
    if (talk?.theme) { theme = talk.theme; lvl = 0.8; }
    else {
      let bd = 7.5;
      for (const n of world.npcs) {
        const def = n.def || (n.def = (state.content.npcs || []).find((x) => x.id === n.npcId));
        if (!def?.theme) continue;
        const d = Math.hypot(pos.x - n.x, pos.z - n.z);
        if (d < bd) { bd = d; theme = def.theme; lvl = Math.min(1, (7.5 - d) / 3.5) * 0.5; }
      }
    }
    if (state.level === 'tahiti' && !state.cine && tahiti.musicOverride()) { theme = tahiti.musicOverride(); lvl = 0.6; }
    if (!theme && state.level === 'tahiti' && !state.cine) { theme = 'tahiti'; lvl = 0.32; }
    setTheme(state.started && !state.minigame ? theme : null, lvl);
  }
  if (state.panelOpen && Math.hypot(pos.x - state.panelOpen.x, pos.z - state.panelOpen.z) > state.panelOpen.radius + 2.5) closePanel();
  if (dialogue.open && state.talkingTo && Math.hypot(pos.x - state.talkingTo.x, pos.z - state.talkingTo.z) > 4) dialogue.close();

  // Named NPCs roam their district routes, stop for Nathan, then carry on
  updateNpcs(world.npcs, dt, t, heightAt, state.ko ? null : pos, state.talkingTo);
  updateWalkers(world.walkers, dt, t, heightAt, state.ko ? null : pos);
  if (state.level === 'tahiti') { tahiti.update(dt, t); tahitiHints(); }
  dustTick(dt);

  for (const it of world.interactables) {
    if (!it.beacon) continue;
    const s = it.beacon.gem.scale.x;
    if (s > 1) it.beacon.gem.scale.setScalar(Math.max(1, s - dt * 1.5));
  }
  // exhibits wake up as Nathan approaches; Motion Off (or OS reduce-motion) freezes them
  state.playerPos = state.ko ? null : pos;
  state.reduceMotion = look.motion === 'off';
  world.animated.forEach((fn) => fn(t, state));
  checkTrain();
  marker.scale.setScalar(1 + Math.sin(t * 6) * 0.15);

  // Camera: critically-damped follow with a little look-ahead, snapped to the
  // retro pixel grid so edges don't shimmer while moving.
  const goal = state.camOverride ? lookV.set(state.camOverride.x, 0, state.camOverride.z) : lookV.copy(pos).addScaledVector(velocity, 0.28);
  goal.y = 0;
  const k = 1 - Math.exp(-dt * 5.5);
  camVel.subVectors(goal, camTarget).multiplyScalar(k);
  camTarget.add(camVel);
  camera.position.copy(camTarget).addScaledVector(CAM_DIR, 60);
  camera.lookAt(camTarget);
  if (shakeT > 0) { shakeT -= dt; const a = Math.max(0, shakeT) * 0.5; camera.position.x += (Math.random() - 0.5) * a; camera.position.z += (Math.random() - 0.5) * a; }
  camera.updateMatrixWorld();
  const wpp = (camera.top - camera.bottom) / retro.target.height;
  const r = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), u = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const pr = camera.position.dot(r), pu = camera.position.dot(u);
  camera.position.addScaledVector(r, Math.round(pr / wpp) * wpp - pr).addScaledVector(u, Math.round(pu / wpp) * wpp - pu);
  camera.updateMatrixWorld();

  sun.position.copy(camTarget).add(SUN_OFFSET);
  sun.target.position.copy(camTarget);
  updateLabels();
  drawMinimap(t);
  placePrompt();
  if (state.started && !hintHidden && (t > 14 || state.save.chapters.length)) { hintHidden = true; $('#hint').classList.add('faded'); }

  const progress = MAIN_DISTRICTS.filter((d) => state.save.chapters.includes(d.id)).length / MAIN_DISTRICTS.length;
  scene.background.lerpColors(SKY_START, SKY_END, progress);
  // Standing in a monsoon shower greys the sky a little
  const rain = world.weather.find((wz) => wz.contains(pos.x, pos.z));
  rainMix += ((rain ? rain.intensity(t) : 0) - rainMix) * Math.min(1, dt * 2);
  if (rainMix > 0.01) scene.background.lerp(RAIN_SKY, rainMix * 0.55);
  if (state.level === 'tahiti') scene.background.lerp(TAHITI_SKY, 0.55);
  setOcean(state.level === 'tahiti' ? 0.55 : 0);
  setRain(rainMix);
  sun.color.setHSL(0.11, 0.7 + progress * 0.25, 0.9 - progress * 0.08);
  applyDayNight(dt);
  if (DEBUG) updateDebug(dt);
}
const ZERO = new THREE.Vector3();

// ---------------- Day / night ----------------
// 'auto' follows the visitor's local clock: day 07–17, dusk to 20:00, night
// until 05:00, dawn back to day by 07:00. The change eases in smoothly.
function nightTarget() {
  if (look.time === 'day') return 0;
  if (look.time === 'night') return 1;
  const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
  if (h >= 20 || h < 5) return 1;
  if (h >= 17) return (h - 17) / 3;   // dusk
  if (h < 7) return 1 - (h - 5) / 2;  // dawn
  return 0;
}
function cycleTime() {
  look.time = { auto: 'day', day: 'night', night: 'auto' }[look.time] || 'auto';
  applyLook();
  toast(look.time === 'auto' ? 'Time follows your clock' : look.time === 'night' ? 'Night mode: street lights on' : 'Day mode');
}
let night = -1;
// Nathan's own warm light: only switched on after dark.
const heroLight = new THREE.PointLight(0xffcf8f, 0, 10, 1.3);
heroLight.position.set(0, 2.4, 0);
player.group.add(heroLight);
const heroPool = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.CircleGeometry(3.4, 32), new THREE.MeshBasicMaterial({ color: 0xffc98a, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.07; m.renderOrder = 1;
  scene.add(m);
  return m;
})();
const NIGHT_SKY = new THREE.Color(0x1c2246), MOON = new THREE.Color(0xa9b8ff), SUNC = new THREE.Color();
const HEMI_SKY_DAY = new THREE.Color(0xfff6e6), HEMI_SKY_NIGHT = new THREE.Color(0x9aa6ee);
const HEMI_GND_DAY = new THREE.Color(0x9aa6c8), HEMI_GND_NIGHT = new THREE.Color(0x2a2440);
function applyDayNight(dt) {
  const target = nightTarget();
  night = night < 0 ? target : night + (target - night) * Math.min(1, dt * 1.5);
  const n = night;
  scene.background.lerp(NIGHT_SKY, n * 0.88);
  hemi.intensity = 1.7 - n * 0.95;
  hemi.color.copy(HEMI_SKY_DAY).lerp(HEMI_SKY_NIGHT, n);
  hemi.groundColor.copy(HEMI_GND_DAY).lerp(HEMI_GND_NIGHT, n);
  SUNC.copy(sun.color).lerp(MOON, n);
  sun.color.copy(SUNC);
  sun.intensity = 2.5 - n * 1.6;
  setGlowBoost(1 + n * 1.8);
  for (const p of world.nightGlow) { p.visible = n > 0.03; p.material.opacity = 0.62 * n; }
  heroLight.intensity = 13 * n * n;
  heroPool.visible = n > 0.03;
  heroPool.material.opacity = 0.55 * n;
  const hp = player.group.position;
  heroPool.position.set(hp.x, Math.max(0, heroLight.parent ? heightAt(hp.x, hp.z) : 0) + 0.07, hp.z);
  document.body.classList.toggle('is-night', n > 0.5);
}
let hintHidden = false;

// The interaction prompt floats above the thing you can interact with (desktop);
// on touch screens it stays a big tappable button at the bottom.
const promptV = new THREE.Vector3();
function placePrompt() {
  const pr = $('#prompt');
  if (isTouch || !state.nearby || pr.classList.contains('hidden')) return;
  promptV.set(state.nearby.x, (state.nearby.kind === 'npc' ? 2.9 : 3.1), state.nearby.z).project(camera);
  const x = (promptV.x * 0.5 + 0.5) * innerWidth, y = (-promptV.y * 0.5 + 0.5) * innerHeight;
  pr.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
}

function toggleControls(force) {
  const el = $('#controls');
  const open = force ?? el.classList.contains('hidden');
  el.classList.toggle('hidden', !open);
  $('#help-btn').setAttribute('aria-expanded', String(open));
}

// ---------------- Full map (M) ----------------
const BM = { size: 0, scale: 0 };
const rot45 = (u, v) => [u * Math.SQRT1_2 - v * Math.SQRT1_2, u * Math.SQRT1_2 + v * Math.SQRT1_2];
function toggleBigMap(force) {
  const el = $('#bigmap');
  const open = force ?? el.classList.contains('hidden');
  el.classList.toggle('hidden', !open);
  if (open) { closePanel(); dialogue.close(); drawBigMap(); }
}
function bigMapPx(x, z) {
  const [u, v] = rot45(x * BM.scale, z * BM.scale);
  return [BM.size / 2 + u, BM.size / 2 + v];
}
function drawBigMap() {
  const cv = $('#bigmap-canvas');
  const css = Math.min(innerWidth - 48, innerHeight - 140, 720);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.style.width = cv.style.height = css + 'px';
  cv.width = cv.height = Math.round(css * dpr);
  BM.size = cv.width;
  BM.scale = (BM.size / map.width) * 0.98;
  const g = cv.getContext('2d');
  g.fillStyle = '#2fb3c9'; g.fillRect(0, 0, BM.size, BM.size);
  // tiles, rotated to match the camera
  g.save(); g.translate(BM.size / 2, BM.size / 2); g.rotate(Math.PI / 4);
  const s = BM.scale;
  for (let j = 0; j < map.height; j++) for (let i = 0; i < map.width; i++) {
    const gid = map.ground[j * map.width + i];
    if (!gid) continue;
    g.fillStyle = map.tiles.get(gid).color;
    g.fillRect((i - map.half) * s, (j - map.half) * s, Math.ceil(s) + 0.5, Math.ceil(s) + 0.5);
  }
  for (const o of map.objects) {
    if (o.type === 'hedge') { g.fillStyle = '#5f9a4a'; g.fillRect((o.x - o.w / 2) * s, (o.z - o.d / 2) * s, o.w * s, o.d * s); }
  }
  if (map.rail) {
    g.strokeStyle = '#8a5a36'; g.lineWidth = s * 1.1; g.setLineDash([s * 0.5, s * 0.4]); g.beginPath();
    map.rail.points.forEach((p, i) => (i ? g.lineTo(p.x * s, p.z * s) : g.moveTo(p.x * s, p.z * s)));
    g.closePath(); g.stroke(); g.setLineDash([]);
  }
  g.restore();
  // markers (unrotated so they stay upright)
  const dot = (x, z, fill, r, shape = 'diamond') => {
    const [px, py] = bigMapPx(x, z);
    g.fillStyle = fill; g.strokeStyle = '#2a2440'; g.lineWidth = 2 * dpr;
    g.beginPath();
    if (shape === 'diamond') g.arc(px, py, r * 0.85, 0, Math.PI * 2);
    else g.rect(px - r, py - r, r * 2, r * 2);
    g.fill(); g.stroke();
  };
  for (const st of world.stations) dot(st.x, st.z, '#ffd257', 6 * dpr, 'square');
  for (const it of world.interactables) if (it.kind === 'chapter' || it.kind === 'finale') dot(it.x, it.z, it.visited ? '#9b94ad' : '#ff6a3d', 8 * dpr);
  // labels
  g.font = `${Math.round(11 * dpr)}px Silkscreen, monospace`; g.textAlign = 'center'; g.textBaseline = 'bottom';
  for (const l of world.labels) {
    const [px, py] = bigMapPx(l.pos.x, l.pos.z);
    const w = g.measureText(l.text).width + 10 * dpr;
    g.fillStyle = 'rgba(255,248,234,.92)'; g.fillRect(px - w / 2, py - 26 * dpr, w, 16 * dpr);
    g.fillStyle = '#2a2440'; g.fillText(l.text, px, py - 12 * dpr);
  }
  // you
  const p = player.group.position;
  const [px, py] = bigMapPx(p.x, p.z);
  g.fillStyle = '#2a2440'; g.beginPath(); g.arc(px, py, 8 * dpr, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff6a3d'; g.beginPath(); g.arc(px, py, 4.5 * dpr, 0, Math.PI * 2); g.fill();
}
function onBigMapClick(e) {
  const r = e.currentTarget.getBoundingClientRect();
  const k = BM.size / r.width;
  const u = ((e.clientX - r.left) * k - BM.size / 2) / BM.scale, v = ((e.clientY - r.top) * k - BM.size / 2) / BM.scale;
  const ix = u * Math.SQRT1_2 + v * Math.SQRT1_2, iz = -u * Math.SQRT1_2 + v * Math.SQRT1_2; // undo the 45° turn
  // snap to a chapter marker if the click is close to one
  const hit = world.interactables.filter((i) => i.kind === 'chapter' || i.kind === 'station' || i.kind === 'finale')
    .find((i) => Math.hypot(i.x - ix, i.z - iz) < 3);
  toggleBigMap(false);
  if (hit) walkToInteractable(hit); else { state.pendingOpen = null; walkTo(ix, iz); }
}

// ---------------- Collisions with characters + hazards ----------------
function charBlocks(x, z) {
  for (const it of world.interactables) if (it.kind === 'vehicle' && it !== state.mount?.it && Math.hypot(it.x - x, it.z - z) < 0.7) return true;
  // people block you, but never trap you: moving away from someone you overlap is always allowed
  const me = player.group.position;
  const blocks = (p) => { const d = Math.hypot(p.x - x, p.z - z); return d < 0.62 && d < Math.hypot(p.x - me.x, p.z - me.z) - 0.001; };
  for (const w of world.walkers) if (blocks(w.ch.group.position)) return true;
  for (const n of world.npcs) if (!n.passenger && blocks(n.character.group.position)) return true;
  return false;
}
function solidFree(x, z) {
  const r = 0.32;
  for (const c of world.colliders) {
    if (c.r !== undefined) { if (Math.hypot(x - c.cx, z - c.cz) < c.r + r) return false; }
    else if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return false;
  }
  if (Math.hypot(x, z) > (map.props.islandRadius || 44) + 3) return false; // don't swim to the horizon
  // a stopped train is solid
  if (world.railway && world.railway.speed < 0.5 && trainNear(x, z, 0.3)) return false;
  return !charBlocks(x, z);
}
function onFloor(x, z) { return world.floors.some((f) => x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ); }
function isWet(x, z) {
  if (onFloor(x, z)) return false;
  const t = tileAt(map, x, z);
  return !t || t.type === 'water';
}
const trainLocal = new THREE.Vector3();
function trainNear(x, z, pad = 0) {
  for (const car of world.railway.train) {
    trainLocal.set(x - car.position.x, 0, z - car.position.z).applyAxisAngle(UP, -car.rotation.y);
    if (Math.abs(trainLocal.z) < 1.45 + pad && Math.abs(trainLocal.x) < 0.85 + pad) return true;
  }
  return false;
}
const UP = new THREE.Vector3(0, 1, 0);
let safeT = 0;
const lastSafe = new THREE.Vector3(1.2, 0, 6.2);
function checkHazards(dt) {
  if (!world || state.ko || !state.started) return;
  const p = player.group.position;
  // remember the last dry, off-track spot for respawning
  safeT -= dt;
  if (safeT < 0 && !player.airborne && !isWet(p.x, p.z) && solidFree(p.x, p.z) && !(world.railway && trainNear(p.x, p.z, 1.5))) {
    // keep the respawn point a step back from the water's edge
    if (!isWet(p.x + 0.8, p.z) && !isWet(p.x - 0.8, p.z) && !isWet(p.x, p.z + 0.8) && !isWet(p.x, p.z - 0.8)) lastSafe.copy(p);
    safeT = 0.25;
  }
  if (!player.airborne && isWet(p.x, p.z)) return knockout('water');
}

// ---------------- Memory Line collisions ----------------
// Runs every frame for walking AND mounted Nathan, after the train has moved.
// Each car is an oriented box; we test the current pose plus an interpolated
// half-step (car and player both), so a fast train or rider can't tunnel
// through between frames. State machine: NORMAL -> HIT (state.ko) ->
// RECOVERING (state.trainGuard, until clear of the train) -> NORMAL.
const trainPrev = [];
const trainLocal2 = new THREE.Vector3();
const prevPlayer = new THREE.Vector3();
let prevPlayerOk = false;
function boxHit(x, z, cx, cz, ry, pad) {
  trainLocal2.set(x - cx, 0, z - cz).applyAxisAngle(UP, -ry);
  return Math.abs(trainLocal2.z) < 1.45 + pad && Math.abs(trainLocal2.x) < 0.85 + pad;
}
function lerpAngle(a, b, k) { return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k; }
function checkTrain() {
  const rw = world?.railway; if (!rw) return;
  const cars = rw.train, p = player.group.position;
  while (trainPrev.length < cars.length) trainPrev.push({ x: 0, z: 0, ry: 0, ok: false });
  const moving = rw.speed > 0.5;
  const pad = state.mount ? state.mount.cfg.r * (state.mount.it.vtype === 'horse' ? 1.3 : 1) : 0.3;
  const canHit = state.started && !state.ko && !state.cine && !state.seated && moving
    && (state.mount || player.jumpY < 1.1);
  if (state.trainGuard && !trainNear(p.x, p.z, 1.0)) state.trainGuard = false;   // RECOVERING -> NORMAL
  let hit = null;
  if (canHit && !state.trainGuard) {
    // broad phase: skip entirely when nowhere near the train
    const head = cars[0].position;
    if (Math.abs(p.x - head.x) < 14 && Math.abs(p.z - head.z) < 14) {
      for (let i = 0; i < cars.length && !hit; i++) {
        const c = cars[i], q = trainPrev[i];
        if (boxHit(p.x, p.z, c.position.x, c.position.z, c.rotation.y, pad)) hit = c;
        else if (q.ok && prevPlayerOk) {
          const px = (p.x + prevPlayer.x) / 2, pz = (p.z + prevPlayer.z) / 2;
          if (boxHit(px, pz, (c.position.x + q.x) / 2, (c.position.z + q.z) / 2, lerpAngle(q.ry, c.rotation.y, 0.5), pad)) hit = c;
        }
      }
    }
  }
  cars.forEach((c, i) => { const q = trainPrev[i]; q.x = c.position.x; q.z = c.position.z; q.ry = c.rotation.y; q.ok = true; });
  prevPlayer.copy(p); prevPlayerOk = true;
  if (hit) trainKnock(hit);
}
// nearest distance from (x, z) to the rail line
function railDist(x, z) {
  if (!railPts) railPts = world.railway.curve.getSpacedPoints(500);
  let d = Infinity;
  for (const q of railPts) { const e = (q.x - x) ** 2 + (q.z - z) ** 2; if (e < d) d = e; }
  return Math.sqrt(d);
}
// a walkable spot near `from`, pushed along `dir`, well clear of the tracks
function offTrackSpot(from, dir, minRail = 3) {
  const ok = (x, z) => solidFree(x, z) && nav.isWalkable(x, z, 0.32) && !isWet(x, z) && railDist(x, z) > minRail;
  const base = Math.atan2(dir.x, dir.z);
  for (const d of [3, 4.5, 6, 8, 10]) for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, Math.PI]) {
    const x = from.x + Math.sin(base + da) * d, z = from.z + Math.cos(base + da) * d;
    if (ok(x, z)) return new THREE.Vector3(x, 0, z);
  }
  if (railDist(lastSafe.x, lastSafe.z) > minRail) return lastSafe.clone();
  const s = world.stations.length ? world.stations.reduce((a, b) => (Math.hypot(a.x - from.x, a.z - from.z) <= Math.hypot(b.x - from.x, b.z - from.z) ? a : b)) : { x: 1.2, z: 6.2 };
  return new THREE.Vector3(s.x, 0, s.z);
}
// park a vehicle at a safe spot after a crash; falls back to its rack
function parkVehicle(it, near, heading, exact = false) {
  const cfg = VEHICLES[it.vtype];
  let spot = exact ? { x: near.x, z: near.z, heading } : null;
  if (!spot) for (const [ox, oz] of [[1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6], [1.6, 1.6], [-1.6, -1.6]]) {
    const x = near.x + ox, z = near.z + oz;
    if (vehicleFree(x, z, cfg) && railDist(x, z) > 3) { spot = { x, z, heading }; break; }
  }
  spot = spot || it.home;
  it.x = spot.x; it.z = spot.z; it.heading = spot.heading;
  const g = it.model.group;
  g.position.set(spot.x, heightAt(spot.x, spot.z), spot.z);
  g.rotation.set(0, spot.heading + cfg.yaw, 0);
  it.beacon.group.position.set(spot.x, heightAt(spot.x, spot.z) + 0.04, spot.z); it.beacon.group.visible = true;
  it.hit.position.set(spot.x, 1.3, spot.z);
}
function impactStars(at) {
  const parts = [], cols = [0xffd257, 0xfff1d6, 0xff8a2a];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, sp = 2.2 + Math.random() * 1.6;
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), fxMat(cols[i % 3]));
    m.position.set(at.x, at.y + 1, at.z); scene.add(m);
    parts.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 2, Math.sin(a) * sp), g: 9 });
  }
  runParticles(parts, 900);
}
let shakeT = 0;
function trainKnock(car) {
  const m = state.mount, p = player.group.position;
  state.ko = 'train';                                                     // HIT: input disabled
  state.path = []; state.pendingOpen = null; marker.visible = false;
  closePanel(); dialogue.close();
  // knocked forward along the train's travel and out to the side it hit
  const fling = new THREE.Vector3(Math.sin(car.rotation.y), 0, Math.cos(car.rotation.y));
  const side = new THREE.Vector3(-fling.z, 0, fling.x);
  if (side.dot(new THREE.Vector3().subVectors(p, car.position)) < 0) side.negate();
  fling.multiplyScalar(1.2).add(side.clone().multiplyScalar(2.2));
  // end the mounted state cleanly: the mount gets clear of the train on its own
  let ride = null;
  if (m) {
    const it = m.it;
    state.mount = null; state.nearby = null;
    player.pose = null; player.pedal = 0;
    if (it.vtype === 'moto') { setEngine(null); tahiti.onMotoDismount({ x: p.x + side.x, z: p.z + side.z }); }
    ride = { it, g: it.model.group, from: it.model.group.position.clone(), dir: side.clone().normalize() };
    it.beacon.group.visible = false;
  }
  player.heading = Math.atan2(-fling.x, -fling.z);
  sfx.bonk();
  impactStars(p);
  shakeT = reducedMotion ? 0 : 0.45;
  const el = $('#ko');
  el.innerHTML = '<div class="ko-card"><b>WATCH THE TRACKS!</b><span>That train isn’t stopping for you.</span></div>';
  setTimeout(() => el.classList.remove('hidden'), reducedMotion ? 0 : 350);
  const t0 = performance.now(), start = p.clone();
  const DUR = 750;
  const fall = () => {
    const k = Math.min(1, (performance.now() - t0) / DUR), e = 1 - (1 - k) * (1 - k);
    p.x = start.x + fling.x * e; p.z = start.z + fling.z * e;
    p.y = heightAt(p.x, p.z) + Math.sin(k * Math.PI) * 1.1;
    // cartoon tumble: one flip, ending flat on his back
    player.group.rotation.x = reducedMotion ? -1.45 * k : -(Math.PI * 2 * Math.min(1, k * 1.2)) - 1.45 * k;
    if (ride) {
      const r = ride;
      if (r.it.vtype === 'horse') {
        // the horse spooks, rears a little and trots clear of the rails
        r.g.position.set(r.from.x + r.dir.x * 3.5 * e, heightAt(r.from.x, r.from.z) + Math.abs(Math.sin(k * Math.PI * 3)) * 0.25, r.from.z + r.dir.z * 3.5 * e);
        r.g.rotation.z = -Math.sin(Math.min(1, k * 2) * Math.PI) * 0.25;
      } else {
        // bikes skid sideways and tip over
        r.g.position.set(r.from.x + r.dir.x * 2.2 * e, heightAt(r.from.x, r.from.z), r.from.z + r.dir.z * 2.2 * e);
        r.g.rotation.z = 1.35 * e;
      }
    }
    if (k < 1) requestAnimationFrame(fall);
  };
  requestAnimationFrame(fall);
  setTimeout(() => {
    el.classList.add('dark');
    setTimeout(() => {
      const spawn = offTrackSpot(start, fling);
      p.set(spawn.x, heightAt(spawn.x, spawn.z), spawn.z);
      player.group.rotation.set(0, 0, 0);
      player.pose = null; player.action = null; player.jumpY = 0; player.jumpV = 0;
      player.heading = Math.atan2(fling.x, fling.z);
      if (ride) {
        try { parkVehicle(ride.it, ride.it.home, ride.it.home.heading, true); } catch (err) { console.warn(err); }
        toast(`Your ${VEHICLES[ride.it.vtype].label} is back at its ${ride.it.vtype === 'horse' ? 'post' : 'rack'}.`);
      }
      camTarget.set(p.x, 0, p.z);
      el.classList.remove('dark'); el.classList.add('hidden');
      state.ko = null; state.trainGuard = true;                         // RECOVERING
      prevPlayerOk = false;
      persist();
    }, reducedMotion ? 50 : 420);
  }, reducedMotion ? 500 : 1500);
}

// ---------------- Death effects ----------------
const fxMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
function runParticles(parts, dur, onFrame) {
  const t0 = performance.now();
  let last = t0;
  const step = () => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    const k = (now - t0) / dur;
    for (const q of parts) {
      q.v.y -= (q.g ?? 14) * dt;
      q.m.position.addScaledVector(q.v, dt);
      if (q.floor !== undefined && q.m.position.y < q.floor) { q.m.position.y = q.floor; q.v.set(0, 0, 0); }
      q.m.rotation.x += dt * 6; q.m.rotation.y += dt * 4;
      q.m.material.opacity = Math.max(0, 1 - k);
    }
    onFrame?.(k);
    if (k < 1) requestAnimationFrame(step); else parts.forEach((q) => scene.remove(q.m));
  };
  requestAnimationFrame(step);
}
function deathSplash(at) {
  const parts = [];
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 2.4;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), fxMat(i % 3 ? 0xe9fbff : 0x9fe3f5));
    m.position.set(at.x, at.y + 0.2, at.z); scene.add(m);
    parts.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 4 + Math.random() * 3, Math.sin(a) * sp), g: 16 });
  }
  // rising bubbles
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07 + Math.random() * 0.05, 0), fxMat(0xe9fbff, 0.9));
    m.position.set(at.x + (Math.random() - 0.5) * 0.6, at.y - 0.4 - Math.random() * 0.6, at.z + (Math.random() - 0.5) * 0.6); scene.add(m);
    parts.push({ m, v: new THREE.Vector3(0, 0.9 + Math.random() * 0.8, 0), g: 0 });
  }
  runParticles(parts, 1500);
  // expanding ripples
  const rings = [0, 1, 2].map((i) => {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 24), fxMat(0xe9fbff, 0.9));
    r.rotation.x = -Math.PI / 2; r.position.set(at.x, 0.05, at.z); r.userData.delay = i * 0.18; scene.add(r); return r;
  });
  runParticles([], 1700, (k) => rings.forEach((r) => {
    const q = Math.max(0, k * 1.2 - r.userData.delay);
    r.scale.setScalar(1 + q * 6); r.material.opacity = Math.max(0, 0.9 - q);
    if (k >= 1) scene.remove(r);
  }));
}
function deathBlood(at, dir) {
  const parts = [];
  const reds = [0xb3122a, 0x8a0e20, 0xd6233a];
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
    const s = 0.07 + Math.random() * 0.1;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), fxMat(reds[i % 3]));
    m.position.set(at.x, at.y + 0.9, at.z); scene.add(m);
    parts.push({ m, v: new THREE.Vector3(Math.cos(a) * sp + dir.x * 2, 2.5 + Math.random() * 3.5, Math.sin(a) * sp + dir.z * 2), g: 15, floor: 0.06 });
  }
  runParticles(parts, 1400);
  // splatter decals on the ground that linger, then fade
  const decals = [];
  for (let i = 0; i < 7; i++) {
    const r = 0.25 + Math.random() * 0.55;
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 7), fxMat(i % 2 ? 0x8a0e20 : 0xb3122a, 0.9));
    d.rotation.x = -Math.PI / 2; d.rotation.z = Math.random() * 6;
    d.scale.set(1 + Math.random() * 0.8, 1, 1);
    d.position.set(at.x + dir.x * (0.2 + Math.random() * 0.8) + (Math.random() - 0.5) * 1.2, 0.07 + i * 0.002, at.z + dir.z * (0.2 + Math.random() * 0.8) + (Math.random() - 0.5) * 1.2);
    d.renderOrder = 2; scene.add(d); decals.push(d);
  }
  setTimeout(() => runParticles([], 2500, (k) => decals.forEach((d) => { d.material.opacity = 0.9 * (1 - k); if (k >= 1) scene.remove(d); })), 6000);
}

function knockout(kind) {
  state.ko = kind;
  state.path = []; state.pendingOpen = null; marker.visible = false;
  closePanel(); dialogue.close();
  const p = player.group.position;
  const msg = kind === 'water'
    ? ['SPLASH!', 'Nathan can lift, but he can’t swim (yet).']
    : ['MIND THE MEMORY LINE', 'Hit by the train. Respawning at the nearest station.'];
  sfx.miss();
  const el = $('#ko');
  el.innerHTML = `<div class="ko-card"><b>${msg[0]}</b><span>${msg[1]}</span></div>`;
  setTimeout(() => el.classList.remove('hidden'), reducedMotion ? 0 : 450);
  const t0 = performance.now();
  const start = p.clone();
  // fling direction: away from the train's travel direction (or straight down for water)
  let fling = new THREE.Vector3();
  if (kind === 'train' && world.railway) {
    const car = world.railway.train.reduce((a, b) => (a.position.distanceTo(p) < b.position.distanceTo(p) ? a : b));
    fling.set(Math.sin(car.rotation.y), 0, Math.cos(car.rotation.y));
    const side = new THREE.Vector3(-fling.z, 0, fling.x);
    if (side.dot(new THREE.Vector3().subVectors(p, car.position)) < 0) side.negate();
    fling.multiplyScalar(1.6).add(side.multiplyScalar(1.4));
    player.heading = Math.atan2(-fling.x, -fling.z);
  }
  if (kind === 'water') deathSplash(start); else deathBlood(start, fling);
  const fall = () => {
    const k = Math.min(1, (performance.now() - t0) / (kind === 'water' ? 1300 : 650));
    if (kind === 'water') {
      // struggle, then slowly go under
      p.y = start.y - 1.5 * k * k;
      player.group.rotation.z = Math.sin(k * 22) * 0.18 * (1 - k);
    } else {
      // knocked off the track and flat on the ground
      p.x = start.x + fling.x * k; p.z = start.z + fling.z * k;
      p.y = start.y + Math.sin(k * Math.PI) * 0.9;
      player.group.rotation.x = -1.5 * Math.min(1, k * 1.4);
    }
    if (k < 1) requestAnimationFrame(fall);
  };
  requestAnimationFrame(fall);
  setTimeout(() => {
    el.classList.add('dark');
    setTimeout(() => {
      let spawn = lastSafe;
      if (kind === 'train' && world.stations.length) {
        const s = world.stations.reduce((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) <= Math.hypot(b.x - p.x, b.z - p.z) ? a : b));
        spawn = new THREE.Vector3(s.x, 0, s.z);
      }
      p.set(spawn.x, heightAt(spawn.x, spawn.z), spawn.z);
      player.group.rotation.x = 0; player.group.rotation.z = 0;
      camTarget.set(p.x, 0, p.z);
      el.classList.remove('dark');
      el.classList.add('hidden');
      state.ko = null;
      persist();
    }, reducedMotion ? 50 : 450);
  }, reducedMotion ? 400 : 1900);
}
const RAIN_SKY = new THREE.Color(0x8fa6bd);
let rainMix = 0;
let stepT = 0;

function updatePrompt() {
  const best = state.nearby, pr = $('#prompt');
  if (!best || state.panelOpen || dialogue.open || state.minigame || state.groupScene) { pr.classList.add('hidden'); return; }
  const c = state.content;
  const npc = best.kind === 'npc' && (c.npcs || []).find((n) => n.id === best.npcId);
  const mem = best.kind === 'memory' && (c.memories || []).find((m) => m.id === best.memoryId);
  const [kind, title] = {
    project: ['Inspect project', c.projects.find((p) => p.id === best.projectId)?.title],
    about: ['NATHAN.EXE', `About ${c.profile?.name || 'me'}`],
    npc: ['Talk', npc && `${npc.name}`],
    minigame: ['Try it', 'Lift the bar'],
    memory: ['Memory', mem ? 'Pick up ✦' : ''],
    station: ['Memory Line', best.name ? `${best.name} station` : 'Station'],
    panel: ['Look', best.title],
    group: ['Group', best.title || 'Join in'],
    activity: ['Tahiti', best.title],
    seat: ['Bench', state.seated ? 'Stand up' : 'Sit down'],
    vehicle: [{ horse: 'Horse', moto: 'Motorcycle' }[best.vtype] || 'Bicycle', state.mount ? 'Dismount' : { horse: 'Ride horse', moto: 'Ride motorcycle' }[best.vtype] || 'Ride bicycle'],
    finale: ['Departures', state.save.finale ? 'Replay the ending' : 'End of Island 01'],
    chapter: ['Open chapter', chapterFor(c, best.district)?.title],
  }[best.kind] || ['Open', best.id];
  $('#prompt-kind').textContent = kind;
  $('#prompt-title').textContent = title || best.id;
  pr.querySelector('kbd').textContent = isTouch ? '◆' : 'E';
  pr.classList.remove('hidden');
}

// ---------------- Tahiti: companion AI, activities and events ----------------
const mgRoot = () => $('#minigame');
const tahiti = createTahiti({
  state, player, camera, heightAt, toast, sfx, dialogue, solidFree,
  get world() { return world; }, get nav() { return nav; },
  isNight: () => night > 0.5,
  persist,
  jetPoint() { const j = world.apis.private_jet; return j ? j.doorPoint() : { x: 0, z: 0 }; },
  hasMoto() { return world.interactables.some((i) => i.kind === 'vehicle' && i.vtype === 'moto'); },
  panel: (bar, html) => showPanel(bar, `<div class="panel-body-inner">${html}</div>`),
  choose(title, options, cb) {
    const el = document.createElement('div'); el.className = 'tahiti-choose window';
    el.innerHTML = `<div class="window-bar"><span class="title">ride.exe</span></div><div class="mg-body"><h2>${esc(title)}</h2><div class="choose-list"></div></div>`;
    const list = el.querySelector('.choose-list');
    options.forEach((o, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (i === 0 ? ' primary' : ''); b.textContent = o.label; b.addEventListener('click', () => { el.remove(); state.choosing = null; cb(o.value); }); list.append(b); });
    document.body.append(el); state.choosing = el;
    setTimeout(() => list.querySelector('button')?.focus(), 0);
  },
  flash(text, white = false) {
    const el = document.createElement('div'); el.className = 'tahiti-flash' + (white ? ' white' : '');
    el.textContent = text; document.body.append(el);
    setTimeout(() => el.remove(), white ? 700 : 850);
  },
  capture() {
    try {
      retro.render(scene, camera);
      const src = renderer.domElement, w = 480, h = Math.round((src.height / src.width) * w);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(src, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.72);
    } catch { return null; }
  },
  openGallery() {
    let list = []; try { list = JSON.parse(localStorage.getItem('nathan-exe:tahiti-photos') || '[]'); } catch { /* ignore */ }
    showPanel('tahiti/photos', `<p class="eyebrow">TAHITI · GROUP PHOTOS</p><h2 id="panel-title">Photo board</h2>
      ${list.length ? `<div class="tahiti-gallery">${list.map((p) => `<figure><img src="${p.url}" alt="Group photo"><figcaption>${p.gang ? esc(p.gang) + ' · ' : ''}${new Date(p.at).toLocaleString()}</figcaption></figure>`).join('')}</div>` : '<p class="subtitle">No photos yet. Stand near your friends and press G.</p>'}
      <p class="muted">Photos stay on this device.</p>`);
  },
  giveBandana: () => giveBandana(true),
  minigame(html, setup) {
    const root = mgRoot();
    root.innerHTML = `<div class="window-bar"><span class="title">tahiti/event.exe</span><button class="panel-close mg-x" aria-label="Close">✕</button></div><div class="mg-body tahiti-mg">${html}</div>`;
    root.classList.remove('hidden'); state.minigame = 'tahiti';
    let cleanup = null;
    const close = () => { if (!root.onkey && state.minigame !== 'tahiti') return; root.onkey = null; cleanup?.(); root.classList.add('hidden'); root.innerHTML = ''; state.minigame = null; state.nearby = null; };
    root.querySelector('.mg-x').addEventListener('click', close);
    root.onkey = () => {};
    cleanup = setup(root, close);
  },
});
function giveBandana(fresh) {
  if (player.bandana) return;
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.48), new THREE.MeshLambertMaterial({ color: 0xd83a3a }));
  m.position.set(0, 0.5, 0); player.head.add(m);
  const knot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.06), m.material); knot.position.set(0, 0.46, -0.26); player.head.add(knot);
  player.bandana = m;
  if (fresh) player.play('flex');
}
// context hints (R/F/G) under the prompt, plus touch buttons on phones
let hintKey = '';
function tahitiHints() {
  const h = state.cine || state.minigame || dialogue.open || state.panelOpen ? [] : tahiti.hints();
  const k = h.join('|'); if (k === hintKey) return; hintKey = k;
  let el = $('#tahiti-hints');
  if (!el) {
    el = document.createElement('div'); el.id = 'tahiti-hints'; el.className = 'tahiti-hints'; document.body.append(el);
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) tahiti.key(b.dataset.k); });
  }
  el.innerHTML = h.map((s) => { if (s.startsWith('Space ')) return `<button type="button" data-k=" "><kbd>Space</kbd>${esc(s.slice(6))}</button>`; const key = s[0]; return /^[RFG] /.test(s) ? `<button type="button" data-k="${key.toLowerCase()}"><kbd>${key}</kbd>${esc(s.slice(2))}</button>` : `<span>${esc(s)}</span>`; }).join('');
  el.classList.toggle('hidden', !h.length);
}

// ---------------- Debug overlay (?debug) ----------------
let dbg, fpsAcc = 0, fpsN = 0;
function setupDebug() {
  dbg = document.createElement('pre');
  dbg.className = 'debug';
  document.body.append(dbg);
}
function updateDebug(dt) {
  fpsAcc += dt; fpsN++;
  if (fpsAcc < 0.5) return;
  const info = renderer.info.render;
  dbg.textContent = `fps ${(fpsN / fpsAcc).toFixed(0)}  draw ${info.calls}  tris ${(info.triangles / 1000).toFixed(1)}k\nrt ${retro.target.width}×${retro.target.height} px${retro.pixelSize}  pos ${player.group.position.x.toFixed(1)},${player.group.position.z.toFixed(1)}`;
  fpsAcc = 0; fpsN = 0;
}

function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  if (world) update(dt, t);
  renderer.info.reset();
  retro.render(scene, camera);
  requestAnimationFrame(loop);
}

if (import.meta.env.DEV) {
  // Dev-only hook for automated testing: step the simulation without rAF.
  window.__game = {
    state, player, camera, get world() { return world; }, renderer, dialogue,
    step(frames = 60) { for (let i = 0; i < frames; i++) update(1 / 60, clock.elapsedTime + i / 60); retro.render(scene, camera); },
    tap: handleTap, walkTo, interact, knockout, startFlight, skipCine, switchLevel, get map() { return map; }, tahiti: () => tahiti, keys,
  };
}

// After a mouse/touch click on HUD buttons, give keyboard control back to the game.
document.addEventListener('pointerup', (e) => { const b = e.target.closest?.('button, a'); if (b && !b.closest('.travel')) setTimeout(() => b.blur(), 0); });
window.addEventListener('resize', resize);
window.addEventListener('pagehide', persist);
resize();
const loaded = init();
runBoot(loaded);
loop();
