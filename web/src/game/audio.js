// Tiny synthesised sound design (no audio files to download). Off by default;
// the player turns it on from the Look row. Everything is generated with
// WebAudio oscillators and filtered noise so it stays light and retro.

let ctx = null, master = null, rainGain = null, enabled = false;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
  // looping filtered noise for rain
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  rainGain = ctx.createGain(); rainGain.gain.value = 0;
  src.connect(lp).connect(rainGain).connect(master); src.start();
  return ctx;
}

export function setSound(on) {
  enabled = on;
  if (on) { ensure(); ctx?.resume(); } else ctx?.suspend();
}
export const soundOn = () => enabled;

function tone(freq, dur, { type = 'square', vol = 0.12, slide = 0, delay = 0 } = {}) {
  if (!enabled || !ensure()) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  open: () => tone(660, 0.08, { vol: 0.08 }),
  close: () => tone(440, 0.06, { vol: 0.06 }),
  step: () => tone(120 + Math.random() * 30, 0.04, { type: 'triangle', vol: 0.05 }),
  talk: () => tone(520 + Math.random() * 120, 0.03, { vol: 0.03 }),
  memory: () => [784, 988, 1319].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.1, delay: i * 0.08 })),
  chapter: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { vol: 0.08, delay: i * 0.09 })),
  rep: () => tone(220, 0.12, { type: 'sawtooth', vol: 0.08, slide: 220 }),
  miss: () => tone(180, 0.18, { type: 'sawtooth', vol: 0.06, slide: -80 }),
  whistle: () => { tone(880, 0.35, { type: 'sine', vol: 0.09 }); tone(1175, 0.35, { type: 'sine', vol: 0.06 }); },
  echo: () => [880, 660, 494, 370].forEach((f, i) => tone(f, 0.22, { type: 'sine', vol: 0.09 - i * 0.015, delay: i * 0.45 })),
  whinny: () => [740, 880, 660, 820, 560].forEach((f, i) => tone(f, 0.09, { type: 'sawtooth', vol: 0.05, delay: i * 0.07 })),
  punch: () => tone(90, 0.16, { type: 'square', vol: 0.12, slide: -40 }),
  finale: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, { type: 'triangle', vol: 0.09, delay: i * 0.18 })),
};

/** 0..1 rain loudness, eased by the caller. */
export function setRain(level) {
  if (!rainGain || !ctx) return;
  rainGain.gain.setTargetAtTime(enabled ? level * 0.12 : 0, ctx.currentTime, 0.3);
}
