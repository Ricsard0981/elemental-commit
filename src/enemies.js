import * as THREE from 'three';
import { G } from './state.js';
import { scene, glow, dust, sparks, puff, cubes, rgb, ring, flashLight, floatText, shake, punchFov, screenFlash, post, addFx } from './engine.js';
import { groundAt, ripple, L } from './world.js';
import { sfx } from './audio.js';
import { damagePlayer, spawnProj, killEnemy, hitstop, slowmo, later } from './combat.js';
import { groundWave } from './elements.js';
import * as UI from './ui.js';
import { clamp, damp, rand, lerp, sign, easeOut } from './util.js';

const RED = 0xf85149;
const ICE = new THREE.Color(0x4db8ff);
const box = new THREE.BoxGeometry(1, 1, 1), sph = new THREE.SphereGeometry(1, 16, 12), cyl = new THREE.CylinderGeometry(1, 1, 1, 8);
const barGeo = new THREE.PlaneGeometry(1, 1);

function mk(e, geo, color, { em = 0, ei = 0, rough = 0.5, metal = 0.3, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, parent } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: Math.max(rough, 0.55), metalness: Math.min(metal, 0.1), emissive: em, emissiveIntensity: ei, flatShading: false });
  mat.userData.base = { em, ei };
  e.mats.push(mat);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true;
  (parent || e.group).add(m);
  return m;
}
function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

function base(type, x, y, o) {
  const e = {
    type, x, y, vx: 0, vy: 0, w: 1, h: 1, hp: 30, hpMax: 30, poise: 20, poiseMax: 20, stagger: 0, staggerTime: 0.45, stun: 0, chill: 0, burn: 0, burnDps: 0, burnT: 0,
    vulnerable: 0, flash: 0, hurtT: 0, dead: false, spawnT: 0.7, facing: -1, state: 'idle', st: 0, cd: rand(0.3, 1), color: RED, xp: 10, commits: 3, heart: 0.1,
    heavy: false, flying: false, boss: false, mats: [], group: new THREE.Group(), lift: 0, kbMul: 1, anim: rand(6), ...o,
  };
  e.group.position.set(x, y, 0); scene.add(e.group);
  e.parried = () => {
    e.tele = 0;
    if (e.boss) { e.state = 'stunned'; e.st = 0; e.staggerTime = 3; e.vulnerable = 3.2; e.hitDone = false; floatText(e.x, e.y + 7, 'BROKEN!', { color: '#ffd33d', size: 40 }); }
    else { e.state = 'idle'; e.cd = 1; }
  };
  // hp bar
  const bg = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x0d1117, transparent: true, depthTest: false })), fg = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x7ee787, transparent: true, depthTest: false, toneMapped: false }));
  bg.renderOrder = 20; fg.renderOrder = 21;
  e.bar = new THREE.Group(); e.bar.add(bg, fg); e.barBg = bg; e.barFg = fg; e.bar.visible = false; scene.add(e.bar);
  return e;
}

// ----------------------------------------------------------------- builders
function buildBug(x, y, o) {
  const e = base('bug', x, y, { name: 'Bug', w: 1.15, h: 0.95, hp: 34, hpMax: 34, poise: 24, poiseMax: 24, xp: 12, commits: 3, speed: 3.6, ...o });
  const g = e.group;
  e.body = pivot(g, 0, 0.5, 0);
  mk(e, sph, 0x8a2a33, { em: 0x3a0508, ei: 0.7, sx: 0.62, sy: 0.4, sz: 0.5, parent: e.body, rough: 0.35, metal: 0.5 });
  mk(e, box, RED, { em: RED, ei: 1.2, y: 0.17, sx: 0.5, sy: 0.05, sz: 0.2, parent: e.body });
  mk(e, sph, 0xffffff, { em: 0xff3030, ei: 3, x: 0.48, y: 0.08, z: 0.17, sx: 0.09, sy: 0.09, sz: 0.09, parent: e.body });
  mk(e, sph, 0xffffff, { em: 0xff3030, ei: 3, x: 0.48, y: 0.08, z: -0.17, sx: 0.09, sy: 0.09, sz: 0.09, parent: e.body });
  e.legs = [];
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? 1 : -1, px = (i % 3 - 1) * 0.3;
    const leg = pivot(g, px, 0.42, side * 0.3);
    mk(e, cyl, 0x4d1a1f, { sx: 0.035, sy: 0.38, sz: 0.035, y: -0.17, parent: leg, em: 0x400808, ei: 0.5 });
    leg.userData = { ph: i * 1.1, side }; e.legs.push(leg);
  }
  e.ant = mk(e, cyl, 0x4d1a1f, { sx: 0.02, sy: 0.4, sz: 0.02, x: 0.5, y: 0.85, z: 0.1, parent: g });
  return e;
}
function buildPointer(x, y, o) {
  const e = base('pointer', x, y, { name: 'Null Pointer', w: 1.2, h: 1.2, hp: 26, hpMax: 26, poise: 14, poiseMax: 14, xp: 16, commits: 4, flying: true, color: 0xff4d6d, heart: 0.16, ...o });
  const g = e.group;
  e.core = mk(e, new THREE.IcosahedronGeometry(1, 1), 0x2a0a10, { em: 0xff2040, ei: 1.4, y: 0.6, sx: 0.4, sy: 0.4, sz: 0.4, rough: 0.2, metal: 0.6 });
  e.eye = mk(e, sph, 0xffffff, { em: 0xffffff, ei: 3, y: 0.6, x: 0.26, sx: 0.12, sy: 0.12, sz: 0.12 });
  e.r1 = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 6, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4d6d).multiplyScalar(2), toneMapped: false }));
  e.r2 = e.r1.clone(); e.r1.position.y = e.r2.position.y = 0.6; g.add(e.r1, e.r2);
  e.bits = [];
  for (let i = 0; i < 4; i++) { const b = mk(e, box, 0x1a0508, { em: RED, ei: 1.2, sx: 0.12, sy: 0.12, sz: 0.12, y: 0.6 }); b.userData.ph = i * 1.57; e.bits.push(b); }
  return e;
}
function buildBrute(x, y, o) {
  const e = base('brute', x, y, { name: 'Legacy Bot', w: 1.9, h: 3.0, hp: 150, hpMax: 150, poise: 75, poiseMax: 75, xp: 45, commits: 10, heavy: true, speed: 2.1, staggerTime: 1.2, color: 0xff7b72, heart: 0.35, kbMul: 0.6, ...o });
  const g = e.group;
  e.torso = pivot(g, 0, 1.7, 0);
  mk(e, box, 0x4d5866, { sx: 1.5, sy: 1.5, sz: 1.1, parent: e.torso, metal: 0.7, rough: 0.35 });
  mk(e, box, RED, { em: RED, ei: 1.6, y: 0.1, x: 0.76, sx: 0.04, sy: 1.0, sz: 0.8, parent: e.torso });
  mk(e, box, RED, { em: RED, ei: 1, y: -0.2, sx: 1.55, sy: 0.07, sz: 1.15, parent: e.torso });
  e.head = pivot(e.torso, 0.15, 1.1, 0);
  mk(e, box, 0x38414d, { sx: 0.8, sy: 0.6, sz: 0.8, parent: e.head, metal: 0.7 });
  mk(e, box, 0xff3030, { em: 0xff3030, ei: 3, x: 0.41, y: 0.04, sx: 0.04, sy: 0.12, sz: 0.62, parent: e.head });
  e.armF = pivot(e.torso, 0, 0.5, 0.85); e.armB = pivot(e.torso, 0, 0.5, -0.85);
  for (const a of [e.armF, e.armB]) {
    mk(e, box, 0x4d5866, { sx: 0.5, sy: 1.1, sz: 0.5, y: -0.55, parent: a, metal: 0.7 });
    mk(e, box, 0x566272, { sx: 0.8, sy: 0.8, sz: 0.8, y: -1.3, parent: a, metal: 0.7 });
    mk(e, box, RED, { em: RED, ei: 1.4, sx: 0.84, sy: 0.08, sz: 0.84, y: -1.05, parent: a });
  }
  e.legF = pivot(g, 0, 1.0, 0.4); e.legB = pivot(g, 0, 1.0, -0.4);
  for (const l of [e.legF, e.legB]) mk(e, box, 0x38414d, { sx: 0.6, sy: 1.1, sz: 0.55, y: -0.5, parent: l, metal: 0.6 });
  return e;
}
function buildBoss(x, y) {
  const e = base('boss', x, y, { name: 'THE LEGACY MONOLITH', w: 3.6, h: 6.2, hp: 1500, hpMax: 1500, poise: 220, poiseMax: 220, xp: 450, commits: 60, heavy: true, boss: true, color: 0xff4d4d, spawnT: 1.9, heart: 0, staggerTime: 2.4 });
  const g = e.group;
  e.torso = pivot(g, 0, 3.1, 0);
  mk(e, box, 0x333c48, { sx: 3.2, sy: 3.2, sz: 2.4, parent: e.torso, metal: 0.6, rough: 0.4 });
  for (let i = 0; i < 5; i++) mk(e, box, RED, { em: RED, ei: 1.3, y: -1.2 + i * 0.6, x: 1.62, sx: 0.04, sy: 0.08, sz: 1.8 - i * 0.2, parent: e.torso });
  mk(e, box, 0x464f5c, { sx: 3.5, sy: 0.4, sz: 2.6, y: 1.7, parent: e.torso, metal: 0.7 });
  e.head = pivot(e.torso, 0.2, 2.5, 0);
  mk(e, box, 0x38414d, { sx: 1.5, sy: 1.3, sz: 1.5, parent: e.head, metal: 0.6 });
  e.eyes = [mk(e, box, 0xff2020, { em: 0xff2020, ei: 3.5, x: 0.77, y: 0.15, z: 0.4, sx: 0.06, sy: 0.18, sz: 0.4, parent: e.head }), mk(e, box, 0xff2020, { em: 0xff2020, ei: 3.5, x: 0.77, y: 0.15, z: -0.4, sx: 0.06, sy: 0.18, sz: 0.4, parent: e.head })];
  // code-block crown
  e.crown = [];
  for (let i = 0; i < 9; i++) { const c = mk(e, box, 0x161b22, { em: i % 2 ? 0x39d353 : RED, ei: 1.3, sx: 0.28, sy: 0.28, sz: 0.28, parent: g }); c.userData.ph = i * 0.7; c.userData.r = 2.6 + (i % 3) * 0.5; e.crown.push(c); }
  e.legL = pivot(g, 0, 1.5, 0.7); e.legR = pivot(g, 0, 1.5, -0.7);
  for (const l of [e.legL, e.legR]) mk(e, box, 0x38414d, { sx: 1.1, sy: 1.6, sz: 0.9, y: -0.7, parent: l, metal: 0.6 });
  e.onStagger = () => { if (e.state !== 'stunned') { e.state = 'stunned'; e.st = 0; e.staggerTime = 2.4; e.vulnerable = 2.4; e.hitDone = false; e.tele = 0; sfx.bossRoar(); floatText(e.x, e.y + 7, 'BROKEN!', { color: '#ffd33d', size: 40 }); } };
  e.onDeath = () => { G.onBossDead?.(e); };
  // fists live in world space so they can slam anywhere
  e.fists = [];
  for (const z of [1.6, -1.6]) {
    const f = new THREE.Group();
    mk(e, box, 0x4d5866, { sx: 1.7, sy: 1.7, sz: 1.7, parent: f, metal: 0.7, rough: 0.35 });
    mk(e, box, RED, { em: RED, ei: 1.5, sx: 1.74, sy: 0.14, sz: 1.74, y: 0.5, parent: f });
    f.position.set(x, 4, z); scene.add(f);
    e.fists.push({ g: f, x, y: 4, z, tx: x, ty: 4, k: 10 });
  }
  return e;
}

// ----------------------------------------------------------------- spawn
export function spawnEnemy(type, x, yOff = 0, o = {}) {
  const gy = groundAt(x);
  const y = type === 'pointer' ? Math.max(gy, 0) + (yOff || 4) : gy;
  const e = ({ bug: buildBug, pointer: buildPointer, brute: buildBrute, boss: buildBoss }[type])(x, type === 'boss' ? 28 : y, o);
  e.homeY = y;
  G.enemies.push(e);
  if (type === 'boss') { G.boss = e; e.spawnT = 2.2; return e; }
  sfx.spawn();
  ring(x, y + e.h / 2, 0.3, 0x39d353, { r0: 0.2, r1: 2.2, dur: 0.5 });
  for (let i = 0; i < 18; i++) glow.emit(x + rand(-1.2, 1.2), y + rand(0, e.h + 0.5), rand(-0.5, 0.5), 0, rand(-1, 1), 0, rgb(Math.random() < 0.5 ? 0x39d353 : RED, 1.8), 0.28, 0, 0.7);
  return e;
}
export function clearEnemies(arenaOnly = false) {
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (arenaOnly && !e.arena) continue;
    removeEnemy(e); G.enemies.splice(i, 1);
  }
}
function removeEnemy(e) {
  scene.remove(e.group); scene.remove(e.bar);
  e.fists?.forEach((f) => scene.remove(f.g));
}

// ----------------------------------------------------------------- shared logic
const P = () => G.player;
function applyStatus(e, dt) {
  if (e.flash > 0) e.flash -= dt;
  if (e.hurtT > 0) e.hurtT -= dt;
  if (e.stun > 0) { e.stun -= dt; if (Math.random() < 0.3) glow.emit(e.x + rand(-0.5, 0.5), e.y + e.h + 0.2, 0, 0, 1, 0, rgb(0xffd33d, 1.6), 0.2, 0, 0.4); }
  if (e.chill > 0) { e.chill -= dt; if (Math.random() < 0.3) glow.emit(e.x + rand(-0.5, 0.5), e.y + rand(0, e.h), 0, 0, -1, 0, rgb(0x9fe8ff, 1.6), 0.2, 0, 0.5); }
  if (e.vulnerable > 0) e.vulnerable -= dt;
  if (e.stagger > 0) e.stagger -= dt;
  if (e.burn > 0) {
    e.burn -= dt; e.burnT -= dt;
    if (Math.random() < 0.6) glow.emit(e.x + rand(-0.4, 0.4), e.y + rand(0.2, e.h), rand(-0.3, 0.3), rand(-0.5, 0.5), rand(2, 4), 0, rgb(Math.random() < 0.5 ? 0xff6a2b : 0xffc233, 1.7), rand(0.3, 0.6), 0, 0.5, -2);
    if (e.burnT <= 0) {
      e.burnT = 0.5; const d = Math.round(e.burnDps * 0.5);
      e.hp -= d; e.flash = 0.06;
      floatText(e.x, e.y + e.h + 0.3, String(d), { color: '#ff9a4d', size: 15, dur: 0.6 });
      if (e.hp <= 0) killEnemy(e, {});
    }
  }
  if (e.poise < e.poiseMax && e.stagger <= 0) e.poise = Math.min(e.poiseMax, e.poise + (e.boss ? 14 : 6) * dt);
  if (e.lift > 0) e.lift -= dt;
}
function physics(e, dt, tm) {
  if (e.flying) {
    e.x += e.vx * dt; e.y += e.vy * dt;
    e.vx = damp(e.vx, 0, 2.5, dt); e.vy = damp(e.vy, 0, 2.5, dt);
    return;
  }
  e.vy -= (e.lift > 0 ? 8 : 40) * dt;
  const nx = e.x + e.vx * dt;
  // walls: don't walk off pits / up big steps (but knockback can still fling them)
  const here = groundAt(e.x), ahead = groundAt(nx);
  if (ahead > e.y + 0.6 && e.y - here < 0.2 && ahead > -20) { e.vx = 0; if (e.onGround && e.canHop) { e.vy = 10.5; } }
  else if (ahead < -20 && here > -20 && e.stagger <= 0 && Math.abs(e.vx) < 8) e.vx = 0;
  e.x = clamp(e.x + e.vx * dt, 1.5, L - 1.5);
  e.y += e.vy * dt;
  const gy = groundAt(e.x);
  e.onGround = false;
  if (e.y <= gy) {
    if (e.vy < -9 && gy > -20) { puff(e.x, gy + 0.1, 4, 0x8b949e, 0.7, 0.4); }
    e.y = gy; if (e.vy < 0) e.vy = 0; e.onGround = true;
  }
  if (e.onGround) e.vx = damp(e.vx, 0, e.stagger > 0 || e.stun > 0 ? 6 : 1.5, dt);
  if (e.y < -18) { e.hp = 0; e.dead = true; scene.remove(e.group); }
}
function steer(e, target, dt, tm) { e.vx = damp(e.vx, target * tm, 9, dt); }
function telegraph(e, secs) { e.tele = secs; e.teleMax = secs; sfx.telegraph(); }

// ----------------------------------------------------------------- per-type AI
function aiBug(e, dt, tm) {
  const p = P(), dx = p.x - e.x, ad = Math.abs(dx), dir = sign(dx);
  e.st += dt;
  if (e.state === 'idle' || e.state === 'chase') {
    e.state = 'chase'; e.facing = dir; e.canHop = true;
    steer(e, ad > 1.4 ? dir * e.speed : 0, dt, tm);
    e.cd -= dt * tm;
    if (ad < 2.2 && Math.abs(p.y - e.y) < 1.6 && e.cd <= 0 && !p.dead) { e.state = 'wind'; e.st = 0; telegraph(e, 0.42); e.vx = 0; }
  } else if (e.state === 'wind') {
    e.vx = damp(e.vx, 0, 12, dt); e.facing = dir;
    if (e.st * tm > 0.42) { e.state = 'lunge'; e.st = 0; e.vx = dir * 12; e.vy = 4.5; e.hitDone = false; e.canHop = false; }
  } else if (e.state === 'lunge') {
    if (!e.hitDone && Math.abs(p.x - e.x) < 0.95 && p.y < e.y + 1.4 && p.y + p.h > e.y && !p.dead) {
      e.hitDone = true; const r = damagePlayer(9, { x: e.x, y: e.y + 0.5, enemy: e, kind: 'melee' });
      if (r === 'parry' || r === 'blocked') { e.vx = -dir * 4; }
    }
    if (e.st > 0.32) { e.state = 'recover'; e.st = 0; }
  } else if (e.state === 'recover') {
    e.vx = damp(e.vx, 0, 8, dt);
    if (e.st > 0.7) { e.state = 'chase'; e.cd = rand(0.5, 1.3); }
  }
}
function aiPointer(e, dt, tm) {
  const p = P(), dx = p.x - e.x;
  e.st += dt;
  const side = e.side ?? (e.side = e.x < p.x ? -1 : 1);
  if (Math.abs(dx) < 4) e.side = -sign(dx) || 1;
  const tx = p.x + (e.side ?? side) * 9.5, ty = Math.max(groundAt(clamp(e.x, 2, L - 2)), groundAt(p.x), 0) + (e.hoverY || 4) + Math.sin(G.time * 1.6 + e.anim) * 0.35;
  e.facing = sign(dx);
  if (e.state === 'idle' || e.state === 'chase') {
    e.state = 'chase';
    e.vx = damp(e.vx, clamp((tx - e.x) * 1.3, -4.5, 4.5) * tm, 3, dt);
    e.vy = damp(e.vy, clamp((ty - e.y) * 2, -4, 4) * tm, 3, dt);
    e.cd -= dt * tm;
    if (e.cd <= 0 && Math.abs(dx) < 17 && !p.dead) { e.state = 'charge'; e.st = 0; telegraph(e, 0.7); }
  } else if (e.state === 'charge') {
    e.vx = damp(e.vx, 0, 5, dt); e.vy = damp(e.vy, 0, 5, dt);
    const k = e.st / 0.7;
    if (Math.random() < 0.7) { const a = rand(6.28), r = lerp(1.8, 0.3, k); glow.emit(e.x + Math.cos(a) * r, e.y + 0.6 + Math.sin(a) * r, 0, -Math.cos(a) * 3, -Math.sin(a) * 3, 0, rgb(0xff4d6d, 2), 0.25, 0, 0.3); }
    if (e.st * tm >= 0.7) {
      const ox = e.x + e.facing * 0.5, oy = e.y + 0.6, tx2 = p.x, ty2 = p.y + 1.1, l = Math.hypot(tx2 - ox, ty2 - oy) || 1;
      spawnProj({ x: ox, y: oy, vx: (tx2 - ox) / l * 11, vy: (ty2 - oy) / l * 11, r: 0.3, owner: 'enemy', color: 0xff4d6d, trailC: 0xff4d6d, dmg: 10, life: 4, src: e });
      sfx.shoot('fire'); sparks(ox, oy, 0xff4d6d, 10, 7);
      e.state = 'chase'; e.cd = rand(2, 3.2); e.vx -= e.facing * 2.5;
    }
  }
}
function aiBrute(e, dt, tm) {
  const p = P(), dx = p.x - e.x, ad = Math.abs(dx), dir = sign(dx);
  e.st += dt;
  if (e.state === 'idle' || e.state === 'chase') {
    e.state = 'chase'; e.facing = dir; e.canHop = false;
    steer(e, ad > 2.6 ? dir * e.speed : 0, dt, tm);
    e.cd -= dt * tm;
    if (ad < 3.4 && e.cd <= 0 && !p.dead && Math.abs(p.y - e.y) < 2.2) { e.state = 'wind'; e.st = 0; telegraph(e, 0.85); e.dirLock = dir; }
  } else if (e.state === 'wind') {
    e.vx = damp(e.vx, 0, 10, dt);
    if (e.st * tm > 0.5 && !e.tele2) { e.tele2 = true; sfx.telegraph(); }
    if (e.st * tm >= 0.85) {
      e.state = 'smash'; e.st = 0; e.tele2 = false;
      const fx = e.x + e.dirLock * 2.1;
      sfx.stomp(); shake(0.45); puff(fx, groundAt(fx) + 0.2, 8, 0x8b949e, 1.4, 0.7); cubes(fx, groundAt(fx) + 0.4, 0x4d5866, 8, 8, 0.3); ripple(fx, 1.8, RED, 14, 0.8);
      ring(fx, groundAt(fx) + 0.05, 0.5, RED, { r0: 0.3, r1: 3.4, dur: 0.4, flat: true }); flashLight(fx, groundAt(fx) + 1, 2, RED, 40, 0.3);
      if (Math.abs(p.x - fx) < 2.0 && p.y - groundAt(p.x) < 2.4 && !p.dead) damagePlayer(22, { x: e.x, y: p.y, enemy: e, kind: 'melee' });
      groundWave(fx, e.dirLock, { len: 6, speed: 12, dmg: 12, color: RED, owner: 'enemy', height: 1.1 });
    }
  } else if (e.state === 'smash') {
    if (e.st > 0.25) { e.state = 'recover'; e.st = 0; e.vulnerable = 1.4; }
  } else if (e.state === 'recover') {
    if (e.st * tm > 1.3) { e.state = 'chase'; e.cd = rand(1, 2); }
  }
}

// ----- boss
const BOSS_ATTACKS = ['slam', 'barrage', 'summon', 'slam', 'barrage'];
function aiBoss(e, dt, tm) {
  const p = P(), dx = p.x - e.x, ad = Math.abs(dx), dir = sign(dx);
  const rage = e.hp < e.hpMax * 0.5;
  if (rage && !e.rage) {
    e.rage = true; sfx.bossRoar(); shake(1); screenFlash(0xff4d4d, 0.4); punchFov(6); slowmo(0.35, 0.7);
    UI.banner('PHASE 2', 'SPAGHETTI MODE ENGAGED', '#ff7b72');
    ring(e.x, e.y + 3, 0.5, RED, { r0: 1, r1: 18, dur: 0.9, intensity: 2.5 });
    e.state = 'idle'; e.st = -1.2;
  }
  e.st += dt;
  e.facing = dir;
  const speed = rage ? 2.6 : 1.8;
  if (e.state === 'idle') {
    steer(e, ad > 7 ? dir * speed : ad < 3.5 ? -dir * speed * 0.7 : 0, dt, tm);
    e.cd -= dt * tm;
    if (e.cd <= 0 && e.st > 0 && !p.dead) {
      const list = rage ? [...BOSS_ATTACKS, 'rain', 'rain'] : BOSS_ATTACKS;
      let nxt; do { nxt = list[Math.floor(Math.random() * list.length)]; } while (nxt === e.last && list.length > 1);
      if (nxt === 'summon' && G.enemies.filter((x) => !x.boss && !x.dead).length > 3) nxt = 'barrage';
      e.last = nxt; e.state = nxt; e.st = 0; e.aStep = 0;
      if (nxt === 'slam') { e.slamX = p.x; telegraph(e, 1.0); }
      if (nxt === 'barrage') { telegraph(e, 0.9); }
    }
  } else if (e.state === 'slam') {
    e.vx = damp(e.vx, 0, 8, dt);
    const f = e.fists[0];
    const t = e.st * tm;
    if (t < 0.9) { e.slamX = lerp(e.slamX, p.x, Math.min(1, dt * 3)); f.tx = e.slamX; f.ty = groundAt(e.slamX) + 8; f.z = 0.4; f.k = 6; }
    else if (t < 1.0) { f.k = 40; f.ty = groundAt(e.slamX) + 0.9; }
    if (t >= 1.0 && !e.hitDone) {
      e.hitDone = true; const x = e.slamX, gy = groundAt(x);
      sfx.stomp(); sfx.quake(); shake(0.9); punchFov(4); post.aberr = 0.01;
      ring(x, gy + 0.05, 0.5, RED, { r0: 0.5, r1: 7, dur: 0.6, flat: true }); ring(x, gy + 1, 0.5, 0xffffff, { r0: 0.5, r1: 4, dur: 0.35 });
      puff(x, gy + 0.3, 14, 0x8b949e, 2, 1); cubes(x, gy + 1, 0x464f5c, 18, 11, 0.45); cubes(x, gy + 1, RED, 10, 9, 0.3, true); ripple(x, 3.4, RED, 18, 1.2); flashLight(x, gy + 1, 2, RED, 90, 0.5);
      if (Math.abs(p.x - x) < 2.4 && p.y - gy < 2.5 && !p.dead) damagePlayer(26, { x, y: p.y, enemy: e, kind: 'melee' });
      for (const d of [-1, 1]) groundWave(x, d, { len: rage ? 20 : 14, speed: rage ? 14 : 11, dmg: 15, color: RED, owner: 'enemy', height: 1.2 });
    }
    if (t > 1.9) { e.state = 'idle'; e.hitDone = false; e.cd = rage ? 0.8 : 1.5; e.st = 0; e.vulnerable = 1.6; f.k = 8; }
  } else if (e.state === 'barrage') {
    e.vx = damp(e.vx, 0, 8, dt);
    const t = e.st * tm, shots = rage ? 9 : 6;
    if (t < 0.9) { e.eyes.forEach((m) => { m.material.emissiveIntensity = 3 + Math.sin(t * 30) * 2; }); }
    else {
      const idx = Math.floor((t - 0.9) / 0.14);
      while (e.aStep <= idx && e.aStep < shots) {
        const ox = e.x + e.facing * 1.5, oy = e.y + 5.7, tx = p.x + rand(-2.5, 2.5), ty = p.y + 1 + rand(-0.5, 1.2), l = Math.hypot(tx - ox, ty - oy);
        spawnProj({ x: ox, y: oy, vx: (tx - ox) / l * (rage ? 12 : 10), vy: (ty - oy) / l * (rage ? 12 : 10), r: 0.4, owner: 'enemy', color: 0xff4d4d, trailC: 0xff7b72, dmg: 11, life: 4, src: e });
        sfx.shoot('fire'); sparks(ox, oy, 0xff7b72, 8, 7); shake(0.1); e.aStep++;
      }
      if (e.aStep >= shots && t > 0.9 + shots * 0.14 + 0.4) { e.state = 'idle'; e.cd = rage ? 0.7 : 1.4; e.st = 0; e.vulnerable = 1.4; }
    }
  } else if (e.state === 'summon') {
    e.vx = damp(e.vx, 0, 8, dt);
    const t = e.st * tm;
    if (t > 0.7 && !e.hitDone) {
      e.hitDone = true; sfx.bossRoar(); shake(0.5); ring(e.x, e.y + 4, 0.5, 0x39d353, { r0: 0.5, r1: 8, dur: 0.6 });
      for (let i = 0; i < (rage ? 4 : 3); i++) { const sx = clamp(p.x + (i - 1) * 6 + rand(-2, 2), 222, 262); const b = spawnEnemy('bug', sx, 0, { arena: 'boss' }); }
    }
    if (t > 1.6) { e.state = 'idle'; e.hitDone = false; e.cd = 1.8; e.st = 0; e.vulnerable = 1.2; }
  } else if (e.state === 'rain') {
    const t = e.st * tm;
    if (!e.hitDone) {
      e.hitDone = true; sfx.telegraph(); e.marks = [];
      const n = 6;
      for (let i = 0; i < n; i++) {
        const mx = clamp(p.x + (i - (n - 1) / 2) * 4 + rand(-1.2, 1.2), 220, 263);
        e.marks.push({ x: mx, t: 0.9 + i * 0.12 });
        ring(mx, groundAt(mx) + 0.06, 0.5, RED, { r0: 1.7, r1: 1.7, dur: 0.9 + i * 0.12, flat: true, intensity: 1.4 });
      }
    }
    for (const m of e.marks) if (!m.done && t >= m.t) {
      m.done = true; const gy = groundAt(m.x);
      sfx.explosion(0.5); shake(0.25); cubes(m.x, gy + 1, RED, 6, 7, 0.4, true); cubes(m.x, gy + 1, 0x464f5c, 8, 8, 0.4); puff(m.x, gy + 0.3, 5, 0x8b949e, 1.3, 0.6); ripple(m.x, 1.6, RED, 14, 0.7);
      ring(m.x, gy + 0.5, 0.5, RED, { r0: 0.3, r1: 3, dur: 0.35 }); flashLight(m.x, gy + 1, 2, RED, 50, 0.3);
      for (let j = 0; j < 8; j++) glow.emit(m.x + rand(-0.8, 0.8), gy + rand(0, 14), 0, 0, -rand(10, 20), 0, rgb(RED, 1.8), 0.3, 0.1, 0.4);
      if (Math.abs(p.x - m.x) < 1.8 && p.y - gy < 4 && !p.dead) damagePlayer(18, { x: m.x, y: p.y, enemy: e, kind: 'melee' });
    }
    if (t > 2.4) { e.state = 'idle'; e.hitDone = false; e.cd = 1.2; e.st = 0; e.vulnerable = 1.2; }
  } else if (e.state === 'stunned') {
    e.vx = damp(e.vx, 0, 8, dt);
    if (e.st > e.staggerTime) { e.state = 'idle'; e.cd = 1.0; e.st = 0; e.fists.forEach((f) => (f.k = 8)); }
  }
  if (e.state !== 'slam') { // idle fists follow the body
    e.fists.forEach((f, i) => { f.tx = e.x + e.facing * (2.6 + i * 0.4); f.ty = e.y + 3.3 + Math.sin(G.time * 1.5 + i * 2) * 0.35; f.z = i ? -1.9 : 1.9; f.k = 6; });
    e.fists[1].tx = e.x - e.facing * 2.4;
  } else e.fists[1].tx = e.x - e.facing * 2.4, e.fists[1].ty = e.y + 3.3, e.fists[1].z = -1.9;
  // contact push
  if (!p.dead && Math.abs(p.x - e.x) < 2.2 && p.y < e.y + 5) damagePlayer(10, { x: e.x, y: p.y, enemy: e, kind: 'melee' });
}

// ----------------------------------------------------------------- animation
function animate(e, dt, tm) {
  const t = G.time, g = e.group;
  // facing
  const ry = e.facing > 0 ? 0 : Math.PI;
  let cur = g.rotation.y; let d = ry - cur; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
  g.rotation.y = cur + d * (1 - Math.exp(-14 * dt));
  g.position.set(e.x, e.y, 0);
  // telegraph pulse
  if (e.tele > 0) e.tele -= dt;
  const tele = e.tele > 0 ? (0.5 + 0.5 * Math.sin(t * 35)) : 0;
  for (const m of e.mats) {
    const b = m.userData.base;
    if (e.flash > 0) { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 1.8; }
    else if (tele) { m.emissive.setHex(0xff2020); m.emissiveIntensity = tele * 1.5 + (b.ei || 0) * 0.5; }
    else { m.emissive.setHex(b.em); m.emissiveIntensity = b.ei * (e.chill > 0 ? 0.5 : 1); }
    if (e.chill > 0 && !e.flash && !tele) { m.emissive.lerp(ICE, 0.5); m.emissiveIntensity = Math.max(m.emissiveIntensity, 0.5); }
  }
  const spd = Math.abs(e.vx);
  if (e.type === 'bug') {
    e.anim += dt * (4 + spd * 2) * tm;
    e.legs.forEach((l) => { l.rotation.z = Math.sin(e.anim * 2 + l.userData.ph) * 0.6; l.rotation.x = l.userData.side * (0.6 + Math.cos(e.anim * 2 + l.userData.ph) * 0.2); });
    const wind = e.state === 'wind' ? Math.min(1, e.st / 0.4) : 0;
    e.body.rotation.z = lerp(e.body.rotation.z, wind * 0.6 - (e.state === 'lunge' ? 0.3 : 0), 1 - Math.exp(-18 * dt));
    e.body.position.y = 0.5 + Math.abs(Math.sin(e.anim * 2)) * 0.06 + wind * 0.15;
    e.ant.rotation.z = Math.sin(t * 6 + e.anim) * 0.2 - 0.3;
  } else if (e.type === 'pointer') {
    e.r1.rotation.x += dt * 2; e.r1.rotation.y += dt * 1.3; e.r2.rotation.z += dt * 2.2; e.r2.rotation.y -= dt;
    e.bits.forEach((b, i) => { const a = t * 2 + b.userData.ph; b.position.set(Math.cos(a) * 0.75, 0.6 + Math.sin(a * 1.3) * 0.2, Math.sin(a) * 0.75); b.rotation.x += dt * 3; });
    const s = e.state === 'charge' ? 1 + (e.st / 0.7) * 0.5 : 1;
    e.core.scale.setScalar(0.4 * s + Math.sin(t * 8) * 0.02); e.core.rotation.y += dt * 2;
    e.group.rotation.y = 0;
    e.eye.position.x = 0.26 * e.facing;
  } else if (e.type === 'brute') {
    e.anim += dt * (2 + spd * 1.5) * tm;
    const w = Math.sin(e.anim * 2);
    e.legF.rotation.z = w * 0.5 * Math.min(1, spd); e.legB.rotation.z = -w * 0.5 * Math.min(1, spd);
    e.torso.position.y = 1.7 + Math.abs(w) * 0.05;
    let arm = w * 0.4 * Math.min(1, spd), bend = 0;
    if (e.state === 'wind') { const k = Math.min(1, e.st / 0.5); arm = lerp(0, -2.7, easeOut(k)); e.torso.rotation.z = -0.15 * k; }
    else if (e.state === 'smash') { arm = lerp(-2.7, 1.2, Math.min(1, e.st / 0.1)); e.torso.rotation.z = 0.2; }
    else { e.torso.rotation.z = damp(e.torso.rotation.z, e.stagger > 0 ? -0.3 : 0, 10, dt); if (e.state === 'recover') arm = 0.9; }
    e.armF.rotation.z = damp(e.armF.rotation.z, -arm, 18, dt); e.armB.rotation.z = damp(e.armB.rotation.z, arm * 0.6 + w * 0.2, 12, dt);
    e.head.rotation.z = Math.sin(t * 2) * 0.03;
  } else if (e.type === 'boss') {
    e.torso.position.y = 3.1 + Math.sin(t * 1.2) * 0.08;
    e.head.rotation.z = Math.sin(t * 0.8) * 0.04 + (e.state === 'stunned' ? -0.4 : 0);
    e.legL.rotation.z = Math.sin(t * 1.5) * 0.04 * Math.min(1, spd); e.legR.rotation.z = -e.legL.rotation.z;
    e.eyes.forEach((m) => { if (e.state !== 'barrage') m.material.emissiveIntensity = (e.rage ? 5 : 3.5) + Math.sin(t * 4) * 0.5; });
    e.crown.forEach((c) => { const a = t * (e.rage ? 1.4 : 0.8) + c.userData.ph; c.position.set(Math.cos(a) * c.userData.r, 6.4 + Math.sin(a * 1.7) * 0.7, Math.sin(a) * c.userData.r); c.rotation.x += dt; c.rotation.y += dt * 1.3; });
    for (const f of e.fists) {
      f.x = damp(f.x, f.tx, f.k, dt); f.y = damp(f.y, f.ty, f.k, dt);
      f.g.position.set(f.x, f.y, f.z); f.g.rotation.z = Math.sin(t * 2) * 0.05;
    }
    if (e.state === 'slam' && e.st < 0.9) { const k = e.st / 0.9; ring(e.slamX, groundAt(e.slamX) + 0.07, 0.4, RED, { r0: lerp(3, 2.2, k), r1: lerp(3, 2.2, k), dur: 0.05, flat: true, intensity: 1.6 }); }
  }
  // hp bar
  const showBar = !e.boss && e.hurtT > 0 && !e.dead;
  e.bar.visible = showBar;
  if (showBar) {
    const w = Math.max(1.2, e.w), k = clamp(e.hp / e.hpMax, 0, 1);
    e.bar.position.set(e.x, e.y + e.h + 0.35, 1);
    e.barBg.scale.set(w + 0.06, 0.16, 1); e.barFg.scale.set(w * k, 0.1, 1); e.barFg.position.x = -w * (1 - k) / 2; e.barFg.position.z = 0.01;
    e.barFg.material.color.setHex(k > 0.5 ? 0x7ee787 : k > 0.25 ? 0xffd33d : 0xff6b6b);
  }
}

// ----------------------------------------------------------------- update
export function updateEnemies(dt) {
  const p = P();
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (e.dead) { removeEnemy(e); G.enemies.splice(i, 1); if (G.boss === e) G.boss = null; continue; }
    const tm = e.chill > 0 ? 0.55 : 1;
    // spawn glitch
    if (e.spawnT > 0) {
      e.spawnT -= dt;
      if (e.boss) { // drop-in intro
        e.vy -= 55 * dt; e.y += e.vy * dt;
        const gy = groundAt(e.x);
        if (e.y <= gy) {
          e.y = gy; if (e.vy < -5 && !e.landed) { e.landed = true; sfx.bossRoar(); sfx.stomp(); shake(1); punchFov(8); post.aberr = 0.02; ring(e.x, gy + 0.1, 0.5, RED, { r0: 1, r1: 24, dur: 1, flat: true, intensity: 2.5 }); ring(e.x, gy + 3, 0.5, 0xffffff, { r0: 1, r1: 14, dur: 0.6 }); puff(e.x, gy + 0.3, 24, 0x8b949e, 3, 1.5, 6); cubes(e.x, gy + 1, 0x464f5c, 30, 14, 0.5); ripple(e.x, 4, RED, 22, 1.6); screenFlash(0xff4d4d, 0.3); UI.banner('THE LEGACY MONOLITH', '2,000,000 lines · 0 tests · no docs', '#ff7b72'); }
          e.vy = 0;
        }
        animate(e, dt, 1);
        if (e.spawnT <= 0) { e.state = 'idle'; e.cd = 1.2; e.st = 0; UI.bossBar(e); }
        continue;
      }
      const k = 1 - Math.max(0, e.spawnT) / 0.7;
      e.group.visible = Math.random() < 0.3 + k * 0.7;
      e.group.scale.set(1 + (1 - k) * rand(-0.2, 0.4), 1, 1);
      if (e.spawnT <= 0) { e.group.visible = true; e.group.scale.set(1, 1, 1); }
      animate(e, dt, 1); continue;
    }
    applyStatus(e, dt);
    if (e.dead) continue;
    const busy = e.stagger > 0 || e.stun > 0;
    if (busy && e.state !== 'stunned' && !e.boss) { if (e.state !== 'recover') { e.state = 'idle'; e.cd = Math.max(e.cd, 0.4); } e.tele = 0; }
    if (!busy && !p.dead) {
      ({ bug: aiBug, pointer: aiPointer, brute: aiBrute, boss: aiBoss }[e.type])(e, dt, tm);
    } else if (!busy && p.dead) e.vx = damp(e.vx, 0, 5, dt);
    physics(e, dt, tm);
    animate(e, dt, tm);
    if (e.boss) UI.bossBar(e);
  }
}

