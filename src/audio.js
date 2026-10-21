// Fully synthesized audio — no asset files. Everything is built from oscillators + filtered noise.
let ctx, master, comp, noiseBuf, musicGain, sfxGain;
let muted = false;
export const audio = { combat: 0 };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 5;
  master = ctx.createGain(); master.gain.value = 0.8;
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9;
  musicGain = ctx.createGain(); musicGain.gain.value = 0.32;
  sfxGain.connect(comp); musicGain.connect(comp); comp.connect(master); master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startMusic();
}
export function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.8; return muted; }

function tone({ f = 440, f2, type = 'sine', dur = 0.2, vol = 0.3, delay = 0, a = 0.005, out, detune = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out || sfxGain);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise({ dur = 0.2, vol = 0.3, f = 1000, f2, q = 1, type = 'bandpass', delay = 0, a = 0.003 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(sfxGain);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
const pitchJit = () => 1 + (Math.random() - 0.5) * 0.12;

export const sfx = {
  click() { tone({ f: 900, f2: 1400, dur: 0.06, vol: 0.12, type: 'square' }); },
  hover() { tone({ f: 600, dur: 0.04, vol: 0.05, type: 'triangle' }); },
  buy() { [523, 659, 784, 1047].forEach((f, i) => tone({ f, dur: 0.25, vol: 0.18, delay: i * 0.06, type: 'triangle' })); noise({ dur: 0.3, f: 6000, vol: 0.06, type: 'highpass', delay: 0.15 }); },
  jump() { tone({ f: 260 * pitchJit(), f2: 520, dur: 0.14, vol: 0.12, type: 'triangle' }); noise({ dur: 0.08, f: 1200, vol: 0.03 }); },
  djump() { tone({ f: 420, f2: 880, dur: 0.16, vol: 0.13, type: 'triangle' }); noise({ dur: 0.12, f: 3000, f2: 800, vol: 0.05 }); },
  land(v = 1) { noise({ dur: 0.1, f: 400, f2: 120, vol: 0.12 * v, type: 'lowpass' }); tone({ f: 90, f2: 50, dur: 0.1, vol: 0.12 * v }); },
  dash() { noise({ dur: 0.25, f: 800, f2: 5000, vol: 0.14, q: 0.8 }); tone({ f: 200, f2: 700, dur: 0.18, vol: 0.06, type: 'sawtooth' }); },
  swing(el, i = 0) {
    const base = { fire: 700, water: 500, earth: 260, air: 1200 }[el] || 600;
    noise({ dur: 0.16, f: base * (1 + i * 0.18), f2: base * 3, vol: 0.14, q: 0.9 });
    if (el === 'earth') tone({ f: 110, f2: 60, dur: 0.18, vol: 0.14, type: 'triangle' });
    if (el === 'fire') noise({ dur: 0.2, f: 2500, vol: 0.05, type: 'highpass' });
  },
  hit(big = false, crit = false) {
    const p = pitchJit();
    noise({ dur: 0.08, f: 2400 * p, f2: 500, vol: 0.28, q: 0.7 });
    tone({ f: (big ? 120 : 190) * p, f2: 55, dur: big ? 0.2 : 0.11, vol: big ? 0.36 : 0.26, type: 'triangle' });
    if (crit) { tone({ f: 1500, f2: 2400, dur: 0.18, vol: 0.12, type: 'square' }); tone({ f: 2000, dur: 0.22, vol: 0.06, delay: 0.03 }); }
  },
  kill(big = false) {
    noise({ dur: big ? 0.6 : 0.3, f: 3000, f2: 300, vol: 0.3, q: 0.5 });
    tone({ f: 300, f2: 70, dur: big ? 0.5 : 0.25, vol: 0.25, type: 'sawtooth' });
    [880, 1175, 1568].forEach((f, i) => tone({ f, dur: 0.18, vol: 0.09, delay: 0.05 + i * 0.05, type: 'triangle' }));
  },
  hurt() { tone({ f: 220, f2: 70, dur: 0.35, vol: 0.34, type: 'sawtooth' }); noise({ dur: 0.25, f: 600, f2: 120, vol: 0.28, type: 'lowpass' }); },
  block() { noise({ dur: 0.1, f: 1800, vol: 0.2, q: 2 }); tone({ f: 330, f2: 200, dur: 0.15, vol: 0.2, type: 'square' }); },
  parry() {
    tone({ f: 1318, dur: 0.5, vol: 0.2, type: 'sine' }); tone({ f: 1975, dur: 0.6, vol: 0.14, type: 'sine', delay: 0.02 });
    tone({ f: 2637, dur: 0.7, vol: 0.09, type: 'triangle', delay: 0.04 });
    noise({ dur: 0.18, f: 5000, vol: 0.2, type: 'highpass' }); tone({ f: 80, f2: 40, dur: 0.3, vol: 0.4 });
  },
  guardUp() { tone({ f: 300, f2: 600, dur: 0.1, vol: 0.1, type: 'triangle' }); },
  telegraph() { tone({ f: 520, f2: 760, dur: 0.18, vol: 0.12, type: 'square' }); tone({ f: 523, dur: 0.1, vol: 0.06, delay: 0.1, type: 'square' }); },
  shoot(el) {
    const m = { fire: [300, 120], water: [500, 800], earth: [120, 70], air: [900, 1700] }[el] || [400, 200];
    noise({ dur: 0.18, f: m[0] * 3, f2: m[1] * 2, vol: 0.16, q: 0.8 });
    tone({ f: m[0], f2: m[1], dur: 0.16, vol: 0.13, type: el === 'fire' ? 'sawtooth' : 'triangle' });
  },
  cast(el) {
    const base = { fire: 150, water: 330, earth: 70, air: 620 }[el] || 200;
    tone({ f: base, f2: base * 2.5, dur: 0.5, vol: 0.2, type: 'sawtooth' });
    noise({ dur: 0.55, f: base * 5, f2: base * 14, vol: 0.18, q: 0.6 });
    tone({ f: base * 4, f2: base * 8, dur: 0.4, vol: 0.07, delay: 0.05 });
  },
  explosion(size = 1) {
    noise({ dur: 0.5 * size, f: 1800, f2: 80, vol: 0.45, type: 'lowpass', q: 0.4 });
    tone({ f: 120, f2: 30, dur: 0.5 * size, vol: 0.5 });
  },
  quake() { tone({ f: 70, f2: 25, dur: 0.9, vol: 0.55, type: 'sawtooth' }); noise({ dur: 0.9, f: 600, f2: 60, vol: 0.4, type: 'lowpass' }); },
  wave() { noise({ dur: 1, f: 300, f2: 2500, vol: 0.28, q: 0.4 }); tone({ f: 100, f2: 180, dur: 0.9, vol: 0.2, type: 'sine' }); },
  pickup(n = 0) { const f = 784 * Math.pow(1.0595, Math.min(n, 16)); tone({ f, dur: 0.12, vol: 0.12, type: 'square' }); tone({ f: f * 1.5, dur: 0.12, vol: 0.06, delay: 0.04, type: 'triangle' }); },
  heal() { [523, 659, 784].forEach((f, i) => tone({ f, dur: 0.3, vol: 0.12, delay: i * 0.07, type: 'sine' })); },
  levelUp() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => { tone({ f, dur: 0.5, vol: 0.18, delay: i * 0.08, type: 'triangle' }); tone({ f: f / 2, dur: 0.5, vol: 0.1, delay: i * 0.08 }); }); noise({ dur: 0.8, f: 7000, vol: 0.08, type: 'highpass', delay: 0.3 }); },
  combo(n) { const f = 520 * Math.pow(1.122, Math.min(n, 12)); tone({ f, dur: 0.2, vol: 0.14, type: 'triangle' }); tone({ f: f * 2, dur: 0.25, vol: 0.08, delay: 0.05 }); },
  checkpoint() { [659, 784, 988, 1319].forEach((f, i) => tone({ f, dur: 0.35, vol: 0.14, delay: i * 0.07, type: 'triangle' })); },
  gateClose() { tone({ f: 60, f2: 40, dur: 0.6, vol: 0.5, type: 'sawtooth' }); noise({ dur: 0.5, f: 300, f2: 80, vol: 0.3, type: 'lowpass' }); },
  gateOpen() { [523, 784, 1047, 1568].forEach((f, i) => tone({ f, dur: 0.3, vol: 0.14, delay: i * 0.06, type: 'triangle' })); },
  spawn() { noise({ dur: 0.25, f: 4000, f2: 600, vol: 0.1, q: 3 }); tone({ f: 800, f2: 200, dur: 0.2, vol: 0.06, type: 'square' }); },
  bossRoar() { tone({ f: 70, f2: 45, dur: 1.6, vol: 0.55, type: 'sawtooth' }); tone({ f: 73, f2: 40, dur: 1.6, vol: 0.4, type: 'square' }); noise({ dur: 1.4, f: 400, f2: 100, vol: 0.3, type: 'lowpass' }); },
  stomp() { tone({ f: 80, f2: 35, dur: 0.4, vol: 0.55, type: 'triangle' }); noise({ dur: 0.35, f: 500, f2: 80, vol: 0.4, type: 'lowpass' }); },
  die() { tone({ f: 300, f2: 40, dur: 1.2, vol: 0.4, type: 'sawtooth' }); noise({ dur: 1.2, f: 1000, f2: 60, vol: 0.3, type: 'lowpass' }); },
  win() { [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone({ f, dur: 0.6, vol: 0.18, delay: i * 0.12, type: 'triangle' })); },
};

// ---------------------------------------------------------------- generative music
// A calm minor-pentatonic arp over a slow pad; combat adds a pulse + hats.
const SCALE = [0, 3, 5, 7, 10];
const CHORDS = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function startMusic() {
  let step = 0, nextT = ctx.currentTime + 0.2;
  const spb = 60 / 92 / 2;
  setInterval(() => {
    if (!ctx) return;
    while (nextT < ctx.currentTime + 0.4) {
      const bar = Math.floor(step / 16) % CHORDS.length, s = step % 16, chord = CHORDS[bar];
      const t = nextT - ctx.currentTime;
      if (s === 0) chord.forEach((m, i) => tone({ f: mtof(m - 12), dur: spb * 15, vol: 0.12, a: 0.6, type: 'sine', delay: t, out: musicGain, detune: i * 4 }));
      if (s === 0) tone({ f: mtof(chord[0] - 24), dur: spb * 8, vol: 0.2, a: 0.02, type: 'triangle', delay: t, out: musicGain });
      if (s % 2 === 0 && Math.random() < 0.8) {
        const note = chord[0] + 12 + SCALE[(step * 3 + bar * 2) % 5] + (Math.random() < 0.3 ? 12 : 0);
        tone({ f: mtof(note), dur: spb * 2.5, vol: 0.07, type: 'triangle', delay: t, out: musicGain });
      }
      if (audio.combat > 0.3) {
        if (s % 4 === 0) tone({ f: 70, f2: 38, dur: 0.18, vol: 0.2, delay: t, out: musicGain });
        if (s % 2 === 1) { const src = ctx.createBufferSource(); src.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = ctx.createGain(); g.gain.setValueAtTime(0.05, nextT); g.gain.exponentialRampToValueAtTime(0.001, nextT + 0.05); src.connect(f); f.connect(g); g.connect(musicGain); src.start(nextT, Math.random()); src.stop(nextT + 0.08); }
      }
      step++; nextT += spb;
    }
  }, 120);
}
