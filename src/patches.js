// PATCHES: temporary mutations you collect during a room run (one of three offered after a room). They are skill-tree-style `fx` flags
// merged into player.mods, so they stack with the permanent tree. Element patches only show up for your element; MERGE patches need
// your element AND your secondary (Resonance) element, which is what makes picking a secondary a real decision.
import { G } from './state.js';
import { rand } from './util.js';
import { addFx } from './skills.js';

const P = (id, name, desc, tag, rare, fx, extra = {}) => ({ id, name, desc, tag, rare, fx, ...extra });
export const PATCHES = [
  // universal
  P('quick', 'Quick Hands', 'Your swings are 12% faster.', 'any', 0, { atkSpeed: 0.12 }),
  P('practice', 'Perfect Practice', 'The parry window is 40% larger.', 'any', 0, { parry: 0.4 }),
  P('vamp', 'Vampiric Commits', 'Every third commit you collect heals 3 HP.', 'any', 0, { vampCommits: true }),
  P('overclock', 'Overclock', 'The Style meter fills 35% faster.', 'any', 0, { styleGain: 0.35 }),
  P('lastcommit', 'Last Commit', 'Revert holds one more charge, and you gain one now.', 'any', 0, { revertMax: 1 }, { onTake: (api) => api.gainRevert(1) }),
  P('magnet', 'Magnet', 'Commits and hearts fly to you from twice as far.', 'any', 0, { magnet: 1 }),
  P('chain', 'Chain Reaction', 'Reactions hit 60% harder and 30% wider.', 'any', 1, { reactBoost: 1 }),
  P('echo', 'Echo Strike', 'Every 4th main hit is repeated at 70% damage.', 'any', 1, { echoStrike: true }),
  P('exec', 'Executioner', 'Executions heal you for 8 HP and refill 20 energy.', 'any', 1, { execHeal: true }),
  P('glass', 'Glass Cannon', '+40% damage, but −30 max HP.', 'any', 1, { allDmg: 0.4, hp: -30 }),
  P('core', 'Resonance Core', 'Awakens a random secondary element for this run.', 'any', 1, { resonance: true }, { only: (r) => !r.hasRes, onTake: (api) => api.giveRes() }),
  // fire
  P('fuel', 'Fuel the Fire', 'Killing a burning enemy heals 4 HP and refunds 12 energy.', 'fire', 0, { fuelKill: true }),
  P('backdraft', 'Backdraft', 'A perfect parry erupts in a fire nova.', 'fire', 1, { backdraft: true }),
  P('ember', 'Ember Trail', 'Dashing leaves a burning lane behind you.', 'fire', 0, { dashFire: true }),
  // water
  P('frostdash', 'Undertow Dash', 'Your dash chills everything it passes through.', 'water', 0, { dashChill: true }),
  P('mist', 'Mist Step', 'A perfect dodge restores 35 energy and 6 HP.', 'water', 0, { mistStep: true }),
  // earth
  P('quake', 'Quake Steps', 'Hard landings send out a stunning shockwave.', 'earth', 0, { quakeLand: true }),
  P('granite', 'Granite Skin', '+25 max HP and 8% damage reduction.', 'earth', 0, { hp: 25, dr: 0.08 }),
  // air
  P('twodash', 'Double Dash', 'One extra air dash.', 'air', 0, { airDashes: 1 }),
  P('skyward', 'Skyward', 'Launchers throw enemies 30% higher.', 'air', 0, { liftMul: 0.3 }),
  // merge (element + secondary)
  P('pressure', 'Pressure Cooker', 'STEAM is 60% wider and heals you for 6 HP.', 'merge', 1, { mergeSteam: true }, { pair: ['fire', 'water'] }),
  P('forge', 'Forge', 'MAGMA leaves a burning pool for 4 seconds.', 'merge', 1, { mergeMagma: true }, { pair: ['fire', 'earth'] }),
  P('galewing', 'Wildfire Gale', 'FIRESTORM drags nearby enemies into the column first.', 'merge', 1, { mergeFirestorm: true }, { pair: ['fire', 'air'] }),
  P('silt', 'Silt', 'MUD slowly drains everything stuck in it.', 'merge', 1, { mergeMud: true }, { pair: ['water', 'earth'] }),
  P('devil', 'Dust Devil', 'SANDSTORM pulses three times.', 'merge', 1, { mergeSand: true }, { pair: ['earth', 'air'] }),
];
export const PATCH_EXTRA = { edge: P('edge', 'Whetstone', '+10% damage for this run.', 'any', 0, { allDmg: 0.1 }) };
export const patchById = (id) => PATCHES.find((p) => p.id === id) || PATCH_EXTRA[id];
export const TAG_COL = { any: '#9fd0ff', fire: '#ff6a2b', water: '#2ea8ff', earth: '#d9a05b', air: '#7ff3d6', merge: '#ffd33d' };

export function eligible(p, run) {
  if (run.patches.includes(p.id)) return false;
  if (p.only && !p.only(run)) return false;
  if (p.tag === 'any') return true;
  if (p.tag === 'merge') { const [a, b] = p.pair; const s = run.res; return !!s && ((run.key === a && s === b) || (run.key === b && s === a)); }
  return p.tag === run.key;
}
// n distinct offers, weighted: rare ones only appear when `rare` is true (elite / mini-boss rooms) or by a small chance otherwise
export function offerPatches(n, run, rare) {
  const pool = PATCHES.filter((p) => eligible(p, run));
  const out = [];
  while (out.length < n && pool.length) {
    const wantRare = rare ? Math.random() < 0.7 : Math.random() < 0.12;
    const sub = pool.filter((p) => (p.rare > 0) === wantRare);
    const src = sub.length ? sub : pool;
    // merge patches are rare AND exciting: weight them up so a good secondary actually pays off
    const w = src.map((p) => (p.tag === 'merge' ? 2.5 : 1)); let t = w.reduce((a, b) => a + b, 0) * Math.random(), i = 0;
    while (i < src.length - 1 && (t -= w[i]) > 0) i++;
    const pick = src[i]; out.push(pick); pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}
// merge this run's patches into a mods object (called from Player.refreshMods)
export function applyPatches(m) {
  const r = G.run; if (!r || !r.active) return;
  for (const id of r.patches) { const p = patchById(id); if (p) addFx(m, p.fx); }
}
