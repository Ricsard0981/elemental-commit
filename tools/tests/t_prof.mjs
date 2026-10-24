// CPU profile of the scripted fight (self time by function). usage: GAME_URL=... node t_prof.mjs [query]
import { open, sleep, gameWait } from './harness.mjs';
const { browser, ctx, page, errors } = await open({ query: process.argv[2] || '?debug', quality: 'high', w: 1280, h: 720 });
await page.evaluate(() => window.__game.startTraining('fire', 'sandbox'));
await sleep(800);
await page.evaluate(() => {
  const g = window.__game, p = g.G.player; p.infEnergy = true; p.hp = p.hpMax = 99999; g.G.trainAttack = true;
  for (const e of [...g.G.enemies]) if (e.type !== 'dummy') e.dead = true;
  ['bug', 'bug', 'bug', 'pointer', 'brute', 'bug'].forEach((t, i) => { const e = g.spawnEnemy(t, p.x + 5 + i * 2.2, t === 'pointer' ? 4 : 0, { arena: 'train', spawnT: 0 }); e.hp = e.hpMax = 99999; });
  const seq = [['main'], ['main'], ['main'], ['up', 'main'], ['jump'], ['main'], ['main'], ['ranged'], ['s1'], ['guard'], ['s2'], ['dash']];
  let i = 0; window.__spam = setInterval(() => { const a = seq[i++ % seq.length]; a.forEach((x) => g.In.vDown(x)); setTimeout(() => a.forEach((x) => g.In.vUp(x)), 70); }, 140);
});
await gameWait(page, 2);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
await gameWait(page, 7);
const { profile } = await cdp.send('Profiler.stop');
const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
const dts = profile.timeDeltas; let total = 0;
profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + dts[i]); total += dts[i]; });
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28).map(([k, v]) => `${(v / 1000).toFixed(0).padStart(6)} ms ${(100 * v / total).toFixed(1).padStart(5)}%  ${k}`);
console.log('total ms', (total / 1000).toFixed(0)); console.log(top.join('\n'));
await page.evaluate(() => clearInterval(window.__spam));
await browser.close();
