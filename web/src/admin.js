import { loadContent, DISTRICTS } from './shared/content.js';

// Schema-driven editor for public/data/content.json.
// Field types: text, textarea, url, file (url + upload), checkbox, select, lines (string[] one per line), tags (string[] comma separated).

const SCHEMA = [
  {
    key: 'profile', label: 'Profile & About', type: 'object',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'role', label: 'Role / headline', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'availability', label: 'Availability line', type: 'text', hint: 'e.g. "Open to internships from June 2027". Leave empty to hide.' },
      { key: 'summary', label: 'Short summary', type: 'textarea', hint: '2–3 sentences shown at the top of the portfolio.' },
      { key: 'about', label: 'About paragraphs', type: 'lines', hint: 'One paragraph per line.' },
      { key: 'photo', label: 'Photo', type: 'file' },
      { key: 'resumeUrl', label: 'Resume (PDF)', type: 'file', hint: 'Upload a PDF or put resume.pdf in web/public and use /resume.pdf' },
    ],
  },
  {
    key: 'links', label: 'Contact links', type: 'array', itemTitle: (l) => l.label || 'Link',
    blank: () => ({ label: '', url: '' }),
    fields: [
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'url', label: 'URL', type: 'url', hint: 'Use mailto:you@example.com for email.' },
    ],
  },
  {
    key: 'chapters', label: 'Story chapters', type: 'array', itemTitle: (c) => `${c.title || 'Chapter'} — ${districtName(c.district)}`,
    blank: () => ({ id: uid('chapter'), district: 'iron-yard', title: '', subtitle: '', period: '', body: [], highlights: [] }),
    note: 'Each island district shows the chapter linked to it. The Garage chapter also lists all projects; the Signal Tower chapter shows contact links.',
    fields: [
      { key: 'district', label: 'Island district', type: 'select', options: DISTRICTS.map((d) => [d.id, d.name]) },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'period', label: 'Period', type: 'text', hint: 'e.g. 2021 – 2022' },
      { key: 'body', label: 'Story paragraphs', type: 'lines', hint: 'One paragraph per line.' },
      { key: 'highlights', label: 'Highlights', type: 'lines', hint: 'One bullet per line.' },
      { key: 'id', label: 'ID', type: 'text', advanced: true },
    ],
  },
  {
    key: 'projects', label: 'Projects', type: 'array', itemTitle: (p) => `${p.featured ? '★ ' : ''}${p.title || 'Project'}`,
    blank: () => ({ id: uid('project'), title: '', pitch: '', description: '', stack: [], tags: [], year: String(new Date().getFullYear()), github: '', demo: '', image: '', featured: false }),
    note: 'The first 6 projects appear as workbenches in the Garage. Featured projects are listed first on the portfolio.',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'pitch', label: 'One-line pitch', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'stack', label: 'Tech stack', type: 'tags', hint: 'Comma separated.' },
      { key: 'tags', label: 'Tags', type: 'tags' },
      { key: 'year', label: 'Year', type: 'text' },
      { key: 'github', label: 'Code URL', type: 'url' },
      { key: 'demo', label: 'Live demo URL', type: 'url' },
      { key: 'image', label: 'Screenshot', type: 'file' },
      { key: 'featured', label: 'Featured', type: 'checkbox' },
      { key: 'id', label: 'ID', type: 'text', advanced: true },
    ],
  },
  {
    key: 'skills', label: 'Skills', type: 'array', itemTitle: (s) => s.group || 'Group',
    blank: () => ({ group: '', items: [] }),
    fields: [
      { key: 'group', label: 'Group', type: 'text' },
      { key: 'items', label: 'Skills', type: 'tags', hint: 'Comma separated.' },
    ],
  },
  {
    key: 'experience', label: 'Experience', type: 'array', itemTitle: (e) => `${e.role || 'Role'}${e.org ? ' · ' + e.org : ''}`,
    blank: () => ({ role: '', org: '', period: '', summary: '' }),
    fields: [
      { key: 'role', label: 'Role', type: 'text' },
      { key: 'org', label: 'Organisation', type: 'text' },
      { key: 'period', label: 'Period', type: 'text' },
      { key: 'summary', label: 'Summary', type: 'textarea' },
    ],
  },
  {
    key: 'achievements', label: 'Achievements', type: 'array', itemTitle: (a) => a.title || 'Achievement',
    blank: () => ({ title: '', org: '', year: '', detail: '' }),
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'org', label: 'Event / organisation', type: 'text' },
      { key: 'year', label: 'Year', type: 'text' },
      { key: 'detail', label: 'Detail', type: 'textarea' },
    ],
  },
  {
    key: 'meta', label: 'Site settings', type: 'object',
    fields: [
      { key: 'siteTitle', label: 'Site title', type: 'text' },
      { key: 'tagline', label: 'Tagline', type: 'text' },
      { key: 'version', label: 'Version', type: 'text' },
    ],
  },
  {
    key: 'memories', label: 'Memories', type: 'array', itemTitle: (m) => `${m.title || 'Memory'} — ${districtName(m.district)}`,
    blank: () => ({ id: uid('memory'), district: 'iron-yard', title: '', year: '', text: '', image: '' }),
    note: 'Hidden collectibles in the game. Each one is placed on the map in Tiled (interact layer, type "memory", property id = this ID). The "transformation" memory is unlocked by the Iron Yard lift.',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'district', label: 'District', type: 'select', options: DISTRICTS.map((d) => [d.id, d.name]) },
      { key: 'year', label: 'Year / period', type: 'text' },
      { key: 'text', label: 'Memory text', type: 'textarea', hint: 'A real detail: 2–4 sentences.' },
      { key: 'image', label: 'Image (optional)', type: 'file' },
      { key: 'id', label: 'ID (used in Tiled)', type: 'text' },
    ],
  },
  {
    key: 'npcs', label: 'NPCs', type: 'array', itemTitle: (n) => `${n.name || 'NPC'} — ${districtName(n.district)}`,
    blank: () => ({ id: uid('npc'), name: '', role: '', district: 'iron-yard', species: 'human', skin: 'tan', hair: 'short', hairColor: '#1b1716', top: 'tee', topColor: '#6fa8dc', pants: 'jeans', shoes: '#f6f3ec', beard: 'none', glasses: false, build: 1, height: 1, color: '#2a2440', scripted: true, lines: [], topics: [] }),
    note: 'People in the town. Where each one walks is a route on the "paths" layer in Tiled (type "npc_route", property npc = this ID); see docs/WORKFLOW.md. Lines are shown as scripted game dialogue.',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'role', label: 'Role (shown under the name)', type: 'text' },
      { key: 'district', label: 'District', type: 'select', options: [...DISTRICTS.map((d) => [d.id, d.name]), ['city-park', 'City Park']] },
      { key: 'lines', label: 'Greeting', type: 'lines', hint: 'One speech bubble per line. Use // to split a line into two bubbles.' },
      { key: 'topics', label: 'Conversations (questions visitors can ask)', type: 'lines', hint: 'One per line: Question :: Answer. Split long answers with //. End an answer with [memory:ID] to unlock that memory.' },
      { key: 'species', label: 'Species', type: 'select', options: [['human', 'Human'], ['panda', 'Panda (mascot)']] },
      { key: 'skin', label: 'Skin tone', type: 'select', options: [['fair', 'Fair'], ['tan', 'Tan'], ['brown', 'Brown'], ['deep', 'Deep']] },
      { key: 'height', label: 'Height (1 = Nathan)', type: 'text' },
      { key: 'build', label: 'Build (1 = average, 1.3 = muscular)', type: 'text' },
      { key: 'hair', label: 'Hair', type: 'select', options: [['short', 'Short'], ['medium', 'Medium (shoulder length)'], ['buzz', 'Buzz cut'], ['curly', 'Curly'], ['long', 'Long'], ['bun', 'Bun'], ['beanie', 'Beanie'], ['none', 'None']] },
      { key: 'hairColor', label: 'Hair colour (#hex)', type: 'text' },
      { key: 'beard', label: 'Beard', type: 'select', options: [['none', 'None'], ['stubble', 'Stubble'], ['full', 'Full']] },
      { key: 'beardColor', label: 'Beard colour (#hex)', type: 'text' },
      { key: 'glasses', label: 'Glasses', type: 'checkbox' },
      { key: 'top', label: 'Top', type: 'select', options: [['tee', 'T-shirt'], ['tank', 'Tank top'], ['hoodie', 'Hoodie'], ['coat', 'Winter coat'], ['kurta', 'Kurta'], ['plaid', 'Checked shirt']] },
      { key: 'topColor', label: 'Top colour (#hex)', type: 'text' },
      { key: 'pants', label: 'Bottoms', type: 'select', options: [['jeans', 'Jeans'], ['trousers', 'Trousers'], ['shorts', 'Shorts']] },
      { key: 'pantsColor', label: 'Bottoms colour (#hex)', type: 'text' },
      { key: 'color', label: 'Portrait colour (#hex)', type: 'text' },
      { key: 'id', label: 'ID (used for the Tiled route)', type: 'text' },
    ],
  },
  { key: '__raw', label: 'Raw JSON', type: 'raw' },
];

const $ = (s) => document.querySelector(s);
let data = null;
let dirty = false;
let canSave = false;
let active = SCHEMA[0].key;
const open = new Set();

function uid(prefix) { return `${prefix}-${Math.random().toString(36).slice(2, 7)}`; }
function districtName(id) { return DISTRICTS.find((d) => d.id === id)?.name || id; }

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) n.append(c);
  return n;
}

function setStatus(msg, kind = '') {
  const s = $('#status');
  s.textContent = msg;
  s.className = `status ${kind}`;
}
function markDirty() {
  dirty = true;
  $('#save').disabled = !canSave;
  setStatus(canSave ? 'Unsaved changes' : 'Unsaved — download JSON to keep changes', 'warn');
}

// ---------- Rendering ----------
function renderTabs() {
  const tabs = $('#tabs');
  tabs.replaceChildren(...SCHEMA.map((s) => {
    const count = s.type === 'array' ? ` (${(data[s.key] || []).length})` : '';
    return el('button', { class: `tab${s.key === active ? ' active' : ''}`, onclick: () => { active = s.key; render(); } }, s.label + count);
  }));
}

function render() {
  renderTabs();
  const sec = SCHEMA.find((s) => s.key === active);
  const ed = $('#editor');
  ed.replaceChildren();
  ed.append(el('h1', {}, sec.label));
  if (sec.note) ed.append(el('p', { class: 'note' }, sec.note));

  if (sec.type === 'object') {
    data[sec.key] ||= {};
    ed.append(el('div', { class: 'card' }, ...sec.fields.map((f) => field(f, data[sec.key]))));
  } else if (sec.type === 'array') {
    data[sec.key] ||= [];
    const arr = data[sec.key];
    arr.forEach((item, i) => ed.append(arrayItem(sec, arr, item, i)));
    ed.append(el('button', { class: 'btn add', onclick: () => {
      const item = sec.blank();
      arr.push(item);
      open.add(item);
      markDirty(); render();
    } }, `+ Add ${sec.label.replace(/s$/, '').toLowerCase()}`));
  } else if (sec.type === 'raw') {
    const ta = el('textarea', { class: 'raw', spellcheck: 'false' });
    ta.value = JSON.stringify(data, null, 2);
    const err = el('p', { class: 'note' }, 'Edit carefully. Click Apply to load these changes into the editor.');
    ed.append(ta, el('div', { class: 'row' },
      el('button', { class: 'btn', onclick: () => {
        try { data = JSON.parse(ta.value); markDirty(); err.textContent = 'Applied.'; renderTabs(); }
        catch (e) { err.textContent = 'Invalid JSON: ' + e.message; }
      } }, 'Apply'), err));
  }
}

function arrayItem(sec, arr, item, i) {
  const isOpen = open.has(item);
  const titleEl = el('span', { class: 'item-title' }, sec.itemTitle(item));
  const body = el('div', { class: 'item-body' }, ...sec.fields.map((f) => field(f, item, () => { titleEl.textContent = sec.itemTitle(item); })));
  const move = (d) => {
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    markDirty(); render();
  };
  return el('div', { class: `card item${isOpen ? ' open' : ''}` },
    el('div', { class: 'item-head' },
      el('button', { class: 'item-toggle', 'aria-expanded': String(isOpen), onclick: () => { isOpen ? open.delete(item) : open.add(item); render(); } }, el('span', { class: 'caret' }, isOpen ? '▾' : '▸'), titleEl),
      el('div', { class: 'item-tools' },
        el('button', { class: 'icon', title: 'Move up', 'aria-label': 'Move up', onclick: () => move(-1) }, '↑'),
        el('button', { class: 'icon', title: 'Move down', 'aria-label': 'Move down', onclick: () => move(1) }, '↓'),
        el('button', { class: 'icon danger', title: 'Delete', 'aria-label': 'Delete', onclick: () => {
          if (!confirm(`Delete "${sec.itemTitle(item)}"?`)) return;
          arr.splice(i, 1); markDirty(); render();
        } }, '✕'))),
    isOpen ? body : null);
}

function field(f, obj, onChange) {
  const id = uid('f');
  const changed = () => { markDirty(); onChange?.(); };
  let input;
  switch (f.type) {
    case 'textarea':
      input = el('textarea', { id, rows: 4 });
      input.value = obj[f.key] ?? '';
      input.addEventListener('input', () => { obj[f.key] = input.value; changed(); });
      break;
    case 'lines':
      input = el('textarea', { id, rows: 5 });
      input.value = (obj[f.key] || []).join('\n');
      input.addEventListener('input', () => { obj[f.key] = input.value.split('\n').map((s) => s.trim()).filter(Boolean); changed(); });
      break;
    case 'tags':
      input = el('input', { id, type: 'text' });
      input.value = (obj[f.key] || []).join(', ');
      input.addEventListener('input', () => { obj[f.key] = input.value.split(',').map((s) => s.trim()).filter(Boolean); changed(); });
      break;
    case 'checkbox':
      input = el('input', { id, type: 'checkbox' });
      input.checked = !!obj[f.key];
      input.addEventListener('change', () => { obj[f.key] = input.checked; changed(); });
      return el('label', { class: 'field check', for: id }, input, f.label);
    case 'select':
      input = el('select', { id }, ...f.options.map(([v, l]) => el('option', { value: v }, l)));
      input.value = obj[f.key] ?? f.options[0][0];
      input.addEventListener('change', () => { obj[f.key] = input.value; changed(); });
      break;
    case 'file': {
      input = el('input', { id, type: 'text', placeholder: '/uploads/file.png or https://…' });
      input.value = obj[f.key] ?? '';
      input.addEventListener('input', () => { obj[f.key] = input.value.trim(); changed(); });
      const picker = el('input', { type: 'file', accept: 'image/*,application/pdf', hidden: true });
      picker.addEventListener('change', async () => {
        const file = picker.files[0];
        if (!file) return;
        try {
          const url = await upload(file);
          input.value = url; obj[f.key] = url; changed();
        } catch (e) { alert(e.message); }
      });
      const wrap = el('div', { class: 'file-row' }, input,
        el('button', { class: 'btn', type: 'button', disabled: !canSave, title: canSave ? '' : 'Uploads work when running locally', onclick: () => picker.click() }, 'Upload'), picker);
      return el('div', { class: 'field' }, el('label', { for: id }, f.label), wrap, f.hint ? el('small', {}, f.hint) : null);
    }
    default:
      input = el('input', { id, type: f.type === 'url' ? 'url' : 'text' });
      input.value = obj[f.key] ?? '';
      input.addEventListener('input', () => { obj[f.key] = input.value; changed(); });
  }
  return el('div', { class: `field${f.advanced ? ' advanced' : ''}` }, el('label', { for: id }, f.label), input, f.hint ? el('small', {}, f.hint) : null);
}

// ---------- Persistence ----------
async function upload(file) {
  if (file.size > 8_000_000) throw new Error('File too large (max 8 MB).');
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const res = await fetch('/__admin/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, data: btoa(bin) }) });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error || 'Upload failed');
  return out.url;
}

async function save() {
  if (!canSave) return;
  $('#save').disabled = true;
  setStatus('Saving…');
  try {
    const res = await fetch('/__admin/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || 'Save failed');
    dirty = false;
    setStatus(`Saved ${new Date().toLocaleTimeString()}`, 'ok');
  } catch (e) {
    $('#save').disabled = false;
    setStatus(e.message, 'err');
  }
}

function download() {
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'content.json' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function init() {
  try {
    const res = await fetch('/__admin/status');
    canSave = res.ok && (await res.json()).canSave;
  } catch { canSave = false; }
  data = await loadContent();
  setStatus(canSave ? 'Connected — changes save to public/data/content.json' : 'Read-only: run `npm run dev` on your computer to save', canSave ? 'ok' : 'warn');
  $('#save').addEventListener('click', save);
  $('#download').addEventListener('click', download);
  $('#import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try { data = JSON.parse(await file.text()); markDirty(); render(); }
    catch (err) { alert('Invalid JSON file: ' + err.message); }
    e.target.value = '';
  });
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  });
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  render();
}

init().catch((e) => setStatus('Failed to load content: ' + e.message, 'err'));
