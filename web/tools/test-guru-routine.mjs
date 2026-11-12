/* Comprehensive verification test for Guru Island 01 routine */
import { createGuruRoutine, GURU_STATE } from '../src/game/guru.js';

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error('FAIL: ' + message);
    process.exitCode = 1;
  } else {
    passedTests++;
    console.log('PASS: ' + message);
  }
}

async function runTests() {
  console.log('Starting Guru Island 01 Routine verification suite...\n');

  /* Mock 3D Character */
  class MockCharacter {
    constructor() {
      this.group = {
        position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }
      };
      this.heading = 0;
      this.pose = null;
      this.steer = 0;
      this.anim = null;
      this.lookingAt = null;
    }
    update(dt, v, t) {}
    play(anim) { this.anim = anim; }
    lookAt(target) { this.lookingAt = target; }
  }

  /* Mock Scooty Model */
  class MockScootyModel {
    constructor() {
      this.group = {
        position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
        rotation: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }
      };
      this.bars = { rotation: { y: 0 } };
      this.wheels = [{ rotation: { x: 0 } }, { rotation: { x: 0 } }];
    }
  }

  /* Mock Game Context */
  function createMockGame() {
    const guruChar = new MockCharacter();
    const playerChar = new MockCharacter();
    const scootyModel = new MockScootyModel();

    const guruNpc = {
      id: 'guru',
      npcId: 'guru',
      character: guruChar,
      x: -6.5,
      z: -37.72,
      hit: { position: { x: -6.5, y: 1.3, z: -37.72, set(x, y, z) { this.x = x; this.y = y; this.z = z; } } },
      beacon: { group: { position: { x: -6.5, y: 0, z: -37.72, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, visible: true } }
    };

    const scootyInteractable = {
      id: 'vehicle:scooty',
      kind: 'vehicle',
      vtype: 'scooty',
      model: scootyModel,
      x: -5.0,
      z: -36.6,
      heading: (-15 * Math.PI) / 180,
      hit: { position: { x: -5.0, y: 1.3, z: -36.6, set(x, y, z) { this.x = x; this.y = y; this.z = z; } } },
      beacon: { group: { position: { x: -5.0, y: 0, z: -36.6, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, visible: true } }
    };

    const state = {
      passengerOf: null,
      talkingTo: null
    };

    const ctx = {
      state,
      player: playerChar,
      camera: {},
      heightAt: (x, z) => 0.0,
      toast: (msg) => {},
      sfx: { play: () => {} },
      dialogue: { open: false, close: () => {} },
      solidFree: (x, z) => true,
      nav: { isWalkable: () => true },
      velocity: { set: () => {} },
      world: {
        npcs: [guruNpc],
        interactables: [scootyInteractable],
        colliders: [],
        floors: []
      }
    };

    return { ctx, guruNpc, scootyInteractable, guruChar, playerChar, scootyModel };
  }

  /* Test 1: Active Coding Duration (30s) */
  console.log('== Test 1: Active Coding Duration (30s) ==');
  {
    const { ctx, guruChar } = createMockGame();
    const routine = createGuruRoutine(ctx);
    routine.enter();

    assert(routine.getRoutinePhase() === GURU_STATE.CODING, 'Routine starts in CODING phase');
    assert(guruChar.pose === 'sittype', 'Guru starts seated and typing at PC');

    /* Simulate 29 seconds of active gameplay */
    for (let i = 0; i < 290; i++) {
      routine.update(0.1, i * 0.1);
    }
    assert(routine.getRoutinePhase() === GURU_STATE.CODING, 'Still CODING at 29 seconds');

    /* Cross the 30.0 second threshold */
    for (let i = 0; i < 11; i++) {
      routine.update(0.1, 29.0 + i * 0.1);
    }
    assert(routine.getRoutinePhase() === GURU_STATE.BREAK, 'Transitions to BREAK after exactly 30 seconds of active gameplay');
  }

  /* Test 2: Break Stretch & Walk to Scooty */
  console.log('\n== Test 2: Break Stretch & Walk to Scooty ==');
  {
    const { ctx, guruChar } = createMockGame();
    const routine = createGuruRoutine(ctx);
    routine.enter();

    /* Advance through 30s coding */
    for (let i = 0; i < 301; i++) routine.update(0.1, i * 0.1);
    assert(routine.getRoutinePhase() === GURU_STATE.BREAK, 'Guru is in BREAK phase');
    assert(guruChar.anim === 'flex', 'Guru plays flex stretch animation during break');

    /* Break duration is ~1.6s */
    for (let i = 0; i < 17; i++) routine.update(0.1, 30.1 + i * 0.1);
    assert(routine.getRoutinePhase() === GURU_STATE.WALK_TO_SCOOTY, 'Guru transitions to WALK_TO_SCOOTY');
    assert(guruChar.pose === null, 'Guru stands upright to walk');

    /* Guru walks toward scooty mount point */
    let walkSteps = 0;
    while (routine.getRoutinePhase() === GURU_STATE.WALK_TO_SCOOTY && walkSteps < 100) {
      routine.update(0.1, 32.0 + walkSteps * 0.1);
      walkSteps++;
    }
    assert(routine.getRoutinePhase() === GURU_STATE.MOUNT, 'Guru reaches scooty and enters MOUNT phase naturally');
    assert(walkSteps > 5, `Guru walked realistically (${walkSteps} steps) without teleporting`);
  }

  /* Test 3: Mount, Scooty Pose, and Riding */
  console.log('\n== Test 3: Mount, Scooty Pose, and Riding ==');
  {
    const { ctx, guruChar } = createMockGame();
    const routine = createGuruRoutine(ctx);
    routine.enter();

    /* Fast-forward to MOUNT */
    while (routine.getRoutinePhase() !== GURU_STATE.MOUNT) {
      routine.update(0.1, 0);
    }
    assert(guruChar.pose === 'scooty', 'Guru assumes scooty seated riding pose');
    assert(routine.isGuruMounted() === true, 'isGuruMounted() reports true');

    /* Mount settles in ~0.6s then enters RIDING */
    for (let i = 0; i < 7; i++) routine.update(0.1, 0);
    assert(routine.getRoutinePhase() === GURU_STATE.RIDING, 'Transitions to RIDING road network');

    /* Test riding simulation across road waypoints */
    let rideSteps = 0;
    let maxSteerSeen = 0;
    while (routine.getRoutinePhase() === GURU_STATE.RIDING && rideSteps < 3000) {
      routine.update(0.1, rideSteps * 0.1);
      if (Math.abs(guruChar.steer) > maxSteerSeen) maxSteerSeen = Math.abs(guruChar.steer);
      rideSteps++;
    }

    assert(rideSteps > 100, `Riding followed road network for realistic duration (${rideSteps} steps)`);
    assert(maxSteerSeen > 0.05, `Handlebars steered realistically into turns (max steer: ${maxSteerSeen.toFixed(3)})`);
    assert(routine.getRoutinePhase() === GURU_STATE.RETURN, 'Returns to workstation and enters RETURN phase');
  }

  /* Test 4: Return, Parking, Dismount, and Loop Repeat */
  console.log('\n== Test 4: Return, Parking, Dismount, and Loop Repeat ==');
  {
    const { ctx, guruChar, scootyInteractable } = createMockGame();
    const routine = createGuruRoutine(ctx);
    routine.enter();

    /* Fast forward to RETURN phase */
    while (routine.getRoutinePhase() !== GURU_STATE.RETURN) {
      routine.update(0.1, 0);
    }
    assert(routine.getRoutinePhase() === GURU_STATE.RETURN, 'Guru is at workstation in RETURN phase');

    /* Verify scooty coordinates are parked at PARK_POS */
    assert(Math.abs(scootyInteractable.x - (-5.0)) < 0.01, `Scooty X parked correctly (${scootyInteractable.x})`);
    assert(Math.abs(scootyInteractable.z - (-36.6)) < 0.01, `Scooty Z parked correctly (${scootyInteractable.z})`);

    /* Advance dismount */
    for (let i = 0; i < 6; i++) routine.update(0.1, 0);
    assert(routine.getRoutinePhase() === GURU_STATE.WALK_TO_PC, 'Guru dismounts and enters WALK_TO_PC');

    /* Walk back to PC */
    let walkBackSteps = 0;
    while (routine.getRoutinePhase() === GURU_STATE.WALK_TO_PC && walkBackSteps < 100) {
      routine.update(0.1, walkBackSteps * 0.1);
      walkBackSteps++;
    }
    assert(routine.getRoutinePhase() === GURU_STATE.CODING, 'Guru arrives at desk and resumes CODING');
    assert(guruChar.pose === 'sittype', 'Guru resumes sittype coding pose at PC');

    /* Verify next 30s cycle starts */
    for (let i = 0; i < 290; i++) routine.update(0.1, i * 0.1);
    assert(routine.getRoutinePhase() === GURU_STATE.CODING, 'Second cycle remains in CODING at 29 seconds');
    for (let i = 0; i < 15; i++) routine.update(0.1, 29.0 + i * 0.1);
    assert(routine.getRoutinePhase() === GURU_STATE.BREAK, 'Second cycle transitions to BREAK after 30 seconds');
  }

  /* Test 5: Dialogue Interruption & Clean Resume */
  console.log('\n== Test 5: Dialogue Interruption & Clean Resume ==');
  {
    const { ctx, guruChar } = createMockGame();
    const routine = createGuruRoutine(ctx);
    routine.enter();

    /* Fast forward 15s into coding */
    for (let i = 0; i < 150; i++) routine.update(0.1, i * 0.1);
    assert(routine.getRoutinePhase() === GURU_STATE.CODING, '15s into CODING');

    /* Nathan approaches and talks to Guru */
    routine.pauseForDialogue();
    assert(guruChar.lookingAt !== null, 'Guru looks at Nathan during dialogue');

    /* Simulate 5 seconds in dialogue */
    for (let i = 0; i < 50; i++) routine.update(0.1, 15.0 + i * 0.1);
    assert(routine.getRoutinePhase() === GURU_STATE.CODING, 'Still in CODING during dialogue pause');

    /* Nathan closes dialogue */
    routine.resumeFromDialogue();
    assert(routine.getRoutinePhase() === GURU_STATE.CODING, 'Safely resumes CODING after conversation');
    assert(guruChar.pose === 'sittype', 'Restores sittype pose at workstation');
  }

  /* Test 6: Nathan Riding Along as Passenger */
  console.log('\n== Test 6: Passenger Ride with Nathan ==');
  {
    const { ctx, playerChar } = createMockGame();
    const routine = createGuruRoutine(ctx);
    routine.enter();

    /* Fast-forward to RIDING */
    while (routine.getRoutinePhase() !== GURU_STATE.RIDING) {
      routine.update(0.1, 0);
    }

    /* Nathan hops on as passenger */
    routine.boardNathanAsPassenger();
    assert(routine.isPassengerActive() === true, 'Passenger active is true');
    assert(ctx.state.passengerOf === 'guru', 'state.passengerOf is set to guru');
    assert(playerChar.pose === 'ride', 'Nathan adopts ride pose');
    assert(playerChar.riding === true, 'Nathan playerChar.riding is true when boarded');

    /* Ride for a few seconds */
    routine.update(0.1, 1.0);
    routine.update(0.1, 1.1);

    /* Verify Nathan is seated on the passenger seat BEHIND Guru */
    const { guruChar, scootyInteractable } = { guruChar: ctx.world.npcs[0].character, scootyInteractable: ctx.world.interactables[0] };
    const h = scootyInteractable.heading;
    const forwardX = Math.sin(h);
    const forwardZ = Math.cos(h);
    // Relative vector from Guru to Nathan
    const relX = playerChar.group.position.x - guruChar.group.position.x;
    const relZ = playerChar.group.position.z - guruChar.group.position.z;
    const forwardDot = relX * forwardX + relZ * forwardZ;
    assert(forwardDot < -0.2, `Nathan is seated behind Guru along heading (forwardDot: ${forwardDot.toFixed(3)})`);
    assert(Math.abs(forwardDot - (-0.36)) < 0.05, `Nathan sits at exact rear passenger distance (~0.36m behind Guru)`);

    /* Nathan chooses to dismount early */
    routine.dismountNathanPassenger();
    assert(routine.isPassengerActive() === false, 'Passenger active is false after dismount');
    assert(ctx.state.passengerOf === null, 'state.passengerOf is cleared');
    assert(playerChar.pose === null, 'Nathan pose restored to normal standing');
    assert(playerChar.riding === false, 'Nathan playerChar.riding is false after dismount');
  }

  /* Test 7: Player X-Ray Ghost Silhouette Disabling While Riding */
  console.log('\n== Test 7: Player X-Ray Silhouette Toggling While Riding ==');
  {
    globalThis.document = {
      createElement: () => ({
        getContext: () => ({ fillRect(){}, createPattern(){}, fill(){}, stroke(){} })
      })
    };
    const { Player } = await import('../src/game/player.js');
    const player = new Player();
    assert(player._xrayGhosts && player._xrayGhosts.length > 0, `Player has ${player._xrayGhosts.length} X-ray ghost meshes`);
    assert(player.riding === false, 'Player is not riding by default');

    // Walk / Idle update
    player.update(0.1, { x: 0, y: 0, z: 0 }, 0);
    assert(player._xrayGhosts.every((g) => g.visible === false), 'X-ray ghosts stay hidden while no large structure blocks Nathan');
    player.xrayBlocked = true;
    player.update(0.1, { x: 0, y: 0, z: 0 }, 0);
    assert(player._xrayGhosts.every((g) => g.visible === true), 'All X-ray ghosts are visible while a building blocks Nathan');

    // Mount scooty or bike
    player.riding = true;
    player.update(0.1, { x: 0, y: 0, z: 0 }, 0);
    assert(player.riding === true, 'Player reports riding === true');
    assert(player._xrayGhosts.every((g) => g.visible === false), 'All X-ray ghosts are hidden while riding');

    // Dismount
    player.riding = false;
    player.pose = null;
    player.update(0.1, { x: 0, y: 0, z: 0 }, 0);
    assert(player.riding === false, 'Player reports riding === false after dismount');
    assert(player._xrayGhosts.every((g) => g.visible === true), 'All X-ray ghosts are restored after dismount');

    // Also verify riding pose automatically hides X-ray even without explicit riding flag
    player.pose = 'ride';
    assert(player.riding === true, 'Pose ride automatically sets player.riding');
    player.update(0.1, { x: 0, y: 0, z: 0 }, 0);
    assert(player._xrayGhosts.every((g) => g.visible === false), 'All X-ray ghosts are hidden in ride pose');
  }

  console.log(`\nGuru Routine verification complete: ${passedTests}/${totalTests} tests passed.`);
}

runTests();
