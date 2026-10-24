import { open, sleep, shot } from './harness.mjs';
const { browser, page, errors } = await open({});
const grab = async () => page.evaluate(() => { const r = window.__game.G.run; return JSON.stringify({ seed: r.seed, daily: r.daily, waves: r.waves }); });
const plans = [];
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => window.__game.toMenu?.());
  await page.click('#mode-seg button[data-mode="run"]'); await page.check('#daily-chk');
  await page.click('.card[data-el="air"]'); await sleep(900);
  plans.push(await grab());
  await page.evaluate(() => { document.dispatchEvent(new Event('x')); });
  await page.keyboard.press('Escape'); await sleep(200);
  await page.click('#btn-pause-menu').catch(() => {}); await sleep(500);
}
await shot(page, 'menu_daily');
console.log(plans[0] === plans[1] ? 'DAILY SAME' : 'DIFFERENT', plans[0].slice(0, 160), errors);
await browser.close();
