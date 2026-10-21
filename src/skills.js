// Skill trees: 3 mechanic branches + Resonance per element, a Tier-3 FORK in the middle branch, and a separate stat track
// ("Tempering"), so the tree is about decisions rather than numbers. A node's `fx` is merged into player.mods:
// numbers add up, booleans OR. Design (docs/COMBAT_LOCK.md §Progression): every branch node either unlocks a mechanic
// (tier 1), modifies it (tier 2) or masters it (tier 3). Plain stat bumps live in TEMPER only.

export const TREE_BRANCHES = {
  fire: ['Ignition', 'Wildfire', 'Pyre', 'Resonance'],
  water: ['Tide', 'Flow', 'Mirror', 'Resonance'],
  earth: ['Stone', 'Tectonic', 'Bedrock', 'Resonance'],
  air: ['Gale', 'Sky', 'Zephyr', 'Resonance'],
};
const n = (id, branch, tier, name, desc, fx, icon, forks) => ({ id, branch, tier, name, desc, fx, icon, forks, cost: tier === 2 ? 2 : 1 });
const fork = (id, name, desc, fx, icon) => ({ id, name, desc, fx, icon });

export const SKILLS = {
  fire: [
    n('f1', 0, 0, 'Cinder Brand', 'Every main hit ignites, and burning targets take +40% damage from everything you do.', { brand: true, burnMain: true }, '✦'),
    n('f2', 0, 1, 'Spreading Embers', 'Enemies that die while burning set everything within 7 m on fire.', { spreadBurn: true }, '♨'),
    n('f3', 0, 2, 'Inferno Mastery', 'Your 3rd ground hit slams a pillar of fire into the floor that burns for 3 s. Burning kills explode.', { firePillar: true, deathExplode: true }, '✺'),
    n('f4', 1, 0, 'Phoenix Cadence', 'Phoenix Dash refunds your ranged cooldown and 15 energy for every enemy it ignites.', { cadence: true }, '⁂'),
    n('f5', 1, 1, 'Wildfire Trail', 'Phoenix Dash: −40% cooldown, +30% distance and a firetrail that keeps burning.', { phoenixWings: true }, '❖'),
    n('f6', 1, 2, 'Meteor Mastery', 'Choose how Meteor Storm ends.', {}, '☄', [
      fork('a', 'Armageddon', 'Meteor Storm rains 9 bigger meteors and shakes the whole map.', { armageddon: true }, '☄'),
      fork('b', 'Solar Flare', 'Meteor Storm becomes ONE colossal meteor: huge blast, 1.4 s stun, burns everything.', { solarFlare: true }, '☀'),
    ]),
    n('f7', 2, 0, 'Burning Guard', 'Enemies that strike your guard catch fire, and every block erupts in a small fire nova.', { burnGuard: true }, '◈'),
    n('f8', 2, 1, 'Heat Haze', 'Perfect-parry window +50%. Perfect parries refresh Phoenix Dash.', { parry: 0.5, heatHaze: true }, '◉'),
    n('f9', 2, 2, 'Rebirth', 'Once per run, fatal damage revives you at 50% HP with a fire nova.', { rebirth: true }, '✹'),
  ],
  water: [
    n('w1', 0, 0, 'Deep Chill', 'Three chilling hits freeze an enemy solid for 0.8 s: stunned, and ready to shatter.', { freeze: true }, '❄'),
    n('w2', 0, 1, 'Frostbite', 'Chilled enemies take +45% damage and are slowed to 40% speed.', { frostbite: true }, '≈'),
    n('w3', 0, 2, 'Shatter', 'Launchers, finishers, spikes and slams shatter frozen enemies in an icy burst that chills their neighbours.', { shatter: true }, '❂'),
    n('w4', 1, 0, 'Riptide Pull', 'Water Bolts drag their target 3 m towards you, setting up launchers.', { riptide: true }, '〰'),
    n('w5', 1, 1, 'Surge', 'Tidal Wave crashes back after reaching its end.', { waveReturn: true }, '☂'),
    n('w6', 1, 2, 'Tide Mastery', 'Choose the nature of your great wave.', {}, '◉', [
      fork('a', 'Leviathan', 'Tidal Wave becomes ONE colossal tsunami: screen-high, 30 m long, hurls everything skyward. Special cooldowns −25%.', { leviathan: true, cdr: 0.25 }, '◉'),
      fork('b', 'Undertow', 'Tidal Wave drags everything into its centre and freezes it for 5 s of chill.', { undertow: true }, '⟲'),
    ]),
    n('w7', 2, 0, 'Mirror Tide', 'Perfect blocks heal 18 HP and refund 30 energy.', { mirror: true }, '◈'),
    n('w8', 2, 1, 'Deluge', 'Healing Rain is larger, lasts +3 s and heals 50% more.', { deluge: true }, '☔'),
    n('w9', 2, 2, 'Tsunami Heart', 'Perfect blocks send out a wave. Slowly regenerate HP out of combat.', { tsunamiHeart: true, regen: 1.5 }, '✺'),
  ],
  earth: [
    n('e1', 0, 0, 'Stonewill', 'While winding up a combo hit you cannot be knocked out of it: you still take damage, but you keep swinging.', { stonewill: true }, '▣'),
    n('e2', 0, 1, 'Seismic Strikes', 'Every combo hit sends a heavy ground shockwave rolling forward (the third also stuns).', { seismic: true }, '〰'),
    n('e3', 0, 2, 'Avalanche', 'Rock Throw shatters into a spray of homing shards.', { avalanche: true }, '⛰'),
    n('e4', 1, 0, 'Aftershock', 'Quake repeats itself with a second, larger tremor.', { aftershock: true }, '≋'),
    n('e5', 1, 1, 'Fortress', 'Stone Bastion raises 5 pillars that last twice as long.', { fortress: true }, '▥'),
    n('e6', 1, 2, 'Tectonic Mastery', 'Choose what your earthquakes do to enemies.', {}, '⬢', [
      fork('a', 'Crushing Weight', 'Stunned enemies take +80% damage.', { crushing: true }, '⬢'),
      fork('b', 'Mountainfall', 'Quake calls down ONE colossal mountain: a crater-sized blast, 2.5 s stun, and shockwaves that LAUNCH everything they touch.', { mountainfall: true, spire: true }, '⛰'),
    ]),
    n('e7', 2, 0, 'Rebound', 'Every 3 blocked hits charge your next main attack: double damage and a heavy stagger.', { rebound: true }, '◈'),
    n('e8', 2, 1, 'Reflective Crust', 'Blocked hits are reflected as a shockwave.', { thorns: true }, '◉'),
    n('e9', 2, 2, 'Immovable', 'Guard while walking and regenerate while you keep blocking. Perfect parries grant +40% damage for 4 s.', { immovable: true }, '⬣'),
  ],
  air: [
    n('a1', 0, 0, 'Skyhook', 'Every air hit refunds your air dash and lifts the target a little higher: the chain never runs out of tools.', { skyhook: true }, '✧'),
    n('a2', 0, 1, 'Triple Cutter', 'Wind Cutter fires 3 blades in a fan.', { tripleCut: true }, '⋔'),
    n('a3', 0, 2, 'Hurricane Form', '+25% attack speed, and the 3rd hit unleashes a long-range slash.', { hurricane: true }, '꩜'),
    n('a4', 1, 0, 'Eye of the Storm', 'Cyclone is bigger, lasts longer and pulls harder.', { stormEye: true }, '◎'),
    n('a5', 1, 1, 'Wings', 'Sky Dance lasts +3 s and recharges faster.', { wings: true }, '❦'),
    n('a6', 1, 2, 'Storm Mastery', 'Choose how the Cyclone finishes.', {}, '⚡', [
      fork('a', 'Stormcaller', 'Cyclone calls lightning down on nearby enemies.', { cycloneBolts: true }, '⚡'),
      fork('b', 'Maelstrom', 'Cyclone becomes ONE colossal storm: twice the size, drags everything in, and when it ends flings it all into the air.', { maelstrom: true, jetstream: true }, '🌀'),
    ]),
    n('a7', 2, 0, 'Light Feet', '+15% move speed and a third jump.', { speed: 0.15, jumps: 1 }, '➶'),
    n('a8', 2, 1, 'Tailwind Parry', 'Perfect parries give 3 s of haste and restore 30 energy.', { tailwindParry: true }, '◈'),
    n('a9', 2, 2, 'Vacuum Shield', 'Deflected projectiles deal triple damage and pierce. Dash cooldown −30%.', { vacuum: true, dashCd: 0.3 }, '✺'),
  ],
};

// Resonance: a secondary element that imbues every main attack (no new buttons)
for (const el of Object.keys(SKILLS)) {
  const k = el[0];
  SKILLS[el].push(
    n(k + 'r1', 3, 0, 'Attunement', 'Awaken a second element: choose one. Your main attacks (ground, launcher, air, slam) carry its status.', { resonance: true }, '☯'),
    n(k + 'r2', 3, 1, 'Harmony', 'The imbue is stronger: longer statuses, harder hits, more of its flavour.', { resPower: 1 }, '❖'),
    n(k + 'r3', 3, 2, 'Convergence', 'Your finishers (3rd ground hit, launcher, spike, slam) also detonate the secondary element.', { resPower: 1, resFinisher: true }, '✺'),
  );
}

// Tempering: the stat track (shared by every element, ranked, 1 point per rank). Stats are a choice too: there are far more
// ranks (15) than spare points, so you cannot buy everything.
export const TEMPER = [
  { id: 't_hp', name: 'Vitality', per: '+15 max HP', fx: { hp: 15 }, icon: '♥', max: 3 },
  { id: 't_en', name: 'Reservoir', per: '+15 max energy', fx: { energy: 15 }, icon: '◆', max: 3 },
  { id: 't_dmg', name: 'Edge', per: '+5% damage', fx: { allDmg: 0.05 }, icon: '✦', max: 3 },
  { id: 't_spd', name: 'Swiftness', per: '+4% move speed', fx: { speed: 0.04 }, icon: '➶', max: 3 },
  { id: 't_cdr', name: 'Focus', per: '−4% special cooldowns', fx: { cdr: 0.04 }, icon: '◎', max: 3 },
];

export const BASE_MODS = { allDmg: 0, hp: 0, energy: 0, cdr: 0, speed: 0, dr: 0, parry: 0, regen: 0, jumps: 0, dashCd: 0, resPower: 0 };

const addFx = (m, fx) => { for (const [k, v] of Object.entries(fx)) m[k] = typeof v === 'boolean' ? m[k] || v : (m[k] || 0) + v; };
export function computeMods(el, owned, res, temper = {}, forks = {}) {
  const m = { ...BASE_MODS };
  for (const s of SKILLS[el]) if (owned.includes(s.id)) {
    addFx(m, s.fx);
    if (s.forks) addFx(m, (s.forks.find((f) => f.id === forks[s.id]) || s.forks[0]).fx);
  }
  for (const t of TEMPER) { const r = temper[t.id] || 0; for (let i = 0; i < r; i++) addFx(m, t.fx); }
  m.resKey = m.resonance && res && res !== el ? res : null;
  return m;
}

// ----------------------------------------------------------------- progress / save
const KEY = 'elemental-commit-save-v1';
let save = { prog: {}, best: {}, train: {} };
try { save = { ...save, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* ignore */ }
// v2: the trees were rewritten around mechanics. Old node ids mean different things now, so owned nodes are refunded
// (points are derived from level, so nothing is lost); level, xp, Resonance pick and records are kept.
if (save.v !== 2) { for (const el of Object.keys(save.prog || {})) { save.prog[el].owned = []; save.prog[el].temper = {}; save.prog[el].fork = {}; } save.v = 2; try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* ignore */ } }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* ignore */ } }

export function prog(el) {
  if (!save.prog[el]) save.prog[el] = { level: 1, xp: 0, owned: [], res: null, temper: {}, fork: {} };
  const p = save.prog[el]; p.temper ||= {}; p.fork ||= {};
  return p;
}
export const xpNeed = (lvl) => 60 + lvl * 35;
export function spent(el) { return SKILLS[el].filter((s) => prog(el).owned.includes(s.id)).reduce((a, s) => a + s.cost, 0) + Object.values(prog(el).temper).reduce((a, b) => a + b, 0); }
export function pointsLeft(el) { return prog(el).level - spent(el); }
export const MAX_LEVEL = 24; // the trees cost 16 and Tempering up to 15 more: you choose, you cannot own everything

export function addXP(el, amount) {
  const p = prog(el); let ups = 0;
  if (p.level >= MAX_LEVEL) return 0;
  p.xp += amount;
  while (p.level < MAX_LEVEL && p.xp >= xpNeed(p.level)) { p.xp -= xpNeed(p.level); p.level++; ups++; }
  persist(); return ups;
}
export function canBuy(el, s) {
  const p = prog(el);
  if (p.owned.includes(s.id)) return false;
  if (s.tier > 0 && !p.owned.includes(SKILLS[el].find((x) => x.branch === s.branch && x.tier === s.tier - 1).id)) return false;
  return pointsLeft(el) >= s.cost;
}
export function isUnlocked(el, s) {
  return s.tier === 0 || prog(el).owned.includes(SKILLS[el].find((x) => x.branch === s.branch && x.tier === s.tier - 1).id);
}
export function buy(el, s) { if (!canBuy(el, s)) return false; prog(el).owned.push(s.id); persist(); return true; }
export function respec(el) { const p = prog(el); p.owned = []; p.res = null; p.temper = {}; p.fork = {}; persist(); }
export function temperRank(el, id) { return prog(el).temper[id] || 0; }
export function buyTemper(el, t) { const r = temperRank(el, t.id); if (r >= t.max || pointsLeft(el) < 1) return false; prog(el).temper[t.id] = r + 1; persist(); return true; }
export function setFork(el, nodeId, forkId) { prog(el).fork[nodeId] = forkId; persist(); }
export const forkOf = (el, s) => s.forks && (s.forks.find((f) => f.id === prog(el).fork[s.id]) || null);
export function setResonance(el, key) { prog(el).res = key; persist(); }
export function bestRun(el) { return save.best[el]; }
export function recordRun(el, r) { const b = save.best[el]; if (!b || r.score > b.score) { save.best[el] = r; persist(); return true; } return false; }
export function wipeSave() { save = { prog: {}, best: {}, train: {} }; persist(); }
// Training Grounds records (endless score, completed combo trials)
export function trainRecord(id) { return save.train?.[id]; }
export function trainSet(id, value, higherIsBetter = true) {
  save.train ||= {};
  const old = save.train[id];
  if (old === undefined || (higherIsBetter ? value > old : value < old)) { save.train[id] = value; persist(); return true; }
  return false;
}
