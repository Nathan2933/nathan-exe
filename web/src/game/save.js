// "Play My Save File": progress persisted per visitor in localStorage.
const KEY = 'nathan-exe:save';
const LEGACY_KEY = 'nathan-exe:visited';
const VERSION = 1;

const blank = () => ({ v: VERSION, chapters: [], memories: [], minigames: [], talked: [], stamps: [], seconds: 0, pos: null, created: Date.now() });

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.v === VERSION) return { ...blank(), ...s };
    }
    // Migrate the earlier "visited" list
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    const s = blank();
    s.chapters = legacy.filter((id) => !id.includes(':'));
    return s;
  } catch {
    return blank();
  }
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked: progress lives for this tab only */ }
}

export function resetSave() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
  return blank();
}

export const addUnique = (arr, id) => (arr.includes(id) ? false : (arr.push(id), true));

export function formatTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
