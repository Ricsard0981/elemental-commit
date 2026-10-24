import { open, sleep, gameWait, shot } from './harness.mjs';
const { browser, page, errors } = await open({});
await page.evaluate(() => window.__game.startTraining('fire', 'sandbox'));
await sleep(500);
// mock a controller
await page.evaluate(() => {
  window.__pad = { connected: true, mapping: 'standard', id: 'mock', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), vibrationActuator: { playEffect: (...a) => { (window.__rumble ||= []).push(a); return Promise.resolve(); } } };
  navigator.getGamepads = () => [window.__pad];
});
const r = {};
await page.evaluate(() => { window.__pad.axes[0] = 1; });
const x0 = await page.evaluate(() => window.__game.G.player.x); await gameWait(page, 0.6);
r.moved = (await page.evaluate(() => window.__game.G.player.x)) - x0;
await page.evaluate(() => { window.__pad.axes[0] = 0; window.__pad.buttons[2] = { pressed: true, value: 1 }; window.__ev = []; window.__game.EV.on('attack', (a) => window.__ev.push(a.kind)); });
await gameWait(page, 0.2); await page.evaluate(() => { window.__pad.buttons[2] = { pressed: false, value: 0 }; });
await gameWait(page, 0.3);
r.attack = await page.evaluate(() => window.__ev);
await page.evaluate(() => { window.__pad.axes[2] = 0.9; window.__pad.axes[3] = 0; });
await gameWait(page, 0.1);
r.aim = await page.evaluate(() => JSON.stringify(window.__game.In.touch.aim));
await page.evaluate(() => { window.__pad.axes[2] = 0; window.__pad.buttons[3] = { pressed: true, value: 1 }; });
await gameWait(page, 0.15); await page.evaluate(() => { window.__pad.buttons[3] = { pressed: false, value: 0 }; });
// remap via real UI
await page.evaluate(() => window.__game.openSettings());
await sleep(400);
const btn = await page.$('.keybtn[data-a="dash"]');
r.hasKeyBtn = !!btn;
if (btn) { await btn.click(); await page.keyboard.press('KeyV'); await sleep(300); r.dashKey = await page.evaluate(() => document.querySelector('.keybtn[data-a="dash"]').textContent); r.saved = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('elemental-commit-settings-v1')).keymap)); }
// difficulty via UI
const seg = await page.$$('.seg button'); 
console.log(JSON.stringify(r), errors);
await shot(page, 'settings_controls');
await browser.close();
