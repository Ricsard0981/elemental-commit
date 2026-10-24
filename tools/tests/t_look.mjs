import { open, sleep, gameWait, vpress, shot } from './harness.mjs';
const el = process.argv[2] || 'fire';
const { browser, page, errors } = await open({ query: '?debug', quality: process.argv[3] || 'high' });
await page.evaluate((el) => window.__game.startTraining(el, 'sandbox'), el); await sleep(1200);
await page.evaluate(() => { const g = window.__game, p = g.G.player; document.getElementById('lab')?.classList.add('closed'); p.infEnergy = true; g.cam.zoomLock = 1.0; for (const t of ['bug', 'shield']) g.spawnEnemy(t, p.x + 6, 0, { arena: 'train', spawnT: 0 }); });
await vpress(page, ['main'], 0.06); await gameWait(page, 0.2);
await shot(page, 'look_' + el);
console.log(errors); await browser.close();
