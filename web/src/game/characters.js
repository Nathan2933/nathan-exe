// Characters menu: one row per talkable person (never per island), with a live "where and
// doing what" line and a Visit button. The actual teleport lives in main.js (host.visit),
// because it needs the world, collisions and camera. This file is only roster + UI.
import { CANONICAL_MAP } from './conversation.js';
import { esc } from '../shared/content.js';

const ACT = {
  drafting: 'Drafting plans', sandwork: 'Building a sand model', stream: 'Streaming', gaming: 'Gaming', coding: 'Coding',
  memories: 'Taking photos', photowalk: 'Photo walk', rest: 'Resting', campfire: 'Singing by the fire',
  courtyard: 'Dancing', eat: 'Eating', picnic: 'At the picnic', volley: 'Playing volleyball', beach: 'At the beach',
  deck: 'Dancing on the deck', dj: 'DJing', table: 'At the table', railing: 'Watching the sea', lounge: 'Relaxing',
  hoop: 'Shooting hoops', photo_sa: 'Photographing', photo_sh: 'Photographing',
  photowalk_ol: 'Photo walk', feast: 'Eating', tvgame: 'Playing a game', firepit: 'By the fire', selfie: 'Taking selfies',
};
const GURU = { coding: 'Coding', break: 'Taking a break', walk_to_scooty: 'Heading to the scooty', mount: 'Getting on the scooty', riding: 'Out on the scooty', return: 'Riding back', walk_to_pc: 'Heading back to his desk' };
const POSE = { sit: 'Sitting', sittype: 'At the computer', type: 'At the computer', film: 'Taking photos', phone: 'On the phone', look: 'Looking around', lean: 'Leaning on the wall', gaze: 'Watching the sea', sleep: 'Resting' };
const ISLAND = { island1: 'Island 01', tahiti: 'Tahiti' };

export function createCharacters(host) {
  const $ = (s) => document.querySelector(s);
  const btn = $('#chars-toggle'), panel = $('#chars-panel'), listEl = $('#chars-list'), note = $('#chars-note');
  let isOpen = false, timer = null, loading = false;

  const islandOf = (d) => (d.id.startsWith('tahiti_') ? 'tahiti' : 'island1');

  function roster() {
    const lvl = host.level();
    const by = new Map();
    for (const d of host.content().npcs || []) {
      const c = CANONICAL_MAP[d.id] || d.id;
      if (!by.has(c)) by.set(c, { canon: c, defs: [] });
      by.get(c).defs.push(d);
    }
    const rows = [];
    for (const r of by.values()) {
      // Harris is one person who flies with Nathan, so he is wherever the current world is
      const islands = r.canon === 'harris' ? [lvl] : [...new Set(r.defs.map(islandOf))];
      const here = islands.includes(lvl) ? lvl : islands[0];
      const def = r.defs.find((d) => islandOf(d) === here || r.canon === 'harris') || r.defs[0];
      const nameDef = r.defs.find((d) => islandOf(d) === 'tahiti') || def;
      let activity = 'Not in view', moving = false;
      if (here === lvl) {
        const a = host.activityOf(def.id) || {};
        if (def.id === 'guru') {
          activity = GURU[a.act] || 'Hanging out';
          moving = ['walk_to_scooty', 'mount', 'riding', 'return'].includes(a.act);
        } else {
          moving = !!a.riding;
          activity = ACT[a.act] || (a.mode === 'walk' ? 'Walking around' : POSE[a.pose] || 'Hanging out');
        }
      }
      rows.push({ canon: r.canon, name: nameDef.name, color: def.color || '#6a5d8c', island: here, here: here === lvl, activity, moving });
    }
    rows.sort((a, b) => (b.here - a.here) || a.name.localeCompare(b.name));
    return rows;
  }

  function render() {
    const busy = host.busyReason();
    note.textContent = busy || 'Visit teleports you next to them.';
    note.classList.toggle('warn', !!busy);
    listEl.innerHTML = roster().map((r) => {
      const why = busy || (r.moving ? 'On the move, try again in a moment' : '');
      return `<li class="chars-row"><span class="chars-av" style="--npc:${esc(r.color)}" aria-hidden="true">${esc(r.name[0])}</span>
        <span class="chars-info"><b>${esc(r.name)}</b><small>${esc(ISLAND[r.island])} · ${esc(r.activity)}</small></span>
        <button type="button" class="chars-visit" data-visit="${esc(r.canon)}"${why ? ` disabled title="${esc(why)}"` : ''}>Visit</button></li>`;
    }).join('');
  }

  async function show() {
    if (loading) return;
    loading = true;
    try { await host.loadTahiti(); } catch { /* Tahiti-only people simply stay out of the list */ }
    loading = false;
    isOpen = true;
    panel.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
    render();
    clearInterval(timer);
    timer = setInterval(render, 1200);   // live activity, a handful of rows, not per frame
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    clearInterval(timer); timer = null;
    panel.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', () => (isOpen ? close() : show()));
  panel.querySelector('.chars-close').addEventListener('click', close);
  listEl.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-visit]');
    if (!b || b.disabled) return;
    b.disabled = true;
    const ok = await host.visit(b.dataset.visit);
    if (ok) close(); else render();
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) { close(); } });

  return { close, get open() { return isOpen; } };
}
