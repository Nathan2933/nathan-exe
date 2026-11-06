import { esc } from '../shared/content.js';
import { sfx } from './audio.js';

// Bottom-of-screen dialogue box with a typewriter effect, speaker portrait and
// optional topic choices. Never blocks movement: walking away closes it.
//
// NPC content shape (content.json → npcs[]):
//   { id, name, role, district, outfit, lines: [..], topics: ["Question :: answer text", ...] }
// An answer may end with "[memory:some-id]" to unlock that memory, or with
// "[action:piece-id]" to start that prop's interaction (e.g. a mini challenge).

export class Dialogue {
  constructor(root) {
    this.root = root;
    this.queue = [];
    this.typing = null;
    this.onClose = null;
    this.onMemory = null;
    root.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-topic]');
      if (opt) return this.#choose(Number(opt.dataset.topic));
      if (e.target.closest('.dlg-close')) return this.close();
      this.advance();
    });
  }

  get open() { return !this.root.classList.contains('hidden'); }

  start(npc, { portrait, asked = new Set() } = {}) {
    this.npc = npc;
    this.portrait = portrait;
    this.asked = asked;
    this.topics = (npc.topics || []).map((t) => {
      const [q, ...rest] = String(t).split('::');
      return { q: q.trim(), a: rest.join('::').trim() };
    }).filter((t) => t.q && t.a);
    this.queue = (npc.lines || []).flatMap((l) => String(l).split(/\s*\/\/\s*/)).filter(Boolean);
    this.root.classList.remove('hidden');
    this.#next();
  }

  advance() {
    if (!this.open) return;
    if (this.typing) { this.#finishTyping(); return; }
    if (this.queue.length) return this.#next();
    if (this.root.querySelector('[data-topic]')) return; // waiting for a choice
    this.close();
  }

  close() {
    if (!this.open) return;
    clearInterval(this.typing);
    this.typing = null;
    this.root.classList.add('hidden');
    this.onClose?.();
  }

  #choose(i) {
    const t = this.topics[i];
    if (!t) return;
    this.asked.add(t.q);
    const lines = t.a.split(/\s*\/\/\s*/).filter(Boolean);
    this.queue = lines;
    this.#next();
  }

  #next() {
    let line = this.queue.shift() ?? '';
    const mem = line.match(/\[memory:([\w-]+)\]\s*$/);
    if (mem) { line = line.slice(0, mem.index).trim(); this.onMemory?.(mem[1]); }
    const act = line.match(/\[action:([\w-]+)\]\s*$/);
    if (act) { line = line.slice(0, act.index).trim(); this.onAction?.(act[1]); }
    this.#render(line, !this.queue.length);
  }

  #render(text, last) {
    const n = this.npc;
    const choices = last && this.topics.length
      ? `<div class="dlg-topics">${this.topics.map((t, i) => `<button type="button" data-topic="${i}" class="${this.asked.has(t.q) ? 'asked' : ''}">${esc(t.q)}</button>`).join('')}<button type="button" class="dlg-close">Bye</button></div>`
      : '';
    this.root.innerHTML = `
      <div class="dlg-portrait" style="--npc:${esc(n.color || '#1e1b2e')}">${this.portrait ? `<img src="${this.portrait}" alt="">` : esc((n.name || '?')[0])}</div>
      <div class="dlg-body">
        <div class="dlg-name">${esc(n.name)}${n.role ? ` <span>${esc(n.role)}</span>` : ''}${n.scripted ? '<em class="dlg-scripted" title="Written for the game, not a real quote">scripted</em>' : ''}</div>
        <p class="dlg-text" aria-live="polite"></p>
        ${choices}
        <div class="dlg-more">${last && !choices ? 'close ▸' : last ? '' : 'next ▸'}</div>
      </div>`;
    const p = this.root.querySelector('.dlg-text');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { p.textContent = text; return; }
    let i = 0;
    this.full = text;
    this.textEl = p;
    clearInterval(this.typing);
    this.typing = setInterval(() => {
      i += 2;
      p.textContent = text.slice(0, i);
      if (i % 6 === 0) sfx.talk();
      if (i >= text.length) this.#finishTyping();
    }, 16);
  }

  #finishTyping() {
    clearInterval(this.typing);
    this.typing = null;
    if (this.textEl) this.textEl.textContent = this.full;
  }
}
