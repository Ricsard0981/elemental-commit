// which shader programs are created AFTER boot? usage: GAME_URL=... node t_progs.mjs <query> <quality>
import { open, sleep, gameWait, vpress } from './harness.mjs';
const { browser, page, errors } = await open({ query: process.argv[2] || '?debug', quality: process.argv[3] || 'medium' });
const snap = () => page.evaluate(() => window.__game.ENG.renderer.info.programs.map((p) => p.name + '|' + p.cacheKey.slice(0, 200)));
const base = new Set(await snap());
const added = [];
const check = async (label) => { for (const k of await snap()) if (!base.has(k)) { base.add(k); added.push(label + ' :: ' + k.slice(0, 160)); } };
for (const el of ['fire', 'water', 'earth', 'air']) {
  await page.evaluate((el) => window.__game.startTraining(el, 'sandbox'), el); await sleep(500); await check('start ' + el);
  await page.evaluate(() => { const g = window.__game, p = g.G.player; p.infEnergy = true; p.noCooldowns = true; g.G.trainAttack = true; for (const t of ['bug', 'pointer', 'brute']) g.spawnEnemy(t, p.x + 6, t === 'pointer' ? 4 : 0, { arena: 'train', spawnT: 0 }); });
  for (const a of [['main'], ['main'], ['main'], ['up', 'main'], ['ranged'], ['s1'], ['s2'], ['guard'], ['dash'], ['down', 'main']]) { await vpress(page, a, 0.09); await gameWait(page, 0.4); await check(el + ' ' + a.join('+')); }
}
console.log(JSON.stringify({ query: process.argv[2], quality: process.argv[3], added }, null, 1), errors);
await browser.close();
