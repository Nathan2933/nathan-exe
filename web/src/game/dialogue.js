import { esc } from '../shared/content.js';
import { sfx } from './audio.js';

// Bottom-of-screen dialogue box with typewriter effect and contextual choices.
// Never blocks movement: walking away closes it.
// Strict rule: No double hyphens anywhere in dialogue, choices, or comments.

export class Dialogue {
  constructor(root) {
    this.root = root;
    this.queue = [];
    this.typing = null;
    this.onClose = null;
    this.onMemory = null;
    this.onAction = null;
    this.conversationSystem = null;
    this.saveRef = null;

    root.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-topic]');
      if (opt) return this.#choose(Number(opt.dataset.topic));
      if (e.target.closest('.dlg-close')) return this.close();
      this.advance();
    });
  }

  get open() { return !this.root.classList.contains('hidden'); }

  setConversationSystem(sys, save) {
    this.conversationSystem = sys;
    this.saveRef = save;
  }

  start(npc, { portrait, asked = new Set(), conversation = null } = {}) {
    this.npc = npc;
    this.portrait = portrait;
    this.asked = asked;

    if (conversation) {
      // Dynamic contextual conversation object
      this.queue = [...(conversation.lines || [])];
      this.topics = [...(conversation.topics || [])];
      this.rootTopics = [...this.topics];
    } else {
      // Standard or group scene format
      this.topics = (npc.topics || []).map((t) => {
        if (typeof t === 'object' && t !== null && t.q) return t;
        const [q, ...rest] = String(t).split('::');
        return { q: q.trim(), a: rest.join('::').trim() };
      }).filter((t) => t.q && (t.a || t.reply));
      this.rootTopics = [...this.topics];
      this.queue = (npc.lines || []).flatMap((l) => String(l).split(/\s*\/\/\s*/)).filter(Boolean);
    }

    this.root.classList.remove('hidden');
    this.#next();
  }

  advance() {
    if (!this.open) return;
    if (this.typing) { this.#finishTyping(); return; }
    if (this.queue.length) return this.#next();
    if (this.root.querySelector('[data-topic]')) return; // waiting for player choice
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

    // Record topic or trigger action callback if present
    if (t.id && this.conversationSystem && this.saveRef && this.npc?.id) {
      this.conversationSystem.recordTopic(this.saveRef, this.npc.id, t.id);
    }
    if (typeof t.onChoose === 'function') {
      try {
        t.onChoose(this.conversationSystem, this.saveRef, this.npc?.id);
      } catch (err) {
        console.warn('onChoose error:', err);
      }
    }

    // Trigger action immediately or on choice
    if (t.action) {
      this.onAction?.(t.action);
    }

    // Handle replies and branching follow-up choices
    const rawReply = t.reply ?? t.a ?? '';
    const lines = Array.isArray(rawReply)
      ? rawReply
      : String(rawReply).split(/\s*\/\/\s*/).filter(Boolean);

    this.queue = lines;

    // If this choice has follow-up options, switch topics to them
    if (t.followUps && t.followUps.length > 0) {
      this.topics = t.followUps;
    } else {
      // Remove the chosen topic from root topics so options evolve naturally
      this.rootTopics = this.rootTopics.filter((x) => x !== t && x.q !== t.q);
      this.topics = this.rootTopics;
    }

    this.#next();
  }

  #next() {
    let line = this.queue.shift() ?? '';
    const mem = line.match(/\[memory:([\w-]+)\]\s*$/);
    if (mem) {
      line = line.slice(0, mem.index).trim();
      this.onMemory?.(mem[1]);
    }
    const act = line.match(/\[action:([\w-]+)\]\s*$/);
    if (act) {
      line = line.slice(0, act.index).trim();
      this.onAction?.(act[1]);
    }
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
        <div class="dlg-name">${esc(n.name)}${n.role ? ` <span>${esc(n.role)}</span>` : ''}</div>
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
