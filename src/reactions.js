// Elemental reactions. Hits carry your element (and your Resonance element on main attacks); when one lands on an enemy that
// already carries a status of another element, the two combine into a named reaction. Statuses are consumed, so a reaction is
// a decision (when to cash it in), not a passive.
//
//   incoming      status on enemy        reaction
//   fire          chilled                STEAM         blinds nearby enemies, they lose their attack
//   water         burning                STEAM
//   fire          frozen                 THERMAL SHOCK armour and poise break, big hit
//   fire / earth  stunned / burning      MAGMA         eruption + vulnerable
//   fire / air    airborne / burning     FIRESTORM     rising fire column that launches neighbours
//   water / earth stunned / chilled      MUD           slows everything nearby to a crawl
//   earth / air   lifted / stunned       SANDSTORM     pulls enemies in and stuns them
import { G } from './state.js';
import { emit } from './events.js';
import { sfx } from './audio.js';
import { ring, puff, sparks, cubes, floatText, shake, flashLight, decal, rgb, glow, addFx } from './engine.js';
import { explode, hitEnemy, hitBox, launchEnemy, later } from './combat.js';
import { groundAt } from './world.js';

const COL = { steam: 0xdfeaf2, shock: 0xff9ad6, magma: 0xff5a1f, firestorm: 0xffa033, mud: 0x8a6a3d, sand: 0xe0c07a };

function announce(name, e, color) {
  floatText(e.x, e.y + e.h + 1.3, name, { color: '#' + color.toString(16).padStart(6, '0'), size: 24, dur: 1.1, vy: 2 });
  sfx.reaction(name);
  emit('reaction', { name, e });
}
const around = (e, r, fn) => { r *= KR; for (const o of G.enemies) if (!o.dead && o.spawnT <= 0 && Math.hypot(o.x - e.x, o.y - e.y) <= r) fn(o); };
const free = { noReact: true, noStyle: true, quiet: true, noCombo: true };
let KD = 1, KR = 1, PM = null; // Chain Reaction patch: damage and radius multipliers; PM = the player's mods during a reaction

function steam(e) {
  e.chill = 0; e.burn = 0; announce('STEAM', e, COL.steam);
  puff(e.x, e.y + 0.6, 16, 0xdfeaf2, 2.2, 1.6, 2.5); ring(e.x, e.y + e.h * 0.5, 0.5, 0xdfeaf2, { r0: 0.3, r1: 4.5, dur: 0.6 });
  if (PM.mergeSteam) { KR *= 1.6; const p = G.player; p.hp = Math.min(p.hpMax, p.hp + 6); }
  around(e, 4.5, (o) => { o.blind = 2.5; o.cd = Math.max(o.cd || 0, 2.5); if (!o.boss && o.state !== 'stunned') { o.state = 'idle'; o.tele = 0; } hitEnemy(o, 12 * KD, { ...free, kind: 'special', color: COL.steam, poise: 8 }); });
}
function thermalShock(e) {
  e.frozen = 0; e.chill = 0; announce('THERMAL SHOCK', e, COL.shock);
  ring(e.x, e.y + e.h * 0.5, 0.5, COL.shock, { r0: 0.3, r1: 3.5, dur: 0.4 }); sparks(e.x, e.y + e.h * 0.5, 0xffffff, 22, 12, 0.3, 0.5);
  e.armorT = 0; e.poise = 0; e.stagger = Math.max(e.stagger, 2); e.vulnerable = Math.max(e.vulnerable, 3);
  hitEnemy(e, 40 * KD, { ...free, kind: 'special', big: true, color: COL.shock, poise: 60 });
}
function magma(e) {
  e.stun = 0; e.burn = Math.max(e.burn, 0); announce('MAGMA', e, COL.magma);
  const gy = groundAt(e.x); decal('scorch', e.x, gy, 3.2, 5, COL.magma);
  explode(e.x, e.y + 0.4, 2.8 * KR, 36 * KD, { ...free, color: COL.magma, burn: 3, kx: 3, ky: 9, shake: 0.35 });
  if (PM.mergeMagma) { const x = e.x; let t = 0; addFx((dt) => { t += dt; if (Math.random() < 0.6) glow.emit(x + (Math.random() - 0.5) * 3.4, gy + 0.15, 0.2, 0, 1 + Math.random() * 2, 0, rgb(0xff5a1f, 1.9), 0.4, 0, 0.5, -1, 0); if (Math.floor(t * 2.5) !== Math.floor((t - dt) * 2.5)) hitBox(x - 1.8, x + 1.8, gy - 0.3, gy + 1.4, 8, { ...free, kind: 'special', burn: 2, color: COL.magma, hitstop: 0 }); return t < 4; }); }
  around(e, 2.8, (o) => { o.vulnerable = Math.max(o.vulnerable, 3); });
}
function firestorm(e) {
  e.burn = 0; announce('FIRESTORM', e, COL.firestorm);
  const gy = groundAt(e.x); ring(e.x, gy + 0.05, 0.5, COL.firestorm, { r0: 0.4, r1: 4, dur: 0.6, flat: true });
  for (let i = 0; i < 40; i++) glow.emit(e.x + (Math.random() - 0.5) * 2, gy + Math.random() * 0.5, 0.2, (Math.random() - 0.5) * 2, 6 + Math.random() * 9, 0, rgb(Math.random() < 0.5 ? 0xff6a2b : 0xffc233, 2), 0.5, 0.05, 0.6 + Math.random() * 0.4, -3, 0.5, 0);
  if (PM.mergeFirestorm) around(e, 6, (o) => { if (!o.boss) o.vx += Math.sign(e.x - o.x) * 13; });
  explode(e.x, e.y + 0.8, 3.2 * KR, 30 * KD, { ...free, color: COL.firestorm, burn: 3, kx: 2, ky: 4, shake: 0.4 });
  around(e, 3.4, (o) => { launchEnemy(o, 11, Math.sign(o.x - e.x) || 1); });
}
function mud(e) {
  e.chill = 0; e.stun = 0; announce('MUD', e, COL.mud);
  const gy = groundAt(e.x); decal('puddle', e.x, gy, 4, 6, COL.mud); ring(e.x, gy + 0.05, 0.5, COL.mud, { r0: 0.3, r1: 3.6, dur: 0.5, flat: true }); cubes(e.x, gy + 0.3, COL.mud, 10, 5, 0.25, false, 1);
  around(e, 3.6, (o) => { o.mire = 4.5; o.poise = Math.max(0, o.poise - 25); });
  if (PM.mergeMud) { const x = e.x; let t = 0; addFx((dt) => { t += dt; if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) for (const o of G.enemies) if (!o.dead && o.mire > 0 && Math.abs(o.x - x) < 5) hitEnemy(o, 3, { ...free, kind: 'special', color: COL.mud, hitstop: 0 }); return t < 4.5; }); }
}
function sandstorm(e) {
  e.stun = 0; announce('SANDSTORM', e, COL.sand);
  ring(e.x, e.y + e.h * 0.5, 0.5, COL.sand, { r0: 4.5, r1: 0.4, dur: 0.5 }); puff(e.x, e.y + 0.5, 14, COL.sand, 1.8, 1.2, 4);
  const pulse = () => around(e, 5, (o) => { if (!o.boss) { o.vx += Math.sign(e.x - o.x) * 11; } o.stun = Math.max(o.stun, 1.3); hitEnemy(o, 14 * KD, { ...free, kind: 'special', color: COL.sand, poise: 25 }); });
  pulse(); if (PM.mergeSand) { later(0.4, pulse); later(0.8, pulse); }
}

// returns true when a reaction fired
export function react(e, p, o) {
  if (o.noReact || e.dead) return false;
  if ((e.reactCd || 0) > G.time) return false;
  const els = [G.element]; if (o.kind === 'main' && p.mods.resKey) els.push(p.mods.resKey);
  const hot = e.burn > 0, cold = e.chill > 0, froz = e.frozen > 0, stunned = e.stun > 0, air = e.air && !e.onGround;
  let fn = null;
  for (const el of els) {
    if (el === 'fire') fn = froz ? thermalShock : cold ? steam : stunned ? magma : air ? firestorm : null;
    else if (el === 'water') fn = hot ? steam : stunned ? mud : null;
    else if (el === 'earth') fn = cold ? mud : hot ? magma : air ? sandstorm : null;
    else if (el === 'air') fn = stunned ? sandstorm : hot ? firestorm : null;
    if (fn) break;
  }
  if (!fn) return false;
  e.reactCd = G.time + 0.9;
  PM = p.mods; KD = PM.reactBoost ? 1.6 : 1; KR = PM.reactBoost ? 1.3 : 1;
  fn(e);
  KD = 1; KR = 1; PM = null;
  return true;
}
