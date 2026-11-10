// Comprehensive verification suite for the Natural NPC Conversation System
// Strict rule: No double hyphens anywhere in dialogue, choices, or comments.

import { conversationSystem, CANONICAL_MAP } from '../src/game/conversation.js';

const CHAR_IDS = [
  // Vanderlinde
  'guru',
  'tahiti_sf1',
  'prince',
  'tahiti_sf2',
  'tahiti_sf3', // jeswin
  'tahiti_sf4', // arok
  'shabeer',
  'tahiti_sf5',
  'harris',
  // Euphonium
  'akshai',
  'tahiti_cf5',
  'logeshwaran',
  'tahiti_cf3',
  'piranav',
  'tahiti_cf6',
  'shabesh',
  'tahiti_cf2',
  'tahiti_cf7', // sathesh
  'thianesh',
  'tahiti_cf4',
  'naveen',
  'tahiti_cf8',
  'tahiti_cf9', // sivasuthan
  'anu',
  'tahiti_cf1',
  // Pop culture
  'soap',
  'cal',
  'vesper',
  'skip',
  'hale',
  'ollie',
];

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    passedTests++;
    console.log(`PASS: ${message}`);
  }
}

async function runTests() {
  console.log('Starting NPC Conversation System verification...\n');

  // Test 1: Every character generates contextual dialogue and choices
  for (const npcId of CHAR_IDS) {
    const save = { npcMemory: {} };
    const ctx = {
      npcId,
      level: npcId.startsWith('tahiti_') ? 'tahiti' : 'island1',
      district: 'test-district',
      save,
      activity: null,
      mount: null,
    };
    const def = { id: npcId, name: npcId };
    const conv = await conversationSystem.buildConversation(def, ctx);

    assert(conv && conv.lines && conv.lines.length > 0, `${npcId}: generates greeting lines`);
    assert(conv.topics && conv.topics.length > 0, `${npcId}: generates conversation choices`);

    // Verify all text is English and contains no double hyphens
    for (const line of conv.lines) {
      assert(!line.includes('--'), `${npcId}: greeting has no double hyphens`);
    }
    for (const t of conv.topics) {
      assert(!t.q.includes('--'), `${npcId}: choice prompt "${t.q}" has no double hyphens`);
      const reply = t.reply || t.a || '';
      assert(!reply.includes('--'), `${npcId}: reply has no double hyphens`);
    }
  }

  // Test 2: Contextual Activity Sensitivity
  // 2a. Arok streaming activity
  {
    const save = { npcMemory: {} };
    const conv = await conversationSystem.buildConversation(
      { id: 'tahiti_sf4', name: 'Arok' },
      { npcId: 'tahiti_sf4', level: 'tahiti', activity: { act: 'stream' }, save }
    );
    const greetingText = conv.lines.join(' ');
    assert(
      greetingText.toLowerCase().includes('live') || greetingText.toLowerCase().includes('chat'),
      `Arok in stream mode acknowledges live stream / chat: "${greetingText}"`
    );
  }

  // 2b. Jeswin drafting activity
  {
    const save = { npcMemory: {} };
    const conv = await conversationSystem.buildConversation(
      { id: 'tahiti_sf3', name: 'Jeswin' },
      { npcId: 'tahiti_sf3', level: 'tahiti', activity: { act: 'drafting' }, save }
    );
    const greetingText = conv.lines.join(' ');
    assert(
      greetingText.toLowerCase().includes('blueprint') || greetingText.toLowerCase().includes('load-bearing') || greetingText.toLowerCase().includes('pavilion') || greetingText.toLowerCase().includes('structural') || greetingText.toLowerCase().includes('roofline'),
      `Jeswin in drafting mode discusses architecture / blueprints: "${greetingText}"`
    );
  }

  // 2c. Guru with scooter mount
  {
    const save = { npcMemory: {} };
    const conv = await conversationSystem.buildConversation(
      { id: 'guru', name: 'Guru' },
      { npcId: 'guru', level: 'island1', mount: 'scooty', save }
    );
    const greetingText = conv.lines.join(' ');
    assert(
      greetingText.toLowerCase().includes('scooty') || greetingText.toLowerCase().includes('zest'),
      `Guru acknowledges riding his blue scooty: "${greetingText}"`
    );
  }

  // 2d. Thianesh at feast table
  {
    const save = { npcMemory: {} };
    const conv = await conversationSystem.buildConversation(
      { id: 'tahiti_cf4', name: 'Thianish' },
      { npcId: 'tahiti_cf4', level: 'tahiti', activity: { act: 'feast' }, save }
    );
    const greetingText = conv.lines.join(' ');
    assert(
      greetingText.toLowerCase().includes('snack') || greetingText.toLowerCase().includes('eating') || greetingText.toLowerCase().includes('feast'),
      `Thianesh at feast table acknowledges eating contest / food: "${greetingText}"`
    );
  }

  // 2e. Anu at basketball court
  {
    const save = { npcMemory: {} };
    const conv = await conversationSystem.buildConversation(
      { id: 'tahiti_cf1', name: 'Anu' },
      { npcId: 'tahiti_cf1', level: 'tahiti', activity: { act: 'hoop' }, save }
    );
    const greetingText = conv.lines.join(' ');
    assert(
      greetingText.toLowerCase().includes('court') || greetingText.toLowerCase().includes('basketball') || greetingText.toLowerCase().includes('shots') || greetingText.toLowerCase().includes('net') || greetingText.toLowerCase().includes('shootout') || greetingText.toLowerCase().includes('three-point'),
      `Anu on basketball court acknowledges basketball challenge: "${greetingText}"`
    );
  }

  // 2f. Sathesh at photo booth
  {
    const save = { npcMemory: {} };
    const conv = await conversationSystem.buildConversation(
      { id: 'tahiti_cf7', name: 'Sathesh Kumar' },
      { npcId: 'tahiti_cf7', level: 'tahiti', activity: { act: 'photo_sa' }, save }
    );
    const greetingText = conv.lines.join(' ');
    assert(
      greetingText.toLowerCase().includes('photo') || greetingText.toLowerCase().includes('golden hour') || greetingText.toLowerCase().includes('lens') || greetingText.toLowerCase().includes('balcony'),
      `Sathesh near photo booth acknowledges photography: "${greetingText}"`
    );
  }

  // Test 3: Lightweight Conversational Memory
  // 3a. Guru remembers previous scooter ride
  {
    const save = { npcMemory: {} };
    conversationSystem.recordEvent(save, 'guru', 'scooter_ride');
    const conv = await conversationSystem.buildConversation(
      { id: 'guru', name: 'Guru' },
      { npcId: 'guru', level: 'island1', save }
    );
    const greetingText = conv.lines.join(' ');
    assert(
      greetingText.toLowerCase().includes('scooty') || greetingText.toLowerCase().includes('ride'),
      `Guru remembers previous scooter ride: "${greetingText}"`
    );
  }

  // 3b. Anu remembers previous hoop challenge
  {
    const save = { npcMemory: {} };
    conversationSystem.recordEvent(save, 'anu', 'anu_hoops');
    const conv = await conversationSystem.buildConversation(
      { id: 'tahiti_cf1', name: 'Anu' },
      { npcId: 'tahiti_cf1', level: 'tahiti', save }
    );
    const greetingText = conv.lines.join(' ');
    assert(
      greetingText.toLowerCase().includes('jumper') || greetingText.toLowerCase().includes('court') || greetingText.toLowerCase().includes('shots'),
      `Anu remembers previous basketball match: "${greetingText}"`
    );
  }

  // 3c. Thianesh remembers previous eating contest
  {
    const save = { npcMemory: {} };
    conversationSystem.recordEvent(save, 'thianesh', 'eating_contest');
    const conv = await conversationSystem.buildConversation(
      { id: 'tahiti_cf4', name: 'Thianish' },
      { npcId: 'tahiti_cf4', level: 'tahiti', save }
    );
    const greetingText = conv.lines.join(' ');
    assert(
      greetingText.toLowerCase().includes('feast') || greetingText.toLowerCase().includes('appetite') || greetingText.toLowerCase().includes('hungry'),
      `Thianesh remembers previous feast contest: "${greetingText}"`
    );
  }

  // Test 4: Real Gameplay Action Triggers
  // Verify that dialogue choices map to real action triggers
  {
    // Guru scooter ride
    const convGuru = await conversationSystem.buildConversation(
      { id: 'guru', name: 'Guru' },
      { npcId: 'guru', level: 'island1', save: {} }
    );
    const scootOpt = convGuru.topics.find((t) => t.action === 'scooter-ride');
    assert(!!scootOpt, 'Guru dialogue offers real scooter-ride action');

    // Jeswin motorcycle ride
    const convJeswin = await conversationSystem.buildConversation(
      { id: 'tahiti_sf3', name: 'Jeswin' },
      { npcId: 'tahiti_sf3', level: 'tahiti', save: {} }
    );
    const motoOpt = convJeswin.topics.find((t) => t.action === 'tahiti-moto');
    assert(!!motoOpt, 'Jeswin dialogue offers real tahiti-moto ride action');

    // Anu basketball challenge
    const convAnu = await conversationSystem.buildConversation(
      { id: 'tahiti_cf1', name: 'Anu' },
      { npcId: 'tahiti_cf1', level: 'tahiti', save: {} }
    );
    const basketOpt = convAnu.topics.find((t) => t.action === 'tahiti-basket');
    assert(!!basketOpt, 'Anu dialogue offers real tahiti-basket challenge action');

    // Thianesh eating contest
    const convThianesh = await conversationSystem.buildConversation(
      { id: 'tahiti_cf4', name: 'Thianish' },
      { npcId: 'tahiti_cf4', level: 'tahiti', save: {} }
    );
    const feastOpt = convThianesh.topics.find((t) => t.action === 'tahiti-feast');
    assert(!!feastOpt, 'Thianesh dialogue offers real tahiti-feast contest action');

    // Akshai arcade shooter
    const convAkshai = await conversationSystem.buildConversation(
      { id: 'tahiti_cf5', name: 'Akshay' },
      { npcId: 'tahiti_cf5', level: 'tahiti', save: {} }
    );
    const tvOpt = convAkshai.topics.find((t) => t.action === 'tahiti-tvgame');
    assert(!!tvOpt, 'Akshai dialogue offers real tahiti-tvgame arcade action');

    // Shabesh / Sathesh photo session
    const convShabesh = await conversationSystem.buildConversation(
      { id: 'tahiti_cf2', name: 'Shabesh' },
      { npcId: 'tahiti_cf2', level: 'tahiti', save: {} }
    );
    const photoOpt = convShabesh.topics.find((t) => t.action === 'tahiti-photo');
    assert(!!photoOpt, 'Shabesh dialogue offers real tahiti-photo session action');

    // Harris flight to Tahiti
    const convHarris = await conversationSystem.buildConversation(
      { id: 'harris', name: 'Harris' },
      { npcId: 'harris', level: 'island1', save: {} }
    );
    const flightOpt = convHarris.topics.find((t) => t.action === 'fly-tahiti');
    assert(!!flightOpt, 'Harris dialogue offers real fly-tahiti action');
  }

  console.log(`\nVerification complete: ${passedTests}/${totalTests} tests passed.`);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
