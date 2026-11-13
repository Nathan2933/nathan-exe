import { initTouchControls, touchInput } from './touch.js';
import { fetchRetry } from './net.js';
import * as THREE from 'three';
import { RetroRenderer } from './retro.js';
import { applyPalette, SKY } from './palette.js';
import { setGlowBoost } from './kit.js';
import { sfx, setSound, setRain, setMusic, setTheme, setOcean, setEngine } from './audio.js';
import { createTahiti } from './tahiti.js';
import { createXrayOcclusion } from './xray.js';
import { createGuruRoutine } from './guru.js';
import { buildWorld, loadKitOverrides, updateWalkers, updateNpcs, groundHeight, markerMats, windowMats } from './world.js';
import { loadTiledMap, tileAt } from './tiled.js';
import { NavGrid } from './nav.js';
import { Player } from './player.js';
import { drawPortrait, portraitURL } from './portrait.js';
import { Dialogue } from './dialogue.js';
import { conversationSystem, CANONICAL_MAP } from './conversation.js';
import { createCharacters } from './characters.js';
import { runLift, runTempo } from './minigame.js';
import { loadSave, writeSave, resetSave, addUnique, formatTime } from './save.js';
import { createTour, findStopInteractable } from './tour.js';
import { loadContent, esc, safeUrl, chapterFor, projectCard, projectDetails, DISTRICTS, MAIN_DISTRICTS } from '../shared/content.js';

const $ = (s) => document.querySelector(s);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = matchMedia('(pointer: coarse)').matches;
const COMPACT_MQ = '(max-width: 760px), (max-height: 520px) and (orientation: landscape), (pointer: coarse) and (max-width: 1100px)';
const isCompactUI = () => matchMedia(COMPACT_MQ).matches;
const BASE = import.meta.env.BASE_URL || '/';
const BUILD = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
const DEBUG = new URLSearchParams(location.search).has('debug');
let debugOn = DEBUG;

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
  bootWarmed: false,
  bootFading: false,
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
  // Integer nearest-neighbour upscale: pick a whole-number scale for the slot the
  // layout gives the canvas, render at (slot / scale) and size the element to exactly
  // buffer x scale device pixels, so every art pixel is the same size and edge-sharp.
  const PIX_W = 150;
  const fitCanvas = () => {
    const dpr = window.devicePixelRatio || 1;
    const slot = Math.min(window.innerWidth * 0.94, 500) * dpr; // .boot #boot-hero width
    if (!(slot > 0)) return;                                      // hidden / zero-size window
    const k = Math.max(1, Math.round(slot / PIX_W));            // chunky: ~PIX_W art pixels across
    const bw = Math.max(1, Math.round(slot / k)), bh = Math.round(bw * H / W);
    r.setSize(bw, bh, false);
    cv.style.width = `${(bw * k) / dpr}px`; cv.style.height = `${(bh * k) / dpr}px`;
  };
  // flex centring can land the canvas on a sub-pixel; nudge it onto the device grid
  let snapX = 0, snapY = 0;
  const snapCanvas = () => {
    const dpr = window.devicePixelRatio || 1, b = cv.getBoundingClientRect();
    const fx = b.left - snapX, fy = b.top - snapY;
    const nx = Math.round(fx * dpr) / dpr - fx, ny = Math.round(fy * dpr) / dpr - fy;
    if (Math.abs(nx - snapX) > 1e-3 || Math.abs(ny - snapY) > 1e-3) { snapX = nx; snapY = ny; cv.style.translate = `${nx}px ${ny}px`; }
  };
  const onResize = () => { fitCanvas(); snapCanvas(); };
  onResize();
  window.addEventListener('resize', onResize);
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
    snapCanvas();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return {
    ready,
    // jump the intro straight to the idle loop (input during the opening)
    skip() { if (T < 2.8) { T = 2.8; waved = true; hero.action = null; hero.heading = 0; hero.group.position.x = 0; $('#boot').classList.add('title-skip'); if (readyRes) { readyRes(); readyRes = null; } } },
    confirm() { this.skip(); hero.play('cheer'); if (!reducedMotion) dolly = 0; },
    stop() { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); hero.dispose?.(); r.dispose(); },
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
    state.bootFading = true;
    title.confirm();
    setTimeout(start, reducedMotion ? 120 : 650);
  }
  window.addEventListener('keydown', onKey);
  $('#boot').addEventListener('click', onClick);
  const arm = () => { if (!isLoaded || armed) return; armed = true; btn.classList.remove('hidden'); };
  title.ready.then(() => { isLoaded && arm(); });
  await loaded;
  isLoaded = true;
  $('#boot')?.classList.add('loaded');
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
  location.replace('./?nowebgl=1');
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
const look = (() => { try { return { palette: 'bright', pixels: 'smooth', ...JSON.parse(localStorage.getItem(LOOK_KEY) || '{}'), time: 'day' }; } catch { return { palette: 'bright', pixels: 'smooth', time: 'day' }; } })();   // daylight is always the default; a stored time is never restored
const qs = new URLSearchParams(location.search);
if (qs.get('palette')) look.palette = qs.get('palette');
if (qs.get('pixels')) look.pixels = qs.get('pixels');
if (qs.get('time') === 'night') look.time = 'night';
if (!look.motion) look.motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : 'on';
if (!look.music) look.music = 'on';
if (typeof look.musicVol !== 'number') look.musicVol = 0.6;
let _nightDirty = true;
function applyLook() {
  retro.setMode(look);
  applyPalette(look.palette);
  _nightDirty = true;
  const sky = SKY[look.palette] || SKY.bright;
  SKY_START.setHex(sky.start); SKY_END.setHex(sky.end); scene.background.copy(SKY_START);
  document.body.classList.toggle('look-retro', look.pixels === 'retro');
  const pb = document.getElementById('look-palette'), xb = document.getElementById('look-pixels');
  if (pb) pb.textContent = look.palette === 'pastel' ? 'Pastel' : 'Bright';
  if (xb) xb.textContent = look.pixels === 'retro' ? 'Pixel' : 'Smooth';
  const tb = document.getElementById('look-time');
  if (tb) tb.textContent = look.time === 'night' ? '☾ Night' : '☀ Day';
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
  try { localStorage.setItem(LOOK_KEY, JSON.stringify({ ...look, time: 'day' })); } catch { /* ignore */ }
}

const scene = new THREE.Scene();
const SKY_START = new THREE.Color(0x8fdcf0);
const SKY_END = new THREE.Color(0xffc98f);
const TAHITI_SKY = new THREE.Color(0x6ecde6); // clear tropical sky over Tahiti
scene.background = SKY_START.clone();
applyLook();

const hemi = new THREE.HemisphereLight(0xfff6e6, 0x9aa6c8, 1.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d2, 2.5);
sun.castShadow = true;
// 2048 keeps the fitted frustum crisp even on tall portrait phones; only very low-memory devices fall back to 1024.
const SHADOW_RES = (navigator.deviceMemory && navigator.deviceMemory <= 2) ? 1024 : 2048;
sun.shadow.mapSize.set(SHADOW_RES, SHADOW_RES);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 0.5, far: 110 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(16, 34, 10);

const _sunDir = SUN_OFFSET.clone().normalize();
const _sunRight = new THREE.Vector3(0, 1, 0).cross(_sunDir).normalize();
const _sunUp = _sunDir.clone().cross(_sunRight).normalize();
const _sp = new THREE.Vector3(), _sCR = new THREE.Vector3(), _sCU = new THREE.Vector3(), _sCF = new THREE.Vector3();
const SHADOW_PAD = 6;            // world units of shadow coverage kept beyond the visible edge
const SHADOW_Y = [-1.5, 10];     // receiver heights sampled when projecting the view footprint
/**
 * Fit the sun's shadow frustum to what the camera can actually see (plus a buffer), every frame,
 * AFTER the camera has its final position. The old fixed ±24 box was smaller than the visible
 * ground on portrait/phone and zoomed-out views, so trees entered the picture before the shadow
 * map covered them. Extents depend only on zoom/aspect (not on position), are quantised so they
 * do not wobble, and the light is snapped to whole shadow texels so shadows do not shimmer.
 */
function fitSunShadow() {
  camera.updateMatrixWorld();
  _sCR.setFromMatrixColumn(camera.matrixWorld, 0);
  _sCU.setFromMatrixColumn(camera.matrixWorld, 1);
  _sCF.setFromMatrixColumn(camera.matrixWorld, 2).negate();      // view direction
  let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity;
  for (const cy of [camera.top, camera.bottom]) for (const cx of [camera.left, camera.right]) {
    _sp.copy(camera.position).addScaledVector(_sCR, cx).addScaledVector(_sCU, cy);
    for (const y of SHADOW_Y) {
      const k = (y - _sp.y) / _sCF.y;
      const px = _sp.x + _sCF.x * k - camTarget.x, py = y - camTarget.y, pz = _sp.z + _sCF.z * k - camTarget.z;
      const a = px * _sunRight.x + py * _sunRight.y + pz * _sunRight.z;
      const u = px * _sunUp.x + py * _sunUp.y + pz * _sunUp.z;
      if (a < l) l = a; if (a > r) r = a; if (u < b) b = u; if (u > t) t = u;
    }
  }
  const q = (v, up) => (up ? Math.ceil((v + SHADOW_PAD) / 2) * 2 : Math.floor((v - SHADOW_PAD) / 2) * 2);
  l = Math.max(-110, q(l, false)); r = Math.min(110, q(r, true)); b = Math.max(-110, q(b, false)); t = Math.min(110, q(t, true));
  const sc = sun.shadow.camera;
  if (sc.left !== l || sc.right !== r || sc.bottom !== b || sc.top !== t) {
    sc.left = l; sc.right = r; sc.bottom = b; sc.top = t;
    sc.updateProjectionMatrix();
  }
  // snap the light's target to whole texels in light space (steady shadows while the camera glides)
  const tx = (r - l) / sun.shadow.mapSize.x, ty = (t - b) / sun.shadow.mapSize.y;
  const pr = camTarget.dot(_sunRight), pu = camTarget.dot(_sunUp);
  const dr = Math.round(pr / tx) * tx - pr, du = Math.round(pu / ty) * ty - pu;
  sun.target.position.copy(camTarget).addScaledVector(_sunRight, dr).addScaledVector(_sunUp, du);
  sun.position.copy(sun.target.position).add(SUN_OFFSET);
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();
}

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
const CAM_DIR = new THREE.Vector3(Math.sin(Math.PI / 4) * Math.cos(0.58), Math.sin(0.58), Math.cos(Math.PI / 4) * Math.cos(0.58)).normalize();
const camTarget = new THREE.Vector3();
const camVel = new THREE.Vector3();

function updateCameraFrustum() {
  const w = window.innerWidth, h = window.innerHeight;
  const aspect = w / Math.max(1, h);
  const base = aspect >= 1 ? 21 : 19 / aspect;
  const view = base / state.zoom / introZoom();
  // UI safe margin: shift the view down by half the navbar height so the top bar never covers the
  // action, without zooming out (Nathan sits a touch below centre)
  const navB = document.querySelector('.hud-top')?.getBoundingClientRect().bottom || 0;
  // on phones the joystick/buttons own the bottom edge: centre Nathan in the free band between the HUDs
  let botB = 0;
  if (document.body.classList.contains('touch-ui-on') && isCompactUI()) {
    const st = document.getElementById('tc-stick'), r = st && st.offsetParent !== null ? st.getBoundingClientRect() : null;
    if (r && r.top > h * 0.4) botB = h - r.top;
  }
  const sh = view * Math.max(-0.05, Math.min(0.07, ((navB - botB) * 0.5) / Math.max(1, h)));
  camera.top = view / 2 + sh; camera.bottom = -view / 2 + sh;
  camera.left = (-view * aspect) / 2; camera.right = (view * aspect) / 2;
  camera.updateProjectionMatrix();
}
function resize() {
  retro.setSize(window.innerWidth, window.innerHeight);
  updateCameraFrustum();
}
const introZoom = () => (reducedMotion ? 1 : 0.32 + 0.68 * easeOutCubic(state.intro));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// ---------------- World + player ----------------
let world, nav, map;
const player = new Player();
scene.add(player.group);
const xrayGate = createXrayOcclusion({ camera, player, getScene: () => scene });
const velocity = new THREE.Vector3();
const heightAt = (x, z) => {
  if (world) {
    const fh = world.floorAt(x, z);
    if (fh !== null) return fh;
  }
  const t = map && tileAt(map, x, z);
  return t ? Math.max(0, groundHeight(t.type)) : 0;
};

const marker = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.4, 12), new THREE.MeshBasicMaterial({ color: 0xff6a3d }));
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);

const dialogue = new Dialogue($('#dialogue'));

// ---------------- Loading: real progress, retries, nothing fake ----------------
// Each stage reports how much of it is genuinely done (downloads, parsing, scene build, shader
// compile, first frame). The bar is just the weighted sum; nothing here is a timer.
const LOAD = { w: { fonts: 6, content: 14, tahitiFiles: 10, kit: 2, world: 22, ui: 4, warm: 12, tahiti: 30 }, v: {}, shown: -1, label: 'LOADING' };
function setLoad(key, f = 1, label = '') {
  LOAD.v[key] = Math.max(LOAD.v[key] || 0, Math.min(1, f));
  if (label) LOAD.label = label;
  let sum = 0, tot = 0;
  for (const k in LOAD.w) { tot += LOAD.w[k]; sum += LOAD.w[k] * (LOAD.v[k] || 0); }
  const pct = tot ? Math.floor((sum / tot) * 100) : 0;
  if (pct === LOAD.shown && !label) return;
  LOAD.shown = pct;
  const bar = $('#boot-load');
  if (!bar) return;
  bar.setAttribute('aria-valuenow', String(pct));
  const lit = Math.round((pct / 100) * 12);
  bar.querySelectorAll('.boot-bar i').forEach((c, i) => c.classList.toggle('on', i < lit));
  const t = $('#boot-load-txt');
  if (t) t.textContent = `${LOAD.label} ${pct}%`;
}
function loadFail(msg) {
  const e = $('#boot-err');
  if (!e) return;
  $('#boot-load')?.classList.add('failed');
  $('#boot-err-msg').textContent = msg || 'Could not load the islands. Check your connection and try again.';
  e.classList.remove('hidden');
  $('#boot-retry')?.focus?.({ preventScroll: true });
}
// timer-backed so a hidden tab (rAF paused) can never stall the loading
const yieldFrame = () => new Promise((r) => { let d = false; const f = () => { if (!d) { d = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 60); });
// Both islands only need to be resident at once on devices that can afford it; elsewhere Tahiti's files are
// downloaded and cached up front and the world itself is prepared behind the flight's cloud cover.
const roomForBoth = () => !isTouch && (navigator.deviceMemory === undefined || navigator.deviceMemory >= 4) && !/[?&]lowmem\b/.test(location.search);

function mergeTahitiNpcs(data, base) {
  const out = [];
  const have = new Set((base.npcs || []).map((n) => n.id));
  const SKIP = new Set(['id', 'name', 'role', 'district', 'lines', 'topics', 'theme', 'companion', 'horseColor', 'scripted', 'sameAs']);
  for (const n of data.npcs || []) {
    if (have.has(n.id)) continue;
    // same person as on Island 01: same model (appearance), Tahiti name and lines
    const src = n.sameAs && (base.npcs || []).find((x) => x.id === n.sameAs);
    const look = src ? Object.fromEntries(Object.entries(src).filter(([k]) => !SKIP.has(k))) : {};
    const merged = { ...look, ...n };
    if (n.id === 'tahiti_cf2' && !n.extras && look.extras) merged.extras = look.extras;
    out.push(merged);
  }
  return out;
}

/** Build Tahiti once, off-screen, so its shaders, geometry and shadow passes are warm before anyone flies there. */
async function prewarmTahiti() {
  const tmap = mapCache.tahiti, raw = state.tahitiRaw;
  if (!tmap || !raw) return;
  await yieldFrame();
  const content = { ...state.content, npcs: [...state.content.npcs, ...mergeTahitiNpcs(raw, state.content)] };
  const tw = buildWorld(scene, content, tmap, kitOverrides);
  setLoad('tahiti', 0.45, 'PREPARING TAHITI');
  await yieldFrame();
  try { renderer.compile(scene, camera); } catch { /* the swap compiles again */ }
  setLoad('tahiti', 0.8);
  await yieldFrame();
  try { retro.render(scene, camera); } catch { /* ignore */ }
  scene.remove(tw.root);
  tw.dispose?.();
  _nightDirty = true;
  setLoad('tahiti', 1);
}

async function init() {
  try { await initInner(); } catch (err) {
    console.error(err);
    loadFail();
    await new Promise(() => {});   // never reaches "press start" with half a world
  }
}
async function initInner() {
  setLoad('fonts', 0, 'LOADING');
  await Promise.all(['32px Silkscreen', '32px Bangers', '16px Inter', '16px "IBM Plex Mono"'].map((f) => document.fonts.load(f).catch(() => {})));
  setLoad('fonts', 1);
  const tahitiFiles = Promise.all([
    fetchRetry(`${BASE}data/tahiti.json?v=${BUILD}`).then((d) => { state.tahitiRaw = d; setLoad('tahitiFiles', 0.4); }),
    loadTiledMap(`${BASE}${LEVELS.tahiti}?v=${BUILD}`).then((m) => { mapCache.tahiti = m; setLoad('tahitiFiles', 1); }),
  ]);
  tahitiFiles.catch(() => {});   // handled where it is awaited below
  let doneParts = 0;
  const part = (p) => p.then((v) => { setLoad('content', ++doneParts / 2); return v; });
  [state.content, map] = await Promise.all([part(loadContent()), part(loadTiledMap(`${BASE}${LEVELS.island1}?v=${BUILD}`))]);
  const overrides = await loadKitOverrides(BASE);
  kitOverrides = overrides;
  setLoad('kit', 1);
  await yieldFrame();
  mapCache.island1 = map; state.level = 'island1';
  setLoad('world', 0.1, 'BUILDING ISLAND 01');
  await yieldFrame();
  world = buildWorld(scene, state.content, map, overrides);
  nav = makeNav();
  setLoad('world', 0.7);
  await yieldFrame();
  const s = state.save;
  const spawn = s.pos && nav.isWalkable(s.pos.x, s.pos.z) ? s.pos : map.spawn || { x: 2, z: 6 };
  player.group.position.set(spawn.x, heightAt(spawn.x, spawn.z), spawn.z);
  player.heading = spawn === s.pos ? Math.PI / 4 : Math.PI; // new game: face the CRT
  world.interactables.forEach((it) => { if (isDone(it)) markVisited(it, true); });
  state.complete = MAIN_DISTRICTS.every((d) => s.chapters.includes(d.id));
  if (s.chapters.includes('iron-yard') || s.minigames.includes('lift')) player.setBuff(true);
  if (GYM_IDS.every((id) => (s.gym || []).includes(id))) player.setJacked(true);
  if (s.finale) world.apis.lighthouse?.setLit(true);
  setLoad('world', 1);
  setupUI();
  tour.bind();
  setupLabels();
  setupMinimap();
  resize();
  camTarget.copy(player.group.position);
  if (state.level === 'island1') guruRoutine.enter();
  if (debugOn) setupDebug();
  setLoad('ui', 1);
  await yieldFrame();
  update(0, 0);
  setLoad('warm', 0.2, 'WARMING UP');
  try { renderer.compile(scene, camera); } catch { /* ignore */ }
  setLoad('warm', 0.6);
  await yieldFrame();
  renderer.info.reset();
  retro.render(scene, camera);
  setLoad('warm', 1);
  await tahitiFiles;
  if (roomForBoth()) { setLoad('tahiti', 0.1, 'PREPARING TAHITI'); await prewarmTahiti(); }
  else { LOAD.w.tahiti = 0; setLoad('tahiti', 1); }
  await yieldFrame();
  retro.render(scene, camera);   // Island 01 is the last thing drawn, so its frame is the one waiting at "press start"
  state.bootWarmed = true;
  setLoad('warm', 1, 'READY');
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
  $('#album-btn')?.addEventListener('click', openAlbum);
  $('#look-palette').addEventListener('click', () => { look.palette = look.palette === 'pastel' ? 'bright' : 'pastel'; applyLook(); });
  $('#look-pixels').addEventListener('click', () => { look.pixels = look.pixels === 'retro' ? 'smooth' : 'retro'; applyLook(); resize(); });
  $('#look-time').addEventListener('click', cycleTime);
  $('#look-motion')?.addEventListener('click', () => { look.motion = look.motion === 'off' ? 'on' : 'off'; applyLook(); });
  $('#look-music')?.addEventListener('click', () => { look.music = look.music === 'off' ? 'on' : 'off'; if (look.music === 'on' && !look.sound) look.sound = true; applyLook(); });
  $('#music-vol')?.addEventListener('input', (e) => { look.musicVol = Number(e.target.value) / 100; setMusic(look.music !== 'off', look.musicVol); try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch { /* ignore */ } });
  $('#nav-education')?.addEventListener('click', (e) => { e.preventDefault(); $('#recruiter-bar').classList.remove('open'); $('#menu-toggle').setAttribute('aria-expanded', 'false'); openEducation(); });
  $('#look-sound').addEventListener('click', () => { look.sound = !look.sound; applyLook(); if (look.sound) sfx.open(); });
  applyLook();
  $('#journey-toggle').addEventListener('click', () => {
    journeyTouched = true;
    const j = $('.journey');
    const compact = isCompactUI();
    j.classList.toggle(compact ? 'open-m' : 'collapsed');
    $('#journey-toggle').setAttribute('aria-expanded', String(compact ? j.classList.contains('open-m') : !j.classList.contains('collapsed')));
  });
  // chapter drawer (phones): tapping the dim backdrop or pressing Esc closes it
  const closeDrawer = () => { const j = $('.journey'); if (j.classList.contains('open-m')) { j.classList.remove('open-m'); $('#journey-toggle').setAttribute('aria-expanded', 'false'); } };
  document.addEventListener('pointerdown', (e) => { if ($('.journey').classList.contains('open-m') && !e.target.closest('.journey, #chars-panel')) { e.preventDefault(); closeDrawer(); } }, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); }, true);
  $('#journey-list').addEventListener('click', () => { if (isCompactUI()) setTimeout(closeDrawer, 0); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F3' && !e.repeat) { e.preventDefault(); toggleDebug(); return; }
    if (state.minigame && mgRoot()?.onkey && !e.repeat) { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (k.startsWith('Arrow') || k === ' ' || k === 'e' || k === 'Enter') { e.preventDefault(); mgRoot().onkey(k); return; } }
    if (!state.started || state.minigame || state.ko || state.flightStarting) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (state.gym) {
      const k = e.key.toLowerCase();
      if (k === 'escape' || ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) gymCancel();
      else if (k === 'e' && !e.repeat) { e.preventDefault(); gymPush(); }
      return;
    }
    if (state.level === 'tahiti' && !e.repeat && !state.mount && ['r', 'f', 'g'].includes(e.key.toLowerCase()) && tahiti.key(e.key.toLowerCase())) { e.preventDefault(); return; }
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (e.target.closest?.('#tour-card, #tour-modal')) return;
    if (e.key === 'h' || e.key === 'H') { e.preventDefault(); toggleControls(); return; }
    if (e.key === 'm' || e.key === 'M') { e.preventDefault(); toggleBigMap(); return; }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); cycleTime(); return; }
    if ((e.key === 'r' || e.key === 'R') && state.mount) { e.preventDefault(); resetMount(); return; }
    if (e.key === 'Escape' && state.groupScene) { endGroupScene(); return; }
    if (e.key === 'Escape') {
      if (!$('#bigmap').classList.contains('hidden')) return toggleBigMap(false);
      if (!$('#controls').classList.contains('hidden')) return toggleControls(false);
      if (dialogue.open) dialogue.close(); else closePanel();
    }
    if (e.key === ' ' && !dialogue.open) {
      e.preventDefault();
      if (state.volley || state.hoop) { tahiti.key(' '); return; }
      if (state.mount) {
        if (mountJump()) {
          if (state.mount.it.vtype === 'horse') sfx.whinny();
          else sfx.rep();
        }
        return;
      }
      if (state.passengerOf === 'guru') return;
      if (player.jump()) sfx.rep();
      return;
    }
    const act = e.key === 'e' || e.key === 'E' || e.key === 'Enter' || (e.key === ' ' && dialogue.open);
    const focused = document.activeElement;
    if (!act || focused?.closest?.('input, textarea, select')) return;
    if (e.key === 'Enter' && focused?.closest?.('a, button')) return; // let Enter press the focused button
    e.preventDefault();
    if (dialogue.open) dialogue.advance();
    else if (state.nearby && !state.panelOpen && !(e.repeat && state.nearby.kind === 'gym') && performance.now() - dialogue.closedAt > 350) interact(state.nearby);
  });
  dialogue.onClose = () => {
    const it = state.talkingTo;
    state.talkingTo = null;
    if (it) { it.character.talking = false; it.character.lookAt(null); player.talking = false; }
    if (state.level === 'island1') guruRoutine.resumeFromDialogue();
  };
  dialogue.setConversationSystem(conversationSystem, state.save);
  dialogue.onMemory = (id) => unlockMemory(id);
  dialogue.onAction = (name) => {
    state.talkingTo?.character.play('nod');
    if (name === 'fly-tahiti' || name === 'fly-home') {
      // accepting a flight ends the conversation at once: speaker, text, choices and queue are
      // cleared before departure starts, and nothing can reopen it while the flight runs
      if (state.flightStarting || state.cine) return;
      const home = name === 'fly-home';
      dialogue.close();
      if (home && !tahiti.harrisNearJet()) {
        tahiti.callHarrisToJet();
        toast('Harris will meet you at the jet.');
        return;
      }
      conversationSystem.recordEvent(state.save, 'harris', home ? 'flight_home' : 'flight_tahiti');
      persist();
      return void startFlight(home ? 'island1' : 'tahiti');
    }
    if (name === 'scooter-ride' || name === 'join-guru-ride') {
      dialogue.close();
      if (state.level === 'island1') {
        guruRoutine.triggerRideTogether();
        conversationSystem.recordEvent(state.save, 'guru', 'scooter_ride');
        persist();
      } else {
        const scooty = world.interactables.find((i) => i.kind === 'vehicle' && i.vtype === 'scooty');
        if (scooty) {
          const p = player.group.position;
          scooty.x = p.x;
          scooty.z = p.z;
          scooty.model.group.position.set(p.x, heightAt(p.x, p.z), p.z);
          mount(scooty);
          conversationSystem.recordEvent(state.save, 'guru', 'scooter_ride');
          persist();
          toast("Riding Guru's Scooty! WASD to steer, Shift for speed.");
        } else {
          toast("Guru's Scooty is parked nearby.");
        }
      }
      return;
    }
    if (name === 'tahiti-moto') {
      const moto = world.interactables.find((i) => i.kind === 'vehicle' && i.vtype === 'moto');
      if (moto) {
        dialogue.close();
        const p = player.group.position;
        moto.x = p.x;
        moto.z = p.z;
        moto.model.group.position.set(p.x, heightAt(p.x, p.z), p.z);
        mount(moto);
        conversationSystem.recordEvent(state.save, 'jeswin', 'motorcycle_ride');
        persist();
        toast("Cruising on the motorcycle with Jeswin!");
      } else {
        toast("The motorcycle is ready on the island path.");
      }
      return;
    }
    if (name === 'tahiti-basket') {
      dialogue.close();
      conversationSystem.recordEvent(state.save, 'anu', 'anu_hoops');
      persist();
      if (state.level === 'tahiti') {
        tahiti.leaveJoin();
        tahiti.interact({ kind: 'activity', act: 'anuhoop' });
      } else {
        toast("Basketball challenge is on the Tahiti court!");
      }
      return;
    }
    if (name === 'tahiti-feast') {
      dialogue.close();
      conversationSystem.recordEvent(state.save, 'thianesh', 'eating_contest');
      persist();
      if (state.level === 'tahiti') {
        tahiti.leaveJoin();
        tahiti.interact({ kind: 'activity', act: 'foodcontest' });
      } else {
        toast("The feast challenge is waiting on Tahiti!");
      }
      return;
    }
    if (name === 'tahiti-tvgame') {
      dialogue.close();
      conversationSystem.recordEvent(state.save, 'akshai', 'pixel_defenders');
      conversationSystem.recordEvent(state.save, 'prince', 'pixel_defenders');
      persist();
      if (state.level === 'tahiti') {
        tahiti.leaveJoin();
        tahiti.interact({ kind: 'activity', act: 'tvgame' });
      } else {
        toast("Pixel Defenders arcade game is in the Tahiti villa!");
      }
      return;
    }
    if (name === 'tahiti-photo') {
      dialogue.close();
      conversationSystem.recordEvent(state.save, 'shabesh', 'photo_session');
      conversationSystem.recordEvent(state.save, 'sathesh', 'photo_session');
      persist();
      if (state.level === 'tahiti') {
        tahiti.leaveJoin();
        tahiti.interact({ kind: 'activity', act: 'photosession' });
      } else {
        toast("Photo shoot session is set up on Tahiti!");
      }
      return;
    }
    if (name === 'tahiti-volley-vg' || name === 'tahiti-volley-ol') {
      dialogue.close();
      const gang = name === 'tahiti-volley-vg' ? 'vg' : 'ol';
      conversationSystem.recordEvent(state.save, 'volleyball', 'match');
      persist();
      if (state.level === 'tahiti') {
        tahiti.leaveJoin();
        tahiti.interact({ kind: 'activity', act: 'volley', gang });
      } else {
        toast("Beach volleyball courts are waiting on Tahiti!");
      }
      return;
    }
    if (name === 'gym-lift') {
      dialogue.close();
      conversationSystem.recordEvent(state.save, 'thianesh', 'gym_lift');
      persist();
      startMinigame({ kind: 'minigame', game: 'lift' });
      return;
    }
    if (name === 'open-album') {
      dialogue.close();
      openAlbum();
      return;
    }
    if (name === 'project-aratro') {
      dialogue.close();
      const it = world.interactables.find((i) => i.kind === 'project' && i.projectId === 'aratro');
      if (it) interact(it);
      return;
    }
    if (name === 'project-scheduler') {
      dialogue.close();
      const it = world.interactables.find((i) => i.kind === 'project' && i.projectId?.includes('schedule'));
      if (it) interact(it);
      return;
    }
    if (name === 'project-microservices') {
      dialogue.close();
      const it = world.interactables.find((i) => i.kind === 'project' && i.projectId?.includes('security'));
      if (it) interact(it);
      return;
    }
    if (name === 'pop_cinema') {
      world.apis.pop_cinema?.trigger?.({ toast, sfx });
      toast("Outdoor cinema projector is rolling! Marvel movie marathon.");
      return;
    }
    world.apis[name]?.trigger({ toast, sfx });
  };
}

function renderJourney() {
  const s = state.save;
  const list = $('#journey-list');
  const nextId = DISTRICTS.find((d) => !d.optional && !s.chapters.includes(d.id))?.id;
  list.innerHTML = DISTRICTS.map((d) => {
    const ch = chapterFor(state.content, d.id);
    const done = s.chapters.includes(d.id);
    return `<li class="${done ? 'done' : ''}${d.optional ? ' optional' : ''}${d.id === nextId ? ' next' : ''}"><button type="button" data-goto="${d.id}">${esc(ch?.title || d.name)}</button></li>`;
  }).join('');
  list.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const it = world.interactables.find((i) => i.kind === 'chapter' && i.district === b.dataset.goto)
      || (b.dataset.goto === 'garage' && world.interactables.find((i) => i.kind === 'project'));
    if (it) walkToInteractable(it);
  }));
  const main = MAIN_DISTRICTS.filter((d) => s.chapters.includes(d.id)).length;
  const totalMem = (state.content.memories || []).length;
  $('#journey-count').textContent = `${main}/${MAIN_DISTRICTS.length}`;
  const memCount = $('#mem-count');
  if (memCount) memCount.textContent = `${s.memories.length}/${totalMem}`;
}

// ---------------- Interactions ----------------
function interact(it) {
  if (state.visiting) return;   // tour or visit transition: no accidental interactions
  if (state.mount) return dismount();
  if (state.passengerOf === 'guru') return guruRoutine.dismountNathanPassenger();
  if (state.seated) return standUp();
  if (it.kind === 'group') return runGroupScene(it);
  if (it.kind === 'activity') { tahiti.leaveJoin(); return void tahiti.interact(it); }
  if (it.kind === 'vehicle') {
    if (it.vtype === 'scooty' && state.level === 'island1' && guruRoutine.isGuruMounted()) {
      return guruRoutine.boardNathanAsPassenger();
    }
    return mount(it);
  }
  if (it.kind === 'seat') return sitDown(it);
  if (it.kind === 'npc') return talkTo(it);
  if (it.kind === 'minigame') return startMinigame(it);
  if (it.kind === 'memory') return collectMemory(it);
  if (it.kind === 'station') return openStations(it);
  if (it.kind === 'panel') return openInfoPanel(it);
  if (it.kind === 'finale') return runFinale(it);
  if (it.kind === 'gym') return interactGym(it);
  if (it.kind === 'chapter' && it.district === 'iron-yard') return openDiscipline(it);
  openInteractable(it);
}

function face(target) {
  if (!target || typeof target.x !== 'number' || typeof target.z !== 'number' || Number.isNaN(target.x) || Number.isNaN(target.z)) return;
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
    html = `${tourOverviewHtml(c, p.id)}<h2 id="panel-title" class="sr-only">${esc(p.title)}</h2>${projectDetails(p)}`;
  } else if (it.kind === 'about') {
    const p = c.profile || {};
    bar = 'about/readme.txt';
    html = `
      ${chapterHeader({ period: p.availability, title: p.name, subtitle: `${p.role || ''}${p.location ? ` · ${p.location}` : ''}` })}
      <p>${esc(p.summary)}</p>
      ${(p.about || []).map((t) => `<p>${esc(t)}</p>`).join('')}
      <div class="transmit"><a class="btn" href="./#about">Full profile →</a>${c.profile?.resumeUrl ? `<a class="btn" href="${esc(safeUrl(c.profile.resumeUrl))}" target="_blank" rel="noopener">Resume ↗</a>` : ''}</div>`;
  } else {
    const ch = chapterFor(c, it.district) || { title: it.district, body: [] };
    bar = `${it.district}/chapter.txt`;
    const mems = (c.memories || []).filter((m) => m.district === it.district);
    const found = mems.filter((m) => state.save.memories.includes(m.id)).length;
    html = `${chapterHeader(ch)}
      ${(ch.body || []).map((p) => `<p>${esc(p)}</p>`).join('')}
      ${ch.highlights?.length ? `<ul class="highlights">${ch.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      ${mems.length ? `<p class="mem-hint">Memories here: <b>${found}/${mems.length}</b>${found < mems.length ? ' · look for the glowing ✦ nearby.' : ' · all found.'}</p>` : ''}`;
    const edu = (c.education || []).find((e) => e.district === it.district);
    if (edu) html += educationExtras(edu);
    if (it.district === 'garage') {
      html += `<div class="panel-projects">${c.projects.map(projectCard).join('')}</div><a class="btn" href="./#projects">All projects →</a>`;
    }
    if (it.district === 'signal-tower') {
      html += (c.skills || []).map((g, gi) => `<div class="tb-head" style="--bc:var(--sk${gi % 5})"><span>${esc(g.group)}</span></div><ul class="tb-grid" style="--bc:var(--sk${gi % 5})">${(g.items || []).map((s) => `<li><span class="sk-icon">${skillIcon(s)}</span><b>${esc(s)}</b></li>`).join('')}</ul>`).join('');
      if ((c.experience || []).length) html += `<div class="tb-head" style="--bc:var(--sk4)"><span>Experience</span></div><ul class="tb-exp">${c.experience.map((e) => `<li>${orgLogo(e)}<div><b>${esc(e.role)}</b><span class="tb-org">${esc(e.org)}</span><span class="tb-per">${esc(e.period)}</span><p>${esc(e.summary)}</p></div></li>`).join('')}</ul>`;
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
  if (it.kind === 'chapter') mountChapterMedia(chapterFor(c, it.district));
  $('#panel-body').querySelectorAll('.tb-grid .sk-icon img, .tb-head .gh-ico img').forEach(pixelateIcon);
  if (it.kind === 'project') {
    $('#panel-body').querySelectorAll('[data-tour-project]').forEach((b) => b.addEventListener('click', () => {
      const next = world.interactables.find((i) => i.kind === 'project' && i.projectId === b.dataset.tourProject);
      if (!next) return;
      openInteractable(next);
      const q = player.group.position;
      state.panelOpen = { x: q.x, z: q.z, radius: 99 };   // switching stations from here must not close the panel
    }));
    const p = c.projects.find((x) => x.id === it.projectId);
    const box = document.createElement('div'); box.className = 'proj-media';
    const media = [...new Set([...(p?.media || []), ...(p?.media?.length && p.image ? [p.image] : [])])];
    mountPhotoViewer(box, media.map((src) => ({ src, caption: p.title })));
    if (box.childElementCount) {
      $('#panel-body').querySelector('.pd-shot')?.remove(); // the screenshot is already in the viewer
      $('#panel-body').querySelector('h2')?.after(box);
    }
  }
  $('#panel-body').querySelectorAll('[data-gym]').forEach((b) => b.addEventListener('click', () => startMinigame({ ...it, game: b.dataset.gym })));
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

// One shared cleanup for every dismissal path (close button, Esc, walking away, panel replaced, page hide):
// pause + rewind + release every viewer video so nothing keeps playing detached from the DOM.
const liveVideos = new Set();
function stopPanelMedia(root = document) {
  for (const v of [...liveVideos]) {
    if (root !== document && !root.contains(v) && v.isConnected) continue;
    try { v.pause(); v.currentTime = 0; v.removeAttribute('src'); v.load(); } catch { /* ignore */ }
    liveVideos.delete(v);
  }
  root.querySelectorAll?.('video').forEach((v) => { try { v.pause(); } catch { /* ignore */ } });
}

function showPanel(bar, html, it = null, cls = '') {
  stopPanelMedia();
  $('#panel-bar').textContent = bar;
  $('#panel-body').innerHTML = html;
  $('#panel-body').scrollTop = 0;
  $('#panel').className = `panel window ${cls}`;
  // every open / card change starts at the title: reset every scroller now and after layout
  const resetScroll = () => { $('#panel').scrollTop = 0; $('#panel-body').scrollTop = 0; $('#panel-body').querySelectorAll('.sk-scroll, .panel-body-inner').forEach((e) => { e.scrollTop = 0; }); };
  resetScroll(); requestAnimationFrame(() => { resetScroll(); setTimeout(resetScroll, 120); });
  sfx.open();
  state.panelOpen = it || { x: player.group.position.x, z: player.group.position.z, radius: 99 };
  $('#prompt').classList.add('hidden');
}

function closePanel() {
  stopPanelMedia();
  if (!state.panelOpen) return;
  $('#panel').classList.add('hidden');
  sfx.close();
  state.panelOpen = null;
  state.nearby = null; // re-evaluate prompt next frame
}

async function talkTo(it) {
  if (state.flightStarting || state.cine) return;
  if (it.npcId === 'guru' && state.level === 'island1') {
    guruRoutine.pauseForDialogue();
  }
  const base = (state.content.npcs || []).find((n) => n.id === it.npcId);
  const over = state.level === 'tahiti' && state.tahiti?.overrides?.[it.npcId];
  const def = base && over ? { ...base, ...over } : base;
  if (!def) return;
  closePanel();
  state.talkingTo = it;
  face(it);
  it.character.lookAt(player.group.position.clone());
  const ch = it.character, p = player.group.position;
  if (!it.seated) ch.heading = Math.atan2(p.x - it.x, p.z - it.z);   // people at a table stay seated and only look round
  ch.play(it.seated ? 'nod' : 'wave');
  ch.talking = true;
  $('#prompt').classList.add('hidden');
  if (addUnique(state.save.talked, it.npcId)) { markVisited(it); persist(); }

  dialogue.setConversationSystem(conversationSystem, state.save);

  const ctx = {
    npcId: it.npcId,
    level: state.level,
    district: it.district,
    it,
    timeOfDay: state.timeOfDay || 'day',
    weather: state.weather,
    mount: state.mount ? state.mount.cfg.label : null,
    activity: state.level === 'tahiti' ? tahiti.getNpcActivity?.(it.npcId) : (it.npcId === 'guru' ? { act: guruRoutine.getRoutinePhase() } : null),
    harrisState: it.npcId === 'harris' && state.level === 'tahiti' ? tahiti.harrisState?.() : null,
    routinePhase: it.npcId === 'guru' && state.level === 'island1' ? guruRoutine.getRoutinePhase() : null,
    save: state.save,
  };

  const conversation = await conversationSystem.buildConversation(def, ctx);
  dialogue.start(def, {
    conversation,
    asked: it.asked || (it.asked = new Set()),
  });
}

function startMinigame(it) {
  if (it.game === 'tempo') return startTempo(it);
  if (it.game !== 'lift') return;
  closePanel();
  face(it);
  const mem = (state.content.memories || []).find((m) => m.id === 'transformation');
  state.minigame = runLift($('#minigame'), {
    title: 'Progressive overload',
    intro: 'Three clean reps. The groove gets tighter every set, just like it did in real life.',
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

function startTempo(it) {
  closePanel();
  face(it);
  state.minigame = runTempo($('#minigame'), {
    title: 'Tempo set',
    intro: 'Eight reps, steady tempo, one pause rep. Strength is rhythm you can repeat.',
    onDone: ({ skipped, hits }) => {
      state.minigame = null;
      player.play('flex');
      if (addUnique(state.save.minigames, 'tempo')) persist();
      if (!skipped) toast(`TEMPO SET · ${hits}/8 on beat`);
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

const orgLogo = (e) => e.logo ? `<img class="org-logo" src="${esc(safeUrl(e.logo))}" alt="" loading="lazy">` : '';
const DEVICON = { Python: 'python', Java: 'java', JavaScript: 'javascript', TypeScript: 'typescript', C: 'c', 'C++': 'cplusplus', SQL: 'azuresqldatabase', Solidity: 'solidity',
  HTML: 'html5', CSS: 'css3', React: 'react', 'Next.js': 'nextjs', Flask: 'flask', 'Node.js': 'nodejs', 'Tailwind CSS': 'tailwindcss', MySQL: 'mysql', MongoDB: 'mongodb', SQLite: 'sqlite',
  Docker: 'docker', Kubernetes: 'kubernetes', Grafana: 'grafana', Git: 'git', GitHub: 'github', 'Blender (learning)': 'blender', 'Three.js': 'threejs', 'Ethereum / Ganache': 'ethereum' };
const SIMPLE_ICON = { 'Ethereum / Ganache': 'ethereum' };
const GLYPH = { Falco: '🦅', 'Audit-event monitoring': '🛡️', 'AI-assisted prototyping': '🤖', 'Prompt engineering': '💬', Reflect: '🪞', 'BugBug.io': '🐞', 'Ethereum / Ganache': '⬨' };
const glyphOf = (name) => GLYPH[name] || name[0];
const skillIcon = (name) => {
  const gl = esc(glyphOf(name));
  if (SIMPLE_ICON[name]) return `<img src="https://cdn.jsdelivr.net/npm/simple-icons@9.21.0/icons/${SIMPLE_ICON[name]}.svg" alt="" crossorigin="anonymous" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'sk-fallback',textContent:'${gl}'}))">`;
  return DEVICON[name]
    ? `<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/${DEVICON[name]}/${DEVICON[name]}-original.svg" alt="" crossorigin="anonymous" onerror="if(!this.dataset.p){this.dataset.p=1;this.src=this.src.replace('-original','-plain')}else{this.replaceWith(Object.assign(document.createElement('span'),{className:'sk-fallback',textContent:'${gl}'}))}">`
    : `<span class="sk-fallback">${gl}</span>`;
};
const GROUP_ICON = [[/lang/i, 'Python'], [/web|data/i, 'React'], [/cloud|secur/i, 'Kubernetes'], [/\bai\b/i, 'AI-assisted prototyping'], [/tool/i, 'Git']];
const groupIcon = (g) => `<span class="gh-ico">${skillIcon((GROUP_ICON.find(([re]) => re.test(g.group)) || [])[1] || (g.items || [])[0] || g.group)}</span>`;
// Redraw a logo at 18×18 and scale it up with hard edges, so it reads as pixel art
const PIXEL_CACHE = new Map();
function pixelateIcon(img) {
  const run = () => {
    if (img.dataset.px) return;
    const key = img.src;
    const done = (url) => { img.dataset.px = 1; img.src = url; img.classList.add('px'); };
    if (PIXEL_CACHE.has(key)) return done(PIXEL_CACHE.get(key));
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = 18;
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = true;
      g.drawImage(img, 0, 0, 18, 18);
      const url = cv.toDataURL('image/png'); PIXEL_CACHE.set(key, url); done(url);
    } catch { img.classList.add('px'); }
  };
  if (img.complete && img.naturalWidth) run(); else img.addEventListener('load', run);
}
const achGallery = (a) => (a.images || []).length ? `<div class="ach-gallery">${a.images.map((u) => safeUrl(u)).filter(Boolean).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="${esc(a.title)}" loading="lazy"></a>`).join('')}</div>` : '';
// Large photo viewer with ◀ ▶ arrows (achievement photos)
// Album photo card: a pop-up over the game with the photo large, ◀ ▶ to browse, Esc / ✕ to close.
function openPhotoCard(list, i) {
  document.querySelector('.photo-card')?.remove();
  const card = document.createElement('div');
  card.className = 'photo-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', 'Photo');
  card.innerHTML = `<div class="pc-box window"><div class="window-bar"><span class="title">tahiti/album</span><button type="button" class="panel-close pc-close" aria-label="Close photo">✕</button></div>
    <div class="pc-body"><img alt=""><p class="pc-cap"><span></span><b></b></p>
    <div class="pc-nav"><button type="button" class="btn" data-d="-1" aria-label="Previous photo">◀</button><a class="btn" download="tahiti-photo.jpg">Save ↓</a><button type="button" class="btn" data-d="1" aria-label="Next photo">▶</button></div></div></div>`;
  const img = card.querySelector('img'), cap = card.querySelector('.pc-cap span'), cnt = card.querySelector('.pc-cap b'), dl = card.querySelector('a[download]');
  const show = () => {
    const p = list[i]; img.src = p.url; img.alt = p.gang || 'Tahiti photo'; dl.href = p.url;
    cap.textContent = `${p.gang ? p.gang + ' · ' : ''}${new Date(p.at).toLocaleString()}`; cnt.textContent = `${i + 1} / ${list.length}`;
    card.querySelectorAll('[data-d]').forEach((b) => { b.hidden = list.length < 2; });
  };
  const close = () => { card.remove(); removeEventListener('keydown', key, true); };
  const key = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'ArrowLeft') { i = (i - 1 + list.length) % list.length; show(); }
    else if (e.key === 'ArrowRight') { i = (i + 1) % list.length; show(); }
  };
  card.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { i = (i + +b.dataset.d + list.length) % list.length; show(); }));
  card.querySelector('.pc-close').addEventListener('click', close);
  card.addEventListener('click', (e) => { if (e.target === card) close(); });
  addEventListener('keydown', key, true);
  document.body.append(card); show(); card.querySelector('.pc-close').focus();
}
const isVideoUrl = (u) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u);
function mountPhotoViewer(box, slides) {
  stopPanelMedia(box);   // re-mounting inside the same box must not leave the previous video playing
  slides = slides.map((x) => ({ ...x, src: safeUrl(x.src) })).filter((x) => x.src);
  if (!slides.length) return;
  let i = 0;
  const v = document.createElement('div');
  v.className = 'photo-viewer';
  v.innerHTML = `<div class="pv-stage"><img alt=""><video controls playsinline preload="metadata" hidden></video><button type="button" class="pv-nav prev" aria-label="Previous photo">◀</button><button type="button" class="pv-nav next" aria-label="Next photo">▶</button></div><p class="pv-cap"><span class="pv-title"></span><span class="pv-count"></span></p>`;
  const img = v.querySelector('img'), vid = v.querySelector('video'), title = v.querySelector('.pv-title'), count = v.querySelector('.pv-count');
  const show = () => {
    const s = slides[i];
    const isVid = isVideoUrl(s.src);
    vid.pause(); img.hidden = isVid; vid.hidden = !isVid;
    if (isVid) { vid.src = s.src; vid.muted = false; vid.volume = 1; liveVideos.add(vid); }
    else { vid.removeAttribute('src'); vid.load(); img.src = s.src; img.alt = s.caption || ''; }
    title.textContent = s.caption || ''; count.textContent = `${i + 1} / ${slides.length}`;
    v.querySelectorAll('.pv-nav').forEach((b) => { b.hidden = slides.length < 2; });
  };
  v.querySelector('.prev').addEventListener('click', () => { i = (i - 1 + slides.length) % slides.length; show(); });
  v.querySelector('.next').addEventListener('click', () => { i = (i + 1) % slides.length; show(); });
  img.addEventListener('click', () => window.open(slides[i].src, '_blank', 'noopener'));
  show();
  box.append(v);
}
const allAchievementSlides = (list) => list.flatMap((a) => (a.images || []).map((src) => ({ src, caption: a.title })));

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
      ${(c.achievements || []).length ? `<ul class="highlights">${c.achievements.map((a) => `<li><b>${esc(a.title)}</b>${a.org ? ` · ${esc(a.org)}` : ''} <span class="muted">${esc(a.year || '')}</span>${a.detail ? `<br>${esc(a.detail)}` : ''}${achGallery(a)}</li>`).join('')}</ul>` : '<p>Add achievements in the admin.</p>'}`;
  } else if (it.panel === 'experience') {
    html = `<p class="eyebrow">SIGNAL TOWER · RADIO LOG</p><h2 id="panel-title">Experience</h2>
      ${(c.experience || []).length ? `<ul class="highlights">${c.experience.map((e) => `<li class="has-logo">${orgLogo(e)}<b>${esc(e.role)}</b> · ${esc(e.org)} <span class="muted">${esc(e.period || '')}</span><br>${esc(e.summary || '')}</li>`).join('')}</ul>` : '<p>Add experience in the admin.</p>'}
      ${c.profile?.resumeUrl ? `<div class="transmit"><a class="btn" href="${esc(safeUrl(c.profile.resumeUrl))}" target="_blank" rel="noopener">Full resume ↗</a></div>` : ''}`;
  } else if (it.panel === 'skilltree') {
    const groups = c.skills || [];
    const total = groups.reduce((n, g) => n + (g.items || []).length, 0);
    html = `<div class="sk-fixed">
      <header class="sk-hero"><img class="sk-hero-face" src="${portraitURL()}" alt=""><div><p class="eyebrow">GUILD HALL</p><h2 id="panel-title">Skill tree</h2><small>MY TECH STACK &amp; SKILLS</small></div></header>
      <div class="sk-stats"><span><i>&lt;/&gt;</i><b>${total}</b>SKILLS</span><span><i>▤</i><b>${groups.length}</b>DOMAINS</span><span><i>♛</i><b>MAX</b>CURIOSITY</span></div>
      <div class="sk-tabs"><button type="button" class="gh-branch" data-branch="all" aria-expanded="true">▦ All</button>${groups.map((g, i) => `<button type="button" class="gh-branch" data-branch="${i}" aria-expanded="false" style="--bc:var(--sk${i % 5})">${groupIcon(g)}${esc(g.group)} <em>${(g.items || []).length}</em></button>`).join('')}</div>
    </div>
    <div class="gh-nodes sk-scroll" id="gh-nodes" aria-live="polite"></div>`;
  } else if (it.panel === 'trophies') {
    const tier = (a) => /winner|first/i.test(a.title) ? 'gold' : /runner|second|third/i.test(a.title) ? 'silver' : 'bronze';
    html = `<p class="eyebrow">GUILD HALL · TROPHY COLLECTION</p><h2 id="panel-title">Trophies</h2>
      <p class="subtitle">${(c.achievements || []).length} trophies. Select one to read the plaque.</p>
      <div class="gh-trophies">${(c.achievements || []).map((a, i) => `<button type="button" class="gh-trophy ${tier(a)}" data-trophy="${i}"><span class="cup"></span><b>${esc(a.title)}</b></button>`).join('')}</div>
      <div class="gh-plaque" id="gh-plaque" aria-live="polite"></div>`;
  } else if (it.panel === 'quests') {
    const exp = c.experience || [];
    const main = exp.filter((e) => /hewlett|hpe|sez/i.test(e.org)), side = exp.filter((e) => !main.includes(e));
    const q = (e, kind) => `<details class="gh-quest ${kind}"${kind === 'main' ? ' open' : ''}><summary><span class="quest-logo">${e.logo ? `<img src="${esc(safeUrl(e.logo))}" alt="${esc(e.org)} logo">` : esc((e.org || '?')[0])}</span><span class="quest-info"><span class="tag">${kind === 'main' ? '★ MAIN QUEST' : '◆ SIDE QUEST'}</span><b>${esc(e.org)}</b><span class="quest-role">${esc(e.role)}${e.period ? ` <i>${esc(e.period)}</i>` : ''}</span></span><span class="quest-caret">▾</span></summary><p>${esc(e.summary || '')}</p></details>`;
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
      <p class="eyebrow" style="margin-top:14px">PROJECTS · ${(c.projects || []).length}</p>
      <ul class="gh-proj">${(c.projects || []).map((pr) => `<li><b>${esc(pr.title)}</b>${pr.year ? `<span class="muted"> · ${esc(pr.year)}</span>` : ''}${pr.school ? ' <span class="gh-first">FIRST UI PROJECT</span>' : ''}<br><span class="muted">${esc(pr.pitch || '')}</span>${pr.github ? ` <a href="${esc(safeUrl(pr.github))}" target="_blank" rel="noopener">Code ↗</a>` : ''}</li>`).join('')}</ul>
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
  showPanel(`${it.district}/${it.panel}.txt`, html, it, it.panel === 'skilltree' ? 'sk-panel' : '');
  if (!it.visited) { markVisited(it); }
  const body = $('#panel-body');
  if (it.panel === 'skilltree') {
    const groups = c.skills || [];
    world.apis.guild_skill_tree?.trigger();
    const drawSkills = (which) => {
      const list = which === 'all' ? groups.map((g, i) => [g, i]) : [[groups[+which], +which]];
      $('#gh-nodes').innerHTML = list.map(([g, gi]) => `<section class="sk-branch" style="--bc:var(--sk${gi % 5})"><h3>${groupIcon(g)}${esc(g.group)}<em>${(g.items || []).length} / ${(g.items || []).length}</em></h3>
        <ul class="gh-node-list sk-grid">${(g.items || []).map((x, i) => `<li style="animation-delay:${i * 40}ms"><span class="sk-icon">${skillIcon(x)}</span><b>${esc(x)}</b></li>`).join('')}</ul></section>`).join('');
      $('#gh-nodes').querySelectorAll('.sk-icon img, .gh-ico img').forEach(pixelateIcon);
    };
    body.querySelectorAll('.gh-ico img').forEach(pixelateIcon);
    drawSkills('all');
    body.querySelectorAll('[data-branch]').forEach((b) => b.addEventListener('click', () => {
      body.querySelectorAll('[data-branch]').forEach((x) => x.setAttribute('aria-expanded', String(x === b)));
      drawSkills(b.dataset.branch); $('#gh-nodes').scrollTop = 0;
      sfx.open();
    }));
  } else if (it.panel === 'trophies') {
    world.apis.guild_trophy_stand?.trigger();
    mountPhotoViewer($('#gh-plaque'), allAchievementSlides(c.achievements || []));
    body.querySelectorAll('[data-trophy]').forEach((b) => b.addEventListener('click', () => {
      const a = c.achievements[+b.dataset.trophy];
      body.querySelectorAll('[data-trophy]').forEach((x) => x.classList.toggle('on', x === b));
      $('#gh-plaque').innerHTML = `<b>${esc(a.title)}</b>${a.org ? `<span class="muted"> · ${esc(a.org)}</span>` : ''}${a.year ? `<span class="muted"> · ${esc(a.year)}</span>` : ''}${a.detail ? `<p>${esc(a.detail)}</p>` : ''}`;
      mountPhotoViewer($('#gh-plaque'), (a.images || []).map((src) => ({ src, caption: a.title })));
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
    <div class="stamps">${(c.education || []).map((e) => `<span class="stamp ${got.includes(e.id) ? 'on' : ''}" title="${got.includes(e.id) ? 'Stamped' : 'Visit the campus to stamp'}"><b>${esc(e.label)}</b><i>${got.includes(e.id) ? 'STAMPED' : '· · ·'}</i></span>`).join('')}</div>
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
    if (acts.length) h += `<p class="eyebrow" style="margin-top:12px">COLLEGE ACTIVITIES</p><ul class="highlights">${acts.map((x) => `<li class="has-logo">${orgLogo(x)}<b>${esc(x.role)}</b> · ${esc(x.org)}<br>${esc(x.summary || '')}</li>`).join('')}</ul>`;
    if ((c.achievements || []).length) h += `<p class="eyebrow" style="margin-top:12px">ACHIEVEMENTS</p><ul class="highlights">${c.achievements.map((a) => `<li><b>${esc(a.title)}</b>${a.detail ? ` · <span class="muted">${esc(a.detail)}</span>` : ''}</li>`).join('')}</ul>`;
  }
  const schoolProjects = (c.projects || []).filter((p) => p.school && e.id === 'montfort');
  if (schoolProjects.length) h += `<p class="eyebrow" style="margin-top:12px">SCHOOL PROJECT</p><div class="panel-projects">${schoolProjects.map(projectCard).join('')}</div>`;
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

// ---------------- Iron Yard gym: three workout stations + Jacked Mode ----------------
// One small state machine (state.gym) drives every station:
// approach → setup → reps → finish. Nathan is placed directly (like benches),
// the rig plays the matching workout pose, and the kit's bar / cable / stack
// follow his hands. Esc or a movement key ends the set safely at any time.
const GYM = {
  bench: { name: 'Bench press', reps: 6, rep: 1.25 },
  pulldown: { name: 'Lat pulldown', reps: 8, rep: 1.1 },
  curl: { name: 'Dumbbell curls', reps: 8, rep: 0.95 },
};
const GYM_IDS = Object.keys(GYM);
const THIANESH_LINES = ['Clean set. Same time tomorrow?', 'That is the habit. Rack it and breathe.', 'Small wins stack up.', 'Good tempo. No ego, just reps.'];
const gymApi = () => world?.apis?.gym_building;
const gv = new THREE.Vector3(), gv2 = new THREE.Vector3();
const gymWorld = (p, out = new THREE.Vector3()) => gymApi().obj.localToWorld(out.set(p.x, 0, p.z));
const smooth = (u) => u * u * (3 - 2 * u);

function gymHud() {
  const el = $('#gym-hud'), g = state.gym;
  if (!g || !gymApi() || state.level === 'tahiti') { el.classList.add('hidden'); return; }
  const done = (state.save.gym || []).length;
  el.innerHTML = `<strong>${esc(GYM[g.station].name)}</strong><span class="reps">REP <b>${g.reps}</b>/${g.target}</span><small>${isTouch ? 'Tap for each rep' : 'Press <kbd>E</kbd> for each rep · <kbd>Esc</kbd> stop'} · Gym ${done}/3</small>`;
  el.classList.remove('hidden');
}

function interactGym(it) {
  if (it.station === 'discipline') return openDiscipline(it);
  startWorkout(it.station);
}

function startWorkout(station) {
  const api = gymApi();
  // ignore the E presses still coming from the set that just ended (mashing power reps)
  if (performance.now() < (state.gymCooldown || 0)) return;
  if (!api || !GYM[station] || state.gym || dialogue.open || state.minigame || state.ko || state.mount) return;
  if (state.seated) standUp();
  closePanel();
  state.path = []; state.pendingOpen = null; marker.visible = false;
  const st = api.stations[station];
  state.gym = {
    station, st, phase: 'approach', t: 0, reps: 0, target: GYM[station].reps, u: 0, power: 0,
    from: player.group.position.clone(), stand: gymWorld(st.stand), pos: gymWorld(st.pos),
    heading: st.heading + api.obj.rotation.y,
  };
  state.nearby = null; $('#prompt').classList.add('hidden');
  sfx.open(); gymHud();
}

function gymPush() { const g = state.gym; if (g?.phase === 'reps' && !g.active) { g.active = true; g.u = 0; } }
function gymCancel() { const g = state.gym; if (!g || g.phase === 'finish') return; g.cancelled = true; g.phase = 'finish'; g.t = 0; }

const handL = new THREE.Vector3(), handR = new THREE.Vector3();
function handsMid(out) {
  player.group.updateMatrixWorld(true);
  player.arms[0].elbow.localToWorld(handL.set(0, -0.27, 0));
  player.arms[1].elbow.localToWorld(handR.set(0, -0.27, 0));
  return out.copy(handL).add(handR).multiplyScalar(0.5);
}

/** Runs before player.update: moves Nathan and sets the workout pose. */
function gymUpdate(dt) {
  const g = state.gym, api = gymApi(), pos = player.group.position;
  if (!g || !api) return;
  g.t += dt;
  const W = player.work;
  if (g.phase === 'approach') {
    const d = Math.hypot(g.stand.x - g.from.x, g.stand.z - g.from.z), dur = Math.max(0.3, d / SPEED);
    const u = Math.min(1, g.t / dur);
    pos.x = g.from.x + (g.stand.x - g.from.x) * u; pos.z = g.from.z + (g.stand.z - g.from.z) * u;
    if (u < 1 && d > 0.05) velocity.set((g.stand.x - g.from.x) / dur, 0, (g.stand.z - g.from.z) / dur);
    if (u >= 1) {
      g.phase = 'setup'; g.t = 0;
      if (g.station === 'curl') { player.heading = g.heading + Math.PI; player.play('interact'); player.work = { type: 'curl', k: 0, k2: 0, hold: false }; }
      else player.work = { type: g.station, k: g.station === 'bench' ? 1 : 0 };
    }
  } else if (g.phase === 'setup') {
    const dur = g.station === 'curl' ? 1.0 : 0.8, u = Math.min(1, g.t / dur);
    if (g.station === 'curl') {
      if (g.t > 0.35 && !W.hold) { W.hold = true; api.setRackPair(false); sfx.rep(); }
      if (g.t > 0.5) { const v = smooth(Math.min(1, (g.t - 0.5) / 0.5)); player.heading = lerpAngle(g.heading + Math.PI, g.heading, v); pos.x = g.stand.x + (g.pos.x - g.stand.x) * v; pos.z = g.stand.z + (g.pos.z - g.stand.z) * v; }
    } else {
      player.heading = lerpAngle(player.heading, g.heading, Math.min(1, dt * 12));
      const v = smooth(u); pos.x = g.stand.x + (g.pos.x - g.stand.x) * v; pos.z = g.stand.z + (g.pos.z - g.stand.z) * v;
    }
    if (u >= 1) { g.phase = 'reps'; g.t = 0; g.u = 0; player.heading = g.heading; }
  } else if (g.phase === 'reps') {
    pos.x = g.pos.x; pos.z = g.pos.z; player.heading = g.heading;
    if (g.active) g.u += dt / GYM[g.station].rep;   // a rep only moves while E was pressed for it
    if (g.u >= 1) {
      g.u = 0; g.active = false; g.reps++; sfx.rep(); gymHud();
      if (g.reps >= g.target) { g.phase = 'finish'; g.t = 0; }
    }
    const c = 0.5 - 0.5 * Math.cos(g.u * Math.PI * 2);   // 0 → 1 → 0 through a rep
    if (g.station === 'bench') W.k = 1 - c;              // lockout → chest → lockout
    else if (g.station === 'pulldown') W.k = c;          // arms up → pulled → up
    else { const s = Math.sin(g.u * Math.PI); if (g.reps % 2) { W.k = 0; W.k2 = s; } else { W.k = s; W.k2 = 0; } }
  } else if (g.phase === 'finish') {
    if (W) { W.k = g.station === 'bench' ? Math.min(1, W.k + dt * 3) : Math.max(0, W.k - dt * 3); if (W.k2) W.k2 = Math.max(0, W.k2 - dt * 3); }
    if (g.station === 'curl') {
      if (g.t > 0.2 && g.t < 0.3) { player.heading = g.heading + Math.PI; pos.x = g.stand.x; pos.z = g.stand.z; player.play('interact'); }
      if (g.t > 0.55 && W?.hold) { W.hold = false; api.setRackPair(true); sfx.rep(); }
      if (g.t > 0.75 && W) player.work = null;
    } else {
      if (g.t > 0.45 && W) player.work = null;
      if (g.t > 0.55) { const v = smooth(Math.min(1, (g.t - 0.55) / 0.35)); pos.x = g.pos.x + (g.stand.x - g.pos.x) * v; pos.z = g.pos.z + (g.stand.z - g.pos.z) * v; }
    }
    if (g.t > 1.0) endWorkout();
  }
}

/** Runs after player.update: equipment follows Nathan's hands. */
function gymSync() {
  const g = state.gym, api = gymApi();
  if (!g || !api || g.station === 'curl') return;
  const bar = g.station === 'bench' ? api.benchBar : api.latBar, rest = g.station === 'bench' ? api.benchRest : api.latRest;
  let w = 0;   // 0 = on its rest, 1 = in Nathan's hands
  if (g.phase === 'setup') w = smooth(Math.min(1, Math.max(0, (g.t - 0.25) / 0.5)));
  else if (g.phase === 'reps') w = 1;
  else if (g.phase === 'finish') w = 1 - smooth(Math.min(1, g.t / 0.4));
  const target = gv.copy(rest);
  if (w > 0) { api.obj.worldToLocal(handsMid(gv2)); target.lerp(gv2, w); }
  if (g.station === 'bench') bar.position.copy(target); else api.setLat(target);
}

/**
 * Tear down any active workout: state, pose, held dumbbells, equipment and the
 * rep HUD. Safe to call any time (level switch, flight, errors); never throws.
 * Only the completed-exercise list in the save survives.
 */
function resetGym({ place = false } = {}) {
  const g = state.gym;
  state.gym = null;
  if (g) state.gymCooldown = performance.now() + 1500;
  player.work = null; player.lastWork = null; player.workW = 0; player.lie = 0;
  try { player.showBells(false); } catch { /* ignore */ }
  const api = gymApi();
  if (api) {
    try {
      api.setRackPair(true); api.benchBar.position.copy(api.benchRest); api.setLat(api.latRest);
      if (g && place) { const spot = gymWorld(g.st.spot); player.group.position.set(spot.x, heightAt(spot.x, spot.z), spot.z); }
    } catch { /* ignore */ }
  }
  $('#gym-hud')?.classList.add('hidden');
  return g;
}
/** Leaving Island 01 (flight, level switch): end the set and drop Jacked Mode timers too. */
function leaveGym() {
  resetGym();
  clearTimeout(jackedTimer); clearTimeout(zoomRestore); zoomRestore = 0;
  if (gymZoom0) { setZoom(gymZoom0); gymZoom0 = 0; }
  player.setJacked(false);
  $('#gym-banner')?.classList.remove('show');
}

function endWorkout() {
  if (!state.gym) return;
  const g = resetGym({ place: true });
  state.nearby = null;
  state.gymCooldown = performance.now() + 1500;
  if (g.cancelled || g.reps < g.target) { toast(`${GYM[g.station].name} stopped · ${g.reps}/${g.target} reps`); return; }
  state.save.gym = state.save.gym || [];
  const fresh = addUnique(state.save.gym, g.station);
  persist();
  const all = fresh && GYM_IDS.every((id) => state.save.gym.includes(id));
  toast(`SET COMPLETE · ${GYM[g.station].name} · Gym ${state.save.gym.length}/3`);
  if (all) jackedMode(true); else { player.play('flex'); sfx.chapter(); }
  const th = world.npcs.find((n) => n.npcId === 'thianesh');
  if (th && Math.hypot(th.x - player.group.position.x, th.z - player.group.position.z) < 10) {
    th.character.play('cheer');
    setTimeout(() => toast(`Thianesh: ${THIANESH_LINES[Math.floor(Math.random() * THIANESH_LINES.length)]}`), 4200);
  }
}

// Jacked Mode: temporary, purely visual (never saved).
const burst = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 16), new THREE.MeshBasicMaterial({ color: 0xffd257, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
burst.rotation.x = -Math.PI / 2; burst.visible = false; burst.renderOrder = 5;
let burstT = 0, jackedTimer = 0, zoomRestore = 0, gymZoom0 = 0;
function ringBurst(color = 0xffd257) {
  if (!burst.parent) scene.add(burst);
  burst.material.color.setHex(color); burstT = 0.0001; burst.visible = true;
}
function burstTick(dt) {
  if (!burstT) return;
  burstT += dt;
  const p = player.group.position, u = burstT / 0.7;
  burst.position.set(p.x, p.y + 0.08, p.z);
  burst.scale.setScalar(Math.round((1 + u * 4) * 4) / 4);   // stepped growth reads as pixel-retro
  burst.material.opacity = Math.max(0, 1 - u);
  if (u >= 1) { burstT = 0; burst.visible = false; }
}
function jackedMode(big) {
  clearTimeout(jackedTimer); clearTimeout(zoomRestore);
  (big ? sfx.finale : sfx.chapter)();
  const z0 = gymZoom0 || state.zoom; gymZoom0 = z0; setZoom(z0 * (big ? 1.3 : 1.18));
  zoomRestore = setTimeout(() => { setZoom(z0); gymZoom0 = 0; }, big ? 2400 : 1600);
  ringBurst(big ? 0xff6a3d : 0xffd257);
  if (big) setTimeout(() => ringBurst(0xffd257), 280);
  player.setJacked(true); player.play('flex');
  const b = $('#gym-banner');
  b.innerHTML = big ? 'JACKED MODE ACTIVATED!<small>Full session 3/3 · discipline unlocked</small>' : 'JACKED MODE ACTIVATED!';
  b.classList.remove('hidden', 'big'); void b.offsetWidth; b.classList.add('show'); if (big) b.classList.add('big');
  setTimeout(() => b.classList.remove('show'), 2600);
  // after the full session Nathan stays jacked (restored on load from the save)
}

function mountChapterMedia(ch) {
  if (!ch?.media?.length) return;
  const box = document.createElement('div'); box.className = 'proj-media';
  mountPhotoViewer(box, ch.media.map((src) => ({ src, caption: ch.title })));
  if (box.childElementCount) $('#panel-body').querySelector('.chapter-head')?.after(box);
}
function openDiscipline(it, view = 'menu') {
  if (view === 'menu') { face(it); player.play('interact'); }
  const ch = (state.content.chapters || []).find((c) => c.id === 'fitness') || chapterFor(state.content, 'iron-yard') || { title: 'The Discipline', body: [], highlights: [] };
  const done = state.save.gym || [];
  const back = '<div class="transmit"><button class="btn" data-dz="menu">← Back</button></div>';
  let html = '';
  if (view === 'menu') {
    html = `${chapterHeader({ ...ch, period: 'Iron Yard · story board' })}
      <div class="gym-menu">
        <button class="btn primary" data-dz="story">Read My Fitness Journey</button>
        <button class="btn" data-dz="start">Start Workout</button>
        <button class="btn" data-dz="progress">View Progress</button>
        <button class="btn" data-dz="exit">Exit</button>
      </div>`;
  } else if (view === 'story') {
    html = `${chapterHeader(ch)}
      ${(ch.highlights || []).length ? `<ol class="gym-timeline">${ch.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ol>` : ''}
      ${(ch.body || []).map((p) => `<p>${esc(p)}</p>`).join('')}${back}`;
  } else if (view === 'progress') {
    html = `<p class="eyebrow">Iron Yard · this save file</p><h2 id="panel-title">Gym session ${done.length}/3</h2>
      <ul class="gym-progress">${GYM_IDS.map((id) => `<li class="${done.includes(id) ? 'done' : ''}"><span>${done.includes(id) ? '✓' : '○'}</span>${esc(GYM[id].name)}</li>`).join('')}</ul>
      <p class="muted">Only in-game sets are tracked here.</p>${back}`;
  }
  showPanel('iron-yard/the-discipline.txt', html, it);
  if (view === 'menu') mountChapterMedia(ch);
  $('#panel-body').querySelectorAll('[data-dz]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.dz;
    if (v === 'exit') return closePanel();
    if (v === 'story') return openInteractable(it);   // the full chapter: story, highlights, lift + tempo
    if (v === 'start') {
      closePanel();
      const next = GYM_IDS.find((id) => !done.includes(id)) || 'bench';
      const target = world.interactables.find((i) => i.kind === 'gym' && i.station === next);
      if (target) walkToInteractable(target);
      return;
    }
    openDiscipline(it, v);
  }));
}

// ---------------- Mounts: one controller for bicycles and the horse ----------------
// Each vehicle type is just a config; on foot movement is untouched and comes
// back as soon as Nathan gets off.
const VEHICLES = {
  bike: { speed: 5.2, boost: 7.0, accel: 5, brake: 9, turn: 4.2, seatY: 0.3, pose: 'cycle', r: 0.42, yaw: 0, jumpV: 5.4, avoid: ['water'], label: 'bicycle' },
  moto: { speed: 7.0, boost: 9.5, accel: 6, brake: 10, turn: 3.6, seatY: 0.62, pose: 'ride', r: 0.5, yaw: 0, jumpV: 5.4, avoid: ['water'], label: 'motorcycle' },
  scooty: { speed: 5.6, boost: 7.6, accel: 4.2, brake: 9, turn: 3.6, seatY: 0.15, pose: 'scooty', r: 0.45, yaw: 0, jumpV: 5.2, avoid: ['water'], label: 'scooty' },
  horse: { speed: 4.0, boost: 6.6, accel: 3.5, brake: 7, turn: 3.0, seatY: 0.7, pose: 'ride', r: 0.6, yaw: -Math.PI / 2, jumpV: 6.4, avoid: ['water'], label: 'horse' },
};
const _qBuf = [];
let railPts = null;
function vehicleFree(x, z, cfg) {
  const r = cfg.r;
  const near = world.queryColliders(x, z, r + 0.5, _qBuf);
  for (let i = 0; i < near.length; i++) {
    const c = near[i];
    if (c.r !== undefined) { if (Math.hypot(x - c.cx, z - c.cz) < c.r + r) return false; }
    else if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return false;
  }
  if (world.floorAt(x, z) !== null) return false;   // no riding indoors or onto platforms
  const tile = tileAt(map, x, z);
  if (!tile || !tile.walkable || cfg.avoid.includes(tile.type)) return false;
  if (Math.hypot(x, z) > (map.props.navRadius || (map.props.islandRadius || 44) - 2.5) - 0.5) return false;
  for (let i = 0; i < world.npcs.length; i++) { const n = world.npcs[i]; if (n.passenger) continue; const p = n.character.group.position; if (Math.hypot(p.x - x, p.z - z) < r + 0.45) return false; }
  const vehicles = world.vehicles || [];
  for (let i = 0; i < vehicles.length; i++) { const it = vehicles[i]; if (it !== state.mount?.it && Math.hypot(it.x - x, it.z - z) < r + 0.6) return false; }
  // the railway is just ground to roll over, but never through a train
  if (world.railway) {
    if (!railPts) railPts = world.railway.curve.getSpacedPoints(500);
    if (trainNear(x, z, 0.6)) return false;
  }
  return true;
}
function mountJump() {
  const m = state.mount;
  if (!m || m.lift < 0.9) return false;
  if ((m.jumpY || 0) > 0.001) return false;
  m.jumpV = m.cfg.jumpV || 5.4;
  return true;
}
function mount(it) {
  if (state.mount || dialogue.open || state.minigame || state.ko) return;
  const cfg = VEHICLES[it.vtype];
  closePanel(); state.path = []; marker.visible = false;
  state.mount = { it, cfg, speed: 0, heading: it.heading, lift: 0, phase: 0, jumpY: 0, jumpV: 0, from: player.group.position.clone() };
  player.riding = true;
  player.jumpY = 0; player.jumpV = 0;
  it.beacon.group.visible = false; state.nearby = null; // refresh the prompt to 'Dismount'
  player.play('interact'); sfx.open();
  if (it.vtype === 'moto') tahiti.onMotoMount(state.mount);
  if (!state.rideHint) { state.rideHint = true; toast(`${isTouch ? 'Tap to steer' : 'WASD to steer · Shift for speed · Space to jump'} · E to get off${isTouch ? '' : ' · R returns it to its rack'}`); }
}
function dismount(force = false) {
  const m = state.mount; if (!m) return;
  if (!force && (m.jumpY || 0) > 0.05) return;
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
  if (it.model?.group) {
    it.model.group.rotation.x = 0;
    it.model.group.rotation.z = 0;
    it.model.group.position.y = heightAt(p.x, p.z);
  }
  state.mount = null; state.nearby = null;
  player.pose = null;
  player.riding = false;
  player.jumpY = 0; player.jumpV = 0;
  if (it.vtype === 'moto') { setEngine(null); tahiti.onMotoDismount(spot); }
  p.set(spot.x, heightAt(spot.x, spot.z), spot.z);
  player.heading = Math.atan2(it.x - spot.x, it.z - spot.z);
  sfx.close();
}
function resetMount() {
  const m = state.mount; if (!m) return;
  m.jumpY = 0; m.jumpV = 0;
  if (m.it?.model?.group) {
    m.it.model.group.rotation.x = 0;
    m.it.model.group.rotation.z = 0;
  }
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

  // Jump physics integration
  const wasAirborne = (m.jumpY || 0) > 0.001;
  if (m.jumpV || m.jumpY) {
    m.jumpV = (m.jumpV || 0) - 18 * dt;
    m.jumpY = Math.max(0, (m.jumpY || 0) + m.jumpV * dt);
    if (m.jumpY === 0) {
      m.jumpV = 0;
      if (wasAirborne) {
        sfx.step();
        if (tileAt(map, pos.x, pos.z)?.type?.match(/sand|beach|dirt|path/)) {
          dust(pos.x, pos.z);
        }
      }
    }
  }
  const jY = m.jumpY || 0;
  player.jumpY = 0;
  player.jumpV = 0;

  // model follows Nathan
  const g = it.model.group;
  const back = it.vtype === 'moto' ? 0.28 : it.vtype === 'scooty' ? -0.36 : 0;   // scooty: its seat sits 0.36 m behind the model centre                                  // bike sits a little behind the driver so the passenger fits
  g.position.set(pos.x - Math.sin(m.heading) * back, ground + jY, pos.z - Math.cos(m.heading) * back);
  g.rotation.y = m.heading + cfg.yaw;
  it.x = pos.x; it.z = pos.z;
  const sp = Math.abs(m.speed);
  if (it.vtype === 'bike') {
    for (const w of it.model.wheels) w.rotation.x += (m.speed * dt) / 0.34;
    m.phase += (m.speed * dt) / 0.34 * 0.55;
    it.model.crank.rotation.x = m.phase;
    player.pedal = m.phase;
    g.rotation.z = Math.atan2(Math.sin(rideDir.x * 0), 1) * 0;                  // keep upright
    g.rotation.x = jY > 0 ? -(m.jumpV / 5.4) * 0.16 : 0;
    pos.y = ground + cfg.seatY * m.lift + hop + jY;
  } else if (it.vtype === 'moto' || it.vtype === 'scooty') {
    for (const w of it.model.wheels) w.rotation.x += (m.speed * dt) / (it.vtype === 'scooty' ? 0.24 : 0.36);
    if (it.model.bars) { const steer = want ? Math.atan2(Math.sin(Math.atan2(rideDir.x, rideDir.z) - m.heading), Math.cos(Math.atan2(rideDir.x, rideDir.z) - m.heading)) : 0; it.model.bars.rotation.y = Math.max(-0.5, Math.min(0.5, steer * 0.6)); player.steer = it.model.bars.rotation.y; }
    const lean = -Math.atan2(Math.sin(Math.atan2(rideDir.x, rideDir.z) - m.heading), 1) * Math.min(1, sp / 6) * 0.25 * (want ? 1 : 0);   // lean into turns
    g.rotation.z = jY > 0 ? lean * Math.max(0, 1 - jY * 2) : lean;
    g.rotation.x = jY > 0 ? -(m.jumpV / 5.4) * 0.12 : 0;
    pos.y = ground + cfg.seatY * m.lift + hop + (sp > 0.2 ? Math.sin(t * 40) * 0.006 : 0) + jY;
    setEngine(Math.min(1, sp / cfg.boost));
    if (sp > 2 && tileAt(map, pos.x, pos.z)?.type?.match(/sand|beach|dirt|path/) && Math.random() < dt * sp * 2) dust(pos.x - Math.sin(m.heading) * 0.8, pos.z - Math.cos(m.heading) * 0.8);
  } else {
    const trot = sp > 4.6;
    m.phase += dt * sp * (trot ? 5.5 : 4.2);
    const amp = Math.min(1, sp / 2) * (trot ? 0.7 : 0.45);
    g.rotation.order = 'ZYX';
    g.rotation.x = 0;
    if (jY > 0) {
      const jumpAir = Math.min(1, jY * 2.5);
      const jumpPitch = (m.jumpV / 6.4) * 0.22;
      g.rotation.z = jumpPitch;
      const frontLegs = 0.45 * jumpAir;
      const backLegs = -0.5 * jumpAir;
      it.model.legs.forEach((l, i) => {
        const groundRot = Math.sin(m.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? (trot ? Math.PI : Math.PI / 2) : 0)) * amp;
        const airRot = i >= 2 ? frontLegs : backLegs;
        l.rotation.z = groundRot * (1 - jumpAir) + airRot * jumpAir;
      });
      const groundHead = sp > 0.1 ? Math.sin(m.phase * 2) * 0.08 : Math.sin(t * 0.9) * 0.1 - 0.12;
      it.model.head.rotation.z = groundHead * (1 - jumpAir) + 0.15 * jumpAir;
      const groundTail = Math.sin(t * 2.2) * 0.3 + (trot ? 0.3 : 0);
      it.model.tail.rotation.x = groundTail * (1 - jumpAir) + 0.45 * jumpAir;
    } else {
      g.rotation.z = 0;
      it.model.legs.forEach((l, i) => { l.rotation.z = Math.sin(m.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? (trot ? Math.PI : Math.PI / 2) : 0)) * amp; });
      it.model.head.rotation.z = sp > 0.1 ? Math.sin(m.phase * 2) * 0.08 : Math.sin(t * 0.9) * 0.1 - 0.12;
      it.model.tail.rotation.x = Math.sin(t * 2.2) * 0.3 + (trot ? 0.3 : 0);
    }
    const bounce = trot ? Math.abs(Math.sin(m.phase)) * 0.08 : Math.abs(Math.sin(m.phase)) * 0.03 * Math.min(1, sp);
    g.position.y = ground + bounce + jY;
    pos.y = ground + cfg.seatY * m.lift + hop + bounce + jY;
  }
  player.heading = m.heading;
  player.pose = cfg.pose;
  player.update(dt, zeroV, t);
}
const zeroV = new THREE.Vector3();
// little sand puffs behind the motorcycle
const dustPool = [];
let dustGeo = null;
function dust(x, z) {
  let d = dustPool.find((q) => !q.m.visible);
  if (!d) { if (dustPool.length > 40) return; if (!dustGeo) dustGeo = new THREE.IcosahedronGeometry(0.14, 0); const m = new THREE.Mesh(dustGeo, new THREE.MeshBasicMaterial({ color: 0xe9d6a8, transparent: true, depthWrite: false })); scene.add(m); d = { m }; dustPool.push(d); }
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
    size: map.width, cell: 0.5, islandRadius: map.props.navRadius || (map.props.islandRadius || 44) - 2.5,
    colliders: world.colliders,
    queryColliders: (x, z, r, out) => world.queryColliders(x, z, r, out),
    blocked: (x, z) => {
      if (world.floorAt(x, z) !== null) return false;
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
  const data = state.tahitiRaw || await fetchRetry(`${BASE}data/tahiti.json?v=${BUILD}`);
  state.content.npcs.push(...mergeTahitiNpcs(data, state.content));
  state.tahiti = data;
  return data;
}
let journeyTouched = false;
async function switchLevel(name) {
  if (name === 'tahiti') await loadTahitiData();
  const m = mapCache[name] || (mapCache[name] = await loadTiledMap(`${BASE}${LEVELS[name]}?v=${BUILD}`));
  leaveGym();
  if (state.level === 'tahiti') { tahiti.exit(); $('#tahiti-hints')?.classList.add('hidden'); hintKey = ''; }
  if (state.level === 'island1') { guruRoutine.exit(); }
  if (state.mount) dismount(true);
  setEngine(null);
  scene.remove(world.root);
  world.dispose?.();
  for (const d of dustPool) d.m.visible = false;
  _nightDirty = true;
  map = m; state.level = name;
  world = buildWorld(scene, state.content, map, kitOverrides);
  nav = makeNav();
  railPts = null;
  world.interactables.forEach((it) => { if (isDone(it)) markVisited(it, true); });
  const jet = world.apis.private_jet;
  if (jet) { jet.home = jet.group.position.clone(); jet.homeRot = jet.group.rotation.y; }
  setupLabels(); setupMinimap();
  // exploring Tahiti: keep the chapter list tucked away unless the player opened it
  if (name === 'tahiti' && !journeyTouched && !isCompactUI()) { $('.journey')?.classList.add('collapsed'); $('#journey-toggle')?.setAttribute('aria-expanded', 'false'); }
  state.nearby = null; state.talkingTo = null; state.path = [];
  try { renderer.compile(scene, camera); } catch { /* ignore */ }
  if (name === 'tahiti') tahiti.enter();
  if (name === 'island1') guruRoutine.enter();
}

// ---------------- Characters menu: Visit ----------------
// Resolves a person's live position (loading their island first if needed), finds a clear,
// walkable spot directly in front of them and puts Nathan there. It never starts dialogue:
// the usual "E · Talk" prompt appears and the player chooses.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (n = 2) => sleep(Math.max(1, n) * 50);   // timer based: a throttled or hidden tab must never leave the screen faded
const npcIslandOf = (id) => (id.startsWith('tahiti_') ? 'tahiti' : 'island1');
const npcIdsFor = (canon) => (state.content.npcs || []).filter((d) => (CANONICAL_MAP[d.id] || d.id) === canon).map((d) => d.id);
function visitBusy() {
  if (!state.started) return 'Start the game first';
  if (state.visiting) return 'Travelling to someone, one moment';
  if (state.ko) return 'Not right now';
  if (state.cine || state.flightStarting) return 'Not available during a flight';
  if (state.minigame) return 'Finish the current activity first';
  if (state.groupScene) return 'Finish the group scene first';
  if (state.gym) return 'Finish the workout first';
  if (state.passengerOf) return 'Not while riding along';
  if (state.level === 'tahiti') { const r = tahiti.busyReason?.(); if (r) return r; }
  return '';
}
function liveActivity(npcId) {
  if (state.level === 'tahiti') return tahiti.getNpcActivity?.(npcId) || null;
  if (npcId === 'guru') return { act: guruRoutine.getRoutinePhase() };
  const it = world.npcs.find((n) => n.npcId === npcId);
  if (!it) return null;
  const r = it.route;
  return { pose: it.character.pose, mode: r && r.pts.length > 1 && r.wait <= 0 ? 'walk' : 'idle' };
}
/** A walkable spot facing the person: straight ahead first, then round them; never on water, props, people or across a wall. */
function standSpotFor(it) {
  if (it.visitSpot && solidFree(it.visitSpot.x, it.visitSpot.z) && nav.isWalkable(it.visitSpot.x, it.visitSpot.z, 0.32)) return { x: it.visitSpot.x, z: it.visitSpot.z };   // e.g. in front of a study table
  const gp = it.character.group.position, h = it.character.heading;
  const me = player.group.position;
  const floorHere = onFloor(gp.x, gp.z);
  const free = (x, z) => solidFree(x, z) && nav.isWalkable(x, z, 0.32) && !isWet(x, z) && onFloor(x, z) === floorHere
    && !world.npcs.some((n) => n !== it && !n.passenger && Math.hypot(n.character.group.position.x - x, n.character.group.position.z - z) < 0.95);
  const turns = [0, 0.4, -0.4, 0.8, -0.8, 1.25, -1.25, 1.8, -1.8, 2.4, -2.4, Math.PI];
  // the camera looks along (-1,-1): a spot straight down that line would hide the person behind Nathan,
  // so prefer one that is also off to the side on screen (both clearly visible), then anything safe
  // and the prompt must read "Talk" (not a neighbouring activity), using the same priority as the prompt itself
  const talkWins = (x, z) => {
    const mine = Math.hypot(x - gp.x, z - gp.z) - 0.8;
    return !world.interactables.some((o) => {
      if (o === it || o.disabled || o.kind === 'npc' || (o.kind === 'memory' && o.visited)) return false;
      const d = Math.hypot(x - o.x, z - o.z);
      return d < o.radius && d < mine;
    });
  };
  for (const strict of [3, 2, 1, 0]) for (const r of [1.5, 1.8, 1.3, 2.1, 2.5]) {
    for (const o of turns) {
      const a = h + o, x = gp.x + Math.sin(a) * r, z = gp.z + Math.cos(a) * r;
      if ((strict & 1) && ((x - gp.x) - (z - gp.z)) / 1.414 < 0.9) continue;   // screen-right of them: workstations sit on the left
      if ((strict & 2) && !talkWins(x, z)) continue;
      if (!free(x, z)) continue;
      let clear = true;   // nothing solid between them (thin walls, props)
      for (let k = 1; k < 5; k++) { const q = k / 5; if (!free(gp.x + (x - gp.x) * q, gp.z + (z - gp.z) * q) && !(Math.hypot(gp.x + (x - gp.x) * q - gp.x, gp.z + (z - gp.z) * q - gp.z) < 0.7)) { clear = false; break; } }
      if (clear) return { x, z };
    }
  }
  return null;
}
async function visitCharacter(canon) {
  const why = visitBusy();
  if (why) { toast(why); return false; }
  const ids = npcIdsFor(canon);
  if (!ids.length) return false;
  const lvl = state.level;
  const target = canon === 'harris' ? lvl : ids.some((i) => npcIslandOf(i) === lvl) ? lvl : npcIslandOf(ids[0]);
  const fade = $('#visit-fade');
  state.visiting = true;
  fade.classList.add('on');
  let ok = false;
  try {
    await sleep(190);
    closePanel();
    if (dialogue.open) dialogue.close();
    if (state.level === 'tahiti') tahiti.leaveJoin();
    if (state.seated) standUp();
    if (state.mount) dismount(true);
    if (target !== lvl) {
      if (target === 'tahiti') {
        const access = await checkTahitiAccess();
        if (!access.allowed) { toast('Tahiti is a private island. Ask Nathan for an invite.'); return false; }
      }
      toast(target === 'tahiti' ? 'Heading to Tahiti…' : 'Heading to Island 01…');
      await switchLevel(target);
      await sleep(450);   // the island's schedules place everyone before we look for them
    }
    const it = world.npcs.find((n) => ids.includes(n.npcId));
    if (!it) { toast('Could not find them right now.'); return false; }
    const a = liveActivity(it.npcId) || {};
    if (a.riding || ['walk_to_scooty', 'mount', 'riding', 'return'].includes(a.act)) { toast('They are on the move. Try again in a moment.'); return false; }
    if (state.level === 'tahiti') { tahiti.holdForVisit?.(it.npcId, 30000); await frames(3); }   // roaming people stop where they are
    const spot = standSpotFor(it);
    if (!spot) { toast('No safe spot to stand there right now. Try again in a moment.'); return false; }
    const gp = it.character.group.position;
    const py = heightAt(spot.x, spot.z);
    player.group.position.set(spot.x, py, spot.z);
    player.group.rotation.set(0, 0, 0);
    player.heading = Math.atan2(gp.x - spot.x, gp.z - spot.z);
    player.pose = null; player.speed = 0; player.jumpY = 0; player.jumpV = 0;
    velocity.set(0, 0, 0);
    lastSafe.set(spot.x, py, spot.z);
    state.path = []; marker.visible = false; state.talkingTo = null; state.nearby = null;
    it.character.lookAt(player.group.position);
    camTarget.set((gp.x + spot.x) / 2, 0, (gp.z + spot.z) / 2);   // both of them centred in frame
    state.camOverride = null;
    ok = true;
  } catch (err) {
    console.warn('visit failed', err);
    toast('Could not get there right now.');
  } finally {
    await frames(2);
    fade.classList.remove('on');
    state.visiting = false;
  }
  return ok;
}
/** A spot just inside E range of a stop's interactable, to its screen-right so Nathan and the display both show. */
function standSpotForInteractable(it) {
  const floorHere = onFloor(it.x, it.z);
  const free = (x, z) => solidFree(x, z) && nav.isWalkable(x, z, 0.32) && !isWet(x, z) && onFloor(x, z) === floorHere
    && !world.npcs.some((n) => !n.passenger && Math.hypot(n.character.group.position.x - x, n.character.group.position.z - z) < 0.95);
  // the target must be what the prompt picks from this spot, with the same priority as the update loop
  const wins = (x, z) => {
    const d = Math.hypot(x - it.x, z - it.z);
    if (d >= it.radius) return false;
    return !world.interactables.some((o) => {
      if (o === it || o.disabled || (o.kind === 'memory' && o.visited)) return false;
      const od = Math.hypot(x - o.x, z - o.z);
      return od < o.radius && (o.kind === 'npc' ? od - 0.8 : od) < d;
    });
  };
  for (const strict of [1, 0]) for (const r of [1.1, 1.3, 0.9, 1.45, 0.7]) {
    if (r >= it.radius) continue;
    for (let k = 0; k < 24; k++) {
      const a = Math.PI / 4 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12);   // start screen-right, fan out
      const x = it.x + Math.sin(a) * r, z = it.z + Math.cos(a) * r;
      if (strict && ((x - it.x) - (z - it.z)) / 1.414 < r * 0.5) continue;
      if (free(x, z) && wins(x, z) && free((x + it.x) / 2, (z + it.z) / 2)) return { x, z };
    }
  }
  return null;
}
async function tourGoTo(stop) {
  const why = visitBusy();
  if (why) { toast(why); return false; }
  const fade = $('#visit-fade');
  state.visiting = true;
  fade.classList.add('on');
  let ok = false;
  try {
    await sleep(190);
    closePanel();
    if (dialogue.open) dialogue.close();
    if (state.level === 'tahiti') tahiti.leaveJoin();
    if (state.seated) standUp();
    if (state.mount) dismount(true);
    if (state.level !== 'island1') { toast('Heading to Island 01…'); await switchLevel('island1'); await sleep(450); }
    const it = findStopInteractable(stop, world.interactables, state.content);
    if (!it) { toast('Could not find that stop right now.'); return false; }
    const spot = standSpotForInteractable(it);
    if (!spot) { toast('No safe spot to stand there right now.'); return false; }
    const py = heightAt(spot.x, spot.z);
    player.group.position.set(spot.x, py, spot.z);
    player.group.rotation.set(0, 0, 0);
    player.heading = Math.atan2(it.x - spot.x, it.z - spot.z);
    player.pose = null; player.speed = 0; player.jumpY = 0; player.jumpV = 0;
    velocity.set(0, 0, 0); keys.clear();
    lastSafe.set(spot.x, py, spot.z);
    state.path = []; state.pendingOpen = null; marker.visible = false; state.talkingTo = null; state.nearby = null;
    state.camOverride = null; state.zoom = 1; updateCameraFrustum();
    camTarget.set((it.x + spot.x) / 2, 0, (it.z + spot.z) / 2);
    ok = true;
  } catch (err) {
    console.warn('tour move failed', err);
    toast('Could not get there right now.');
  } finally {
    await frames(2);
    fade.classList.remove('on');
    state.visiting = false;
  }
  return ok;
}
/** Garage stop only: a compact way into the featured projects, inside the normal project panel. */
function tourOverviewHtml(c, currentId) {
  if (!tour.active || tour.stop?.id !== 'garage') return '';
  const feat = (c.projects || []).filter((p) => p.featured);
  if (!feat.length) return '';
  return `<div class="tour-overview"><p class="eyebrow">Featured projects</p>${feat.map((p) => `<button type="button" data-tour-project="${esc(p.id)}"${p.id === currentId ? ' class="on" aria-current="true"' : ''}><b>${esc(p.title)}</b><small>${esc(p.pitch || '')}</small></button>`).join('')}</div>`;
}
const characters = createCharacters({
  content: () => state.content,
  level: () => state.level,
  activityOf: (id) => liveActivity(id),
  busyReason: visitBusy,
  loadTahiti: () => loadTahitiData(),
  visit: visitCharacter,
});

// ---------------- Flight cinematic ----------------
// Keyframed jet paths per island (metres, relative to the parked jet's ground).
const FLIGHT = {
  // waypoints only (no per-waypoint stops): taxi loop onto the runway, roll, climb out
  island1: {
    out: [[2.4, 0, 36.8], [-1.5, 0, 38.5], [-5.4, 0, 39.6], [-6.4, 0, 40.8], [-3.5, 0, 41.0], [4, 0, 40.7], [14, 0.4, 40.8], [26, 4, 41.6], [62, 15, 47]],
    in: [[-95, 16, 40.6], [-40, 7, 40.6], [-12, 0.6, 40.6], [-4, 0, 40.6], [3.5, 0, 40.2], [4.6, 0, 38.8], [2.4, 0, 36.8]],
  },
  tahiti: {
    out: [[-6, 0, 11.8], [-3.4, 0, 13.2], [-1.6, 0, 15.2], [-2.6, 0, 16.6], [-6, 0, 16.6], [-14, 0, 16.5], [-24, 0.4, 16.4], [-34, 4, 16.1], [-82, 15, 12]],
    in: [[-95, 16, 16.5], [-45, 7, 16.5], [-26, 0.6, 16.5], [-14, 0, 16.5], [-9.5, 0, 15.6], [-7.4, 0, 13.6], [-6, 0, 11.8]],
  },
};
const FLIGHT_T = { out: 6.0, in: 6.0 };
const flightCurves = new Map();
function flightCurve(keys) {
  if (!flightCurves.has(keys)) flightCurves.set(keys, new THREE.CatmullRomCurve3(keys.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal'));
  return flightCurves.get(keys);
}
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
// One continuous move along an arc-length spline. Departure accelerates the
// whole way (taxi -> roll -> climb); arrival decelerates to a stop at the
// stand. Speed never drops to zero mid-route, so there is no mid-air pause.
function sampleFlight(keys, dur, tt, dir) {
  const k = Math.max(0, Math.min(1, tt / dur));
  const u = dir === 'out' ? 0.08 * k + 0.92 * k * k : 1 - (1 - k) * (1 - k) * 0.92 - (1 - k) * 0.08 * (1 - k);
  const p = flightCurve(keys).getPointAt(Math.max(0, Math.min(1, u)));
  return { x: p.x, y: p.y, z: p.z, u: k };
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
  if (state.flightStarting || state.cine || state.groupScene) return;   // never twice
  state.flightStarting = true;
  try { await startFlightInner(to); } finally { state.flightStarting = false; }
}
async function startFlightInner(to) {
  leaveGym();
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
  try { if (to === 'tahiti') await loadTahitiData(); if (!mapCache[to]) mapCache[to] = await loadTiledMap(`${BASE}${LEVELS[to]}?v=${BUILD}`); } catch { /* the swap will load it */ }
  if (!jet.home) { jet.home = jet.group.position.clone(); jet.homeRot = jet.group.rotation.y; }
  closePanel();
  state.minigame = 'flight';
  state.cine = { from, to, phase: 'board', t: 0, vel: new THREE.Vector3(), prev: { x: 0, y: 0, z: 0 }, zoom0: state.zoom };
  state.path = []; marker.visible = false;
  cineUI(true); cineCaption(to === 'tahiti' ? 'Next stop: Tahiti' : 'Heading home to Origin Isle');
}
function cineCamera(x, z, zoom) {
  state.camOverride = { x, z };
  if (Math.abs(state.zoom - zoom) > 0.002) { state.zoom = zoom; updateCameraFrustum(); }
}
async function cineSwap(c) {
  c.swapping = true;
  await switchLevel(c.to);
  // finish preparing the destination under the clouds: one hidden frame uploads geometry and shadows
  try { retro.render(scene, camera); } catch { /* ignore */ }
  await yieldFrame(); await yieldFrame();
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
    const F = FLIGHT[c.from], end = FLIGHT_T.out;
    const s = sampleFlight(F.out, end, c.t, 'out');
    poseJet(jet, s, c.prev); c.prev = s;
    const climb = Math.max(0, Math.min(1, (c.t - end * 0.35) / (end * 0.65)));
    cineCamera(s.x, s.z, 1.15 - 0.85 * ease(climb));
    p.set(s.x, jet.home.y + s.y, s.z);
    if (c.t > end - 0.7) cineClouds(Math.min(1, (c.t - (end - 0.7)) / 0.6));
    if (c.t >= end) cineSwap(c);
    return;
  }
  if (c.phase === 'in') {
    // wide view of the island, the approach, touchdown, then the camera closes in
    const F = FLIGHT[c.to], end = FLIGHT_T.in;
    if (c.t < 0.7) cineClouds(1 - c.t / 0.7); else cineClouds(0);
    const s = sampleFlight(F.in, end, c.t, 'in');
    poseJet(jet, s, c.prev); c.prev = s;
    const land = Math.max(0, Math.min(1, (c.t - end * 0.3) / (end * 0.7)));
    const wide = 1 - Math.min(1, c.t / (end * 0.55));
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
  state.zoom = 1; updateCameraFrustum();
  camTarget.copy(p);
  cineClouds(0); cineCaption(''); cineUI(false);
  toast(state.level === 'tahiti' ? 'Welcome to Tahiti' : 'Back on Island 01 · Origin Isle');
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
  state.camOverride = { x: cx, z: cz }; state.zoom = g.zoom || 1.35; updateCameraFrustum();
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
  state.camOverride = null; state.zoom = 1; updateCameraFrustum();
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
    const to = { zoom: 0.3, x: 0, z: 4 };
    const t0 = performance.now(), dur = reducedMotion ? 1 : 3200;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / dur), e = easeOutCubic(k);
      state.zoom = from.zoom + (to.zoom - from.zoom) * e;
      state.camOverride = { x: from.x + (to.x - from.x) * e, z: from.z + (to.z - from.z) * e };
      updateCameraFrustum();
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
        <div class="window-bar"><span class="title">nathan.exe · process complete</span></div>
        <div class="finale-body">
          <img class="mini-portrait" src="${portraitURL()}" alt="">
          <p class="eyebrow">END OF ISLAND 01 · ORIGIN ISLE</p>
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
    state.zoom = 1; updateCameraFrustum();
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
  // Tahiti: a small, distinct icon set (airstrip, gang compounds, key activities)
  MM.icons = [];
  if (map.props?.island === 'tahiti') {
    const pick = (type, kind, color) => { for (const o of map.objects) if (o.type === type) MM.icons.push({ kind, color, x: o.x, z: o.z }); };
    pick('runway', 'plane', '#ffffff'); pick('hideout_house', 'house', '#c9483c'); pick('outlaws_villa', 'house', '#2f8f9a');
    pick('basketball_court', 'ball', '#ff8838'); pick('volley_net', 'vball', '#ffffff'); pick('photo_station', 'cam', '#ffd257'); pick('tv_corner', 'pad', '#9b7bff');
  }
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
  if (MM.icons?.length) {
    // icons are drawn upright (un-rotated) so they stay readable on the tilted map
    g.restore(); g.save();
    const half = MM.size / 2, cs = Math.SQRT1_2;
    const up = (x, z) => { const [ax, ay] = MM.toPx(x, z); const dx = ax - half, dy = ay - half; return [half + (dx * cs - dy * cs), half + (dx * cs + dy * cs)]; };
    g.lineWidth = 1.4; g.strokeStyle = '#1e1b2e';
    for (const ic of MM.icons) {
      const [x, y] = up(ic.x, ic.z);
      g.fillStyle = ic.color;
      g.beginPath();
      if (ic.kind === 'house') { g.moveTo(x - 4.5, y + 3.5); g.lineTo(x - 4.5, y - 0.5); g.lineTo(x, y - 4.5); g.lineTo(x + 4.5, y - 0.5); g.lineTo(x + 4.5, y + 3.5); g.closePath(); }
      else if (ic.kind === 'plane') { g.rect(x - 4, y - 1, 8, 2); g.rect(x - 1, y - 4.5, 2, 9); }
      else if (ic.kind === 'cam') { g.rect(x - 4, y - 2.5, 8, 5.5); }
      else if (ic.kind === 'pad') { g.moveTo(x - 4, y - 3); g.lineTo(x + 4, y - 3); g.lineTo(x + 4, y + 3); g.lineTo(x - 4, y + 3); g.closePath(); }
      else g.arc(x, y, 3.8, 0, Math.PI * 2);
      g.fill(); g.stroke();
      if (ic.kind === 'ball') { g.beginPath(); g.moveTo(x - 3.8, y); g.lineTo(x + 3.8, y); g.stroke(); }
    }
    // Nathan: arrow pointing the way he faces
    const [ux, uy] = up(p.x, p.z), h = player.heading, fx = Math.sin(h), fz = Math.cos(h);
    const ax = (fx * cs - fz * cs), ay = (fx * cs + fz * cs), nx = -ay, ny = ax;
    g.fillStyle = '#ffffff'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(ux + ax * 7, uy + ay * 7); g.lineTo(ux - ax * 4.5 + nx * 4.6, uy - ay * 4.5 + ny * 4.6); g.lineTo(ux - ax * 2, uy - ay * 2); g.lineTo(ux - ax * 4.5 - nx * 4.6, uy - ay * 4.5 - ny * 4.6); g.closePath(); g.fill(); g.stroke();
    g.restore();
    return;
  }
  g.fillStyle = '#1e1b2e';
  g.beginPath(); g.arc(px, py, 4 + Math.sin(t * 5) * 0.8, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f8f3e7';
  g.beginPath(); g.arc(px, py, 1.8, 0, Math.PI * 2); g.fill();
  g.restore();
}

// ---------------- Labels ----------------
const SIGNED_PLACES = new Set(['AIRPORT']);
const labelEls = [];
let labelLayer = null;
function setupLabels() {
  labelLayer?.remove(); labelEls.length = 0;
  const layer = document.createElement('div'); labelLayer = layer;
  layer.className = 'labels';
  layer.setAttribute('aria-hidden', 'true');
  canvas.after(layer);
  for (const l of world.labels) {
    if (state.level === 'tahiti' && (l.text === 'EUPHONIUM VILLA' || l.text === 'VANDERLINDE GANG' || l.text === 'VANDERLINDE HIDEOUT')) continue;
    if (SIGNED_PLACES.has(l.text)) continue;
    const d = document.createElement('div');
    d.className = 'world-label';
    d.textContent = l.text;
    d.style.setProperty('--c', l.color);
    layer.append(d);
    labelEls.push({ el: d, pos: l.pos, disp: null, tf: '' });
  }
}
const projV = new THREE.Vector3();
const labelRay = new THREE.Raycaster();
const labelDir = new THREE.Vector3();
let labelRR = 0;
// Labels whose building already carries a readable physical sign are not duplicated as floating text.
function ctrlRects() {
  const out = [];
  for (const sel of ['.tc-stick', '#tc-jump', '#tc-act', '.hud-top > *', '.minimap-wrap', '#hud-nav', '.journey']) {
    for (const e of document.querySelectorAll(sel)) { if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') continue; const r = e.getBoundingClientRect(); if (r.width && r.height) out.push(r); }
  }
  return out;
}
function updateLabels() {
  const w = window.innerWidth, h = window.innerHeight;
  const ppos = player.group.position;
  const cand = [];
  for (let i = 0; i < labelEls.length; i++) {
    const lbl = labelEls[i];
    projV.copy(lbl.pos).project(camera);
    lbl.sx = (projV.x * 0.5 + 0.5) * w; lbl.sy = (-projV.y * 0.5 + 0.5) * h;
    if (!lbl.w) { lbl.w = lbl.el.textContent.length * 8 + 28; lbl.h = 26; }
    const hw = (lbl.w || 80) / 2, lh = lbl.h || 24;
    // fully inside the viewport (label box is anchored bottom-centre), else hidden, never pinned to an edge
    let ok = projV.z < 1 && projV.z > -1 && lbl.sx - hw >= 6 && lbl.sx + hw <= w - 6 && lbl.sy - lh >= 6 && lbl.sy <= h - 6;
    // occlusion: round-robin raycast so labels don't show through unrelated buildings
    if (ok && i === labelRR % labelEls.length && world.root) {
      labelDir.copy(lbl.pos).sub(camera.position);
      const dist = labelDir.length(); labelDir.normalize();
      labelRay.set(camera.position, labelDir); labelRay.far = dist - 0.3;
      const blocked = labelRay.intersectObject(world.root, true).some((x) => x.object.visible && x.object.isMesh && !x.object.userData?.noOcclude && x.distance < dist - 0.3);
      lbl.occ = Math.max(0, Math.min(3, (lbl.occ || 0) + (blocked ? 1 : -1)));
    }
    if (ok && (lbl.occ || 0) >= 2) ok = false;
    lbl.ok = ok; lbl.d = lbl.pos.distanceToSquared(ppos);
    if (ok) cand.push(lbl);
  }
  labelRR++;
  // priority: nearest landmark first; hide labels that overlap a kept one or a touch control / HUD
  cand.sort((a, b) => a.d - b.d);
  const keep = [], blockers = ctrlRects();
  for (const l of cand) {
    const r = { left: l.sx - l.w / 2 - 4, right: l.sx + l.w / 2 + 4, top: l.sy - l.h - 4, bottom: l.sy + 4 };
    const hit = (o) => r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top;
    // keep a kept label kept (hysteresis): only test against higher-priority ones
    if (blockers.some(hit) || keep.some(hit)) { l.ok = false; continue; }
    keep.push(r);
  }
  for (const lbl of labelEls) {
    const disp = lbl.ok ? '' : 'none';
    if (lbl.disp !== disp) { lbl.el.style.display = disp; lbl.disp = disp; }
    if (!disp) {
      const tf = `translate(${Math.round(lbl.sx)}px, ${Math.round(lbl.sy)}px) translate(-50%, -100%)`;
      if (lbl.tf !== tf) { lbl.el.style.transform = tf; lbl.tf = tf; }
    }
  }
  // Tahiti: a location sign steps aside (fades) while a dialogue bubble or the interaction prompt sits on it
  if (state.level === 'tahiti' && (labelFrame++ % 2) === 0) {
    const cover = [];
    for (const b of document.querySelectorAll('.tahiti-bubble')) if (b.style.display !== 'none') cover.push(b.getBoundingClientRect());
    const pr = $('#prompt'); if (pr && !pr.classList.contains('hidden') && pr.offsetParent) cover.push(pr.getBoundingClientRect());
    for (const lbl of labelEls) {
      if (lbl.disp) continue;
      let hit = false;
      if (cover.length) {
        const r = lbl.el.getBoundingClientRect();
        for (const c of cover) if (r.left < c.right + 4 && r.right > c.left - 4 && r.top < c.bottom + 4 && r.bottom > c.top - 4) { hit = true; break; }
      }
      if (lbl.hid !== hit) { lbl.el.style.opacity = hit ? '0' : ''; lbl.el.style.transition = 'opacity .15s'; lbl.hid = hit; }
    }
  }
}
let labelFrame = 0;

// ---------------- Input ----------------
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
const keys = new Set();

window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  keys.add(e.key.toLowerCase());
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
initTouchControls(keys);

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
  updateCameraFrustum();
}

function handleTap(x, y) {
  if (!state.started || !world || state.minigame || state.ko) return;
  if (state.gym) return gymPush();
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
  walkTo(it.approach?.x ?? it.x, it.approach?.z ?? it.z);
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
  if (state.level !== 'tahiti') setTimeout(() => toast('ISLAND 01 · ORIGIN ISLE'), 900);
  tour.offerWhenReady();
}

const _camR = new THREE.Vector3(), _camU = new THREE.Vector3();
let _lastChapLen = -1, _cachedProgress = 0;

function update(dt, t) {
  if (state.intro < 1 && state.started) { state.intro = Math.min(1, state.intro + dt / 2.2); updateCameraFrustum(); }
  if (state.started) {
    state.save.seconds += dt;
    if (t - lastPersist > 5) { lastPersist = t; persist(); $('#play-time').textContent = formatTime(state.save.seconds); }
  }

  const joy = touchInput.active;
  const kx = joy ? Math.sign(Math.round(touchInput.x * 1.4)) : (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const kz = joy ? Math.sign(Math.round(touchInput.y * 1.4)) : (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const running = joy ? touchInput.run : keys.has('shift');
  velocity.set(0, 0, 0);
  const pos = player.group.position;
  const prevPos = state.prevPlayerPos ? state.prevPlayerPos.set(pos.x, pos.y, pos.z) : (state.prevPlayerPos = pos.clone());
  if (state.freezeUntil && performance.now() < state.freezeUntil) {
    if (shakeT > 0) {
      shakeT -= dt;
      const a = Math.max(0, shakeT) * 0.9;
      camera.position.x += (Math.random() - 0.5) * a;
      camera.position.z += (Math.random() - 0.5) * a;
      camera.updateMatrixWorld();
    }
    return;
  }
  const frozen = !!state.minigame || !!state.groupScene || !!state.gym;
  if (state.cine) runCine(dt);

  if (state.seated && (kx || kz || state.path.length)) standUp();
  if (state.joined && (kx || kz || state.path.length)) tahiti.leaveJoin();
  if (state.passengerOf === 'guru' && (kx || kz || state.path.length)) guruRoutine.dismountNathanPassenger();
  const keyboardMove = !state.mount && !state.passengerOf && state.started && !frozen && !state.ko && (joy ? touchInput.mag > 0 : !!(kx || kz));
  if (state.mount) {
    rideUpdate(dt, t, kx, kz, running);
  } else if (state.passengerOf === 'guru') {
    /* Nathan is riding as passenger on Guru's scooty */
  } else {
  if (keyboardMove) {
    state.path = []; state.pendingOpen = null; marker.visible = false;
    if (joy) {
      // analog: direction from the stick (camera-relative), magnitude <= 1, ~20% quicker on touch; dt-scaled below
      velocity.addScaledVector(right, touchInput.x).addScaledVector(fwd, touchInput.y);
      if (velocity.lengthSq() > 1) velocity.normalize();
      velocity.multiplyScalar((running ? RUN : SPEED) * 1.2);
    } else velocity.addScaledVector(right, kx).addScaledVector(fwd, kz).normalize().multiplyScalar(running ? RUN : SPEED);
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
        state.photoPath = false;
        if (state.pendingOpen) { const it = state.pendingOpen; state.pendingOpen = null; interact(it); }
      }
    } else {
      // Click-to-move always sprints to the spot; ease in at the destination.
      const sp = RUN;
      velocity.set(dx / d, 0, dz / d).multiplyScalar(Math.min(sp, (remaining / dt) * 0.5 + 0.8));
    }
  }

  // Move with axis-separated sliding (feels better than stopping dead on walls).
  // Keyboard movement only respects solid things, so you *can* walk into the
  // lake or off the island (and pay for it); click-to-move uses the nav grid.
  const free = keyboardMove ? solidFree : (state.photoPath ? (x, z) => nav.isWalkable(x, z, 0.32) : (x, z) => nav.isWalkable(x, z, 0.32) && !charBlocks(x, z));
  if (velocity.lengthSq() > 0 && !state.ko) {
    const nx = pos.x + velocity.x * dt, nz = pos.z + velocity.z * dt;
    if (free(nx, pos.z)) pos.x = nx; else velocity.x = 0;
    if (free(pos.x, nz)) pos.z = nz; else velocity.z = 0;
  }
  if (state.gym && (!gymApi() || state.level === 'tahiti' || state.cine)) resetGym();
  if (state.gym) gymUpdate(dt);
  if (!state.ko && !state.joined) pos.y += (heightAt(pos.x, pos.z) - pos.y) * Math.min(1, dt * 18);
  if (!state.cine) checkHazards(dt);
  if (state.cine) velocity.copy(state.cine.vel);
  xrayGate.update(dt);
  player.update(dt, velocity, t);
  if (state.gym) gymSync();
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
  if (state.passengerOf === 'guru') {
    best = { kind: 'passenger', id: 'passenger:guru', x: pos.x, z: pos.z, radius: 2.0 };
  }
  if (state.gym) best = null;
  burstTick(dt);
  if (state.seated) { best = state.seated; player.group.position.set(state.seated.seat.x, heightAt(state.seated.seat.x, state.seated.seat.z), state.seated.seat.z); player.heading = state.seated.seat.heading; player.pose = 'sit'; } // while riding, the only action is getting off
  const lockHead = player.pose === 'photo' || state.joined?.photo;
  if (lockHead) player.lookAt(null);
  else if (best && !dialogue.open) player.lookAt(lookV.set(best.x, 0, best.z)); else if (!dialogue.open) player.lookAt(null);
  if (!lockHead && dialogue.open && state.talkingTo) player.lookAt(lookV.set(state.talkingTo.x, 0, state.talkingTo.z));
  if (best !== state.nearby) {
    state.nearby = best;
    updatePrompt();
  }
  // E-spot circles: nearby ones brighten, far ones keep subtle visibility matching Island 01
  const garageStop = tour.stop?.id === 'garage', featuredIds = garageStop ? new Set((state.content.projects || []).filter((p) => p.featured).map((p) => p.id)) : null;
  for (const it of world.interactables) {
    if (!it.beacon || it.kind === 'memory') continue;
    const d = Math.hypot(pos.x - it.x, pos.z - it.z);
    it.beacon.prom = it === best ? 1.5 : d < 9 ? 1.0 : d < 24 ? 0.75 : 0.55;
    // Garage tour stop: the featured project stations glow brighter so the important ones stand out
    if (garageStop && it.kind === 'project' && featuredIds.has(it.projectId)) it.beacon.prom = Math.max(it.beacon.prom, 2.2);
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
  updateNpcs(world.npcs, dt, t, heightAt, state.ko ? null : pos, state.talkingTo, camera);
  updateWalkers(world.walkers, dt, t, heightAt, state.ko ? null : pos, camera);
  // E-rings: under the feet on Island 01, in front of the character on Tahiti (Guru's own routine moves his ring itself)
  for (const n of world.npcs) {
    if (!n.beacon?.group || n.passenger || (n.npcId === 'guru' && state.level === 'island1')) continue;
    if (n.ringAt) { n.beacon.group.position.set(n.ringAt.x, heightAt(n.ringAt.x, n.ringAt.z) + 0.04, n.ringAt.z); continue; }   // fixed ring in front of a table
    // in front of the character; when that side faces away from the camera (or is a desk), the nearest open side toward the camera
    const ch = n.character, seated = ch.pose === 'sit' || ch.pose === 'sittype' || ch.pose === 'sleep', off = seated ? 0.7 : 0.95;
    const under = state.level === 'island1';   // Island 01: the ring is centred directly under the NPC's feet
    let dx = Math.sin(ch.heading), dz = Math.cos(ch.heading);
    if (dx * CAM_DIR.x + dz * CAM_DIR.z < -0.2 || ch.pose === 'sittype' || ch.pose === 'type') { dx = Math.SQRT1_2; dz = Math.SQRT1_2; }
    if (under) { dx = 0; dz = 0; }
    n.beacon.group.position.set(ch.group.position.x + dx * off, ch.group.position.y + 0.04, ch.group.position.z + dz * off);
  }
  if (state.level === 'tahiti') { tahiti.update(dt, t); tahitiHints(); }
  if (state.level === 'island1') { guruRoutine.update(dt, t); }
  dustTick(dt);

  for (const it of world.interactables) {
    if (!it.beacon) continue;
    const s = it.beacon.gem.scale.x;
    if (s > 1) it.beacon.gem.scale.setScalar(Math.max(1, s - dt * 1.5));
  }
  // exhibits wake up as Nathan approaches; Motion Off (or OS reduce-motion) freezes them
  state.playerPos = state.ko ? null : pos;
  state.dt = dt;
  state.reduceMotion = look.motion === 'off';
  world.animated.forEach((fn) => fn(t, state));
  checkTrain();
  if (marker.visible) marker.scale.setScalar(1 + Math.sin(t * 6) * 0.15);

  // Camera: crisp follow with light look-ahead, snapped to the retro pixel grid
  // when retro pixel mode is active so pixel edges stay steady while moving.
  const goal = state.camOverride ? lookV.set(state.camOverride.x, 0, state.camOverride.z) : lookV.copy(pos).addScaledVector(velocity, 0.08);
  goal.y = 0;
  const k = 1 - Math.exp(-dt * 13);
  camVel.subVectors(goal, camTarget).multiplyScalar(k);
  camTarget.add(camVel);
  // pull the camera back when zoomed out so the near clip plane never eats the island
  const camDist = 60 / Math.min(1, state.zoom);
  camera.position.copy(camTarget).addScaledVector(CAM_DIR, camDist);
  if (Math.abs(camera.far - (camDist + 240)) > 1) { camera.far = camDist + 240; camera.updateProjectionMatrix(); }
  camera.lookAt(camTarget);
  if (shakeT > 0) { shakeT -= dt; const a = Math.max(0, shakeT) * 0.5; camera.position.x += (Math.random() - 0.5) * a; camera.position.z += (Math.random() - 0.5) * a; }
  camera.updateMatrixWorld();
  if (look.pixels === 'retro') {
    const wpp = (camera.top - camera.bottom) / retro.target.height;
    _camR.setFromMatrixColumn(camera.matrixWorld, 0);
    _camU.setFromMatrixColumn(camera.matrixWorld, 1);
    const pr = camera.position.dot(_camR), pu = camera.position.dot(_camU);
    camera.position.addScaledVector(_camR, Math.round(pr / wpp) * wpp - pr).addScaledVector(_camU, Math.round(pu / wpp) * wpp - pu);
    camera.updateMatrixWorld();
  }

  fitSunShadow();
  updateLabels();
  drawMinimap(t);
  placePrompt();
  placeHints();
  tour.update();
  if (state.started && !hintHidden && (t > 14 || state.save.chapters.length)) { hintHidden = true; $('#hint').classList.add('faded'); }

  if (state.save.chapters.length !== _lastChapLen) {
    _lastChapLen = state.save.chapters.length;
    let cnt = 0;
    for (let i = 0; i < MAIN_DISTRICTS.length; i++) if (state.save.chapters.includes(MAIN_DISTRICTS[i].id)) cnt++;
    _cachedProgress = cnt / MAIN_DISTRICTS.length;
  }
  const progress = _cachedProgress;
  scene.background.lerpColors(SKY_START, SKY_END, progress);
  // Standing in a monsoon shower greys the sky a little
  let rain = null;
  for (let i = 0; i < world.weather.length; i++) if (world.weather[i].contains(pos.x, pos.z)) { rain = world.weather[i]; break; }
  rainMix += ((rain ? rain.intensity(t) : 0) - rainMix) * Math.min(1, dt * 2);
  if (rainMix > 0.01) scene.background.lerp(RAIN_SKY, rainMix * 0.55);
  if (state.level === 'tahiti') {
    scene.background.lerp(TAHITI_SKY, 0.45);
    sun.color.set(0xfff7e8);
  } else {
    sun.color.setHSL(0.11, 0.7 + progress * 0.25, 0.9 - progress * 0.08);
  }
  setOcean(state.level === 'tahiti' ? 0.55 : 0);
  setRain(rainMix);
  applyDayNight(dt);
}
const ZERO = new THREE.Vector3();

// ---------------- Day / night ----------------
// Daylight is the permanent default. Night only happens when the player picks it (no automatic cycle).
function nightTarget() { return look.time === 'night' ? 1 : 0; }
function cycleTime() {
  look.time = look.time === 'night' ? 'day' : 'night';
  applyLook();
  toast(look.time === 'night' ? 'Night mode: cosy lamplight' : 'Day mode');
}
let night = -1;

// ============================================================================
// Cosy night: soft blue-purple ambient light, warm amber lamps/windows. No spotlight on Nathan.
// ============================================================================
export const NIGHT_SETTINGS = {
  skyColor: new THREE.Color(0x5a5fae),
  moonColor: new THREE.Color(0xb4b8ff),
  hemiSky: new THREE.Color(0xa59cf0),
  hemiGround: new THREE.Color(0x6a5fa8),
  hemiIntensity: 1.5,   // day is 1.7, so the world stays clearly readable
  sunIntensity: 1.4,     // day is 2.5
  glowBoost: 0.9,        // extra emissive on lamps/fires (gentle)
  poolOpacity: 0.4,      // warm amber lamp pools, soft falloff
  fillColor: 0xc9c0ff,
  fillIntensity: 0.45,   // faint cool fill so Nathan reads against the scene
};
if (typeof window !== 'undefined') window.NIGHT_SETTINGS = NIGHT_SETTINGS;

// Very light fill on Nathan only (no glow, no ground disc); cheap on mobile.
const heroFillLight = new THREE.PointLight(NIGHT_SETTINGS.fillColor, 0, 7, 2.0);
heroFillLight.position.set(0.2, 2.0, 0.9);
player.group.add(heroFillLight);

const MARKER_GOLD = new THREE.Color(0xffc93c);   // mission rings turn gold at night
const WINDOW_WARM = new THREE.Color(0xffb85a);
const HEMI_SKY_DAY = new THREE.Color(0xfff6e6);
const HEMI_GND_DAY = new THREE.Color(0x9aa6c8);

let _prevNight = -1;

function applyDayNight(dt) {
  const target = nightTarget();
  night = night < 0 ? target : night + (target - night) * Math.min(1, dt * 1.5);
  const n = night;

  // scene.background and sun.color are reset every frame elsewhere, so daytime is restored exactly at n = 0
  if (n > 0.0005) {
    scene.background.lerp(NIGHT_SETTINGS.skyColor, n * 0.9);
    sun.color.lerp(NIGHT_SETTINGS.moonColor, n);
  }

  if (Math.abs(n - _prevNight) >= 0.0005 || _nightDirty) {
    _prevNight = n;
    _nightDirty = false;
    hemi.intensity = 1.7 + (NIGHT_SETTINGS.hemiIntensity - 1.7) * n;
    hemi.color.copy(HEMI_SKY_DAY).lerp(NIGHT_SETTINGS.hemiSky, n);
    hemi.groundColor.copy(HEMI_GND_DAY).lerp(NIGHT_SETTINGS.hemiGround, n);
    sun.intensity = 2.5 + (NIGHT_SETTINGS.sunIntensity - 2.5) * n;
    setGlowBoost(1 + n * NIGHT_SETTINGS.glowBoost);
    // Windows glow warm amber; mission rings turn gold
    for (let i = 0; i < windowMats.length; i++) { const w = windowMats[i]; w.mat.emissive.copy(w.emissive).lerp(WINDOW_WARM, n); w.mat.emissiveIntensity = w.ei + (0.8 - w.ei) * n; }
    for (let i = 0; i < markerMats.length; i++) { const m = markerMats[i]; m.mat.color.copy(m.day).lerp(MARKER_GOLD, n); }
    for (let i = 0; i < world.nightGlow.length; i++) {
      const p = world.nightGlow[i];
      p.visible = n > 0.03;
      p.material.opacity = NIGHT_SETTINGS.poolOpacity * n;
    }
    document.body.classList.toggle('is-night', n > 0.5);
  }
  heroFillLight.intensity = n > 0.005 ? NIGHT_SETTINGS.fillIntensity * n : 0;
}
let hintHidden = false;

// The interaction prompt floats above the thing you can interact with (desktop);
// on touch screens it stays a big tappable button at the bottom.
const promptV = new THREE.Vector3();
let _promptTf = '';
function placePrompt() {
  const pr = $('#prompt');
  if (!state.nearby && !pr.classList.contains('hidden')) pr.classList.add('hidden');   // never leave a stale prompt behind
  if (isTouch || !state.nearby || pr.classList.contains('hidden')) { _promptTf = ''; return; }
  const nx = state.nearby.kind === 'passenger' ? player.group.position.x : state.nearby.x;
  const nz = state.nearby.kind === 'passenger' ? player.group.position.z : state.nearby.z;
  const gy = heightAt(nx, nz);
  promptV.set(nx, gy + (state.nearby.kind === 'npc' ? 2.6 : 2.4), nz).project(camera);
  const x = (promptV.x * 0.5 + 0.5) * innerWidth, y = (-promptV.y * 0.5 + 0.5) * innerHeight;
  // keep the prompt inside the viewport and clear of the navbar, sidebar card and minimap
  const w = pr.offsetWidth || 160, h = pr.offsetHeight || 40, m = 8;
  let cx = Math.min(Math.max(x, w / 2 + m), innerWidth - w / 2 - m);
  let cy = Math.min(Math.max(y, (document.querySelector('.hud-top')?.getBoundingClientRect().bottom || 0) + h + m), innerHeight - m);
  for (const sel of ['.journey', '.minimap-wrap']) {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    if (!r || !r.width || cx + w / 2 < r.left || cx - w / 2 > r.right || cy < r.top || cy - h > r.bottom) continue;
    cy = Math.max(r.top - m, h + m);
  }
  const tf = `translate(${Math.round(cx)}px, ${Math.round(cy)}px) translate(-50%, -100%)`;
  if (tf !== _promptTf) { pr.style.transform = tf; _promptTf = tf; }
}

// Context hints (R / F / G ...) sit just under the interaction spot they belong to, inside the
// viewport and clear of the navbar, sidebar card, minimap and the floating E prompt.
let _hintTf = '';
function placeHints() {
  const el = document.getElementById('tahiti-hints');
  if (!el) return;
  if (isTouch || !state.nearby || el.classList.contains('hidden') || state.nearby.kind === 'passenger') {
    if (_hintTf) { el.style.left = ''; el.style.top = ''; el.style.bottom = ''; el.style.transform = ''; _hintTf = ''; }
    return;
  }
  const it = state.nearby;
  const v = promptV.set(it.x, heightAt(it.x, it.z), it.z).project(camera);
  const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
  const w = el.offsetWidth || 220, h = el.offsetHeight || 34, m = 8;
  let cx = Math.min(Math.max(sx, w / 2 + m), innerWidth - w / 2 - m);
  let top = sy + 30;
  const navB = document.querySelector('.hud-top')?.getBoundingClientRect().bottom || 0;
  const rects = ['.journey', '.minimap-wrap', '#prompt'].map((q) => document.querySelector(q)).filter((n) => n && !n.classList.contains('hidden')).map((n) => n.getBoundingClientRect()).filter((r) => r.width);
  for (let pass = 0; pass < 3; pass++) {
    top = Math.min(Math.max(top, navB + m), innerHeight - h - m);
    const hit = rects.find((r) => cx + w / 2 > r.left && cx - w / 2 < r.right && top + h > r.top && top < r.bottom);
    if (!hit) break;
    // slide sideways out of a corner widget, otherwise step above it
    if (hit.left < 20 || hit.right > innerWidth - 20) cx = hit.left < 20 ? hit.right + w / 2 + m : hit.left - w / 2 - m;
    else top = hit.top - h - m;
  }
  const tf = `translate(${Math.round(cx)}px, ${Math.round(top)}px) translate(-50%, 0)`;
  if (tf !== _hintTf) { el.style.left = '0'; el.style.top = '0'; el.style.bottom = 'auto'; el.style.transform = tf; _hintTf = tf; }
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
  const vehicles = world.vehicles || [];
  for (let i = 0; i < vehicles.length; i++) {
    const it = vehicles[i];
    if (it !== state.mount?.it && Math.hypot(it.x - x, it.z - z) < 0.7) return true;
  }
  // people block you, but never trap you: moving away from someone you overlap is always allowed
  const me = player.group.position;
  const blocks = (p) => { const d = Math.hypot(p.x - x, p.z - z); return d < 0.62 && d < Math.hypot(p.x - me.x, p.z - me.z) - 0.001; };
  for (let i = 0; i < world.walkers.length; i++) if (blocks(world.walkers[i].ch.group.position)) return true;
  for (let i = 0; i < world.npcs.length; i++) { const n = world.npcs[i]; if (!n.passenger && blocks(n.character.group.position)) return true; }
  return false;
}
function solidFree(x, z) {
  const r = 0.32;
  const near = world.queryColliders(x, z, r + 0.5, _qBuf);
  for (let i = 0; i < near.length; i++) {
    const c = near[i];
    if (c.r !== undefined) { if (Math.hypot(x - c.cx, z - c.cz) < c.r + r) return false; }
    else if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return false;
  }
  if (Math.hypot(x, z) > (map.props.islandRadius || 44) + 3) return false; // don't swim to the horizon
  // a stopped train is solid
  if (world.railway && world.railway.speed < 0.5 && trainNear(x, z, 0.3)) return false;
  return !charBlocks(x, z);
}
function onFloor(x, z) { return world ? world.floorAt(x, z) !== null : false; }
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
function boxHit(x, z, cx, cz, ry, padX, padZ) {
  trainLocal2.set(x - cx, 0, z - cz).applyAxisAngle(UP, -ry);
  return Math.abs(trainLocal2.z) < (1.35 + padZ) && Math.abs(trainLocal2.x) < (0.75 + padX);
}
function lerpAngle(a, b, k) { return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k; }
function checkTrain() {
  const rw = world?.railway; if (!rw) return;
  const cars = rw.train, p = player.group.position;
  while (trainPrev.length < cars.length) trainPrev.push({ x: 0, z: 0, ry: 0, ok: false });
  const moving = rw.speed >= 1.0;
  const charR = state.mount ? state.mount.cfg.r * (state.mount.it.vtype === 'horse' ? 1.25 : 1) : 0.24;
  const now = performance.now();
  const invulnerable = state.trainGuard || (state.invulnerableUntil && now < state.invulnerableUntil);
  if (invulnerable && !trainNear(p.x, p.z, 2.2) && (!state.invulnerableUntil || now >= state.invulnerableUntil)) {
    state.trainGuard = false;
  }
  const jumpH = state.mount ? (state.mount.jumpY || 0) : player.jumpY;
  const canHit = state.started && !state.ko && !state.cine && !state.seated && moving
    && (jumpH < 1.15);
  let hit = null;
  if (canHit && !invulnerable) {
    let nearTrain = false;
    for (let i = 0; i < cars.length; i++) {
      if (Math.hypot(p.x - cars[i].position.x, p.z - cars[i].position.z) < 6.5) {
        nearTrain = true;
        break;
      }
    }
    if (nearTrain) {
      for (let i = 0; i < cars.length && !hit; i++) {
        const c = cars[i], q = trainPrev[i];
        if (boxHit(p.x, p.z, c.position.x, c.position.z, c.rotation.y, charR, charR)) hit = c;
        else if (q.ok && prevPlayerOk) {
          const px = (p.x + prevPlayer.x) / 2, pz = (p.z + prevPlayer.z) / 2;
          if (boxHit(px, pz, (c.position.x + q.x) / 2, (c.position.z + q.z) / 2, lerpAngle(q.ry, c.rotation.y, 0.5), charR, charR)) hit = c;
        }
      }
    }
  }
  cars.forEach((c, i) => { const q = trainPrev[i]; q.x = c.position.x; q.z = c.position.z; q.ry = c.rotation.y; q.ok = true; });
  prevPlayer.copy(p); prevPlayerOk = true;
  if (hit) trainCollisionDeath(hit);
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
let currentRagdoll = null;
const activeDeathDecals = [];
const activeDeathParticles = [];

function createRagdollPieces(p) {
  p.group.updateMatrixWorld(true);

  // Upper section: Spine (contains torso, arms, neck, head, hair, glasses)
  const upperGroup = new THREE.Group();
  const upperSpine = p.spine.clone(true);

  const spinePos = new THREE.Vector3();
  const spineQuat = new THREE.Quaternion();
  const spineScale = new THREE.Vector3();
  p.spine.getWorldPosition(spinePos);
  p.spine.getWorldQuaternion(spineQuat);
  p.spine.getWorldScale(spineScale);

  upperGroup.position.copy(spinePos);
  upperGroup.quaternion.copy(spineQuat);
  upperGroup.scale.copy(spineScale);

  upperSpine.position.set(0, 0, 0);
  upperSpine.quaternion.identity();
  upperSpine.scale.set(1, 1, 1);
  upperGroup.add(upperSpine);

  // Lower section: Hips (contains thighs, knees, shoes), remove cloned spine
  const lowerGroup = new THREE.Group();
  const lowerHips = p.hips.clone(true);

  const spineIdx = p.hips.children.indexOf(p.spine);
  if (spineIdx !== -1 && lowerHips.children[spineIdx]) {
    lowerHips.remove(lowerHips.children[spineIdx]);
  } else {
    const sp = lowerHips.children.find((c) => c !== lowerHips.children[0] && c !== lowerHips.children[1]);
    if (sp) lowerHips.remove(sp);
  }

  const hipsPos = new THREE.Vector3();
  const hipsQuat = new THREE.Quaternion();
  const hipsScale = new THREE.Vector3();
  p.hips.getWorldPosition(hipsPos);
  p.hips.getWorldQuaternion(hipsQuat);
  p.hips.getWorldScale(hipsScale);

  lowerGroup.position.copy(hipsPos);
  lowerGroup.quaternion.copy(hipsQuat);
  lowerGroup.scale.copy(hipsScale);

  lowerHips.position.set(0, 0, 0);
  lowerHips.quaternion.identity();
  lowerHips.scale.set(1, 1, 1);
  lowerGroup.add(lowerHips);

  // Stylized red pixel cut caps (arcade style cross-section)
  const cutGeo = new THREE.BoxGeometry(0.56, 0.08, 0.36);
  const cutMat = new THREE.MeshLambertMaterial({ color: 0x8a0e20, flatShading: true });
  const upperCap = new THREE.Mesh(cutGeo, cutMat);
  upperCap.position.set(0, -0.02, 0);
  upperGroup.add(upperCap);

  const lowerCap = new THREE.Mesh(cutGeo, cutMat);
  lowerCap.position.set(0, 0.02, 0);
  lowerGroup.add(lowerCap);

  scene.add(upperGroup);
  scene.add(lowerGroup);

  return { upperGroup, lowerGroup, cutGeo, cutMat };
}

function stepRagdollPiece(piece, dt) {
  piece.vel.y -= 19 * dt;
  piece.group.position.addScaledVector(piece.vel, dt);

  const angSpeed = piece.rotVel.length();
  if (angSpeed > 0.02) {
    const axis = piece.rotVel.clone().normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angSpeed * dt);
    piece.group.quaternion.premultiply(q);
  }

  const pos = piece.group.position;
  const floor = heightAt(pos.x, pos.z) + piece.floorOffset;
  if (pos.y <= floor) {
    pos.y = floor;
    if (piece.vel.y < -1.1) {
      piece.vel.y = -piece.vel.y * 0.32;
      piece.vel.x *= 0.62;
      piece.vel.z *= 0.62;
      piece.rotVel.multiplyScalar(0.55);
      spawnGroundBloodDecal(pos.x, pos.z, 0.2 + Math.random() * 0.2);
    } else {
      piece.vel.set(0, 0, 0);
      piece.rotVel.set(0, 0, 0);
    }
  }
}

function spawnGroundBloodDecal(x, z, r = 0.25) {
  const d = new THREE.Mesh(new THREE.CircleGeometry(r, 6), fxMat(Math.random() < 0.5 ? 0x8a0e20 : 0xb3122a, 0.85));
  d.rotation.x = -Math.PI / 2;
  d.rotation.z = Math.random() * 6;
  d.position.set(x, heightAt(x, z) + 0.035, z);
  d.renderOrder = 2;
  scene.add(d);
  activeDeathDecals.push(d);
}

function spawnTrailPixel(pos) {
  const reds = [0xb3122a, 0x8a0e20, 0xd6233a];
  const s = 0.06 + Math.random() * 0.06;
  const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), fxMat(reds[Math.floor(Math.random() * reds.length)]));
  m.position.set(pos.x + (Math.random() - 0.5) * 0.1, pos.y, pos.z + (Math.random() - 0.5) * 0.1);
  scene.add(m);
  activeDeathParticles.push(m);
  const part = {
    m,
    v: new THREE.Vector3((Math.random() - 0.5) * 0.8, -0.5 - Math.random() * 1.5, (Math.random() - 0.5) * 0.8),
    g: 14,
    floor: heightAt(pos.x, pos.z) + 0.03
  };
  runParticles([part], 1200, (k) => {
    if (k >= 1) {
      m.geometry?.dispose();
      m.material?.dispose();
      const idx = activeDeathParticles.indexOf(m);
      if (idx !== -1) activeDeathParticles.splice(idx, 1);
    }
  });
}

function spawnPixelBloodBurst(at, dir) {
  const parts = [];
  const reds = [0xb3122a, 0x8a0e20, 0xd6233a, 0xff2a45, 0x6e0816];
  for (let i = 0; i < 42; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 2.0 + Math.random() * 4.0;
    const s = 0.08 + Math.random() * 0.09;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), fxMat(reds[i % reds.length]));
    m.position.set(
      at.x + (Math.random() - 0.5) * 0.25,
      at.y + 0.85 + (Math.random() - 0.5) * 0.25,
      at.z + (Math.random() - 0.5) * 0.25
    );
    scene.add(m);
    activeDeathParticles.push(m);
    parts.push({
      m,
      v: new THREE.Vector3(
        Math.cos(a) * sp + dir.x * 3.0,
        3.5 + Math.random() * 4.5,
        Math.sin(a) * sp + dir.z * 3.0
      ),
      g: 17,
      floor: heightAt(at.x, at.z) + 0.04
    });
  }
  runParticles(parts, 1800, (k) => {
    if (k >= 1) {
      for (const p of parts) {
        p.m.geometry?.dispose();
        p.m.material?.dispose();
        const idx = activeDeathParticles.indexOf(p.m);
        if (idx !== -1) activeDeathParticles.splice(idx, 1);
      }
    }
  });

  // Ground splatters
  for (let i = 0; i < 8; i++) {
    const r = 0.22 + Math.random() * 0.45;
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 6), fxMat(i % 2 ? 0x8a0e20 : 0xb3122a, 0.88));
    d.rotation.x = -Math.PI / 2;
    d.rotation.z = Math.random() * 6;
    const sx = at.x + dir.x * (0.3 + Math.random() * 1.6) + (Math.random() - 0.5) * 1.3;
    const sz = at.z + dir.z * (0.3 + Math.random() * 1.6) + (Math.random() - 0.5) * 1.3;
    d.position.set(sx, heightAt(sx, sz) + 0.03 + i * 0.002, sz);
    d.renderOrder = 2;
    scene.add(d);
    activeDeathDecals.push(d);
  }
}

function respawnNathanAfterDeath(prevZoom = 1.0) {
  // Clean up ragdoll, decals, and any leftover particles
  if (currentRagdoll) {
    if (currentRagdoll.upperGroup) scene.remove(currentRagdoll.upperGroup);
    if (currentRagdoll.lowerGroup) scene.remove(currentRagdoll.lowerGroup);
    currentRagdoll.cutGeo?.dispose();
    currentRagdoll.cutMat?.dispose();
    currentRagdoll = null;
  }
  activeDeathDecals.forEach((d) => {
    scene.remove(d);
    d.geometry?.dispose();
    d.material?.dispose();
  });
  activeDeathDecals.length = 0;
  activeDeathParticles.forEach((m) => {
    scene.remove(m);
    m.geometry?.dispose();
    m.material?.dispose();
  });
  activeDeathParticles.length = 0;

  // Respawn at central plaza
  const plaza = map?.spawn ? { x: map.spawn.x, z: map.spawn.z } : { x: 0, z: 5.4 };
  const py = heightAt(plaza.x, plaza.z);
  player.group.position.set(plaza.x, py, plaza.z);
  player.group.rotation.set(0, 0, 0);
  player.heading = Math.PI; // Face the central plaza CRT
  player.group.visible = true;
  lastSafe.set(plaza.x, py, plaza.z);

  // Reset animations and movement
  player.pose = null;
  player.action = null;
  player.actionT = 0;
  player.actionW = 0;
  player.jumpY = 0;
  player.jumpV = 0;
  player.speed = 0;
  player.talking = false;
  player.lookAt(null);
  velocity.set(0, 0, 0);
  state.path = [];
  state.pendingOpen = null;
  state.nearby = null;
  marker.visible = false;

  // Reset camera & effects
  shakeT = 0;
  state.freezeUntil = 0;
  camVel.set(0, 0, 0);
  camTarget.set(plaza.x, 0, plaza.z);
  state.camOverride = null;
  setZoom(prevZoom || 1.0);

  // Clear WASTED and un-fade
  const el = $('#ko');
  if (el) {
    el.classList.remove('dark');
    el.classList.add('hidden');
    el.innerHTML = '';
  }

  // Restore state
  state.ko = null;
  state.trainGuard = true;
  state.invulnerableUntil = performance.now() + 2500;
  prevPlayerOk = false;
  persist();
}

function trainCollisionDeath(car) {
  if (state.ko) return;
  const rw = world?.railway;
  const hitPos = player.group.position.clone();
  const m = state.mount;

  state.ko = 'train';
  state.path = [];
  state.pendingOpen = null;
  state.nearby = null;
  marker.visible = false;
  $('#prompt')?.classList.add('hidden');
  closePanel();
  dialogue.close();

  if (state.passengerOf === 'guru') {
    guruRoutine?.dismountNathanPassenger?.(true);
    player.group.position.copy(hitPos);
  }
  const p = player.group.position;

  // If riding a mount, park vehicle at home
  if (m) {
    const it = m.it;
    state.mount = null;
    state.nearby = null;
    player.pose = null;
    player.riding = false;
    player.pedal = 0;
    if (it.vtype === 'moto') {
      setEngine(null);
      if (state.level === 'tahiti') tahiti.onMotoDismount({ x: p.x, z: p.z });
    }
    parkVehicle(it, it.home, it.home.heading, true);
    toast(`Your ${VEHICLES[it.vtype]?.label || 'ride'} is back at its parking spot.`);
  }

  // Calculate impact kinematics from train car
  const carRot = car ? car.rotation.y : (rw?.train?.[0]?.rotation.y ?? 0);
  const carPos = car ? car.position : (rw?.train?.[0]?.position ?? p);
  const trainSpeed = Math.max(3.8, rw?.speed || 5.2);

  const trainFwd = new THREE.Vector3(Math.sin(carRot), 0, Math.cos(carRot)).normalize();
  const toPlayer = new THREE.Vector3().subVectors(p, carPos);
  const lateral = new THREE.Vector3(-trainFwd.z, 0, trainFwd.x);
  if (lateral.dot(toPlayer) < 0) lateral.negate();

  const impactDir = trainFwd.clone().multiplyScalar(0.85).addScaledVector(lateral, 1.35).normalize();
  player.heading = Math.atan2(-impactDir.x, -impactDir.z);

  // 1. Audio impact sound
  sfx.trainCrash();

  // 2. Screen shake
  shakeT = reducedMotion ? 0 : 0.65;

  // 3. Camera zoom out
  const prevZoom = state.zoom;
  setZoom(Math.min(prevZoom, Math.max(0.7, prevZoom * 0.78)));

  // 4. Impact freeze-frame (short pause before release)
  const t0 = performance.now();
  const freezeDur = reducedMotion ? 0 : 110;
  state.freezeUntil = t0 + freezeDur;

  // 5. Create ragdoll split pieces and blood burst
  const ragdoll = createRagdollPieces(player);
  currentRagdoll = ragdoll;
  player.group.visible = false;

  spawnPixelBloodBurst(p, impactDir);

  // Ragdoll velocities
  const upperVel = impactDir.clone().multiplyScalar(trainSpeed * 1.55);
  upperVel.y = 7.0 + Math.random() * 1.5;
  const upperRotVel = new THREE.Vector3((Math.random() - 0.5) * 8, 10 + Math.random() * 6, (Math.random() - 0.5) * 8);

  const lowerVel = impactDir.clone().multiplyScalar(trainSpeed * 1.15).addScaledVector(lateral, -0.6);
  lowerVel.y = 3.6 + Math.random() * 1.2;
  const lowerRotVel = new THREE.Vector3(12 + Math.random() * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6);

  const upperPiece = { group: ragdoll.upperGroup, vel: upperVel, rotVel: upperRotVel, floorOffset: 0.38 };
  const lowerPiece = { group: ragdoll.lowerGroup, vel: lowerVel, rotVel: lowerRotVel, floorOffset: 0.28 };

  const el = $('#ko');
  let wastedShown = false;
  let trailTimer = 0;
  let lastTime = t0;

  const stepDeath = () => {
    if (!state.ko || state.ko !== 'train') return;
    const now = performance.now();
    const elapsed = now - t0;
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;

    if (now >= state.freezeUntil) {
      stepRagdollPiece(upperPiece, dt);
      stepRagdollPiece(lowerPiece, dt);

      // Camera smoothly tracks between pieces
      const midX = (upperPiece.group.position.x + lowerPiece.group.position.x) / 2;
      const midZ = (upperPiece.group.position.z + lowerPiece.group.position.z) / 2;
      state.camOverride = { x: midX, z: midZ };

      // Mid-air red pixel trail
      trailTimer += dt;
      if (trailTimer > 0.06 && elapsed < 1300) {
        trailTimer = 0;
        if (upperPiece.vel.lengthSq() > 1.8) spawnTrailPixel(upperPiece.group.position);
        if (lowerPiece.vel.lengthSq() > 1.8) spawnTrailPixel(lowerPiece.group.position);
      }
    }

    // Display WASTED overlay (text only)
    if (!wastedShown && elapsed >= (reducedMotion ? 100 : 380)) {
      wastedShown = true;
      sfx.wasted();
      if (el) {
        el.innerHTML = `
          <div class="wasted-screen">
            <div class="wasted-banner">
              <h1 class="wasted-text">WASTED</h1>
              <p class="wasted-sub">Hit by the Memory Line train</p>
            </div>
          </div>`;
        el.classList.remove('hidden');
      }
    }

    // Fade the scene after animation completes
    if (elapsed >= (reducedMotion ? 400 : 2100) && el && !el.classList.contains('dark')) {
      el.classList.add('dark');
    }

    // Respawn after ~3 seconds
    if (elapsed < (reducedMotion ? 700 : 3000)) {
      requestAnimationFrame(stepDeath);
    } else {
      respawnNathanAfterDeath(prevZoom);
    }
  };

  requestAnimationFrame(stepDeath);
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
  if (kind === 'train') return trainCollisionDeath(world?.railway?.train?.[0]);
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
  if (!best || state.ko || state.panelOpen || dialogue.open || state.minigame || state.groupScene || (state.level === 'tahiti' && tahiti.inMatch())) { pr.classList.add('hidden'); return; }
  if (best.kind === 'passenger') {
    $('#prompt-kind').textContent = "Guru's Scooty";
    $('#prompt-title').textContent = 'Dismount';
    pr.querySelector('kbd').textContent = isTouch ? '◆' : 'E';
    pr.classList.remove('hidden');
    return;
  }
  const c = state.content;
  const npc = best.kind === 'npc' && (c.npcs || []).find((n) => n.id === best.npcId);
  const mem = best.kind === 'memory' && (c.memories || []).find((m) => m.id === best.memoryId);
  const isGuruScootyRide = best.kind === 'vehicle' && best.vtype === 'scooty' && state.level === 'island1' && guruRoutine.isGuruMounted();
  const [kind, title] = {
    project: ['Inspect project', c.projects.find((p) => p.id === best.projectId)?.title],
    about: ['NATHAN.EXE', `About ${c.profile?.name || 'me'}`],
    npc: ['', npc && `Talk to ${String(npc.name).split(' ')[0].replace(/^Sivasuthan$/, 'Siva')}`],
    minigame: ['Try it', 'Lift the bar'],
    memory: ['Memory', mem ? 'Pick up ✦' : ''],
    station: ['Memory Line', best.name ? `${best.name} station` : 'Station'],
    panel: ['Look', best.title],
    group: ['Group', best.title || 'Join in'],
    activity: ['Tahiti', best.title],
    seat: ['Bench', state.seated ? 'Stand up' : 'Sit down'],
    vehicle: [{ horse: 'Horse', moto: 'Motorcycle', scooty: best.label || "Guru's Scooty" }[best.vtype] || 'Bicycle', state.mount ? 'Dismount' : isGuruScootyRide ? 'Ride along with Guru' : { horse: 'Ride horse', moto: 'Ride motorcycle', scooty: 'RIDE SCOOTY' }[best.vtype] || 'Ride bicycle'],
    finale: ['Departures', state.save.finale ? 'See the whole island again' : 'End of Origin Isle'],
    chapter: ['Open chapter', chapterFor(c, best.district)?.title],
    gym: [best.station === 'discipline' ? 'Story' : 'Workout', (best.title || '').toUpperCase()],
  }[best.kind] || ['Open', best.id];
  $('#prompt-kind').textContent = kind;
  $('#prompt-title').textContent = title || best.id;
  pr.querySelector('kbd').textContent = isTouch ? '◆' : 'E';
  pr.classList.remove('hidden');
}

// ---------------- Quick tour ----------------
const tour = createTour({
  state, dialogue,
  goTo: tourGoTo,
  busy: () => !state.started || state.intro < 1 || !!state.panelOpen || dialogue.open || !!state.minigame || !!state.cine || !!state.gym
    || !!state.groupScene || !!state.ko || !!state.choosing || !!state.visiting || !!state.flightStarting || !!state.volley || !!state.hoop
    || !$('#bigmap').classList.contains('hidden') || !!state.passengerOf,
});

// ---------------- Tahiti: companion AI, activities and events ----------------
const mgRoot = () => $('#minigame');
const tahiti = createTahiti({
  state, player, camera, heightAt, toast, sfx, dialogue, solidFree,
  get world() { return world; }, get nav() { return nav; },
  isNight: () => night > 0.5,
  aspect: () => renderer.domElement.width / Math.max(1, renderer.domElement.height),
  clearMarker() { marker.visible = false; },
  setView(v) { if (v) { state.camOverride = { x: v.x, z: v.z }; state.zoom = v.zoom; } else { state.camOverride = null; state.zoom = 1; } updateCameraFrustum(); },
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
  capture(view) {
    const hiddenMats = [];
    const hiddenObjs = [];
    const bubbleLayer = document.querySelector('.tahiti-bubbles');
    const prevBubbleVis = bubbleLayer ? bubbleLayer.style.visibility : '';
    try {
      if (bubbleLayer) bubbleLayer.style.visibility = 'hidden';
      // Hide all orange lights, beacons, X-ray ghosts and destination markers during photo capture
      for (const m of markerMats) {
        if (m.mat && m.mat.visible !== false) {
          m.mat.visible = false;
          hiddenMats.push(m.mat);
        }
      }
      scene.traverse((obj) => {
        if (obj.visible && (obj.userData?.isBeacon || obj.userData?.xray || obj === marker)) {
          obj.visible = false;
          hiddenObjs.push(obj);
        }
      });
      if (world?.interactables) {
        for (const it of world.interactables) {
          if (it.beacon?.group?.visible) {
            it.beacon.group.visible = false;
            hiddenObjs.push(it.beacon.group);
          }
          if (it.ground?.group?.visible) {
            it.ground.group.visible = false;
            hiddenObjs.push(it.ground.group);
          }
        }
      }
      let cam = camera;
      if (view) {
        const asp = renderer.domElement.width / Math.max(1, renderer.domElement.height);
        cam = new THREE.PerspectiveCamera(view.fov || 64, asp, 0.1, 300);
        cam.position.set(view.from.x, view.from.y, view.from.z);
        cam.lookAt(view.at.x, view.at.y, view.at.z);
        cam.updateMatrixWorld(true);
      }
      retro.render(scene, cam);
      const src = renderer.domElement, w = 480, h = Math.round((src.height / src.width) * w);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(src, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.78);
    } catch { return null; }
    finally {
      for (const mat of hiddenMats) mat.visible = true;
      for (const obj of hiddenObjs) obj.visible = true;
      if (bubbleLayer) bubbleLayer.style.visibility = prevBubbleVis;
      retro.render(scene, camera);
    }
  },
  openGallery() {
    let list = []; try { list = JSON.parse(localStorage.getItem('nathan-exe:tahiti-photos') || '[]'); } catch { /* ignore */ }
    showPanel('tahiti/photos', `<p class="eyebrow">TAHITI · GROUP PHOTOS</p><h2 id="panel-title">Photo board</h2>
      ${list.length ? `<div class="tahiti-gallery">${list.map((p, i) => `<figure><button type="button" class="album-open" data-photo="${i}" aria-label="Open photo ${i + 1}"><img src="${p.url}" alt="${esc(p.gang || 'Tahiti photo')}"></button><figcaption>${p.gang ? esc(p.gang) + ' · ' : ''}${new Date(p.at).toLocaleString()}</figcaption></figure>`).join('')}</div>` : '<p class="subtitle">No photos yet. Pose for a photograph at the photography session, or take a group photo at a gang tripod.</p>'}
      <p class="muted">Photos stay on this device. Click a photo to open it.</p>`);
    $('#panel-body').querySelectorAll('[data-photo]').forEach((b) => b.addEventListener('click', () => openPhotoCard(list, +b.dataset.photo)));
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
  // Do not attach a head-box bandana mesh: the old box sat inside the skull
  // while its knot Z-fought with the back hair plane at z = -0.29. Keep the
  // unlock state and celebration flex without altering Nathan's black hair.
  player.bandana = true;
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
    el.addEventListener('click', (e) => {
      const more = e.target.closest('[data-more]');
      if (more) { more.setAttribute('aria-expanded', String(el.classList.toggle('sheet-open'))); return; }
      const b = e.target.closest('[data-k]'); if (b) { el.classList.remove('sheet-open'); tahiti.key(b.dataset.k); }
    });
  }
  const parts = h.map((s) => { if (s.startsWith('Space ')) return { act: true, html: `<button type="button" data-k=" "><kbd>Space</kbd>${esc(s.slice(6))}</button>` }; const key = s[0]; return /^[RFG] /.test(s) ? { act: true, html: `<button type="button" data-k="${key.toLowerCase()}"><kbd>${key}</kbd>${esc(s.slice(2))}</button>` } : { act: false, html: `<span>${esc(s)}</span>` }; });
  const acts = parts.filter((x) => x.act), notes = parts.filter((x) => !x.act);
  el.classList.remove('sheet-open');
  // phones: one primary action visible, the rest tuck into a compact action sheet behind a "more" button
  if (isCompactUI() && acts.length > 1) {
    el.innerHTML = `${notes.map((x) => x.html).join('')}<div class="th-sheet" id="th-sheet">${acts.slice(1).map((x) => x.html).join('')}</div><div class="th-row">${acts[0].html}<button type="button" class="th-more" data-more aria-expanded="false" aria-controls="th-sheet" aria-label="More actions">⋯ ${acts.length - 1}</button></div>`;
  } else el.innerHTML = parts.map((x) => x.html).join('');
  el.classList.toggle('hidden', !h.length);
}

/* Guru Island 01 Activity Cycle */
const guruRoutine = createGuruRoutine({
  state,
  player,
  camera,
  heightAt,
  toast,
  sfx,
  dialogue,
  solidFree,
  get world() { return world; },
  get nav() { return nav; },
  velocity
});

// === Debug overlay (?debug or F3) ===
let dbg = null, dbgLastMs = 0, dbgLastHud = 0;
const dbgSamples = new Float32Array(120);
const dbgSort = new Float32Array(120);
let dbgHead = 0, dbgCount = 0;
function setupDebug() {
  if (!dbg) {
    dbg = document.createElement('pre');
    dbg.className = 'debug hidden';
    document.body.append(dbg);
  }
  dbg.classList.toggle('hidden', !debugOn);
}
function toggleDebug() {
  debugOn = !debugOn;
  if (!dbg) setupDebug();
  else dbg.classList.toggle('hidden', !debugOn);
  dbgLastHud = 0;
}
function recordDebugSample(ms, now) {
  dbgSamples[dbgHead] = ms;
  dbgHead = (dbgHead + 1) % dbgSamples.length;
  if (dbgCount < dbgSamples.length) dbgCount++;
  if (!debugOn) return;
  if (!dbg) setupDebug();
  if (now - dbgLastHud < 400) return;
  dbgLastHud = now;
  let sum = 0;
  for (let i = 0; i < dbgCount; i++) {
    const v = dbgSamples[i];
    sum += v;
    dbgSort[i] = v;
  }
  dbgSort.subarray(0, dbgCount).sort();
  const avgMs = sum / dbgCount;
  const slowN = Math.max(1, Math.ceil(dbgCount * 0.01));
  let slowSum = 0;
  for (let i = dbgCount - slowN; i < dbgCount; i++) slowSum += dbgSort[i];
  const fps1Low = 1000 / (slowSum / slowN);
  const p95 = dbgSort[Math.min(dbgCount - 1, Math.floor(dbgCount * 0.95))];
  const info = renderer.info.render;
  const mem = renderer.info.memory;
  dbg.textContent =
    `FPS ${(1000 / avgMs).toFixed(0)} (1% low ${fps1Low.toFixed(0)}) · ${avgMs.toFixed(1)}ms (p95 ${p95.toFixed(1)}ms)\n` +
    `draw ${info.calls}  tris ${(info.triangles / 1000).toFixed(1)}k  geo ${mem.geometries}  tex ${mem.textures}\n` +
    `rt ${retro.target.width}×${retro.target.height}  pos ${player.group.position.x.toFixed(1)},${player.group.position.z.toFixed(1)}`;
}

function loop() {
  const now = performance.now();
  const rawMs = dbgLastMs ? now - dbgLastMs : 16.67;
  dbgLastMs = now;
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  const active = state.started || state.bootFading;
  // one bad frame (e.g. a workout edge case) must never stop the game loop
  if (world && active) {
    try { update(dt, t); } catch (err) { console.error(err); if (state.gym) resetGym({ place: true }); }
    renderer.info.reset();
    retro.render(scene, camera);
    if (rawMs > 0 && rawMs < 500) recordDebugSample(rawMs, now);
  }
  requestAnimationFrame(loop);
}

if (import.meta.env.DEV) {
  // Dev-only hook for automated testing: step the simulation without rAF.
  window.__game = {
    state, player, camera, sun, scene, camTarget, get world() { return world; }, renderer, dialogue, nightSettings: NIGHT_SETTINGS,
    step(frames = 60) { for (let i = 0; i < frames; i++) update(1 / 60, clock.elapsedTime + i / 60); retro.render(scene, camera); },
    tap: handleTap, walkTo, interact, knockout, trainCrash: trainCollisionDeath, respawn: respawnNathanAfterDeath, startFlight, skipCine, switchLevel, get map() { return map; }, get nav() { return nav; }, tahiti: () => tahiti, guru: () => guruRoutine, tour, keys,
  };
}

// After a mouse/touch click on HUD buttons, give keyboard control back to the game.
document.addEventListener('pointerup', (e) => { const b = e.target.closest?.('button, a'); if (b && !b.closest('.travel')) setTimeout(() => b.blur(), 0); });
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => { resize(); setTimeout(resize, 250); setTimeout(resize, 700); });
window.visualViewport?.addEventListener('resize', resize);
window.addEventListener('pagehide', () => { stopPanelMedia(); resetGym(); persist(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopPanelMedia(); });
resize();
const loaded = init();
runBoot(loaded);
loop();
