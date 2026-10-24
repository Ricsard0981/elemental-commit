// Combat debug: a text overlay for the Training Grounds Lab ("Combat debug" toggle, off by default) and a snapshot for tests.
// Everything here is read-only; the overlay is one <pre> written at ~15 Hz, and nothing runs while it is off.
import { G } from './state.js';
import { directorState } from './enemies.js';
import { on } from './events.js';

let el = null, acc = 0, lastHit = '-';
on('playerHit', (h) => { lastHit = `${h.result} ${h.amount}`; });

export function snapshot() {
  const p = G.player; if (!p) return null;
  const a = p.atk;
  return {
    state: p.state, atk: a ? { kind: a.kind, i: a.i, t: +a.t.toFixed(3), hitAt: +a.hitAt.toFixed(3), cancelAt: +a.cancelAt.toFixed(3), dur: +a.dur.toFixed(3), struck: a.struck } : null,
    buf: Object.fromEntries(Object.entries(p.buf).filter(([, v]) => v > 0).map(([k, v]) => [k, +v.toFixed(2)])),
    guard: p.guarding ? { t: +p.guardT.toFixed(3), window: +p.parryWindow.toFixed(3) } : null,
    stun: +p.stun.toFixed(2), hurtI: +p.hurtI.toFixed(2), counterT: +(p.counterT || 0).toFixed(2),
    hitstop: +(G.freeze || 0).toFixed(3), timeScale: +G.ts.toFixed(2), combo: G.combo.n, lastHit,
    enemies: G.enemies.filter((e) => !e.dead).map((e) => ({ type: e.type, state: e.state, tele: +(e.tele || 0).toFixed(2), poise: Math.round(e.poise), juggle: e.juggle || 0, frozen: +(e.frozen || 0).toFixed(2) })),
    director: directorState(),
  };
}

export function setCombatDebug(on_) {
  if (on_ && !el) { el = document.createElement('pre'); el.id = 'combat-dbg'; el.style.cssText = 'position:fixed;left:8px;top:64px;z-index:30;margin:0;padding:6px 8px;font:11px/1.3 ui-monospace,monospace;color:#9fe8ff;background:rgba(1,4,9,.72);border-radius:8px;pointer-events:none;max-width:46vw;white-space:pre-wrap'; document.body.appendChild(el); }
  G.combatDbg = !!on_; if (el) el.style.display = on_ ? 'block' : 'none';
}

export function updateCombatDebug(rdt) {
  if (!G.combatDbg || !el) return;
  acc += rdt; if (acc < 0.066) return; acc = 0;
  const s = snapshot(); if (!s) return;
  const a = s.atk;
  el.textContent = `state ${s.state}  combo ${s.combo}  hit-stop ${s.hitstop}  ts ${s.timeScale}\n` +
    (a ? `atk ${a.kind}#${a.i}  t ${a.t}/${a.dur}  contact ${a.hitAt} ${a.struck ? '✓' : '·'}  cancel ${a.cancelAt}\n` : 'atk -\n') +
    `buf ${JSON.stringify(s.buf)}\n` + (s.guard ? `guard ${s.guard.t} / window ${s.guard.window}  ${s.guard.t <= s.guard.window ? 'PARRY' : 'block'}\n` : 'guard -\n') +
    `stun ${s.stun}  hurtI ${s.hurtI}  counter ${s.counterT}  last ${s.lastHit}\n` +
    `tokens ${JSON.stringify(s.director)}\n` + s.enemies.slice(0, 7).map((e) => `${e.type} ${e.state} tele ${e.tele} poise ${e.poise} jug ${e.juggle}${e.frozen ? ' ❄' + e.frozen : ''}`).join('\n');
}
