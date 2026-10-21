import * as THREE from 'three';
import { G } from './state.js';
import { scene, glow, dust, sparks, puff, cubes, rgb, ring, flashLight, floatText, shake, punchFov, screenFlash, post, addFx } from './engine.js';
import { groundAt, ripple, worldLen } from './world.js';
import { toonMaterial, addOutline, outlineHard } from './toon.js';
import { Q, impactFlash, decal, shockwave, cam } from './engine.js';
import { emit } from './events.js';
import { sfx } from './audio.js';
import { damagePlayer, spawnProj, killEnemy, hitstop, slowmo, later, fb } from './combat.js';
import { groundWave } from './elements.js';
import * as UI from './ui.js';
import { clamp, damp, rand, lerp, sign, easeOut } from './util.js';

const RED = 0xf85149;
const ICE = new THREE.Color(0x4db8ff);
const box = new THREE.BoxGeometry(1, 1, 1), sph = new THREE.SphereGeometry(1, 16, 12), cyl = new THREE.CylinderGeometry(1, 1, 1, 8);
const barGeo = new THREE.PlaneGeometry(1, 1);

function mk(e, geo, color, { em = 0, ei = 0, rough = 0.5, metal = 0.3, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, parent } = {}) {
  const mat = toonMaterial({ color, emissive: em, emissiveIntensity: ei, rim: 0xff7b72, rimK: 0.3 });
  mat.userData.base = { em, ei };
  e.mats.push(mat);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true;
  (parent || e.group).add(m);
  if (Q.outlines && Math.min(sx, sy, sz) > 0.045 && geo !== cyl) addOutline(m, outlineHard);
  return m;
}
function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

function base(type, x, y, o) {
  const e = {
    type, x, y, vx: 0, vy: 0, w: 1, h: 1, hp: 30, hpMax: 30, poise: 20, poiseMax: 20, stagger: 0, staggerTime: 0.45, stun: 0, chill: 0, burn: 0, burnDps: 0, burnT: 0,
    vulnerable: 0, flash: 0, hurtT: 0, dead: false, spawnT: 0.7, facing: -1, state: 'idle', st: 0, cd: rand(0.3, 1), color: RED, xp: 10, commits: 3, heart: 0.1,
    heavy: false, flying: false, boss: false, mats: [], group: new THREE.Group(), lift: 0, kbMul: 1, anim: rand(6),
    air: false, juggle: 0, bounced: false, spiked: false, downT: 0, getUp: 0, airT: 0, maxH: 0, recoil: 0, kdir: 1, tiltZ: 0, stunBuild: 0, ...o,
  };
  e.group.rotation.order = 'ZYX'; e.group.position.set(x, y, 0); scene.add(e.group);
  e.parried = () => {
    e.tele = 0;
    if (e.boss) {
      // parry-lock fix: a parry breaks the boss once, then it resists for 8 s (further parries only chip its poise)
      if (e.parryImmune > 0) { e.poise = Math.max(0, e.poise - e.poiseMax * 0.35); floatText(e.x, e.y + 7, 'GUARDED', { color: '#9fd0ff', size: 22 }); if (e.poise <= 0) e.onStagger?.(); return; }
      e.parryImmune = 8; e.shield = false; e.state = 'stunned'; e.st = 0; e.staggerTime = 2.2; e.vulnerable = 2.4; e.hitDone = false; floatText(e.x, e.y + 7, 'BROKEN!', { color: '#ffd33d', size: 40 });
    }
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
  const e = base('bug', x, y, { name: 'Bug', w: 1.15, h: 0.95, hp: 22, hpMax: 22, poise: 16, poiseMax: 16, xp: 12, commits: 3, speed: 3.6, ...o });
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
function buildDummy(x, y, o) {
  const e = base('dummy', x, y, { name: 'Training Dummy', w: 1.1, h: 2.2, hp: 99999, hpMax: 99999, poise: 1e9, poiseMax: 1e9, xp: 0, commits: 0, heart: 0, dummy: true, color: 0xd9b36b, home: x, ...o });
  const g = e.group;
  e.torso = pivot(g, 0, 1.0, 0);
  mk(e, cyl, 0x5a4630, { sx: 0.09, sy: 1.05, sz: 0.09, y: -0.5, parent: e.torso });
  mk(e, new THREE.CylinderGeometry(0.5, 0.42, 1.0, 12), 0xd9b36b, { y: 0.45, parent: e.torso, em: 0x2a1c08, ei: 0.3 });
  mk(e, new THREE.CylinderGeometry(0.52, 0.52, 0.06, 16), 0xb0392f, { y: 0.55, parent: e.torso, em: 0xb0392f, ei: 0.5 });
  mk(e, new THREE.CylinderGeometry(0.52, 0.52, 0.06, 16), 0xb0392f, { y: 0.2, parent: e.torso, em: 0xb0392f, ei: 0.5 });
  e.head = pivot(e.torso, 0, 1.2, 0);
  mk(e, sph, 0xe6c88a, { sx: 0.33, sy: 0.33, sz: 0.33, parent: e.head, em: 0x2a1c08, ei: 0.3 });
  mk(e, box, 0xb0392f, { x: 0.3, y: 0.02, sx: 0.04, sy: 0.12, sz: 0.4, parent: e.head, em: 0xb0392f, ei: 0.8 });
  e.armF = pivot(e.torso, 0, 0.75, 0.55); e.armB = pivot(e.torso, 0, 0.75, -0.55);
  for (const a of [e.armF, e.armB]) mk(e, cyl, 0x5a4630, { sx: 0.07, sy: 0.6, sz: 0.07, y: -0.2, parent: a });
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
  e.shieldM = new THREE.Mesh(new THREE.SphereGeometry(3.7, 18, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6bd1ff).multiplyScalar(1.4), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  e.shieldM.position.y = 3.2; e.shieldM.visible = false; g.add(e.shieldM);
  // a poise break stuns it ONCE per window (breakCd) and drops the phase-2 shield
  e.onStagger = () => {
    if (e.state === 'stunned' || e.breakCd > 0) return;
    e.state = 'stunned'; e.st = 0; e.staggerTime = 2.4; e.vulnerable = 2.4; e.hitDone = false; e.tele = 0; e.breakCd = 6;
    if (e.shield) { e.shield = false; sparks(e.x, e.y + 3, 0x6bd1ff, 30, 12, 0.3, 0.6); ring(e.x, e.y + 3, 0.5, 0x6bd1ff, { r0: 1, r1: 9, dur: 0.5 }); }
    sfx.bossRoar(); floatText(e.x, e.y + 7, 'BROKEN!', { color: '#ffd33d', size: 40 });
  };
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
  const e = ({ bug: buildBug, pointer: buildPointer, brute: buildBrute, boss: buildBoss, dummy: buildDummy }[type])(x, type === 'boss' ? 28 : y, o);
  e.homeY = y;
  G.enemies.push(e);
  if (type === 'boss') { G.boss = e; e.spawnT = 2.2; return e; }
  sfx.spawn();
  ring(x, y + e.h / 2, 0.3, 0x39d353, { r0: 0.2, r1: 2.2, dur: 0.5 });
  for (let i = 0; i < 18; i++) glow.emit(x + rand(-1.2, 1.2), y + rand(0, e.h + 0.5), rand(-0.5, 0.5), 0, rand(-1, 1), 0, rgb(Math.random() < 0.5 ? 0x39d353 : RED, 1.8), 0.28, 0, 0.7);
  return e;
}
export function clearEnemies(arenaOnly = false) {
  resetDirector();
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
  if (e.armorT > 0) e.armorT -= dt;
  if (e.parryImmune > 0) e.parryImmune -= dt;
  if (e.breakCd > 0) e.breakCd -= dt;
}
function physics(e, dt, tm) {
  if (e.flying) {
    e.x += e.vx * dt; e.y += e.vy * dt;
    e.vx = damp(e.vx, 0, 2.5, dt); e.vy = damp(e.vy, 0, 2.5, dt);
    return;
  }
  // airborne (launched / juggled / spiked): floaty on the way up, heavy when spiked
  const g = e.air ? (e.spiked ? 70 : 26 + e.juggle * 4) : (e.lift > 0 ? 8 : 40);
  e.vy -= g * dt;
  if (e.air) { e.airT += dt; e.maxH = Math.max(e.maxH, e.y - groundAt(e.x)); }
  const nx = e.x + e.vx * dt;
  // walls: don't walk off pits / up big steps (but knockback can still fling them)
  const here = groundAt(e.x), ahead = groundAt(nx);
  if (ahead > e.y + 0.6 && e.y - here < 0.2 && ahead > -20) { e.vx = 0; if (e.onGround && e.canHop) { e.vy = 10.5; } }
  else if (ahead < -20 && here > -20 && e.stagger <= 0 && !e.air && Math.abs(e.vx) < 8) e.vx = 0;
  e.x = clamp(e.x + e.vx * dt, 1.5, worldLen() - 1.5);
  e.y += e.vy * dt;
  const gy = groundAt(e.x);
  e.onGround = false;
  if (e.y <= gy) {
    const hardHit = e.vy < -9 && gy > -20;
    if (hardHit) { puff(e.x, gy + 0.1, 4, 0x8b949e, 0.7, 0.4); }
    e.y = gy;
    if (e.air && e.spiked && !e.bounced && hardHit) { // ground bounce, once
      e.bounced = true; e.spiked = false; e.vy = 10.5; e.vx *= 0.4; e.juggle = Math.max(e.juggle, 2);
      impactFlash(e.x, gy + 0.3, 0xffd9a0, 3.4); decal('crack', e.x, gy, 3.2, 4, 0xffffff);
      ring(e.x, gy + 0.06, 0.45, 0xe8d2a0, { r0: 0.3, r1: 3.2, dur: 0.4, flat: true }); puff(e.x, gy + 0.2, 8, 0x8b949e, 1.3, 0.7); ripple(e.x, 1.6, 0xe8d2a0, 12, 0.8);
      fb('bounce'); sfx.bounce(); shockwave(e.x, gy + 0.3, 0.02, 0.4, 0.3);
      emit('bounce', { e });
      return;
    }
    if (e.vy < 0) e.vy = 0;
    e.onGround = true;
    if (e.air) { // touch down: knockdown, then get up
      e.air = false; e.spiked = false; e.downT = e.heavy ? 0.6 : 0.8; e.getUp = 0; e.stagger = 0;
      emit('land', { e, t: e.airT, h: e.maxH, juggle: e.juggle });
      e.juggle = 0; puff(e.x, gy + 0.1, 5, 0x8b949e, 0.9, 0.5);
    }
  }
  if (e.onGround) e.vx = damp(e.vx, 0, e.stagger > 0 || e.stun > 0 || e.downT > 0 ? 6 : 1.5, dt);
  if (e.y < -18) { e.hp = 0; e.dead = true; scene.remove(e.group); }
}
function steer(e, target, dt, tm) { e.vx = damp(e.vx, target * tm, 9, dt); }
function telegraph(e, secs, kind) { e.tele = secs; e.teleMax = secs; sfx.telegraph(kind ?? e.type); }

// ----------------------------------------------------------------- encounter director
// Attack tokens: only ONE melee, ONE ranged and ONE heavy attacker at a time, with a pacing gap between attack starts.
// Enemies without a token circle at a ring distance instead of queuing up on top of you. Nobody starts an attack from
// off-screen, or while the player is still reeling from a hit (research: Arkham / Doom / DmC pacing, ~1 attack per 1-2 s overall).
const TOKENS = { melee: 1, ranged: 1, heavy: 1 }, PACE = { melee: 0.85, ranged: 1.4, heavy: 1.6 };
const held = { melee: new Map(), ranged: new Map(), heavy: new Map() }; // enemy -> time it took the token
const lastStart = { melee: -9, ranged: -9, heavy: -9 };
const kindOf = (e) => (e.type === 'pointer' ? 'ranged' : e.type === 'brute' ? 'heavy' : 'melee');
const onScreen = (e) => Math.abs(e.x - cam.x) < 8.4;
function canAttack(e) { const p = P(); return onScreen(e) && !p.dead && p.stun <= 0 && p.hurtI < 0.35; }
function takeToken(e) {
  const k = kindOf(e), h = held[k];
  if (h.has(e)) return true;
  if (!canAttack(e) || h.size >= TOKENS[k] || G.time - lastStart[k] < PACE[k]) return false;
  h.set(e, G.time); lastStart[k] = G.time; return true;
}
function giveToken(e) { held[kindOf(e)].delete(e); }
function sweepTokens() { for (const k in held) for (const [e, t] of held[k]) if (e.dead || !G.enemies.includes(e) || G.time - t > 5) held[k].delete(e); }
export function resetDirector() { for (const k in held) held[k].clear(); }
export const directorState = () => ({ melee: held.melee.size, ranged: held.ranged.size, heavy: held.heavy.size });

// ----------------------------------------------------------------- per-type AI
// BUG: a light flanker. It circles at a ring distance, then commits to a readable lunge (0.5 s crouch + chitter) or, when
// there are several, a pounce that arcs over you and lands behind. A whiffed attack leaves it vulnerable for 0.8 s.
function aiBug(e, dt, tm) {
  const p = P(), dx = p.x - e.x, ad = Math.abs(dx), dir = sign(dx);
  e.st += dt;
  if (e.ring === undefined) { e.ring = rand(2.8, 4.4); e.orbit = Math.random() < 0.5 ? 1 : -1; }
  if (e.state === 'idle' || e.state === 'chase') {
    e.state = 'chase'; e.facing = dir; e.canHop = true;
    let sep = 0; // separation, so a group never collapses into one red blob
    for (const o of G.enemies) if (o !== e && o.type === 'bug' && !o.dead) { const d = e.x - o.x; if (Math.abs(d) < 1.3) sep += sign(d || 0.01) * (1.3 - Math.abs(d)); }
    const want = ad > e.ring + 0.4 ? dir * e.speed : ad < e.ring - 0.6 ? -dir * e.speed * 0.5 : -dir * e.orbit * e.speed * 0.25;
    steer(e, want + sep * 2.2, dt, tm);
    e.cd -= dt * tm;
    if (e.cd <= 0 && ad < 6 && Math.abs(p.y - e.y) < 1.8 && takeToken(e)) {
      const bugs = G.enemies.filter((x) => x.type === 'bug' && !x.dead).length;
      e.attack = bugs > 1 && ad > 2 && Math.random() < 0.4 ? 'pounce' : 'lunge';
      e.state = 'wind'; e.st = 0; e.vx = 0; e.dirLock = dir; telegraph(e, e.attack === 'pounce' ? 0.6 : 0.5);
    }
  } else if (e.state === 'wind') {
    e.vx = damp(e.vx, 0, 12, dt); e.facing = e.dirLock;
    if (e.st * tm > (e.attack === 'pounce' ? 0.6 : 0.5)) {
      e.state = 'lunge'; e.st = 0; e.hitDone = false; e.canHop = false;
      if (e.attack === 'pounce') { e.vx = e.dirLock * Math.min(11, Math.abs(p.x - e.x) * 1.7 + 4); e.vy = 9; } else { e.vx = e.dirLock * 12; e.vy = 4.5; }
    }
  } else if (e.state === 'lunge') {
    if (!e.hitDone && Math.abs(p.x - e.x) < 0.95 && p.y < e.y + 1.4 && p.y + p.h > e.y && !p.dead) {
      e.hitDone = true; const r = damagePlayer(9, { x: e.x, y: e.y + 0.5, enemy: e, kind: 'melee' });
      if (r === 'parry' || r === 'blocked') e.vx = -e.dirLock * 4;
    }
    if (e.st > (e.attack === 'pounce' ? 0.7 : 0.34) && (e.onGround || e.st > 1.0)) { e.state = 'recover'; e.st = 0; e.vulnerable = Math.max(e.vulnerable, 0.8); giveToken(e); }
  } else if (e.state === 'recover') {
    e.vx = damp(e.vx, 0, 8, dt);
    if (e.st > 0.8) { e.state = 'chase'; e.cd = rand(0.8, 1.8); }
  }
}
// NULL POINTER: an artillery sniper. 0.9 s charge with converging particles and a dotted aim line that locks 0.25 s before
// the shot; the orb leads you slightly, travels at 9 u/s, and there are never more than 2 enemy orbs alive.
function aiPointer(e, dt, tm) {
  const p = P(), dx = p.x - e.x, ad = Math.abs(dx);
  e.st += dt;
  if (e.side === undefined) e.side = e.x < p.x ? -1 : 1;
  if (ad < 3.2) e.side = -sign(dx) || 1; // too close: retreat to the other side rather than flying through you
  const tx = p.x + e.side * 5.8, ty = Math.max(groundAt(clamp(e.x, 2, worldLen() - 2)), groundAt(p.x), 0) + (e.hoverY || 3.6) + Math.sin(G.time * 1.6 + e.anim) * 0.35;
  e.facing = sign(dx);
  if (e.state === 'idle' || e.state === 'chase') {
    e.state = 'chase';
    e.vx = damp(e.vx, clamp((tx - e.x) * 1.3, -4.5, 4.5) * tm, 3, dt);
    e.vy = damp(e.vy, clamp((ty - e.y) * 2, -4, 4) * tm, 3, dt);
    e.cd -= dt * tm;
    const orbs = G.projectiles.filter((q) => q.owner === 'enemy' && !q.dead).length;
    if (e.cd <= 0 && ad < 12 && orbs < 2 && takeToken(e)) { e.state = 'charge'; e.st = 0; telegraph(e, 0.9); }
  } else if (e.state === 'charge') {
    e.vx = damp(e.vx, 0, 5, dt); e.vy = damp(e.vy, 0, 5, dt);
    const k = e.st / 0.9, ox = e.x + e.facing * 0.5, oy = e.y + 0.6;
    if (Math.random() < 0.7) { const a = rand(6.28), r = lerp(1.8, 0.3, k); glow.emit(e.x + Math.cos(a) * r, e.y + 0.6 + Math.sin(a) * r, 0, -Math.cos(a) * 3, -Math.sin(a) * 3, 0, rgb(0xb26bff, 2), 0.25, 0, 0.3); }
    if (e.st * tm < 0.65) { e.aimX = p.x + p.vx * 0.3; e.aimY = p.y + 1.1; } // tracks, then locks: a dodgeable, readable shot
    const l = Math.hypot(e.aimX - ox, e.aimY - oy) || 1, ux = (e.aimX - ox) / l, uy = (e.aimY - oy) / l;
    for (let i = 1; i <= 7; i++) glow.emit(ox + ux * i * 1.4, oy + uy * i * 1.4, 0.2, 0, 0, 0, rgb(0xb26bff, e.st * tm < 0.65 ? 1.0 : 2.0), 0.16, 0.06, 0.06); // the aim line
    if (e.st * tm >= 0.9) {
      spawnProj({ x: ox, y: oy, vx: ux * 9, vy: uy * 9, r: 0.3, owner: 'enemy', color: 0xb26bff, trailC: 0xd7a8ff, dmg: 10, life: 4.5, src: e });
      sfx.enemyShoot('pointer'); sparks(ox, oy, 0xb26bff, 10, 7);
      e.state = 'chase'; e.cd = rand(2.4, 3.6); e.vx -= e.facing * 2.5; giveToken(e);
    }
  }
}
// LEGACY BOT: an armoured bruiser. 1.0 s wind-up with a red danger zone on the floor and hyper-armour (light hits do not
// interrupt it; a parry, a slam or a poise break does). Smash + ground wave are ONE parry-able attack. Then a 1.3 s vent
// where poise breaks 60 % faster. Launchable only when staggered.
function aiBrute(e, dt, tm) {
  const p = P(), dx = p.x - e.x, ad = Math.abs(dx), dir = sign(dx);
  e.st += dt;
  if (e.state === 'idle' || e.state === 'chase') {
    e.state = 'chase'; e.facing = dir; e.canHop = false;
    steer(e, ad > 2.6 ? dir * e.speed : 0, dt, tm);
    e.cd -= dt * tm;
    if (ad < 3.6 && e.cd <= 0 && Math.abs(p.y - e.y) < 2.2 && takeToken(e)) {
      e.state = 'wind'; e.st = 0; telegraph(e, 1.0); e.dirLock = dir; e.armorT = 1.0;
      const fx = e.x + dir * 2.1; ring(fx, groundAt(fx) + 0.06, 0.5, RED, { r0: 2.0, r1: 2.0, dur: 1.0, flat: true, intensity: 1.5 }); // smash zone
    }
  } else if (e.state === 'wind') {
    e.vx = damp(e.vx, 0, 10, dt);
    if (e.st * tm >= 1.0) {
      e.state = 'smash'; e.st = 0; e.armorT = 0;
      const fx = e.x + e.dirLock * 2.1;
      sfx.stomp(); shake(0.45); puff(fx, groundAt(fx) + 0.2, 8, 0x8b949e, 1.4, 0.7); cubes(fx, groundAt(fx) + 0.4, 0x4d5866, 8, 8, 0.3); ripple(fx, 1.8, RED, 14, 0.8);
      ring(fx, groundAt(fx) + 0.05, 0.5, RED, { r0: 0.3, r1: 3.4, dur: 0.4, flat: true }); flashLight(fx, groundAt(fx) + 1, 2, RED, 40, 0.3);
      if (Math.abs(p.x - fx) < 2.0 && p.y - groundAt(p.x) < 2.4 && !p.dead) damagePlayer(22, { x: e.x, y: p.y, enemy: e, kind: 'melee' });
      groundWave(fx, e.dirLock, { len: 6, speed: 12, dmg: 12, color: RED, owner: 'enemy', height: 1.1, src: e });
    }
  } else if (e.state === 'smash') {
    if (e.st > 0.25) { e.state = 'recover'; e.st = 0; e.vulnerable = 1.5; giveToken(e); }
  } else if (e.state === 'recover') {
    if (Math.random() < 0.5) glow.emit(e.x + rand(-0.6, 0.6), e.y + 3.0, rand(-0.3, 0.3), rand(-0.5, 0.5), rand(1.5, 3), 0, rgb(0xcfd8e3, 1.0), 0.5, 1.0, 0.7); // venting steam
    if (e.st * tm > 1.3) { e.state = 'chase'; e.cd = rand(1.4, 2.4); }
  }
}

function aiDummy(e, dt, tm) {
  const dx = e.home - e.x; e.idleT = (e.idleT || 0) + dt;
  if (e.idleT > 1.2 && Math.abs(dx) > 0.4) e.vx = damp(e.vx, Math.sign(dx) * 3.2, 8, dt); else if (Math.abs(dx) <= 0.4) e.vx = damp(e.vx, 0, 10, dt);
}

// ----- boss: fixed, learnable attack orders per phase (no pure randomness)
const BOSS_P1 = ['slam', 'barrage', 'slam', 'summon'];
const BOSS_P2 = ['sweep', 'slam2', 'barrage', 'rain', 'slam2', 'summon', 'sweep', 'rain'];
function bossRecover(e, vul, cd) { e.state = 'idle'; e.hitDone = false; e.st = 0; e.vulnerable = vul; e.cd = cd; e.fists.forEach((f) => (f.k = 8)); }
function aiBoss(e, dt, tm) {
  const p = P(), dx = p.x - e.x, ad = Math.abs(dx), dir = sign(dx);
  const rage = e.hp < e.hpMax * 0.5;
  if (rage && !e.rage) { // phase 2 is entered exactly once; any half-finished attack is cleanly abandoned
    e.rage = true; e.phase = 2; e.seq = 0; e.hitDone = false; e.marks = []; e.shield = true; e.poise = e.poiseMax; e.parryImmune = 0;
    sfx.bossRoar(); shake(1); screenFlash(0xff4d4d, 0.4); punchFov(6); slowmo(0.35, 0.7);
    UI.banner('PHASE 2', 'SHIELD UP: break its poise', '#ff7b72');
    ring(e.x, e.y + 3, 0.5, RED, { r0: 1, r1: 18, dur: 0.9, intensity: 2.5 });
    e.state = 'idle'; e.st = -1.4; e.cd = 0.4; e.fists.forEach((f) => (f.k = 8));
  }
  e.st += dt;
  e.facing = dir;
  const speed = rage ? 2.6 : 1.8, B0 = e.bx0 ?? 222, B1 = e.bx1 ?? 262;
  if (e.state === 'idle') {
    steer(e, ad > 7 ? dir * speed : ad < 3.5 ? -dir * speed * 0.7 : 0, dt, tm);
    e.cd -= dt * tm;
    if (e.cd <= 0 && e.st > 0 && !p.dead) {
      const list = rage ? BOSS_P2 : BOSS_P1;
      let nxt = list[(e.seq = (e.seq || 0) + 1) % list.length];
      if (nxt === 'summon' && G.enemies.filter((x) => !x.boss && !x.dead).length >= (rage ? 3 : 2)) nxt = 'barrage';
      e.last = nxt; e.state = nxt; e.st = 0; e.aStep = 0; e.hitDone = false;
      if (nxt === 'slam' || nxt === 'slam2') { e.slamX = p.x; telegraph(e, 1.0); }
      else if (nxt === 'barrage') telegraph(e, 0.9, 'boss');
      else if (nxt === 'summon') { telegraph(e, 0.7, 'summon'); e.spawnXs = [clamp(e.x - 5, B0, B1), clamp(e.x + 5, B0, B1), clamp(p.x, B0, B1)].slice(0, rage ? 3 : 2); for (const sx of e.spawnXs) ring(sx, groundAt(sx) + 0.06, 0.5, 0x39d353, { r0: 1.2, r1: 1.2, dur: 0.75, flat: true, intensity: 1.4 }); }
      else if (nxt === 'sweep') telegraph(e, 0.95, 'boss');
    }
  } else if (e.state === 'slam' || e.state === 'slam2') {
    e.vx = damp(e.vx, 0, 8, dt);
    const f = e.fists[0], t = e.st * tm;
    // the fist tracks you until 0.3 s before it drops: stay put and you get hit, move at the last moment and it misses
    if (t < 0.7) { e.slamX = lerp(e.slamX, p.x, Math.min(1, dt * 3)); f.tx = e.slamX; f.ty = groundAt(e.slamX) + 8; f.z = 0.4; f.k = 6; }
    else if (t < 0.95) { f.tx = e.slamX; f.ty = groundAt(e.slamX) + 8; f.k = 12; }
    else if (t < 1.0) { f.k = 40; f.ty = groundAt(e.slamX) + 0.9; }
    if (t >= 1.0 && !e.hitDone) {
      e.hitDone = true; const x = e.slamX, gy = groundAt(x);
      sfx.stomp(); sfx.quake(); shake(0.9); punchFov(4); post.aberr = 0.01;
      ring(x, gy + 0.05, 0.5, RED, { r0: 0.5, r1: 7, dur: 0.6, flat: true }); ring(x, gy + 1, 0.5, 0xffffff, { r0: 0.5, r1: 4, dur: 0.35 });
      puff(x, gy + 0.3, 14, 0x8b949e, 2, 1); cubes(x, gy + 1, 0x464f5c, 18, 11, 0.45); cubes(x, gy + 1, RED, 10, 9, 0.3, true); ripple(x, 3.4, RED, 18, 1.2); flashLight(x, gy + 1, 2, RED, 90, 0.5);
      if (Math.abs(p.x - x) < 2.4 && p.y - gy < 2.5 && !p.dead) damagePlayer(26, { x, y: p.y, enemy: e, kind: 'melee' });
      for (const d of [-1, 1]) groundWave(x, d, { len: rage ? 20 : 14, speed: rage ? 14 : 11, dmg: 15, color: RED, owner: 'enemy', height: 1.2, src: e });
      if (e.state === 'slam2') { // phase 2: a delayed second wave pair, so the first jump is not enough
        for (const d of [-1, 1]) ring(x + d * 2.5, gy + 0.07, 0.4, RED, { r0: 1.5, r1: 1.5, dur: 0.45, flat: true, intensity: 1.6 });
        later(0.45, () => { if (e.dead) return; sfx.quake(); shake(0.5); for (const d of [-1, 1]) groundWave(x, d, { len: 18, speed: 15, dmg: 15, color: RED, owner: 'enemy', height: 1.2, src: e }); });
      }
    }
    if (t > (e.state === 'slam2' ? 2.2 : 1.9)) bossRecover(e, 1.6, rage ? 0.8 : 1.5);
  } else if (e.state === 'sweep') { // phase 2: a low fist sweep along the floor: jump it, or parry it
    e.vx = damp(e.vx, 0, 8, dt);
    const t = e.st * tm, f = e.fists[0], gy = groundAt(e.x);
    if (t < 0.95) {
      f.tx = e.x - e.facing * 1.5; f.ty = gy + 4.5; f.z = 0.4; f.k = 8; // arm drawn back and up
      for (let i = 1; i <= 5; i++) ring(e.x + e.facing * i * 1.5, groundAt(e.x + e.facing * i * 1.5) + 0.07, 0.4, RED, { r0: 0.8, r1: 0.8, dur: 0.05, flat: true, intensity: 1.4 });
    } else if (!e.hitDone) {
      e.hitDone = true; f.tx = e.x + e.facing * 6; f.ty = gy + 0.9; f.k = 30;
      sfx.stomp(); shake(0.5); puff(e.x + e.facing * 3, gy + 0.3, 10, 0x8b949e, 1.6, 0.8);
      groundWave(e.x + e.facing * 1.6, e.facing, { len: 8, speed: 22, dmg: 20, color: RED, owner: 'enemy', height: 0.9, thick: 0.9, src: e });
    }
    if (t > 1.7) bossRecover(e, 1.5, 0.8);
  } else if (e.state === 'barrage') {
    e.vx = damp(e.vx, 0, 8, dt);
    const t = e.st * tm, shots = rage ? 9 : 6;
    if (t < 0.9) { e.eyes.forEach((m) => { m.material.emissiveIntensity = 3 + Math.sin(t * 30) * 2; }); }
    else {
      const idx = Math.floor((t - 0.9) / 0.14);
      while (e.aStep <= idx && e.aStep < shots) {
        const ox = e.x + e.facing * 1.5, oy = e.y + 5.7, tx = p.x + rand(-2.5, 2.5), ty = p.y + 1 + rand(-0.5, 1.2), l = Math.hypot(tx - ox, ty - oy);
        spawnProj({ x: ox, y: oy, vx: (tx - ox) / l * (rage ? 12 : 10), vy: (ty - oy) / l * (rage ? 12 : 10), r: 0.4, owner: 'enemy', color: 0xff4d4d, trailC: 0xff7b72, dmg: 11, life: 4, src: e });
        sfx.enemyShoot('boss'); sparks(ox, oy, 0xff7b72, 8, 7); shake(0.1); e.aStep++;
      }
      if (e.aStep >= shots && t > 0.9 + shots * 0.14 + 0.4) bossRecover(e, 1.4, rage ? 0.7 : 1.4);
    }
  } else if (e.state === 'summon') {
    e.vx = damp(e.vx, 0, 8, dt);
    const t = e.st * tm;
    if (t > 0.7 && !e.hitDone) {
      e.hitDone = true; sfx.bossRoar(); shake(0.5); ring(e.x, e.y + 4, 0.5, 0x39d353, { r0: 0.5, r1: 8, dur: 0.6 });
      for (const sx of e.spawnXs || []) spawnEnemy('bug', sx, 0, { arena: 'boss', cd: 1.2 });
    }
    if (t > 1.6) bossRecover(e, 1.2, 1.8);
  } else if (e.state === 'rain') { // phase 2: falling blocks in marked lanes
    const t = e.st * tm;
    if (!e.hitDone) {
      e.hitDone = true; sfx.telegraph('boss'); e.marks = [];
      const n = 6;
      for (let i = 0; i < n; i++) {
        const mx = clamp(p.x + (i - (n - 1) / 2) * 4 + rand(-1.2, 1.2), e.bx0 ?? 220, e.bx1 ?? 263);
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
    if (t > 2.4) bossRecover(e, 1.2, 1.2);
  } else if (e.state === 'stunned') {
    e.vx = damp(e.vx, 0, 8, dt);
    if (e.st > e.staggerTime) { e.state = 'idle'; e.cd = 1.0; e.st = 0; e.fists.forEach((f) => (f.k = 8)); }
  }
  if (e.state !== 'slam' && e.state !== 'slam2' && e.state !== 'sweep') { // idle fists follow the body
    e.fists.forEach((f, i) => { f.tx = e.x + e.facing * (2.6 + i * 0.4); f.ty = e.y + 3.3 + Math.sin(G.time * 1.5 + i * 2) * 0.35; f.z = i ? -1.9 : 1.9; f.k = 6; });
    e.fists[1].tx = e.x - e.facing * 2.4;
  } else e.fists[1].tx = e.x - e.facing * 2.4, e.fists[1].ty = e.y + 3.3, e.fists[1].z = -1.9;
  // body check: standing inside the boss for 0.3 s gets you shoved (10 damage, 1.4 s cooldown). It can no longer re-trigger every frame.
  e.bodyCd = Math.max(0, (e.bodyCd || 0) - dt);
  const near = !p.dead && Math.abs(p.x - e.x) < 2.4 && p.y < e.y + 4.5;
  if (near && e.bodyCd <= 0) {
    e.contactT = (e.contactT || 0) + dt;
    if (e.contactT > 0.3) {
      e.contactT = 0; e.bodyCd = 1.4;
      damagePlayer(10, { x: e.x, y: p.y, enemy: e, kind: 'melee' });
      p.vx = sign(p.x - e.x || 1) * 10; p.vy = Math.max(p.vy, 5);
      ring(e.x + sign(p.x - e.x) * 1.8, e.y + 1.2, 0.5, RED, { r0: 0.3, r1: 2.2, dur: 0.3 });
    }
  } else if (!near) e.contactT = 0;
}

// ----------------------------------------------------------------- animation
function animate(e, dt, tm) {
  const t = G.time, g = e.group;
  // facing
  const ry = e.facing > 0 ? 0 : Math.PI;
  let cur = g.rotation.y; let d = ry - cur; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
  g.rotation.y = cur + d * (1 - Math.exp(-14 * dt));
  g.position.set(e.x, e.y, 0);
  // reaction poses: flinch on every hit, tumble while airborne, lie flat when knocked down, then get up
  if (!e.boss) {
    const flip = e.kdir || 1;
    let want = e.recoil * 0.28 * flip;
    if (e.air && !e.flying) want = clamp(-e.vy * 0.075, -1.1, 1.1) * flip + e.recoil * 0.2 * flip;
    if (e.downT > 0) want = 1.45 * flip; else if (e.getUp > 0) want = 1.45 * flip * (e.getUp / 0.35);
    e.tiltZ = damp(e.tiltZ, want, e.downT > 0 || e.getUp > 0 ? 16 : 22, dt);
    g.rotation.z = -e.tiltZ;
    g.position.y = e.y + (Math.abs(e.tiltZ) > 0.6 ? Math.min(0.55, e.h * 0.2) * (Math.abs(e.tiltZ) / 1.45) : 0);
    if (e.spawnT <= 0) g.scale.set(1 + e.recoil * 0.07, 1 - e.recoil * 0.09, 1 + e.recoil * 0.07);
    // victim shake during hit-stop (Sakurai): the target vibrates while the world is frozen, horizontally on the ground, vertically in the air
    if (G.freeze > 0 && e.recoil > 0.4) { const j = e.recoil * 0.1 * Math.sin(performance.now() * 0.13); if (e.air) g.position.y += j; else g.position.x += j; }
  }
  // telegraph pulse
  if (e.tele > 0) e.tele -= dt * tm; // tells slow down with the enemy (chill), so they never run ahead of the attack
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
    const s = e.state === 'charge' ? 1 + (e.st / 0.9) * 0.5 : 1;
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
  } else if (e.type === 'dummy') {
    e.torso.rotation.z = Math.sin(t * 2 + e.anim) * 0.01;
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
  if (e.shieldM) { e.shieldM.visible = !!e.shield; if (e.shield) { e.shieldM.rotation.y += dt * 0.8; e.shieldM.material.opacity = 0.2 + 0.08 * Math.sin(t * 6); } }
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
  sweepTokens();
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (e.dead) { removeEnemy(e); G.enemies.splice(i, 1); if (G.boss === e) G.boss = null; continue; }
    const tm = e.chill > 0 ? (e.boss ? 0.8 : 0.55) : 1; // chill slows a boss far less
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
    if (e.downT > 0) { e.downT -= dt; if (e.downT <= 0) e.getUp = 0.35; }
    else if (e.getUp > 0) e.getUp -= dt;
    if (e.recoil > 0) e.recoil = Math.max(0, e.recoil - dt * 7);
    const busy = e.stagger > 0 || e.stun > 0 || e.air || e.downT > 0 || e.getUp > 0;
    if (busy && e.state !== 'stunned' && !e.boss) { if (e.state !== 'recover') { e.state = 'idle'; e.cd = Math.max(e.cd, 0.4); } e.tele = 0; e.armorT = 0; giveToken(e); }
    if (!busy && !p.dead && (G.trainAttack !== false || e.dummy)) {
      ({ bug: aiBug, pointer: aiPointer, brute: aiBrute, boss: aiBoss, dummy: aiDummy }[e.type])(e, dt, tm);
    } else if (!busy && p.dead) e.vx = damp(e.vx, 0, 5, dt);
    if (e.dummy && busy) e.idleT = 0;
    physics(e, dt, tm);
    animate(e, dt, tm);
    if (e.boss) UI.bossBar(e);
  }
}

