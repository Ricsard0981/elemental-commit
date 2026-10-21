// Shared mutable game state — every module reads/writes this single object.
export const G = {
  mode: 'menu', // menu | play | paused | dead | win
  time: 0, dt: 0, rdt: 0,
  ts: 1, tsTarget: 1, tsHold: 0, // time scale (slow-mo)
  freeze: 0, // hit-stop seconds
  player: null,
  enemies: [], projectiles: [], pickups: [], fx: [], timers: [],
  combo: { n: 0, t: 0, best: 0, rank: 0 },
  stats: { kills: 0, commits: 0, time: 0, parries: 0, damageTaken: 0 },
  element: 'fire',
  boss: null,
  training: null, trainAttack: true, trainRes: null, // Training Grounds
};
