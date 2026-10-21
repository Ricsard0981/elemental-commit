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
  // Tier 1 of every branch is a NEW MOVE (a new verb, not a number). Tier 2 is a fat power node that bundles what used to be two
  // small ones. Tier 3 is the mastery (the middle branch's is an either/or fork).
  fire: [
    n('f1', 0, 0, 'Flame Lash', 'NEW MOVE: Attack right after a Dash to carve a 7 m blazing slash through the whole lane, igniting everything in it.', { dashStrike: true }, '⚔'),
    n('f2', 0, 1, 'Cinder Brand', 'Every hit ignites. Burning enemies take +40% from everything you do, and when one dies it sets everything within 7 m on fire.', { brand: true, burnMain: true, spreadBurn: true }, '✦'),
    n('f3', 0, 2, 'Inferno Mastery', 'Your 3rd ground hit slams a pillar of fire into the floor that burns for 4 s. Burning kills explode.', { firePillar: true, deathExplode: true }, '✺'),
    n('f4', 1, 0, 'Ember Cannon', 'NEW MOVE: Hold the Ranged button for 0.7 s, release: a huge fire orb that detonates for massive area damage.', { charge: true }, '◉'),
    n('f5', 1, 1, 'Phoenix Rising', 'Phoenix Dash: −40% cooldown, +30% distance, a lasting firetrail, and every enemy it ignites refunds your ranged cooldown and 15 energy.', { phoenixWings: true, cadence: true }, '❖'),
    n('f6', 1, 2, 'Meteor Mastery', 'Choose how Meteor Storm ends.', {}, '☄', [
      fork('a', 'Armageddon', 'Meteor Storm rains 9 bigger meteors and shakes the whole map.', { armageddon: true }, '☄'),
      fork('b', 'Solar Flare', 'Meteor Storm becomes ONE colossal meteor: huge blast, 1.4 s stun, burns everything.', { solarFlare: true }, '☀'),
    ]),
    n('f7', 2, 0, 'Flame Riposte', 'NEW MOVE: A perfect parry vanishes you beside the attacker and detonates it in a firestorm.', { riposte: true }, '◈'),
    n('f8', 2, 1, 'Burning Guard', 'Enemies that hit your guard catch fire and every block erupts in a nova. Perfect-parry window +50%, and parries refresh Phoenix Dash.', { burnGuard: true, parry: 0.5, heatHaze: true }, '◉'),
    n('f9', 2, 2, 'Rebirth', 'Once per run, fatal damage revives you at 50% HP with a fire nova.', { rebirth: true }, '✹'),
  ],
  water: [
    n('w1', 0, 0, 'Riptide Slash', 'NEW MOVE: Attack right after a Dash to slash through the lane and drag every enemy in it along with you, chilled.', { dashStrike: true }, '⚔'),
    n('w2', 0, 1, 'Deep Freeze', 'Three chilling hits freeze an enemy solid for 0.8 s. Chilled enemies take +45% damage and are slowed to 42% speed.', { freeze: true, frostbite: true }, '❄'),
    n('w3', 0, 2, 'Shatter', 'Launchers, finishers, spikes and slams shatter frozen enemies in an icy burst that chills their neighbours.', { shatter: true }, '❂'),
    n('w4', 1, 0, 'Frost Lance', 'NEW MOVE: Hold the Ranged button for 0.7 s, release: a piercing lance that freezes everything in a line.', { charge: true }, '➶'),
    n('w5', 1, 1, 'Riptide Surge', 'Water Bolts drag their target 3 m towards you, and Tidal Wave crashes back after reaching its end.', { riptide: true, waveReturn: true }, '〰'),
    n('w6', 1, 2, 'Tide Mastery', 'Choose the nature of your great wave.', {}, '◉', [
      fork('a', 'Leviathan', 'Tidal Wave becomes ONE colossal tsunami: screen-high, 30 m long, hurls everything skyward. Special cooldowns −25%.', { leviathan: true, cdr: 0.25 }, '◉'),
      fork('b', 'Undertow', 'Tidal Wave drags everything into its centre and freezes it for 5 s of chill.', { undertow: true }, '⟲'),
    ]),
    n('w7', 2, 0, 'Tidal Riposte', 'NEW MOVE: A perfect parry blinks you beside the attacker, heals you and drowns it in a chilling burst.', { riposte: true }, '◈'),
    n('w8', 2, 1, 'Mirror Tide', 'Perfect blocks heal 18 HP and refund 30 energy. Healing Rain is larger, lasts +3 s and heals 50% more.', { mirror: true, deluge: true }, '☔'),
    n('w9', 2, 2, 'Tsunami Heart', 'Perfect blocks send out a wave. Slowly regenerate HP out of combat.', { tsunamiHeart: true, regen: 1.5 }, '✺'),
  ],
  earth: [
    n('e1', 0, 0, 'Shoulder Charge', 'NEW MOVE: Attack right after a Dash to barge forward, armoured: a huge stagger and stun on everything in your way.', { dashStrike: true }, '⚔'),
    n('e2', 0, 1, 'Stonewill', 'Combo wind-ups cannot be interrupted (you take damage but keep swinging), and every combo hit sends a heavy shockwave rolling forward.', { stonewill: true, seismic: true }, '▣'),
    n('e3', 0, 2, 'Avalanche', 'Rock Throw shatters into a spray of homing shards.', { avalanche: true }, '⛰'),
    n('e4', 1, 0, 'Boulder Toss', 'NEW MOVE: Hold the Ranged button for 0.7 s, release: a gigantic boulder that crushes and stuns everything it lands on.', { charge: true }, '◉'),
    n('e5', 1, 1, 'Fortress', 'Quake repeats itself with a second, larger tremor. Stone Bastion raises 5 pillars that last twice as long.', { aftershock: true, fortress: true }, '▥'),
    n('e6', 1, 2, 'Tectonic Mastery', 'Choose what your earthquakes do to enemies.', {}, '⬢', [
      fork('a', 'Crushing Weight', 'Stunned enemies take +80% damage.', { crushing: true }, '⬢'),
      fork('b', 'Mountainfall', 'Quake calls down ONE colossal mountain: a crater-sized blast, 2.5 s stun, and shockwaves that LAUNCH everything they touch.', { mountainfall: true, spire: true }, '⛰'),
    ]),
    n('e7', 2, 0, 'Rockslide Riposte', 'NEW MOVE: A perfect parry makes the ground erupt under the attacker and launches it, with shockwaves in both directions.', { riposte: true }, '◈'),
    n('e8', 2, 1, 'Rebound', 'Every 3 blocked hits charge your next main attack: double damage and a heavy stagger. Blocked hits are also reflected as a shockwave.', { rebound: true, thorns: true }, '◉'),
    n('e9', 2, 2, 'Immovable', 'Guard while walking and regenerate while you keep blocking. Perfect parries grant +40% damage for 4 s.', { immovable: true }, '⬣'),
  ],
  air: [
    n('a1', 0, 0, 'Gale Rush', 'NEW MOVE: Attack right after a Dash for a four-cut flurry, and the dash is refunded so you can keep moving.', { dashStrike: true }, '⚔'),
    n('a2', 0, 1, 'Skyhook', 'Every air hit refunds your air dash and lifts the target higher. Wind Cutter fires 3 blades in a fan.', { skyhook: true, tripleCut: true }, '✧'),
    n('a3', 0, 2, 'Hurricane Form', '+25% attack speed, and the 3rd hit unleashes a long-range slash.', { hurricane: true }, '꩜'),
    n('a4', 1, 0, 'Tempest Disc', 'NEW MOVE: Hold the Ranged button for 0.7 s, release: a travelling whirlwind that drags enemies in and shreds them.', { charge: true }, '◎'),
    n('a5', 1, 1, 'Eye of the Storm', 'Cyclone is bigger, lasts longer and pulls harder. Sky Dance lasts +3 s and recharges faster.', { stormEye: true, wings: true }, '❦'),
    n('a6', 1, 2, 'Storm Mastery', 'Choose how the Cyclone finishes.', {}, '⚡', [
      fork('a', 'Stormcaller', 'Cyclone calls lightning down on nearby enemies.', { cycloneBolts: true }, '⚡'),
      fork('b', 'Maelstrom', 'Cyclone becomes ONE colossal storm: twice the size, drags everything in, and when it ends flings it all into the air.', { maelstrom: true, jetstream: true }, '꩜'),
    ]),
    n('a7', 2, 0, 'Zephyr Riposte', 'NEW MOVE: A perfect parry blinks you behind the attacker and carves it into the air.', { riposte: true }, '◈'),
    n('a8', 2, 1, 'Light Feet', '+15% move speed and a fourth jump. Perfect parries give 3 s of haste and restore 30 energy.', { speed: 0.15, jumps: 1, tailwindParry: true }, '➶'),
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
if (save.v !== 3) { for (const el of Object.keys(save.prog || {})) { save.prog[el].owned = []; save.prog[el].temper = {}; save.prog[el].fork = {}; } save.v = 3; try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* ignore */ } }
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
