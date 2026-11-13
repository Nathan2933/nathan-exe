// Dialogue content for the talkable friends, keyed by canonical character id
// (see CANONICAL_MAP in conversation.js). Pure data: edit freely, the shared
// conversation controller in conversation.js decides what to show and when.
//
// Per character:
//   first      the very first conversation (shown once)
//   repeats    three conversations, rotated before any repeats
//   activity   [{ id, when(ctx), lines }]  used only while that activity is happening
//   topics     [{ id, q, lines, action?, when? }]  selectable replies. `action` is an
//              existing launch action and is only offered when `when(ctx)` is true.
//   goodbye    one short line when the player says Bye
//
// Lines: n() Nathan, c() the character, s(name, text) anyone else.
// House rules: English, short, natural, no double hyphens, no free-text input.

const n = (t) => ({ s: 'Nathan', t });
const c = (t) => ({ t });
const s = (who, t) => ({ s: who, t });

const onTahiti = (ctx) => ctx.level === 'tahiti';

export const BANK = {
  guru: {
    first: [n('You taking the scooty out?'), c('Yeah. You coming, or are you supervising the island again?'), n('Make room.'), c('Get on, then.')],
    repeats: [
      [n('What are you reading?'), c('History. I opened one article and somehow ended up three centuries earlier.')],
      [n('Code working?'), c('It was. Then I had an idea.')],
      [n('Where would you go next?'), c("Somewhere we can walk around without a schedule. I'll do the research before we leave.")],
    ],
    activity: [{ id: 'coding', when: (x) => x.act === 'coding', lines: [n('Can I borrow you?'), c("Let me save this. Otherwise neither of us is going anywhere.")] }],
    topics: [
      { id: 'ride', q: 'Go for a ride', action: 'scooter-ride', lines: [c('Hop on. I know a road with almost no potholes.')] },
      { id: 'reading', q: 'What are you reading?', lines: [c('Something on the Silk Road. Traders swapped far more than silk, ideas travelled the same way.')] },
      { id: 'code', q: "How's the code?", lines: [c('It compiles. Ask me again after I stop touching it.')] },
      { id: 'next', q: 'Where next?', lines: [c('Somewhere old. A fort, a market, a street that has been the same for centuries.')] },
    ],
    goodbye: "Come find me when you're ready.",
  },

  vijay: {
    first: [c('Good to see you back here. How have you been?'), n('Busy. You?'), c("Same. Somehow there's still time for a school reunion."), n('Does this count as one?'), c('Two people and a good bench. Officially yes.')],
    repeats: [
      [n('Still remember that argument with the lecturer?'), c('One by zero is infinity. I still stand by it.'), n('You certainly made that class unforgettable.'), c('At least we got a good story out of it.')],
      [n('Still following politics?'), c("Yes, but today's discussion comes with snacks."), n('Now that sounds promising.'), c('Debates go better when nobody is hungry.')],
      [n('Can we have one peaceful conversation?'), c('Definitely. Tea first, world problems later.'), n('I was hoping you would say that.'), c('I contain multitudes. Also biscuits.')],
      [n('Look at us, back where it started.'), c('Some things never change. The bell still rings at the worst possible moment.'), n('You always said that.'), c('And I was always right.')],
    ],
    activity: [
      { id: 'news', when: (x) => x.act === 'news', lines: [n('Anything good in the paper?'), c('Plenty to discuss. Pull up a chair, I will start with the crossword.'), n('That is not politics.'), c('It is if you argue about the answers.')] },
    ],
    topics: [
      { id: 'lecturer', q: 'Remember the lecturer?', lines: [n('Still remember that argument with the lecturer?'), c('One by zero is infinity. I still stand by it.'), n('You certainly made that class unforgettable.'), c('At least we got a good story out of it.')] },
      { id: 'politics', q: 'Still following politics?', lines: [c("Yes, but today's discussion comes with snacks."), n('Now that sounds promising.'), c('A good debate needs two sides and one plate of something crunchy.')] },
      { id: 'peace', q: 'One peaceful chat?', lines: [c('Definitely. Tea first, world problems later.'), n('Deal.'), c('See? I can be reasonable. Once in a while.')] },
      { id: 'school', q: 'Remember school?', lines: [c('Of course. Same uniform, bigger opinions.'), n('Mine were smaller.'), c('Yours came with better handwriting.')] },
      { id: 'island', q: 'What do you think of this place?', when: (x) => x.level !== 'tahiti', lines: [c('Very peaceful. Ideal for a debate. Not that I am looking for one.'), n('Sure you are not.'), c('Fine, a small one.')] },
      { id: 'tahiti-break', q: 'Taking a break?', when: onTahiti, lines: [c('Yes. Even world affairs can wait until after tea.'), n('Even the big ones?'), c('The big ones wait the longest. They are used to it.')] },
    ],
    goodbye: 'Come back soon. I will save you a seat and the last biscuit.',
  },

  harish: {
    first: [n('Still studying?'), c('Yeah. Come sit for a bit. How have you been?'), n('Pretty good. Busy, but good.'), c("Glad to hear it. It's nice out here today.")],
    repeats: [
      [n('Need anything?'), c("I'm good. There's space here if you want some company."), n('Maybe for a minute.'), c('Take your time. No rush on my side either.')],
      [n('What are you reading?'), c('Just going over my notes. Some of it is starting to make sense.'), n('That is the hard part.'), c('It is. Slowly, though.')],
      [n('How is the studying going?'), c('Steady. A little each day adds up more than you would think.'), n('That sounds like a good plan.'), c('It works for me. How about you?')],
    ],
    activity: [
      { id: 'study', when: (x) => x.act === 'study', lines: [n('Mind if I interrupt?'), c('Not at all. I was glad for the break.'), n('You sure?'), c('Honestly, yes. Sit down. Tell me what you have been up to.')] },
    ],
    topics: [
      { id: 'sit', q: 'Mind if I stay a while?', lines: [c('Of course not. It is nicer with company.'), n('Thanks, Harish.'), c('Anytime.')] },
      { id: 'notes', q: 'Can I see your notes?', lines: [c('Sure, though my handwriting is not the best.'), n('It looks neat to me.'), c('Kind of you to say. I try.')] },
      { id: 'help', q: 'Can I help with anything?', lines: [c('That is thoughtful. I am fine right now, but ask me if you ever need a hand.'), n('I will.'), c('Same goes for me.')] },
      { id: 'spot', q: 'Nice spot you have here', lines: [c('Thanks. Good light, a bit of green, and it is quiet.'), n('I can see why you picked it.'), c('It helps me focus. Most days.')] },
    ],
    goodbye: 'Take care, Nathan. Come back whenever you like.',
  },

  prince: {
    first: [n("You've been playing all afternoon?"), c('Went for a run first.'), n('And lunch?'), c('I knew you were going to ask.')],
    repeats: [
      [n('What are you testing?'), c('My login flow. Seeing what happens when I give it something unexpected.')],
      [n('Another match?'), c('If you\'re staying. You went for tea halfway through the last one.')],
      [n('Taking a break?'), c('After this round. Then I should probably eat.')],
    ],
    activity: [{ id: 'gaming', when: (x) => x.act === 'gaming', lines: [n("Who's winning?"), c('Ask after this.'), s('Arok', 'He said that last round.'), c('And I meant it then too.')] }],
    topics: [
      { id: 'round', q: 'Play a round', action: 'tahiti-tvgame', when: onTahiti, lines: [c("Controller's on the left. Try not to pick the same character again.")] },
      { id: 'round-chat', q: 'Play a round', when: (x) => !onTahiti(x), lines: [c('Soon. The good setup is on Tahiti. Come over when you fly out.')] },
      { id: 'cyber', q: 'Talk cybersecurity', lines: [c('Most breaches are boring. Reused passwords, forgotten updates. The clever stuff is rare.')] },
      { id: 'training', q: "How's training?", lines: [c('Fine. Running three days a week, lifting two. Sleep is the part I keep skipping.')] },
    ],
    goodbye: 'See you. Bring your game next time.',
  },

  jeswin: {
    first: [n('You designed this whole building?'), c('Yeah. Come over here. You can see the entrance better.'), n("And that's the model?"), c('The earlier version. I changed a few things.')],
    repeats: [
      [n('What changed?'), c('The entrance felt cramped. I opened up the space in front.')],
      [n("How's the black bike?"), c('Good. Trying to keep the sand off it is the difficult part.')],
      [n('You made that out of sand?'), c("Yeah. Careful where you put your hand. That's the courtyard.")],
    ],
    activity: [{ id: 'drafting', when: (x) => x.act === 'drafting', lines: [n('Need a hand?'), c("Hold this drawing flat. I'll show you how the model fits the plan.")] }],
    topics: [
      { id: 'building', q: 'Show me the building', lines: [c('Stand here. Low and wide, with the entrance pulled forward so you read it from the lawn.'), c('The terracotta bands mark each step in the roof.')] },
      { id: 'model', q: 'Explain the model', lines: [c('Same plan, one to fifty. I test the light on it before anyone pours anything.')] },
      { id: 'bike', q: "How's the bike?", lines: [c('Black, quiet, and already dusty. It stays by the entrance so I can leave quickly.')] },
      { id: 'sand', q: 'Build with sand', lines: [c('Wet sand, a flat tray, and patience. Courtyards first, walls second.')] },
    ],
    goodbye: "Come back later. I'll show you what I change.",
  },

  arok: {
    first: [n('Are you live?'), c('Yeah.'), n('Should I leave?'), c("Stay. Just don't stand in front of the screen.")],
    repeats: [
      [n('How did the stream go?'), c("Good. Moved the mic. Audio's much better now.")],
      [n('Editing?'), c('Just cutting a clip. Wait, watch this part.')],
      [n("You're quiet today."), c("Listening. You've been talking for five minutes.")],
    ],
    activity: [{ id: 'stream', when: (x) => x.act === 'stream', lines: [n('Can I join?'), c('After this round. Pull up a chair.')] }],
    topics: [
      { id: 'streaming', q: 'What are you streaming?', lines: [c('Ranked matches, mostly. Chat picks the next game when I lose.')] },
      { id: 'channel', q: "How's the channel?", lines: [c('Slow and steady. A few more people each week, and they actually stay.')] },
      { id: 'join', q: 'Join the game', action: 'tahiti-tvgame', when: onTahiti, lines: [c("Grab the second controller. Don't wave at the camera.")] },
      { id: 'join-chat', q: 'Join the game', when: (x) => !onTahiti(x), lines: [c('Come to the hideout on Tahiti. There is a spare chair.')] },
    ],
    goodbye: 'Catch you later.',
  },

  shabeer: {
    first: [n('Is that a savings goal?'), c('Yes. Small amounts, every week, no skipping.'), n('How close are you?'), c('Closer than last month. That counts.')],
    repeats: [
      [n('What are you learning now?'), c('How compound interest works. I read the same chapter three times.')],
      [n('Budget still holding?'), c('Mostly. One snack run nearly broke it, but the plan survived.')],
      [n('Which book should I read first?'), c("Start with the thin one on budgeting. It's the only one I finished twice.")],
    ],
    activity: [{ id: 'saving', when: (x) => /finance|budget|saving/.test(x.act || ''), lines: [n('Counting the coins again?'), c('Checking the plan. Coins are just the proof.')] }],
    topics: [
      { id: 'budget', q: 'How do you budget?', lines: [c('Needs first, then savings, then fun. I write all three down before the month starts.')] },
      { id: 'saving', q: 'Tips for saving?', lines: [c('Move the money the day you get it. What you never see, you never spend.')] },
      { id: 'learning', q: 'What are you reading?', lines: [c('A book on money habits. It says small choices beat big plans. I like that.')] },
      { id: 'goal', q: "What's the goal on the board?", lines: [c('An emergency fund first. Then a camera upgrade, if the plan allows it.')] },
    ],
    goodbye: 'Keep an eye on the progress bars. See you around.',
  },

  harris: {
    first: [n('Recommend something for tonight.'), c('Film or series?'), n('Something I can finish tonight.'), c('Good. That rules out half my list.')],
    repeats: [
      [n('Looking at the Marvel stand again?'), c('Look at the Spider-Man detail. Properly this time.')],
      [n('No spoilers.'), c("Fine. You're getting the title and absolutely nothing else.")],
      [n("How's the plane?"), c('Ready. The pilot is waiting for you to pick a destination.')],
    ],
    activity: [{ id: 'terminal', when: (x) => x.atTerminal, lines: [c('Heading out?')] }],
    topics: [
      { id: 'film', q: 'Recommend a film', lines: [c('Into the Spider-Verse. It looks like nothing else and it is only two hours.')] },
      { id: 'series', q: 'Recommend a series', lines: [c('Sherlock. Short seasons, so you can actually finish one.')] },
      { id: 'spidey', q: 'Talk Spider-Man', lines: [c('The best bit is that he keeps getting back up. Everything else is just great suits.')] },
    ],
    goodbye: "Come find me when you've watched it.",
  },

  anu: {
    first: [n('One shot?'), c('You said that last time.'), n("This one's going in."), c('Go on, then.')],
    repeats: [
      [n('You cleaned this place?'), c('There were cups everywhere. Take those over for me?')],
      [n('Basketball or handball today?'), c("Basketball. You're already here. Pick up the ball.")],
      [n('Remember that cake?'), c('Twenty-sixth December? Of course I remember.')],
    ],
    activity: [{ id: 'court', when: (x) => x.act === 'hoop', lines: [n('From here?'), c('A little farther back. There. Now shoot.')] }],
    topics: [
      { id: 'hoops', q: 'Shoot some hoops', action: 'tahiti-basket', when: onTahiti, lines: [c('Five shots each. Loser carries the ball back.')] },
      { id: 'hoops-chat', q: 'Shoot some hoops', when: (x) => !onTahiti(x), lines: [c('The good court is on Tahiti. Next time you fly out.')] },
      { id: 'handball', q: 'How was handball?', lines: [c('Fast. My hands are still ringing. We won the last point, so I am allowed to say that.')] },
      { id: 'cake', q: 'Remember that cake?', lines: [c('Twenty-sixth December. I remember.')] },
    ],
    goodbye: 'See you. Come back for another game.',
  },

  shabesh: {
    first: [n('Ready for the photo?'), c('Move a little left.'), n('Here?'), c('Yeah. Stay there. Let me get the camera.')],
    repeats: [
      [n("Where's your camera?"), c('On the table. Under the other stuff.')],
      [n('Started the video?'), c("I've got the idea. Now I need to actually shoot it.")],
      [n('Any new LARP ideas?'), c('Yeah. I need someone who\'ll stay in character. Interested?')],
    ],
    activity: [{ id: 'photo', when: (x) => x.act === 'photo_sh', lines: [n('Can you fit the background?'), c("Yeah. I'm going wider. Stay in the middle.")] }],
    topics: [
      { id: 'photo', q: 'Take my photo', action: 'tahiti-photo', when: onTahiti, lines: [c('Wide shot, you in the centre. Look at the horizon, not at me.')] },
      { id: 'making', q: 'What are you making?', lines: [c('A short video. Half of it is planned. The other half is whatever the light does.')] },
      { id: 'larp', q: 'Any LARP ideas?', lines: [c('A traveller who loses his map and refuses to admit it. You would be perfect.')] },
    ],
    goodbye: "I'll show you the result later.",
  },

  logeshwaran: {
    first: [n('Did you check that thing I sent?'), c('Yeah. The demo looked good.'), n('But?'), c('I checked how they tested it.')],
    repeats: [
      [n('Which one would you choose?'), c('What are you using it for? That changes the answer.')],
      [n('Still researching?'), c('Found the documentation. The video left a few things out.')],
      [n('Give me the short version.'), c("It works, but there's a limit. Want to see where?")],
    ],
    activity: [{ id: 'research', when: (x) => /sit|type|phone|laptop/.test(x.pose || ''), lines: [n('These results look different.'), c("Exactly. They didn't test under the same conditions.")] }],
    topics: [
      { id: 'found', q: 'What did you find?', lines: [c('The headline number only holds on the best hardware. On normal setups it is about half.')] },
      { id: 'compare', q: 'Compare some tools', lines: [c('Tell me what you need first. Then I will pick two and explain what each one gives up.')] },
      { id: 'researching', q: 'What are you researching?', lines: [c('How people test battery claims. It is more interesting than it sounds.')] },
    ],
    goodbye: 'Send me the link if you find anything else.',
  },

  thianesh: {
    first: [n('How many sets left?'), c('Two. Come spot me.'), n('Then food?'), c('Obviously.')],
    repeats: [
      [n('You ordered already?'), c('I was hungry. Ordered yours too.')],
      [n('Rest day?'), c("Yeah. Just came to see who's training.")],
      [n('How was the weekend?'), c('Quiet. Slept, ate, and watched the sea for a while.')],
    ],
    activity: [{ id: 'lifting', when: (x) => /gym|lift|train/.test(x.act || '') || /lift|flex|squat|exercise/.test(x.pose || ''), lines: [c('Last rep. Stay close.'), n("I'm here. You've got it.")] }],
    topics: [
      { id: 'train', q: 'Train together', lines: [c('Legs tomorrow. Do not pretend you forgot.')] },
      { id: 'feast', q: 'Food challenge', action: 'tahiti-feast', when: onTahiti, lines: [c('Timed, and no sharing. Sit down.')] },
      { id: 'feast-chat', q: 'Food challenge', when: (x) => !onTahiti(x), lines: [c('The proper table is on Tahiti. I am saving my appetite.')] },
      { id: 'sea', q: 'How is the island?', lines: [c('Warm, loud, and the sunsets are unfair. I could stay here.')] },
      { id: 'workout', q: "What's today's workout?", lines: [c('Chest and arms. Then whatever is on the menu.')] },
    ],
    goodbye: "Don't disappear when it's time to train.",
  },

  akshai: {
    first: [n('One match?'), c('You said one yesterday.'), n('We won, though.'), c('Sit down.')],
    repeats: [
      [n('Who are you picking?'), c('Waiting to see what the team needs.')],
      [n('Taking the bike?'), c('In a bit. Coming?')],
      [n('Bad match?'), c('Bad decisions. Mine too.')],
    ],
    activity: [{ id: 'gaming', when: (x) => x.act === 'tvgame', lines: [n('Where should I go?'), c('Stay with me. Watch that corner.')] }],
    topics: [
      // Valorant is not in the game, so this stays a conversation rather than a launch button
      { id: 'valorant', q: 'Play Valorant', lines: [c('Later tonight. I am queuing up with the usual group.')] },
      { id: 'match', q: 'Talk about the match', lines: [c('We lost round nine because everyone went left. I called right. Twice.')] },
      { id: 'ride', q: 'Go for a ride', lines: [c('Soon. The bike needs fuel first, and I need a good playlist.')] },
    ],
    goodbye: 'Let me know when you\'re playing.',
  },

  pranav: {
    first: [n('Taking a break?'), c('After I finish this.'), n('How long?'), c('Longer if you keep asking.')],
    repeats: [
      [n('Need help?'), c('Check this. Tell me if anything feels wrong.')],
      [n('Done?'), c("Yeah. Just checking it once more.")],
      [n('Coming for a walk?'), c('All right. Let me save.')],
    ],
    activity: [{ id: 'working', when: (x) => /type|sittype|phone|laptop/.test(x.pose || ''), lines: [n('Quick question.'), c('Go on. Start with the question.')] }],
    topics: [
      { id: 'work', q: 'What are you working on?', lines: [c('A report that is almost finished. Almost has been the status for two days.')] },
      { id: 'hand', q: 'Need a hand?', lines: [c('Read the last page and tell me if it makes sense. Fresh eyes help.')] },
      { id: 'break', q: 'Take a break', lines: [c('Fine. Ten minutes. Walk first, I will explain what I broke on the way.')] },
    ],
    goodbye: 'Catch you later.',
  },

  sathesh: {
    first: [n('Found a good spot?'), c("Over there. Light's better."), n('You checked already?'), c('Took a few photos before you came.')],
    repeats: [
      [n('Why this angle?'), c('Less clutter in the background. Come stand here.')],
      [n('Show me the photos.'), c('Give me a minute. Picking the good ones.')],
      [n('Another medical OD?'), c("You're keeping count? Come on, I wanted to show you something.")],
    ],
    activity: [{ id: 'photo', when: (x) => x.act === 'photo_sa' || x.act === 'photowalk_ol', lines: [c("Wait. The light's changing."), n('Now?'), c('Yeah. Look this way.')] }],
    topics: [
      { id: 'photos', q: 'Show me the photos', lines: [c('This one, the harbour. Soft light, no people. Rare.')] },
      { id: 'walk', q: 'Take a walk', lines: [c('Sure. I always find a spot when I am not looking for one.')] },
      { id: 'spot', q: 'Found another photo spot?', lines: [c('Maybe. A wall with good shadows. I will check it at golden hour.')] },
    ],
    goodbye: "I'll send you the photos.",
  },

  naveen: {
    first: [n('Got five minutes?'), c('Yeah. Sit down.'), n('Actually five this time.'), c('Tell me what happened first.')],
    repeats: [
      [n('What time is it?'), c("Probably later than you want. We've been here a while.")],
      [n('Can I run something past you?'), c("Of course. Tell me what you've got.")],
      [n('Walk? Nowhere in particular.'), c('Yeah. Works for me.')],
    ],
    activity: [{ id: 'project', when: (x) => /type|sittype|phone|laptop/.test(x.pose || ''), lines: [n('Something feels missing.'), c("Show me the flow. Let's go through it from the beginning.")] }],
    topics: [
      { id: 'catch', q: 'Catch up', lines: [c("Start wherever. I'm not in a hurry.")] },
      { id: 'project', q: 'Talk about the project', lines: [c('What is it supposed to do? Then we check whether it actually does that.')] },
      { id: 'walk', q: 'Walk with me', lines: [c('Lead the way. We can talk or not.')] },
    ],
    goodbye: 'Come back if you want to talk.',
  },

  sivasuthan: {
    first: [n('The board looks busy today.'), c('Green on the left, red on the right. Both are teaching me something.'), n('Which one is louder?'), c('The red. It always is.')],
    repeats: [
      [n('Do you trade a lot?'), c('Less than I research. Patience pays better than excitement.')],
      [n('You track everything you spend?'), c('Enough to know where it goes. The small things add up.')],
      [n("You've gone quiet."), c("Thinking about whether a thing is worth its price, or only its noise.")],
    ],
    activity: [{ id: 'finance', when: (x) => /finance|ledger|market/.test(x.act || '') || /type|sittype|phone|laptop/.test(x.pose || ''), lines: [n('Complicated?'), c("Less once I write it down. Come, I'll show you the ledger.")] }],
    topics: [
      { id: 'invest', q: 'How do you invest?', lines: [c('Slowly, and in things I understand. Diversify, then leave it alone.')] },
      { id: 'risk', q: 'What about risk?', lines: [c('Know what you can lose before you chase what you can win.')] },
      { id: 'mind', q: 'Any philosophy for money?', lines: [c('The Stoics said wealth is what you do not need. I think about that before every purchase.')] },
      { id: 'walk', q: 'Take a walk', lines: [c('Good idea. I think better when I am moving.')] },
    ],
    goodbye: 'Good talking to you. See you around.',
  },
};

// The flight offer, shown when Harris is at the terminal. `dest` is the correct destination.
export const FLIGHT_CHOICE = {
  tahiti: { q: "Let's fly to Tahiti.", action: 'fly-tahiti' },
  island1: { q: "Let's fly home to Origin Isle.", action: 'fly-home' },
};
