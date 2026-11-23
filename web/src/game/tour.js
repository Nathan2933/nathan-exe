// Quick tour: Montfort, Tomsk, TCE, Guild Hall, Garage.
// The tour only moves Nathan next to the real E interaction of each stop. The
// content itself is always opened by the visitor with E, through the existing UI.
const $ = (s) => document.querySelector(s);

export const TOUR_STOPS = [
  { id: 'montfort', label: 'St. Montfort School', text: 'Press E here to see where it began.', district: 'lake-park' },
  { id: 'tomsk', label: 'Tomsk State University, Russia', text: 'Press E here to explore the Tomsk chapter.', district: 'winter-campus' },
  { id: 'tce', label: 'TCE, Madurai', text: 'Press E here to see the college journey.', district: 'monsoon-campus' },
  { id: 'guild', label: 'Guild Hall', text: 'Press E here for skills and achievements.', district: 'signal-tower' },
  { id: 'garage', label: 'Garage', text: 'Press E at the glowing project stations. Start with the featured ones.', district: 'garage' },
];

/** The real main interactable of a stop: a chapter spot, or for the Garage a featured project station. */
export function findStopInteractable(stop, interactables, content) {
  if (stop.district === 'garage') {
    const stations = interactables.filter((i) => i.kind === 'project');
    const featured = (content.projects || []).filter((p) => p.featured).map((p) => p.id);
    return stations.find((i) => featured.includes(i.projectId)) || stations[0] || null;
  }
  return interactables.find((i) => i.kind === 'chapter' && i.district === stop.district) || null;
}

/**
 * ctx: { state, dialogue, goTo(stop) -> Promise<boolean>, busy() -> boolean }
 * Nothing here is saved: the choice is offered once per page load.
 */
export function createTour(ctx) {
  const { state, dialogue } = ctx;
  const card = $('#tour-card'), modal = $('#tour-modal');
  let active = false, index = 0, offered = false, modalOpen = false, moving = false;
  let bound = false, enterKeyDown = false, lastEnterTime = 0;

  const lastIndex = TOUR_STOPS.length - 1;

  function renderCard() {
    const s = TOUR_STOPS[index];
    const last = index === lastIndex;
    card.innerHTML = `<div class="hw-banner"><span class="hw-press">STOP ${index + 1}/${TOUR_STOPS.length}</span><p class="tc-step">${s.label}</p></div>
      <p class="tc-text">${s.text}</p>
      <div class="tc-row"><button type="button" class="tour-btn primary hw-btn" data-act="${last ? 'finish' : 'next'}">${last ? 'Finish tour' : 'Next ▶'}</button>
      <button type="button" class="tour-btn hw-btn alt" data-act="exit">Exit tour</button></div>`;
  }

  function showModal(html) {
    modal.innerHTML = html;
    modal.classList.add('hw');
    modal.classList.remove('hidden');
    modalOpen = true;
    card.classList.add('hidden');
    setTimeout(() => modal.querySelector('.primary')?.focus({ preventScroll: true }), 30);
  }
  function hideModal() { modal.classList.remove('hw'); modal.classList.add('hidden'); modal.innerHTML = ''; modalOpen = false; }

  const touch = matchMedia('(pointer: coarse)').matches;

  /** Step 1: what this is and how to play. Step 2: the tour choice. */
  function offer() {
    if (offered) return;
    offered = true;
    const keys = (k) => k.map((x) => `<kbd>${x}</kbd>`).join('');
    const row = (ic, keysHtml, label) => `<li><span class="hw-ic" aria-hidden="true">${ic}</span><span class="hw-keys">${keysHtml}</span><span class="hw-lbl">${label}</span></li>`;
    showModal(`<div class="hw-banner"><span class="hw-press">PRESS START</span><h2>Welcome to <b>NATHAN</b><i>.EXE</i></h2></div>
      <p class="hw-lead">This isn't a normal website. It's a <b>playable portfolio</b>: walk Nathan around the island and discover his story, skills and projects.</p>
      <p class="hw-title">★ HOW TO PLAY ★</p>
      <ul class="hw-list">
        ${touch
          ? row('👆', '<kbd>TAP</kbd>', 'the ground to <b>walk</b>') + row('◆', '<kbd>◆</kbd>', 'near a glow to <b>interact</b>') + row('☰', '<kbd>MENU</kbd>', 'Resume, Projects, Contact')
          : row('🏃', keys(['W', 'A', 'S', 'D']), 'or click the ground to <b>walk</b>') + row('✨', keys(['E']), 'near a glow to <b>interact</b>') + row('⭐', keys(['Space']) + keys(['M']) + keys(['H']), 'jump · map · help')}
      </ul>
      <p class="hw-tip">In a hurry? The top menu jumps straight to Resume, Projects and Contact.</p>
      <div class="tm-row"><button type="button" class="tour-btn primary hw-go" data-act="howto-next">Got it! ▶</button></div>`);
  }

  function offerTour() {
    showModal(`<div class="hw-banner"><span class="hw-press">STEP 2 OF 2</span><h2>Quick <b>tour</b>?</h2></div>
      <p class="hw-lead">Five short stops: Nathan's journey, skills and key projects. At each stop the game walks you there, then you press ${touch ? '◆' : 'E'} to open it.</p>
      <div class="tm-row"><button type="button" class="tour-btn primary hw-btn" data-act="take">Take the Tour</button>
      <button type="button" class="tour-btn hw-btn alt" data-act="free">Explore Freely</button></div>`);
  }

  function isCardOpen() {
    return active && !modalOpen && !moving && !ctx.busy() && !card.classList.contains('hidden');
  }

  function getPrimaryBtn() {
    return card.querySelector('[data-act="next"]') || card.querySelector('[data-act="finish"]');
  }

  function isPrimaryEnabled() {
    const btn = getPrimaryBtn();
    return Boolean(btn && !btn.disabled && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true');
  }

  function isNextEnabled() {
    const nextBtn = card.querySelector('[data-act="next"]');
    return Boolean(nextBtn && !nextBtn.disabled && !nextBtn.hasAttribute('disabled') && nextBtn.getAttribute('aria-disabled') !== 'true');
  }

  function isFinishEnabled() {
    const finishBtn = card.querySelector('[data-act="finish"]');
    return Boolean(finishBtn && !finishBtn.disabled && !finishBtn.hasAttribute('disabled') && finishBtn.getAttribute('aria-disabled') !== 'true');
  }

  function isTyping(e) {
    const target = e?.target;
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const isInput = (el) => el && (
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable ||
      el.getAttribute?.('contenteditable') === 'true' ||
      el.getAttribute?.('contenteditable') === '' ||
      el.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
    );
    return Boolean(isInput(target) || isInput(activeEl));
  }

  async function visit(i) {
    if (moving) return false;
    moving = true;
    card.classList.add('hidden');
    let ok = false;
    try { ok = await ctx.goTo(TOUR_STOPS[i]); } finally { moving = false; }
    if (ok) { index = i; renderCard(); update(); }
    return ok;
  }

  async function start(at = 0) {
    if (moving) return;
    hideModal();
    offered = true;
    const was = active, prev = index;
    active = true;
    if (await visit(Math.max(0, Math.min(lastIndex, at | 0)))) return;
    active = was; index = prev;
    if (active) renderCard();
  }

  function exit() { active = false; moving = false; enterKeyDown = false; card.classList.add('hidden'); }

  function finish() {
    active = false;
    moving = false;
    enterKeyDown = false;
    card.classList.add('hidden');
    showModal(`<div class="hw-banner"><span class="hw-press">LEVEL CLEAR</span><h2>Tour <b>complete!</b></h2></div>
      <p class="hw-lead">Now explore freely. Meet the characters, visit more places and try the activities.</p>
      <div class="tm-row"><button type="button" class="tour-btn primary hw-btn" data-act="done">Explore Freely</button></div>`);
  }

  function handleNext() {
    if (moving) return;
    return void visit(index + 1);
  }

  function act(a) {
    if (a === 'howto-next') return offerTour();
    if (a === 'take') return start();
    if (a === 'free' || a === 'done') return hideModal();
    if (a === 'next') return handleNext();
    if (a === 'finish') return finish();
    if (a === 'exit') return exit();
  }

  /** The tour card never sits on top of other content: it hides while anything else is open. */
  function update() {
    if (!active || modalOpen) return;
    const hide = moving || ctx.busy();
    card.classList.toggle('hidden', hide);
  }

  /** Called when the game is ready: shows the one-time choice. */
  function offerWhenReady() {
    const tick = () => {
      if (offered) return;
      if (state.started && state.bootWarmed && state.intro >= 1 && !ctx.busy()) offer();
      else setTimeout(tick, 400);
    };
    setTimeout(tick, 800);
  }

  function onKeyDown(e) {
    if (e.key !== 'Enter') return;
    if (e.repeat || enterKeyDown) {
      if (isCardOpen() && isPrimaryEnabled()) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (moving || isTyping(e)) return;
    const focusedExit = e.target?.closest?.('[data-act="exit"]') || document.activeElement?.closest?.('[data-act="exit"]');
    if (focusedExit) return;
    if (isCardOpen() && isPrimaryEnabled()) {
      const primaryBtn = getPrimaryBtn();
      const action = primaryBtn?.dataset?.act;
      if (!action) return;
      enterKeyDown = true;
      lastEnterTime = performance.now();
      e.preventDefault();
      e.stopPropagation();
      act(action);
    }
  }

  function onKeyUp(e) {
    if (e.key === 'Enter') {
      enterKeyDown = false;
    }
  }

  function onBlur() {
    enterKeyDown = false;
  }

  function bind() {
    if (bound) return;
    bound = true;
    for (const el of [card, modal]) {
      el.addEventListener('click', (e) => {
        const t = e.target.closest('[data-act]');
        if (!t) return;
        if ((t.dataset.act === 'next' || t.dataset.act === 'finish') && performance.now() - lastEnterTime < 250) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        act(t.dataset.act);
      });
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    $('#nav-tour')?.addEventListener('click', (e) => {
      e.preventDefault();
      $('#recruiter-bar')?.classList.remove('open');
      $('#menu-toggle')?.setAttribute('aria-expanded', 'false');
      if (!state.started || moving) return;
      start(0);
    });
  }

  return {
    bind, offerWhenReady, update, start, exit, finish,
    get active() { return active; },
    get stop() { return active ? TOUR_STOPS[index] : null; },
    get modalOpen() { return modalOpen; },
    get isCardOpen() { return isCardOpen(); },
    get isPrimaryEnabled() { return isPrimaryEnabled(); },
    get isNextEnabled() { return isNextEnabled(); },
    get isFinishEnabled() { return isFinishEnabled(); },
    get isMoving() { return moving; },
    next: handleNext,
    // debug / tests
    _act: act, _offer: offer, _handleKeyDown: onKeyDown, _handleKeyUp: onKeyUp,
  };
}
