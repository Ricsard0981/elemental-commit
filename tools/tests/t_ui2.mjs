import { open, sleep, shot } from './harness.mjs';
const { browser, page, errors } = await open({});
await page.evaluate(() => window.__game.startTraining('earth', 'sandbox')); await sleep(900);
await shot(page, 'ui_lab');
await page.evaluate(() => window.__game.openSettings()); await sleep(500); await shot(page, 'ui_settings');
console.log(errors); await browser.close();
