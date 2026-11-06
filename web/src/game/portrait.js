// 32×32 pixel-art portrait of Nathan, shared by the HUD, dialogue and chapter
// screens so the character looks the same everywhere: curly hair, glasses,
// fair skin, two buck teeth, red checked shirt over a white tee.

const PAL = {
  '.': null,
  H: '#2a1d17', h: '#4a3326',          // hair
  S: '#f2d3bd', s: '#e2b99e',          // skin, shade
  p: '#f0b9a8',                         // blush
  E: '#1e1b2e',                         // brows, glasses frame
  G: '#dfe9ef',                         // lens glint
  K: '#2b2238', w: '#ffffff',          // eyes
  M: '#7a3b3b', T: '#ffffff',          // mouth, teeth
  W: '#faf8f2',                         // white tee
  R: '#b8393a', r: '#9c2f30', D: '#4a1f2a', // plaid
};

const ROWS = [
  '.........H...H....H...H.........',
  '............hHHhHHHh............',
  '..........hHHHhHHHhHHh..........',
  '........HhHHHhHHHhHHHHhH........',
  '.......HhHHHhHHHhHHHhHHhH.......',
  '......HHHHhHHHhHHHHhHHHHHH......',
  '......HhHHHHhHHHHhHHHHhHHH......',
  '......HHHhHHHHHhHHHHhHHHHH......',
  '.....HhHHHHHHHHHHHHHHHHHHhH.....',
  '.....HHHHHHHHHHHHHHHHHHHHHH.....',
  '......hHsHHSSSHHSSSHHHSsHH......',
  '......HHsSEEEESSSSEEEESsHH......',
  '......HHsEEEEEESSEEEEEEsHh......',
  '......HEEEGKwGEEEEGKwGEEEH......',
  '.......ssEGKKGESSEGKKGEss.......',
  '.......SsEEEEEESSEEEEEEsS.......',
  '.......SsSSSSSSsSSSSSSSsS.......',
  '........sSpSSSSssSSSSpSs........',
  '........sSSSSSSSSSSSSSSs........',
  '........sSSsMMMMMMMMsSSs........',
  '.........SSSSTTsTTsSSSS.........',
  '..........SSSTTSTTSSSS..........',
  '...........SSSSSSSSSS...........',
  '............SSSSSSSS............',
  '.............ssssss.............',
  '.............SSSSSS.............',
  '......RrRDRrDrWWWWRDRDRrRr......',
  '.....RDRrRrRDRWWWWDDrRrRDRr.....',
  '....RDRrRrRDRWWWWWWrRrRDRrRr....',
  '...RrRrRDRrRrWWWWWWRDRrRrRDRr...',
  '...rRrRDRrRrWWWWWWWWRrRrRDRrR...',
  '...RDRrRrRDRWWWWWWWWrRDRrRrRD...',
];

export const PORTRAIT_SIZE = 32;

/** Draw the portrait into a canvas (sized 32×32; scale it up with CSS). */
export function drawPortrait(canvas, bg = '#efe6d2') {
  canvas.width = canvas.height = PORTRAIT_SIZE;
  const g = canvas.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE); }
  ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = PAL[row[x]];
      if (!c) continue;
      g.fillStyle = c;
      g.fillRect(x, y, 1, 1);
    }
  });
  return canvas;
}

/** Data URL version for <img> tags in panels. */
let cached = null;
export function portraitURL() {
  if (!cached) cached = drawPortrait(document.createElement('canvas')).toDataURL();
  return cached;
}
