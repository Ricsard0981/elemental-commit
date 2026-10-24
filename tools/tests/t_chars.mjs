import { open, sleep, gameWait, shot, cropShot } from './harness.mjs';
const { browser, page, errors } = await open({ query: '?debug' });
for (const el of (process.argv[2] || 'fire,water,earth,air').split(',')) {
  await page.evaluate((el) => window.__game.startTraining(el, 'sandbox'), el); await sleep(1100);
  await page.evaluate(() => { const g = window.__game; document.getElementById('lab')?.classList.add('closed'); g.cam.zoomLock = 0.72; });
  await gameWait(page, 2.2);
  await cropShot(page, 'char_' + el, 230);
  await page.evaluate(() => { const g = window.__game, p = g.G.player; g.In.vDown('right'); });
  await gameWait(page, 0.5); await page.evaluate(() => window.__game.In.vUp('right'));
}
console.log(errors); await browser.close();
