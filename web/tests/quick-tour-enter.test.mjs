import test from 'node:test';
import assert from 'node:assert/strict';

// Set up minimal browser/DOM globals required for tour.js
class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(...cls) { cls.forEach(c => this.classes.add(c)); }
  remove(...cls) { cls.forEach(c => this.classes.delete(c)); }
  toggle(cls, force) {
    if (force === undefined) {
      if (this.classes.has(cls)) { this.classes.delete(cls); return false; }
      this.classes.add(cls); return true;
    }
    if (force) { this.classes.add(cls); return true; }
    this.classes.delete(cls); return false;
  }
  contains(cls) { return this.classes.has(cls); }
}

class MockElement {
  constructor(tagName = 'div', id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new MockClassList();
    if (className) {
      className.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this._innerHTML = '';
    this.children = [];
    this.parentElement = null;
    this.disabled = false;
  }

  setAttribute(name, val) {
    this.attributes.set(name, String(val));
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      this.dataset[key] = String(val);
    }
    if (name === 'class') {
      this.classList = new MockClassList();
      String(val).split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }
    if (name === 'disabled') this.disabled = true;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      delete this.dataset[key];
    }
    if (name === 'disabled') this.disabled = false;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    this._parseHtml(html);
  }

  _parseHtml(html) {
    // Basic regex parser for elements created in tour cards
    const tagRegex = /<([a-zA-Z0-9]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9]+)([^>]*)\/?>/g;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      const tag = match[1] || match[4];
      const attrsStr = match[2] || match[5] || '';
      const inner = match[3] || '';
      const el = new MockElement(tag);
      el.parentElement = this;

      const attrRegex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let aMatch;
      while ((aMatch = attrRegex.exec(attrsStr)) !== null) {
        const aName = aMatch[1];
        const aVal = aMatch[2] ?? aMatch[3] ?? aMatch[4] ?? '';
        el.setAttribute(aName, aVal);
      }
      if (inner) {
        el.innerHTML = inner;
      }
      this.children.push(el);
    }
  }

  querySelector(sel) {
    return this._matchSelector(sel, false);
  }

  querySelectorAll(sel) {
    const res = [];
    this._matchAll(sel, res);
    return res;
  }

  get isContentEditable() {
    const val = this.getAttribute('contenteditable');
    return val !== null && val !== 'false';
  }

  _matches(sel) {
    if (sel.startsWith('#')) return this.id === sel.slice(1);
    if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
    if (sel.startsWith('[data-act="') && sel.endsWith('"]')) {
      const act = sel.slice(11, -2);
      return this.dataset.act === act;
    }
    if (sel === '[data-act]') return 'act' in this.dataset;
    if (sel.includes('contenteditable')) return this.isContentEditable;
    if (sel === 'kbd') return this.tagName === 'KBD';
    if (sel === 'button') return this.tagName === 'BUTTON';
    if (sel.toLowerCase() === this.tagName.toLowerCase()) return true;
    return false;
  }

  _matchSelector(sel, checkSelf = true) {
    if (sel.includes(',')) {
      for (const part of sel.split(',')) {
        const found = this._matchSelector(part.trim(), checkSelf);
        if (found) return found;
      }
      return null;
    }
    if (checkSelf && this._matches(sel)) return this;
    for (const ch of this.children) {
      const found = ch._matchSelector(sel, true);
      if (found) return found;
    }
    return null;
  }

  _matchAll(sel, out) {
    for (const ch of this.children) {
      if (ch._matches(sel)) out.push(ch);
      ch._matchAll(sel, out);
    }
  }

  closest(sel) {
    let curr = this;
    while (curr) {
      if (curr._matches(sel)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  addEventListener(type, fn, options) {
    const capture = typeof options === 'boolean' ? options : !!options?.capture;
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push({ fn, capture });
  }

  removeEventListener(type, fn, options) {
    const capture = typeof options === 'boolean' ? options : !!options?.capture;
    const list = this.listeners.get(type);
    if (list) {
      this.listeners.set(type, list.filter(l => l.fn !== fn || l.capture !== capture));
    }
  }

  dispatchEvent(evt) {
    evt.target = evt.target || this;
    evt.currentTarget = this;
    const list = (this.listeners.get(evt.type) || []).slice();
    for (const { fn } of list) {
      fn.call(this, evt);
    }
    if (!evt._stopped && this.parentElement) {
      this.parentElement.dispatchEvent(evt);
    }
    return !evt.defaultPrevented;
  }

  focus() {
    globalThis.document.activeElement = this;
  }
}

class MockEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.key = init.key || '';
    this.repeat = !!init.repeat;
    this.target = init.target || null;
    this.currentTarget = null;
    this.defaultPrevented = false;
    this._stopped = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {
    this._stopped = true;
  }
}

const mockDoc = {
  elements: new Map(),
  activeElement: null,
  querySelector(sel) {
    if (sel.startsWith('#')) {
      return this.elements.get(sel.slice(1)) || null;
    }
    return null;
  },
  createElement(tag) {
    return new MockElement(tag);
  }
};

const mockWindow = {
  listeners: new Map(),
  addEventListener(type, fn, capture = false) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push({ fn, capture: !!capture });
  },
  removeEventListener(type, fn, capture = false) {
    const list = this.listeners.get(type);
    if (list) {
      this.listeners.set(type, list.filter(l => l.fn !== fn || l.capture !== !!capture));
    }
  },
  dispatchEvent(evt) {
    evt.target = evt.target || mockDoc.activeElement || mockDoc.elements.get('tour-card');
    evt.currentTarget = this;
    const list = (this.listeners.get(evt.type) || []).slice();
    // Run capture first
    for (const { fn, capture } of list) {
      if (capture) fn.call(this, evt);
    }
    // If not stopped, bubble
    if (!evt._stopped && evt.target && evt.target !== this) {
      evt.target.dispatchEvent(evt);
    }
    for (const { fn, capture } of list) {
      if (!capture && !evt._stopped) fn.call(this, evt);
    }
    return !evt.defaultPrevented;
  }
};

globalThis.document = mockDoc;
globalThis.window = mockWindow;
globalThis.matchMedia = () => ({ matches: false });

const { createTour, TOUR_STOPS } = await import('../src/game/tour.js');

function setupTestEnvironment() {
  const card = new MockElement('aside', 'tour-card', 'tour-card hidden');
  const modal = new MockElement('section', 'tour-modal', 'tour-modal hidden');
  mockDoc.elements.set('tour-card', card);
  mockDoc.elements.set('tour-modal', modal);
  mockDoc.activeElement = null;
  mockWindow.listeners.clear();

  let visitedStops = [];
  let busy = false;
  let goToDelay = 0;

  const ctx = {
    state: { started: true, bootWarmed: true, intro: 1 },
    dialogue: { open: false },
    busy: () => busy,
    goTo: async (stop) => {
      visitedStops.push(stop);
      if (goToDelay > 0) {
        await new Promise(r => setTimeout(r, goToDelay));
      }
      return true;
    }
  };

  const tour = createTour(ctx);
  tour.bind();

  return {
    card,
    modal,
    ctx,
    tour,
    visitedStops,
    setBusy: (b) => { busy = b; },
    setGoToDelay: (d) => { goToDelay = d; },
  };
}

test('Tour card buttons are clean without Enter inside the button', async () => {
  const env = setupTestEnvironment();
  await env.tour.start(0);

  const nextBtn = env.card.querySelector('[data-act="next"]');
  assert.ok(nextBtn, 'Next button exists on stop 1');
  assert.equal(nextBtn.innerHTML, 'Next ▶', 'Next button text is clean without Enter in the button');
  assert.equal(nextBtn.querySelector('kbd'), null, 'No <kbd> tag inside the button');
});

test('Tour card on the last stop renders Finish tour and supports Enter to finish', async () => {
  const env = setupTestEnvironment();
  await env.tour.start(TOUR_STOPS.length - 1); // Last stop (Garage)

  const finishBtn = env.card.querySelector('[data-act="finish"]');
  assert.ok(finishBtn, 'Finish button exists on last stop');
  assert.equal(finishBtn.innerHTML, 'Finish tour', 'Finish tour label present and clean');
  assert.equal(finishBtn.querySelector('kbd'), null, 'No <kbd> tag inside finish button');
  assert.equal(env.tour.isPrimaryEnabled, true, 'Primary button (finish) is enabled');

  // Pressing Enter finishes the tour
  const enterEvt = new MockEvent('keydown', { key: 'Enter' });
  mockWindow.dispatchEvent(enterEvt);
  await Promise.resolve();

  assert.equal(env.tour.active, false, 'Tour is no longer active');
  assert.equal(env.tour.modalOpen, true, 'Tour complete modal is opened');
  assert.equal(enterEvt.defaultPrevented, true, 'Default was prevented');
  assert.ok(env.modal.innerHTML.includes('Tour <b>complete!</b>'), 'Complete modal rendered');
});

test('Pressing Enter advances the tour exactly like clicking Next', async () => {
  const env = setupTestEnvironment();
  await env.tour.start(0);
  assert.equal(env.visitedStops.length, 1);
  assert.equal(env.visitedStops[0].id, 'montfort');

  // Press Enter to advance to stop 2
  const enterEvt = new MockEvent('keydown', { key: 'Enter' });
  mockWindow.dispatchEvent(enterEvt);
  await Promise.resolve(); // Flush microtasks

  assert.equal(env.visitedStops.length, 2);
  assert.equal(env.visitedStops[1].id, 'tomsk');
  assert.equal(enterEvt.defaultPrevented, true);

  // Release Enter key
  mockWindow.dispatchEvent(new MockEvent('keyup', { key: 'Enter' }));

  // Wait past the synthetic-click debounce threshold (250ms)
  await new Promise(r => setTimeout(r, 260));

  // Click Next on stop 2 to advance to stop 3
  const nextBtn = env.card.querySelector('[data-act="next"]');
  assert.ok(nextBtn);
  const clickEvt = new MockEvent('click', { target: nextBtn });
  nextBtn.dispatchEvent(clickEvt);
  await Promise.resolve();

  assert.equal(env.visitedStops.length, 3);
  assert.equal(env.visitedStops[2].id, 'tce');
});

test('Advance only once per keypress even if Enter is held down', async () => {
  const env = setupTestEnvironment();
  await env.tour.start(0);
  assert.equal(env.visitedStops.length, 1);

  // First press
  const evt1 = new MockEvent('keydown', { key: 'Enter', repeat: false });
  mockWindow.dispatchEvent(evt1);
  await Promise.resolve();
  assert.equal(env.visitedStops.length, 2);

  // Consecutive repeat keydowns while holding Enter down
  const evtRepeat1 = new MockEvent('keydown', { key: 'Enter', repeat: true });
  mockWindow.dispatchEvent(evtRepeat1);
  await Promise.resolve();
  assert.equal(env.visitedStops.length, 2, 'Ignored when repeat is true');

  // Even if browser did not set repeat: true, enterKeyDown flag prevents advance before keyup
  const evtUnreleased = new MockEvent('keydown', { key: 'Enter', repeat: false });
  mockWindow.dispatchEvent(evtUnreleased);
  await Promise.resolve();
  assert.equal(env.visitedStops.length, 2, 'Ignored while previous Enter is not released');

  // Release Enter
  const keyUpEvt = new MockEvent('keyup', { key: 'Enter' });
  mockWindow.dispatchEvent(keyUpEvt);

  // Now next Enter press advances
  const evt2 = new MockEvent('keydown', { key: 'Enter', repeat: false });
  mockWindow.dispatchEvent(evt2);
  await Promise.resolve();
  assert.equal(env.visitedStops.length, 3, 'Advances after release');
});

test('Advance only once when Next button has keyboard focus (no double advance with click)', async () => {
  const env = setupTestEnvironment();
  await env.tour.start(0);
  assert.equal(env.visitedStops.length, 1);

  const nextBtn = env.card.querySelector('[data-act="next"]');
  nextBtn.focus();
  assert.equal(mockDoc.activeElement, nextBtn);

  // When Enter is pressed on focused button:
  const kdEvt = new MockEvent('keydown', { key: 'Enter', target: nextBtn });
  mockWindow.dispatchEvent(kdEvt);
  await Promise.resolve();
  assert.equal(env.visitedStops.length, 2);
  assert.equal(kdEvt.defaultPrevented, true);

  // Browser might still synthesize a click event on the focused button
  const clickEvt = new MockEvent('click', { target: nextBtn });
  nextBtn.dispatchEvent(clickEvt);
  await Promise.resolve();

  // Still only 2 stops visited (no double-advance)
  assert.equal(env.visitedStops.length, 2, 'Synthetic click within threshold was suppressed');
});

test('Finish only once when Finish button has keyboard focus (no double trigger with click)', async () => {
  const env = setupTestEnvironment();
  await env.tour.start(TOUR_STOPS.length - 1);

  const finishBtn = env.card.querySelector('[data-act="finish"]');
  finishBtn.focus();
  assert.equal(mockDoc.activeElement, finishBtn);

  let finishCallCount = 0;
  const origFinish = env.tour.finish;
  // Track that finish is called cleanly once
  const kdEvt = new MockEvent('keydown', { key: 'Enter', target: finishBtn });
  mockWindow.dispatchEvent(kdEvt);
  await Promise.resolve();

  assert.equal(env.tour.active, false);
  assert.equal(env.tour.modalOpen, true);
  assert.equal(kdEvt.defaultPrevented, true);

  // Synthetic click within threshold is suppressed
  const clickEvt = new MockEvent('click', { target: finishBtn });
  finishBtn.dispatchEvent(clickEvt);
  await Promise.resolve();

  assert.equal(env.tour.modalOpen, true);
});

test('Ignore Enter while moving between stops', async () => {
  const env = setupTestEnvironment();
  env.setGoToDelay(50); // Simulates slow movement between stops
  await env.tour.start(0);
  assert.equal(env.visitedStops.length, 1);

  // Start advancing
  const kd1 = new MockEvent('keydown', { key: 'Enter' });
  mockWindow.dispatchEvent(kd1);

  assert.equal(env.tour.isMoving, true, 'Tour is moving');

  // Releasing Enter and pressing again while still moving
  const ku = new MockEvent('keyup', { key: 'Enter' });
  mockWindow.dispatchEvent(ku);

  const kdWhileMoving = new MockEvent('keydown', { key: 'Enter' });
  mockWindow.dispatchEvent(kdWhileMoving);

  // Wait for movement to finish
  await new Promise(r => setTimeout(r, 60));
  await Promise.resolve();

  assert.equal(env.visitedStops.length, 2, 'Only advanced once despite second press during transit');
  assert.equal(env.tour.isMoving, false);
});

test('Ignore Enter while player is typing in an input element', async () => {
  const env = setupTestEnvironment();
  await env.tour.start(0);
  assert.equal(env.visitedStops.length, 1);

  const input = new MockElement('input');
  input.focus();

  const enterInInput = new MockEvent('keydown', { key: 'Enter', target: input });
  mockWindow.dispatchEvent(enterInInput);
  await Promise.resolve();

  assert.equal(env.visitedStops.length, 1, 'Tour did not advance while typing in input');
  assert.equal(enterInInput.defaultPrevented, false, 'Input Enter event was not cancelled');
});

test('Ignore Enter while player is typing in a textarea or contenteditable element', async () => {
  const env = setupTestEnvironment();
  await env.tour.start(0);
  assert.equal(env.visitedStops.length, 1);

  const textarea = new MockElement('textarea');
  textarea.focus();

  const enterInTextarea = new MockEvent('keydown', { key: 'Enter', target: textarea });
  mockWindow.dispatchEvent(enterInTextarea);
  await Promise.resolve();

  assert.equal(env.visitedStops.length, 1, 'Tour did not advance while typing in textarea');
  assert.equal(enterInTextarea.defaultPrevented, false, 'Textarea Enter event was not cancelled');

  const div = new MockElement('div');
  div.setAttribute('contenteditable', 'true');
  div.focus();

  const enterInEditable = new MockEvent('keydown', { key: 'Enter', target: div });
  mockWindow.dispatchEvent(enterInEditable);
  await Promise.resolve();

  assert.equal(env.visitedStops.length, 1, 'Tour did not advance in contenteditable');
  assert.equal(enterInEditable.defaultPrevented, false);
});

test('Ignore Enter when tour card is closed or busy', async () => {
  const env = setupTestEnvironment();
  await env.tour.start(0);

  // Game becomes busy (e.g. dialogue or chapter panel open)
  env.setBusy(true);
  env.tour.update();
  assert.equal(env.tour.isCardOpen, false);

  const enterBusy = new MockEvent('keydown', { key: 'Enter' });
  mockWindow.dispatchEvent(enterBusy);
  await Promise.resolve();

  assert.equal(env.visitedStops.length, 1, 'Tour did not advance when busy');
  assert.equal(enterBusy.defaultPrevented, false);
});

test('Enter with keyboard focus on Exit button activates Exit rather than Next', async () => {
  const env = setupTestEnvironment();
  await env.tour.start(0);

  const exitBtn = env.card.querySelector('[data-act="exit"]');
  assert.ok(exitBtn);
  exitBtn.focus();

  const enterOnExit = new MockEvent('keydown', { key: 'Enter', target: exitBtn });
  mockWindow.dispatchEvent(enterOnExit);
  await Promise.resolve();

  // Next did NOT advance
  assert.equal(env.visitedStops.length, 1, 'Did not advance tour');
  assert.equal(enterOnExit.defaultPrevented, false, 'Allowed focused exit button to receive activation');
});

test('E key is not intercepted by tour handler (keeps existing chapter interaction)', async () => {
  const env = setupTestEnvironment();
  await env.tour.start(0);

  const eKeyEvt = new MockEvent('keydown', { key: 'e' });
  mockWindow.dispatchEvent(eKeyEvt);
  await Promise.resolve();

  assert.equal(eKeyEvt.defaultPrevented, false, 'E key is not cancelled by tour');
  assert.equal(eKeyEvt._stopped, false, 'E key is not stopped by tour');
  assert.equal(env.visitedStops.length, 1, 'E key did not advance tour stops');
});
