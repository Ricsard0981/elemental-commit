import { open, sleep, gameWait, vpress, shot } from './harness.mjs';
const { browser, page, errors } = await open({});
await page.evaluate(() => window.__game.startTraining('air', 'sandbox'));
await sleep(600);
await page.evaluate(() => { const g = window.__game, p = g.G.player; p.infEnergy = true; g.G.trainAttack = false; g.G.enemies.filter((e) => e.type === 'dummy').forEach((e, i) => { e.x = p.x + 1.6 + i * 30; }); });
const st = [];
for (let i = 0; i < 14; i++) { await vpress(page, ['main'], 0.05); await gameWait(page, 0.18); st.push(await page.evaluate(() => { const s = window.__game.G.style; return [Math.round(s.pts), s.rank]; })); }
console.log(JSON.stringify(st));
await shot(page, 'style_hud');
console.log(await page.evaluate(() => ({ rank: document.getElementById('style-rank').textContent, shown: document.getElementById('style').className })), errors);
await browser.close();
