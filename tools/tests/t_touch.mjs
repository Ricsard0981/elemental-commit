import { open, sleep, gameWait, shot } from './harness.mjs';
const { browser, ctx, page, errors } = await open({ mobile: true, query: '?debug' });
await page.evaluate(() => window.__game.startTraining('water', 'sandbox'));
await sleep(900);
await page.evaluate(() => { window.__game.G.player.infEnergy = true; });
await shot(page, 'touch_layout');
const rects = await page.evaluate(() => [...document.querySelectorAll('.tc-btn')].map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.id, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; }));
// overlap check
const ov = []; for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], b = rects[j]; const d = Math.hypot((a.x + a.w / 2) - (b.x + b.w / 2), (a.y + a.w / 2) - (b.y + b.w / 2)); if (d < (a.w + b.w) / 2 - 4) ov.push(a.id + '/' + b.id); }
// tap revert (needs charges: training gives 2) through real touch events on the button
const c = rects.find((r) => r.id === 'revert');
const cdp = await ctx.newCDPSession(page);
const tap = async (x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(80); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
await gameWait(page, 3.2);
const before = await page.evaluate(async () => (await import('./src/revert.js')).REV.charges);
await tap(c.x + c.w / 2, c.y + c.w / 2); await sleep(400);
const after = await page.evaluate(async () => (await import('./src/revert.js')).REV.charges);
console.log(JSON.stringify({ rects, overlaps: ov, revertCharges: [before, after] }), errors);
await browser.close();
