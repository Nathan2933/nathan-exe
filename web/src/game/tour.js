// Quick tour: Montfort, Tomsk, TCE, Guild Hall, Garage.
// The tour only moves Nathan next to the real E interaction of each stop. The
// content itself is always opened by the visitor with E, through the existing UI.
const $ = (s) => document.querySelector(s);

export const TOUR_STOPS = [
  { id: 'montfort', label: 'Montfort', text: 'Press E here to see where it began.', district: 'lake-park' },
  { id: 'tomsk', label: 'Tomsk', text: 'Press E here to explore the Tomsk chapter.', district: 'winter-campus' },
  { id: 'tce', label: 'TCE', text: 'Press E here to see the college journey.', district: 'monsoon-campus' },
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

  const lastIndex = TOUR_STOPS.length - 1;

  function renderCard() {
    const s = TOUR_STOPS[index];
    const last = index === lastIndex;
    card.innerHTML = `<p class="tc-step">${s.label} · ${index + 1}/${TOUR_STOPS.length}</p>
      <p class="tc-text">${s.text}</p>
      <div class="tc-row"><button type="button" class="tour-btn primary" data-act="${last ? 'finish' : 'next'}">${last ? 'Finish tour' : 'Next'}</button>
      <button type="button" class="tour-btn" data-act="exit">Exit tour</button></div>`;
  }

  function showModal(html) {
    modal.innerHTML = html;
    modal.classList.remove('hidden');
    modalOpen = true;
    card.classList.add('hidden');
    setTimeout(() => modal.querySelector('.primary')?.focus({ preventScroll: true }), 30);
  }
  function hideModal() { modal.classList.add('hidden'); modal.innerHTML = ''; modalOpen = false; }

  function offer() {
    if (offered) return;
    offered = true;
    showModal(`<h2>Would you like a quick tour?</h2>
      <p>Five short stops: Nathan's journey, skills and key projects.</p>
      <div class="tm-row"><button type="button" class="tour-btn primary" data-act="take">Take the Tour</button>
      <button type="button" class="tour-btn" data-act="free">Explore Freely</button></div>`);
  }

  async function visit(i) {
    if (moving) return false;
    moving = true;
    card.classList.add('hidden');
    let ok = false;
    try { ok = await ctx.goTo(TOUR_STOPS[i]); } finally { moving = false; }
    if (ok) { index = i; renderCard(); }
    return ok;
  }

  async function start() {
    if (moving) return;
    hideModal();
    offered = true;
    const was = active, prev = index;
    active = true;
    if (await visit(0)) return;
    active = was; index = prev;
    if (active) renderCard();
  }

  function exit() { active = false; moving = false; card.classList.add('hidden'); }

  function finish() {
    active = false;
    card.classList.add('hidden');
    showModal(`<h2>Tour complete</h2>
      <p>Now explore freely. Meet the characters, visit more places and try the activities.</p>
      <div class="tm-row"><button type="button" class="tour-btn primary" data-act="done">Explore Freely</button></div>`);
  }

  function act(a) {
    if (a === 'take') return start();
    if (a === 'free' || a === 'done') return hideModal();
    if (a === 'next') return void visit(index + 1);
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

  function bind() {
    for (const el of [card, modal]) {
      el.addEventListener('click', (e) => {
        const t = e.target.closest('[data-act]');
        if (t) { e.preventDefault(); act(t.dataset.act); }
      });
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    $('#nav-tour')?.addEventListener('click', (e) => {
      e.preventDefault();
      $('#recruiter-bar')?.classList.remove('open');
      $('#menu-toggle')?.setAttribute('aria-expanded', 'false');
      if (!state.started || moving) return;
      start();
    });
  }

  return {
    bind, offerWhenReady, update, start, exit,
    get active() { return active; },
    get stop() { return active ? TOUR_STOPS[index] : null; },
    get modalOpen() { return modalOpen; },
    // debug / tests
    _act: act, _offer: offer,
  };
}
