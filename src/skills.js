// Skill trees (3 element branches + the Resonance branch, 3 tiers each), progression and persistence.
// A node's `fx` is merged into player.mods: numbers add up, booleans OR.

export const TREE_BRANCHES = {
  fire: ['Blaze', 'Inferno', 'Ember', 'Resonance'],
  water: ['Tide', 'Flow', 'Ebb', 'Resonance'],
  earth: ['Stone', 'Tectonic', 'Bedrock', 'Resonance'],
  air: ['Gale', 'Sky', 'Zephyr', 'Resonance'],
};
const n = (id, branch, tier, name, desc, fx, icon) => ({ id, branch, tier, name, desc, fx, icon, cost: tier === 2 ? 2 : 1 });

export const SKILLS = {
  fire: [
    n('f1', 0, 0, 'Kindling', '+20% damage on all your flames.', { allDmg: 0.2 }, '✦'),
    n('f2', 0, 1, 'Searing Edge', 'Main attacks ignite enemies — burning deals heavy damage over time.', { burnMain: true }, '♨'),
    n('f3', 0, 2, 'Combustion', 'Burning enemies EXPLODE when they die, chaining fire to their friends.', { deathExplode: true }, '✺'),
    n('f4', 1, 0, 'Twin Embers', 'Fireball launches two embers in a spread.', { twinFire: true }, '⁂'),
    n('f5', 1, 1, 'Phoenix Wings', 'Phoenix Dash: −40% cooldown, +30% distance, leaves a longer firetrail.', { phoenixWings: true }, '❖'),
    n('f6', 1, 2, 'Armageddon', 'Meteor Storm rains +4 bigger meteors and shakes the whole map.', { armageddon: true }, '☄'),
    n('f7', 2, 0, 'Cinder Skin', '+30 max HP.', { hp: 30 }, '♥'),
    n('f8', 2, 1, 'Heat Haze', 'Parry window +70%. Perfect parries refresh Phoenix Dash.', { parry: 0.7, heatHaze: true }, '◈'),
    n('f9', 2, 2, 'Rebirth', 'Once per run, fatal damage revives you at 50% HP with a fire nova.', { rebirth: true }, '✹'),
  ],
  water: [
    n('w1', 0, 0, 'Riptide', '+20% damage on all your water attacks.', { allDmg: 0.2 }, '≈'),
    n('w2', 0, 1, 'Frostbite', 'Chilled enemies take +30% damage and are slowed more.', { frostbite: true }, '❄'),
    n('w3', 0, 2, 'Maelstrom', 'Water Bolts burst into 3 homing droplets on impact.', { split: true }, '❂'),
    n('w4', 1, 0, 'Surge', 'Tidal Wave crashes back after reaching its end.', { waveReturn: true }, '〰'),
    n('w5', 1, 1, 'Deluge', 'Healing Rain is larger, lasts +3s and heals 50% more.', { deluge: true }, '☂'),
    n('w6', 1, 2, 'Leviathan', 'Tidal Wave is gigantic, and special cooldowns are −25%.', { leviathan: true, cdr: 0.25 }, '◉'),
    n('w7', 2, 0, 'Deep Reservoir', '+20 max HP and +25 max energy.', { hp: 20, energy: 25 }, '♥'),
    n('w8', 2, 1, 'Mirror Surface', 'Perfect blocks heal 18 HP and refund 30 energy.', { mirror: true }, '◈'),
    n('w9', 2, 2, 'Tsunami Heart', 'Popped bubbles send out a wave. Slowly regenerate HP out of combat.', { tsunamiHeart: true, regen: 1.5 }, '✺'),
  ],
  earth: [
    n('e1', 0, 0, 'Granite Fists', '+25% damage on all your stone attacks.', { allDmg: 0.25 }, '▣'),
    n('e2', 0, 1, 'Seismic Strikes', 'Every combo hit sends a ground shockwave rolling forward.', { seismic: true }, '〰'),
    n('e3', 0, 2, 'Avalanche', 'Rock Throw shatters into a spray of homing shards.', { avalanche: true }, '⛰'),
    n('e4', 1, 0, 'Aftershock', 'Quake repeats itself with a second, larger tremor.', { aftershock: true }, '≋'),
    n('e5', 1, 1, 'Fortress', 'Stone Bastion raises 5 pillars that last twice as long.', { fortress: true }, '▥'),
    n('e6', 1, 2, 'Crushing Weight', 'Stunned enemies take +50% damage.', { crushing: true }, '⬢'),
    n('e7', 2, 0, 'Thick Hide', '+25 max HP and 10% damage reduction.', { hp: 25, dr: 0.1 }, '♥'),
    n('e8', 2, 1, 'Reflective Crust', 'Blocked hits are reflected as a shockwave.', { thorns: true }, '◈'),
    n('e9', 2, 2, 'Immovable', 'Guard while walking and regenerating. Perfect parries grant +40% damage for 4s.', { immovable: true }, '⬣'),
  ],
  air: [
    n('a1', 0, 0, 'Razor Winds', '+20% damage on all your wind attacks.', { allDmg: 0.2 }, '✧'),
    n('a2', 0, 1, 'Triple Cutter', 'Wind Cutter fires 3 blades in a fan.', { tripleCut: true }, '⋔'),
    n('a3', 0, 2, 'Hurricane Form', '+25% attack speed, and the 3rd hit unleashes a long-range slash.', { hurricane: true }, '꩜'),
    n('a4', 1, 0, 'Eye of the Storm', 'Cyclone is bigger, lasts longer and pulls harder.', { stormEye: true }, '◎'),
    n('a5', 1, 1, 'Wings', 'Sky Dance lasts +3s and recharges faster.', { wings: true }, '❦'),
    n('a6', 1, 2, 'Stormcaller', 'Cyclone calls lightning down on nearby enemies.', { cycloneBolts: true }, '⚡'),
    n('a7', 2, 0, 'Light Feet', '+15% move speed and a third jump.', { speed: 0.15, jumps: 1 }, '➶'),
    n('a8', 2, 1, 'Tailwind Parry', 'Perfect parries give 3s of haste and restore 30 energy.', { tailwindParry: true }, '◈'),
    n('a9', 2, 2, 'Vacuum Shield', 'Deflected projectiles deal triple damage and pierce. Dash cooldown −30%.', { vacuum: true, dashCd: 0.3 }, '✺'),
  ],
};

// Resonance: a secondary element that imbues every main attack (no new buttons)
for (const el of Object.keys(SKILLS)) {
  const k = el[0];
  SKILLS[el].push(
    n(k + 'r1', 3, 0, 'Attunement', 'Awaken a second element: choose one. Your main attacks (ground, launcher, air, slam) carry its status.', { resonance: true }, '☯'),
    n(k + 'r2', 3, 1, 'Harmony', 'The imbue is stronger: longer statuses, harder hits, more of its flavour.', { resPower: 1 }, '❖'),
    n(k + 'r3', 3, 2, 'Convergence', 'Your finishers (3rd hit, launcher, spike, slam) also detonate the secondary element.', { resPower: 1, resFinisher: true }, '✺'),
  );
}

export const BASE_MODS = { allDmg: 0, hp: 0, energy: 0, cdr: 0, speed: 0, dr: 0, parry: 0, regen: 0, jumps: 0, dashCd: 0, resPower: 0 };

export function computeMods(el, owned, res) {
  const m = { ...BASE_MODS };
  for (const s of SKILLS[el]) if (owned.includes(s.id)) {
    for (const [k, v] of Object.entries(s.fx)) m[k] = typeof v === 'boolean' ? m[k] || v : (m[k] || 0) + v;
  }
  m.resKey = m.resonance && res && res !== el ? res : null;
  return m;
}

// ----------------------------------------------------------------- progress / save
const KEY = 'elemental-commit-save-v1';
let save = { prog: {}, best: {}, train: {} };
try { save = { ...save, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* ignore */ }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* ignore */ } }

export function prog(el) {
  if (!save.prog[el]) save.prog[el] = { level: 1, xp: 0, owned: [], res: null };
  return save.prog[el];
}
export const xpNeed = (lvl) => 60 + lvl * 35;
export function spent(el) { return SKILLS[el].filter((s) => prog(el).owned.includes(s.id)).reduce((a, s) => a + s.cost, 0); }
export function pointsLeft(el) { return prog(el).level - spent(el); }
export const MAX_LEVEL = 16;

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
export function respec(el) { prog(el).owned = []; prog(el).res = null; persist(); }
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
