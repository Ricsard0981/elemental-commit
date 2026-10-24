import { open, sleep, gameWait, shot } from './harness.mjs';
const { browser, page, errors } = await open({ mobile: true });
await page.click('#mode-seg button[data-mode="run"]'); await shot(page, 'm_menu');
await page.click('.card[data-el="fire"]'); await sleep(1200);
await page.evaluate(async () => { const { killEnemy } = await import('./src/combat.js'); for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 700)); for (const e of window.__game.G.enemies.slice()) if (!e.dead) killEnemy(e, { noSlice: true }); if (window.__game.G.mode === 'ui') break; } });
await gameWait(page, 3); 
for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.G.mode)) !== 'ui'; i++) { await page.evaluate(async () => { const { killEnemy } = await import('./src/combat.js'); for (const e of window.__game.G.enemies.slice()) if (!e.dead) killEnemy(e, { noSlice: true }); }); await gameWait(page, 1.5); }
await shot(page, 'm_patch');
const o = await page.evaluate(() => { const p = document.querySelector('#runui .panel'); const r = p.getBoundingClientRect(); return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, scroll: p.scrollHeight }; });
await page.click('#runui .patch-card >> nth=0'); await sleep(300); await shot(page, 'm_doors');
console.log(JSON.stringify(o), errors);
await browser.close();
