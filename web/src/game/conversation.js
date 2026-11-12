// Natural NPC Conversation Engine for NATHAN.EXE
// Provides personality-driven, contextual, memory-aware conversations with real gameplay triggers.
// Strict rule: No double hyphens anywhere in dialogue, choices, or comments.
import { BANK, FLIGHT_CHOICE } from './dialogue-bank.js';

export const CANONICAL_MAP = {
  // Island 1 ids
  guru: 'guru',
  prince: 'prince',
  shabeer: 'shabeer',
  harris: 'harris',
  akshai: 'akshai',
  logeshwaran: 'logeshwaran',
  piranav: 'pranav',
  shabesh: 'shabesh',
  thianesh: 'thianesh',
  naveen: 'naveen',
  anu: 'anu',
  soap: 'soap',
  cal: 'cal',
  vesper: 'vesper',
  skip: 'skip',
  hale: 'hale',
  ollie: 'ollie',

  // Tahiti ids
  tahiti_sf1: 'guru',
  tahiti_sf2: 'prince',
  tahiti_sf3: 'jeswin',
  tahiti_sf4: 'arok',
  tahiti_sf5: 'shabeer',
  tahiti_cf1: 'anu',
  tahiti_cf2: 'shabesh',
  tahiti_cf3: 'logeshwaran',
  tahiti_cf4: 'thianesh',
  tahiti_cf5: 'akshai',
  tahiti_cf6: 'pranav',
  tahiti_cf7: 'sathesh',
  tahiti_cf8: 'naveen',
  tahiti_cf9: 'sivasuthan',
};

// Lightweight helper to pick one item from a list safely
function pick(arr) {
  if (!arr || !arr.length) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

export class ConversationSystem {
  constructor() {
    this.aiEndpoint = '/__ai/dialogue';
    this.aiAvailable = null; // null: unknown, false: offline/unavailable, true: operational
  }

  getCanonicalId(npcId) {
    return CANONICAL_MAP[npcId] || npcId;
  }

  getMemory(save, npcId) {
    const cid = this.getCanonicalId(npcId);
    save.npcMemory = save.npcMemory || {};
    if (!save.npcMemory[cid]) {
      save.npcMemory[cid] = {
        visitCount: 0,
        lastMet: 0,
        topics: [],
        events: [],
      };
    }
    return save.npcMemory[cid];
  }

  recordVisit(save, npcId) {
    const mem = this.getMemory(save, npcId);
    mem.visitCount++;
    mem.lastMet = Date.now();
  }

  recordTopic(save, npcId, topicId) {
    const mem = this.getMemory(save, npcId);
    if (!mem.topics.includes(topicId)) mem.topics.push(topicId);
  }

  recordEvent(save, npcId, eventName) {
    const mem = this.getMemory(save, npcId);
    if (!mem.events.includes(eventName)) mem.events.push(eventName);
  }

  // Quick async probe to check if AI provider is available (without freezing or lagging)
  async queryAi(payload) {
    if (this.aiAvailable === false) return null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(this.aiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        this.aiAvailable = false;
        return null;
      }
      const data = await res.json();
      if (data && data.available) {
        this.aiAvailable = true;
        return data;
      }
      this.aiAvailable = false;
      return null;
    } catch {
      this.aiAvailable = false;
      return null;
    }
  }


  // Scripted friends: first conversation once, then activity talk (only while that activity is
  // happening and not twice in a row), otherwise the three repeats in rotation. Topics are the
  // selectable replies; an action button only appears when its mechanic works here.
  buildFromBank(cid, mem, ctx) {
    const entry = BANK[cid];
    const hs = ctx.harrisState || null;
    const x = {
      level: ctx.level, act: ctx.activity, pose: ctx.pose, npcDef: ctx.npcDef,
      atTerminal: cid === 'harris' && (ctx.level !== 'tahiti' || hs === 'WAITING_FOR_NATHAN'),
    };
    const act = entry.activity.find((a) => { try { return a.when(x); } catch { return false; } });
    let key, lines;
    if (!mem.firstDone) { key = 'first'; lines = entry.first; mem.firstDone = true; }
    else if (act && mem.last !== 'act:' + act.id) { key = 'act:' + act.id; lines = act.lines; }
    else {
      const i = (mem.rep || 0) % entry.repeats.length;
      mem.rep = i + 1; key = 'rep:' + i; lines = entry.repeats[i];
    }
    mem.last = key;
    const topics = entry.topics
      .filter((t) => { try { return !t.when || t.when(x); } catch { return false; } })
      .map((t) => ({ id: t.id, q: t.q, reply: t.lines, action: t.action }));
    if (cid === 'harris') {
      const f = FLIGHT_CHOICE[ctx.level === 'tahiti' ? 'island1' : 'tahiti'];
      topics.unshift({ id: 'flight', q: f.q, reply: [], action: f.action });
    }
    return { lines: [...lines], topics, goodbye: entry.goodbye };
  }

  // Build the complete conversation context and dialogue session
  async buildConversation(npcDef, ctx) {
    const cid = this.getCanonicalId(ctx.npcId);
    const save = ctx.save || {};
    const mem = this.getMemory(save, ctx.npcId);
    this.recordVisit(save, ctx.npcId);

    const isTahiti = ctx.level === 'tahiti';
    const activity = ctx.activity?.act || null;
    const pose = ctx.activity?.pose || null;
    const isMounted = !!ctx.mount;
    const mountType = ctx.mount || null;
    const weather = ctx.weather || 'clear';
    const timeOfDay = ctx.timeOfDay || 'day';

    if (BANK[cid]) return this.buildFromBank(cid, mem, { ...ctx, isTahiti, activity, pose, npcDef });

    // Personality definitions and contextual branches
    const profile = CHARACTERS[cid] || CHARACTERS.defaultProfile(npcDef);

    // Procedural generation tailored to context and memory
    const greeting = profile.greeting({
      isTahiti,
      activity,
      pose,
      isMounted,
      mountType,
      weather,
      timeOfDay,
      mem,
      npcDef,
    });

    const choices = profile.choices({
      isTahiti,
      activity,
      pose,
      isMounted,
      mountType,
      weather,
      timeOfDay,
      mem,
      npcDef,
    });

    return {
      lines: Array.isArray(greeting) ? greeting : [greeting],
      topics: choices,
    };
  }
}

// Detailed Character Personalities and Contextual Brains

const CHARACTERS = {
  // Pop-Culture Mentors in City Park:
  soap: {
    greeting: () => [
      "Ever wondered how much of your life is actually yours, Nathan?",
      "Take away the furniture, the trophies, and the titles. See what is still standing.",
    ],
    choices: () => [
      {
        id: 'soap-punch',
        q: "Can I hit the boxing bag?",
        reply: "Go on. One clean punch. Put your hips into it, then let it go.",
        action: 'pop_boxing',
      },
      {
        id: 'soap-philosophy',
        q: "What defines a person?",
        reply: "Not what you own. What you are willing to fight through when nobody is applauding.",
      },
    ],
  },

  cal: {
    greeting: () => [
      "Long trail, partner. What brings you out here by the campfire?",
      "Every path you take leaves a track. Best make sure it is one you are proud of.",
    ],
    choices: () => [
      {
        id: 'cal-camp',
        q: "Mind if I sit by the campfire?",
        reply: "Pull up a log. A warm fire and loyal companions are about all a man needs.",
        action: 'pop_camp',
      },
      {
        id: 'cal-wisdom',
        q: "What makes a good life?",
        reply: "Folks you would ride back for through rain and mud. Somebody who would notice if you didn't come home.",
      },
    ],
  },

  vesper: {
    greeting: () => [
      "Funny how different the world looks under moonlight, Nathan.",
      "Everyone has more than one side. The trick is getting them to work together.",
    ],
    choices: () => [
      {
        id: 'vesper-moon',
        q: "Is there something hidden in the reflecting pool?",
        reply: "Look closely at the water. Some truths only reveal themselves when you quiet your mind.",
        action: 'pop_moon',
      },
      {
        id: 'vesper-identity',
        q: "What makes us who we are?",
        reply: "The stories we choose to rewrite when the old ones no longer serve the truth.",
      },
    ],
  },

  skip: {
    greeting: () => [
      "Hey! Mind the rooftops. Nice place you have built here, Nathan!",
      "Great power, great responsibility. You know the drill!",
    ],
    choices: () => [
      {
        id: 'skip-webrun',
        q: "Want to try the rooftop run?",
        reply: "Three red rings, fifteen seconds. Run through all of them. Go!",
        action: 'pop_web',
      },
      {
        id: 'skip-advice',
        q: "How do you handle responsibility?",
        reply: "You pick what truly matters, dust yourself off when you stumble, and keep swinging.",
      },
    ],
  },

  hale: {
    greeting: () => [
      "You can learn a lot about this city when you close your eyes and listen.",
      "Most real strength never makes a sound, Nathan.",
    ],
    choices: () => [
      {
        id: 'hale-listen',
        q: "Can you show me how you listen?",
        reply: "Close your eyes. Hear that echo? Every surface tells a story.",
        action: 'pop_rooftop_red',
      },
      {
        id: 'hale-strength',
        q: "How do you keep going when things get dark?",
        reply: "One more round. Then one more. You don't need to see the whole path, just take the next step.",
      },
    ],
  },

  ollie: {
    greeting: () => [
      "Technically the build is working! Just please nobody refresh the browser.",
      "Nathan! Six hours of sleep this week, but our compression algorithm is pristine.",
    ],
    choices: () => [
      {
        id: 'ollie-debug',
        q: "Help me debug this build?",
        reply: "Watching the terminal. Compiling... Red error! One missing bracket later... Green! Ship it!",
        action: 'pop_startup',
      },
      {
        id: 'ollie-startup',
        q: "Is building big projects worth the stress?",
        reply: "Statistically? Wild. Personally? You learn more in six months than six comfortable years.",
      },
    ],
  },

  // Default fallback for any unlisted NPC
  defaultProfile: (def) => ({
    greeting: ({ mem }) => [
      mem.visitCount > 1
        ? `Hey Nathan, good to see you again! Exploring more of the island?`
        : `Hey Nathan! Welcome to ${def.district || 'the area'}. Great to meet you here.`,
    ],
    choices: () => [
      {
        id: 'general-chat',
        q: "How are things going around here?",
        reply: "Taking it one day at a time, enjoying the atmosphere and good friends.",
      },
      {
        id: 'island-plans',
        q: "Any favorite spots you recommend?",
        reply: "The beach sunset and the plaza exhibits are both well worth a visit.",
      },
    ],
  }),
};

export const conversationSystem = new ConversationSystem();
