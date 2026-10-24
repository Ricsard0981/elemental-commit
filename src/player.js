import * as THREE from 'three';
import { G } from './state.js';
import { scene, glow, dust, sparks, puff, cubes, rgb, ring, flashLight, floatText, shake, punchFov, player_light, post, shockwave } from './engine.js';
import { groundAt, solidsNear, platforms, ripple } from './world.js';
import { sfx } from './audio.js';
import { ELEMENTS } from './elements.js';
import { computeMods, prog } from './skills.js';
import * as In from './input.js';
import * as UI from './ui.js';
import { acquireHero, heroReady } from './hero.js';
import { emit } from './events.js';
import { hitEnemy, enemyBox, hitBox, explode } from './combat.js';
import { MOVES } from './elements.js';
import { applyPatches } from './patches.js';
import { isPyre, pyreInput, pyreTick, skateMove, powerSlide, skid, KIT as PYRE_KIT } from './pyre.js';
import { haptic, S, diff } from './settings.js';
import { clamp, damp, lerp, rand, easeOut, sign } from './util.js';

const tmp = [];
const BUF = { main: 0.16, jump: 0.14, dash: 0.16, s1: 0.16, s2: 0.16, ranged: 0.12, guard: 0.09 }; // seconds of REAL time (≈ 8–10 frames)
const _hv = new THREE.Vector3();
const capsule = new THREE.CapsuleGeometry(1, 1, 4, 10), sph = new THREE.SphereGeometry(1, 16, 12), box = new THREE.BoxGeometry(1, 1, 1);

export class Player {
  constructor(key) {
    this.key = key; this.el = ELEMENTS[key];
    this.x = 4; this.y = 0; this.vx = 0; this.vy = 0; this.w = 0.7; this.h = 1.75;
    this.facing = 1; this.onGround = false; this.coyote = 0; this.jumps = 0; this.airDash = true;
    this.state = 'free'; this.lockT = 0; this.stun = 0; this.hurtI = 0; this.dashInv = 0;
    this.guarding = false; this.guardT = 99; this.parryWindow = 0.22;
    this.cd = { ranged: 0, guard: 0, s1: 0, s2: 0, dash: 0 }; this.cdMax = { ranged: 1, guard: 1, s1: 1, s2: 1, dash: 1 };
    this.buf = { main: 0, jump: 0, s1: 0, s2: 0, dash: 0, ranged: 0, guard: 0 };
    this.atk = null; this.combo = 0; this.comboT = 0; this.castT = 0; this.castSlot = '';
    this.dash = null; this.slam = null; this.fly = 0; this.haste = 0; this.dmgBuff = 1; this.dmgBuffT = 0; this.drBuff = 0;
    this.squash = 0; this.dead = false; this.reborn = false; this.critBonus = 0; this.sinceHurt = 99;
    this.safeX = 4; this.runPhase = 0; this.stepT = 0; this.turn = 0; this.shieldK = 0;
    this.clock = 0; this.bufStamp = {}; this.guardPresses = []; this.latchT = -9; this.latchUp = this.latchDown = false; this.latchAx = 0; this.lastKind = ''; this.noEnT = -9; this.dashEndT = -9; this.chargeT = 0; this.chargeReady = false;
    this.blink = 0; this.counterT = 0; this.deadT = 0; this.moveIntent = false; this.landK = 0; this.parryBase = 0.18;
    this.skate = false; this.stanceCd = 0; this.dropT = 0; this.heat = 0; this.blaze = 0; this.kickT = 0; this.flipT = 0; this.ollieT = 0; this.handstand = 0; this.emote = null; this.grind = null; this.idleT = 0; // Pyre (src/pyre.js)
    this.castSeq = 0; this.leanT = 0; this.airHits = 0; this.acombo = 0; this.acomboT = 0; this.imbue = null; this.hero = null; this.infEnergy = false; this.noCooldowns = false; this.cheering = false;
    this.refreshMods(true);
    this.hp = this.hpMax; this.energy = this.energyMax * 0.6;
    this.build();
  }

  refreshMods(first) {
    const owned = prog(this.key).owned;
    const old = this.hpMax;
    const runRes = G.run && G.run.active ? G.run.res : null;
    this.mods = computeMods(this.key, owned, runRes || prog(this.key).res, prog(this.key).temper, prog(this.key).fork);
    applyPatches(this.mods); // room-run patches (src/patches.js)
    if (G.run && G.run.active && G.run.res && this.mods.resonance) this.mods.resKey = G.run.res;
    if (G.training && G.trainRes && G.trainRes !== this.key) { this.mods.resKey = G.trainRes; this.mods.resPower = 2; this.mods.resFinisher = true; this.mods.resonance = true; }
    const rk = this.mods.resKey;
    this.imbue = rk ? { key: rk, color: ELEMENTS[rk].color, style: { fire: 0, water: 1, earth: 2, air: 3 }[rk], power: 1 + this.mods.resPower } : null;
    this.hero?.setImbue(this.imbue);
    this.hpMax = 100 + this.mods.hp;
    this.energyMax = 100 + this.mods.energy;
    this.maxJumps = 2 + this.mods.jumps + this.el.prof.jumps;
    this.parryBase = 0.18 * (1 + this.mods.parry) * (1 + diff().parry); this.parryWindow = this.parryBase; // ~11 frames at 60 fps, skills widen it
    if (!first && old) this.hp = Math.min(this.hpMax, this.hp + (this.hpMax - old));
  }

  // ------------------------------------------------------------ model
  build() {
    if (heroReady()) {
      this.hero = acquireHero(this.key, this.el);
      this.group = this.hero.group; this.hands = this.hero.hands; this.scarf = []; this.mats = { cloth: this.hero.mat };
      this.hero.setImbue(this.imbue);
      scene.add(this.group);
    } else this.buildLegacy();
    this.buildShields();
    this.syncModel();
  }
  buildLegacy() {
    const c = this.el.color, c2 = this.el.color2;
    const cloth = new THREE.MeshStandardMaterial({ color: 0x4a5a70, roughness: 0.55, metalness: 0.1, emissive: 0x1a2430, emissiveIntensity: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.6, metalness: 0.08, emissive: 0x10161d, emissiveIntensity: 0.6 });
    const accent = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.1, roughness: 0.3 });
    const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(c2).multiplyScalar(2.2), toneMapped: false });
    this.mats = { cloth, dark, accent };
    const g = this.group = new THREE.Group();
    const body = this.body = new THREE.Group(); g.add(body);
    const add = (geo, mat, parent, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m; };
    // hips + legs
    this.hips = new THREE.Group(); this.hips.position.y = 0.88; body.add(this.hips);
    this.legL = new THREE.Group(); this.legR = new THREE.Group();
    this.legL.position.set(0, 0, 0.14); this.legR.position.set(0, 0, -0.14);
    this.hips.add(this.legL, this.legR);
    for (const l of [this.legL, this.legR]) {
      add(capsule, cloth, l, 0, -0.36, 0, 0.1, 0.17, 0.1);
      add(box, accent, l, 0.04, -0.76, 0, 0.2, 0.1, 0.15);
      add(box, dark, l, 0, -0.72, 0, 0.14, 0.18, 0.13);
    }
    // torso
    this.torso = new THREE.Group(); this.torso.position.y = 0.08; this.hips.add(this.torso);
    add(capsule, cloth, this.torso, 0, 0.32, 0, 0.25, 0.22, 0.2);
    add(box, accent, this.torso, 0, 0.07, 0, 0.45, 0.06, 0.38);
    add(box, glowM, this.torso, -0.2, 0.42, 0, 0.04, 0.2, 0.18); // back crest
    this.crest = add(new THREE.OctahedronGeometry(1), glowM, this.torso, -0.3, 0.5, 0, 0.12, 0.16, 0.12);
    // head
    this.head = new THREE.Group(); this.head.position.y = 0.78; this.torso.add(this.head);
    add(sph, dark, this.head, 0, 0.12, 0, 0.23, 0.25, 0.22);
    add(box, glowM, this.head, 0.16, 0.14, 0, 0.1, 0.07, 0.3); // visor
    add(new THREE.ConeGeometry(1, 1, 5), accent, this.head, -0.1, 0.33, 0, 0.14, 0.3, 0.14).rotation.z = 0.7; // hood tip
    // arms (z offset so the near arm is visible in side view)
    this.armF = new THREE.Group(); this.armB = new THREE.Group();
    this.armF.position.set(0, 0.62, 0.3); this.armB.position.set(0, 0.62, -0.3);
    this.torso.add(this.armF, this.armB);
    this.hands = [];
    for (const a of [this.armF, this.armB]) {
      add(capsule, cloth, a, 0, -0.26, 0, 0.075, 0.13, 0.075);
      add(sph, accent, a, 0, -0.1, 0, 0.1, 0.1, 0.1);
      const h = add(sph, glowM, a, 0, -0.56, 0, 0.1, 0.1, 0.1); this.hands.push(h);
    }
    // scarf (trailing chain)
    this.scarf = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(box, accent); s.scale.set(0.34 - i * 0.03, 0.1, 0.12); s.castShadow = true;
      scene.add(s); this.scarf.push({ m: s, x: this.x, y: this.y + 1.5 });
    }
    g.scale.setScalar(1.1);
    scene.add(g);
  }
  buildShields() {
    const g = this.shieldRoot = new THREE.Group(); g.scale.setScalar(1.1); scene.add(g);
    // shields
    this.shields = {};
    const mkS = (geo, color, op) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.7), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const fireS = new THREE.Group(); const fd = mkS(new THREE.CircleGeometry(1.5, 28, -Math.PI / 2, Math.PI), 0xff6a2b, 0.35); const fr = mkS(new THREE.RingGeometry(1.35, 1.5, 28, 1, -Math.PI / 2, Math.PI), 0xffc233, 0.9); fireS.add(fd, fr); fireS.position.set(0.3, 1, 0.2);
    const waterS = mkS(new THREE.SphereGeometry(1.5, 24, 16), 0x2ea8ff, 0.22);
    const earthS = new THREE.Group(); for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: 0x9a7448, roughness: 0.9, flatShading: true })); r.scale.set(0.35, 0.8, 0.8); const a = -1.1 + i * 0.55; r.position.set(Math.cos(a) * 1.05, Math.sin(a) * 1.05 + 0.2, 0); r.rotation.z = a; earthS.add(r); }
    const airS = new THREE.Group(); for (let i = 0; i < 3; i++) { const r = mkS(new THREE.TorusGeometry(1.0 + i * 0.25, 0.04, 6, 24, Math.PI), i % 2 ? 0x7ff3d6 : 0xcfe9ff, 0.8); r.rotation.z = -Math.PI / 2; airS.add(r); }
    airS.position.set(0.4, 1, 0);
    this.shields = { fire: fireS, water: waterS, earth: earthS, air: airS };
    for (const s of Object.values(this.shields)) { s.visible = false; g.add(s); s.position.y = 1; }
    this.shield = this.shields[this.key];
  }
  // swap the model after a graphics change (ribbon / trail / outline counts are baked into the hero)
  rebuildModel() {
    if (!this.hero) return;
    const vis = this.group.visible, ry = this.group.rotation.y;
    this.hero.release(); this.hero = acquireHero(this.key, this.el);
    this.group = this.hero.group; this.hands = this.hero.hands; this.mats = { cloth: this.hero.mat };
    this.hero.setImbue(this.imbue); this.group.visible = vis; this.group.rotation.y = ry; scene.add(this.group); this.syncModel();
  }
  destroy() {
    scene.remove(this.group); scene.remove(this.shieldRoot); this.scarf.forEach((s) => scene.remove(s.m)); this.hero?.release();
  }

  // ------------------------------------------------------------ input helpers
  aim(forRanged) {
    const cy = this.y + 1.2;
    if (In.touch.aim) { const a = In.touch.aim; if (Math.abs(a.x) > 0.15) this.facing = sign(a.x); return { x: a.x, y: a.y }; }
    if (In.mouse.active > 0) {
      let dx = In.mouse.wx - this.x, dy = In.mouse.wy - cy; const l = Math.hypot(dx, dy) || 1;
      if (l < 0.6) return { x: this.facing, y: 0 };
      dx /= l; dy /= l;
      if (Math.abs(In.mouse.wx - this.x) > 0.4) this.facing = sign(dx);
      return { x: dx, y: dy };
    }
    // keyboard / touch aim-assist: nearest enemy in a forward cone
    let best = null, bs = 99;
    if (S.aimAssist) for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const dx = e.x - this.x, dy = e.y + e.h / 2 - cy;
      if (dx * this.facing < 0.5 || Math.hypot(dx, dy) > 15) continue;
      const ang = Math.abs(Math.atan2(dy, Math.abs(dx)));
      if (ang < 0.7 && ang < bs) { bs = ang; best = { dx, dy }; }
    }
    if (best) { const l = Math.hypot(best.dx, best.dy); return { x: best.dx / l, y: best.dy / l }; }
    return { x: this.facing, y: 0 };
  }
  nearestDir(range = 3.5) {
    let best = null, bd = range;
    for (const e of G.enemies) { if (e.dead || e.spawnT > 0) continue; const d = Math.abs(e.x - this.x); if (d < bd && Math.abs(e.y - this.y) < 3) { bd = d; best = e; } }
    return best ? sign(best.x - this.x) : 0;
  }
  speedMul() { return this.el.prof.move * (1 + this.mods.speed) + (this.haste > 0 ? 0.35 : 0) + (this.fly > 0 ? 0.15 : 0); }

  // ------------------------------------------------------------ abilities
  startDash(o) {
    this.state = 'dash';
    this.dash = { t: 0, ...o };
    this.dashInv = o.inv ?? 0.2;
    this.facing = o.dir; this.atk = null; this.guarding = false; this.castT = 0;
  }
  tryDash() {
    if (this.cd.dash > 0 || (!this.onGround && !this.airDash)) return false;
    if (this.skate && this.onGround && In.down('down')) { powerSlide(this); return true; }
    const ax = In.axis(), dir = ax ? sign(ax) : this.facing;
    if (!this.onGround) { if (this.airDashExtra > 0) this.airDashExtra--; else this.airDash = false; }
    const dashX0 = this.x;
    const D = this.el.prof.dash, cd = D.cd * (1 - this.mods.dashCd);
    this.cd.dash = cd; this.cdMax.dash = cd;
    sfx.dash(); haptic('dash');
    const chilled = new Set(); // Water: the dash itself is a control tool, it chills whatever you slip through
    this.startDash({ basic: true, dir, speed: D.speed, dur: D.dur, inv: D.inv, tint: this.el.color,
      end: this.mods.dashFire ? (pl) => { const lo = Math.min(dashX0, pl.x), hi = Math.max(dashX0, pl.x); hitBox(lo, hi, pl.y - 0.4, pl.y + 2, 9, { kind: 'special', burn: 3, burnDps: 9, noCombo: true, quiet: true, noReact: true, kx: 2, hitstop: 0, shake: 0, color: 0xff6a2b }); for (let i = 0; i < 18; i++) glow.emit(rand(lo, hi), pl.y + rand(0.1, 1.2), rand(-0.3, 0.3), 0, rand(1, 4), 0, rgb(Math.random() < 0.5 ? 0xff6a2b : 0xffc233, 1.9), rand(0.4, 0.8), 0, 0.6, -2, 1); } : null,
      tick: this.key === 'water' || this.mods.dashChill ? (pl) => { for (const e of G.enemies) if (!e.dead && e.spawnT <= 0 && !chilled.has(e) && Math.abs(e.x - pl.x) < 1.3 && Math.abs(e.y - pl.y) < 2) { chilled.add(e); e.chill = Math.max(e.chill, 2.5); e.chillStacks = (e.chillStacks || 0) + (pl.mods.freeze ? 1 : 0); sparks(e.x, e.y + 1, 0x9fe8ff, 8, 6, 0.2, 0.3); } } : null });
    punchFov(2); ring(this.x, this.y + 0.9, 0.5, this.el.color2, { r0: 0.2, r1: 1.6, dur: 0.25 });
    puff(this.x, this.y + 0.1, 5, 0x8b949e, 0.8, 0.4);
    return true;
  }
  // ground combo / launcher (Up + Attack) / air chain (Attack in the air) / slam (Down + Attack in the air)
  startAttack(force) {
    const m = this.el.main;
    // direction is latched when the button was pressed (a short hold of Up/Down still counts), live input otherwise
    const fresh = this.clock - this.latchT < 0.3;
    const ax = (fresh && this.latchAx) || In.axis();
    const up = (fresh && this.latchUp) || In.down('up'), down = (fresh && this.latchDown) || In.down('down');
    this.latchT = -9;
    const air = !this.onGround;
    let kind = 'ground';
    if (air) kind = down ? 'slam' : 'air'; else if (up) kind = 'launcher';
    if (force) kind = force;
    if (kind === 'air' && this.airHits >= 6) { this.buf.main = 0; return; } // land first: no endless air stall
    if ((kind === 'ground' || kind === 'air') && this.mods.dashStrike && this.clock - this.dashEndT < 0.3) kind = 'dashStrike'; // Attack right after a Dash
    if (kind !== this.lastKind) { this.comboT = 0; this.acomboT = 0; } // a different move type always starts its own chain at hit 1
    this.lastKind = kind;
    const ramp = this.key === 'fire' ? 1 - Math.min(0.22, G.combo.n * 0.018) : 1; // Fire snowballs: the longer the combo the faster it swings
    const sp = this.mods.hurricane ? 0.8 : 1, hs = this.haste > 0 ? 0.78 : 1, k = sp * hs * this.el.prof.atk * ramp * (1 - (this.mods.atkSpeed || 0));
    let cfg, i = 0;
    if (kind === 'ground') {
      const cfgs = m.hits;
      if (this.comboT <= 0) this.combo = 0; else this.combo = (this.combo + 1) % cfgs.length;
      i = this.combo; cfg = cfgs[i];
    } else if (kind === 'launcher') { cfg = m.launcher; this.combo = 0; this.comboT = 0; }
    else if (kind === 'air') {
      this.acombo = this.acomboT <= 0 ? 0 : (this.acombo + 1) % 3; i = this.acombo; cfg = m.air.hits[i]; this.airHits++;
    } else if (kind === 'dashStrike') { cfg = MOVES[this.key].dsCfg; this.combo = 0; this.comboT = 0; this.dashEndT = -9; }
    else if (kind === 'slideKick') { cfg = PYRE_KIT.slideKick; this.combo = 0; this.comboT = 0; }
    else { cfg = m.slam; }
    const toward = this.nearestDir(4.5);
    if (ax) this.facing = sign(ax); else if (toward) this.facing = toward;
    const hitAt = kind === 'slam' ? cfg.windup : cfg.hitAt * k;
    this.atk = { kind, cfg, i, clip: cfg.clip, t: 0, dur: cfg.dur * k, hitAt, cancelAt: (cfg.cancelAt ?? cfg.dur * 0.7) * k, struck: false, landed: false, hit: new Set() };
    this.state = 'attack'; this.guarding = false;
    this.vx = this.facing * (cfg.lunge ?? 0) * 0.25; // a nudge during startup; the real lunge happens at contact
    if (kind === 'air') this.vy = this.vy > 0 ? this.vy * 0.35 : Math.max(this.vy * 0.2, -1);
    if (kind === 'slam') { this.vy = 0; this.vx = 0; }
    this.buf.main = 0;
    emit('attack', { kind, i });
  }
  // Charged Shot: hold Ranged (the tap still fires its normal shot at once); release after 0.7 s for the element's big shot
  updateCharge(rdt) {
    const held = this.mods.charge && In.down('ranged') && !this.guarding && !this.stun && (this.state === 'free' || this.state === 'cast');
    if (held) {
      this.chargeT += rdt;
      if (this.chargeT > 0.2) {
        const k = Math.min(1, this.chargeT / 0.7), hx = this.x + this.facing * 0.6, hy = this.y + 1.2;
        for (let i = 0; i < 2; i++) { const an = rand(6.28), r = (1 - k) * 1.6 + 0.3; glow.emit(hx + Math.cos(an) * r, hy + Math.sin(an) * r, -Math.cos(an) * 3, -Math.sin(an) * 3, 0, 0, rgb(this.el.color2, 1.4 + k), 0.2, 0, 0.3, 0, 0); }
        if (this.chargeT >= 0.7 && !this.chargeReady) { this.chargeReady = true; ring(hx, hy, 0.4, this.el.color2, { r0: 0.2, r1: 2, dur: 0.3 }); sfx.hover(); punchFov(1); }
      }
    } else {
      if (this.chargeT >= 0.7 && this.mods.charge && (this.state === 'free' || this.state === 'cast') && !this.stun && (this.infEnergy || this.energy >= 20)) {
        if (!this.infEnergy) this.energy -= 20;
        const a = this.aim(true); if (Math.abs(a.x) > 0.05) this.facing = a.x > 0 ? 1 : -1;
        this.atk = null; this.state = 'cast'; this.lockT = 0.4; this.castT = 0; this.castSlot = 'ranged'; this.castSeq++;
        this.cd.ranged = Math.max(this.cd.ranged, 0.8); this.cdMax.ranged = 0.8;
        MOVES[this.key].charged(this, a); UI.castFlash('ranged');
      }
      this.chargeT = 0; this.chargeReady = false;
    }
  }
  // oldest buffered action that can actually start now (first input wins; failed ones don't block the others)
  oldestBuf() {
    let best = null, bs = Infinity;
    for (const k of ['dash', 'main', 's1', 's2']) {
      if (this.buf[k] <= 0 || this.bufStamp[k] >= bs) continue;
      if (k === 'dash' && (this.cd.dash > 0 || (!this.onGround && !this.airDash))) continue;
      if ((k === 's1' || k === 's2') && (this.cd[k] > 0 || (!this.infEnergy && this.energy < this.el[k].cost))) continue;
      bs = this.bufStamp[k]; best = k;
    }
    return best;
  }
  // after contact an attack can be cancelled into a buffered special / ranged / jump
  tryBufferedCast() {
    for (const k of ['s1', 's2']) if (this.buf[k] > 0 && this.cd[k] <= 0 && this.tryCast(k)) { this.buf[k] = 0; return true; }
    if (((In.down('ranged') && !this.mods.charge) || this.buf.ranged > 0) && this.cd.ranged <= 0 && this.tryCast('ranged')) { this.buf.ranged = 0; return true; }
    return false;
  }
  tryJump() {
    if (this.buf.jump <= 0 || this.guarding) return false;
    if (this.coyote > 0 || this.onGround) { this.jump(false); return true; }
    if (this.fly > 0 || this.jumps < this.maxJumps - 1) { this.jump(true); return true; }
    return false;
  }
  tryCast(slot) {
    const a = this.el[slot];
    if (this.cd[slot] > 0) return false;
    if (!this.infEnergy && this.energy < a.cost) { if (this.clock - this.noEnT > 0.35) { this.noEnT = this.clock; UI.noEnergy(slot); sfx.hover(); } return false; }
    if (!this.infEnergy) this.energy -= a.cost;
    this.castSeq++;
    let cd = (a.cdFn ? a.cdFn(this) : a.cd);
    if (slot === 's1' || slot === 's2') cd *= 1 - Math.min(0.6, this.mods.cdr);
    if (slot === 'ranged' && this.haste > 0) cd *= 0.65;
    if (this.noCooldowns) cd = 0.05;
    this.cd[slot] = cd; this.cdMax[slot] = cd;
    this.atk = null; this.guarding = false;
    const ax = In.axis();
    let aim;
    if (slot === 'ranged' || slot === 's2') aim = this.aim(true); else { aim = { x: this.facing, y: 0 }; if (ax) this.facing = sign(ax); }
    this.facing = aim.x >= 0 && Math.abs(aim.x) > 0.05 ? 1 : Math.abs(aim.x) > 0.05 ? -1 : this.facing;
    if (slot === 's1' && ax) this.facing = sign(ax);
    this.state = slot === 's1' && this.el.key === 'fire' ? this.state : 'cast';
    this.lockT = a.lock * (this.haste > 0 ? 0.7 : 1); this.castT = 0; this.castSlot = slot;
    if (slot === 's1' || slot === 's2') { sfx.cast(this.key); haptic('cast'); }
    a.cast(this, aim, In.mouse.active > 0 ? In.mouse : null);
    UI.castFlash(slot);
    return true;
  }

  // ------------------------------------------------------------ update
  update(dt) {
    const rdt = G.rdt || dt;
    if (this.dead) {
      this.deadT += rdt; // let the death animation play, then hide
      if (this.hero && this.deadT < 1.5) { this.hero.update(rdt, this); this.shield.visible = false; this.syncModel(); return; }
      this.group.visible = false; this.scarf.forEach((s) => (s.m.visible = false)); this.shield.visible = false; this.hero?.hideAll(); this.syncModel(); return;
    }
    // Input buffering: runs on REAL time (hit-stop and slow-mo don't stretch it), works during hit-stop (dt = 0), first press wins.
    this.clock += rdt;
    this.updateCharge(rdt);
    for (const k of ['main', 'jump', 's1', 's2', 'dash']) if (In.hitNow(k)) {
      this.buf[k] = BUF[k]; this.bufStamp[k] = this.clock;
      if (k === 'main') { this.latchT = this.clock; this.latchUp = In.down('up'); this.latchDown = In.down('down'); this.latchAx = In.axis(); }
    }
    if (In.hitNow('ranged')) this.buf.ranged = BUF.ranged;
    if (In.hitNow('guard')) { this.buf.guard = BUF.guard; this.guardPresses.push(this.clock); if (this.guardPresses.length > 6) this.guardPresses.shift(); }
    for (const k in this.buf) this.buf[k] = Math.max(0, this.buf[k] - rdt);
    if (this.cheering) for (const k in this.buf) this.buf[k] = 0;
    if (isPyre(this)) pyreInput(this, rdt);
    if (dt <= 0) return;
    const m = this.mods, el = this.el;
    // timers
    for (const k in this.cd) if (this.cd[k] > 0) { this.cd[k] -= dt; if (this.cd[k] <= 0) { this.cd[k] = 0; if (k !== 'guard' && k !== 'dash') UI.ready(k); } }
    this.blink = Math.max(0, this.blink - dt); this.counterT = Math.max(0, this.counterT - dt);
    this.hurtI = Math.max(0, this.hurtI - dt); this.dashInv = Math.max(0, this.dashInv - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.comboT = Math.max(0, this.comboT - dt); this.acomboT = Math.max(0, this.acomboT - dt); this.sinceHurt += dt;
    if (this.haste > 0) this.haste -= dt; if (this.fly > 0) { this.fly -= dt; if (this.fly <= 0) floatText(this.x, this.y + 2.5, 'sky dance ended', { size: 14, color: '#bfe1ff' }); }
    if (this.dmgBuffT > 0) { this.dmgBuffT -= dt; if (this.dmgBuffT <= 0) this.dmgBuff = 1; }
    this.energy = this.infEnergy ? this.energyMax : Math.min(this.energyMax, this.energy + (5 + (this.haste > 0 ? 3 : 0)) * dt);
    if (m.regen && this.sinceHurt > 4 && this.hp < this.hpMax) this.hp = Math.min(this.hpMax, this.hp + m.regen * dt);
    this.coyote = this.onGround ? 0.1 : Math.max(0, this.coyote - dt);

    const ax = this.cheering ? 0 : In.axis(); this.moveIntent = ax !== 0;
    if (isPyre(this)) { pyreTick(this, dt, ax); this.ollieT = Math.max(0, this.ollieT - dt); if (this.emote && this.stun > 0) { this.emote = null; this.state = 'free'; } }
    const canAct = this.state === 'free' && this.stun <= 0;
    // ---- guard
    const gHeld = (In.down('guard') || this.buf.guard > 0) && !this.cheering; // a tap inside hit-stop still raises the guard
    const slamDive = this.state === 'attack' && this.atk && this.atk.kind === 'slam' && !this.atk.landed;
    if (gHeld && !this.guarding && this.cd.guard <= 0 && this.stun <= 0 && !slamDive && (this.state === 'free' || (this.state === 'attack' && this.atk.t > this.atk.cancelAt) || this.state === 'cast' && this.lockT < 0.12)) {
      this.guarding = true; this.guardT = 0; this.state = 'free'; this.atk = null; sfx.guardUp(this.key);
      // spam penalty: every extra press inside 0.5 s shrinks the perfect window (down to 30 %)
      const recent = this.guardPresses.filter((t) => this.clock - t < 0.5).length;
      this.parryWindow = this.parryBase * Math.max(0.3, 1 - 0.3 * Math.max(0, recent - 1));
      ring(this.x + this.facing * 0.7, this.y + 1.1, 0.5, el.color2, { r0: 0.2, r1: 1.4, dur: 0.22 });
    }
    if (this.guarding) {
      this.guardT += dt;
      if (!gHeld || this.stun > 0 || this.state === 'dash') { this.guarding = false; this.cd.guard = 0.3; }
      if (m.immovable && this.key === 'earth' && G.time - (this.lastBlockT || -9) < 2) this.hp = Math.min(this.hpMax, this.hp + 4 * dt);
    }

    // ---- state machine
    if (this.state === 'dash') {
      const d = this.dash; d.t += dt;
      if (d.decel) d.speed = Math.max(3, d.speed - d.decel * dt);
      this.vx = d.dir * d.speed; this.vy = d.vy0 ?? 0;
      d.tick?.(this, dt);
      // dash afterimages
      for (let i = 0; i < 4; i++) glow.emit(this.x + rand(-0.2, 0.2), this.y + rand(0.2, 1.6), rand(-0.2, 0.2), -d.dir * rand(1, 4), rand(-1, 1), 0, rgb(d.tint ?? el.color, 1.7), rand(0.3, 0.55), 0, 0.35);
      if (d.slide && d.t > 0.08 && this.buf.main > 0 && !this.stun) { this.state = 'free'; this.dash = null; this.dashInv = 0; this.startAttack('slideKick'); }
      else if (d.basic && this.mods.dashStrike && d.t >= d.dur * 0.35 && this.buf.main > 0 && !this.stun) { // Attack mid-dash: the dash flows straight into the Dash Strike
        this.dashEndT = this.clock; this.state = 'free'; this.dash = null; this.dashInv = 0; this.startAttack();
      } else if (d.t >= d.dur) { this.dashEndT = this.clock; this.vx = d.dir * Math.min(d.speed, 8) * 0.5; this.state = 'free'; this.dash = null; d.end?.(this); }
    } else if (this.state === 'attack') {
      const a = this.atk; a.t += dt;
      if (a.kind === 'slam') {
        // hover for the wind-up, then dive; the impact fires from land()
        if (a.t < a.hitAt) { this.vy = 0; this.vx = damp(this.vx, 0, 12, dt); }
        else if (!a.landed) {
          if (!a.struck) { a.struck = true; sfx.swing(this.key, 0, 'slam'); punchFov(2); ring(this.x, this.y + 1, 0.3, el.color2, { r0: 0.3, r1: 1.8, dur: 0.25 }); }
          this.vy = -42; this.vx = damp(this.vx, 0, 14, dt);
          for (const e of G.enemies) {
            if (e.dead || e.spawnT > 0 || a.hit.has(e) || Math.abs(e.x - this.x) > 1.0 + e.w / 2 || e.y + e.h < this.y - 0.4 || e.y > this.y + 1.6) continue;
            a.hit.add(e); hitEnemy(e, 11, { kind: 'main', dir: sign(e.x - this.x), spike: e.air, bounce: !e.air, kx: 1, color: el.color, big: true });
          }
          for (let i = 0; i < 3; i++) glow.emit(this.x + rand(-0.3, 0.3), this.y + rand(0.2, 1.8), rand(-0.2, 0.2), 0, rand(8, 16), 0, rgb(i % 2 ? el.color : el.color2, 1.8), rand(0.3, 0.6), 0, 0.3);
          if (a.t > 1.8) { this.state = 'free'; this.atk = null; }
        } else if (a.t >= a.dur) { this.state = 'free'; this.atk = null; this.comboT = 0; }
        if (this.atk && a.landed && a.t >= a.cancelAt && this.buf.dash > 0 && this.tryDash()) this.buf.dash = 0;
      } else {
        this.vx = damp(this.vx, 0, 9, dt);
        if (!a.struck && a.t >= a.hitAt) {
          a.struck = true;
          this.vx = this.facing * (a.cfg.lunge ?? 0) * (a.kind === 'ground' ? (this.onGround ? 1 : 0.6) : 1); // the lunge lands WITH the strike
          if (a.kind === 'launcher') el.main.launcher.strike(this);
          else if (a.kind === 'air') el.main.air.strike(this, a.i);
          else if (a.kind === 'dashStrike') MOVES[this.key].dashStrike(this);
          else if (a.kind === 'slideKick') a.cfg.strike(this);
          else el.main.strike(this, a.i);
          this.hero?.kick(this.facing, a.kind === 'launcher' ? 0.4 : a.i === 2 ? 0.34 : 0.22); // hair / cape follow-through
        }
        // contact window: a target that steps into the same swing a few frames late is still hit once
        if (a.struck && a.box && a.t < a.hitAt + (a.cfg.active ?? 0.07)) {
          for (const e of G.enemies) {
            if (e.dead || e.spawnT > 0 || a.hit.has(e)) continue;
            const eb = enemyBox(e), b = a.box;
            if (eb.x0 < b.x1 && eb.x1 > b.x0 && eb.y0 < b.y1 && eb.y1 > b.y0) { a.hit.add(e); hitEnemy(e, b.dmg, b.o); }
          }
        }
        const canCancel = a.t >= a.cancelAt && !this.stun;
        if (canCancel && a.struck && this.buf.jump > 0 && this.tryJump()) { this.state = 'free'; this.atk = null; this.comboT = 0; } // follow a launcher straight into a jump
        else if (canCancel && this.buf.main > 0) {
          this.comboT = 0.5; this.acomboT = 0.5; this.startAttack(); // chain into the next hit
        } else if (canCancel && a.struck && this.tryBufferedCast()) { /* cancelled into a special / ranged */ }
        else if (a.t >= a.dur) { this.state = 'free'; this.comboT = a.kind === 'ground' ? 0.45 : 0; this.acomboT = a.kind === 'air' ? 0.45 : 0; this.atk = null; }
        if (this.atk && (canCancel || (this.key === 'water' && a.t > 0.04)) && this.buf.dash > 0 && this.tryDash()) this.buf.dash = 0; // Water flows out of any swing
        // recovery: you can already steer (and turn) a little once the cancel window is open
        if (this.atk && a.t >= a.cancelAt && ax && !this.stun) { this.vx += clamp(ax * 8.2 * 0.5 - this.vx, -40 * dt, 40 * dt); this.facing = sign(ax); }
      }
    } else if (this.state === 'cast') {
      this.lockT -= dt; this.castT += dt;
      this.vx = damp(this.vx, 0, 8, dt);
      if (this.lockT <= 0) this.state = 'free';
      if (this.buf.dash > 0 && !this.stun && this.tryDash()) this.buf.dash = 0;
    } else if (this.state === 'free' && this.stun <= 0) {
      // movement
      let sm = 1;
      if (this.guarding) sm = { fire: 0.45, water: 0.6, earth: m.immovable ? 0.45 : 0, air: 0.85 }[this.key];
      const target = ax * 8.2 * this.speedMul() * sm;
      const acc = Math.abs(target) > Math.abs(this.vx) || sign(target) !== sign(this.vx) ? (this.onGround ? 70 : 38) : (this.onGround ? 55 : 10);
      if (this.skate && !this.guarding) skateMove(this, ax, dt);
      else if (ax) { this.vx += clamp(target - this.vx, -acc * dt, acc * dt); if (!this.guarding) this.facing = sign(ax); } else this.vx = damp(this.vx, 0, this.onGround ? 16 : 3, dt);
      if (this.guarding && ax) this.facing = this.facing; // facing locked while guarding
      // jump
      this.tryJump();
      // actions
      if (!this.guarding && !this.cheering) {
        const nb = this.oldestBuf();
        if (nb === 'dash') { if (this.tryDash()) this.buf.dash = 0; }
        else if (nb === 'main') this.startAttack();
        else if (nb === 's1' || nb === 's2') { if (this.tryCast(nb)) this.buf[nb] = 0; }
        else if (((In.down('ranged') && !this.mods.charge) || this.buf.ranged > 0) && this.tryCast('ranged')) this.buf.ranged = 0;
      }
    } else if (this.stun > 0) {
      this.vx = damp(this.vx, 0, 5, dt);
    }

    // ---- physics
    const wasGround = this.onGround, pvy = this.vy;
    if (this.state !== 'dash' && !(this.state === 'attack' && this.atk && this.atk.kind === 'slam' && this.atk.t >= this.atk.hitAt && !this.atk.landed)) {
      const g = (this.vy < 0 ? 54 : 40) * this.el.prof.grav;
      const stall = this.state === 'attack' && this.atk && this.atk.kind === 'air'; // air stall: hang while chaining
      this.vy -= g * dt * (this.fly > 0 ? 0.55 : 1) * (stall ? 0.1 : 1);
      if (stall) { this.vy = Math.max(this.vy, -2.2); if (this.vy > 3) this.vy -= 18 * dt; }
      if (!In.down('jump') && this.vy > 5 && this.state !== 'attack' && !this.fly) this.vy -= 55 * dt; // variable jump height
      this.vy = Math.max(this.vy, this.el.prof.fall);
      if (this.fly > 0 && !this.onGround && this.vy < -6) this.vy = -6;
    }
    this.collide(dt);
    if (this.onGround) { this.jumps = 0; this.airDash = true; this.airDashExtra = this.mods.airDashes || 0; this.safeX = groundAt(this.x - 1.2) > -20 && groundAt(this.x + 1.2) > -20 ? this.x : this.safeX; }
    if (!wasGround && this.onGround) this.land(pvy);
    // pits
    if (this.y < -14) this.fellInPit();

    // touch aim guide: a dotted line in the aim direction while dragging the ranged button
    if (In.touch.aim) {
      const t = (G.time * 3) % 1, c = rgb(el.color2, 1.6);
      for (let i = 0; i < 7; i++) { const d = 1 + (i + t) * 1.15; glow.emit(this.x + In.touch.aim.x * d, this.y + 1.2 + In.touch.aim.y * d, 0.3, 0, 0, 0, c, 0.22 - i * 0.02, 0.1, 0.05); }
    }
    // ---- visuals
    this.animate(dt);
    // ambient aura + hands
    this.fxTick(dt);
    // light
    player_light.position.set(this.x, this.y + 1.8, 2.5);
    player_light.color.set(el.color);
    player_light.intensity = 9 + (this.guarding ? 8 : 0) + (this.state === 'cast' ? 14 : 0);
  }

  jump(double) {
    this.buf.jump = 0; this.coyote = 0;
    if (double) {
      this.jumps++; this.vy = this.fly > 0 ? 12.5 : 14.5; sfx.djump();
      ring(this.x, this.y + 0.2, 0.3, this.el.color2, { r0: 0.2, r1: 1.7, dur: 0.3, flat: false });
      for (let i = 0; i < 10; i++) glow.emit(this.x + rand(-0.4, 0.4), this.y + 0.1, rand(-0.3, 0.3), rand(-3, 3), rand(-4, -1), 0, rgb(this.el.color2, 1.6), 0.3, 0, 0.4);
      this.squash = -0.3;
    } else {
      this.jumps = 1; this.vy = this.el.prof.jump; sfx.jump(); puff(this.x, this.y + 0.1, 5, 0x8b949e, 0.8, 0.45, 2.5);
      if (this.skate) { this.vy *= 1.12; this.ollieT = 0.5; } // Skate Mode: an ollie with a kickflip
      this.squash = -0.35;
    }
    this.onGround = false;
  }
  land(vy) {
    const k = clamp(-vy / 28, 0, 1); this.landK = k;
    this.airHits = 0; this.acombo = 0; this.acomboT = 0;
    if (isPyre(this) && (k > 0.35 || (this.skate && k > 0.15))) skid(this, 1.2 + k);
    if (this.mods.quakeLand && k > 0.45) explode(this.x, this.y + 0.3, 3.4, 22, { color: 0xc08a4b, stun: 0.9, kx: 6, ky: 3, noReact: true, shake: 0.3 });
    if (this.slam) { const f = this.slam; this.slam = null; f(); }
    if (this.state === 'attack' && this.atk && this.atk.kind === 'slam' && !this.atk.landed) {
      const a = this.atk; a.landed = true; a.t = a.hitAt + 0.02; a.dur = a.t + 0.3; a.cancelAt = a.t + 0.16;
      this.el.main.slam.strike(this);
    }
    if (k > 0.2) {
      this.squash = 0.15 + k * 0.4; sfx.land(k);
      puff(this.x, this.y + 0.1, 3 + Math.round(k * 7), 0x8b949e, 0.7 + k * 0.6, 0.5, 3 + k * 3);
      if (k > 0.6) { shake(0.12); ring(this.x, this.y + 0.05, 0.5, 0x8b949e, { r0: 0.3, r1: 2.2, dur: 0.3, flat: true, intensity: 0.8 }); }
    }
  }
  fellInPit() {
    this.atk = null; this.slam = null; this.grind = null; this.emote = null; if (this.state === 'attack' || this.state === 'cast' || this.state === 'emote') this.state = 'free';
    this.x = this.safeX; this.y = groundAt(this.safeX) + 0.2; this.vx = this.vy = 0;
    this.hp = Math.max(1, this.hp - 15); this.hurtI = 1.4;
    sfx.hurt(); shake(0.4); post.aberr = 0.01; UI.damageVignette();
    floatText(this.x, this.y + 2.5, 'git stash pop!', { color: '#ffa657', size: 22 });
    ring(this.x, this.y + 1, 0.5, 0x39d353, { r0: 0.3, r1: 3, dur: 0.5 });
  }

  // ------------------------------------------------------------ collision
  collide(dt) {
    const hw = this.w / 2;
    // horizontal
    this.x += this.vx * dt;
    let s = solidsNear(this.x - hw - 0.2, this.x + hw + 0.2, tmp);
    for (const b of s) {
      if (this.x + hw > b.x0 && this.x - hw < b.x1 && this.y < b.y1 - 0.02 && this.y + this.h > b.y0) {
        if (b.y1 - this.y <= 0.6 && this.vy <= 0.5 && b.y1 < 40) { this.y = b.y1; if (this.vy < 0) this.vy = 0; }
        else if (this.vx > 0 || (this.vx === 0 && this.x < (b.x0 + b.x1) / 2)) { this.x = b.x0 - hw; this.vx = 0; }
        else { this.x = b.x1 + hw; this.vx = 0; }
      }
    }
    // vertical
    const prevY = this.y;
    this.y += this.vy * dt;
    this.onGround = false;
    s = solidsNear(this.x - hw + 0.02, this.x + hw - 0.02, tmp);
    for (const b of s) {
      if (this.x + hw > b.x0 && this.x - hw < b.x1 && this.y < b.y1 && this.y + this.h > b.y0) {
        if (this.vy <= 0 && prevY >= b.y1 - 0.15) { this.y = b.y1; this.vy = 0; this.onGround = true; }
        else if (this.vy > 0 && prevY + this.h <= b.y0 + 0.15) { this.y = b.y0 - this.h; this.vy = 0; }
      }
    }
    // one-way slabs
    if (this.vy <= 0 && !In.down('down')) {
      for (const p of platforms) {
        if (Math.abs(this.x - p.x) < p.w / 2 + hw * 0.6 && prevY >= p.y - 0.1 && this.y <= p.y) { this.y = p.y; this.vy = 0; this.onGround = true; }
      }
    }
  }

  // ------------------------------------------------------------ animation
  animate(dt) {
    const sp = Math.abs(this.vx), gnd = this.onGround;
    this.runPhase += dt * (6 + sp * 1.1) * (gnd ? 1 : 0);
    const run = gnd ? clamp(sp / 8, 0, 1.2) : 0;
    const t = G.time;
    let bob = 0;
    if (this.hero) this.poseHero(run);
    else bob = this.poseLegacy(dt, run, gnd, t);
    // turning
    const ry = this.facing > 0 ? 0 : Math.PI;
    let d = ry - this.group.rotation.y; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    this.group.rotation.y += d * (1 - Math.exp(-22 * dt));
    this.shieldRoot.rotation.y = this.group.rotation.y;
    // squash & stretch springs
    this.squash = damp(this.squash, 0, 10, dt);
    if (!this.hero) {
      const stretch = !gnd && this.state !== 'dash' ? clamp(Math.abs(this.vy) / 40, 0, 0.18) : 0;
      const sy = 1 - this.squash * 0.55 + stretch, sxz = 1 + this.squash * 0.5 - stretch * 0.5;
      this.body.scale.set(sxz, sy, sxz);
    }
    // blink on i-frames
    const blink = this.blink > 0 && this.dashInv <= 0 && Math.floor(G.time * 25) % 2 === 0;
    this.group.visible = !blink;
    // shield visuals
    const want = this.guarding ? 1 : 0;
    this.shieldK = damp(this.shieldK, want, 22, dt);
    const sh = this.shield;
    sh.visible = this.shieldK > 0.02;
    if (sh.visible) {
      const k = this.shieldK, flick = 1 + Math.sin(t * 25) * 0.04;
      if (this.key === 'fire') { sh.position.set(0.45, 1.0, 0.2); sh.scale.setScalar(k * flick * 0.85); }
      else if (this.key === 'water') { sh.position.set(0, 1, 0); sh.scale.setScalar(k * (1 + Math.sin(t * 6) * 0.03) * 0.95); }
      else if (this.key === 'earth') { sh.position.set(0, 1, 0); sh.scale.setScalar(k * 0.95); }
      else { sh.position.set(0.5, 1, 0); sh.scale.setScalar(k); sh.children.forEach((c, i) => { c.rotation.x = t * (4 + i * 2); }); }
      const inPerfect = this.guardT <= this.parryWindow;
      sh.traverse((o) => { if (o.material && o.material.opacity !== undefined && !o.material.isMeshStandardMaterial) { o.material.color.setHex(inPerfect ? 0xffffff : this.el.color).multiplyScalar(inPerfect ? 3 : 1.7); } });
    }
    this.syncModel();
    if (this.hero) {
      this.hero.setGuardTint(this.guarding);
      this.hero.update(dt, this);
    } else {
      // earth skin tint + scarf follow
      this.mats.cloth.color.setHex(this.guarding && this.key === 'earth' ? 0x9a8054 : 0x4a5a70);
      let px = this.x - this.facing * 0.2, py = this.y + 1.45 + bob;
      this.scarf.forEach((s, i) => {
        const wind = -this.facing * (0.28 + Math.abs(this.vx) * 0.02);
        s.x = damp(s.x, px + wind, 18 - i * 1.5, dt); s.y = damp(s.y, py - 0.05 - (this.vy < 0 ? -this.vy * 0.004 : 0) + Math.sin(t * 7 + i) * 0.03 + (Math.abs(this.vx) > 2 ? 0.05 : -0.07), 14, dt);
        s.m.position.set(s.x, s.y, 0); s.m.rotation.z = Math.atan2(s.y - py, s.x - px) * 0.5; s.m.visible = this.group.visible;
        px = s.x; py = s.y;
      });
    }
    // footsteps
    if (gnd && run > 0.5) { this.stepT -= dt; if (this.stepT <= 0) { this.stepT = 0.17; puff(this.x - this.facing * 0.2, this.y + 0.05, 1, 0x8b949e, 0.5, 0.4, 1); sfx.step(); } }
  }
  // the hero's limbs come from clips; this only decides how far the whole body leans (positive = forward)
  poseHero(run) {
    let lean = run * 0.1;
    const a = this.atk;
    if (this.state === 'attack' && a) {
      const wind = a.t < a.hitAt;
      lean = a.kind === 'slam' ? (wind ? -0.1 : 0.55) : a.kind === 'launcher' ? (wind ? 0.05 : -0.25) : (wind ? -0.05 : 0.2);
    }
    if (this.state === 'dash') lean = 0.55;
    if (this.state === 'cast') lean = this.castSlot === 's2' || this.castSlot === 's1' ? -0.08 : 0.08;
    if (this.guarding) lean = this.key === 'earth' ? 0.12 : -0.05;
    if (this.stun > 0) lean = -0.3;
    if (!this.onGround && this.state === 'free') lean = clamp(-this.vy / 70, -0.1, 0.16);
    if (this.skate && this.state === 'free' && this.onGround) lean = 0;
    this.leanT = lean;
  }
  poseLegacy(dt, run, gnd, t) {
    // legs
    let legA = Math.sin(this.runPhase) * 0.95 * run, legB = -legA;
    if (!gnd) { const up = clamp(this.vy / 14, -1, 1); legA = 0.5 - up * 0.3; legB = -0.4 + up * 0.2; }
    this.legL.rotation.z = damp(this.legL.rotation.z, legA, 25, dt); this.legR.rotation.z = damp(this.legR.rotation.z, legB, 25, dt);
    // torso lean & arms
    let lean = -run * 0.16, armF = -Math.sin(this.runPhase) * 0.9 * run, armB = Math.sin(this.runPhase) * 0.9 * run;
    let bob = Math.abs(Math.sin(this.runPhase)) * 0.07 * run + (gnd && run < 0.1 ? Math.sin(t * 2.2) * 0.012 : 0);
    if (!gnd) { armF = 1.2 + clamp(-this.vy / 20, 0, 1) * 0.8; armB = -armF * 0.5; lean = clamp(-this.vy / 60, -0.2, 0.25) - 0.1; }
    if (this.state === 'dash') { lean = -0.75; armF = -2.4; armB = -2.2; this.legL.rotation.z = 1.0; this.legR.rotation.z = -1.1; }
    if (this.state === 'attack') {
      const a = this.atk, cfg = a.i;
      const wind = clamp(a.t / Math.max(0.01, a.hitAt), 0, 1), sw = clamp((a.t - a.hitAt) / (a.dur * 0.5), 0, 1);
      const ang = a.t < a.hitAt ? lerp(-0.4, -2.1, wind) : lerp(-2.1, 2.2, easeOut(sw));
      if (this.key === 'earth') { armF = a.t < a.hitAt ? lerp(0, 2.8, wind) : lerp(2.8, 0.3, easeOut(sw)); armB = armF * 0.8; lean = a.t < a.hitAt ? 0.15 : -0.4; }
      else if (a.i % 2 === 0) { armF = ang; armB = ang * 0.3; lean = a.t < a.hitAt ? 0.1 : -0.4; }
      else { armB = ang; armF = -ang * 0.2; lean = a.t < a.hitAt ? 0.15 : -0.45; }
    }
    if (this.state === 'cast') { const k = clamp(this.castT / 0.12, 0, 1); armF = lerp(armF, 1.6, k); armB = lerp(armB, 1.5, k); lean = lerp(lean, -0.15, k); if (this.castSlot === 's2' || this.castSlot === 's1') { armF = 2.9; armB = 2.7; lean = 0.1; } }
    if (this.guarding) { armF = 1.7; armB = 1.5; lean = this.key === 'earth' ? 0.2 : -0.12; }
    if (this.stun > 0) { lean = 0.4; armF = -0.8; armB = -0.8; }
    this.torso.rotation.z = damp(this.torso.rotation.z, lean, 20, dt);
    this.armF.rotation.z = damp(this.armF.rotation.z, armF, 28, dt); this.armB.rotation.z = damp(this.armB.rotation.z, armB, 28, dt);
    this.head.rotation.z = damp(this.head.rotation.z, -lean * 0.5 + (gnd ? 0 : -0.1), 12, dt);
    this.crest.rotation.y += dt * 2; this.crest.rotation.z = Math.sin(t * 3) * 0.2;
    this.hips.position.y = 0.88 + bob - (this.guarding ? 0.08 : 0);
    return bob;
  }
  syncModel() { this.group.position.set(this.x, this.y, 0); this.shieldRoot.position.set(this.x, this.y, 0); }

  fxTick(dt) {
    const c = this.el.color, c2 = this.el.color2, t = G.time;
    const hand = (i) => this.hands[i].getWorldPosition(_hv);
    const rate = this.state === 'cast' || this.guarding ? 0.9 : 0.25;
    if (Math.random() < rate) { const p = hand(Math.random() < 0.5 ? 0 : 1); glow.emit(p.x, p.y, p.z, rand(-0.5, 0.5), rand(0.5, 1.5), 0, rgb(c2, 1.8), 0.2, 0, 0.4); }
    // ambient aura per element
    if (Math.random() < 0.55) {
      const x = this.x + rand(-0.4, 0.4), y = this.y + rand(0.1, 1.7);
      if (this.key === 'fire') glow.emit(x, y, rand(-0.3, 0.3), rand(-0.3, 0.3), rand(1, 2.4), 0, rgb(Math.random() < 0.5 ? c : c2, 1.6), rand(0.15, 0.3), 0, 0.7, -1);
      else if (this.key === 'water') glow.emit(x, y, rand(-0.3, 0.3), rand(-0.3, 0.3), rand(0.4, 1.4), 0, rgb(Math.random() < 0.5 ? c : c2, 1.4), rand(0.12, 0.22), 0, 0.9, -0.5);
      else if (this.key === 'earth') glow.emit(x, this.y + rand(0, 0.5), rand(-0.3, 0.3), rand(-0.3, 0.3), rand(0.2, 0.8), 0, rgb(c, 1.1), rand(0.1, 0.2), 0, 0.8, 1);
      else { const a = t * 4 + rand(6); glow.emit(this.x + Math.cos(a) * 0.7, this.y + 0.9 + Math.sin(a * 0.5) * 0.8, Math.sin(a) * 0.5, -Math.sin(a) * 2, 0.3, Math.cos(a), rgb(Math.random() < 0.5 ? c : c2, 1.4), rand(0.1, 0.2), 0, 0.5); }
    }
    if (this.fly > 0) for (let i = 0; i < 3; i++) glow.emit(this.x + rand(-0.4, 0.4), this.y + rand(0, 1.8), rand(-0.3, 0.3), -this.vx * 0.2 + rand(-1, 1), rand(-1, 1), 0, rgb(0xcfe9ff, 1.6), rand(0.2, 0.4), 0, 0.5);
    if (this.guarding && this.key === 'fire') glow.emit(this.x + this.facing * rand(0.4, 1.4), this.y + rand(0, 2), 0.2, 0, rand(2, 5), 0, rgb(Math.random() < 0.5 ? c : c2, 1.8), rand(0.3, 0.5), 0, 0.5);
    if (this.guarding && this.key === 'air') glow.emit(this.x + this.facing * 1.8, this.y + rand(0, 2), rand(-0.5, 0.5), -this.facing * rand(8, 14), rand(-1, 1), 0, rgb(0xcfe9ff, 1.5), 0.25, 0, 0.35);
  }

  respawn(x) {
    this.dead = false; this.hp = this.hpMax; this.energy = this.energyMax * 0.5; this.x = x; this.y = groundAt(x) + 0.1; this.vx = this.vy = 0;
    this.hurtI = 2; this.state = 'free'; this.atk = null; this.guarding = false; this.dash = null; this.stun = 0; this.group.visible = true;
    this.skate = false; this.heat = 0; this.blaze = 0; this.kickT = 0; this.flipT = 0; this.emote = null; this.grind = null;
    this.fly = 0; this.haste = 0; this.dmgBuff = 1; this.slam = null; this.safeX = x; this.airHits = 0; this.acombo = 0; this.cheering = false; this.deadT = 0; this.blink = 0; this.counterT = 0; this.lastKind = ''; for (const k in this.buf) this.buf[k] = 0;
    this.hero?.reset();
    for (const k in this.cd) this.cd[k] = 0;
    this.syncModel();
  }
}
