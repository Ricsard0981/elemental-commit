import * as THREE from 'three';
import { G } from './state.js';
import { scene, glow, dust, sparks, puff, cubes, rgb, ring, slash, flashLight, floatText, shake, punchFov, screenFlash, post, addFx, impactFlash, decal, shockwave, SPRITE } from './engine.js';
import { emit } from './events.js';
import { groundAt, ripple } from './world.js';
import { sfx } from './audio.js';
import { ELEMENTS, MOVES } from './elements.js';
import { addXP, xpNeed, prog } from './skills.js';
import { clamp, rand, pick, randi, easeOut } from './util.js';
import * as UI from './ui.js';
import { haptic } from './settings.js';

// ----------------------------------------------------------------- feedback hierarchy
// One profile per kind of event (seconds / trauma / FOV degrees / aberration). Every contact, parry, kill and landing asks
// fb() for its numbers instead of carrying literals, so the hierarchy stays consistent: light < heavy < finisher < slam < parry.
// Research (hit-stop ~4 f light ... 12 f slam, ~13 f parry, cap ~18 f): see docs/COMBAT_LOCK.md.
export const FEEDBACK = {
  light:    { hs: 0.066, shake: 0.12, fov: 0.6, ab: 0,     flash: 2.0 },
  airHit:   { hs: 0.05,  shake: 0.09, fov: 0.4, ab: 0,     flash: 1.8 },
  ranged:   { hs: 0.04,  shake: 0.08, fov: 0.3, ab: 0,     flash: 1.8 },
  special:  { hs: 0.06,  shake: 0.14, fov: 0.8, ab: 0,     flash: 2.2 },
  heavy:    { hs: 0.09,  shake: 0.22, fov: 1.2, ab: 0,     flash: 2.8 },
  finisher: { hs: 0.11,  shake: 0.3,  fov: 1.8, ab: 0.002, flash: 3.2 },
  crit:     { hs: 0.1,   shake: 0.26, fov: 1.5, ab: 0.003, flash: 3.0 },
  launcher: { hs: 0.1,   shake: 0.28, fov: 2.0, ab: 0,     flash: 3.0 },
  spike:    { hs: 0.12,  shake: 0.36, fov: 2.5, ab: 0.004, flash: 3.4 },
  bounce:   { hs: 0.1,   shake: 0.3,  fov: 2.0, ab: 0.004, flash: 3.0 },
  slam:     { hs: 0.17,  shake: 0.6,  fov: 4.0, ab: 0.008, flash: 4.5 },
  stagger:  { hs: 0.08,  shake: 0.2,  fov: 1.0, ab: 0,     flash: 3.0 },
  block:    { hs: 0.07,  shake: 0.22, fov: 0,   ab: 0,     flash: 2.0 },
  deflect:  { hs: 0.1,   shake: 0.3,  fov: 2.0, ab: 0.006, flash: 3.0 },
  parry:    { hs: 0.22,  shake: 0.5,  fov: 5.0, ab: 0.02,  flash: 4.0 },
  kill:     { hs: 0.08,  shake: 0.3,  fov: 0,   ab: 0.004, flash: 3.0 },
  bigKill:  { hs: 0.16,  shake: 0.7,  fov: 6.0, ab: 0.012, flash: 4.0 },
  hurt:     { hs: 0.12,  shake: 0.5,  fov: -2.5, ab: 0.014, flash: 0 },
};
export function fb(kind, o = {}) {
  const T = FEEDBACK[kind];
  hitstop((o.hitstop ?? T.hs) * (G.player ? G.player.el.prof.hs : 1)); shake(o.shake ?? T.shake);
  if (T.fov) punchFov(T.fov);
  if (T.ab) post.aberr = Math.max(post.aberr, T.ab);
  return T;
}
// ----------------------------------------------------------------- time helpers
export const hitstop = (s) => { G.freeze = Math.max(G.freeze, Math.min(s, 0.3)); }; // overlapping hit-stops extend (never stack), hard cap ~18 frames
export const slowmo = (scale, real) => { G.tsTarget = scale; G.tsHold = Math.max(G.tsHold, real); };
// every skill node that changes a hit announces itself (throttled per name), so you can SEE your build working
const procAt = {};
export function proc(name, x, y, color = '#ffd33d') {
  if ((procAt[name] || 0) > G.time) return; procAt[name] = G.time + 0.45;
  floatText(x, y, name, { color, size: 15, dur: 0.7 });
}
export const later = (delay, fn) => G.timers.push({ t: delay, fn });

export const enemyBox = (e) => ({ x0: e.x - e.w / 2, x1: e.x + e.w / 2, y0: e.y, y1: e.y + e.h });
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

// ----------------------------------------------------------------- combo
const MILESTONES = [5, 10, 20, 35, 50, 75, 100, 150];
export function comboAdd(n = 1) {
  const c = G.combo, before = c.n;
  c.n += n; c.t = 3.4; c.best = Math.max(c.best, c.n);
  for (let i = 0; i < MILESTONES.length; i++) if (before < MILESTONES[i] && c.n >= MILESTONES[i]) {
    c.rank = i + 1; sfx.combo(i * 2); UI.comboMilestone(i + 1);
    const p = G.player; ring(p.x, p.y + 1, 0.5, 0xffd33d, { r0: 0.5, r1: 5 + i, dur: 0.6 });
    post.bloomBoost = 0.4;
  }
}
export function comboBreak() { G.combo.n = 0; G.combo.rank = 0; }

// ----------------------------------------------------------------- XP / level
export function giveXP(amount, x, y) {
  const el = G.element;
  const ups = addXP(el, amount);
  floatText(x, y + 0.6, `+${amount} XP`, { color: '#7ee787', size: 15, dur: 0.9, vy: 2 });
  if (ups > 0) levelUp(ups);
}
function levelUp(n) {
  const p = G.player;
  sfx.levelUp(); haptic('level');
  p.hp = p.hpMax; p.energy = p.energyMax;
  const c = ELEMENTS[G.element].color;
  for (let i = 0; i < 3; i++) later(i * 0.12, () => ring(p.x, p.y + 0.9, 0.5, i % 2 ? 0xffffff : c, { r0: 0.4, r1: 5 + i * 3, dur: 0.7 + i * 0.1 }));
  cubes(p.x, p.y + 1, 0x39d353, 36, 12, 0.3, true, 1.8);
  cubes(p.x, p.y + 1, c, 20, 9, 0.25, true, 1.6);
  flashLight(p.x, p.y + 1.5, 2, 0x39d353, 80, 0.8);
  screenFlash(0x39d353, 0.3); post.bloomBoost = 0.8; punchFov(5); shake(0.3);
  ripple(p.x, 2.4, 0x39d353, 18, 1.4);
  UI.levelUpBanner(prog(G.element).level);
}

// ----------------------------------------------------------------- enemy damage
const HIT_SPRITE = { fire: SPRITE.streak, water: SPRITE.drop, earth: SPRITE.chip, air: SPRITE.streak };
const LAUNCH_VY = 17;
// ---- launch / juggle / spike (enemy airborne states live in enemies.js physics)
export function launchEnemy(e, vy, dir = 1) {
  if (e.boss || e.noLaunch || e.dead) return false;
  if (e.heavy && e.stagger <= 0) { e.vx += dir * 1.5; return false; } // brutes resist until their poise breaks
  if (e.flying) { e.vy = Math.max(e.vy, vy * 0.5); e.juggle = 0; return true; }
  e.air = true; e.juggle = 0; e.bounced = false; e.spiked = false; e.downT = 0; e.getUp = 0;
  e.vy = vy * (e.heavy ? 0.72 : 1); e.onGround = false; e.y += 0.06; e.airT = 0; e.maxH = 0; e.kdir = dir;
  emit('launch', { e, vy });
  return true;
}
export function juggleLift(e) {
  if (e.flying) { e.vy = Math.max(e.vy, 2.5); return; }
  e.juggle++; const n = e.juggle; const hook = G.player?.mods.skyhook ? 1.15 : 1;
  // juggle decay: every air hit lifts less and the fall gets faster, so a chain always ends
  if (n <= 6) e.vy = Math.max(e.vy, 10 * Math.pow(0.76, n - 1) * (e.heavy ? 0.75 : 1) * hook); else e.vy = Math.min(e.vy, 0.5);
  e.vx *= 0.5;
  emit('airHit', { e, n }); sfx.airhit(n);
}
export function spikeEnemy(e) {
  if (e.flying || e.boss) { e.vy = -8; return; }
  e.vy = -28; e.spiked = true; e.air = true;
  emit('spike', { e }); sfx.spike();
}
function applyImbue(e, o, p, dir) {
  const k = p.mods.resKey, pw = 1 + p.mods.resPower, col = ELEMENTS[k].color;
  if (k === 'fire') { e.burn = Math.max(e.burn, 1.2 + 0.8 * pw); e.burnDps = Math.max(e.burnDps || 0, 4 + 3 * pw); }
  else if (k === 'water') e.chill = Math.max(e.chill, 1 + 0.7 * pw);
  else if (k === 'earth') { e.poise -= 5 * pw; e.stunBuild = (e.stunBuild || 0) + 0.28 + 0.1 * pw; if (e.stunBuild >= 1 && !e.boss) { e.stunBuild = 0; e.stun = Math.max(e.stun, 0.5 + 0.2 * pw); e.onStun?.(); floatText(e.x, e.y + e.h + 1.1, 'STUN', { color: '#e0b070', size: 15, dur: 0.7 }); } }
  else if (k === 'air') { e.vx += Math.sign(p.x - e.x) * (1.2 + pw); if (!e.air) e.vy += 1.8 + pw; else e.vy += 1.2 * pw; }
  sparks(e.x, e.y + e.h * 0.55, col, 5 + pw * 2, 7, 0.2, 0.4, dir, 1, HIT_SPRITE[k]); sfx.imbue(k);
}
// Resonance T3: finishers detonate the secondary element
export function imbueBurst(p, x, y) {
  const k = p.mods.resKey; if (!k || !p.mods.resFinisher) return;
  const col = ELEMENTS[k].color;
  const o = { fire: { burn: 3, burnDps: 9 }, water: { chill: 3.5, kx: 8 }, earth: { stun: 1.0, kx: 4 }, air: { kx: 12, ky: 8, launch: 14 } }[k];
  explode(x, y, 2.6, 14, { color: col, shake: 0.2, noImbue: true, ...o });
}

export function hitEnemy(e, base, o = {}) {
  if (e.dead || e.spawnT > 0) return 0;
  const p = G.player, m = p.mods;
  let d = base * (1 + m.allDmg) * (p.dmgBuff || 1) * p.el.prof.dmg;
  const crit = !o.noCrit && Math.random() < 0.1 + (p.critBonus || 0);
  if (crit) d *= 1.75;
  if (e.chill > 0 && m.frostbite) { d *= 1.45; proc('FROSTBITE +45%', e.x, e.y + e.h + 0.6, '#9fe8ff'); }
  if (e.burn > 0 && m.brand) { d *= 1.4; proc('BRANDED +40%', e.x, e.y + e.h + 0.6, '#ffb347'); }
  if (e.stun > 0 && m.crushing) { d *= 1.8; proc('CRUSHED +80%', e.x, e.y + e.h + 0.6, '#e0b070'); }
  if (e.vulnerable > 0) d *= 1.25;
  d = Math.max(1, Math.round(d)); const dRaw = d;
  if (e.shield) d = Math.max(1, Math.round(d * 0.3)); // phase-2 shield: damage barely matters, break its poise
  if (p.blockCharge >= 3 && o.kind === 'main' && m.rebound) { // Rebound: three blocks load your next main attack
    p.blockCharge = 0; d = Math.round(d * 2); o = { ...o, poise: (o.poise ?? d) * 3, big: true };
    floatText(e.x, e.y + e.h + 1.2, 'REBOUND', { color: '#e0b070', size: 18, dur: 0.9 });
  }
  if (p.counterT > 0 && o.kind === 'main') { // the strike right after a perfect parry: a counter
    p.counterT = 0; d = Math.round(d * 1.5); o = { ...o, poise: (o.poise ?? d) * 2, big: true };
    floatText(e.x, e.y + e.h + 1.2, 'COUNTER', { color: '#ffd33d', size: 18, dur: 0.9 }); emit('counter', { e });
  }
  const dir = o.dir ?? (Math.sign(e.x - p.x) || 1);
  e.hp -= d; e.flash = 0.06; e.hurtT = 2.2; e.recoil = 1; e.kdir = dir;
  // knockback
  if (!e.heavy || e.stagger > 0) {
    e.vx += dir * (o.kx ?? 5) * (e.kbMul ?? 1); if (o.ky && !e.air) e.vy += o.ky * (e.kbMul ?? 1);
  } else e.vx += dir * (o.kx ?? 5) * 0.12;
  // poise / stagger
  e.poise -= (o.poise ?? dRaw * 0.9) * p.el.prof.poise * (e.shield ? 2 : 1) * (e.state === 'recover' ? 1.6 : 1) * (e.armorT > 0 ? 0.5 : 1);
  if (e.armorT > 0 && (e.armorMsg ?? 0) < G.time) { e.armorMsg = G.time + 0.5; floatText(e.x, e.y + e.h + 0.9, 'ARMOR', { color: '#9fd0ff', size: 14, dur: 0.6 }); }
  if (e.poise <= 0 && e.stagger <= 0 && !e.boss) { e.stagger = e.staggerTime || 0.45; e.poise = e.poiseMax; e.onStagger?.(); staggerFx(e); }
  if (e.boss && e.poise <= 0) { e.poise = e.poiseMax; e.onStagger?.(); }
  // statuses
  if (o.burn) { e.burn = Math.max(e.burn, o.burn); e.burnDps = Math.max(e.burnDps || 0, o.burnDps || 8); }
  if (o.chill) {
    e.chill = Math.max(e.chill, o.chill);
    if (m.freeze && !e.boss && e.frozen <= 0) { // Deep Chill: the third chilling hit freezes the target solid
      e.chillStacks = (e.chillStacks || 0) + 1;
      if (e.chillStacks >= 3) { e.chillStacks = 0; e.frozen = 0.8; e.stun = Math.max(e.stun, 0.8); sparks(e.x, e.y + e.h * 0.5, 0x9fe8ff, 14, 8, 0.25, 0.5); floatText(e.x, e.y + e.h + 1.1, 'FROZEN', { color: '#9fe8ff', size: 18, dur: 0.9 }); sfx.stagger(false); }
    }
  }
  if (o.stun && !e.boss) { e.stun = Math.max(e.stun, o.stun); e.onStun?.(); }
  if (o.pull) e.vx += o.pull;
  if (o.kind === 'main' && m.resKey && !o.noImbue) applyImbue(e, o, p, dir);
  // Shatter: finishers, launchers, spikes and slams burst frozen enemies
  if (e.frozen > 0 && m.shatter && (o.launch || o.finisher || o.bounce || o.spike || o.big)) {
    e.frozen = 0; floatText(e.x, e.y + e.h + 1.2, 'SHATTER', { color: '#cfeeff', size: 20, dur: 0.9 });
    later(0.02, () => explode(e.x, e.y + e.h * 0.5, 2.8, 22, { color: 0x9fe8ff, chill: 2.5, noImbue: true, quiet: false }));
  }
  // launch / juggle
  let launched = false;
  if (o.launch) launched = launchEnemy(e, o.launch, dir);
  else if (e.air && o.spike) spikeEnemy(e);
  else if (e.air && o.lift) juggleLift(e);
  else if (o.bounce && !e.air && !e.boss && (!e.heavy || e.stagger > 0)) { e.air = true; e.spiked = true; e.bounced = false; e.vy = -14; e.juggle = 0; e.downT = 0; e.airT = 0; e.maxH = 0; e.onGround = false; e.y += 0.04; }
  // feedback
  const col = o.color ?? ELEMENTS[G.element].color;
  const big = d > 30 || o.big;
  const fk = crit ? 'crit' : o.launch ? 'launcher' : o.spike ? 'spike' : o.bounce ? 'bounce' : (e.air && o.lift) ? 'airHit' : o.kind === 'ranged' ? 'ranged' : o.kind === 'special' ? 'special' : o.finisher ? 'finisher' : big ? 'heavy' : 'light';
  const T = FEEDBACK[fk];
  hitstop(o.hitstop ?? T.hs); shake(o.shake ?? T.shake);
  const hy = e.y + e.h * 0.55;
  sparks(e.x, hy, col, crit ? 16 : fk === 'light' ? 7 : 10, crit ? 11 : 8, 0.26, 0.45, dir, 1, HIT_SPRITE[G.element]);
  sparks(e.x, hy, 0xffffff, fk === 'light' ? 3 : 5, 6, 0.18, 0.25, dir);
  if (!o.quiet) {
    impactFlash(e.x - dir * 0.2, hy, col, T.flash);
    if (T.fov) punchFov(T.fov);
    if (T.ab) post.aberr = Math.max(post.aberr, T.ab);
    sfx.hit(fk, G.combo.n, e.dummy ? 'wood' : e.heavy || e.boss || e.type === 'pointer' ? 'metal' : 'flesh'); haptic(crit ? 'crit' : 'hit');
  }
  floatText(e.x, e.y + e.h + 0.4, crit ? `${d}!` : String(d), { cls: crit ? 'crit' : '', color: crit ? '#ffd33d' : '#ffffff', size: crit ? 34 : big ? 26 : 20, dur: crit ? 1.1 : 0.8, vy: crit ? 3.4 : 2.6 });
  if (crit) ring(e.x, e.y + e.h * 0.5, 0.6, 0xffd33d, { r0: 0.2, r1: 1.8, dur: 0.3 });
  if (m.skyhook && !p.onGround && o.kind === 'main') { proc('SKYHOOK', p.x, p.y + 3, '#7ff3d6'); p.airDash = true; p.cd.dash = Math.min(p.cd.dash, 0.1); } // Skyhook: air hits refund the air dash
  if (!o.noCombo) comboAdd(1);
  if (!o.noEnergy && !p.infEnergy) p.energy = Math.min(p.energyMax, p.energy + (o.kind === 'main' ? 4.5 : 1.5));
  else if (p.infEnergy) p.energy = p.energyMax;
  e.onHurt?.(d, o);
  emit('hit', { e, d, crit, o, dir, launched });
  if (e.dummy) { e.hp = e.hpMax; return d; }
  if (e.hp <= 0) killEnemy(e, o);
  return d;
}

// a poise break reads as its own event: gold shield-crack ring, flash, a short freeze and a distinct sound
function staggerFx(e) {
  const T = FEEDBACK.stagger, cy = e.y + e.h * 0.55;
  hitstop(T.hs); shake(T.shake); e.flash = 0.12;
  ring(e.x, cy, 0.7, 0xffe9a0, { r0: 0.3, r1: e.heavy ? 3.8 : 2.3, dur: 0.3, intensity: 2 });
  sparks(e.x, cy, 0xffe9a0, 10, 9, 0.22, 0.4, 0, 1);
  if (e.heavy) floatText(e.x, e.y + e.h + 1.1, 'BREAK', { color: '#ffe9a0', size: 18, dur: 0.9 });
  sfx.stagger(!!e.heavy); emit('stagger', { e });
}
export function killEnemy(e, o = {}) {
  if (e.dead) return;
  e.dead = true;
  const p = G.player, big = e.heavy || e.boss;
  G.stats.kills++;
  const cy = e.y + e.h * 0.5;
  sfx.kill(big); haptic(e.boss ? 'boss' : 'kill');
  fb(big ? 'bigKill' : 'kill');
  ring(e.x, cy, 0.6, e.color, { r0: 0.3, r1: big ? 7 : 3.2, dur: 0.5 });
  ring(e.x, cy, 0.6, 0xffffff, { r0: 0.2, r1: big ? 4 : 1.8, dur: 0.3 });
  flashLight(e.x, cy, 2, e.color, big ? 90 : 40, 0.4);
  sparks(e.x, cy, 0xffffff, big ? 30 : 14, 12, 0.3, 0.6);
  cubes(e.x, cy, e.color, big ? 40 : 14, big ? 13 : 9, big ? 0.5 : 0.32, false, 1.7);
  cubes(e.x, cy, 0x39d353, big ? 24 : 8, 8, 0.2, true, 1.2);
  puff(e.x, e.y + 0.3, big ? 12 : 5, 0x8b949e, 1.2, 0.8);
  ripple(e.x, big ? 3 : 1.4, e.color, 16, 1.0);
  if (big) { slowmo(0.28, 0.5); screenFlash(0xffffff, 0.25); }
  floatText(e.x, e.y + e.h + 1, pick(['BUG FIXED', 'RESOLVED', 'MERGED', 'REFACTORED', 'DEPRECATED', 'CLOSED']) + ` #${randi(100, 9999)}`, { color: '#7ee787', size: big ? 26 : 15, dur: 1.2, vy: 1.6 });
  // loot
  const mult = 1 + Math.floor(G.combo.n / 20) * 0.5;
  spawnCommits(e.x, cy, Math.round(e.commits * mult));
  if (Math.random() < (e.heart ?? 0.1) && p.hp < p.hpMax * 0.9) spawnHeart(e.x, cy);
  giveXP(e.xp, e.x, e.y + e.h);
  // fire passive
  if (e.burn > 0 && p.mods.deathExplode) later(0.12, () => explode(e.x, cy, 4.4, 60, { color: 0xff6a2b, burn: 3, chain: true }));
  if (e.burn > 0 && p.mods.spreadBurn) { // Spreading Embers
    ring(e.x, cy, 0.5, 0xff6a2b, { r0: 0.4, r1: 7, dur: 0.4 }); proc('EMBERS SPREAD', e.x, cy + 1, '#ff9a4d');
    for (const o2 of G.enemies) if (o2 !== e && !o2.dead && Math.hypot(o2.x - e.x, o2.y - e.y) < 7) { o2.burn = Math.max(o2.burn, 3); o2.burnDps = Math.max(o2.burnDps || 0, 8); }
  }
  e.onDeath?.();
  emit('kill', { e });
  p.energy = Math.min(p.energyMax, p.energy + 10);
}

export function hitBox(x0, x1, y0, y1, dmg, o = {}) {
  const box = { x0, x1, y0, y1 }, hit = [];
  // remember the player's melee box so the swing's contact window can still catch a target that steps in a few frames late
  const pa = G.player?.atk, rec = o.kind === 'main' && pa && !pa.box && !o.noRecord;
  if (rec) pa.box = { x0, x1, y0, y1, dmg, o };
  for (const e of G.enemies.slice()) {
    if (e.dead || e.spawnT > 0) continue;
    if (overlap(box, enemyBox(e))) { hitEnemy(e, dmg, o); hit.push(e); if (rec) pa.hit.add(e); }
  }
  return hit;
}

export function explode(x, y, r, dmg, o = {}) {
  const c = o.color ?? ELEMENTS[G.element].color;
  sfx.explosion(r / 3);
  ring(x, y, 0.4, c, { r0: 0.3, r1: r * 1.1, dur: 0.45, intensity: 2 });
  ring(x, y, 0.4, 0xffffff, { r0: 0.1, r1: r * 0.7, dur: 0.25 });
  if (!o.noGround) ring(x, groundAt(x) + 0.05, 0.4, c, { r0: 0.3, r1: r * 1.3, dur: 0.5, flat: true });
  flashLight(x, y, 2.5, c, 60 + r * 8, 0.35);
  sparks(x, y, c, 18 + r * 4, 6 + r * 2.2, 0.32, 0.6);
  sparks(x, y, 0xffffff, 8, 8, 0.2, 0.3);
  cubes(x, y, o.cubeColor ?? c, 8 + r * 2, 6 + r * 1.5, 0.28, true, 1);
  puff(x, y - 0.3, 6, 0x6e7681, 1.1, 0.7);
  ripple(x, Math.min(3, r * 0.5), c, 14, 0.9);
  shake(o.shake ?? Math.min(0.6, 0.12 + r * 0.07));
  hitstop(o.hitstop ?? 0.05);
  for (const e of G.enemies.slice()) {
    if (e.dead || e.spawnT > 0) continue;
    const cx = e.x, cy = e.y + e.h * 0.5;
    const d = Math.hypot(cx - x, (cy - y) * 0.9);
    if (d <= r + e.w * 0.5) hitEnemy(e, dmg * (1 - 0.35 * (d / (r + 0.01))), { ...o, dir: Math.sign(cx - x) || 1, kx: (o.kx ?? 7) * (1 - d / (r + 3)) + 2, ky: o.ky ?? 5, big: true, hitstop: 0.03, color: c });
  }
  // player-harming explosion (enemy-owned) handled by caller
}

// ----------------------------------------------------------------- projectiles
const geo = { orb: new THREE.SphereGeometry(1, 14, 10), box: new THREE.BoxGeometry(1, 1, 1) };
export function spawnProj(o) {
  const col = new THREE.Color(o.color ?? 0xffffff).multiplyScalar(o.shape === 'rock' ? 1 : 2.2);
  const mesh = new THREE.Mesh(o.shape === 'rock' ? geo.box : geo.orb,
    o.shape === 'rock' ? new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.8, flatShading: true }) : new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
  const r = o.r ?? 0.35;
  mesh.scale.set(o.shape === 'blade' ? r * 2.4 : r, o.shape === 'blade' ? r * 0.45 : r, r);
  mesh.position.set(o.x, o.y, 0);
  mesh.castShadow = o.shape === 'rock';
  scene.add(mesh);
  const pr = { owner: 'player', dmg: 10, life: 3, grav: 0, pierce: 0, hit: new Set(), trailC: o.color ?? 0xffffff, mesh, vx: 0, vy: 0, r, spin: 0, ...o };
  G.projectiles.push(pr);
  return pr;
}
export function endProj(pr, hitSomething = true) {
  if (pr.dead) return;
  pr.dead = true; scene.remove(pr.mesh);
  pr.onEnd?.(pr, hitSomething);
}
export function reflectProj(pr, mult = 2.5, pierce = false) {
  pr.owner = 'player'; pr.dmg *= mult;
  const src = pr.src;
  let tx = pr.x - pr.vx, ty = pr.y;
  if (src && !src.dead) { tx = src.x; ty = src.y + src.h * 0.5; }
  const dx = tx - pr.x, dy = ty - pr.y, l = Math.hypot(dx, dy) || 1;
  const sp = Math.max(16, Math.hypot(pr.vx, pr.vy) * 1.6);
  pr.vx = (dx / l) * sp; pr.vy = (dy / l) * sp; pr.hit = new Set(); pr.life = 2.5; pr.pierce = pierce ? 3 : 0; pr.reflected = true;
  const c = ELEMENTS[G.element].color;
  pr.mesh.material.color.set(c).multiplyScalar(2.6); pr.trailC = c; pr.mesh.scale.multiplyScalar(1.25);
  pr.onEnd = (p) => explode(p.x, p.y, 2.4, 18 * mult, { color: c, quiet: true });
}
export function updateProjectiles(dt) {
  const p = G.player;
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const pr = G.projectiles[i];
    if (pr.dead) { G.projectiles.splice(i, 1); continue; }
    if (pr.homing && pr.owner === 'player') {
      let best = null, bd = pr.homing.range ?? 9;
      for (const e of G.enemies) if (!e.dead && e.spawnT <= 0) { const d = Math.hypot(e.x - pr.x, e.y + e.h / 2 - pr.y); if (d < bd) { bd = d; best = e; } }
      if (best) {
        const sp = Math.hypot(pr.vx, pr.vy), a = Math.atan2(pr.vy, pr.vx), ta = Math.atan2(best.y + best.h / 2 - pr.y, best.x - pr.x);
        let da = ta - a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const na = a + clamp(da, -pr.homing.turn * dt, pr.homing.turn * dt);
        pr.vx = Math.cos(na) * sp; pr.vy = Math.sin(na) * sp;
      }
    }
    pr.vy -= pr.grav * dt;
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
    pr.mesh.position.set(pr.x, pr.y, 0);
    if (pr.shape === 'blade') pr.mesh.rotation.z = Math.atan2(pr.vy, pr.vx);
    if (pr.shape === 'rock') { pr.mesh.rotation.x += dt * 8; pr.mesh.rotation.z += dt * 6; }
    pr.mesh.scale.multiplyScalar(1 + Math.sin(G.time * 30) * 0.002);
    // trail
    const tc = rgb(pr.trailC, 1.5);
    glow.emit(pr.x + rand(-0.1, 0.1), pr.y + rand(-0.1, 0.1), 0, -pr.vx * 0.05, rand(-0.4, 0.4), 0, tc, pr.r * 1.6, 0, 0.3, 0, 3);
    if (pr.trailDust) dust.emit(pr.x, pr.y, 0, rand(-0.5, 0.5), rand(0, 1), 0, rgb(pr.trailDust, 0.6), pr.r * 1.5, pr.r * 3, 0.5, 0, 2);
    // terrain
    const ground = groundAt(pr.x);
    if (!pr.ghost && pr.y - pr.r * 0.3 < ground) { pr.y = ground + pr.r * 0.3; endProj(pr, true); continue; }
    if (pr.life <= 0 || pr.y < -20 || Math.abs(pr.x - p.x) > 70) { endProj(pr, false); continue; }
    if (pr.owner === 'player') {
      for (const e of G.enemies) {
        if (e.dead || e.spawnT > 0 || pr.hit.has(e)) continue;
        const b = enemyBox(e);
        if (pr.x > b.x0 - pr.r && pr.x < b.x1 + pr.r && pr.y > b.y0 - pr.r && pr.y < b.y1 + pr.r) {
          pr.hit.add(e);
          if (pr.onHit) pr.onHit(pr, e); else hitEnemy(e, pr.dmg, { kind: 'ranged', dir: Math.sign(pr.vx) || 1, color: pr.trailC });
          if (pr.pierce > 0) pr.pierce--; else { endProj(pr, true); break; }
        }
      }
    } else if (!p.dead) {
      const hw = p.w / 2 + pr.r * 0.8;
      if (Math.abs(pr.x - p.x) < hw && pr.y > p.y - pr.r && pr.y < p.y + p.h + pr.r) {
        const res = damagePlayer(pr.dmg, { x: pr.x - Math.sign(pr.vx) * 0.5, y: pr.y, proj: pr, enemy: pr.src, kind: 'proj' });
        if (res === 'parry' || res === 'iframes' || res === 'deflect') continue;
        endProj(pr, true);
      }
    }
  }
}

// ----------------------------------------------------------------- player damage / defence
export function damagePlayer(amount, src = {}) {
  const r = damagePlayerInner(amount, src);
  if (r !== 'iframes') emit('playerHit', { result: r, amount, src });
  return r;
}
function damagePlayerInner(amount, src) {
  const p = G.player;
  if (!p || p.dead || p.hurtI > 0 || p.dashInv > 0) return 'iframes';
  const el = ELEMENTS[G.element], g = el.guard;
  const front = (src.x - p.x) * p.facing >= -0.4;
  const guarded = p.guarding && (front || g.allAround);
  if (guarded) {
    const win = p.parryWindow;
    if (p.guardT <= win) { perfectParry(src); return 'parry'; }
    if (src.proj && g.deflects) { reflectProj(src.proj, p.mods.vacuum ? 3 : 1.6, !!p.mods.vacuum); sfx.block(); sparks(p.x + p.facing, p.y + 1, el.color2, 10, 7); return 'deflect'; }
    // normal block
    const red = g.reduction + p.mods.dr;
    const taken = Math.max(0, Math.round(amount * (1 - Math.min(0.95, red))));
    p.hurtI = Math.max(p.hurtI, 0.12); // one attack can't be blocked twice (brute smash + its wave)
    p.lastBlockT = G.time;
    if (p.mods.burnGuard) explode(p.x + p.facing * 0.8, p.y + 1, 2.2, 10, { color: 0xff6a2b, burn: 2.5, kx: 5, quiet: true, shake: 0, hitstop: 0 });
    if (p.mods.burnGuard && src.enemy) { src.enemy.burn = Math.max(src.enemy.burn, 3); src.enemy.burnDps = Math.max(src.enemy.burnDps || 0, 8); ring(src.enemy.x, src.enemy.y + 1, 0.5, 0xff6a2b, { r0: 0.3, r1: 1.6, dur: 0.3 }); }
    if (p.mods.rebound) { p.blockCharge = Math.min(3, (p.blockCharge || 0) + 1); if (p.blockCharge === 3) floatText(p.x, p.y + 3.1, 'REBOUND READY', { color: '#e0b070', size: 16, dur: 0.9 }); }
    const late = p.guardT > win && p.guardT < win + 0.18;
    sfx.block(); haptic('block'); fb('block');
    sparks(p.x + p.facing * 0.7, p.y + 1.1, el.color2, 14, 8, 0.25, 0.4, p.facing);
    ring(p.x + p.facing * 0.7, p.y + 1.1, 0.6, el.color2, { r0: 0.2, r1: 1.6, dur: 0.25 });
    p.vx -= Math.sign(src.x - p.x) * (g.knockback ?? 5);
    p.guardFlash = 0.15;
    if (p.mods.thorns) { explode(p.x + p.facing * 0.5, p.y + 1, 3.6, amount * 3.5, { color: el.color, kx: 9, stun: 0.9 }); proc('REFLECTED', p.x, p.y + 3.2, '#e0b070'); }
    floatText(p.x, p.y + 2.4, (late ? 'LATE ' : '') + (taken > 0 ? `-${taken}` : 'BLOCKED'), { color: taken > 0 ? '#ffa657' : '#9ecbff', size: 18 });
    if (taken > 0) { p.hp -= taken; G.stats.damageTaken += taken; if (p.hp <= 0) return playerDown(src); }
    if (src.proj) endProj(src.proj, true);
    p.energy = Math.min(p.energyMax, p.energy + 6);
    return 'blocked';
  }
  // ---- real hit
  const dr = clamp(p.mods.dr + (p.drBuff || 0), 0, 0.8);
  const dmg = Math.max(1, Math.round(amount * (1 - dr)));
  p.hp -= dmg; G.stats.damageTaken += dmg;
  // Stonewill: while winding up a combo hit you keep swinging (damage is taken, but no stun / knockback / interruption)
  const stoneArmor = p.state === 'attack' && p.atk && p.atk.kind !== 'slam' && p.atk.t < p.atk.cancelAt && (p.mods.stonewill || (p.key === 'earth' && (p.atk.kind === 'dashStrike' || (p.atk.kind === 'ground' && p.atk.i === 2)))); // Earth's finisher is armoured by default
  p.hurtI = 0.9; p.stun = stoneArmor ? 0 : 0.22; p.blink = 0.9;
  if (stoneArmor) floatText(p.x, p.y + 3, 'STONEWILL', { color: '#e0b070', size: 14, dur: 0.6 });
  // a real hit interrupts whatever you were doing and drops the buffered inputs (no stale actions after the stun)
  else {
    if (p.state === 'attack' || p.state === 'cast') { p.state = 'free'; p.atk = null; p.slam = null; p.castT = 0; }
    for (const k in p.buf) p.buf[k] = 0;
    p.comboT = 0; p.acomboT = 0;
  }
  if (!stoneArmor) { p.vx = Math.sign(p.x - src.x || 1) * 7; p.vy = Math.max(p.vy, 6); }
  p.squash = 0.55;
  comboBreak();
  sfx.hurt(); haptic('hurt'); fb('hurt');
  post.aberr = 0.014; screenFlash(0xf85149, 0.4); UI.damageVignette();
  sparks(p.x, p.y + 1, 0xff4d4d, 16, 9, 0.28, 0.5);
  floatText(p.x, p.y + 2.5, `-${dmg}`, { color: '#ff6b6b', size: 30, cls: 'hurt' });
  if (src.proj) endProj(src.proj, true);
  if (p.hp <= 0) return playerDown(src);
  return 'hit';
}
function playerDown(src) {
  const p = G.player;
  if (p.mods.rebirth && !p.reborn) {
    p.reborn = true; p.hp = p.hpMax * 0.5; p.hurtI = 2.2;
    explode(p.x, p.y + 1, 7, 90, { color: 0xff6a2b, kx: 14, ky: 8, shake: 0.8 });
    floatText(p.x, p.y + 3, 'REBIRTH!', { color: '#ffb347', size: 42 }); screenFlash(0xffb347, 0.6); slowmo(0.3, 0.6);
    return 'hit';
  }
  p.hp = 0; p.dead = true; G.mode = 'dead';
  sfx.die(); shake(0.9); slowmo(0.2, 1.4);
  cubes(p.x, p.y + 1, ELEMENTS[G.element].color, 30, 10, 0.3, true, 2);
  UI.showDeath();
  return 'dead';
}
function perfectParry(src) {
  const p = G.player, el = ELEMENTS[G.element];
  G.stats.parries++;
  p.hurtI = 0.5; p.counterT = 0.45; p.guarding = false; p.cd.guard = 0.4; p.guardPresses.length = 0; // guard drops so the counter can start
  sfx.parry(); haptic('parry'); fb('parry'); slowmo(0.22, 0.5);
  post.bloomBoost = 0.9; screenFlash(0xffffff, 0.35);
  const x = p.x + p.facing * 0.6, y = p.y + 1.1;
  ring(x, y, 0.8, 0xffffff, { r0: 0.2, r1: 6, dur: 0.5, intensity: 2.5 });
  ring(x, y, 0.8, el.color, { r0: 0.2, r1: 9, dur: 0.7, intensity: 2.2 });
  sparks(x, y, 0xffffff, 24, 14, 0.3, 0.6); sparks(x, y, el.color, 24, 12, 0.3, 0.7);
  cubes(x, y, el.color2, 14, 9, 0.22, true, 1.2);
  flashLight(x, y, 2, el.color, 100, 0.5);
  ripple(p.x, 2.2, el.color, 18, 1.2);
  floatText(p.x, p.y + 3, 'PERFECT PARRY', { color: '#ffd33d', size: 34, cls: 'parry', dur: 1.2 });
  UI.parryFlash();
  p.energy = Math.min(p.energyMax, p.energy + 25);
  comboAdd(3);
  if (src.proj) reflectProj(src.proj, 3, !!p.mods.vacuum);
  if (p.mods.riposte) { // Riposte: the parry becomes a counter-attack on the attacker (or the nearest enemy)
    let foe = src.enemy && !src.enemy.dead ? src.enemy : null;
    if (!foe) { let bd = 9; for (const e of G.enemies) if (!e.dead && e.spawnT <= 0 && !e.boss && Math.abs(e.x - p.x) < bd) { bd = Math.abs(e.x - p.x); foe = e; } }
    if (foe) { later(0.04, () => { if (!foe.dead && !p.dead) MOVES[p.key].riposte(p, foe); }); proc('RIPOSTE', p.x, p.y + 4.2, '#ffd33d'); }
  }
  if (src.enemy && !src.enemy.dead) {
    const e = src.enemy;
    if (!e.boss) { e.poise = 0; e.stagger = Math.max(e.stagger, 1.8); e.vulnerable = 3; e.stun = Math.max(e.stun, 0.4); }
    e.parried?.();
    spawnCommits(e.x, e.y + e.h / 2, 4);
    floatText(e.x, e.y + e.h + 1, 'STAGGERED', { color: '#ffd33d', size: 20 });
  }
  emit('parry', { src });
  shockwave(p.x + p.facing * 0.6, p.y + 1.1, 0.045, 0.6);
  g_perfect(p, src);
}
function g_perfect(p, src) { ELEMENTS[G.element].guard.onPerfect(p, src); }

// ----------------------------------------------------------------- pickups
const pk = { commit: new THREE.BoxGeometry(0.3, 0.3, 0.3), heart: new THREE.OctahedronGeometry(0.28), cm: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x39d353).multiplyScalar(2.4), toneMapped: false }), hm: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8fc7).multiplyScalar(2.4), toneMapped: false }) };
export function spawnCommit(x, y, o = {}) {
  const mesh = new THREE.Mesh(pk.commit, pk.cm);
  mesh.position.set(x, y, 0); scene.add(mesh);
  G.pickups.push({ type: 'commit', x, y, vx: o.vx ?? 0, vy: o.vy ?? 0, mesh, age: 0, home: !!o.home, still: !!o.still, ph: rand(6) });
}
export function spawnCommits(x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = rand(Math.PI), s = rand(4, 11);
    spawnCommit(x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s + 3, home: true });
  }
}
export function spawnHeart(x, y) {
  const mesh = new THREE.Mesh(pk.heart, pk.hm); mesh.scale.set(1, 1.3, 1); mesh.position.set(x, y, 0); scene.add(mesh);
  G.pickups.push({ type: 'heart', x, y, vx: rand(-2, 2), vy: 7, mesh, age: 0, home: false, ph: 0 });
}
let chain = 0, chainT = 0;
export function updatePickups(dt) {
  const p = G.player;
  chainT -= dt; if (chainT <= 0) chain = 0;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const k = G.pickups[i];
    k.age += dt;
    const dx = p.x - k.x, dy = p.y + 1 - k.y, d = Math.hypot(dx, dy);
    const mag = k.type === 'heart' ? 2.6 : k.home ? 99 : 2.8;
    if (k.age > (k.home ? 0.45 : 0) && d < mag && !p.dead) {
      k.still = false;
      const pull = (k.home ? 28 : 18) * dt * (1 + k.age * 1.5);
      k.vx += (dx / d) * pull * 3; k.vy += (dy / d) * pull * 3;
      k.vx *= 1 - 3 * dt; k.vy *= 1 - 3 * dt; k.mag = true;
    } else if (!k.mag) {
      k.vy -= 24 * dt;
      const g = groundAt(k.x) + 0.25;
      if (!k.still && k.y < g) { k.y = g; k.vy *= -0.4; k.vx *= 0.7; }
      if (k.still) { k.vx = 0; k.vy = 0; }
    }
    k.x += k.vx * dt; k.y += k.vy * dt;
    k.mesh.position.set(k.x, k.y + (k.still ? Math.sin(G.time * 3 + k.ph) * 0.12 : 0), 0);
    k.mesh.rotation.y += dt * 4; k.mesh.rotation.x += dt * 2;
    if (k.type === 'commit' && Math.random() < 0.25) glow.emit(k.x, k.y, 0, 0, 0.5, 0, rgb(0x39d353, 1.5), 0.25, 0, 0.35);
    if (d < 0.9 && !p.dead) {
      scene.remove(k.mesh); G.pickups.splice(i, 1);
      if (k.type === 'commit') {
        G.stats.commits++; chain++; chainT = 0.5; sfx.pickup(chain);
        UI.commitPop();
        sparks(k.x, k.y, 0x7ee787, 5, 5, 0.2, 0.3);
      } else {
        p.hp = Math.min(p.hpMax, p.hp + 18); sfx.heal(); ring(p.x, p.y + 1, 0.5, 0xff8fc7, { r0: 0.3, r1: 2.4, dur: 0.5 });
        floatText(p.x, p.y + 2.4, '+18 HP', { color: '#ff8fc7', size: 22 }); sparks(p.x, p.y + 1, 0xff8fc7, 14, 6);
      }
    }
  }
}
export function clearAll() {
  for (const pr of G.projectiles) { scene.remove(pr.mesh); }
  for (const k of G.pickups) scene.remove(k.mesh);
  G.projectiles.length = 0; G.pickups.length = 0; G.fx.length = 0; G.timers.length = 0;
}
