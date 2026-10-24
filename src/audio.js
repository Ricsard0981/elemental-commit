// Fully synthesized audio — no asset files. Layered oscillators + filtered noise, a short reverb bus, per-element voices,
// slow-motion low-pass, ambience and an adaptive combat groove. Hits are built from transient + body + sub + tail so they land.
import { S } from './settings.js';
let ctx, master, comp, lim, noiseBuf, musicGain, sfxGain, reverb, revSend, lp, ambGain, curEl = 'fire';
let muted = false;
export const audio = { combat: 0, lowHp: false };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.18;
  master = ctx.createGain(); master.gain.value = 0.8;
  lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 22000; lp.Q.value = 0.5; // dips during slow-motion
  sfxGain = ctx.createGain(); musicGain = ctx.createGain(); ambGain = ctx.createGain(); ambGain.gain.value = 0;
  setVolumes();
  // short plate-ish reverb from a decaying noise impulse
  reverb = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 1.4), imp = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = imp.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  reverb.buffer = imp; revSend = ctx.createGain(); revSend.gain.value = 0.5;
  revSend.connect(reverb); const rg = ctx.createGain(); rg.gain.value = 0.55; reverb.connect(rg); rg.connect(lp);
  // a hard limiter after the compressor keeps a crowded fight from clipping
  lim = ctx.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
  sfxGain.connect(comp); musicGain.connect(comp); ambGain.connect(comp); comp.connect(lim); lim.connect(lp); lp.connect(master); master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startMusic(); startAmbience();
}
export function setVolumes() {
  if (!ctx) return;
  sfxGain.gain.value = S.sfx;
  musicGain.gain.value = 0.5 * S.music;
  ambGain.gain.value = 0.5 * S.music;
}
// music/ambience dip under big impacts (Web Audio has no sidechain: this is a gain ramp that recovers quickly)
export function duck(depth = 0.5, dur = 0.35) {
  if (!ctx) return;
  const t = ctx.currentTime, base = 0.5 * S.music;
  for (const g of [musicGain, ambGain]) { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(base * depth, t, 0.012); g.gain.setTargetAtTime(base, t + dur, 0.2); }
}
// test hook: records the master output for `ms` (used by the audio level checks; not used by the game)
export function _record(ms = 1500) {
  return new Promise((res) => {
    const sp = ctx.createScriptProcessor(4096, 1, 1), chunks = [];
    sp.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    lp.connect(sp); sp.connect(ctx.destination);
    setTimeout(() => { lp.disconnect(sp); sp.disconnect(); const n = chunks.reduce((a, c) => a + c.length, 0), out = new Float32Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } res({ rate: ctx.sampleRate, data: Array.from(out) }); }, ms);
  });
}
export function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.8; return muted; }
// slow-motion and hit-stop muffle the world a little (called every frame with the game time scale)
let slowK = 1;
export function setSlow(ts) {
  if (!ctx) return;
  const k = ts < 0.6 ? 0 : 1;
  if (k !== slowK) { slowK = k; lp.frequency.setTargetAtTime(k ? 22000 : 1400, ctx.currentTime, 0.04); }
}

// ---------------------------------------------------------------- voice helpers
const recent = [];
function ok(prio = 1) { // keep dense moments clean: drop low-priority layers when many voices are alive
  if (!ctx) return false;
  const now = performance.now();
  while (recent.length && now - recent[0] > 140) recent.shift();
  if (recent.length > 44 && prio < 2) return false;
  recent.push(now); return true;
}
function route(g, out, wet, pan) {
  let node = g;
  if (pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); node = p; }
  node.connect(out || sfxGain);
  if (wet) { const w = ctx.createGain(); w.gain.value = wet; node.connect(w); w.connect(revSend); }
}
function tone({ f = 440, f2, type = 'sine', dur = 0.2, vol = 0.3, delay = 0, a = 0.005, out, detune = 0, wet = 0, pan = 0, prio = 1 }) {
  if (!ok(prio)) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); route(g, out, wet, pan);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise({ dur = 0.2, vol = 0.3, f = 1000, f2, q = 1, type = 'bandpass', delay = 0, a = 0.003, wet = 0, pan = 0, prio = 1, swell = 0 }) {
  if (!ok(prio)) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  if (swell) { g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + dur * swell); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  else { g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  s.connect(fl); fl.connect(g); route(g, null, wet, pan);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
const click = (vol = 0.2, f = 3500, delay = 0) => noise({ dur: 0.012, vol, f, type: 'highpass', a: 0.001, delay, prio: 2 });
const thump = (f = 90, f2 = 40, dur = 0.25, vol = 0.4, wet = 0, delay = 0) => tone({ f, f2, dur, vol, a: 0.002, wet, delay, prio: 2 });
function bell(f, dur = 0.8, vol = 0.18, ratios = [1, 2.76, 5.4, 8.93], delay = 0, wet = 0.5) {
  ratios.forEach((r, i) => tone({ f: f * r, dur: dur / (1 + i * 0.6), vol: vol / (1 + i * 0.9), a: 0.002, delay, wet, prio: 2 }));
}
const swoosh = (from, to, dur = 0.2, vol = 0.14, q = 1.1, swell = 0.45, o = {}) => noise({ dur, vol, f: from, f2: to, q, swell, ...o });
const pitchJit = (k = 0.12) => 1 + (Math.random() - 0.5) * k;
const sparkle = (base = 1568, n = 3, vol = 0.06, step = 0.04) => { for (let i = 0; i < n; i++) tone({ f: base * Math.pow(1.335, i), dur: 0.16, vol, delay: i * step, type: 'sine', wet: 0.4 }); };

export const sfx = {
  // ---- UI
  click() { tone({ f: 1000, f2: 1500, dur: 0.05, vol: 0.09, type: 'triangle' }); click(0.05, 5000); },
  hover() { tone({ f: 760, dur: 0.035, vol: 0.03, type: 'sine' }); },
  buy() { [523, 659, 784, 1047].forEach((f, i) => tone({ f, dur: 0.3, vol: 0.16, delay: i * 0.06, type: 'triangle', wet: 0.4 })); noise({ dur: 0.35, f: 6000, vol: 0.07, type: 'highpass', delay: 0.15, swell: 0.3 }); sparkle(2093, 4, 0.05, 0.05); },
  // ---- movement
  step() { noise({ dur: 0.05, f: 520, f2: 200, vol: 0.045 * pitchJit(0.5), type: 'lowpass', prio: 0 }); tone({ f: 95 * pitchJit(0.3), f2: 60, dur: 0.05, vol: 0.04, prio: 0 }); },
  jump() { tone({ f: 260 * pitchJit(), f2: 520, dur: 0.14, vol: 0.1, type: 'triangle' }); swoosh(600, 1800, 0.14, 0.05, 0.8, 0.3); },
  djump() { tone({ f: 420, f2: 940, dur: 0.18, vol: 0.12, type: 'triangle', wet: 0.3 }); swoosh(1200, 5000, 0.16, 0.07, 0.8, 0.4); sparkle(1760, 2, 0.04, 0.03); },
  land(v = 1) { noise({ dur: 0.12, f: 500, f2: 110, vol: 0.14 * v, type: 'lowpass' }); thump(100, 45, 0.14, 0.2 * v); if (v > 0.5) click(0.1 * v, 2000); },
  dash() { swoosh(500, 5200, 0.24, 0.34, 0.7, 0.35, { wet: 0.15 }); noise({ dur: 0.2, f: 2400, f2: 700, vol: 0.1, q: 4 }); tone({ f: 180, f2: 620, dur: 0.18, vol: 0.09, type: 'sawtooth' }); },
  // ---- attacks
  swing(el, i = 0, kind = 'ground') {
    const k = 1 + i * 0.12;
    if (kind === 'launcher') { swoosh(260, 2600, 0.3, 0.2, 0.9, 0.55, { wet: 0.2 }); tone({ f: 150, f2: 480, dur: 0.26, vol: 0.14, type: 'triangle' }); thump(120, 55, 0.18, 0.18); }
    else if (kind === 'slam') { swoosh(3200, 180, 0.4, 0.22, 0.8, 0.2, { wet: 0.2 }); tone({ f: 2200, f2: 280, dur: 0.38, vol: 0.06, type: 'sine' }); }
    if (el === 'fire') { swoosh(650 * k, 3000, 0.2, 0.15, 1.1); noise({ dur: 0.22, f: 2800, vol: 0.06, type: 'highpass', swell: 0.3 }); for (let c = 0; c < 3; c++) click(0.07, 3000 + c * 800, 0.03 + c * 0.04 + Math.random() * 0.02); noise({ dur: 0.26, f: 240, f2: 140, vol: 0.07, type: 'lowpass' }); }
    else if (el === 'water') { swoosh(420 * k, 1700, 0.24, 0.14, 0.7); tone({ f: 560 * k, f2: 980, dur: 0.2, vol: 0.06, type: 'sine', wet: 0.3 }); noise({ dur: 0.14, f: 5500, vol: 0.05, type: 'highpass', delay: 0.05 }); }
    else if (el === 'earth') { swoosh(170 * k, 760, 0.28, 0.2, 0.9, 0.5, { type: 'lowpass' }); tone({ f: 95, f2: 55, dur: 0.24, vol: 0.12, type: 'sawtooth' }); thump(80, 40, 0.2, 0.2); }
    else { swoosh(1600 * k, 5600, 0.14, 0.12, 1.4); tone({ f: 2500 * k, f2: 3300, dur: 0.13, vol: 0.035, type: 'sine' }); }
  },
  // kinds: light | airHit | ranged | special | heavy | finisher | crit | launcher (see FEEDBACK in combat.js).
  // Built as transient (5-10 ms) + body (pitch-swept) + tail, 80-150 ms total; the element only changes the colour of the transient.
  hit(kind = 'light', n = 0, mat = 'flesh') {
    const semis = Math.min(7, Math.floor(n / 3)) + (Math.random() - 0.5) * 2.4; // combo climbs at most 7 semitones, +-1.2 random
    const p = Math.pow(1.0595, semis);
    const heavy = kind === 'heavy' || kind === 'finisher' || kind === 'crit' || kind === 'launcher' || kind === 'special';
    const tc = { fire: 3600, water: 3000, earth: 1800, air: 5200 }[curEl] || 3600;
    click(heavy ? 0.3 : kind === 'ranged' ? 0.12 : 0.2, tc * p);
    if (mat === 'wood') { tone({ f: 430 * p, f2: 210, dur: 0.07, vol: 0.28, type: 'triangle' }); noise({ dur: 0.08, f: 900, q: 3.5, vol: 0.24 }); thump(150, 70, 0.1, 0.18); }
    else if (mat === 'metal') { bell(kind === 'light' ? 1250 * p : 760 * p, 0.22, kind === 'light' ? 0.1 : 0.16, [1, 2.4, 4.1], 0, 0.15); noise({ dur: 0.07, f: 3200, q: 2, vol: 0.18 }); thump(heavy ? 120 : 170, 60, heavy ? 0.16 : 0.1, heavy ? 0.34 : 0.22); }
    else {
      noise({ dur: kind === 'light' ? 0.1 : 0.1, f: (heavy ? 1900 : 2600) * p, f2: heavy ? 320 : 560, vol: heavy ? 0.3 : 0.22, q: 0.7 });
      thump((heavy ? 150 : 210) * p, heavy ? 50 : 64, heavy ? 0.16 : 0.13, heavy ? 0.42 : 0.26);
    }
    if (heavy) thump(62, 34, 0.22, 0.28);
    if (kind === 'finisher' || kind === 'launcher') { noise({ dur: 0.22, f: 700, f2: 100, vol: 0.14, type: 'lowpass', wet: 0.18 }); }
    if (kind === 'crit') { bell(1568, 0.5, 0.1, [1, 2.01], 0.01); sparkle(2093, 3, 0.05, 0.035); }
    // element colour (kept very short so it never muddies a combo)
    if (curEl === 'fire') click(0.06, 2800, 0.035); else if (curEl === 'water') noise({ dur: 0.06, f: 6500, type: 'highpass', vol: 0.05, delay: 0.02 }); else if (curEl === 'earth') { thump(90 * p, 48, 0.08, 0.14); click(0.1, 900, 0.01); } else tone({ f: 2800 * p, f2: 1900, dur: 0.05, vol: 0.04 });
    if (kind === 'finisher' || kind === 'launcher') duck(0.7, 0.2);
  },
  stagger(heavy = false) { click(0.3, 5000); bell(heavy ? 520 : 880, 0.3, 0.14, [1, 2.76, 5.4], 0, 0.2); noise({ dur: 0.14, f: 4500, vol: 0.12, type: 'highpass' }); thump(heavy ? 85 : 120, 50, 0.16, 0.3); if (heavy) duck(0.6, 0.25); },
  enemyShoot(kind = 'pointer') {
    if (kind === 'boss') { tone({ f: 240, f2: 90, dur: 0.14, vol: 0.16, type: 'sawtooth' }); noise({ dur: 0.1, f: 1500, vol: 0.12 }); thump(110, 55, 0.12, 0.2); }
    else { tone({ f: 760, f2: 190, dur: 0.13, vol: 0.16, type: 'square' }); tone({ f: 1500, f2: 900, dur: 0.07, vol: 0.08, type: 'sine', delay: 0.02 }); noise({ dur: 0.08, f: 3200, q: 2, vol: 0.11 }); }
  },
  setElement(k) { curEl = k; },
  airhit(n = 1) { const f = 640 * Math.pow(1.1225, Math.min(n, 12)); tone({ f, f2: f * 1.5, dur: 0.13, vol: 0.22, type: 'triangle', wet: 0.25 }); tone({ f: f * 2, dur: 0.09, vol: 0.1, delay: 0.02, type: 'sine' }); },
  spike() { tone({ f: 2200, f2: 260, dur: 0.3, vol: 0.12, type: 'sine' }); swoosh(4000, 300, 0.28, 0.16, 0.8, 0.2); click(0.25, 2500, 0.26); thump(110, 40, 0.3, 0.45, 0.2, 0.26); },
  bounce() { tone({ f: 150, f2: 60, dur: 0.18, vol: 0.3, type: 'triangle' }); noise({ dur: 0.3, f: 700, f2: 90, vol: 0.28, type: 'lowpass', wet: 0.3 }); tone({ f: 320, f2: 200, dur: 0.1, vol: 0.08, delay: 0.04, type: 'sine' }); },
  slam(el = 'fire') {
    duck(0.45, 0.45); thump(62, 26, 0.8, 0.7, 0.35); click(0.4, 2200); noise({ dur: 0.85, f: 900, f2: 60, vol: 0.5, type: 'lowpass', wet: 0.3 }); noise({ dur: 0.3, f: 5000, vol: 0.18, type: 'highpass', delay: 0.02 });
    if (el === 'fire') { noise({ dur: 0.7, f: 1800, f2: 300, vol: 0.14, delay: 0.05, swell: 0.2 }); for (let c = 0; c < 6; c++) click(0.08, 2600, 0.1 + c * 0.07); }
    else if (el === 'water') { noise({ dur: 0.7, f: 3000, f2: 700, vol: 0.2, delay: 0.05, q: 0.5 }); for (let c = 0; c < 5; c++) tone({ f: 900 + Math.random() * 900, f2: 300, dur: 0.1, vol: 0.05, delay: 0.1 + c * 0.06, wet: 0.3 }); }
    else if (el === 'earth') { for (let c = 0; c < 7; c++) { click(0.12, 900 + Math.random() * 900, 0.08 + c * 0.06); thump(160 - c * 12, 60, 0.06, 0.1, 0, 0.08 + c * 0.06); } }
    else { swoosh(500, 6000, 0.5, 0.18, 0.6, 0.3, { delay: 0.04 }); tone({ f: 1400, f2: 500, dur: 0.4, vol: 0.05, delay: 0.04, wet: 0.4 }); }
  },
  imbue(el) { sparkle({ fire: 880, water: 1175, earth: 660, air: 1568 }[el] || 880, 2, 0.05, 0.03); },
  kill(big = false) {
    if (big) duck(0.55, 0.4);
    click(0.3, 3000); noise({ dur: big ? 0.7 : 0.32, f: 3200, f2: 260, vol: 0.3, q: 0.5, wet: 0.15 }); tone({ f: 320, f2: 65, dur: big ? 0.55 : 0.26, vol: 0.25, type: 'sawtooth' });
    thump(big ? 70 : 90, 35, big ? 0.6 : 0.3, 0.4, 0.2);
    [880, 1175, 1568].forEach((f, i) => tone({ f, dur: 0.2, vol: 0.09, delay: 0.05 + i * 0.05, type: 'triangle', wet: 0.4 }));
  },
  hurt() { duck(0.55, 0.3); tone({ f: 230, f2: 70, dur: 0.36, vol: 0.32, type: 'sawtooth' }); noise({ dur: 0.28, f: 600, f2: 120, vol: 0.3, type: 'lowpass' }); thump(80, 35, 0.3, 0.5, 0.2); click(0.25, 2200); tone({ f: 190, f2: 120, dur: 0.22, vol: 0.14, type: 'square', detune: 12 }); },
  block() { click(0.25, 4000); bell(880, 0.35, 0.14, [1, 2.4, 4.1]); noise({ dur: 0.1, f: 1800, vol: 0.18, q: 2 }); thump(160, 80, 0.1, 0.2); },
  parry() {
    duck(0.35, 0.5); click(0.4, 5000); thump(70, 28, 0.6, 0.6, 0.3);
    bell(1760, 1.3, 0.2, [1, 2.76, 5.4, 8.93], 0.0, 0.7); bell(2349, 0.9, 0.12, [1, 2.0, 3.0], 0.03, 0.6);
    noise({ dur: 0.7, f: 6500, vol: 0.14, type: 'highpass', swell: 0.12, wet: 0.5 }); noise({ dur: 0.35, f: 400, f2: 3000, vol: 0.15, swell: 0.7, delay: -0.0 });
    sparkle(2637, 4, 0.06, 0.05);
  },
  // perfect dodge: a reversed swell into a low bell, the world drops into slow motion
  dodge() { duck(0.5, 0.6); noise({ dur: 0.5, f: 300, f2: 5200, vol: 0.2, swell: 0.85, type: 'bandpass', q: 1.2, wet: 0.4 }); bell(587, 1.1, 0.2, [1, 2.0, 3.01, 4.2], 0.28, 0.6); tone({ f: 140, f2: 60, dur: 0.5, vol: 0.18, type: 'sine', delay: 0.26 }); sparkle(1760, 3, 0.07, 0.3); },
  // execution: a metallic slice, a sub drop and a short bright tail
  execute() { duck(0.3, 0.6); click(0.45, 6000); noise({ dur: 0.18, f: 9000, f2: 1800, vol: 0.28, type: 'highpass' }); thump(60, 24, 0.7, 0.7, 0.25); bell(1319, 0.9, 0.14, [1, 2.76, 5.4], 0.05, 0.5); noise({ dur: 0.5, f: 500, f2: 4000, vol: 0.1, swell: 0.6, wet: 0.5, delay: 0.05 }); },
  // each reaction has its own voice, pitched by what it is made of
  reaction(name = 'STEAM') {
    duck(0.5, 0.4);
    const f = { STEAM: 880, 'THERMAL SHOCK': 1568, MAGMA: 196, FIRESTORM: 659, MUD: 150, SANDSTORM: 523 }[name] || 700;
    bell(f, 0.8, 0.17, [1, 2.4, 4.1], 0, 0.5); thump(f > 400 ? 90 : 60, 30, 0.35, 0.4, 0.2);
    noise({ dur: 0.45, f: f * 2, f2: f * 5, vol: 0.14, swell: 0.5, type: 'bandpass', q: 1.5, wet: 0.45 });
  },
  guardUp(el = 'fire') { const f = { fire: 300, water: 420, earth: 180, air: 560 }[el] || 300; tone({ f, f2: f * 2, dur: 0.12, vol: 0.1, type: 'triangle', wet: 0.2 }); swoosh(f * 2, f * 6, 0.12, 0.06, 1); },
  // every enemy has its own warning sound: you should be able to tell WHO is about to attack with your eyes closed
  telegraph(kind = 'bug') {
    if (kind === 'bug') { for (let i = 0; i < 3; i++) { click(0.2, 3200 + i * 500, i * 0.07); tone({ f: 900 + i * 260, dur: 0.07, vol: 0.12, delay: i * 0.07, type: 'square' }); } }
    else if (kind === 'pointer') { noise({ dur: 0.55, f: 6000, f2: 800, vol: 0.22, swell: 0.9, q: 1.2 }); tone({ f: 380, f2: 1250, dur: 0.55, vol: 0.14, type: 'triangle', a: 0.2 }); tone({ f: 1800, dur: 0.1, vol: 0.1, delay: 0.5 }); }
    else if (kind === 'brute') { tone({ f: 90, f2: 240, dur: 0.8, vol: 0.12, type: 'sawtooth', a: 0.3 }); noise({ dur: 0.6, f: 300, f2: 900, vol: 0.07, type: 'lowpass', swell: 0.8 }); tone({ f: 330, dur: 0.12, vol: 0.08, delay: 0.5, type: 'square' }); tone({ f: 440, dur: 0.12, vol: 0.08, delay: 0.64, type: 'square' }); }
    else if (kind === 'boss') { tone({ f: 55, f2: 80, dur: 0.95, vol: 0.2, type: 'sawtooth', a: 0.25, wet: 0.2 }); tone({ f: 110, f2: 130, dur: 0.9, vol: 0.07, type: 'square', a: 0.3 }); noise({ dur: 0.9, f: 200, f2: 700, vol: 0.12, type: 'lowpass', swell: 0.85 }); }
    else if (kind === 'summon') { for (let i = 0; i < 5; i++) { tone({ f: 300 + Math.random() * 600, dur: 0.05, vol: 0.05, delay: i * 0.06, type: 'square' }); click(0.07, 5000, i * 0.06 + 0.02); } noise({ dur: 0.5, f: 1000, f2: 5000, vol: 0.08, swell: 0.7 }); }
    else { tone({ f: 520, f2: 800, dur: 0.18, vol: 0.12, type: 'square' }); tone({ f: 523, dur: 0.1, vol: 0.06, delay: 0.1, type: 'square' }); }
  },
  shoot(el) {
    const m = { fire: [320, 110], water: [520, 900], earth: [130, 65], air: [950, 1800] }[el] || [400, 200];
    swoosh(m[0] * 3, m[1] * 2, 0.2, 0.17, 0.8, 0.3, { wet: 0.2 });
    tone({ f: m[0], f2: m[1], dur: 0.17, vol: 0.13, type: el === 'fire' ? 'sawtooth' : 'triangle' });
    if (el === 'fire') { for (let c = 0; c < 3; c++) click(0.07, 3200, c * 0.03); } if (el === 'earth') thump(110, 50, 0.18, 0.3); if (el === 'water') sparkle(1500, 2, 0.04, 0.04);
  },
  cast(el) {
    const base = { fire: 150, water: 330, earth: 70, air: 620 }[el] || 200;
    tone({ f: base, f2: base * 2.5, dur: 0.55, vol: 0.2, type: 'sawtooth', a: 0.12, wet: 0.3 });
    noise({ dur: 0.6, f: base * 5, f2: base * 14, vol: 0.18, q: 0.6, swell: 0.7, wet: 0.3 });
    tone({ f: base * 4, f2: base * 8, dur: 0.4, vol: 0.07, delay: 0.05, wet: 0.4 });
    if (el === 'earth') thump(60, 30, 0.5, 0.4, 0.3, 0.3); else sparkle(base * 8, 3, 0.05, 0.05);
  },
  explosion(size = 1) { click(0.3, 2500); noise({ dur: 0.5 * size, f: 1800, f2: 80, vol: 0.45, type: 'lowpass', q: 0.4, wet: 0.3 }); thump(125, 30, 0.5 * size, 0.5, 0.2); },
  quake() { tone({ f: 70, f2: 25, dur: 0.9, vol: 0.55, type: 'sawtooth', wet: 0.3 }); noise({ dur: 0.9, f: 600, f2: 60, vol: 0.4, type: 'lowpass', wet: 0.3 }); for (let c = 0; c < 6; c++) click(0.1, 900, 0.1 + c * 0.08); },
  wave() { noise({ dur: 1, f: 300, f2: 2500, vol: 0.28, q: 0.4, swell: 0.5, wet: 0.3 }); tone({ f: 100, f2: 180, dur: 0.9, vol: 0.2, type: 'sine' }); },
  pickup(n = 0) { const f = 784 * Math.pow(1.0595, Math.min(n, 16)); tone({ f, dur: 0.12, vol: 0.11, type: 'square' }); tone({ f: f * 1.5, dur: 0.12, vol: 0.06, delay: 0.04, type: 'triangle', wet: 0.3 }); },
  heal() { [523, 659, 784].forEach((f, i) => tone({ f, dur: 0.32, vol: 0.12, delay: i * 0.07, type: 'sine', wet: 0.4 })); },
  levelUp() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => { tone({ f, dur: 0.5, vol: 0.17, delay: i * 0.08, type: 'triangle', wet: 0.4 }); tone({ f: f / 2, dur: 0.5, vol: 0.1, delay: i * 0.08 }); }); noise({ dur: 0.9, f: 7000, vol: 0.09, type: 'highpass', delay: 0.3, swell: 0.4 }); thump(80, 40, 0.5, 0.4, 0.3); },
  combo(n) { const f = 520 * Math.pow(1.122, Math.min(n, 12)); tone({ f, dur: 0.22, vol: 0.14, type: 'triangle', wet: 0.3 }); tone({ f: f * 2, dur: 0.28, vol: 0.08, delay: 0.05, wet: 0.4 }); sparkle(f * 3, 2, 0.04, 0.04); },
  checkpoint() { [659, 784, 988, 1319].forEach((f, i) => tone({ f, dur: 0.35, vol: 0.14, delay: i * 0.07, type: 'triangle', wet: 0.4 })); },
  gateClose() { tone({ f: 60, f2: 40, dur: 0.6, vol: 0.5, type: 'sawtooth', wet: 0.2 }); noise({ dur: 0.5, f: 300, f2: 80, vol: 0.3, type: 'lowpass' }); click(0.3, 1500, 0.02); },
  gateOpen() { [523, 784, 1047, 1568].forEach((f, i) => tone({ f, dur: 0.3, vol: 0.14, delay: i * 0.06, type: 'triangle', wet: 0.4 })); },
  spawn() { noise({ dur: 0.28, f: 4200, f2: 600, vol: 0.1, q: 3 }); tone({ f: 800, f2: 200, dur: 0.2, vol: 0.06, type: 'square' }); for (let c = 0; c < 4; c++) click(0.05, 6000, c * 0.04); },
  bossRoar() { duck(0.4, 1.2); tone({ f: 70, f2: 45, dur: 1.6, vol: 0.55, type: 'sawtooth', wet: 0.3 }); tone({ f: 73, f2: 40, dur: 1.6, vol: 0.4, type: 'square' }); noise({ dur: 1.4, f: 400, f2: 100, vol: 0.3, type: 'lowpass', wet: 0.3 }); },
  stomp() { thump(80, 32, 0.45, 0.6, 0.2); noise({ dur: 0.35, f: 500, f2: 80, vol: 0.4, type: 'lowpass' }); click(0.3, 1800); },
  die() { tone({ f: 300, f2: 40, dur: 1.2, vol: 0.4, type: 'sawtooth', wet: 0.3 }); noise({ dur: 1.2, f: 1000, f2: 60, vol: 0.3, type: 'lowpass', wet: 0.3 }); thump(60, 25, 0.9, 0.5, 0.3); },
  win() { [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone({ f, dur: 0.6, vol: 0.17, delay: i * 0.12, type: 'triangle', wet: 0.4 })); },
};

// per-sound retrigger floor + max simultaneous plays (ear fatigue guard): [min gap s, max plays per 250 ms]
const GATE = { hit: [0.03, 4], swing: [0.05, 3], airhit: [0.045, 3], step: [0.09, 2], pickup: [0.03, 4], click: [0.02, 4], hover: [0.05, 2], shoot: [0.05, 3], explosion: [0.06, 3], kill: [0.04, 3], stagger: [0.1, 2], block: [0.06, 2], telegraph: [0.05, 3], land: [0.08, 2], enemyShoot: [0.05, 2], combo: [0.1, 2], reaction: [0.15, 2], dodge: [0.5, 1], execute: [0.2, 1] };
const lastAt = {}, recentPlays = {};
for (const k of Object.keys(sfx)) {
  const f = sfx[k], [gap, max] = GATE[k] || [0.02, 6];
  sfx[k] = (...a) => {
    if (!ctx) return;
    const now = performance.now() / 1000;
    if (now - (lastAt[k] || -9) < gap) return;
    const r = (recentPlays[k] ||= []); while (r.length && now - r[0] > 0.25) r.shift();
    if (r.length >= max) return;
    r.push(now); lastAt[k] = now;
    return f(...a);
  };
}

// ---------------------------------------------------------------- ambience (wind bed + occasional birds in the arena)
let ambMode = 'level';
export function setAmbience(m) { ambMode = m; }
function startAmbience() {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6;
  const g = ctx.createGain(); g.gain.value = 0.05;
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 0.03; lfo.connect(lg); lg.connect(g.gain); lfo.start();
  s.connect(f); f.connect(g); g.connect(ambGain); s.start();
  setInterval(() => {
    if (!ctx || ambMode !== 'arena' || Math.random() > 0.5) return;
    const base = 2200 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) tone({ f: base, f2: base * (1.15 + Math.random() * 0.3), dur: 0.07, vol: 0.022, delay: i * 0.1, a: 0.01, out: ambGain, wet: 0.3, prio: 0 });
  }, 2600);
}

// ---------------------------------------------------------------- generative music
// A calm minor-pentatonic arp over a slow pad; combat adds a driving groove: kick, snare, bass and hats.
const SCALE = [0, 3, 5, 7, 10];
const CHORDS = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function startMusic() {
  let step = 0, nextT = ctx.currentTime + 0.2, beatT = 0;
  const spb = 60 / 92 / 2;
  setInterval(() => {
    if (!ctx) return;
    while (nextT < ctx.currentTime + 0.4) {
      const bar = Math.floor(step / 16) % CHORDS.length, s = step % 16, chord = CHORDS[bar];
      const t = nextT - ctx.currentTime;
      if (s === 0) chord.forEach((m, i) => tone({ f: mtof(m - 12), dur: spb * 15, vol: 0.12, a: 0.6, type: 'sine', delay: t, out: musicGain, detune: i * 4, prio: 2 }));
      if (s === 0) tone({ f: mtof(chord[0] - 24), dur: spb * 8, vol: 0.2, a: 0.02, type: 'triangle', delay: t, out: musicGain, prio: 2 });
      if (s % 2 === 0 && Math.random() < 0.8) {
        const note = chord[0] + 12 + SCALE[(step * 3 + bar * 2) % 5] + (Math.random() < 0.3 ? 12 : 0);
        tone({ f: mtof(note), dur: spb * 2.5, vol: 0.07, type: 'triangle', delay: t, out: musicGain, wet: 0.25, prio: 2 });
      }
      if (audio.combat > 0.3) {
        if (s % 4 === 0) tone({ f: 70, f2: 38, dur: 0.2, vol: 0.24, delay: t, out: musicGain, prio: 2 });
        if (s === 4 || s === 12) { const src = ctx.createBufferSource(); src.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8; const g = ctx.createGain(); g.gain.setValueAtTime(0.14, nextT); g.gain.exponentialRampToValueAtTime(0.001, nextT + 0.14); src.connect(f); f.connect(g); g.connect(musicGain); src.start(nextT, Math.random()); src.stop(nextT + 0.18); }
        if (s % 2 === 0) tone({ f: mtof(chord[0] - 24 + (s % 8 === 6 ? 7 : 0)), dur: spb * 1.6, vol: 0.1, type: 'sawtooth', delay: t, out: musicGain, prio: 2 });
        if (s % 2 === 1) { const src = ctx.createBufferSource(); src.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = ctx.createGain(); g.gain.setValueAtTime(0.05, nextT); g.gain.exponentialRampToValueAtTime(0.001, nextT + 0.05); src.connect(f); f.connect(g); g.connect(musicGain); src.start(nextT, Math.random()); src.stop(nextT + 0.08); }
      }
      if (audio.lowHp && s % 8 === 0) { tone({ f: 60, f2: 40, dur: 0.14, vol: 0.2, delay: t, prio: 2 }); tone({ f: 60, f2: 40, dur: 0.12, vol: 0.14, delay: t + 0.18, prio: 2 }); }
      step++; nextT += spb;
    }
  }, 120);
}
