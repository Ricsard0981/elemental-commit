// REVERT: the game's signature move. `git revert` as a verb.
// Perfect parries charge it (max 2). Pressing R, or taking a lethal hit, rewinds you about 3 seconds: position, HP and energy come back,
// every enemy attack in flight is cancelled and enemies return to where they stood, but what you have already killed stays dead
// and enemy damage is NOT undone, so it saves your run without undoing your progress.
import { G } from './state.js';
import { on } from './events.js';
import * as In from './input.js';
import { sfx } from './audio.js';
import { glow, rgb, ring, screenFlash, post, floatText, punchFov, shake, cam, SPRITE } from './engine.js';
import { endProj } from './combat.js';
import { resetDirector } from './enemies.js';
import { rand, lerp } from './util.js';

export const REV = { max: 2, charges: 0, anim: null, buf: [], acc: 0 };
const STEP = 0.1, KEEP = 30; // 10 snapshots a second, 3 seconds

export function resetRevert() { REV.charges = G.training ? 2 : 0; REV.buf.length = 0; REV.anim = null; REV.acc = 0; }
export function gainRevert(n = 1) {
  if (REV.charges >= REV.max) return; REV.charges = Math.min(REV.max, REV.charges + n);
  const p = G.player; if (p) floatText(p.x, p.y + 4.1, `REVERT ${'⟲'.repeat(REV.charges)}`, { color: '#7ff3d6', size: 18, dur: 1.0 });
  sfx.revertGain?.();
}
on('parry', () => gainRevert(1));

function snapshot() {
  const p = G.player;
  const s = { t: G.time, px: p.x, py: p.y, hp: p.hp, en: p.energy, face: p.facing, es: [] };
  for (const e of G.enemies) if (!e.dead && !e.boss && Math.abs(e.x - p.x) < 24) s.es.push({ e, x: e.x, y: e.y });
  REV.buf.push(s); if (REV.buf.length > KEEP) REV.buf.shift();
}

export function canRevert() { const p = G.player; return REV.charges >= 1 && !REV.anim && G.mode === 'play' && p && !p.dead && REV.buf.length >= 5; }
export function tryRevert(auto = false) {
  if (!canRevert()) return false;
  REV.charges--;
  const p = G.player, path = REV.buf.slice().reverse(); // newest → oldest
  REV.anim = { t: 0, dur: 0.62, path, target: path[path.length - 1], auto };
  sfx.revert?.();
  screenFlash(0x7ff3d6, 0.35); punchFov(-3); shake(0.3); cam.push = Math.max(cam.push, 0.4);
  floatText(p.x, p.y + 3.6, auto ? 'REVERTED' : 'REVERT', { color: '#7ff3d6', size: 30, dur: 1.2 });
  return true;
}
export function autoRevert() { return tryRevert(true); }

function finish() {
  const p = G.player, a = REV.anim, T = a.target;
  p.x = T.px; p.y = T.py; p.vx = 0; p.vy = 0; p.facing = T.face;
  p.hp = Math.max(p.hp, Math.min(p.hpMax, T.hp), a.auto ? p.hpMax * 0.35 : 0); p.energy = Math.max(p.energy, T.en);
  p.state = 'free'; p.atk = null; p.stun = 0; p.guarding = false; p.dash = null; p.dashInv = 0; p.slam = null; p.castT = 0; p.lockT = 0;
  p.hurtI = Math.max(p.hurtI, 1.4); p.dead = false;
  for (const k in p.buf) p.buf[k] = 0;
  for (const s of T.es) { const e = s.e; if (e.dead) continue; e.x = s.x; e.y = s.y; e.vx = 0; e.vy = 0; }
  for (const e of G.enemies) {
    if (e.dead || e.boss) continue;
    if (e.state !== 'stunned') e.state = 'idle'; e.tele = 0; e.cd = Math.max(e.cd || 0, 1.0); e.armorT = 0;
  }
  for (const pr of G.projectiles) if (pr.owner !== 'player' && !pr.dead) endProj(pr, false);
  resetDirector();
  ring(p.x, p.y + 1, 0.5, 0x7ff3d6, { r0: 0.2, r1: 6, dur: 0.7 }); ring(p.x, p.y + 1, 0.5, 0xffffff, { r0: 0.2, r1: 3, dur: 0.4 });
  screenFlash(0xffffff, 0.3); sfx.revertEnd?.();
  REV.anim = null; REV.buf.length = 0;
}

export function updateRevert(gdt, rdt) {
  const p = G.player; if (!p) return;
  const a = REV.anim;
  if (a) {
    // playback in REAL time while the world is held: you and the enemies run backwards along their recorded paths
    G.freeze = Math.max(G.freeze, rdt * 2.5);
    a.t += rdt;
    const k = Math.min(1, a.t / a.dur), f = k * k * (3 - 2 * k) * (a.path.length - 1), i = Math.min(a.path.length - 2, Math.floor(f)), u = f - i;
    const A = a.path[i], B = a.path[i + 1] || A;
    p.x = lerp(A.px, B.px, u); p.y = lerp(A.py, B.py, u);
    const ea = new Map(A.es.map((s) => [s.e, s]));
    for (const sb of B.es) { const sa = ea.get(sb.e); if (sb.e.dead) continue; const x = sa ? lerp(sa.x, sb.x, u) : sb.x, y = sa ? lerp(sa.y, sb.y, u) : sb.y; sb.e.x = x; sb.e.y = y; sb.e.group.position.set(x, y, sb.e.group.position.z); }
    p.syncModel?.();
    post.aberr = Math.max(post.aberr, 0.03); post.desat = Math.max(post.desat, 0.45);
    for (let j = 0; j < 3; j++) glow.emit(p.x + rand(-0.4, 0.4), p.y + rand(0.1, 1.9), 0.3, rand(-2, 2), rand(-1, 3), 0, rgb(j % 2 ? 0x7ff3d6 : 0xffffff, 2.2), 0.3, 0.02, 0.35, 0, 1.5, SPRITE.streak);
    if (k >= 1) finish();
    return;
  }
  if (G.mode !== 'play' || p.dead) return;
  REV.acc += gdt;
  if (REV.acc >= STEP) { REV.acc = 0; snapshot(); }
  if (In.hitNow('revert')) tryRevert(false);
}
