import * as THREE from 'three';
import { RetroRenderer } from './retro.js';
import { applyPalette, SKY } from './palette.js';
import { setGlowBoost } from './kit.js';
import { sfx, setSound, setRain } from './audio.js';
import { buildWorld, loadKitOverrides, updateWalkers, groundHeight } from './world.js';
import { loadTiledMap, tileAt } from './tiled.js';
import { NavGrid } from './nav.js';
import { Player } from './player.js';
import { drawPortrait, portraitURL } from './portrait.js';
import { Dialogue } from './dialogue.js';
import { runLift } from './minigame.js';
import { loadSave, writeSave, resetSave, addUnique, formatTime } from './save.js';
import { loadContent, esc, safeUrl, chapterFor, projectCard, DISTRICTS, MAIN_DISTRICTS } from '../shared/content.js';

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
async function runBoot(loaded) {
  const pre = $('#boot-text');
  const quick = reducedMotion || sessionStorage.getItem('nathan-exe:booted');
  for (const line of bootLines) {
    if (quick) { pre.textContent += line + '\n'; continue; }
    for (const ch of line) { pre.textContent += ch; await wait(8); }
    pre.textContent += '\n';
    await wait(60);
  }
  pre.textContent = pre.textContent.replace(/\n$/, '');
  await loaded;
  const s = state.save;
  const fresh = !s.chapters.length && !s.memories.length;
  pre.textContent += fresh ? 'NEW GAME\n\n> run NATHAN.EXE' : `FOUND (${s.chapters.length} chapters, ${s.memories.length} memories, ${formatTime(s.seconds)})\n\n> continue NATHAN.EXE`;
  try { sessionStorage.setItem('nathan-exe:booted', '1'); } catch { /* ignore */ }
  const btn = $('#boot-start');
  btn.classList.remove('hidden');
  btn.textContent = isTouch ? 'Tap to start' : 'Press any key or click to start';
  const go = () => {
    window.removeEventListener('keydown', go);
    start();
  };
  window.addEventListener('keydown', go);
  $('#boot').addEventListener('click', (e) => { if (!e.target.closest('a')) go(); });
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
  const sb = document.getElementById('look-sound');
  if (sb) { sb.textContent = look.sound ? '♪ On' : '♪ Off'; sb.setAttribute('aria-pressed', String(!!look.sound)); }
  if (look.sound && !state.started) { /* audio may only start after a user gesture */ } else setSound(!!look.sound);
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch { /* ignore */ }
}

const scene = new THREE.Scene();
const SKY_START = new THREE.Color(0x8fdcf0);
const SKY_END = new THREE.Color(0xffc98f);
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
  world = buildWorld(scene, state.content, map, overrides);
  nav = new NavGrid({
    size: map.width, cell: 0.5, islandRadius: (map.props.islandRadius || 44) - 2.5, colliders: world.colliders,
    blocked: (x, z) => {
      // raised floors (jetties, platforms) are walkable even over water
      for (const f of world.floors) if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) return false;
      const t = tileAt(map, x, z); return !t || !t.walkable;
    },
  });
  const s = state.save;
  const spawn = s.pos && nav.isWalkable(s.pos.x, s.pos.z) ? s.pos : map.spawn || { x: 2, z: 6 };
  player.group.position.set(spawn.x, heightAt(spawn.x, spawn.z), spawn.z);
  player.heading = Math.PI / 4;
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
  $('#look-sound').addEventListener('click', () => { look.sound = !look.sound; applyLook(); if (look.sound) sfx.open(); });
  applyLook();
  $('#journey-toggle').addEventListener('click', () => $('.journey').classList.toggle(innerWidth <= 760 ? 'open-m' : 'collapsed'));
  window.addEventListener('keydown', (e) => {
    if (!state.started || state.minigame) return;
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === 'm' || e.key === 'M') { e.preventDefault(); toggleBigMap(); return; }
    if (e.key === 'h' || e.key === 'H') { e.preventDefault(); toggleControls(); return; }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); cycleTime(); return; }
    if (e.key === 'Escape') {
      if (!$('#bigmap').classList.contains('hidden')) return toggleBigMap(false);
      if (!$('#controls').classList.contains('hidden')) return toggleControls(false);
      if (dialogue.open) dialogue.close(); else closePanel();
    }
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
    const it = world.interactables.find((i) => i.kind === 'chapter' && i.district === b.dataset.goto);
    if (it) walkToInteractable(it);
  }));
  const main = MAIN_DISTRICTS.filter((d) => s.chapters.includes(d.id)).length;
  const totalMem = (state.content.memories || []).length;
  $('#journey-count').textContent = `${main}/${MAIN_DISTRICTS.length}`;
  $('#mem-count').textContent = `${s.memories.length}/${totalMem}`;
}

// ---------------- Interactions ----------------
function interact(it) {
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
    html = `<h2 id="panel-title" class="sr-only">${esc(p.title)}</h2>${projectCard(p)}`;
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

  if (it.kind === 'chapter' && addUnique(state.save.chapters, it.district)) {
    markVisited(it);
    persist();
    if (it.district === 'iron-yard') { player.setBuff(true); toast('CHAPTER 1 UNLOCKED · Discipline +1'); }
    else toast(`CHAPTER UNLOCKED · ${chapterFor(c, it.district)?.title || it.district}`);
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
  const def = (state.content.npcs || []).find((n) => n.id === it.npcId);
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
  }
  showPanel(`${it.district}/${it.panel}.txt`, html, it);
  if (!it.visited) { markVisited(it); }
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
        <div class="window-bar"><span class="dots"><i></i><i></i><i></i></span><span class="title">nathan.exe — process complete</span></div>
        <div class="finale-body">
          <img class="mini-portrait" src="${portraitURL()}" alt="">
          <p class="eyebrow">THE LIGHT IS ON</p>
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
  const rows = world.stations.map((st) => {
    const ch = chapterFor(c, st.district);
    const cur = st === here;
    return `<li class="${cur ? 'current' : ''}">
      <div><b>${esc(st.name)}</b><span>${esc(ch ? `${ch.title}${ch.period ? ' · ' + ch.period : ''}` : '')}</span></div>
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
  state.save.pos = { x: +p.x.toFixed(2), z: +p.z.toFixed(2) };
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
  cv.addEventListener('click', (e) => {
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
function setupLabels() {
  const layer = document.createElement('div');
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
  if (hits.length) return walkToInteractable(hits[0].object.userData.interactable);
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
  const boot = $('#boot');
  boot.classList.add('fade');
  setTimeout(() => boot.remove(), 600);
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
  const frozen = !!state.minigame;

  const keyboardMove = state.started && !frozen && !state.ko && !!(kx || kz);
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
  if (!state.ko) pos.y += (heightAt(pos.x, pos.z) - pos.y) * Math.min(1, dt * 18);
  checkHazards(dt);
  player.update(dt, velocity, t);
  stepT -= dt * Math.hypot(velocity.x, velocity.z);
  if (stepT < 0) { stepT = 1.55; if (velocity.lengthSq() > 1) sfx.step(); }

  // Nearby interactable + prompt
  let best = null, bestD = Infinity;
  for (const it of world.interactables) {
    if (it.kind === 'memory' && it.visited) continue;
    const d = Math.hypot(pos.x - it.x, pos.z - it.z);
    if (d < it.radius && d < bestD) { best = it; bestD = d; }
  }
  if (best && !dialogue.open) player.lookAt(lookV.set(best.x, 0, best.z)); else if (!dialogue.open) player.lookAt(null);
  if (dialogue.open && state.talkingTo) player.lookAt(lookV.set(state.talkingTo.x, 0, state.talkingTo.z));
  if (best !== state.nearby) {
    state.nearby = best;
    updatePrompt();
  }
  if (state.panelOpen && Math.hypot(pos.x - state.panelOpen.x, pos.z - state.panelOpen.z) > state.panelOpen.radius + 2.5) closePanel();
  if (dialogue.open && state.talkingTo && Math.hypot(pos.x - state.talkingTo.x, pos.z - state.talkingTo.z) > 4) dialogue.close();

  // NPCs: idle, look at the player when close, return to their post afterwards
  for (const it of world.npcs) {
    const ch = it.character;
    const d = Math.hypot(pos.x - it.x, pos.z - it.z);
    if (state.talkingTo !== it) {
      ch.lookAt(d < 5 ? pos : null);
      ch.heading += Math.atan2(Math.sin(it.homeHeading - ch.heading), Math.cos(it.homeHeading - ch.heading)) * Math.min(1, dt * 2);
    }
    ch.update(dt, ZERO, t);
  }
  updateWalkers(world.walkers, dt, t, heightAt, state.ko ? null : pos);

  for (const it of world.interactables) {
    if (!it.beacon) continue;
    const s = it.beacon.gem.scale.x;
    if (s > 1) it.beacon.gem.scale.setScalar(Math.max(1, s - dt * 1.5));
  }
  world.animated.forEach((fn) => fn(t, state));
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
  for (const w of world.walkers) { const p = w.ch.group.position; if (Math.hypot(p.x - x, p.z - z) < 0.62) return true; }
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
  if (world.railway && world.railway.speed > 0.5 && player.jumpY < 1.1 && trainNear(p.x, p.z)) return knockout('train');
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
  if (!best || state.panelOpen || dialogue.open || state.minigame) { pr.classList.add('hidden'); return; }
  const c = state.content;
  const npc = best.kind === 'npc' && (c.npcs || []).find((n) => n.id === best.npcId);
  const mem = best.kind === 'memory' && (c.memories || []).find((m) => m.id === best.memoryId);
  const [kind, title] = {
    project: ['Inspect project', c.projects.find((p) => p.id === best.projectId)?.title],
    about: ['Notice board', `About ${c.profile?.name || 'me'}`],
    npc: ['Talk', npc && `${npc.name}`],
    minigame: ['Try it', 'Lift the bar'],
    memory: ['Memory', mem ? 'Pick up ✦' : ''],
    station: ['Memory Line', best.name ? `${best.name} station` : 'Station'],
    panel: ['Look', best.title],
    finale: ['The ending', state.save.finale ? 'Watch the light again' : 'Light the lamp'],
    chapter: ['Open chapter', chapterFor(c, best.district)?.title],
  }[best.kind] || ['Open', best.id];
  $('#prompt-kind').textContent = kind;
  $('#prompt-title').textContent = title || best.id;
  pr.querySelector('kbd').textContent = isTouch ? '◆' : 'E';
  pr.classList.remove('hidden');
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
    tap: handleTap, walkTo, interact, knockout,
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
