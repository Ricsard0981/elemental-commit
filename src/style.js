// Style meter (D → SSS). Points come from what you DO, not how long you survive:
//  - every hit is worth its kind (a launcher is worth more than a jab), but repeating the same move decays its value (variety)
//  - parries, perfect dodges, reactions, counters and kills add big chunks
//  - getting hit drops you a whole tier, and the meter drains while you stand still
// The rank feeds back into play: damage multiplier, energy gain and commit drops.
import { G } from './state.js';
import { on } from './events.js';
import { floatText } from './engine.js';

export const STYLE_NAMES = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
export const STYLE_COL = ['#8b949e', '#9fd0ff', '#7ee787', '#ffd33d', '#ff9a4d', '#ff6a2b', '#ff4d6d'];
const TIERS = [0, 25, 60, 110, 180, 280, 420];
const RECENT = 8;

export function resetStyle() { G.style = { pts: 0, rank: 0, idle: 0, recent: [], flash: 0, best: 0 }; }
resetStyle();

const BASE = { light: 6, ground: 6, airHit: 7, ranged: 4, special: 12, heavy: 9, finisher: 12, launcher: 10, spike: 14, bounce: 12, slam: 18 };
function moveId(o) { return (o.kind || 'x') + (o.finisher ? '+' : '') + (o.launch ? 'L' : '') + (o.spike ? 'S' : '') + (o.bounce ? 'B' : ''); }
function baseOf(o) {
  if (o.spike) return BASE.spike; if (o.bounce) return BASE.bounce; if (o.launch) return BASE.launcher; if (o.finisher) return BASE.finisher;
  return BASE[o.kind] ?? 6;
}

export function addStyle(n, label) {
  const s = G.style; if (!s) return;
  const before = s.rank;
  s.pts = Math.min(TIERS[6] + 120, s.pts + n); s.idle = 0; s.flash = 1;
  s.rank = rankFor(s.pts);
  s.best = Math.max(s.best, s.rank);
  if (s.rank > before) onRankUp(s.rank);
  if (label && G.player) floatText(G.player.x, G.player.y + 3.4, label, { color: STYLE_COL[Math.max(1, s.rank)], size: 17, dur: 0.8 });
}
function rankFor(pts) { let r = 0; for (let i = 0; i < TIERS.length; i++) if (pts >= TIERS[i]) r = i; return r; }
function onRankUp(r) {
  import('./ui.js').then((UI) => UI.styleRankUp?.(r));
}
export function dropStyle() { // being hit costs a full tier
  const s = G.style; if (!s || s.rank === 0) { if (s) s.pts = 0; return; }
  s.pts = Math.max(0, TIERS[s.rank - 1] + (TIERS[s.rank] - TIERS[s.rank - 1]) * 0.4);
  s.rank = rankFor(s.pts); s.flash = 1;
}
export const styleMult = () => 1 + 0.035 * (G.style ? G.style.rank : 0);      // damage
export const styleEnergy = () => 1 + 0.12 * (G.style ? G.style.rank : 0);     // energy gain per hit
export const styleLoot = () => 1 + 0.15 * (G.style ? G.style.rank : 0);       // commit drops
export function styleProgress() { const s = G.style; if (s.rank >= 6) return 1; return (s.pts - TIERS[s.rank]) / (TIERS[s.rank + 1] - TIERS[s.rank]); }

export function updateStyle(dt) {
  const s = G.style; if (!s || G.mode !== 'play') return;
  s.idle += dt; s.flash = Math.max(0, s.flash - dt * 3);
  if (s.idle > 1.6 && s.pts > 0) { s.pts = Math.max(TIERS[Math.max(0, s.rank - 1)] * 0.5, s.pts - dt * (3 + s.rank * 5)); s.rank = rankFor(s.pts); }
}

let wired = false;
export function initStyle() {
  if (wired) return; wired = true;
  on('hit', ({ o }) => {
    if (!o || o.noStyle) return;
    const s = G.style; if (!s) return;
    const id = moveId(o); const rec = s.recent;
    const repeats = rec.filter((x) => x === id).length;
    rec.push(id); if (rec.length > RECENT) rec.shift();
    const k = Math.max(0.2, 1 - 0.2 * repeats);
    addStyle(baseOf(o) * k, k < 0.6 && repeats >= 3 ? 'REPEATING' : null);
  });
  on('kill', ({ e }) => addStyle(e.heavy || e.boss ? 30 : 10));
  on('parry', () => addStyle(40, 'PARRY'));
  on('counter', () => addStyle(20, 'COUNTER'));
  on('perfectDodge', () => addStyle(30, 'DODGE'));
  on('reaction', ({ name }) => addStyle(28, name));
  on('stagger', () => addStyle(12));
  on('execute', () => addStyle(25, 'EXECUTION'));
  on('playerHit', ({ result }) => { if (result === 'hit') dropStyle(); });
}
