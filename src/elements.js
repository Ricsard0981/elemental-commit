import * as THREE from 'three';
import { G } from './state.js';
import { scene, glow, dust, sparks, puff, cubes, rgb, ring, slash, flashLight, floatText, shake, punchFov, screenFlash, post, addFx, debrisLit, impactFlash, decal, shockwave, SPRITE } from './engine.js';
import { emit } from './events.js';
import { groundAt, ripple, dyn } from './world.js';
import { sfx } from './audio.js';
import { proc, hitBox, hitEnemy, explode, spawnProj, endProj, hitstop, slowmo, later, damagePlayer, enemyBox, imbueBurst, fb } from './combat.js';
import { rand, clamp, easeOut, lerp } from './util.js';

// ================================================================= helpers
const dirOf = (p) => p.facing;
const nearest = (x, y, range = 12, filter) => {
  let best = null, bd = range;
  for (const e of G.enemies) { if (e.dead || e.spawnT > 0 || (filter && !filter(e))) continue; const d = Math.hypot(e.x - x, e.y + e.h / 2 - y); if (d < bd) { bd = d; best = e; } }
  return best;
};
export function melee(p, { range = 2.2, h = 2, y0 = 0, back = 0.3, dmg = 10, ...o }) {
  const x0 = p.facing > 0 ? p.x - back : p.x - range, x1 = p.facing > 0 ? p.x + range : p.x + back;
  return hitBox(x0, x1, p.y + y0, p.y + y0 + h, dmg, { kind: 'main', dir: p.facing, ...o });
}

// A shockwave rolling along the ground. owner 'player' hurts enemies, 'enemy' hurts the player.
export function groundWave(x, dir, { len = 8, speed = 16, dmg = 20, color = 0xb98a4e, owner = 'player', height = 1.3, stun = 0, kx = 8, ky = 6, thick = 1.2, hitOpts = {}, src = null } = {}) {
  const hit = new Set(); let d = 0;
  const c = rgb(color, 1.5);
  addFx((dt) => {
    d += speed * dt; const fx = x + dir * d;
    // visuals: a ridge of dust & debris travelling along the lane
    for (let i = 0; i < 3; i++) {
      const gx = fx + rand(-0.4, 0.4), gy = groundAt(gx);
      if (gy < -20) continue;
      glow.emit(gx, gy + rand(0.1, 0.6), rand(-0.4, 0.4), rand(-1, 1), rand(2, 5), 0, c, 0.35, 0, 0.35, 8);
      if (Math.random() < 0.5) dust.emit(gx, gy + 0.2, rand(-0.6, 0.6), dir * 1.5, rand(1, 3), 0, rgb(0x8b949e, 0.7), 0.6, 1.8, 0.6, -1, 2);
      if (Math.random() < 0.18) debrisLit.emit(gx, gy + 0.3, rand(-0.4, 0.4), rand(-1, 1), rand(4, 8), rand(-2, 2), rand(0.18, 0.4), color, 1.0);
    }
    ripple(fx, 0.6, color, 10, 0.5);
    if (owner === 'player') {
      for (const e of G.enemies) {
        if (e.dead || e.spawnT > 0 || hit.has(e)) continue;
        if (Math.abs(e.x - fx) < thick + e.w / 2 && e.y - groundAt(e.x) < height) {
          hit.add(e); hitEnemy(e, dmg, { dir, kx, ky, stun, color, big: true, poise: dmg * 2, ...hitOpts });
        }
      }
    } else {
      const p = G.player;
      if (!hit.has(p) && Math.abs(p.x - fx) < thick + p.w / 2 && p.y - groundAt(p.x) < height) {
        hit.add(p); damagePlayer(dmg, { x: fx - dir * 0.5, y: p.y, kind: 'wave', enemy: src });
      }
    }
    return d < len;
  });
}

// persistent damaging/healing area
function zone(x, y, { dur = 3, tick = 0.3, r = 3, onTick, onFrame }) {
  let t = 0, tk = 0;
  addFx((dt) => {
    t += dt; tk += dt; onFrame?.(t, dt);
    if (tk >= tick) { tk -= tick; onTick?.(t); }
    return t < dur;
  });
}
function bolt(x0, y0, x1, y1, color = 0xcfe9ff) {
  const c = rgb(color, 2.4);
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const t = i / n; const jx = i === 0 || i === n ? 0 : rand(-0.5, 0.5), jy = i === 0 || i === n ? 0 : rand(-0.5, 0.5);
    glow.emit(lerp(x0, x1, t) + jx, lerp(y0, y1, t) + jy, 0.3, 0, 0, 0, c, 0.5, 0.1, 0.22, 0, 0);
  }
  flashLight(x1, y1, 2, color, 40, 0.18);
  sfx.explosion(0.4);
}

// ================================================================= FIRE
const fire = {
  key: 'fire', name: 'Fire', color: 0xff6a2b, color2: 0xffc233, css: '#ff6a2b', css2: '#ffc233',
  blurb: 'Relentless aggression. Burn everything, then burn it again.',
  stats: [4, 2, 3, 5],
  prof: { atk: 0.82, dmg: 1.0, poise: 1.0, hs: 0.9, move: 1.08, dash: { speed: 27, dur: 0.17, cd: 0.8, inv: 0.26 }, jump: 15.2, jumps: 0, fall: -34, grav: 1.0, tag: 'Fast · medium power · speeds up as your combo grows' },
  main: {
    name: 'Flame Blade', desc: 'Fast 3-hit sword combo. The finisher erupts in a fire burst and ignites enemies.',
    hits: [{ dur: 0.3, hitAt: 0.07, cancelAt: 0.2, lunge: 5 }, { dur: 0.3, hitAt: 0.07, cancelAt: 0.2, lunge: 5 }, { dur: 0.46, hitAt: 0.13, cancelAt: 0.34, lunge: 8 }],
    strike(p, i) {
      const m = p.mods, burn = m.burnMain || i === 2 ? { burn: 3, burnDps: 9 } : {};
      const cx = p.x + p.facing * 1.2, cy = p.y + 1.1;
      slash(cx, cy, p.facing, i === 2 ? 0xffc233 : 0xff6a2b, { radius: i === 2 ? 3 : 2.3, angle: i === 2 ? 3 : 2.3, rot: i === 1 ? 0.5 : -0.5, flip: i === 1 ? -1 : 1, dur: 0.24, sweep: 1.4 });
      sfx.swing('fire', i);
      sparks(cx + p.facing, cy, 0xffc233, 8, 7, 0.22, 0.4, p.facing);
      flashLight(cx, cy, 2, 0xff6a2b, 35, 0.25);
      melee(p, { range: i === 2 ? 3.1 : 2.5, h: 2.2, y0: -0.1, dmg: [11, 11, 18][i], kx: i === 2 ? 11 : 5, ky: i === 2 ? 5 : 0, color: 0xff6a2b, big: i === 2, finisher: i === 2, ...burn });
      if (i === 2) explode(p.x + p.facing * 2.4, p.y + 0.9, 2.3, 8, { color: 0xff6a2b, burn: 2, shake: 0.35 });
      if (i === 2 && m.firePillar) { // Inferno Mastery: a pillar of fire stays in the floor
        const px = p.x + p.facing * 2.6, py = groundAt(px);
        ring(px, py + 0.05, 0.5, 0xffc233, { r0: 0.3, r1: 2, dur: 0.4, flat: true });
        proc('INFERNO', px, py + 4, '#ff9a4d');
        zone(0, 0, { dur: 4, tick: 0.3, onFrame: () => { for (let j = 0; j < 6; j++) glow.emit(px + rand(-0.9, 0.9) - px + px + rand(-0.6, 0.6), py + 0.1, rand(-0.3, 0.3), 0, rand(4, 8), 0, rgb(Math.random() < 0.5 ? 0xff6a2b : 0xffc233, 1.8), rand(0.5, 0.9), 0, 0.6, -2); },
          onTick: () => hitBox(px - 1.8, px + 1.8, py - 0.3, py + 5.5, 9, { kind: 'special', burn: 2, burnDps: 9, kx: 0, noCombo: true, quiet: true, hitstop: 0, shake: 0, color: 0xff6a2b, poise: 1 }) });
      }
    },
  },
  ranged: {
    name: 'Fireball', desc: 'Hurl an exploding fireball toward your cursor. Ignites on impact.', cost: 12, cd: 0.42, lock: 0.2,
    cast(p, a) {
      const m = p.mods, shots = m.twinFire ? [-0.1, 0.1] : [0], dmgMul = m.twinFire ? 0.7 : 1;
      sfx.shoot('fire');
      for (const off of shots) {
        const ang = Math.atan2(a.y, a.x) + off;
        spawnProj({ x: p.x + a.x * 0.8, y: p.y + 1.2 + a.y * 0.6, vx: Math.cos(ang) * 21, vy: Math.sin(ang) * 21, r: 0.42, color: 0xff7a30, trailC: 0xffa040, life: 1.4, trailDust: 0x333333,
          onHit: () => {}, onEnd: (pr) => explode(pr.x, pr.y, 2.3, 17 * dmgMul, { color: 0xff6a2b, burn: 2.5, burnDps: 8 }) });
      }
      flashLight(p.x + a.x, p.y + 1.2, 1.5, 0xff6a2b, 30, 0.2);
      sparks(p.x + a.x, p.y + 1.2, 0xffc233, 8, 6, 0.2, 0.3);
    },
  },
  guard: {
    name: 'Flame Ward', desc: 'Hold to raise a wall of flame (−55% damage). Time it perfectly to parry: a nova erupts and enemies are staggered.', reduction: 0.55, knockback: 4,
    onPerfect(p) {
      explode(p.x, p.y + 1, 5.2, 40, { color: 0xff6a2b, burn: 3, kx: 13, ky: 6, stun: 0.6, shake: 0.5 });
      if (p.mods.heatHaze) { p.cd.s1 = 0; floatText(p.x, p.y + 3.7, 'DASH READY', { color: '#ffc233', size: 18 }); }
    },
  },
  s1: {
    name: 'Phoenix Dash', desc: 'Blaze through enemies as a phoenix, immune while dashing, leaving a burning trail.', cost: 25, cd: 6, lock: 0.1,
    cdFn: (p) => (p.mods.phoenixWings ? 3.6 : 6),
    cast(p) {
      const wings = p.mods.phoenixWings, dist = wings ? 10 : 7.5, dur = 0.26;
      sfx.cast('fire'); sfx.dash();
      const x0 = p.x, hit = new Set();
      p.startDash({ dir: p.facing, speed: dist / dur, dur, inv: 0.34, vy0: 0, tint: 0xff6a2b,
        tick(pl, dt) {
          const b = { x0: pl.x - 0.9, x1: pl.x + 0.9, y0: pl.y - 0.2, y1: pl.y + 2 };
          for (const e of G.enemies) if (!e.dead && e.spawnT <= 0 && !hit.has(e)) { const eb = enemyBox(e); if (eb.x0 < b.x1 && eb.x1 > b.x0 && eb.y0 < b.y1 && eb.y1 > b.y0) { hit.add(e); hitEnemy(e, 32, { kind: 'special', dir: pl.facing, kx: 9, ky: 6, burn: 3, burnDps: 10, big: true, color: 0xff6a2b });
            if (pl.mods.cadence) { pl.cd.ranged = 0; pl.energy = Math.min(pl.energyMax, pl.energy + 15); floatText(pl.x, pl.y + 3, 'CADENCE', { color: '#ffc233', size: 14, dur: 0.6 }); } } }
          for (let i = 0; i < 6; i++) glow.emit(pl.x + rand(-0.4, 0.4), pl.y + rand(0.2, 1.8), rand(-0.3, 0.3), -pl.facing * rand(2, 8), rand(-1, 3), 0, rgb(Math.random() < 0.5 ? 0xff6a2b : 0xffc233, 1.8), rand(0.5, 1), 0, 0.5, -2, 1);
        },
        end(pl) {
          const x1 = pl.x;
          explode(x1, pl.y + 0.8, 2.6, 14, { color: 0xffc233, burn: 2 });
          const lo = Math.min(x0, x1), hi = Math.max(x0, x1), y = pl.y;
          zone(0, 0, { dur: wings ? 3.5 : 2, tick: 0.25, onFrame: () => { const gx = rand(lo, hi); glow.emit(gx, groundAt(gx) + 0.1, rand(-0.3, 0.3), 0, rand(1, 3), 0, rgb(0xff6a2b, 1.8), 0.6, 0, 0.6, -2); },
            onTick: () => hitBox(lo, hi, y - 0.5, y + 1.8, 7, { kind: 'special', burn: 2, burnDps: 8, kx: 0, noCombo: true, quiet: true, hitstop: 0, shake: 0, color: 0xff6a2b, poise: 1 }) });
        } });
      punchFov(4); screenFlash(0xff6a2b, 0.2);
    },
  },
  s2: {
    name: 'Meteor Storm', desc: 'Call down a barrage of meteors on the area ahead of you (or at your cursor).', cost: 50, cd: 14, lock: 0.55,
    cdFn: () => 14,
    cast(p, a, mouse) {
      const arm = p.mods.armageddon, flare = p.mods.solarFlare, n = flare ? 1 : arm ? 9 : 5, rad = flare ? 7.5 : arm ? 3.4 : 2.7;
      const cx = mouse ? mouse.wx : p.x + p.facing * 7;
      sfx.cast('fire'); screenFlash(0xff6a2b, 0.25); shake(0.25); punchFov(3);
      ring(p.x, p.y + 1, 0.5, 0xff6a2b, { r0: 0.3, r1: 4, dur: 0.5 });
      for (let i = 0; i < n; i++) {
        const tx = flare ? clamp(cx, 2, 264) : clamp(cx + (i - (n - 1) / 2) * (arm ? 1.7 : 2.1) + rand(-0.6, 0.6), 2, 264);
        later(flare ? 0.5 : 0.15 + i * 0.16, () => {
          const gy = groundAt(tx); if (gy < -20) return;
          ring(tx, gy + 0.05, 0.5, 0xffc233, { r0: 0.2, r1: rad, dur: 0.6, flat: true });
          const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a3a).multiplyScalar(2.4), toneMapped: false }));
          let y = gy + 26, x = tx - 7; m.position.set(x, y, 0); scene.add(m);
          sfx.telegraph();
          let t = 0;
          addFx((dt) => {
            t += dt; const k = Math.min(1, t / 0.55);
            x = lerp(tx - 7, tx, k); y = lerp(gy + 26, gy, k * k);
            m.position.set(x, y, 0); m.rotation.x += dt * 8; m.scale.setScalar(flare ? 3.2 : 1 + (arm ? 0.5 : 0));
            for (let j = 0; j < 4; j++) glow.emit(x + rand(-0.4, 0.4), y + rand(-0.4, 0.4), 0, rand(-2, 2) - 4, rand(2, 6), 0, rgb(Math.random() < 0.5 ? 0xff6a2b : 0xffc233, 1.8), rand(0.6, 1.1), 0, 0.5, 0, 1);
            if (k >= 1) { scene.remove(m); m.geometry.dispose();
              explode(tx, gy + 0.6, rad, flare ? 90 : 38, { color: 0xff6a2b, burn: flare ? 5 : 3, burnDps: flare ? 14 : 9, kx: 9, ky: 9, stun: flare ? 1.4 : 0, shake: flare || arm ? 0.7 : 0.5, hitstop: flare ? 0.12 : 0.06 });
              if (flare) { shake(0.8); screenFlash(0xffc233, 0.35); }
              if (arm) punchFov(2);
              return false; }
            return true;
          });
        });
      }
    },
  },
};

// ================================================================= WATER
const water = {
  key: 'water', name: 'Water', color: 0x2ea8ff, color2: 0x9fe8ff, css: '#2ea8ff', css2: '#9fe8ff',
  blurb: 'Flow, control and sustain. Chill enemies, heal through the fight.',
  stats: [3, 5, 4, 3],
  prof: { atk: 0.86, dmg: 1.12, poise: 0.9, hs: 0.95, move: 1.1, dash: { speed: 26, dur: 0.18, cd: 0.65, inv: 0.32 }, jump: 15.2, jumps: 0, fall: -34, grav: 1.0, tag: 'Fast · strong · dash cancels any swing and chills' },
  main: {
    name: 'Tide Whip', desc: 'Wide, sweeping whip combo that chills enemies. The finisher sends a wave rolling forward.',
    hits: [{ dur: 0.34, hitAt: 0.09, cancelAt: 0.22, lunge: 3 }, { dur: 0.34, hitAt: 0.09, cancelAt: 0.22, lunge: 3 }, { dur: 0.5, hitAt: 0.15, cancelAt: 0.36, lunge: 4 }],
    strike(p, i) {
      const cx = p.x + p.facing * 1.6, cy = p.y + 1.1;
      slash(cx, cy, p.facing, i === 2 ? 0x9fe8ff : 0x2ea8ff, { radius: i === 2 ? 3.6 : 3, angle: 2.7, rot: i === 1 ? 0.6 : -0.6, flip: i === 1 ? -1 : 1, dur: 0.3, sweep: 1.8 });
      sfx.swing('water', i);
      for (let k = 0; k < 14; k++) { const a = rand(-1.2, 1.2); glow.emit(cx + Math.cos(a) * 2 * p.facing, cy + Math.sin(a) * 1.5, 0, p.facing * rand(2, 8), rand(-2, 4), 0, rgb(0x9fe8ff, 1.5), rand(0.2, 0.4), 0, 0.5, 14, 1); }
      melee(p, { range: 3.3, h: 2.4, y0: -0.2, dmg: [9, 9, 14][i], kx: 4, ky: 2, color: 0x2ea8ff, chill: 2.2, big: i === 2, finisher: i === 2 });
      if (i === 2) {
        groundWave(p.x + p.facing * 1, p.facing, { len: 7, speed: 15, dmg: 10, color: 0x2ea8ff, kx: 8, ky: 5, hitOpts: { chill: 2.5, kind: 'main' } });
        sfx.wave();
      }
    },
  },
  ranged: {
    name: 'Water Bolt', desc: 'Rapid homing water bolts that chill. Cheap and fast.', cost: 8, cd: 0.26, lock: 0.14,
    cast(p, a) {
      const m = p.mods; sfx.shoot('water');
      const split = (pr) => {
        for (let i = 0; i < 3; i++) { const an = (i - 1) * 0.9 + rand(-0.2, 0.2) + Math.atan2(rand(-1, 1), -Math.sign(pr.vx) * 0.2 + 0.001);
          spawnProj({ x: pr.x, y: pr.y, vx: Math.cos(an) * 14, vy: Math.sin(an) * 14 + 4, r: 0.2, color: 0x9fe8ff, dmg: 5, life: 0.9, homing: { turn: 9, range: 8 }, grav: 4,
            onHit: (q, e) => hitEnemy(e, 6, { kind: 'ranged', chill: 1.5, color: 0x9fe8ff, noCombo: false }) }); }
      };
      spawnProj({ x: p.x + a.x * 0.8, y: p.y + 1.2 + a.y * 0.6, vx: a.x * 22, vy: a.y * 22, r: 0.3, color: 0x4db8ff, trailC: 0x9fe8ff, dmg: 9, life: 1.2, homing: { turn: 5.5, range: 7 },
        onHit: (pr, e) => { hitEnemy(e, 10, { kind: 'ranged', dir: Math.sign(pr.vx), chill: 2.2, color: 0x2ea8ff }); if (m.split) split(pr);
          if (m.riptide && !e.boss && !e.dead) { const dx = p.x - e.x; e.vx = Math.sign(dx) * Math.min(26, Math.abs(dx) * 5 + 8); e.stun = Math.max(e.stun, 0.3); ring(e.x, e.y + e.h * 0.5, 0.4, 0x9fe8ff, { r0: 1.4, r1: 0.2, dur: 0.25 }); } sparks(pr.x, pr.y, 0x9fe8ff, 12, 7); ring(pr.x, pr.y, 0.4, 0x9fe8ff, { r0: 0.1, r1: 1.4, dur: 0.25 }); } });
      sparks(p.x + a.x, p.y + 1.2, 0x9fe8ff, 6, 5, 0.2, 0.3);
    },
  },
  guard: {
    name: 'Bubble Shield', desc: 'Hold to encase yourself in a bubble (−70% damage). A perfect block pops it, healing you and sending out a wave.', reduction: 0.7, knockback: 3, allAround: true,
    onPerfect(p) {
      const heal = p.mods.mirror ? 18 : 8;
      p.hp = Math.min(p.hpMax, p.hp + heal); sfx.heal();
      floatText(p.x, p.y + 3.7, `+${heal} HP`, { color: '#9fe8ff', size: 24 });
      if (p.mods.mirror) p.energy = Math.min(p.energyMax, p.energy + 30);
      explode(p.x, p.y + 1, 5, 24, { color: 0x2ea8ff, kx: 11, ky: 6, stun: 0.3, chill: 3 });
      for (const e of G.enemies) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 5.5) e.chill = Math.max(e.chill, 3);
      if (p.mods.tsunamiHeart) { for (const d of [-1, 1]) groundWave(p.x, d, { len: 10, speed: 17, dmg: 26, color: 0x2ea8ff, hitOpts: { chill: 3 } }); sfx.wave(); }
    },
  },
  s1: {
    name: 'Tidal Wave', desc: 'Summon a huge wave that crashes forward, hurling and chilling everything in its path.', cost: 35, cd: 8, lock: 0.45,
    cdFn: (p) => 8,
    cast(p) {
      const big = p.mods.leviathan, ret = p.mods.waveReturn, dir = p.facing, len = big ? 30 : 18, scl = big ? 2.7 : 1;
      if (big) { screenFlash(0x2ea8ff, 0.3); shake(0.6); }
      sfx.cast('water'); sfx.wave(); shake(0.3); punchFov(3);
      let x = p.x + dir * 1.5, t = 0, d = 0, backwards = false, hit = new Set();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 3.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2ea8ff).multiplyScalar(1.1), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      scene.add(mesh);
      const c1 = rgb(0x9fe8ff, 1.8), c2 = rgb(0x2ea8ff, 1.5);
      addFx((dt) => {
        t += dt; const sp = 17 * (1 + Math.min(1, t) * 0.3), step = sp * dt * (backwards ? -dir : dir);
        x += step; d += sp * dt;
        const gy = groundAt(x), h = (3.4 + Math.sin(t * 9) * 0.4) * scl;
        mesh.position.set(x, Math.max(gy, 0) + h / 2, 0); mesh.scale.set(scl, h, scl);
        for (let i = 0; i < 10; i++) {
          const yy = rand(0, h);
          glow.emit(x + rand(-0.8, 0.8) * scl, Math.max(gy, 0) + yy, rand(-1.5, 1.5), (backwards ? -dir : dir) * rand(2, 6), rand(0, 3) + yy * 0.4, 0, Math.random() < 0.5 ? c1 : c2, rand(0.4, 0.9) * scl, 0, 0.55, 8, 1);
        }
        for (let i = 0; i < 2; i++) dust.emit(x, Math.max(gy, 0) + h * rand(0.6, 1), rand(-1, 1), (backwards ? -dir : dir) * rand(1, 4), rand(1, 3), 0, rgb(0xe8f6ff, 1), 0.6, 1.5, 0.6, 3, 1);
        ripple(x, 0.8, 0x2ea8ff, 12, 0.6);
        shake(0.02);
        if (p.mods.undertow) for (const e of G.enemies) if (!e.dead && e.spawnT <= 0 && !e.boss && Math.abs(e.x - x) < 5 && e.y < Math.max(gy, 0) + h) { e.vx += Math.sign(x - e.x) * 36 * dt; e.chill = Math.max(e.chill, 5); }
        for (const e of G.enemies) {
          if (e.dead || e.spawnT > 0 || hit.has(e)) continue;
          if (Math.abs(e.x - x) < 1.6 * scl && e.y < Math.max(gy, 0) + h) {
            hit.add(e); hitEnemy(e, 32 * (big ? 2.4 : 1), { kind: 'special', dir: backwards ? -dir : dir, kx: p.mods.undertow ? 2 : 14, ky: big ? 15 : 8, chill: p.mods.undertow ? 5 : 3.5, stun: 0.4, big: true, color: 0x2ea8ff, poise: 90 });
            if (big) p.energy = Math.min(p.energyMax, p.energy + 5);
          }
        }
        if (d >= len) {
          if (ret && !backwards) { backwards = true; hit = new Set(); d = 0; sfx.wave(); ring(x, Math.max(gy, 0) + 1, 0.5, 0x9fe8ff, { r0: 0.3, r1: 4, dur: 0.4 }); }
          else { scene.remove(mesh); mesh.geometry.dispose(); return false; }
        }
        return true;
      });
    },
  },
  s2: {
    name: 'Healing Rain', desc: 'Summon a rain cloud that heals you and damages & slows enemies beneath it.', cost: 40, cd: 16, lock: 0.4,
    cdFn: (p) => 16,
    cast(p) {
      const dl = p.mods.deluge, R = dl ? 7.5 : 5.5, dur = dl ? 8 : 5, heal = dl ? 7.5 : 5;
      const cx = p.x; sfx.cast('water'); shake(0.2);
      ring(cx, groundAt(cx) + 0.05, 0.5, 0x2ea8ff, { r0: 0.5, r1: R, dur: 0.6, flat: true });
      ring(cx, p.y + 1, 0.5, 0x9fe8ff, { r0: 0.3, r1: 4, dur: 0.5 });
      let nextRing = 0;
      zone(cx, 0, { dur, tick: 0.5, r: R,
        onFrame: (t, dt) => {
          for (let i = 0; i < 12; i++) { const rx = cx + rand(-R, R); glow.emit(rx, 10 + rand(0, 3), rand(-1.5, 1.5), 0, -22, 0, rgb(Math.random() < 0.3 ? 0xffffff : 0x4db8ff, 1.6), 0.18, 0.1, 0.5, 0, 0); }
          if (t > nextRing) { nextRing = t + 0.18; const rx = cx + rand(-R, R); const gy = groundAt(rx); if (gy > -20) ring(rx, gy + 0.05, rand(-1, 1), 0x9fe8ff, { r0: 0.1, r1: 0.7, dur: 0.35, flat: true, intensity: 1.2 }); }
          if (Math.random() < 0.5) glow.emit(cx + rand(-R, R), groundAt(cx) + 0.1, rand(-1, 1), 0, rand(1, 3), 0, rgb(0x9fe8ff, 1.3), 0.25, 0, 0.5, 2);
        },
        onTick: () => {
          const pl = G.player;
          if (!pl.dead && Math.abs(pl.x - cx) < R) { pl.hp = Math.min(pl.hpMax, pl.hp + heal); pl.energy = Math.min(pl.energyMax, pl.energy + 2.5); floatText(pl.x, pl.y + 2.6, `+${heal}`, { color: '#7ee787', size: 16, dur: 0.6 }); sparks(pl.x, pl.y + 1, 0x7ee787, 3, 3, 0.18, 0.4); }
          for (const e of G.enemies) if (!e.dead && e.spawnT <= 0 && Math.abs(e.x - cx) < R) hitEnemy(e, 7, { kind: 'special', chill: 1.5, kx: 0, quiet: true, hitstop: 0, shake: 0, color: 0x2ea8ff, poise: 3 });
        } });
    },
  },
};

// ================================================================= EARTH
const earth = {
  key: 'earth', name: 'Earth', color: 0xc08a4b, color2: 0x8bd450, css: '#d9a05b', css2: '#8bd450',
  blurb: 'Unmovable and devastating. Break poise, stun, crush.',
  stats: [5, 1, 5, 2],
  prof: { atk: 1.38, dmg: 2.0, poise: 1.8, hs: 1.35, move: 0.86, dash: { speed: 21, dur: 0.15, cd: 1.15, inv: 0.2 }, jump: 14.2, jumps: 0, fall: -38, grav: 1.12, tag: 'Slow · crushing · armoured finisher' },
  main: {
    name: 'Stone Fists', desc: 'Slow, heavy punches with huge stagger. The finisher slams the ground in both directions.',
    hits: [{ dur: 0.42, hitAt: 0.16, cancelAt: 0.3, lunge: 3 }, { dur: 0.42, hitAt: 0.16, cancelAt: 0.3, lunge: 3 }, { dur: 0.7, hitAt: 0.3, cancelAt: 0.5, lunge: 2 }],
    strike(p, i) {
      const cx = p.x + p.facing * 1.4, cy = p.y + 1.0;
      slash(cx, cy, p.facing, 0xe0b070, { radius: 1.8, angle: 1.6, rot: i === 1 ? 0.3 : -0.3, flip: i === 1 ? -1 : 1, dur: 0.2, sweep: 0.8 });
      sfx.swing('earth', i);
      cubes(cx + p.facing * 0.7, cy, 0xc08a4b, 5, 6, 0.22, false, 1);
      const seis = p.mods.seismic;
      melee(p, { range: 2.1, h: 2.2, y0: -0.2, dmg: [14, 14, 26][i], kx: i === 2 ? 12 : 7, ky: i === 2 ? 7 : 1, color: 0xc08a4b, big: true, finisher: i === 2, poise: 60 });
      if (seis || i === 2) groundWave(p.x + p.facing * 1.5, p.facing, { len: i === 2 ? 9 : 7, speed: 16, dmg: i === 2 ? 20 : 14, color: 0xc08a4b, stun: i === 2 ? 0.8 : 0.3, kx: 5, ky: 3 });
      if (i === 2) {
        const gx = p.x + p.facing * 1.8;
        ring(gx, groundAt(gx) + 0.05, 0.5, 0xe0b070, { r0: 0.3, r1: 4, dur: 0.5, flat: true }); ring(gx, groundAt(gx) + 0.5, 0.5, 0xe0b070, { r0: 0.3, r1: 3, dur: 0.35 });
        puff(gx, groundAt(gx) + 0.2, 8, 0x8b949e, 1.4, 0.8); cubes(gx, groundAt(gx) + 0.5, 0xb98a4e, 10, 8, 0.35); sfx.stomp(); shake(0.4); ripple(gx, 2.2, 0xc08a4b, 14, 1);
      }
    },
  },
  ranged: {
    name: 'Rock Throw', desc: 'Lob a boulder in a heavy arc. It explodes into shrapnel and staggers enemies.', cost: 14, cd: 0.8, lock: 0.3,
    cast(p, a) {
      const m = p.mods; sfx.shoot('earth');
      const sp = 15;
      spawnProj({ x: p.x + a.x * 0.8, y: p.y + 1.5, vx: a.x * sp, vy: a.y * sp + 6, grav: 22, r: 0.5, shape: 'rock', color: 0x9a7448, trailC: 0xd9a05b, trailDust: 0x6e5a3a, life: 2.5,
        onHit: () => {},
        onEnd: (pr) => {
          explode(pr.x, pr.y, 2.5, 27, { color: 0xc08a4b, stun: 0.7, kx: 9, ky: 6, shake: 0.4, cubeColor: 0x9a7448 });
          cubes(pr.x, pr.y, 0x9a7448, 8, 9, 0.3, false, 1.2);
          if (m.avalanche) for (let i = 0; i < 10; i++) { const an = rand(0.4, Math.PI - 0.4);
            spawnProj({ x: pr.x, y: pr.y + 0.3, vx: Math.cos(an) * 11 + rand(-6, 6), vy: Math.sin(an) * 12 + 4, grav: 18, r: 0.22, color: 0xc08a4b, trailC: 0xe0b070, dmg: 14, life: 1.2, homing: { turn: 8, range: 8 },
              onHit: (q, e) => { hitEnemy(e, 14, { kind: 'ranged', color: 0xc08a4b, kx: 4, poise: 20 }); sparks(q.x, q.y, 0xe0b070, 6, 5); } }); }
        } });
      puff(p.x + a.x, p.y + 1.2, 3, 0x8b949e, 0.7, 0.4);
    },
  },
  guard: {
    name: 'Stone Skin', desc: 'Hold to harden into stone (−85% damage, no knockback). A perfect block shatters outward: stuns everything nearby.', reduction: 0.85, knockback: 0.5,
    onPerfect(p) {
      for (const e of G.enemies) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 8) e.stun = Math.max(e.stun, 1.8);
      for (const d of [-1, 1]) groundWave(p.x, d, { len: 9, speed: 18, dmg: 30, color: 0xc08a4b, stun: 1.6, kx: 8, ky: 5 });
      explode(p.x, p.y + 1, 4.5, 20, { color: 0xc08a4b, stun: 1.8, kx: 7, shake: 0.7 }); sfx.stomp();
      if (p.mods.immovable) { p.dmgBuff = 1.4; p.dmgBuffT = 4; floatText(p.x, p.y + 3.7, 'POWER +40%', { color: '#e0b070', size: 20 }); }
    },
  },
  s1: {
    name: 'Quake', desc: 'Leap and slam the ground, sending shockwaves in both directions that stun everything.', cost: 30, cd: 7, lock: 0.7,
    cdFn: () => 7,
    cast(p) {
      sfx.cast('earth');
      if (p.mods.mountainfall) { // ONE colossal mountain drops ahead of you
        const tx = clamp(p.x + p.facing * 7, 2, 264), gy = groundAt(tx);
        screenFlash(0xe0b070, 0.25); shake(0.3); punchFov(3);
        ring(tx, gy + 0.05, 0.5, 0xe0b070, { r0: 0.4, r1: 9, dur: 0.9, flat: true });
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xa07a45).multiplyScalar(1.8), toneMapped: false }));
        scene.add(m); let t = 0; sfx.telegraph();
        addFx((dt) => {
          t += dt; const k = Math.min(1, t / 0.75), y = lerp(gy + 30, gy + 2.2, k * k);
          m.position.set(tx, y, 0); m.scale.setScalar(3.4); m.rotation.x += dt * 2.5; m.rotation.y += dt * 1.6;
          if (Math.random() < 0.7) dust.emit(tx + rand(-3, 3), y + rand(-2, 2), rand(-1, 1), rand(-2, 2), rand(2, 7), 0, rgb(0x8b949e, 0.6), 1, 1.5, 0.8);
          if (k < 1) return true;
          scene.remove(m); m.geometry.dispose();
          sfx.quake(); shake(1.0); punchFov(7); post.aberr = 0.02; screenFlash(0xffe0a0, 0.45);
          ring(tx, gy + 0.05, 0.5, 0xe0b070, { r0: 0.5, r1: 16, dur: 0.9, flat: true }); ring(tx, gy + 1, 0.5, 0xffffff, { r0: 0.3, r1: 9, dur: 0.5 });
          puff(tx, gy + 0.5, 24, 0x8b949e, 3, 1.4); cubes(tx, gy + 1, 0xb98a4e, 40, 16, 0.6, false, 2.4); ripple(tx, 5, 0xc08a4b, 24, 1.8); flashLight(tx, gy + 2, 2, 0xe0b070, 120, 0.7);
          explode(tx, gy + 1, 8.5, 110, { color: 0xc08a4b, stun: 2.5, kx: 8, ky: 14, launch: 14, shake: 0, hitstop: 0.14, noGround: true });
          for (const d of [-1, 1]) groundWave(tx, d, { len: 16, speed: 20, dmg: 40, color: 0xc08a4b, stun: 2.5, kx: 3, ky: 12, thick: 1.6, height: 3, hitOpts: { launch: 14 } });
          return false;
        });
        return;
      }
      p.vy = 11; punchFov(2);
      const impact = (mult) => {
        const x = p.x, gy = groundAt(x);
        sfx.quake(); shake(0.85 * mult); punchFov(5); post.aberr = 0.01; screenFlash(0xe0b070, 0.25);
        ring(x, gy + 0.05, 0.5, 0xe0b070, { r0: 0.5, r1: 11 * mult, dur: 0.7, flat: true }); ring(x, gy + 0.6, 0.5, 0xffffff, { r0: 0.3, r1: 5, dur: 0.4 });
        puff(x, gy + 0.3, 14, 0x8b949e, 1.8, 1); cubes(x, gy + 0.5, 0xb98a4e, 22, 12, 0.4, false, 1.8);
        ripple(x, 3.2, 0xc08a4b, 18, 1.4); flashLight(x, gy + 1, 2, 0xe0b070, 70, 0.5);
        const sp = p.mods.spire;
        for (const d of [-1, 1]) groundWave(x, d, { len: (10 + (sp ? 6 : 0)) * mult, speed: 18, dmg: 38 * mult, color: 0xc08a4b, stun: sp ? 2.5 : 1.6, kx: sp ? 3 : 10, ky: sp ? 12 : 9, thick: 1.4, height: 2.4, hitOpts: sp ? { launch: 14 } : {} });
        explode(x, gy + 0.6, 3.4 * mult, 18, { color: 0xc08a4b, stun: 1.2, noGround: true, shake: 0 });
      };
      later(0.22, () => { p.vy = -36; p.slam = () => { impact(1); if (p.mods.aftershock) { later(0.5, () => impact(1.7)); proc('AFTERSHOCK', p.x, p.y + 3, '#e0b070'); } }; });
    },
  },
  s2: {
    name: 'Stone Bastion', desc: 'Raise stone pillars ahead. They launch enemies and can be stood on or used as cover.', cost: 40, cd: 12, lock: 0.5,
    cdFn: () => 12,
    cast(p) {
      const fort = p.mods.fortress, n = fort ? 5 : 3, life = fort ? 12 : 6;
      sfx.cast('earth'); shake(0.35);
      for (let i = 0; i < n; i++) {
        const px = p.x + p.facing * (3.2 + i * 2.1);
        later(i * 0.1, () => {
          const gy = groundAt(px); if (gy < -20 || px < 1 || px > 266) return;
          const H = 3.6 + (i % 2) * 0.9;
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 1.4), new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.85, flatShading: true }));
          mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
          const solid = { x0: px - 0.75, x1: px + 0.75, y0: gy, y1: gy, owner: 'pillar' }; dyn.push(solid);
          sfx.stomp(); ring(px, gy + 0.05, 0.5, 0xe0b070, { r0: 0.3, r1: 3, dur: 0.4, flat: true }); puff(px, gy + 0.2, 8, 0x8b949e, 1.4, 0.7); cubes(px, gy + 0.3, 0xb98a4e, 8, 8, 0.3);
          ripple(px, 1.4, 0xc08a4b, 14, 0.8);
          hitBox(px - 1.3, px + 1.3, gy - 0.5, gy + 3, 30, { kind: 'special', kx: 4, ky: 15, stun: 1.2, color: 0xc08a4b, big: true, poise: 80 });
          let t = 0, crumble = false;
          addFx((dt) => {
            t += dt; const k = clamp(t / 0.18, 0, 1), h = H * easeOut(k);
            solid.y1 = gy + h; mesh.scale.set(1, h, 1); mesh.position.set(px, gy + h / 2, 0);
            if (t < life - 1) { if (t < 0.3 && k < 1) for (let j = 0; j < 3; j++) dust.emit(px + rand(-0.7, 0.7), gy + rand(0, h), 0.8, 0, rand(0, 2), 0, rgb(0x8b949e, 0.7), 0.5, 1.3, 0.5); }
            else mesh.position.x = px + Math.sin(t * 60) * 0.05;
            if (t >= life || solid.dead) {
              scene.remove(mesh); mesh.geometry.dispose();
              const j = dyn.indexOf(solid); if (j >= 0) dyn.splice(j, 1);
              cubes(px, gy + h / 2, 0x9a7448, 12, 7, 0.35, false, 1.4); puff(px, gy + 1, 6, 0x8b949e, 1.2, 0.6); sfx.land(0.6);
              return false;
            }
            return true;
          });
        });
      }
    },
  },
};

// ================================================================= AIR
const air = {
  key: 'air', name: 'Air', color: 0xcfe9ff, color2: 0x7ff3d6, css: '#bfe1ff', css2: '#7ff3d6',
  blurb: 'Speed and freedom. Out-maneuver, deflect, and dominate the sky.',
  stats: [3, 4, 2, 5],
  prof: { atk: 0.64, dmg: 0.68, poise: 0.7, hs: 0.7, move: 1.28, dash: { speed: 29, dur: 0.2, cd: 0.5, inv: 0.24 }, jump: 16.2, jumps: 1, fall: -15, grav: 0.86, tag: 'Fastest · light · floats, 3 jumps, quick dash' },
  main: {
    name: 'Gale Blades', desc: 'Very fast slashes with long reach. The finisher dashes forward through enemies.',
    hits: [{ dur: 0.24, hitAt: 0.05, cancelAt: 0.14, lunge: 8 }, { dur: 0.24, hitAt: 0.05, cancelAt: 0.14, lunge: 8 }, { dur: 0.36, hitAt: 0.09, cancelAt: 0.26, lunge: 14 }],
    strike(p, i) {
      const cx = p.x + p.facing * 1.5, cy = p.y + 1.1;
      slash(cx, cy, p.facing, i === 2 ? 0x7ff3d6 : 0xcfe9ff, { radius: i === 2 ? 3.3 : 2.7, angle: 2.4, rot: i === 1 ? 0.4 : -0.5, flip: i === 1 ? -1 : 1, dur: 0.17, sweep: 1.6 });
      sfx.swing('air', i);
      for (let k = 0; k < 8; k++) glow.emit(cx + rand(-1, 1) * p.facing, cy + rand(-1, 1), 0, -p.facing * rand(3, 9), rand(-1, 1), 0, rgb(0xcfe9ff, 1.5), rand(0.2, 0.35), 0, 0.35, 0, 3);
      melee(p, { range: 3.0, h: 2.2, y0: -0.1, dmg: [8, 8, 13][i], kx: i === 2 ? 9 : 4, ky: i === 2 ? 5 : 1, color: 0xcfe9ff, big: i === 2, finisher: i === 2 });
      if (i === 2 && p.mods.hurricane) {
        spawnProj({ x: p.x + p.facing, y: p.y + 1.1, vx: p.facing * 26, vy: 0, r: 0.5, shape: 'blade', color: 0x7ff3d6, trailC: 0xcfe9ff, dmg: 14, life: 0.75, pierce: 99, ghost: true,
          onHit: (pr, e) => hitEnemy(e, 24, { kind: 'ranged', dir: Math.sign(pr.vx), color: 0x7ff3d6, kx: 5 }) });
        proc('HURRICANE', p.x, p.y + 3, '#7ff3d6');
      }
    },
  },
  ranged: {
    name: 'Wind Cutter', desc: 'Fire a razor crescent of wind that pierces through every enemy in its path.', cost: 7, cd: 0.28, lock: 0.12,
    cast(p, a) {
      const triple = p.mods.tripleCut, offs = triple ? [-0.22, 0, 0.22] : [0], mul = triple ? 0.7 : 1;
      sfx.shoot('air');
      for (const o of offs) {
        const an = Math.atan2(a.y, a.x) + o;
        spawnProj({ x: p.x + a.x * 0.8, y: p.y + 1.2 + a.y * 0.6, vx: Math.cos(an) * 26, vy: Math.sin(an) * 26, r: 0.45, shape: 'blade', color: 0xcfe9ff, trailC: 0x7ff3d6, dmg: 12 * mul, life: 0.62, pierce: 99, ghost: false,
          onHit: (pr, e) => { hitEnemy(e, 12 * mul, { kind: 'ranged', dir: Math.sign(pr.vx) || 1, color: 0x7ff3d6, kx: 3, ky: 2 }); } });
      }
      sparks(p.x + a.x, p.y + 1.2, 0xcfe9ff, 6, 6, 0.18, 0.25);
    },
  },
  guard: {
    name: 'Wind Wall', desc: 'Hold to raise a gale. Projectiles are deflected back. A perfect parry blasts enemies away.', reduction: 0.5, knockback: 6, deflects: true,
    onPerfect(p) {
      explode(p.x, p.y + 1, 6, 28, { color: 0xcfe9ff, kx: 20, ky: 10, shake: 0.5 });
      for (let i = 0; i < 40; i++) { const a = rand(6.28); glow.emit(p.x, p.y + 1, rand(-1, 1), Math.cos(a) * rand(10, 22), Math.sin(a) * rand(10, 22), 0, rgb(0xcfe9ff, 1.6), 0.4, 0, 0.6, 0, 2); }
      p.cd.dash = 0;
      if (p.mods.tailwindParry) { p.haste = 3; p.energy = Math.min(p.energyMax, p.energy + 30); floatText(p.x, p.y + 3.7, 'TAILWIND', { color: '#7ff3d6', size: 20 }); }
    },
  },
  s1: {
    name: 'Cyclone', desc: 'Conjure a tornado ahead that drags enemies in, lifts and shreds them.', cost: 35, cd: 9, lock: 0.45,
    cdFn: () => 9,
    cast(p) {
      const mael = p.mods.maelstrom, eye = p.mods.stormEye || mael, bolts = p.mods.cycloneBolts, R = mael ? 8.6 : eye ? 5.4 : 3.8, dur = mael ? 7 : eye ? 6 : 3.8;
      if (mael) { screenFlash(0xcfe9ff, 0.3); shake(0.5); }
      let cx = clamp(p.x + p.facing * 5, 3, 264); const dir = p.facing;
      sfx.cast('air'); shake(0.3); punchFov(2);
      const g = new THREE.Group(); const rings = [];
      for (let i = 0; i < 7; i++) {
        const r = 0.5 + i * 0.4 * (R / 3.8);
        const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 6, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? 0x7ff3d6 : 0xcfe9ff).multiplyScalar(1.6), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        m.rotation.x = Math.PI / 2; m.position.y = 0.4 + i * 0.75 * (R / 3.8); g.add(m); rings.push(m);
      }
      scene.add(g);
      let t = 0, tk = 0, bk = 0;
      addFx((dt) => {
        t += dt; tk += dt; bk += dt;
        cx = clamp(cx + dir * 2.2 * dt * (t < dur - 0.6 ? 1 : 0), 3, 264);
        const gy = groundAt(cx);
        const k = Math.min(1, t / 0.3) * (t > dur - 0.5 ? Math.max(0, (dur - t) / 0.5) : 1);
        g.position.set(cx, Math.max(0, gy), 0); g.scale.setScalar(Math.max(0.01, k));
        rings.forEach((m, i) => { m.rotation.z += dt * (9 - i); m.position.x = Math.sin(t * 3 + i) * 0.3; });
        for (let i = 0; i < 6; i++) { const a = rand(6.28), h = rand(0, 5.5) * (R / 3.8), rr = (0.4 + h * 0.3) * k; glow.emit(cx + Math.cos(a) * rr, Math.max(0, gy) + h, Math.sin(a) * rr, -Math.sin(a) * 8, 2, Math.cos(a) * 3, rgb(0xcfe9ff, 1.5), rand(0.25, 0.5), 0, 0.5, 0, 0); }
        if (Math.random() < 0.4) dust.emit(cx + rand(-1.5, 1.5), Math.max(0, gy) + 0.2, rand(-1, 1), rand(-3, 3), rand(0, 3), 0, rgb(0x8b949e, 0.5), 0.6, 1.5, 0.6);
        const pull = mael ? 46 : eye ? 30 : 20;
        for (const e of G.enemies) {
          if (e.dead || e.spawnT > 0) continue;
          const dx = cx - e.x;
          if (Math.abs(dx) < R + 2 && e.y < gy + 9) { e.vx += Math.sign(dx) * Math.min(pull, Math.abs(dx) * 8) * dt; e.vy = Math.max(e.vy, 3.5); e.lift = 0.3; }
        }
        if (tk >= 0.3) { tk = 0; for (const e of G.enemies) if (!e.dead && e.spawnT <= 0 && Math.abs(e.x - cx) < R) hitEnemy(e, mael ? 20 : eye ? 11 : 9, { kind: 'special', kx: 0, ky: 0, color: 0xcfe9ff, quiet: false, hitstop: 0.015, shake: 0.08, poise: 6, noCrit: false }); }
        if (bolts && bk >= 0.7) { bk = 0; const e = nearest(cx, gy + 2, R + 4); if (e) { bolt(cx, gy + 10, e.x, e.y + e.h / 2, 0xe8f6ff); hitEnemy(e, 24, { kind: 'special', color: 0xffffff, stun: 0.5, big: true }); shake(0.2); } }
        if (t >= dur) {
          if (p.mods.jetstream) { ring(cx, Math.max(0, gy) + 1, 0.5, 0xcfe9ff, { r0: 0.5, r1: R * 1.4, dur: 0.4 }); for (const e of G.enemies) if (!e.dead && e.spawnT <= 0 && !e.boss && Math.abs(e.x - cx) < R + 1) { e.vy = 17; e.vx *= 0.3; e.air = true; e.juggle = 0; e.lift = 0.4; } sfx.wave(); }
          scene.remove(g); g.children.forEach((m) => { m.geometry.dispose(); }); return false;
        }
        return true;
      });
    },
  },
  s2: {
    name: 'Sky Dance', desc: 'Become the wind: fly freely with unlimited jumps, move faster and attack faster.', cost: 40, cd: 15, lock: 0.3,
    cdFn: (p) => (p.mods.wings ? 9 : 15),
    cast(p) {
      const dur = p.mods.wings ? 9 : 6;
      p.fly = dur; p.haste = Math.max(p.haste || 0, dur);
      sfx.cast('air'); screenFlash(0xcfe9ff, 0.25); shake(0.3); punchFov(4);
      ring(p.x, p.y + 1, 0.5, 0x7ff3d6, { r0: 0.3, r1: 6, dur: 0.6 }); ring(p.x, p.y + 1, 0.5, 0xffffff, { r0: 0.3, r1: 3.5, dur: 0.4 });
      for (let i = 0; i < 40; i++) { const a = rand(6.28); glow.emit(p.x, p.y + 1, rand(-1, 1), Math.cos(a) * rand(6, 16), Math.sin(a) * rand(6, 16), 0, rgb(0xcfe9ff, 1.6), 0.4, 0, 0.7, 0, 2); }
      p.vy = 12;
      floatText(p.x, p.y + 3.4, 'SKY DANCE', { color: '#7ff3d6', size: 26 });
    },
  },
};


// ================================================================= NEW MOVES (all elements): launcher, air chain, slam
// Each element gets its own flavour through MOVE_FX; the hitboxes/juggle rules are shared.
const colOf = (p) => p.el.color, col2Of = (p) => p.el.color2;
const SPRITE_OF = { fire: SPRITE.streak, water: SPRITE.drop, earth: SPRITE.chip, air: SPRITE.leaf };
const MAIN_EXTRA = {
  fire: { burn: 2, burnDps: 7 }, water: { chill: 1.8 }, earth: { poise: 45 }, air: {},
};
function column(p, x, h, color, color2, n = 16) { // rising particle pillar
  const gy = groundAt(x), a = rgb(color, 1.9), b = rgb(color2, 1.8);
  for (let i = 0; i < n; i++) glow.emit(x + rand(-0.5, 0.5), gy + rand(0, h * 0.5), rand(-0.4, 0.4), rand(-1, 1), rand(7, 16), 0, Math.random() < 0.5 ? a : b, rand(0.35, 0.7), 0, rand(0.3, 0.5), -2, 1, 0);
}
const launcherFx = {
  fire(p, x) { column(p, x, 4, 0xff6a2b, 0xffc233, 22); for (let i = 0; i < 10; i++) glow.emit(x + rand(-0.6, 0.6), groundAt(x) + 0.2, rand(-0.3, 0.3), rand(-2, 2), rand(8, 15), 0, rgb(0xffc233, 1.8), 0.4, 0, 0.5, -1, 0, SPRITE.streak); decal('scorch', x, groundAt(x), 3, 5, 0xffffff); flashLight(x, groundAt(x) + 1.5, 2, 0xff6a2b, 60, 0.35); },
  water(p, x) { column(p, x, 4, 0x2ea8ff, 0x9fe8ff, 12); for (let i = 0; i < 16; i++) glow.emit(x + rand(-0.5, 0.5), groundAt(x) + 0.3, rand(-0.4, 0.4), rand(-3, 3), rand(9, 17), 0, rgb(0xcfeeff, 1.7), 0.35, 0.15, 0.7, 14, 0, SPRITE.drop, rand(-3, 3)); decal('puddle', x, groundAt(x), 3.2, 6, 0xffffff); flashLight(x, groundAt(x) + 1.5, 2, 0x2ea8ff, 55, 0.35); },
  earth(p, x) { // a rock pillar bursts up and falls back
    const gy = groundAt(x), m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 1.3), new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.85, flatShading: true }));
    m.castShadow = true; scene.add(m); let t = 0;
    addFx((dt) => { t += dt; const k = Math.min(1, t / 0.12), fall = t > 0.3 ? Math.min(1, (t - 0.3) / 0.25) : 0, h = 3.2 * easeOut(k) * (1 - fall * fall);
      m.scale.set(1, Math.max(0.01, h), 1); m.position.set(x, gy + h / 2, 0); if (t >= 0.55) { scene.remove(m); m.geometry.dispose(); return false; } return true; });
    cubes(x, gy + 0.5, 0xb98a4e, 12, 9, 0.35); puff(x, gy + 0.2, 8, 0x8b949e, 1.4, 0.7); decal('crack', x, gy, 3.2, 6, 0xffffff); ripple(x, 1.6, 0xc08a4b, 14, 0.8); flashLight(x, gy + 1.5, 2, 0xe0b070, 50, 0.3);
  },
  air(p, x) { const gy = groundAt(x); for (let i = 0; i < 5; i++) later(i * 0.04, () => ring(x, gy + 0.3 + i * 0.75, 0.3, i % 2 ? 0x7ff3d6 : 0xcfe9ff, { r0: 0.5, r1: 1.5 - i * 0.08, dur: 0.3, flat: true, intensity: 1.5 }));
    for (let i = 0; i < 18; i++) glow.emit(x + rand(-0.8, 0.8), gy + rand(0, 1), rand(-0.5, 0.5), rand(-2, 2), rand(10, 18), 0, rgb(0xcfe9ff, 1.5), 0.3, 0.1, 0.5, -2, 1, SPRITE.leaf, rand(-6, 6)); decal('wind', x, gy, 3, 3, 0xffffff); flashLight(x, gy + 1.5, 2, 0xcfe9ff, 45, 0.3); },
};
export function launcherStrike(p) {
  const f = p.facing, k = p.key, c = colOf(p);
  const x0 = f > 0 ? p.x - 0.3 : p.x - 2.7, x1 = f > 0 ? p.x + 2.7 : p.x + 0.3, fx = p.x + f * 1.5;
  slash(fx - f * 0.3, p.y + 1.2, f, col2Of(p), { radius: 3.1, angle: 2.4, rot: 0.55, flip: 1, dur: 0.26, sweep: 2.1 });
  sfx.swing(k, 1, 'launcher'); launcherFx[k](p, fx);
  ring(fx, groundAt(fx) + 0.06, 0.4, c, { r0: 0.3, r1: 3, dur: 0.4, flat: true });
  const dmg = { fire: 16, water: 13, earth: 22, air: 12 }[k];
  const hit = hitBox(x0, x1, p.y - 0.3, p.y + 3.4, dmg, { kind: 'main', dir: f, launch: 17, kx: 1.5, ky: 0, big: true, color: c, ...MAIN_EXTRA[k] });
  p.vy = Math.max(p.vy, 7); p.onGround = false; p.y += 0.03; p.squash = -0.3;
  if (hit.length) imbueBurst(p, fx, p.y + 1.4);
  emit('launcher', { hits: hit.length });
}
export function airStrike(p, i) {
  const f = p.facing, k = p.key, c = colOf(p), cx = p.x + f * 1.3, cy = p.y + 1.1, spike = i === 2;
  slash(cx, cy, f, spike ? col2Of(p) : c, { radius: spike ? 3 : 2.6, angle: 2.4, rot: spike ? -0.9 : (i ? 0.3 : -0.3), flip: i === 1 ? -1 : 1, dur: 0.2, sweep: spike ? -2.2 : 1.7 });
  sfx.swing(k, i);
  sparks(cx + f, cy, c, 7, 7, 0.2, 0.35, f, 1, SPRITE_OF[k]);
  const dmg = [{ fire: 9, water: 8, earth: 13, air: 7 }, { fire: 9, water: 8, earth: 13, air: 7 }, { fire: 14, water: 12, earth: 20, air: 11 }][i][k];
  const hit = hitBox(f > 0 ? p.x - 0.4 : p.x - 2.6, f > 0 ? p.x + 2.6 : p.x + 0.4, p.y - 0.9, p.y + 2.4, dmg, { kind: 'main', dir: f, lift: !spike, spike, kx: spike ? 1.5 : 2.5, ky: 0, color: c, big: spike, ...MAIN_EXTRA[k] });
  if (spike && hit.length) imbueBurst(p, cx, cy - 0.5);
  emit('airSwing', { i, hits: hit.length });
}
const slamFx = {
  fire(x, gy) { for (let i = 0; i < 26; i++) glow.emit(x + rand(-1.5, 1.5), gy + 0.1, rand(-0.5, 0.5), rand(-9, 9), rand(2, 10), 0, rgb(Math.random() < 0.5 ? 0xff6a2b : 0xffc233, 1.9), rand(0.4, 0.8), 0, 0.5, 6, 1); decal('scorch', x, gy, 4.4, 8, 0xffffff); },
  water(x, gy) { for (let i = 0; i < 28; i++) glow.emit(x + rand(-1, 1), gy + 0.2, rand(-0.5, 0.5), rand(-8, 8), rand(4, 12), 0, rgb(0xcfeeff, 1.7), 0.35, 0.15, 0.7, 16, 0, SPRITE.drop, rand(-3, 3)); decal('puddle', x, gy, 4.6, 8, 0xffffff); },
  earth(x, gy) { cubes(x, gy + 0.4, 0xb98a4e, 22, 11, 0.4); puff(x, gy + 0.3, 12, 0x8b949e, 1.8, 0.9); decal('crack', x, gy, 5, 9, 0xffffff); },
  air(x, gy) { for (let i = 0; i < 28; i++) { const a = rand(Math.PI); glow.emit(x, gy + 0.2, rand(-0.5, 0.5), Math.cos(a) * rand(6, 14) * (Math.random() < 0.5 ? -1 : 1), rand(1, 5), 0, rgb(0xcfe9ff, 1.6), 0.3, 0, 0.5, 0, 2, SPRITE.leaf, rand(-6, 6)); } decal('wind', x, gy, 4.4, 5, 0xffffff); },
};
export function slamImpact(p) {
  const x = p.x, gy = groundAt(x), k = p.key, c = colOf(p);
  sfx.slam(k); fb('slam');
  ring(x, gy + 0.06, 0.5, c, { r0: 0.4, r1: 7, dur: 0.55, flat: true, intensity: 2 }); ring(x, gy + 0.7, 0.5, 0xffffff, { r0: 0.3, r1: 3.4, dur: 0.3 });
  slamFx[k](x, gy); impactFlash(x, gy + 0.4, c, 4.5); ripple(x, 2.6, c, 16, 1.2); flashLight(x, gy + 1, 2, c, 80, 0.4); shockwave(x, gy + 0.5, 0.04, 0.55, 0.45);
  const base = { kind: 'main', color: c, bounce: true, big: true, hitstop: 0.07, ...MAIN_EXTRA[k] };
  for (const d of [-1, 1]) groundWave(x, d, { len: 6.5, speed: 15, dmg: 13, color: c, kx: 5, ky: 0, hitOpts: base });
  explode(x, gy + 0.6, 3.1, { fire: 16, water: 13, earth: 22, air: 12 }[k], { ...base, kx: 6, ky: 0, noGround: true, shake: 0 });
  imbueBurst(p, x, gy + 1);
  emit('slam', { x });
}
// attach to the elements: clips for the ground combo + launcher / air chain / slam timings
const SPD = { fire: 1, water: 1.1, earth: 1.4, air: 0.85 };
const CLIPS = {
  fire: ['Punch_Jab', 'Sword_Attack', 'Sword_Attack'],
  water: ['Sword_Attack', 'Punch_Jab', 'Sword_Attack'],
  earth: ['Punch_Cross', 'Punch_Jab', 'Sword_Attack'],
  air: ['Punch_Jab', 'Sword_Attack', 'Punch_Cross'],
};
for (const el of [fire, water, earth, air]) {
  const k = el.key, s = SPD[k];
  el.main.hits.forEach((h, i) => { h.clip = CLIPS[k][i]; });
  el.main.launcher = { clip: 'Punch_Cross', dur: 0.46 * s, hitAt: 0.11 * s, cancelAt: 0.28 * s, lunge: 1, strike: launcherStrike };
  el.main.air = { strike: airStrike, hits: [
    { clip: CLIPS[k][0], dur: 0.32 * s, hitAt: 0.08 * s, cancelAt: 0.2 * s, lunge: 2.5 },
    { clip: CLIPS[k][1], dur: 0.32 * s, hitAt: 0.08 * s, cancelAt: 0.2 * s, lunge: 2.5 },
    { clip: 'Sword_Attack', dur: 0.46 * s, hitAt: 0.15 * s, cancelAt: 0.34 * s, lunge: 1 },
  ] };
  el.main.slam = { clip: 'Jump_Loop', windup: 0.1, dur: 0.5, strike: slamImpact };
  el.main.desc += ' Up + Attack launches, Attack in the air chains, Down + Attack slams.';
}

// ================================================================= NEW MOVES (unlocked by the first node of each skill branch)
// Dash Strike: Attack right after a Dash.  Charged Shot: hold Ranged.  Riposte: a perfect parry counter-attacks.
// Each element does all three in its own way; player.js / combat.js only dispatch to MOVES[key].
const hitLane = (p, reach, dmg, o) => hitBox(Math.min(p.x, p.x + p.facing * reach) - 0.3, Math.max(p.x, p.x + p.facing * reach) + 0.3, p.y - 0.2, p.y + 2.2, dmg, { kind: 'special', dir: p.facing, ...o });
function blink(p, x, face) { // vanish and reappear beside the target
  puff(p.x, p.y + 0.8, 8, 0xffffff, 1, 0.4); ring(p.x, p.y + 1, 0.4, p.el.color2, { r0: 0.2, r1: 2.2, dur: 0.3 });
  p.x = clamp(x, 1, 264); p.vx = 0; p.facing = face; p.hurtI = Math.max(p.hurtI, 0.8); p.safeX = p.x;
  puff(p.x, p.y + 0.8, 8, 0xffffff, 1, 0.4); ring(p.x, p.y + 1, 0.4, p.el.color, { r0: 0.2, r1: 2.6, dur: 0.35 });
}

export const MOVES = {
  fire: {
    dsCfg: { dur: 0.42, hitAt: 0.08, cancelAt: 0.3, lunge: 0, clip: 'Sword_Attack' },
    dashStrike(p) { // Flame Lash: a 7 m blazing cut through the whole lane
      const d = p.facing; p.vx = d * 18; sfx.swing('fire', 2);
      slash(p.x + d * 2.5, p.y + 1.1, d, 0xffc233, { radius: 4.2, angle: 2.6, dur: 0.3, sweep: 1.6 });
      for (let i = 0; i < 26; i++) glow.emit(p.x + d * rand(0, 7), p.y + rand(0.2, 1.8), d * rand(2, 8), rand(-1, 2), 0, 0, rgb(Math.random() < 0.5 ? 0xff6a2b : 0xffc233, 1.9), rand(0.3, 0.7), 0, 0.5, -2, 1);
      flashLight(p.x + d * 3, p.y + 1, 2, 0xff6a2b, 60, 0.3); shake(0.25); punchFov(3);
      hitLane(p, 7, 24, { burn: 3.5, burnDps: 10, kx: 8, ky: 3, big: true, color: 0xff6a2b });
    },
    charged(p, a) { // Ember Cannon
      sfx.cast('fire'); shake(0.3); punchFov(3); screenFlash(0xff6a2b, 0.2);
      spawnProj({ x: p.x + a.x * 0.9, y: p.y + 1.2 + a.y * 0.7, vx: a.x * 17, vy: a.y * 17, r: 1.0, color: 0xff7a30, trailC: 0xffc233, trailDust: 0x333333, life: 1.5, dmg: 0, onHit: () => {},
        onEnd: (pr) => { explode(pr.x, pr.y, 5.2, 72, { color: 0xff6a2b, burn: 4, burnDps: 12, kx: 11, ky: 9, shake: 0.7, hitstop: 0.12 }); ring(pr.x, pr.y, 0.5, 0xffc233, { r0: 0.5, r1: 8, dur: 0.5 }); } });
    },
    riposte(p, e) { // Flame Riposte
      blink(p, e.x - p.facing * 1.4, p.facing); sfx.explosion(0.8); screenFlash(0xffc233, 0.3);
      slash(p.x + p.facing * 1.5, p.y + 1.1, p.facing, 0xffc233, { radius: 3.4, angle: 3, dur: 0.3, sweep: 1.4 });
      explode(e.x, e.y + e.h * 0.5, 3.4, 52, { color: 0xff6a2b, burn: 3.5, kx: 10, ky: 8, stun: 0.8, hitstop: 0.1 });
    },
  },
  water: {
    dsCfg: { dur: 0.42, hitAt: 0.08, cancelAt: 0.3, lunge: 0, clip: 'Sword_Attack' },
    dashStrike(p) { // Riptide Slash: drags everything in the lane along with you
      const d = p.facing; p.vx = d * 20; sfx.swing('water', 2); sfx.wave();
      slash(p.x + d * 2.4, p.y + 1.1, d, 0x9fe8ff, { radius: 4, angle: 2.6, dur: 0.3, sweep: 1.5 });
      for (let i = 0; i < 24; i++) glow.emit(p.x + d * rand(0, 6), p.y + rand(0.2, 2), d * rand(4, 12), rand(-1, 2), 0, 0, rgb(0x9fe8ff, 1.7), rand(0.3, 0.6), 0, 0.5, 0, 1);
      shake(0.2); punchFov(2);
      for (const e of hitLane(p, 6, 22, { chill: 3.5, kx: 2, ky: 3, big: true, color: 0x2ea8ff })) if (!e.boss) e.vx = d * 20;
    },
    charged(p, a) { // Frost Lance: pierces everything and freezes it
      sfx.cast('water'); shake(0.25); punchFov(3);
      spawnProj({ x: p.x + a.x * 0.9, y: p.y + 1.2 + a.y * 0.7, vx: a.x * 36, vy: a.y * 36, r: 0.5, shape: 'blade', color: 0x9fe8ff, trailC: 0xcfeeff, life: 0.9, dmg: 0, pierce: 99, ghost: true,
        onHit: (pr, e) => { if (p.mods.freeze) e.chillStacks = Math.max(e.chillStacks || 0, 2); hitEnemy(e, 44, { kind: 'special', dir: Math.sign(pr.vx), chill: 4, stun: 0.5, kx: 5, ky: 4, big: true, color: 0x9fe8ff }); sparks(pr.x, pr.y, 0xcfeeff, 14, 8); } });
    },
    riposte(p, e) { // Tidal Riposte
      blink(p, e.x - p.facing * 1.4, p.facing); sfx.wave(); sfx.heal(); screenFlash(0x2ea8ff, 0.25);
      p.hp = Math.min(p.hpMax, p.hp + 10); floatText(p.x, p.y + 3.7, '+10 HP', { color: '#9fe8ff', size: 22 });
      slash(p.x + p.facing * 1.5, p.y + 1.1, p.facing, 0x9fe8ff, { radius: 3.4, angle: 3, dur: 0.3, sweep: 1.4 });
      explode(e.x, e.y + e.h * 0.5, 3.6, 46, { color: 0x2ea8ff, chill: 4, kx: 9, ky: 8, stun: 0.7, hitstop: 0.1 });
    },
  },
  earth: {
    dsCfg: { dur: 0.55, hitAt: 0.1, cancelAt: 0.4, lunge: 0, clip: 'Punch_Cross' },
    dashStrike(p) { // Shoulder Charge: an armoured barge
      const d = p.facing; p.vx = d * 17; sfx.stomp(); shake(0.45); punchFov(4);
      for (let i = 0; i < 10; i++) cubes(p.x + d * rand(0.5, 3), p.y + 0.3, 0xb98a4e, 1, 7, 0.3, false, 1);
      ring(p.x + d * 1.5, p.y + 0.1, 0.4, 0xe0b070, { r0: 0.3, r1: 3.4, dur: 0.4, flat: true });
      hitLane(p, 3.6, 38, { stun: 1.3, kx: 13, ky: 4, poise: 140, big: true, color: 0xc08a4b, hitstop: 0.1 });
    },
    charged(p, a) { // Boulder Toss
      sfx.cast('earth'); shake(0.35); punchFov(3);
      spawnProj({ x: p.x + a.x * 0.9, y: p.y + 1.5, vx: a.x * 14, vy: a.y * 14 + 8, grav: 22, r: 0.95, shape: 'rock', color: 0x9a7448, trailC: 0xd9a05b, trailDust: 0x6e5a3a, life: 2.6, dmg: 0, onHit: () => {},
        onEnd: (pr) => { explode(pr.x, pr.y, 5.6, 84, { color: 0xc08a4b, stun: 1.8, kx: 10, ky: 9, shake: 0.85, hitstop: 0.14, cubeColor: 0x9a7448 }); cubes(pr.x, pr.y, 0x9a7448, 18, 11, 0.4, false, 1.4); ring(pr.x, pr.y + 0.1, 0.5, 0xe0b070, { r0: 0.5, r1: 8, dur: 0.5, flat: true }); } });
    },
    riposte(p, e) { // Rockslide Riposte: the ground erupts under the attacker
      const gy = groundAt(e.x); sfx.quake(); shake(0.8); punchFov(5); screenFlash(0xe0b070, 0.3);
      ring(e.x, gy + 0.05, 0.5, 0xe0b070, { r0: 0.4, r1: 7, dur: 0.6, flat: true }); cubes(e.x, gy + 0.5, 0xb98a4e, 28, 12, 0.5, false, 2); puff(e.x, gy + 0.3, 14, 0x8b949e, 2, 1);
      explode(e.x, gy + 0.8, 4, 60, { color: 0xc08a4b, stun: 2, kx: 6, ky: 13, launch: 13, hitstop: 0.14, noGround: true });
      for (const d of [-1, 1]) groundWave(e.x, d, { len: 8, speed: 18, dmg: 26, color: 0xc08a4b, stun: 1.5, kx: 5, ky: 8 });
    },
  },
  air: {
    dsCfg: { dur: 0.34, hitAt: 0.06, cancelAt: 0.22, lunge: 0, clip: 'Sword_Attack' },
    dashStrike(p) { // Gale Rush: four rapid cuts, and the dash is refunded
      const d = p.facing; p.vx = d * 14; sfx.swing('air', 2); p.airDash = true; p.cd.dash = 0;
      for (let i = 0; i < 4; i++) later(i * 0.055, () => {
        slash(p.x + d * (1.8 + i * 0.5), p.y + 1 + (i % 2 ? 0.3 : -0.2), d, 0xcfe9ff, { radius: 2.6, angle: 2.2, dur: 0.16, rot: i % 2 ? 0.6 : -0.6, flip: i % 2 ? -1 : 1, sweep: 1.1 });
        sfx.swing('air', i % 3);
        hitLane(p, 4.5, 9, { kx: 3, ky: 2, color: 0xcfe9ff, hitstop: 0.025, shake: 0.06 });
      });
    },
    charged(p, a) { // Tempest Disc: a travelling whirl that drags enemies in and shreds them
      sfx.cast('air'); shake(0.25); punchFov(3);
      let x = p.x + a.x * 1.2, y = p.y + 1.2 + a.y * 1.5, t = 0, tk = 0; const dx = a.x, dy = a.y;
      addFx((dt) => {
        t += dt; tk += dt; x += dx * 15 * dt; y += dy * 15 * dt; y = Math.max(y, groundAt(x) + 0.6);
        for (let i = 0; i < 8; i++) { const an = rand(6.28), r = rand(0.3, 2.2); glow.emit(x + Math.cos(an) * r, y + Math.sin(an) * r * 0.8, -Math.sin(an) * 9, Math.cos(an) * 9, 0, 0, rgb(Math.random() < 0.5 ? 0xcfe9ff : 0x7ff3d6, 1.7), rand(0.2, 0.4), 0, 0.4, 0, 0); }
        for (const e of G.enemies) if (!e.dead && e.spawnT <= 0 && !e.boss && Math.abs(e.x - x) < 4 && Math.abs(e.y + e.h / 2 - y) < 3) e.vx += Math.sign(x - e.x) * 40 * dt;
        if (tk >= 0.12) { tk = 0; hitBox(x - 2.2, x + 2.2, y - 2, y + 2, 11, { kind: 'special', kx: 0, ky: 1, color: 0xcfe9ff, hitstop: 0.015, shake: 0.08, poise: 8 }); }
        if (t >= 1.5) { ring(x, y, 0.5, 0xcfe9ff, { r0: 0.5, r1: 5, dur: 0.4 }); return false; }
        return true;
      });
    },
    riposte(p, e) { // Zephyr Riposte: reappear behind the attacker and carve it skyward
      blink(p, e.x + p.facing * 1.4, -p.facing); sfx.swing('air', 2); screenFlash(0xcfe9ff, 0.25);
      for (let i = 0; i < 3; i++) later(i * 0.06, () => { slash(p.x + p.facing * 1.4, p.y + 1.2, p.facing, 0xcfe9ff, { radius: 3, angle: 2.6, dur: 0.18, rot: i - 1, flip: i % 2 ? -1 : 1 }); if (!e.dead) hitEnemy(e, 16, { kind: 'special', dir: p.facing, kx: 2, ky: i === 2 ? 12 : 3, launch: i === 2 ? 15 : 0, color: 0xcfe9ff, hitstop: 0.04 }); });
    },
  },
};

export const ELEMENTS = { fire, water, earth, air };
export const KEYS = ['fire', 'water', 'earth', 'air'];
