// Verification for the shared conversation controller and the dialogue bank.
// Run: node tools/test-conversation.mjs
import { conversationSystem, CANONICAL_MAP } from '../src/game/conversation.js';
import { BANK, FLIGHT_CHOICE } from '../src/game/dialogue-bank.js';

let failed = 0, passed = 0;
const assert = (cond, msg) => { if (cond) { passed++; console.log(`PASS: ${msg}`); } else { failed++; console.error(`FAIL: ${msg}`); } };
const textOf = (l) => (typeof l === 'string' ? l : l.t);
const allText = (obj) => JSON.stringify(obj, (k, v) => (typeof v === 'function' ? undefined : v));

const REQUIRED = ['guru', 'prince', 'jeswin', 'arok', 'shabeer', 'harris', 'anu', 'shabesh', 'logeshwaran', 'thianesh', 'akshai', 'pranav', 'sathesh', 'naveen', 'sivasuthan'];

// ---- content shape ----
for (const id of REQUIRED) {
  const b = BANK[id];
  assert(!!b, `${id}: has a dialogue bank entry`);
  if (!b) continue;
  assert(b.first?.length >= 2, `${id}: first conversation`);
  assert(b.repeats?.length === 3, `${id}: exactly three repeat conversations`);
  assert(b.activity?.length >= 1, `${id}: activity-specific conversation`);
  assert(b.topics?.length >= 3, `${id}: selectable topics`);
  assert(typeof b.goodbye === 'string' && b.goodbye.length > 0, `${id}: goodbye line`);
  assert(!/--/.test(allText(b)), `${id}: no double hyphens`);
}

// ---- canonical ids: Tahiti and Island 01 versions share one conversation record ----
assert(CANONICAL_MAP.tahiti_sf3 === 'jeswin', 'tahiti_sf3 maps to jeswin');
assert(CANONICAL_MAP.piranav === 'pranav' && CANONICAL_MAP.tahiti_cf6 === 'pranav', 'Pranav ids share one record');
assert(CANONICAL_MAP.tahiti_cf3 === 'logeshwaran' && CANONICAL_MAP.logeshwaran === 'logeshwaran', 'Logesh ids share one record');

const build = (npcId, ctx = {}, save = {}) => conversationSystem.buildConversation({ id: npcId, name: npcId }, { npcId, level: 'tahiti', save, ...ctx });

// ---- first, then rotate repeats, then activity only when it matches ----
{
  const save = {};
  const first = await build('tahiti_sf1', {}, save);
  assert(textOf(first.lines[0]) === 'You taking the scooty out?', 'Guru first conversation opens as written');
  assert(first.lines[0].s === 'Nathan' && first.lines[1].s === undefined, 'speakers are marked: Nathan, then the character');
  const r1 = await build('tahiti_sf1', {}, save), r2 = await build('tahiti_sf1', {}, save), r3 = await build('tahiti_sf1', {}, save), r4 = await build('tahiti_sf1', {}, save);
  const open = (c) => textOf(c.lines[0]);
  assert(new Set([open(r1), open(r2), open(r3)]).size === 3, 'three repeats are all different before any repeats');
  assert(open(r4) === open(r1), 'rotation then starts over');
  const act = await build('tahiti_sf1', { activity: { act: 'coding' } }, save);
  assert(textOf(act.lines[0]) === 'Can I borrow you?', 'Guru coding conversation is used while coding');
  const again = await build('tahiti_sf1', { activity: { act: 'coding' } }, save);
  assert(textOf(again.lines[0]) !== 'Can I borrow you?', 'same activity opener is not shown twice in a row');
  const idle = await build('tahiti_sf1', { activity: { act: 'rest' } }, {});
  assert(textOf(idle.lines[0]) === 'You taking the scooty out?', 'no activity dialogue without the matching activity');
}

// ---- Jeswin ----
{
  const c = await build('tahiti_sf3', { activity: { act: 'drafting' } }, { npcMemory: { jeswin: { visitCount: 3, topics: [], events: [], firstDone: true } } });
  assert(textOf(c.lines[1]).includes('Hold this drawing flat'), 'Jeswin drafting conversation matches the brief');
  assert(c.topics.map((t) => t.q).join('|') === 'Show me the building|Explain the model|How\'s the bike?|Build with sand', 'Jeswin topics match the brief');
  assert(c.topics.every((t) => !t.action), 'Jeswin has no launch action that is not backed by a mechanic');
  assert(c.goodbye === "Come back later. I'll show you what I change.", 'Jeswin goodbye');
}

// ---- launch actions only where the mechanic exists; Talk never launches anything by itself ----
{
  const tah = await build('tahiti_cf1', {}, {});
  const isl = await build('anu', { level: 'island1' }, {});
  assert(tah.topics.some((t) => t.action === 'tahiti-basket'), 'Anu offers the hoops action on Tahiti');
  assert(!isl.topics.some((t) => t.action), 'no hoops action off Tahiti');
  assert(isl.topics.some((t) => t.q === 'Shoot some hoops'), 'Anu still has the conversational topic off Tahiti');
  for (const id of REQUIRED) {
    const c = await build(id === 'harris' ? 'harris' : id, { level: 'island1' }, {});
    assert(c.lines.every((l) => !l.action) && !('action' in c), `${id}: opening conversation never starts an activity`);
  }
}

// ---- Harris: correct destination, choice closes into the flight, nothing queued ----
{
  const isl = await build('harris', { level: 'island1' }, {});
  const f = isl.topics[0];
  assert(f.q === FLIGHT_CHOICE.tahiti.q && f.action === 'fly-tahiti', 'Harris offers "Let\'s fly to Tahiti." on Island 01');
  assert(Array.isArray(f.reply) && f.reply.length === 0, 'the flight choice has no timed final line');
  const home = await build('harris', { level: 'tahiti' }, {});
  assert(home.topics[0].action === 'fly-home', 'Harris offers the flight home on Tahiti');
  const term = await build('harris', { level: 'tahiti', harrisState: 'WAITING_FOR_NATHAN' }, { npcMemory: { harris: { visitCount: 5, topics: [], events: [], firstDone: true, last: 'rep:0', rep: 1 } } });
  assert(textOf(term.lines[0]) === 'Heading out?', 'Harris at the terminal asks "Heading out?"');
}

// ---- Anu's cake: only the given date ----
{
  const t = allText(BANK.anu);
  assert(t.includes('Twenty-sixth December'), 'Anu remembers the cake on 26 December');
  assert(!/chocolate|vanilla|birthday|flavou?r/i.test(t), 'no invented cake details');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
