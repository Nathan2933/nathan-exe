import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import './styles.css';

/**
 * NATHAN.EXE — Minimal original third-person web game.
 * Map geometry is authored in Blender. Physics & storytelling come from level.json.
 * Movement uses continuous swept-ish axis-separated 2D AABB collision; it is NOT
 * a general 3D rigid-body physics engine (no stairs, roof access, or interiors).
 */
const BASE = import.meta.env.BASE_URL;
const $ = (selector) => document.querySelector(selector);
const canvas = $('#world');
const minimap = $('#minimap');
const mapCtx = minimap.getContext('2d');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a5bec8');
scene.fog = new THREE.Fog('#a5bec8', 90, 220);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 1.85));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const camera = new THREE.PerspectiveCamera(58, 1, 0.12, 310);
scene.add(new THREE.HemisphereLight('#edf2fa', '#536755', 2.7));
const sun = new THREE.DirectionalLight('#fff0d6', 3.0);
sun.position.set(-36, 80, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -110;
sun.shadow.camera.right = 110;
sun.shadow.camera.top = 110;
sun.shadow.camera.bottom = -110;
sun.shadow.camera.near = 5;
sun.shadow.camera.far = 200;
sun.shadow.bias = -0.0007;
scene.add(sun);

const state = {
  level: null, ready: false, yaw: 0.0, distance: 14.5,
  modalOpen: false, nearby: null, visited: new Set(), time: 0,
  joy: { x: 0, y: 0 }, mouse: { down: false, lastX: 0, pointerId: null },
  keys: new Set(), feetY: 0.35,
};
const clock = new THREE.Clock();
const player = new THREE.Group();
player.name = 'PLAYER_ORIGINAL_LOW_POLY';
scene.add(player);
const avatar = new THREE.Group();
player.add(avatar);

const playerMaterials = {
  jacket: new THREE.MeshStandardMaterial({ color: '#e6a66e', roughness: 0.88, flatShading: true }),
  pants: new THREE.MeshStandardMaterial({ color: '#344f61', roughness: 0.88, flatShading: true }),
  shoes: new THREE.MeshStandardMaterial({ color: '#f1e9d9', roughness: 0.8, flatShading: true }),
  skin: new THREE.MeshStandardMaterial({ color: '#b87959', roughness: 0.9, flatShading: true }),
  hair: new THREE.MeshStandardMaterial({ color: '#2a2428', roughness: 0.9, flatShading: true }),
  trim: new THREE.MeshStandardMaterial({ color: '#343d49', roughness: 0.88, flatShading: true }),
};
const limb = {};
function partBox(parent, name, size, pos, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...pos);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function createAvatar() {
  // Original abstract retro-cartoon avatar, not a replica of an existing character.
  partBox(avatar, 'JACKET_BODY', [0.93, 1.16, 0.54], [0, 1.67, 0], playerMaterials.jacket);
  partBox(avatar, 'SHIRT_NECK', [0.40, 0.20, 0.60], [0, 2.30, -0.01], playerMaterials.trim);
  partBox(avatar, 'HEAD', [0.65, 0.79, 0.64], [0, 2.69, -0.04], playerMaterials.skin);
  partBox(avatar, 'HAIR', [0.71, 0.23, 0.71], [0, 3.10, -0.04], playerMaterials.hair);
  partBox(avatar, 'BACKPACK', [0.74, 0.78, 0.26], [0, 1.77, 0.39], playerMaterials.trim);
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.64, 2.10, 0);
    avatar.add(arm);
    partBox(arm, `ARM_${s}`, [0.30, 1.07, 0.32], [0, -0.52, 0], playerMaterials.jacket);
    partBox(arm, `HAND_${s}`, [0.26, 0.24, 0.28], [0, -1.15, 0], playerMaterials.skin);
    limb[s === -1 ? 'armL' : 'armR'] = arm;
    const leg = new THREE.Group();
    leg.position.set(s * 0.25, 1.13, 0);
    avatar.add(leg);
    partBox(leg, `LEG_${s}`, [0.38, 0.89, 0.39], [0, -0.42, 0], playerMaterials.pants);
    partBox(leg, `SHOE_${s}`, [0.44, 0.22, 0.65], [0, -0.96, -0.10], playerMaterials.shoes);
    limb[s === -1 ? 'legL' : 'legR'] = leg;
  }
}
createAvatar();

function setLoading(progress, message) {
  $('#loading-bar').style.width = `${Math.min(100, Math.max(0, progress))}%`;
  $('#loading-text').textContent = message;
}
function hideLoading() {
  $('#loading').classList.add('done');
  setTimeout(() => $('#loading').remove(), 900);
}
function addShadows(gltf) {
  gltf.traverse((object) => {
    if (object.isMesh) {
      object.receiveShadow = true;
      // Avoid a large shadow-map cost from hundreds of small details.
      object.castShadow = /BODY|MAIN|ROOF|TOWER|TRUNK|CROWN|PINE/i.test(object.name);
      if (object.material) object.material.side = THREE.FrontSide;
    }
  });
}

function simpleBox(parent, color, w, h, d, x, y, z, shadow = false) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.89, flatShading: true }));
  o.position.set(x, y, z);
  o.receiveShadow = true;
  o.castShadow = shadow;
  parent.add(o);
  return o;
}
function createLabel(text, w = 9.0, color = '#f2e8da') {
  const cvs = document.createElement('canvas');
  cvs.width = 768; cvs.height = 160;
  const c = cvs.getContext('2d');
  c.fillStyle = '#25333d';
  c.fillRect(0, 0, 768, 160);
  c.textBaseline = 'middle'; c.textAlign = 'center';
  c.fillStyle = color;
  c.font = 'bold 76px ui-monospace, monospace';
  c.fillText(text, 384, 83, 710);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 160 / 768),
    new THREE.MeshBasicMaterial({ map: texture, transparent: false, side: THREE.DoubleSide }));
  return plane;
}
function fallbackBlockout(level) {
  // Immediately playable architectural blockout when the Blender .glb has not
  // been generated yet. The detailed, production geometry comes from Blender.
  const root = new THREE.Group();
  root.name = 'FALLBACK_GREYBOX__RUN_BLENDER_TO_REPLACE';
  scene.add(root);
  simpleBox(root, '#92a787', 188, 0.2, 188, 0, -0.13, 0);
  simpleBox(root, '#434f5a', 168, 0.15, 12, 0, 0.05, 0);
  simpleBox(root, '#434f5a', 12, 0.15, 168, 0, 0.06, 0);
  const campus = level.buildings.find((b) => b.id === 'russia');
  if (campus) simpleBox(root, '#dbe9e8', 70, 0.10, 70, campus.x, 0.00, campus.z);
  for (let i = -77; i <= 77; i += 13) {
    if (Math.abs(i) < 17) continue;
    simpleBox(root, '#f1dfab', 5.2, 0.02, 0.23, i, 0.14, 0);
    simpleBox(root, '#f1dfab', 0.23, 0.02, 5.2, 0, 0.14, i);
  }
  for (const z of level.buildings) {
    const colors = { fitness: '#a46e53', russia: '#a3afb8', projects: '#596e7e', future: '#7779a4' };
    const accent = { fitness: '#e5a46e', russia: '#b5d2da', projects: '#6ed2ca', future: '#b6a8f0' };
    simpleBox(root, colors[z.id], z.width, z.height, z.depth, z.x, z.height / 2, z.z, true);
    simpleBox(root, '#37424a', z.width + 1, 1, z.depth + 1, z.x, z.height + 0.4, z.z, true);
    const fy = z.z < 0 ? z.z + z.depth / 2 + 0.18 : z.z - z.depth / 2 - 0.18;
    simpleBox(root, '#34566d', 6, 4.8, 0.24, z.x, 2.5, fy);
    const sign = createLabel(({ fitness: 'THE GRIND', russia: 'THE DETOUR', projects: 'BUILD LAB', future: 'NEXT MISSION' })[z.id], 13, accent[z.id]);
    sign.position.set(z.x, z.height - 1.45, fy + (z.z < 0 ? 0.16 : -0.16));
    if (z.z > 0) sign.rotation.y = Math.PI;
    root.add(sign);
  }
  const pavement = { fitness: '#d3cab8', russia: '#c5d6df', projects: '#adbbba', future: '#e2d7c7' };
  for (const area of level.interactions) {
    const building = level.buildings.find((b) => b.id === area.id);
    if (!building) continue;
    const half = Math.abs(area.z);
    simpleBox(root, pavement[area.id], 5.4, 0.10, half + 1, area.x, 0.12, area.z / 2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.095, 6, 30),
      new THREE.MeshBasicMaterial({ color: pavement[area.id] }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(area.x, 0.23, area.z);
    root.add(ring);
  }
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 0.18, 28),
    new THREE.MeshStandardMaterial({ color: '#d8cbb5', flatShading: true }));
  plaza.position.y = 0.16;
  plaza.receiveShadow = true;
  root.add(plaza);
  simpleBox(root, '#343e48', 3.2, 1.5, 3.2, 0, 0.75, -4, true);
  const title = createLabel('NATHAN.EXE', 10.0, '#f5ebdb');
  title.position.set(0, 2.05, -2.26);
  root.add(title);
  const random = (n) => ((Math.sin(n * 91.271) * 7353.72) % 1 + 1) % 1;
  for (let i = 0; i < 54; i++) {
    let x = (random(i + 10) - 0.5) * 166;
    let z = (random(i + 130) - 0.5) * 166;
    if (Math.abs(x) < 12 || Math.abs(z) < 12) continue;
    if (level.buildings.some((b) => Math.abs(x - b.x) < b.width / 2 + 6 && Math.abs(z - b.z) < b.depth / 2 + 6)) continue;
    if (level.interactions.some((b) => Math.abs(x - b.x) < 5 && Math.abs(z - b.z) < 6)) continue;
    simpleBox(root, '#665f4a', 0.60, 3.3, 0.60, x, 1.60, z);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.25 + random(i + 90), 0),
      new THREE.MeshStandardMaterial({ color: z < -12 && x > 12 ? '#a9c1c5' : '#548767', flatShading: true }));
    crown.position.set(x, 4.1, z);
    crown.castShadow = true; root.add(crown);
  }
  return root;
}

const world = { level: null, loadedGLB: false };
async function loadLevel() {
  const resp = await fetch(`${BASE}data/level.json`, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`Cannot read level.json: HTTP ${resp.status}`);
  return resp.json();
}
async function loadWorld() {
  setLoading(14, 'Preparing game systems…');
  const level = await loadLevel();
  world.level = level; state.level = level;
  player.position.set(level.spawn.x, level.spawn.y ?? 0.13, level.spawn.z);
  state.yaw = level.spawn.yaw || 0;
  camera.position.set(level.spawn.x, 14, level.spawn.z + 15);
  setLoading(45, 'Importing the Blender world…');
  try {
    const glb = await new GLTFLoader().loadAsync(`${BASE}assets/nathan_town.glb`);
    addShadows(glb.scene);
    scene.add(glb.scene);
    world.loadedGLB = true;
    $('#runtime-label').textContent = 'BLENDER WORLD / LIVE';
  } catch (error) {
    console.info('No Blender GLB yet — loading playable architecture preview.', error);
    fallbackBlockout(level);
    $('#runtime-label').textContent = 'BLOCKOUT MODE / RUN BLENDER TO UPGRADE';
  }
  setLoading(100, 'World ready. Explore.');
  state.ready = true;
  hideLoading();
}

const bindings = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'backward', ArrowDown: 'backward',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
};
window.addEventListener('keydown', (e) => {
  if (bindings[e.code] || e.code === 'Space') e.preventDefault();
  state.keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'KeyE' && !state.modalOpen) interact();
  if (e.code === 'Escape' && state.modalOpen) closeModal();
});
window.addEventListener('keyup', (e) => state.keys.delete(e.code));
window.addEventListener('blur', () => state.keys.clear());
canvas.addEventListener('pointerdown', (e) => {
  if (state.modalOpen) return;
  state.mouse = { down: true, lastX: e.clientX, pointerId: e.pointerId };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!state.mouse.down || state.mouse.pointerId !== e.pointerId || state.modalOpen) return;
  const delta = e.clientX - state.mouse.lastX;
  state.yaw -= delta * (e.pointerType === 'touch' ? 0.0085 : 0.0060);
  state.mouse.lastX = e.clientX;
});
const endDrag = () => { state.mouse.down = false; state.mouse.pointerId = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  state.distance = THREE.MathUtils.clamp(state.distance + e.deltaY * 0.011, 8, 23);
}, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const joystick = $('#stick');
const knob = $('#stick-knob');
let joystickPointer = null;
function updateJoystick(e) {
  const rect = joystick.getBoundingClientRect();
  const dx = e.clientX - rect.left - rect.width/2;
  const dy = e.clientY - rect.top - rect.height/2;
  const maxDist = rect.width * 0.34;
  const len = Math.hypot(dx,dy) || 1;
  const ratio = Math.min(len,maxDist)/len;
  const x = dx*ratio, y = dy*ratio;
  knob.style.transform = `translate(${x}px, ${y}px)`;
  state.joy.x = x/maxDist;
  state.joy.y = -y/maxDist;
}
joystick.addEventListener('pointerdown', (e) => {
  e.preventDefault(); joystickPointer = e.pointerId;
  joystick.setPointerCapture(e.pointerId); updateJoystick(e);
});
joystick.addEventListener('pointermove', (e) => {
  if (joystickPointer === e.pointerId) updateJoystick(e);
});
function clearJoystick(e) {
  if (joystickPointer !== e.pointerId) return;
  joystickPointer = null;
  state.joy.x = 0; state.joy.y = 0;
  knob.style.transform = 'translate(0px, 0px)';
}
joystick.addEventListener('pointerup', clearJoystick);
joystick.addEventListener('pointercancel', clearJoystick);
$('#mobile-interact').addEventListener('click', interact);

function collides(x,z) {
  const b = state.level.worldBounds;
  const radius = 0.77;
  if (x < b.minX + radius || x > b.maxX - radius ||
      z < b.minZ + radius || z > b.maxZ - radius) return true;
  for (const ob of state.level.colliders) {
    if (Math.abs(x-ob.x) < ob.halfX+radius && Math.abs(z-ob.z) < ob.halfZ+radius) return true;
  }
  return false;
}
function movePlayer(dt) {
  const k=state.keys;
  const forward = Number(k.has('KeyW') || k.has('ArrowUp')) - Number(k.has('KeyS') || k.has('ArrowDown')) + state.joy.y;
  const right = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft')) + state.joy.x;
  const len = Math.hypot(forward,right);
  const moving = len > 0.01 && !state.modalOpen;
  if (moving) {
    const f=forward / Math.max(1,len), r=right/Math.max(1,len);
    const dx=Math.sin(state.yaw)*f + Math.cos(state.yaw)*r;
    const dz=-Math.cos(state.yaw)*f + Math.sin(state.yaw)*r;
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = sprint ? 10.0 : 6.25;
    // Sub-stepping helps prevent tunnelling through narrow footprint colliders.
    const totalDist=speed*dt;
    const steps=Math.max(1,Math.ceil(totalDist/0.26));
    for (let i=0;i<steps;i++) {
      const nx=player.position.x+dx*totalDist/steps;
      if (!collides(nx,player.position.z)) player.position.x=nx;
      const nz=player.position.z+dz*totalDist/steps;
      if (!collides(player.position.x,nz)) player.position.z=nz;
    }
    const facing=Math.atan2(-dx,-dz);
    let angle=THREE.MathUtils.euclideanModulo(facing-avatar.rotation.y+Math.PI,2*Math.PI)-Math.PI;
    avatar.rotation.y += angle*Math.min(1,dt*12);
  }
  const swing = moving ? Math.sin(state.time*(k.has('ShiftLeft')?13:9)) * 0.46 : 0;
  limb.legL.rotation.x=THREE.MathUtils.lerp(limb.legL.rotation.x,swing,0.16);
  limb.legR.rotation.x=THREE.MathUtils.lerp(limb.legR.rotation.x,-swing,0.16);
  limb.armL.rotation.x=THREE.MathUtils.lerp(limb.armL.rotation.x,-swing*0.72,0.16);
  limb.armR.rotation.x=THREE.MathUtils.lerp(limb.armR.rotation.x,swing*0.72,0.16);
  avatar.position.y = moving ? Math.abs(Math.sin(state.time*12))*0.05 : Math.sin(state.time*2)*0.012;
}

function updateCamera(dt) {
  const target=new THREE.Vector3(player.position.x,2.05,player.position.z);
  const dist=state.distance;
  const ideal=new THREE.Vector3(
    target.x-Math.sin(state.yaw)*dist,
    target.y+dist*0.66,
    target.z+Math.cos(state.yaw)*dist
  );
  camera.position.lerp(ideal,1-Math.exp(-dt*7));
  camera.lookAt(target);
}

function nearestInteraction() {
  if (!state.level) return null;
  let nearby=null;
  let best=Infinity;
  for (const area of state.level.interactions) {
    const d=Math.hypot(player.position.x-area.x,player.position.z-area.z);
    if (d < area.radius && d < best) { best=d; nearby=area; }
  }
  return nearby;
}
function updateInteractions() {
  state.nearby=nearestInteraction();
  $('#interaction-prompt').classList.toggle('hidden',!state.nearby || state.modalOpen);
  $('#mobile-interact').classList.toggle('is-near',!!state.nearby && !state.modalOpen);
  if (state.nearby) {
    $('#prompt-title').textContent=state.nearby.title;
    $('#prompt-subtitle').textContent='Open chapter / '+state.nearby.chapter;
    $('#objective').textContent='Press E to enter';
    $('#objective-caption').textContent=state.nearby.title+' — '+state.nearby.chapter;
  } else {
    $('#objective').textContent='Explore the town';
    $('#objective-caption').textContent='Follow the paths to discover my story.';
  }
}
function interact() {
  if (state.nearby && !state.modalOpen) openModal(state.nearby);
}
function openModal(area) {
  state.modalOpen=true;
  state.visited.add(area.id);
  $('#modal-chapter').textContent=area.chapter;
  $('#modal-title').textContent=area.title;
  $('#modal-subtitle').textContent=area.subtitle;
  const list=$('#modal-highlights');
  list.replaceChildren();
  area.highlights.forEach((text) => {
    const li=document.createElement('li');
    li.textContent=text;
    list.appendChild(li);
  });
  const idx=state.level.interactions.findIndex((a) => a.id===area.id)+1;
  $('#modal-progress').textContent=String(idx).padStart(2,'0')+' / 04';
  $('#mission-count strong').textContent=String(state.visited.size).padStart(2,'0')+' / 04';
  $('#chapter-modal').classList.remove('hidden');
  $('#close-modal').focus();
}
function closeModal() {
  state.modalOpen=false;
  $('#chapter-modal').classList.add('hidden');
  state.keys.clear();
}
$('#modal-backdrop').addEventListener('click', closeModal);
$('#close-modal').addEventListener('click',closeModal);
$('#continue-button').addEventListener('click', closeModal);

function drawMinimap() {
  if (!state.level) return;
  const w=minimap.width,h=minimap.height;
  const ctx=mapCtx;
  const map=(x,z)=>[(x+90)/180*w,(z+90)/180*h];
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#9dad90';ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#aebfbf';
  for (const b of state.level.buildings) if (b.id==='russia') {
    const [bx,bz]=map(b.x,b.z);
    ctx.fillRect(bx-36,bz-36,72,72);
  }
  ctx.fillStyle='#525e67';
  const [rx]=map(-90,0),[cx]=map(-6,0),[,cy]=map(0,-6);
  ctx.fillRect(0,cy,w,12/180*h);
  ctx.fillRect(cx,0,12/180*w,h);
  for (const building of state.level.buildings) {
    const [x,z]=map(building.x,building.z);
    const colors={fitness:'#db9d70',russia:'#d7e7e9',projects:'#60c2b8',future:'#afa7e6'};
    ctx.fillStyle=colors[building.id]||'#d6b49e';
    ctx.fillRect(x-building.width/180*w/2,z-building.depth/180*h/2,
      building.width/180*w,building.depth/180*h);
  }
  for (const a of state.level.interactions) {
    const [x,z]=map(a.x,a.z);
    ctx.beginPath();ctx.arc(x,z,4.1,0,Math.PI*2);
    ctx.fillStyle=state.visited.has(a.id)?'#f9d77b':'#ffffff';ctx.fill();
    ctx.strokeStyle='#303a42';ctx.lineWidth=1.2;ctx.stroke();
  }
  const [px,pz]=map(player.position.x,player.position.z);
  const dx=-Math.sin(avatar.rotation.y),dz=-Math.cos(avatar.rotation.y);
  ctx.beginPath();
  ctx.moveTo(px+dx*9,pz+dz*9);
  ctx.lineTo(px-dz*5-dx*4,pz+dx*5-dz*4);
  ctx.lineTo(px+dz*5-dx*4,pz-dx*5-dz*4);
  ctx.closePath();ctx.fillStyle='#21323c';ctx.fill();
  ctx.strokeStyle='#ffffff';ctx.lineWidth=1.4;ctx.stroke();
}
let mapFrame=0;
function animate() {
  const dt=Math.min(0.042,clock.getDelta());
  state.time+=dt;
  if (state.ready) {
    movePlayer(dt);
    updateCamera(dt);
    updateInteractions();
    if ((mapFrame++%5)===0) drawMinimap();
    $('#coords').textContent=`${Math.round(player.position.x).toString().padStart(3,'0')} / ${Math.round(player.position.z).toString().padStart(3,'0')}`;
  }
  renderer.render(scene,camera);
}
function resize() {
  const w=window.innerWidth,h=window.innerHeight;
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.fov=w<650?66:58;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
renderer.setAnimationLoop(animate);
loadWorld().catch((e)=>{
  console.error(e);
  setLoading(100,`Could not start: ${e.message}. Check public/data/level.json.`);
  $('#runtime-label').textContent='STARTUP ERROR';
});
