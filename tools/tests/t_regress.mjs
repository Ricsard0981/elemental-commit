import { open, sleep, gameWait, vpress } from './harness.mjs';
const { browser, page, errors } = await open({ query: '?debug' });
const ev = (f, a) => page.evaluate(f, a);
const out = {};
for (const el of ['water', 'earth', 'air', 'fire']) {
  await ev((k) => window.__game.startTraining(k, 'sandbox'), el); await sleep(900);
  await ev(() => { const g = window.__game, p = g.G.player; p.infEnergy = true; p.noCooldowns = true; g.G.trainAttack = false; g.spawnEnemy('bug', p.x + 2.2, 0, { arena: 'train', spawnT: 0 }); });
  for (const a of [['main'], ['main'], ['main'], ['up', 'main'], ['jump'], ['main'], ['dash'], ['s1'], ['s2'], ['stance'], ['emote1']]) { await vpress(page, a, 0.05); await gameWait(page, 0.35); }
  await gameWait(page, 1);
  out[el] = await ev(() => { const p = window.__game.G.player; return { skate: p.skate, stanceBtn: getComputedStyle(document.querySelector('.tc-stance')).display, hp: Math.round(p.hp), state: p.state }; });
}
console.log(JSON.stringify(out), JSON.stringify(errors));
await browser.close();
