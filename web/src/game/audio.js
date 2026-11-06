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
  if (on) { ensure(); ctx?.resume(); } else { ctx?.suspend(); }
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

// ---------------- Character themes (Pop Culture Park) ----------------
// Six short original loops, synthesised live (nothing to download). Only one
// theme is ever audible: switching fades the old one out completely before the
// new one fades in. Level follows proximity (quiet) and dialogue (a bit more).
let musicBus = null, noiseBuf = null, musicOn = true, musicVol = 0.6;
let cur = null, curGain = null, pending = null, switching = false, timer = null;
let nextTime = 0, step = 0, lastLevel = -1, ambient = null;

function noise() {
  if (noiseBuf) return noiseBuf;
  const len = ctx.sampleRate, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuf = b);
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function note(out, t, midi, dur, { wave = 'triangle', vol = 0.1, attack = 0.01, lp = 0, vib = 0, detune = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = wave; o.frequency.setValueAtTime(mtof(midi), t); if (detune) o.detune.value = detune;
  if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5; lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.1); }
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o.connect(g);
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node = g.connect(f); }
  node.connect(out); o.start(t); o.stop(t + dur + 0.05);
}
function hit(out, t, { freq = 1000, q = 1, dur = 0.08, vol = 0.1, type = 'bandpass' } = {}) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function kick(out, t, vol = 0.3, from = 120) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  o.connect(g).connect(out); o.start(t); o.stop(t + 0.3);
}

// Each theme: bpm, steps per loop (16ths), play(step, time, out, sixteenth)
const THEMES = {
  // basement philosopher: sparse industrial hits, low bass pulse, uneasy drone
  fight: { bpm: 92, steps: 32, amb: 0, play(i, t, out, s) {
    if (i === 0) { note(out, t, 52, s * 32, { wave: 'sine', vol: 0.025, attack: 0.8 }); note(out, t, 53, s * 32, { wave: 'sine', vol: 0.018, attack: 1.2 }); }
    if ([0, 10, 16, 26].includes(i)) kick(out, t, 0.32, 90);
    if (i === 8 || i === 24) { hit(out, t, { freq: 3400, q: 9, dur: 0.14, vol: 0.12 }); hit(out, t + 0.01, { freq: 5600, q: 14, dur: 0.1, vol: 0.06 }); }
    if ([0, 6, 16, 22].includes(i)) note(out, t, 40, s * 3, { wave: 'square', vol: 0.06, lp: 320 });
    if (i === 30) hit(out, t, { freq: 800, q: 2, dur: 0.05, vol: 0.05 });
  } },
  // drifter: fingerpicked chords and a far-off harmonica
  western: { bpm: 76, steps: 32, amb: 0, play(i, t, out, s) {
    const chords = [[43, 50, 55, 59], [48, 55, 60, 64], [50, 57, 62, 66], [43, 50, 55, 59]];
    const ch = chords[Math.floor(i / 8)], k = i % 8;
    if (k % 2 === 0) note(out, t, ch[[0, 2, 1, 3][k / 2]], 1.1, { wave: 'triangle', vol: 0.09, attack: 0.004, lp: 2200 });
    if (k === 0) note(out, t, ch[0] - 12, 1.6, { wave: 'triangle', vol: 0.07, attack: 0.004, lp: 900 });
    if (i === 12) note(out, t, 71, s * 6, { wave: 'square', vol: 0.022, attack: 0.25, lp: 1300, vib: 6 });
    if (i === 28) note(out, t, 74, s * 4, { wave: 'square', vol: 0.02, attack: 0.25, lp: 1300, vib: 6 });
  } },
  // night watcher: open fifth drone, hand drum, phrygian line
  moon: { bpm: 70, steps: 32, amb: 0, play(i, t, out, s) {
    if (i === 0) { note(out, t, 38, s * 32, { wave: 'sine', vol: 0.05, attack: 1 }); note(out, t, 45, s * 32, { wave: 'sine', vol: 0.03, attack: 1.4 }); }
    if ([0, 3, 6, 10, 16, 19, 22, 27].includes(i)) hit(out, t, { freq: i % 8 === 0 ? 260 : 700, q: 4, dur: 0.12, vol: i % 8 === 0 ? 0.16 : 0.08 });
    const mel = { 4: 62, 7: 63, 12: 65, 20: 69, 23: 67, 28: 63 };
    if (mel[i]) note(out, t, mel[i], 0.9, { wave: 'sine', vol: 0.05, attack: 0.04, lp: 1800 });
  } },
  // web runner: bouncy kick/hat, pentatonic arp, walking bass
  spider: { bpm: 124, steps: 32, amb: 0, play(i, t, out, s) {
    if (i % 8 === 0 || i === 11 || i === 27) kick(out, t, 0.22, 110);
    if (i % 2 === 0) hit(out, t, { freq: 7500, q: 1, dur: 0.03, vol: 0.035, type: 'highpass' });
    if (i % 8 === 4) hit(out, t, { freq: 1800, q: 1, dur: 0.09, vol: 0.06 });
    const arp = [72, 76, 79, 84, 79, 76, 74, 79];
    if (i % 2 === 0) note(out, t, arp[(i / 2) % 8] + (i >= 16 ? 2 : 0), 0.12, { wave: 'square', vol: 0.025, lp: 3200 });
    const bass = { 0: 48, 6: 48, 8: 53, 14: 55, 16: 50, 22: 50, 24: 55, 30: 55 };
    if (bass[i]) note(out, t, bass[i], s * 2, { wave: 'triangle', vol: 0.08 });
  } },
  // listener: low piano, city hush, slow heartbeat pulse
  dd: { bpm: 66, steps: 32, amb: 0.012, play(i, t, out, s) {
    const piano = { 0: 48, 8: 51, 16: 43, 24: 44, 26: 51 };
    if (piano[i]) { note(out, t, piano[i], 2.4, { wave: 'triangle', vol: 0.11, attack: 0.005, lp: 1400 }); note(out, t, piano[i] + 12, 1.6, { wave: 'sine', vol: 0.03, attack: 0.005 }); }
    if (i % 8 === 0) kick(out, t, 0.1, 70);
    if (i % 8 === 2) kick(out, t, 0.05, 70);
  } },
  // founder: cheerful chiptune with triangle bass and noise hats
  sv: { bpm: 110, steps: 32, amb: 0, play(i, t, out, s) {
    const lead = { 0: 76, 2: 79, 4: 81, 6: 79, 8: 76, 10: 74, 12: 72, 16: 74, 18: 76, 20: 79, 22: 76, 24: 74, 26: 72, 28: 71 };
    if (lead[i]) note(out, t, lead[i], s * 1.6, { wave: 'square', vol: 0.03, lp: 2800 });
    if (i % 4 === 0) note(out, t, [45, 45, 48, 50, 41, 41, 43, 43][i / 4], s * 3.5, { wave: 'triangle', vol: 0.08 });
    if (i % 2 === 1) hit(out, t, { freq: 9000, q: 1, dur: 0.02, vol: 0.025, type: 'highpass' });
    if (i % 8 === 4) note(out, t, 88, 0.05, { wave: 'square', vol: 0.012 });
  } },
};

function scheduler() {
  if (!cur || !ctx) return;
  const th = THEMES[cur], s = 60 / th.bpm / 4;
  while (nextTime < ctx.currentTime + 0.25) {
    th.play(step, nextTime, curGain, s);
    step = (step + 1) % th.steps;
    nextTime += s;
  }
}
function startTheme(id) {
  cur = id; step = 0; nextTime = ctx.currentTime + 0.05; lastLevel = -1;
  curGain = ctx.createGain(); curGain.gain.value = 0.0001; curGain.connect(musicBus);
  if (THEMES[id].amb) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise(); src.loop = true; f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6; g.gain.value = THEMES[id].amb * 6;
    src.connect(f).connect(g).connect(curGain); src.start(); ambient = src;
  }
  clearInterval(timer); timer = setInterval(scheduler, 50); scheduler();
}
function stopTheme(fade = 0.9) {
  const g = curGain, amb = ambient;
  if (g) { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(0.0001, ctx.currentTime, fade / 4); setTimeout(() => { try { g.disconnect(); amb?.stop(); } catch { /* ignore */ } }, fade * 1000 + 200); }
  clearInterval(timer); timer = null; cur = null; curGain = null; ambient = null;
}

/** Music on/off and volume (0..1). Music only plays while sound itself is on. */
export function setMusic(on, vol = musicVol) {
  musicOn = !!on; musicVol = Math.max(0, Math.min(1, vol));
  if (musicBus) musicBus.gain.setTargetAtTime(musicVol, ctx.currentTime, 0.2);
  if (!musicOn && cur && ctx) stopTheme(0.6);
}
/**
 * Ask for a character theme at a level (0..1). id null = silence. A different
 * theme first fades the current one out fully, then fades the new one in.
 */
export function setTheme(id, level = 0) {
  if (!enabled || !musicOn || !ctx) { if (cur && ctx) stopTheme(0.6); pending = null; return; }
  if (!musicBus) { musicBus = ctx.createGain(); musicBus.gain.value = musicVol; musicBus.connect(master); }
  if (id && !THEMES[id]) id = null;
  if (switching) { pending = id; return; }
  if (id !== cur) {
    if (cur) {
      switching = true; pending = id; stopTheme(0.9);
      setTimeout(() => { switching = false; }, 1000);
      return;
    }
    if (!id || level < 0.02) return;
    startTheme(id);
  }
  if (cur && Math.abs(level - lastLevel) > 0.03) {
    lastLevel = level;
    curGain.gain.setTargetAtTime(Math.max(0.0001, level), ctx.currentTime, 0.6);
    if (level < 0.02) stopTheme(0.6);
  }
}
export const currentTheme = () => cur;
