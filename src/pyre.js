// PYRE: the Fire hero's kit (docs/V2_SLASHER.md section 16).
// Two stances: on foot (deck on his back, snappy street martial arts) and Skate Mode (deck under his feet, +35% top speed,
// carving momentum, power slide, ollie). Passive Heat gauge -> BLAZE. Street Rhythm combo (capoeira sweep, flame elbow,
// 360 spin kick, Deck Slam), Kickflip Uppercut, Meia-Lua aerials, Board Stomp, Kick-Turn parry, Ignite Grind (locks onto rails),
// the Volcanic Spit-Trick and four skate emotes. player.js / hero.js only call in here for the Fire hero.
import * as THREE from 'three';
import { G } from './state.js';
import { glow, sparks, puff, rgb, ring, slash, flashLight, floatText, shake, punchFov, screenFlash, addFx, decal, shockwave, SPRITE } from './engine.js';
import { groundAt, railsHere } from './world.js';
import { sfx } from './audio.js';
import { ELEMENTS, melee, groundWave, launcherStrike, airStrike, slamImpact } from './elements.js';
import { hitBox, hitEnemy, explode, later, enemyBox } from './combat.js';
import { on } from './events.js';
import * as In from './input.js';
import { S } from './settings.js';
import { clamp, rand, sign, damp } from './util.js';

export const HEAT = { skate: 14, hit: 5, parry: 20, decay: 10, blaze: 6 };
export const STANCE_CD = 0.12;
const FIRE = 0xff6a2b, GOLD = 0xffd23a;
const fireC = () => rgb(Math.random() < 0.5 ? FIRE : GOLD, 1.9);
export const isPyre = (p) => p && p.key === 'fire';

// ----------------------------------------------------------------- comic impact stickers (CRUNCH! PARRY! BURN! BLAZE!)
let stickers = [];
export function sticker(x, y, text, color = '#ffd23a') {
  const now = G.time; stickers = stickers.filter((t) => now - t < 0.8);
  if (stickers.length >= 3) return;           // never more than three on screen
  stickers.push(now);
  floatText(x, y, text, { cls: S.flashes ? 'sticker' : 'parry', color, size: 30, dur: 0.8, vy: 1.6 });
}

// ----------------------------------------------------------------- small helpers
function zone(dur, tick, onTick, onFrame) {
  let t = 0, k = 0;
  addFx((dt) => { t += dt; k += dt; onFrame?.(t); if (k >= tick) { k -= tick; onTick(t); } return t < dur; });
}
export function skid(p, len = 1.8) {
  const gy = p.onGround ? p.y : groundAt(p.x); if (gy < -20) return;
  decal('scorch', p.x - p.facing * 0.5, gy, len, 4, FIRE);
  for (let i = 0; i < 8; i++) glow.emit(p.x - p.facing * rand(0, 1.2), gy + 0.1, rand(-0.3, 0.3), -p.facing * rand(1, 4), rand(1, 4), 0, fireC(), rand(0.3, 0.6), 0, 0.5, -2, 1);
}
function footFlames(p, n = 6) { // flaming shoe trails during kicks
  const f = p.hero?.bones?.foot_r || p.hero?.bones?.foot_l; if (!f) return;
  const v = f.getWorldPosition(_fp);
  for (let i = 0; i < n; i++) glow.emit(v.x + rand(-0.15, 0.15), v.y + rand(-0.15, 0.15), v.z, rand(-1, 1), rand(0.5, 2), 0, fireC(), rand(0.3, 0.55), 0, 0.35, -1, 1);
}
const _fp = new THREE.Vector3();

// ----------------------------------------------------------------- stance
export function toggleStance(p, on = !p.skate) {
  if (on === p.skate || p.stanceCd > 0 || p.stun > 0 || p.dead || p.cheering) return false;
  if (p.state !== 'free' && p.state !== 'dash' && p.state !== 'emote') return false;
  if (p.state === 'emote') endEmote(p);
  p.skate = on; p.stanceCd = STANCE_CD; p.dropT = 0.3;
  if (on) { // board drop: he unslings the deck and hops onto it in motion
    sfx.land(0.45); puff(p.x, p.y + 0.1, 6, 0x8b949e, 0.8, 0.4, 2);
    ring(p.x, p.y + 0.06, 0.4, FIRE, { r0: 0.2, r1: 1.6, dur: 0.25, flat: true });
    if (p.onGround && p.state === 'free') { p.vy = Math.max(p.vy, 4.5); p.onGround = false; }
    p.vx += p.facing * 2.5;
  } else { sfx.dash(); p.vx *= 0.55; p.squash = 0.2; }
  return true;
}
// movement while riding: faster top speed, gentle acceleration, long coasting and wide carves
export function skateMove(p, ax, dt) {
  const top = 8.2 * p.speedMul() * 1.35, target = ax * top;
  const rev = ax && sign(ax) !== sign(p.vx) && Math.abs(p.vx) > 1;
  if (ax) { const acc = p.onGround ? (rev ? 15 : 24) : 9; p.vx += clamp(target - p.vx, -acc * dt, acc * dt); }
  else p.vx = damp(p.vx, 0, p.onGround ? 1.0 : 0.35, dt);
  if (Math.abs(p.vx) > 0.8) p.facing = sign(p.vx); else if (ax) p.facing = sign(ax);
  if (rev && p.onGround && Math.abs(p.vx) > 4) { // carving hard: sparks off the wheels, skid marks
    p.carveT = (p.carveT || 0) - dt;
    if (Math.random() < 0.6) sparks(p.x, p.y + 0.1, GOLD, 2, 4, 0.12, 0.25, -sign(p.vx));
    if (p.carveT <= 0) { p.carveT = 0.12; decal('scorch', p.x, p.y, 1.2, 2.5, 0x444444); }
  }
}
// Down + Dash while riding: a burning sideways power slide (light fire damage behind him), cancel into a slide kick
export function powerSlide(p) {
  const hit = new Set(), sp = Math.max(Math.abs(p.vx), 13), dir = p.facing;
  p.cd.dash = 0.55; p.cdMax.dash = 0.55; sfx.dash(); punchFov(1.5);
  let mark = 0;
  p.startDash({ slide: true, dir, speed: sp, decel: sp * 1.6, dur: 0.5, inv: 0.12, tint: FIRE,
    tick(pl, dt) {
      mark -= dt; if (mark <= 0) { mark = 0.07; decal('scorch', pl.x, pl.y, 1.4, 4, pl.blaze > 0 ? FIRE : 0x553322); }
      for (let i = 0; i < 3; i++) glow.emit(pl.x - dir * rand(0, 0.8), pl.y + rand(0.05, 0.5), rand(-0.3, 0.3), -dir * rand(2, 6), rand(1, 4), 0, fireC(), rand(0.3, 0.5), 0, 0.4, -2, 1);
      const x0 = Math.min(pl.x, pl.x - dir * 2.4), x1 = Math.max(pl.x, pl.x - dir * 2.4) + 0.6 * (dir < 0 ? 1 : 0);
      for (const e of G.enemies) if (!e.dead && e.spawnT <= 0 && !hit.has(e)) { const b = enemyBox(e); if (b.x0 < x1 && b.x1 > x0 - 0.6 && b.y0 < pl.y + 1.4 && b.y1 > pl.y - 0.2) { hit.add(e); hitEnemy(e, 7, { kind: 'special', dir: -dir, burn: 2, burnDps: 7, kx: 3, ky: 2, color: FIRE, quiet: true }); } }
    } });
}

// ----------------------------------------------------------------- Heat / BLAZE
export function heatTick(p, dt) {
  if (p.blaze > 0) {
    p.blaze -= dt; p.heat = Math.max(0, (p.blaze / HEAT.blaze) * 100);
    if (Math.random() < 0.7) glow.emit(p.x + rand(-0.5, 0.5), p.y + rand(0.05, 0.3), rand(-0.2, 0.2), -p.facing * rand(0.5, 2), rand(2, 5), 0, fireC(), rand(0.3, 0.5), 0, 0.45, -2, 1);
    // skating while blazing leaves burning wheel marks that cook whatever follows
    if (p.skate && p.onGround && Math.abs(p.vx) > 5) {
      p.trailT = (p.trailT || 0) - dt;
      if (p.trailT <= 0) {
        p.trailT = 0.16; const x = p.x - p.facing * 0.4, y = p.y;
        decal('scorch', x, y, 1.5, 3, FIRE);
        zone(1.6, 0.4, () => hitBox(x - 0.7, x + 0.7, y - 0.3, y + 1.3, 4, { kind: 'special', burn: 1.5, burnDps: 6, kx: 0, noCombo: true, quiet: true, hitstop: 0, shake: 0, noStyle: true, color: FIRE, poise: 1 }));
      }
    }
    if (p.blaze <= 0) { p.blaze = 0; p.heat = 0; }
    return;
  }
  const moving = (p.skate && Math.abs(p.vx) > 5 && (p.onGround || p.grind)) || (p.dash && p.dash.grind);
  const idle = Math.abs(p.vx) < 0.6 && p.state === 'free' && p.onGround;
  if (moving) p.heat += HEAT.skate * dt; else if (idle) p.heat -= HEAT.decay * dt;
  p.heat = clamp(p.heat, 0, 100);
  if (p.heat >= 100) startBlaze(p);
}
export function addHeat(p, n) { if (p.blaze > 0) return; p.heat = Math.min(100, p.heat + n); if (p.heat >= 100) startBlaze(p); }
function startBlaze(p) {
  p.blaze = HEAT.blaze; p.heat = 100;
  sticker(p.x, p.y + 3.6, 'BLAZE!', '#ffd23a'); sfx.cast('fire'); screenFlash(FIRE, 0.22); punchFov(2);
  ring(p.x, p.y + 0.1, 0.5, FIRE, { r0: 0.3, r1: 4.5, dur: 0.5, flat: true }); flashLight(p.x, p.y + 1, 2, FIRE, 70, 0.5);
}
// BLAZE: light hits splash burning damage onto neighbours and set the target alight
function blazeSplash(e, d) {
  ring(e.x, e.y + e.h * 0.4, 0.5, FIRE, { r0: 0.3, r1: 2.2, dur: 0.25 });
  for (const o2 of G.enemies) if (o2 !== e && !o2.dead && o2.spawnT <= 0 && Math.hypot(o2.x - e.x, o2.y - e.y) < 2.3) hitEnemy(o2, Math.round(d * 0.45), { splash: true, kind: 'special', burn: 2.5, burnDps: 8, quiet: true, noReact: true, noStyle: true, noCombo: true, hitstop: 0, shake: 0, color: FIRE });
  e.burn = Math.max(e.burn, 2.5); e.burnDps = Math.max(e.burnDps || 0, 9);
}
on('hit', ({ e, d, o }) => {
  const p = G.player; if (!isPyre(p) || o.splash || o.echo) return;
  if (o.kind === 'main') { addHeat(p, HEAT.hit); if (p.blaze > 0 && !o.finisher) blazeSplash(e, d); }
});

// ----------------------------------------------------------------- the combat kit
// Every hit carries its own `pose` (read by hero.js) and `deck` placement; strike(p) runs at contact.
function sweep(p) { // Capoeira low sweep (rasteira)
  const f = p.facing;
  slash(p.x + f * 1.1, p.y + 0.35, f, FIRE, { radius: 2.2, angle: 2.0, rot: -1.3, flip: 1, dur: 0.22, sweep: 1.6 });
  sfx.swing('fire', 0); footFlames(p, 8);
  for (let i = 0; i < 8; i++) glow.emit(p.x + f * rand(0.3, 2), p.y + 0.15, rand(-0.3, 0.3), f * rand(2, 6), rand(0, 2), 0, fireC(), rand(0.25, 0.45), 0, 0.4, -1, 1);
  melee(p, { range: 2.6, h: 1.1, y0: -0.2, dmg: 10, kx: 2, ky: 5, color: FIRE });
}
function elbow(p) { // flame-infused elbow strike
  const f = p.facing, cx = p.x + f * 1.0, cy = p.y + 1.3;
  slash(cx, cy, f, GOLD, { radius: 1.8, angle: 1.8, rot: 0.3, flip: -1, dur: 0.18, sweep: 1.2 });
  sfx.swing('fire', 1); sparks(cx + f * 0.6, cy, GOLD, 10, 8, 0.2, 0.4, f); flashLight(cx, cy, 2, FIRE, 40, 0.2);
  melee(p, { range: 2.1, h: 1.9, y0: 0.3, dmg: 11, kx: 6, ky: 0, color: FIRE });
}
function spinKick(p) { // 360 spin kick
  const f = p.facing, cy = p.y + 1.4;
  slash(p.x + f * 1.2, cy, f, FIRE, { radius: 2.8, angle: 3.2, rot: 0.1, flip: 1, dur: 0.24, sweep: 2.4 });
  sfx.swing('fire', 2); footFlames(p, 12); punchFov(1);
  melee(p, { range: 2.9, h: 2.2, y0: 0, back: 1.0, dmg: 15, kx: 9, ky: 4, color: FIRE, big: true, burn: 2, burnDps: 7 });
}
function deckSlam(p) { // Heavy finisher: 360 baseball-bat sweep with the board
  const f = p.facing, cx = p.x + f * 1.4, cy = p.y + 1.2;
  slash(cx, cy, f, GOLD, { radius: 3.5, angle: 3.6, rot: -0.2, flip: 1, dur: 0.3, sweep: 2.8 });
  slash(cx, cy, f, FIRE, { radius: 2.8, angle: 3.2, rot: -0.1, flip: 1, dur: 0.28, sweep: 2.6 });
  sfx.swing('fire', 2, 'slam'); shake(0.3); punchFov(2.5);
  for (let i = 0; i < 26; i++) { const a = rand(-1.6, 1.6); glow.emit(cx + Math.cos(a) * 2.6 * f, cy + Math.sin(a) * 1.8, 0.2, f * rand(2, 7), rand(-1, 4), 0, fireC(), rand(0.3, 0.6), 0, 0.5, -1, 1); }
  const hits = melee(p, { range: 3.6, h: 2.6, y0: -0.2, back: 1.4, dmg: 24, kx: 13, ky: 6, color: FIRE, big: true, finisher: true, burn: 3, burnDps: 9 });
  if (hits.length) sticker(p.x + f * 2.2, p.y + 2.8, 'CRUNCH!', '#ff8a2a');
}
function kickflipUpper(p) { // launcher: the board flips up off his foot and uppercuts the enemy
  launcherStrike(p); footFlames(p, 14);
  const x = p.x + p.facing * 1.2;
  for (let i = 0; i < 12; i++) glow.emit(x + rand(-0.3, 0.3), p.y + rand(0.2, 2.5), rand(-0.3, 0.3), rand(-1, 1), rand(6, 12), 0, fireC(), rand(0.3, 0.6), 0, 0.4, -2, 1);
}
function meiaLua(p, i) { airStrike(p, i); footFlames(p, i === 2 ? 14 : 8); }
function boardStomp(p) { // rides the deck straight into the floor
  slamImpact(p);
  const gy = groundAt(p.x);
  ring(p.x, gy + 0.08, 0.5, GOLD, { r0: 0.4, r1: 5, dur: 0.4, flat: true }); shockwave(p.x, gy + 0.4, 0.05, 0.5, 0.5);
  decal('scorch', p.x, gy, 3.6, 7, FIRE); skid(p, 2.6);
}
function slideKick(p) { // cancel out of the power slide
  const f = p.facing;
  slash(p.x + f * 1.3, p.y + 0.5, f, GOLD, { radius: 2.4, angle: 2.2, rot: -0.9, dur: 0.2, sweep: 1.6 });
  sfx.swing('fire', 2); footFlames(p, 10);
  melee(p, { range: 2.8, h: 1.6, y0: -0.2, dmg: 14, kx: 6, ky: 9, color: FIRE, big: true, burn: 2, burnDps: 7 });
}
export const KIT = {
  hits: [
    { name: 'Capoeira Sweep', clip: 'Punch_Jab', dur: 0.34, hitAt: 0.1, cancelAt: 0.22, lunge: 3, pose: 'sweep', strike: sweep },
    { name: 'Flame Elbow', clip: 'Punch_Cross', dur: 0.3, hitAt: 0.07, cancelAt: 0.2, lunge: 5, pose: 'elbow', strike: elbow },
    { name: '360 Spin Kick', clip: 'Sword_Attack', dur: 0.42, hitAt: 0.15, cancelAt: 0.32, lunge: 6, pose: 'spinKick', strike: spinKick },
    { name: 'Deck Slam', clip: 'Sword_Attack', dur: 0.6, hitAt: 0.22, cancelAt: 0.44, lunge: 7, pose: 'deckSlam', deck: 'hand', strike: deckSlam },
  ],
  launcher: { clip: 'Punch_Cross', dur: 0.46, hitAt: 0.11, cancelAt: 0.28, lunge: 1, pose: 'kickflip', deck: 'feet', strike: kickflipUpper },
  air: [
    { clip: 'Punch_Jab', dur: 0.32, hitAt: 0.08, cancelAt: 0.2, lunge: 2.5, pose: 'meia' },
    { clip: 'Punch_Cross', dur: 0.32, hitAt: 0.08, cancelAt: 0.2, lunge: 2.5, pose: 'meia' },
    { clip: 'Sword_Attack', dur: 0.46, hitAt: 0.15, cancelAt: 0.34, lunge: 1, pose: 'meia' },
  ],
  slam: { clip: 'Jump_Loop', windup: 0.1, dur: 0.5, pose: 'stomp', deck: 'feet', strike: boardStomp },
  slideKick: { clip: 'Punch_Cross', dur: 0.4, hitAt: 0.06, cancelAt: 0.28, lunge: 4, pose: 'slideKick', deck: 'feet', strike: slideKick },
};

// ----------------------------------------------------------------- Kick-Turn parry
export function kickTurn(p) {
  p.kickT = 0.42; addHeat(p, HEAT.parry); skid(p, 2.8); screenFlash(0xffffff, 0.3);
  for (const d of [-1, 1]) groundWave(p.x, d, { len: 7, speed: 17, dmg: 20, color: FIRE, kx: 6, ky: 4, hitOpts: { burn: 2.5, burnDps: 8 } });
  ring(p.x, p.y + 1, 0.6, FIRE, { r0: 0.4, r1: 6, dur: 0.5 }); ring(p.x, p.y + 0.08, 0.5, GOLD, { r0: 0.3, r1: 5, dur: 0.45, flat: true });
  for (let i = 0; i < 30; i++) { const a = rand(Math.PI * 2); glow.emit(p.x + Math.cos(a) * 0.8, p.y + 1 + Math.sin(a) * 0.8, 0.3, Math.cos(a) * rand(4, 10), Math.sin(a) * rand(4, 10), 0, rgb(0xffffff, 2.2), rand(0.2, 0.4), 0, 0.3, 0, 0, SPRITE.streak); } // digital spark shower off the trucks
  sticker(p.x, p.y + 4.2, 'PARRY!', '#ffffff');
}

// ----------------------------------------------------------------- Ignite Grind (rails / ground)
export function findRail(p) {
  let best = null, bd = 99;
  for (const r of railsHere()) {
    if (p.x < r.x0 - 1.6 || p.x > r.x1 + 1.6) continue;
    const dy = r.y - p.y; if (dy < -0.8 || dy > 3.2) continue;
    if ((p.facing > 0 && p.x > r.x1 - 0.8) || (p.facing < 0 && p.x < r.x0 + 0.8)) continue; // no room left to grind that way
    const d = Math.abs(dy) + Math.max(0, r.x0 - p.x, p.x - r.x1); if (d < bd) { bd = d; best = r; }
  }
  return best;
}
export function igniteGrind(p) {
  const rail = findRail(p), wings = p.mods.phoenixWings, hit = new Set();
  sfx.cast('fire'); sfx.dash(); punchFov(4); screenFlash(FIRE, 0.18);
  const burnHit = (pl) => { const b = { x0: pl.x - 0.9, x1: pl.x + 0.9, y0: pl.y - 0.4, y1: pl.y + 2 };
    for (const e of G.enemies) if (!e.dead && e.spawnT <= 0 && !hit.has(e)) { const eb = enemyBox(e); if (eb.x0 < b.x1 && eb.x1 > b.x0 && eb.y0 < b.y1 && eb.y1 > b.y0) { hit.add(e); hitEnemy(e, 30, { kind: 'special', dir: pl.facing, kx: 9, ky: 6, burn: 3, burnDps: 10, big: true, color: FIRE });
      if (pl.mods.cadence) { pl.cd.ranged = 0; pl.energy = Math.min(pl.energyMax, pl.energy + 15); floatText(pl.x, pl.y + 3, 'CADENCE', { color: '#ffc233', size: 14, dur: 0.6 }); } } } };
  const trail = (pl, y) => { decal('scorch', pl.x, y, 1.6, wings ? 7 : 5, FIRE); for (let i = 0; i < 5; i++) glow.emit(pl.x + rand(-0.3, 0.3), y + rand(0.05, 0.4), rand(-0.3, 0.3), -pl.facing * rand(2, 7), rand(0, 3), 0, fireC(), rand(0.4, 0.8), 0, 0.5, -2, 1); };
  let mark = 0;
  if (rail) { // lock onto the rail and grind its top edge until it ends or the button is released, then backflip off
    const dir = p.facing, x0 = p.x, y = rail.y;
    p.y = y; p.x = clamp(p.x, rail.x0 + 0.2, rail.x1 - 0.2); p.grind = rail;
    sparks(p.x, y, 0xffffff, 18, 9, 0.2, 0.4); ring(p.x, y + 0.05, 0.4, GOLD, { r0: 0.2, r1: 1.8, dur: 0.25, flat: true }); sticker(p.x, y + 3, 'GRIND!', '#ffd23a');
    p.startDash({ grind: true, dir, speed: wings ? 19 : 16, dur: 3, inv: 0.35, vy0: 0, tint: FIRE,
      tick(pl, dt) {
        pl.y = y; pl.dashInv = Math.max(pl.dashInv, 0.1); burnHit(pl);
        mark -= dt; if (mark <= 0) { mark = 0.06; trail(pl, y); }
        if (Math.random() < 0.8) sparks(pl.x, y, 0xffffff, 1, 5, 0.1, 0.2, -dir);
        const off = dir > 0 ? pl.x >= rail.x1 - 0.1 : pl.x <= rail.x0 + 0.1, rel = pl.dash.t > 0.25 && !In.down('s1');
        if (off || rel) pl.dash.t = pl.dash.dur;
      },
      end(pl) {
        pl.grind = null; pl.vy = 13; pl.vx = dir * 6; pl.onGround = false; pl.flipT = 0.55; // explosive backflip dismount
        explode(pl.x, y + 0.6, 2.6, 16, { color: GOLD, burn: 2 }); sfx.jump();
        const lo = Math.min(x0, pl.x), hi = Math.max(x0, pl.x);
        zone(wings ? 3.5 : 2.2, 0.25, () => hitBox(lo, hi, y - 0.6, y + 1.8, 7, { kind: 'special', burn: 2, burnDps: 8, kx: 0, noCombo: true, quiet: true, hitstop: 0, shake: 0, color: FIRE, poise: 1 }),
          () => { const gx = lo + Math.random() * (hi - lo); glow.emit(gx, y + 0.1, rand(-0.3, 0.3), 0, rand(1, 3), 0, rgb(FIRE, 1.8), 0.6, 0, 0.6, -2); });
      } });
    return;
  }
  // ground grind: a blazing dash on the board, longer and faster from Skate Mode
  const dist = (wings ? 10 : 7.5) * (p.skate ? 1.35 : 1), dur = p.skate ? 0.3 : 0.26, x0 = p.x;
  p.startDash({ grind: true, dir: p.facing, speed: dist / dur, dur, inv: 0.34, vy0: 0, tint: FIRE,
    tick(pl, dt) { burnHit(pl); mark -= dt; if (mark <= 0) { mark = 0.05; trail(pl, pl.y); } },
    end(pl) {
      explode(pl.x, pl.y + 0.8, 2.6, 14, { color: GOLD, burn: 2 });
      if (!pl.skate) { pl.vy = 11; pl.onGround = false; pl.flipT = 0.5; } // off the board with a backflip, deck back on the spine
      const lo = Math.min(x0, pl.x), hi = Math.max(x0, pl.x), y = pl.y;
      zone(wings ? 3.5 : 2, 0.25, () => hitBox(lo, hi, y - 0.5, y + 1.8, 7, { kind: 'special', burn: 2, burnDps: 8, kx: 0, noCombo: true, quiet: true, hitstop: 0, shake: 0, color: FIRE, poise: 1 }),
        () => { const gx = lo + Math.random() * (hi - lo); glow.emit(gx, groundAt(gx) + 0.1, rand(-0.3, 0.3), 0, rand(1, 3), 0, rgb(FIRE, 1.8), 0.6, 0, 0.6, -2); });
    } });
}

// ----------------------------------------------------------------- Volcanic Spit-Trick
let meteorsCast = null;
export function spitTrick(p, a, mouse) {
  const cx = clamp(mouse ? mouse.wx : p.x + p.facing * 6, 2, 264), gy = groundAt(cx), meteors = p.blaze > 0 || p.mods.armageddon || p.mods.solarFlare;
  sfx.cast('fire'); screenFlash(FIRE, 0.2); shake(0.25); punchFov(3);
  p.vy = p.skate ? 13 : 11; p.onGround = false; p.flipT = 0.7; p.handstand = 0.7; // the handstand flip around his board
  later(0.26, () => {
    let t = 0; addFx((dt) => { t += dt; for (let i = 0; i < 6; i++) { const u = Math.random(); glow.emit(p.x + (cx - p.x) * u + rand(-0.4, 0.4), p.y + 1.8 + (gy + 0.3 - p.y - 1.8) * u + rand(-0.3, 0.3), 0.3, rand(-2, 2), rand(-2, 1), 0, fireC(), rand(0.4, 0.8), 0.1, 0.45, 0, 0.5); } return t < 0.35; });
    later(0.3, () => {
      sfx.explosion(1.6); shake(0.5); punchFov(4); screenFlash(GOLD, 0.25);
      decal('scorch', cx, gy, 10, 8, FIRE); decal('crack', cx, gy, 6, 8, GOLD);   // the burning graffiti stamp
      ring(cx, gy + 0.06, 0.5, GOLD, { r0: 0.5, r1: 9, dur: 0.6, flat: true }); ring(cx, gy + 0.06, 0.5, 0xff2e93, { r0: 0.3, r1: 6, dur: 0.5, flat: true });
      sticker(cx, gy + 3.2, 'BURN!', '#ff8a2a');
      zone(6, 0.3, () => hitBox(cx - 4.6, cx + 4.6, gy - 0.5, gy + 2.6, 9, { kind: 'special', burn: 2.5, burnDps: 9, kx: 0, noCombo: true, quiet: true, hitstop: 0, shake: 0, color: FIRE, poise: 1 }),
        () => { for (let i = 0; i < 4; i++) { const x = cx + rand(-4.5, 4.5); glow.emit(x, groundAt(x) + 0.1, rand(-0.3, 0.3), 0, rand(2, 6), 0, fireC(), rand(0.5, 0.9), 0, 0.6, -2); } });
      if (meteors) later(0.25, () => meteorsCast(p, a, { wx: cx }));   // BLAZE (or Meteor Mastery): meteor rain on the stamp
      else for (let i = 0; i < 4; i++) later(0.14 * i, () => explode(cx + (i - 1.5) * 2.3, gy + 0.6, 2.2, 22, { color: FIRE, burn: 3, kx: 6, ky: 8, shake: 0.3, hitstop: 0.03 }));
    });
  });
}

// ----------------------------------------------------------------- emotes
export const EMOTES = [
  { name: 'Kickflip Catch', dur: 2.1 },
  { name: 'Heel-Grind Flame Check', dur: 2.6 },
  { name: 'Board Plant', dur: 3.2 },
  { name: 'Backflip Flex', dur: 1.3 },
];
export function startEmote(p, n) {
  if (p.state !== 'free' || !p.onGround || p.stun > 0 || p.guarding || p.dead || p.cheering) return false;
  if (p.skate) toggleStance(p, false), p.stanceCd = 0;
  p.state = 'emote'; p.emote = { n, t: 0, dur: EMOTES[n].dur }; p.vx = 0; p.idleT = 0;
  if (n === 3) { p.vy = 12.5; p.onGround = false; p.flipT = 0.75; sfx.jump(); }
  return true;
}
export function endEmote(p) { if (p.state === 'emote') p.state = 'free'; p.emote = null; }
export function emoteTick(p, dt, anyInput) {
  const e = p.emote; if (!e) return;
  e.t += dt;
  if (anyInput && e.t > 0.15) { endEmote(p); return; }
  const k = e.t / e.dur;
  if (e.n === 0 && e.t > 0.2 && e.t < 0.75 && Math.random() < 0.5) sparks(p.x + p.facing * 0.4, p.y + 0.6 + (e.t - 0.2) * 3, GOLD, 1, 4, 0.1, 0.2);
  if (e.n === 1) { // sparks off the tail, then a fingertip flame touches up the mohawk
    if (e.t < 0.9 && Math.random() < 0.8) sparks(p.x - p.facing * 0.5, p.y + 0.05, 0xffffff, 2, 6, 0.1, 0.25, -p.facing);
    if (e.t > 0.9) { const h = p.hero?.bones?.hand_r; if (h) { const v = h.getWorldPosition(_fp); glow.emit(v.x, v.y + 0.1, v.z, 0, rand(0.5, 1.5), 0, fireC(), rand(0.12, 0.2), 0, 0.3, -1); } }
  }
  if (e.n === 2 && Math.random() < 0.25) glow.emit(p.x + rand(-0.2, 0.2), p.y + 2.3, rand(-0.2, 0.2), rand(-0.3, 0.3), rand(0.4, 1.0), 0, fireC(), rand(0.08, 0.14), 0, 1.6, -0.5); // embers drift off the helmet
  if (k >= 1) endEmote(p);
}

// ----------------------------------------------------------------- per-frame (called from Player.update, real + game time)
export function pyreInput(p, rdt) {
  if (In.hitNow('stance')) toggleStance(p);
  // holding Dash also drops the board (after the dash itself fires)
  if (!p.skate && In.down('dash')) { p.dashHold = (p.dashHold || 0) + rdt; if (p.dashHold > 0.32) { toggleStance(p, true); p.dashHold = -99; } } else if (!In.down('dash')) p.dashHold = 0;
  for (let i = 0; i < 4; i++) if (In.hitNow('emote' + (i + 1))) startEmote(p, i);
  if (In.hitNow('emote')) { p.emoteNext = ((p.emoteNext ?? -1) + 1) % 4; startEmote(p, p.emoteNext); }
}
export function pyreTick(p, dt, ax) {
  p.stanceCd = Math.max(0, p.stanceCd - dt); p.dropT = Math.max(0, (p.dropT || 0) - dt);
  p.kickT = Math.max(0, p.kickT - dt); p.flipT = Math.max(0, (p.flipT || 0) - dt); p.handstand = Math.max(0, (p.handstand || 0) - dt);
  heatTick(p, dt);
  if (p.state === 'emote') emoteTick(p, dt, ax !== 0 || p.buf.main > 0 || p.buf.jump > 0 || p.buf.dash > 0 || p.buf.s1 > 0 || p.buf.s2 > 0 || In.down('guard') || In.down('ranged'));
  // idle flourish: stand still out of combat for a while and he shows off
  const calm = p.state === 'free' && p.onGround && !p.skate && Math.abs(p.vx) < 0.3 && !p.guarding && !G.enemies.some((e) => !e.dead && !e.dummy && Math.abs(e.x - p.x) < 12);
  p.idleT = calm ? (p.idleT || 0) + dt : 0;
  if (p.idleT > 8 && G.mode === 'play') { p.idleT = 0; startEmote(p, Math.random() < 0.5 ? 2 : 1); }
}

// ----------------------------------------------------------------- Fire's element entries become Pyre's kit
const fire = ELEMENTS.fire;
meteorsCast = fire.s2.cast;
fire.main.name = 'Street Rhythm';
fire.main.desc = 'Capoeira sweep, flame elbow, 360 spin kick, then the Deck Slam: a 360 swing with the board. Up + Attack: Kickflip Uppercut. Attack in the air: Meia-Lua kicks. Down + Attack in the air: Board Stomp.';
fire.main.hits = KIT.hits;
fire.main.strike = (p, i) => KIT.hits[i].strike(p);
fire.main.launcher = { ...KIT.launcher };
fire.main.air = { strike: meiaLua, hits: KIT.air };
fire.main.slam = { ...KIT.slam };
fire.guard.name = 'Kick-Turn';
fire.guard.desc = 'Hold to block with the underside of your deck (−55% damage). Perfect timing: a 360 kick-turn, a fire wave both ways, +20 Heat and a board-spin counter.';
const basePerfect = fire.guard.onPerfect;
fire.guard.onPerfect = (p, src) => { basePerfect(p, src); kickTurn(p); };
fire.s1.name = 'Ignite Grind';
fire.s1.desc = 'Drop the board and grind in a blaze: locks onto rails and ledges and grinds along them (hold to keep grinding), otherwise a blazing ground grind. Immune while grinding, burns everything it passes, backflip dismount.';
fire.s1.cast = igniteGrind;
fire.s2.name = 'Volcanic Spit-Trick';
fire.s2.desc = 'Leap into a handstand flip around your deck and spit fire into the floor: a burning graffiti stamp for 6 s. In BLAZE (or with Meteor Mastery) meteors rain onto the stamp.';
fire.s2.cast = spitTrick;
fire.s2.lock = 0.7;
fire.prof.tag = 'Snappy on foot · Skate Mode (C / hold Dash): faster, carves, power slides · Heat builds BLAZE';
