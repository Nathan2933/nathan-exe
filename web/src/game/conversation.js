// Natural NPC Conversation Engine for NATHAN.EXE
// Provides personality-driven, contextual, memory-aware conversations with real gameplay triggers.
// Strict rule: No double hyphens anywhere in dialogue, choices, or comments.

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
  // GURU: Coding, history, travel, humor, and his blue Zest scooty
  guru: {
    greeting: ({ isTahiti, activity, isMounted, mountType, mem }) => {
      if (isMounted && mountType === 'scooty') {
        return pick([
          "Look at you riding my blue Zest! Mind the throttle, she's got quick pickup.",
          "Taking the scooty for a spin? Best ride on the entire island.",
          "Hey Nathan! Keep the rubber side down on that blue machine.",
        ]);
      }
      if (mem.events.includes('scooter_ride')) {
        return pick([
          "Nathan! How did that scooty ride treat you? Engine purrs like new.",
          "Ready for another run on the scooty, or back to the codebase?",
          "Still feeling the sea breeze from that ride?",
        ]);
      }
      if (isTahiti) {
        if (activity === 'coding') {
          return pick([
            "Hold on, fixing an unhandled rejection. Okay, what's up, Nathan?",
            "Laptop on the balcony, ocean breeze. Best debugging setup in the world.",
            "Just pushed a hotfix. Scooty, code, and sunshine. What more do we need?",
          ]);
        }
        return pick([
          "Took you long enough, Nathan! Grab a seat.",
          "Tahiti feels like the ultimate road trip destination.",
          "Was just thinking about our old travel stories.",
        ]);
      }
      // Island 1 (Winter Campus / Tomsk)
      if (activity === 'riding' || activity === 'mount') {
        return pick([
          "Cruising the ring road! Mind if we take a spin together, Nathan?",
          "Engine is warm and the roads are clear. Want to hop on the back?",
          "Best way to clear the head after thirty seconds of hard coding!",
        ]);
      }
      if (activity === 'coding') {
        return pick([
          "Thirty seconds in the zone! Debugging async handlers before I take the scooty out.",
          "Minus twenty outside, but Tomsk State University keeps the code hot!",
          "Nathan! Just finishing a sprint before taking the blue Zest for a spin.",
        ]);
      }
      return pick([
        "Minus twenty outside, but Tomsk State University keeps the code hot!",
        "Nathan! Two semesters in Russia and we survived on instant noodles and debugging.",
        "Winter Campus looks chilly, but the blue scooty is parked and ready.",
      ]);
    },
    choices: ({ isTahiti, mem }) => {
      const opts = [];

      // Gameplay Action: Scooter ride
      opts.push({
        id: 'scooter-spin',
        q: "Can I join you for a ride?",
        reply: "Hop on the back seat! Let us cruise the ring road around the island.",
        action: 'scooter-ride',
        onChoose: (sys, save, id) => sys.recordEvent(save, id, 'scooter_ride'),
      });

      // Personality: Coding & Debugging
      opts.push({
        id: 'coding-banter',
        q: "How is that compiler bug coming along?",
        reply: "Found it at three in the morning! Classic missing semicolon in the async handler. We ship at dawn.",
        followUps: [
          {
            q: "Classic 3 AM breakthrough.",
            reply: "Nothing compiles faster than pure caffeine and sheer stubbornness.",
          },
          {
            q: "What are we building next?",
            reply: "Something fast, lightweight, and road-ready. Maybe an offline route planner for long rides.",
          },
        ],
      });

      // Personality: History & Travel
      opts.push({
        id: 'travel-memories',
        q: "Remember that road trip we took?",
        reply: "Endless highway, bad playlists, and roadside chai that tasted like victory. Best memories ever.",
        followUps: [
          {
            q: "The bike broke down halfway, remember?",
            reply: "And we fixed it with a zip tie and optimism! Legend behavior.",
          },
        ],
      });

      return opts;
    },
  },

  // PRINCE: Cybersecurity, CTF, athletics, and gaming
  prince: {
    greeting: ({ isTahiti, activity, mem }) => {
      if (activity === 'gaming') {
        return pick([
          "Clutch round! Nathan, grab the spare controller before Arok respawns.",
          "One more round, Nathan! Just pulled off a clean 1v3 flank.",
          "Gotta keep the reaction times sub-millisecond!",
        ]);
      }
      if (mem.events.includes('pixel_defenders') || mem.events.includes('gaming')) {
        return pick([
          "Nathan! Your arcade reflexes are getting sharper. Rematch later?",
          "Still hyped from that arcade run. Teamwork was on point.",
        ]);
      }
      if (isTahiti) {
        return pick([
          "Tahiti squad is assembled! Ready for some gaming or sprint drills?",
          "Keeping active out here. Sun, sand, and packet sniffing on the Wi-Fi.",
        ]);
      }
      // Island 1 (Winter Campus)
      return pick([
        "Freezing out here in Tomsk, but cold weather builds mental stamina!",
        "Cracking a reverse-engineering CTF challenge right now. Brain is on fire.",
      ]);
    },
    choices: ({ isTahiti, mem }) => {
      const opts = [];

      // Gameplay Action: Gaming / Arcade Shooter
      opts.push({
        id: 'prince-game',
        q: "Pass me a controller, let's play!",
        reply: "Player two is live! Let's beat the high score together.",
        action: 'tahiti-tvgame',
        onChoose: (sys, save, id) => sys.recordEvent(save, id, 'pixel_defenders'),
      });

      // Gameplay Action: Beach Volleyball on Tahiti
      if (isTahiti) {
        opts.push({
          id: 'prince-volley',
          q: "Up for beach volleyball?",
          reply: "Footwork and fast reflexes! Vanderlinde squad on serve. Let's go!",
          action: 'tahiti-volley-vg',
          onChoose: (sys, save, id) => sys.recordEvent(save, id, 'volleyball'),
        });
      }

      // Personality: Cybersecurity & CTF
      opts.push({
        id: 'cybersecurity',
        q: "Crack any interesting security flags lately?",
        reply: "Pwned a binary exploitation box yesterday. Buffer overflow straight into root shell. Pure dopamine.",
        followUps: [
          {
            q: "Defense in depth, right?",
            reply: "Always. Bound your memory, sanitize inputs, and never trust unauthenticated packets.",
          },
          {
            q: "How does gaming help with CTFs?",
            reply: "Same pattern recognition and speed. You spot exploits before the opponent spots you.",
          },
        ],
      });

      return opts;
    },
  },

  // JESWIN: Architecture, building projects, motorcycles, and creativity
  jeswin: {
    greeting: ({ activity, mem }) => {
      if (activity === 'drafting') {
        return pick([
          "Checking the load-bearing spans on this blueprint. Measure twice, build once.",
          "Drafting the new pavilion. Clean geometry that catches the prevailing trade winds.",
          "Hey Nathan. Looking at the structural pitch of the roofline.",
        ]);
      }
      if (mem.events.includes('motorcycle_ride')) {
        return pick([
          "That motorcycle run along the cliffs was sweet! Engine breathed so freely in the sea air.",
          "Ready for another spin on the bike, or checking blueprints today?",
        ]);
      }
      return pick([
        "Hey Nathan. While everyone talks big ideas, someone has to make sure the walls stay standing.",
        "Look at the spatial flow of this island layout. Good architecture feels effortless.",
        "Careful around the drafting desk, fresh ink drying on the villa schematics.",
      ]);
    },
    choices: ({ isTahiti }) => {
      const opts = [];

      // Gameplay Action: Motorcycle ride
      opts.push({
        id: 'moto-ride',
        q: "Want to take the motorcycle for a run?",
        reply: "Helmet on, throttle open! Let's cruise the coastline.",
        action: 'tahiti-moto',
        onChoose: (sys, save, id) => sys.recordEvent(save, id, 'motorcycle_ride'),
      });

      // Personality: Architecture & Blueprints
      opts.push({
        id: 'blueprints',
        q: "What are you designing right now?",
        reply: "A timber pavilion with open clerestory vents. Keeps it cool naturally without loud fans.",
        followUps: [
          {
            q: "How do you balance function and aesthetics?",
            reply: "Structure IS the aesthetic. When the proportions are mathematically sound, beauty follows.",
          },
          {
            q: "Built any sand structures on the beach?",
            reply: "Crafted a tiered sand arch this morning. The incoming tide tested its foundation nicely.",
          },
        ],
      });

      // Personality: Motorcycles & Mechanics
      opts.push({
        id: 'moto-mechanics',
        q: "How is the motorcycle engine running?",
        reply: "Carburetor dialed in, spark plug clean. Pure mechanical harmony.",
        followUps: [
          {
            q: "Nothing beats two wheels.",
            reply: "True freedom. You feel every gradient of the road directly.",
          },
        ],
      });

      return opts;
    },
  },

  // AROK: Streaming, gaming, YouTube, and video editing
  arok: {
    greeting: ({ activity }) => {
      if (activity === 'stream') {
        return pick([
          "Nathan, lean into the webcam! Chat, say hi to the protagonist!",
          "We're live right now! Over a hundred viewers in chat and the hype is real.",
          "Live on air! Chat is spamming W's for Nathan right now.",
        ]);
      }
      return pick([
        "What's good, Nathan! Just scrubbing through a 4K timeline of yesterday's clips.",
        "Pull up a stool. Taking a quick breather between recording sessions.",
        "Exporting a fresh video project. 60 frames per second, buttery smooth.",
      ]);
    },
    choices: () => {
      const opts = [];

      // Gameplay Action: Arcade gaming on stream
      opts.push({
        id: 'stream-game',
        q: "Let's hop on the arcade machine together!",
        reply: "Chat is going to love this co-op run! Booting it up now.",
        action: 'tahiti-tvgame',
        onChoose: (sys, save, id) => sys.recordEvent(save, id, 'pixel_defenders'),
      });

      // Personality: Streaming & Chat
      opts.push({
        id: 'stream-chat',
        q: "How is the stream chat behaving today?",
        reply: "High energy, great vibes, and demanding more island tours! They love the retro aesthetic.",
        followUps: [
          {
            q: "Give the chat a wave from me.",
            reply: "Done! Chat says: 'W Nathan, ship the next update!'",
          },
          {
            q: "What makes a good livestream?",
            reply: "Authenticity and spontaneity. People show up for the game, but stay for the laughs.",
          },
        ],
      });

      // Personality: Video Editing & YouTube
      opts.push({
        id: 'editing-timeline',
        q: "What are you cutting in the editor?",
        reply: "A montage of the gang's funniest moments. Color graded with warm sunset tones.",
        followUps: [
          {
            q: "Pacing is everything in editing.",
            reply: "Every single frame counts. Cut on the action, let the punchlines land.",
          },
        ],
      });

      return opts;
    },
  },

  // SHABEER: Fitness, food, reading, and friendship memories
  shabeer: {
    greeting: ({ isTahiti, mem }) => {
      if (mem.events.includes('album_view')) {
        return pick([
          "Looking through those photos really puts things into perspective, doesn't it?",
          "Every picture tells the story of how we got here.",
        ]);
      }
      if (isTahiti) {
        return pick([
          "Pinning today's polaroids to the gang's memory board. Look how far we've come.",
          "Nathan! Old friends, good food, and clear skies. That is the winning recipe.",
          "Holding still for a quick shot? Just reviewing the album entries.",
        ]);
      }
      // Island 1 (Montfort Lake Park)
      return pick([
        "Some of us have been around since the very first chapter, Nathan.",
        "Walking by the lake always brings back Montfort school memories.",
        "Hey old friend. Hard to believe school days were that many chapters ago.",
      ]);
    },
    choices: () => {
      const opts = [];

      // Gameplay Action: Open Memory Album
      opts.push({
        id: 'open-album-action',
        q: "Can we look through the memory album?",
        reply: "Opening the archive now. Every chapter has an unforgettable memory.",
        action: 'open-album',
        onChoose: (sys, save, id) => sys.recordEvent(save, id, 'album_view'),
      });

      // Personality: School Memories
      opts.push({
        id: 'montfort-memories',
        q: "Remember our classroom days at Montfort?",
        reply: "Trading lunch boxes, last minute exam prep, and laughing until our stomachs hurt. Golden times.",
        followUps: [
          {
            q: "Did you imagine we'd build all this?",
            reply: "Honestly? Yes. You were always building, sketching, and aiming higher.",
          },
        ],
      });

      // Personality: Fitness, Food & Reading
      opts.push({
        id: 'books-fitness',
        q: "Read any inspiring books recently?",
        reply: "Finished a great piece on discipline and daily habits. Small consistent actions compound massively.",
        followUps: [
          {
            q: "Nutrition and training matter too.",
            reply: "Body and mind stay linked. Train consistently, eat real food, and stay humble.",
          },
        ],
      });

      return opts;
    },
  },

  // HARRIS: Marvel, movies, aviation, travel, and casual conversations
  harris: {
    greeting: ({ isTahiti, mem }) => {
      if (mem.events.includes('flight_tahiti') || mem.events.includes('flight_home')) {
        return pick([
          "Captain Harris at your service! Smooth touchdown earlier, right?",
          "Ready for the next leg of our flight, or taking in the scenery?",
          "Engines are cooling down nicely. That approach vector was textbook.",
        ]);
      }
      if (isTahiti) {
        return pick([
          "Captain Harris in the flight lounge! Jet is refueled and pre-flighted.",
          "Tahiti runway is clear and wind is light. Ready whenever you need a lift home.",
          "Catching a quick pilot's rest before our next flight plan.",
        ]);
      }
      // Island 1 (Airport / Lighthouse tarmac)
      return pick([
        "Pre-flight checks complete, captain! Ready for Tahiti?",
        "Twin turbines spinning, weather radar is all green. Wheels up on your command.",
        "Nathan! The runway is ours. What's the destination today?",
      ]);
    },
    choices: ({ isTahiti }) => {
      const opts = [];

      // Gameplay Action: Flight
      if (!isTahiti) {
        opts.push({
          id: 'fly-tahiti-action',
          q: "Wheels up, Harris! Fly to Tahiti.",
          reply: "Strap in, Nathan. Clearing runway one-niner for takeoff to Tahiti!",
          action: 'fly-tahiti',
          onChoose: (sys, save, id) => sys.recordEvent(save, id, 'flight_tahiti'),
        });
      } else {
        opts.push({
          id: 'fly-home-action',
          q: "Ready to head back to Origin Isle.",
          reply: "Flight plan confirmed! Meet me at the jet and we will throttle up.",
          action: 'fly-home',
          onChoose: (sys, save, id) => sys.recordEvent(save, id, 'flight_home'),
        });
      }

      // Gameplay Action: Outdoor Cinema / Marvel activity
      opts.push({
        id: 'cinema-action',
        q: "Let's roll film at the outdoor cinema!",
        reply: "Projector light is rolling! Marvel movie marathon is on screen.",
        action: 'pop_cinema',
        onChoose: (sys, save, id) => sys.recordEvent(save, id, 'cinema_roll'),
      });

      // Personality: Marvel & Movies
      opts.push({
        id: 'marvel-movies',
        q: "Who is your all-time favorite Avenger?",
        reply: "Iron Man, without question. Genius, builder, and he pilots his own high-speed thrusters!",
        followUps: [
          {
            q: "Captain America had the purest heart though.",
            reply: "'I can do this all day.' That quote sums up you debugging tricky code!",
          },
          {
            q: "Best flight sequence in cinema?",
            reply: "Top Gun Maverick canyon run. Pure flying adrenaline.",
          },
        ],
      });

      return opts;
    },
  },

  // AKSHAI: Gaming, technology, hardware, and shooting games
  akshai: {
    greeting: ({ isTahiti, activity, mem }) => {
      if (activity === 'tvgame') {
        return pick([
          "Nathan, sit down! Grab player two controller for Pixel Defenders!",
          "Boss wave incoming! Need a wingman on the secondary laser turret.",
          "High score is within reach! Join in right now.",
        ]);
      }
      if (mem.events.includes('pixel_defenders')) {
        return pick([
          "Those laser shots earlier were surgical! Rematch on the CRT?",
          "We held that defensive line like champions. Pixel Defenders duo!",
        ]);
      }
      if (isTahiti) {
        return pick([
          "Railing is mine, view is unmatched, and the TV corner is warmed up.",
          "Tahiti vacation, but the tech discussions never stop.",
        ]);
      }
      // Island 1 (Garage)
      return pick([
        "Welcome to the Garage! Ideas come in, clean builds ship out.",
        "Benchmarking your projects on fresh hardware. Aratro is humming nicely.",
        "Testing the latest branch. It works on my machine!",
      ]);
    },
    choices: ({ isTahiti }) => {
      const opts = [];

      // Gameplay Action: TV Arcade Game (Pixel Defenders)
      opts.push({
        id: 'tv-game-action',
        q: "Pass player two controller, let's play!",
        reply: "Player two is locked in! Space to fire, dodge the incoming wave!",
        action: 'tahiti-tvgame',
        onChoose: (sys, save, id) => sys.recordEvent(save, id, 'pixel_defenders'),
      });

      // Gameplay Action: Aratro project review
      opts.push({
        id: 'aratro-project',
        q: "How did the Aratro architecture benchmark?",
        reply: "Top tier performance! First place at Hack Odyssey 2025 was completely deserved.",
        action: 'project-aratro',
        onChoose: (sys, save, id) => sys.recordEvent(save, id, 'aratro_view'),
      });

      // Personality: Hardware & Tech
      opts.push({
        id: 'hardware-benchmarks',
        q: "What hardware upgrade makes the biggest difference?",
        reply: "Fast NVMe storage and dual-channel memory. Never let compilation wait on disk I/O.",
        followUps: [
          {
            q: "The garage crew motto still stands?",
            reply: "'Ship it now, optimize it later!' Classic engineering reality.",
          },
        ],
      });

      return opts;
    },
  },

  // LOGESHWARAN: Electronics, IoT, research, and experimentation
  logeshwaran: {
    greeting: ({ isTahiti }) => {
      if (isTahiti) {
        return pick([
          "Watching the sunset from the deck. Thinking about low-power radio propagation over seawater.",
          "Hey Nathan. Island breeze makes for great passive cooling experiments.",
        ]);
      }
      return pick([
        "Soldering some sensor pins. Hardware never lies, Nathan.",
        "Checking out the exhibit benches. Every prototype started as a messy breadboard.",
        "Hey Nathan! Walking the Garage exhibits. Impressive engineering here.",
      ]);
    },
    choices: () => {
      const opts = [];

      // Gameplay Action: Microservices Logging project
      opts.push({
        id: 'microservices-action',
        q: "Show me the security logging pipeline.",
        reply: "Immutable logging stream across all microservices. Every audit event accounted for.",
        action: 'project-microservices',
      });

      // Personality: Electronics & IoT
      opts.push({
        id: 'iot-research',
        q: "What electronics project are you tinkering with?",
        reply: "A decentralized sensor node network. Ultra low power consumption, runs on a tiny solar cell.",
        followUps: [
          {
            q: "Hardware prototyping is so satisfying.",
            reply: "When an LED blinks on code you wrote, that is pure digital craft.",
          },
        ],
      });

      // Personality: Building philosophy
      opts.push({
        id: 'experimentation',
        q: "What is your philosophy on research?",
        reply: "Build rapid prototypes, test them under stress, and learn from what breaks first.",
      });

      return opts;
    },
  },

  // PRANAV: Productivity, coding, planning, and work
  pranav: {
    greeting: ({ isTahiti, activity }) => {
      if (isTahiti) {
        if (activity === 'volley') {
          return pick([
            "Taking an active break on the volleyball court! Best productivity reset.",
            "Setting up on the sand. Ready to spike!",
          ]);
        }
        return pick([
          "One second, replying to a project message! Okay, what's on your mind?",
          "Closing a pull request before sunset. Beautiful island productivity.",
        ]);
      }
      // Island 1 (Monsoon Campus / TCE)
      return pick([
        "Just finishing up this schedule module. Deadlines keep the mind sharp!",
        "TCE Monsoon Campus has that classic project crunch energy today.",
      ]);
    },
    choices: ({ isTahiti }) => {
      const opts = [];

      // Gameplay Action: Volleyball match on Tahiti
      if (isTahiti) {
        opts.push({
          id: 'volley-action-pranav',
          q: "Let's play beach volleyball!",
          reply: "Outlaws on the court! Let's get a rally going.",
          action: 'tahiti-volley-ol',
          onChoose: (sys, save, id) => sys.recordEvent(save, id, 'volleyball'),
        });
      }

      // Action: TCE Event Scheduler
      opts.push({
        id: 'scheduler-action',
        q: "How did the TCE Event Scheduler turn out?",
        reply: "Runner-up at HackFest 2025! Clean calendar algorithms and zero registration collisions.",
        action: 'project-scheduler',
      });

      // Personality: Productivity & Sprint Planning
      opts.push({
        id: 'productivity-habits',
        q: "How do you stay on top of heavy project workloads?",
        reply: "Time blocking, automated testing, and clear milestones. Never let ambiguity slow you down.",
        followUps: [
          {
            q: "Burnout is real if you do not pace yourself.",
            reply: "Exactly. That is why scheduled downtime on the beach is part of the system.",
          },
        ],
      });

      return opts;
    },
  },

  // SHABESH: Filmmaking, cameras, storytelling, and creative ideas
  shabesh: {
    greeting: ({ isTahiti, activity, mem }) => {
      if (activity === 'photo_sh' || activity === 'photowalk_ol') {
        return pick([
          "Hold that posture, Nathan! The rim lighting against the ocean is cinematic gold.",
          "Shutter speed set to one-five-hundredth! Say cheese for the camera.",
          "Reviewing the roll right now. That last shot belongs on a film poster.",
        ]);
      }
      if (mem.events.includes('photo_session')) {
        return pick([
          "That portrait we captured earlier came out unbelievable. True leading-man energy.",
          "Still reviewing the shots from our session. Color balance is impeccable.",
        ]);
      }
      if (isTahiti) {
        return pick([
          "Tahiti looks like an auteur film set. The light quality out here is unreal.",
          "Every angle of this island tells a story. Grab a chair, Nathan.",
        ]);
      }
      // Island 1 (Monsoon Campus / TCE)
      return pick([
        "Filming the college campus today. Capturing the moments while they are happening.",
        "Hey Nathan! This whole game world is one of your biggest creative productions.",
      ]);
    },
    choices: () => {
      const opts = [];

      // Gameplay Action: Photo session
      opts.push({
        id: 'shabesh-photo-action',
        q: "Take a picture of me, Shabesh!",
        reply: "Step onto your mark, face the camera! Three, two, one, flash!",
        action: 'tahiti-photo',
        onChoose: (sys, save, id) => sys.recordEvent(save, id, 'photo_session'),
      });

      // Personality: Cinematography & Storytelling
      opts.push({
        id: 'cinematic-style',
        q: "If Nathan's journey were a film, what genre would it be?",
        reply: "A coming-of-age comeback story. Big challenges, loyalty, and a soundtrack that hits just right.",
        followUps: [
          {
            q: "What makes a shot truly memorable?",
            reply: "Not the camera body. It is the genuine emotion captured in an unscripted moment.",
          },
        ],
      });

      // Personality: Creative ideas
      opts.push({
        id: 'creative-ideas',
        q: "What creative project are you planning next?",
        reply: "A documentary short about how a bunch of friends built their own island retreat.",
      });

      return opts;
    },
  },

  // SATHESH KUMAR: Photography, editing, cameras, and group memories
  sathesh: {
    greeting: ({ activity, mem }) => {
      if (activity === 'photo_sa' || activity === 'photowalk_ol') {
        return pick([
          "Golden hour is peaking right now! Sathesh Kumar behind the lens, you know the shot will be fire.",
          "White balance is dialed in. Ready to step in front of the lens, Nathan?",
          "Look at the natural backlight on the balcony. Picture perfect timing.",
        ]);
      }
      if (mem.events.includes('photo_session')) {
        return pick([
          "That last group photo was an instant classic! Saved straight into the island album.",
          "Your portrait earlier had great presence. The camera loves natural confidence.",
        ]);
      }
      return pick([
        "Hey, good timing Nathan! Balcony breeze is warm and the cameras are loaded.",
        "Brown skin, sharp eye, and the best camera gear on Tahiti. What's the plan?",
        "Good photography requires two things: prime lenses and good company.",
      ]);
    },
    choices: () => {
      const opts = [];

      // Gameplay Action: Photo Session
      opts.push({
        id: 'sathesh-photo-action',
        q: "Let's do a photoshoot on the balcony!",
        reply: "Position yourself by the railing. Smile for the Outlaws archive!",
        action: 'tahiti-photo',
        onChoose: (sys, save, id) => sys.recordEvent(save, id, 'photo_session'),
      });

      // Personality: Photo Editing & Color
      opts.push({
        id: 'photo-editing',
        q: "How do you grade the colors on your photos?",
        reply: "Warm highlights, deep rich shadows, and keeping skin tones true to life. Clean retro aesthetic.",
        followUps: [
          {
            q: "Natural light beats studio flash every time.",
            reply: "A hundred percent. Golden hour does all the heavy lifting if you know where to stand.",
          },
        ],
      });

      // Personality: Group Memories & Food
      opts.push({
        id: 'gang-memories',
        q: "What is your favorite memory with the gang?",
        reply: "Those long balcony conversations where food arrives, music plays, and nobody wants the night to end.",
      });

      return opts;
    },
  },

  // THIANESH: Gym, bodybuilding, food, and competitions
  thianesh: {
    greeting: ({ isTahiti, activity, mem }) => {
      if (activity === 'feast') {
        return pick([
          "Round two of snacks! This is competitive eating training. Pull up a chair!",
          "Undefeated at the feast table! Think you have the stomach to challenge me, Nathan?",
          "Carb loading at the feast table! The eating legend lives on.",
        ]);
      }
      if (mem.events.includes('eating_contest')) {
        return pick([
          "Still recovering from that feast battle! You brought serious appetite, Nathan.",
          "Rematch time at the table whenever you are hungry enough!",
        ]);
      }
      if (mem.events.includes('gym_lift')) {
        return pick([
          "Solid form on those reps earlier! Progressive overload never fails.",
          "Muscles looking pumped, Nathan. Consistency is paying off.",
        ]);
      }
      if (isTahiti) {
        return pick([
          "Took the villa stairs? Respect. That counts as your morning cardio.",
          "Even on Tahiti, we do not skip training. Gym first, beach second, food always.",
        ]);
      }
      // Island 1 (Iron Yard)
      return pick([
        "Back for another session? The Iron Yard keeps score in clean reps, not words.",
        "Nathan! Chalk up your hands. Three clean reps on the rack, let's go!",
      ]);
    },
    choices: ({ isTahiti }) => {
      const opts = [];

      // Gameplay Action: Tahiti Feast Challenge OR Island 1 Gym Lift
      if (isTahiti) {
        opts.push({
          id: 'feast-contest-action',
          q: "I challenge you to an eating contest!",
          reply: "You asked for it! Mash the plate for ten seconds. Let's see who holds the crown!",
          action: 'tahiti-feast',
          onChoose: (sys, save, id) => sys.recordEvent(save, id, 'eating_contest'),
        });
      } else {
        opts.push({
          id: 'gym-lift-action',
          q: "Let's hit a heavy set on the rack!",
          reply: "Three clean reps! Tight groove, chest up, push through the floor!",
          action: 'gym-lift',
          onChoose: (sys, save, id) => sys.recordEvent(save, id, 'gym_lift'),
        });
      }

      // Personality: Transformation & Discipline
      opts.push({
        id: 'transformation-journey',
        q: "How would you describe Nathan's fitness journey?",
        reply: "Roughly 100 kg down to 60, then built back up to a solid 75 kg of lean muscle. Three checkpoints, one habit: showing up.",
        followUps: [
          {
            q: "Discipline over motivation.",
            reply: "Every single time. Goals evolve, but the habit of daily work stays forever.",
          },
          {
            q: "Chest day or leg day?",
            reply: "Leg day separates the talkers from the lifters. Never skip squats!",
          },
        ],
      });

      // Personality: Food & Fuel
      opts.push({
        id: 'nutrition-talk',
        q: "What is the secret to recovery?",
        reply: "Quality sleep, adequate protein, and never underestimating the power of a giant post-workout meal.",
      });

      return opts;
    },
  },

  // NAVEEN: Chai, carrom, friendship, and social activities
  naveen: {
    greeting: ({ isTahiti }) => {
      if (isTahiti) {
        return pick([
          "Hey, you made it! Balcony tea is steaming, and the carrom board is ready.",
          "Pull up a seat, brother. What is the latest update from the island?",
        ]);
      }
      // Island 1 (Garage / Tea Stall)
      return pick([
        "Mind the cables, Nathan! Something is always compiling, but chai comes first.",
        "Hot chai, warm conversation, and moral support for the builders. Welcome back!",
      ]);
    },
    choices: ({ isTahiti }) => {
      const opts = [];

      // Gameplay Action: Volleyball match on Tahiti
      if (isTahiti) {
        opts.push({
          id: 'naveen-volley',
          q: "Up for a beach volleyball match?",
          reply: "Count me in! Naveen covering the back line. Let's run the game!",
          action: 'tahiti-volley-ol',
          onChoose: (sys, save, id) => sys.recordEvent(save, id, 'volleyball'),
        });
      }

      // Personality: Chai & Carrom
      opts.push({
        id: 'chai-carrom',
        q: "Who is winning on the carrom board today?",
        reply: "My center striker has been deadly. White coins are mine, and loser buys the evening snacks!",
        followUps: [
          {
            q: "Chai break first, code second.",
            reply: "Words of true wisdom. A five-minute chai break has solved more bugs than hours of staring at a screen.",
          },
        ],
      });

      // Personality: Friendship & Community
      opts.push({
        id: 'social-support',
        q: "What is your favorite part of this whole crew?",
        reply: "How everyone lifts each other up. Whether we are launching an app or playing board games, nobody walks alone.",
      });

      return opts;
    },
  },

  // SIVASUTHAN: Finance, business, philosophy, and economics
  sivasuthan: {
    greeting: ({ isTahiti, activity }) => {
      if (activity === 'dj') {
        return pick([
          "Rhythm drives the atmosphere. Dropping the next track right now!",
          "Bass frequency vibrating the balcony floor. Pure island euphoria.",
        ]);
      }
      return pick([
        "Took your time, Nathan! Look at this sunset view from the villa deck.",
        "Watching the horizon. The best compounding return in life is true friendship.",
        "Balcony breeze is fresh. Let's talk philosophy or economics.",
      ]);
    },
    choices: () => {
      const opts = [];

      // Personality: Finance & Asymmetric Bets
      opts.push({
        id: 'finance-philosophy',
        q: "What is your best investment advice for our generation?",
        reply: "Invest deeply in your skills, your health, and relationships with builders. That asset class never depreciates.",
        followUps: [
          {
            q: "What about calculated risk?",
            reply: "Seek positive asymmetry: capped downside, uncapped upside. Building projects like this game is the ultimate asymmetric bet.",
          },
          {
            q: "Market cycles come and go.",
            reply: "Exactly. Enduring fundamentals outlast every bubble and correction.",
          },
        ],
      });

      // Personality: Music & Atmosphere
      opts.push({
        id: 'villa-music',
        q: "How is the sound system on the deck?",
        reply: "Crisp highs, warm low-end. Good music sets the emotional baseline for everything we do here.",
      });

      return opts;
    },
  },

  // ANU: Basketball, close companion, campus life, friendly competition
  anu: {
    greeting: ({ isTahiti, activity, mem }) => {
      if (activity === 'hoop') {
        return pick([
          "Swish! Nathan, step onto the court! Five shots each, loser buys smoothies!",
          "Nothing but net! Grab a basketball, let's see that shooting form.",
          "You showed up right in time for the three-point shootout!",
        ]);
      }
      if (mem.events.includes('anu_hoops')) {
        return pick([
          "Your jumper was looking sharp on the court earlier, Nathan! Rematch anytime.",
          "Ready for another five shots at the hoop, or taking a campus walk?",
        ]);
      }
      if (isTahiti) {
        return pick([
          "You found the good spot! Told you the view was worth the climb.",
          "Tahiti feels like an endless vacation with all our favorite people.",
          "Hey Nathan! Hard to believe we went from campus labs to an island retreat.",
        ]);
      }
      // Island 1 (Monsoon Campus / TCE)
      return pick([
        "You found TCE! There is always an event or a hackathon happening here.",
        "Hey Nathan! Campus walks between classes are still the best part of the day.",
      ]);
    },
    choices: ({ isTahiti }) => {
      const opts = [];

      // Gameplay Action: Basketball shootout challenge
      opts.push({
        id: 'basketball-shootout',
        q: "You and me, five shots challenge on the hoop!",
        reply: "Game on! Step onto the ring and release Space in the green zone. Show me that arc!",
        action: 'tahiti-basket',
        onChoose: (sys, save, id) => sys.recordEvent(save, id, 'anu_hoops'),
      });

      // Personality: TCE Campus Memories & Hackathons
      opts.push({
        id: 'tce-memories',
        q: "Remember that hackathon crunch night at TCE?",
        reply: "Coding all night, cheering when the demo finally ran, and walking out to sunrise breakfast! Unforgettable.",
        followUps: [
          {
            q: "You always kept the team calm under pressure.",
            reply: "Someone had to! You were ready to rewrite the entire backend three hours before judging.",
          },
          {
            q: "Campus food breaks were legendary.",
            reply: "Hot tea, parotta, and debating the future until the lab lights shut off.",
          },
        ],
      });

      // Personality: Tahiti & The Journey
      opts.push({
        id: 'tahiti-journey',
        q: "How does it feel seeing everyone together here?",
        reply: "It feels like all the hard work paid off. Different chapters, but the same bond holding it all together.",
      });

      return opts;
    },
  },

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
