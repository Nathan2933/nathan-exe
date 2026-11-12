/* Verification test suite for immediate exterior-to-interior reveal across all buildings */
import * as THREE from 'three';

if (typeof document === 'undefined') {
  global.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillRect: () => {},
        fillStyle: '',
        measureText: () => ({ width: 10 }),
        fillText: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        strokeRect: () => {},
        drawImage: () => {},
        createImageData: () => ({ data: [] }),
        getImageData: () => ({ data: [] }),
        putImageData: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
      }),
    }),
  };
}

const { KIT } = await import('../src/game/kit.js');

let total = 0, passed = 0;
function assert(cond, msg) {
  total++;
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    passed++;
    console.log('PASS:', msg);
  }
}

async function runTests() {
  console.log('--- Testing Gym Building (gym_building) ---');
  const gym = KIT.gym_building();
  assert(typeof gym.animate === 'function', 'Gym has animate function');
  assert(gym.api && typeof gym.api.isInside === 'function', 'Gym has api.isInside');

  // Outside gym: DX = 2.3, DW = 4.0, hd = 3.5. Nathan standing outside doorway at local (2.3, 4.5)
  gym.animate(0, { playerPos: { x: 2.3, z: 4.5 }, dt: 0.016 });
  assert(gym.api.isInside() === false, 'Outside gym at z = 4.5');

  // Approaching side walls: x = -4.5 (west wall), z = 2.0 (outside side wall)
  gym.animate(0.016, { playerPos: { x: -6.0, z: 2.0 }, dt: 0.016 });
  assert(gym.api.isInside() === false, 'Approaching gym side walls does not trigger interior reveal');

  // Stopping just outside doorway: z = 3.4 (threshold hd - T/2 = 3.5 - 0.15 = 3.35)
  gym.animate(0.032, { playerPos: { x: 2.3, z: 3.4 }, dt: 0.016 });
  assert(gym.api.isInside() === false, 'Stopping just outside entrance threshold stays outside');

  // Next rendered frame: stepping across doorway to z = 3.2
  gym.animate(0.048, { playerPos: { x: 2.3, z: 3.2 }, dt: 0.016 });
  assert(gym.api.isInside() === true, 'Crossed threshold into gym triggers inside immediately');

  // Sprinting test: Nathan sprints from z = 3.8 to z = 2.8 in 1 frame (swept line across doorway)
  const gymSprint = KIT.gym_building();
  gymSprint.animate(0, { playerPos: { x: 2.3, z: 3.8 }, dt: 0.016 });
  assert(gymSprint.api.isInside() === false, 'Before sprint starts outside');
  gymSprint.animate(0.016, {
    playerPos: { x: 2.3, z: 2.8 },
    prevPlayerPos: { x: 2.3, z: 3.8 },
    dt: 0.016,
  });
  assert(gymSprint.api.isInside() === true, 'Sprinting across doorway threshold reliably triggers inside on first frame');

  // Sprinting along side wall outside (x = 6.0, from z = 4.0 to z = 2.0)
  const gymSprintSide = KIT.gym_building();
  gymSprintSide.animate(0, { playerPos: { x: 6.0, z: 4.0 }, dt: 0.016 });
  gymSprintSide.animate(0.016, {
    playerPos: { x: 6.0, z: 2.0 },
    prevPlayerPos: { x: 6.0, z: 4.0 },
    dt: 0.016,
  });
  assert(gymSprintSide.api.isInside() === false, 'Sprinting outside side wall does not trigger entrance');

  console.log('\n--- Testing Guild Hall (guild_hall) ---');
  const guild = KIT.guild_hall();
  assert(typeof guild.animate === 'function', 'Guild Hall has animate function');
  assert(guild.api && typeof guild.api.isInside === 'function', 'Guild Hall has api.isInside');

  // Outside guild: DOOR = 2.2, hd = 3.5. Nathan standing outside at local (0, 4.5)
  guild.animate(0, { playerPos: { x: 0, z: 4.5 }, dt: 0.016 });
  assert(guild.api.isInside() === false, 'Outside Guild Hall at z = 4.5');

  // Approaching side walls: local x = 7.0, z = 0
  guild.animate(0.016, { playerPos: { x: 7.0, z: 0 }, dt: 0.016 });
  assert(guild.api.isInside() === false, 'Approaching Guild Hall east side wall does not trigger reveal');

  // Cross entrance threshold into Guild Hall (x = 0, z = 3.0)
  guild.animate(0.032, { playerPos: { x: 0, z: 3.0 }, dt: 0.016 });
  assert(guild.api.isInside() === true, 'Crossing Guild Hall doorway immediately reveals interior');

  // Exit back outside
  guild.animate(0.048, { playerPos: { x: 0, z: 4.5 }, dt: 0.016 });
  for (let f = 1; f <= 5; f++) {
    guild.animate(0.048 + 0.016 * f, { playerPos: { x: 0, z: 4.5 }, dt: 0.016 });
  }
  assert(guild.api.isInside() === false, 'Exiting Guild Hall restores exterior without delay');

  console.log('\n--- Testing Vanderlinde Hideout (hideout_house) ---');
  const hideout = KIT.hideout_house();
  assert(typeof hideout.animate === 'function', 'Hideout has animate function');

  // Sprint across hideout doorway
  hideout.animate(0, { playerPos: { x: 0, z: 5.5 }, dt: 0.016 });
  assert(hideout.api.isInside() === false, 'Outside hideout before sprint');
  hideout.animate(0.016, { playerPos: { x: 0, z: 4.0 }, prevPlayerPos: { x: 0, z: 5.5 }, dt: 0.016 });
  assert(hideout.api.isInside() === true, 'Sprinting across hideout doorway threshold triggers inside');

  // Immediate exit
  hideout.animate(0.032, { playerPos: { x: 0, z: 5.5 }, dt: 0.016 });
  for (let f = 1; f <= 5; f++) {
    hideout.animate(0.032 + 0.016 * f, { playerPos: { x: 0, z: 5.5 }, dt: 0.016 });
  }
  assert(hideout.api.isInside() === false, 'Immediate exit from hideout restores exterior');

  console.log(`\nCompleted Building Reveal tests: ${passed}/${total} passed.`);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
