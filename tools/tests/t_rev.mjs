import { open, sleep, gameWait, vpress, shot } from './harness.mjs';
const { browser, page, errors } = await open({});
await page.evaluate(() => window.__game.startTraining('earth', 'sandbox'));
await sleep(500);
// walk right for ~2 s to build a path, then take damage and revert
await page.evaluate(() => window.__game.In.vDown('right'));
await gameWait(page, 2.2);
await page.evaluate(() => window.__game.In.vUp('right'));
const before = await page.evaluate(async () => { const g = window.__game, p = g.G.player; const R = await import('./src/revert.js'); window.__R = R; return { x: +p.x.toFixed(2), hp: p.hp, charges: R.REV.charges, snaps: R.REV.buf.length, oldestX: +R.REV.buf[0].px.toFixed(2) }; });
await page.evaluate(async () => { const g = window.__game, p = g.G.player; const { damagePlayer } = await import('./src/combat.js'); p.hurtI = 0; damagePlayer(30, { x: p.x + 1, y: p.y, kind: 'melee', enemy: null }); window.__R.tryRevert(false); });
await shot(page, 'revert_mid');
await gameWait(page, 1.2);
const after = await page.evaluate(() => { const g = window.__game, p = g.G.player, R = window.__R; return { x: +p.x.toFixed(2), hp: p.hp, charges: R.REV.charges, anim: !!R.REV.anim }; });
// lethal hit auto-revert
await gameWait(page, 1.0);
const lethal = await page.evaluate(async () => { const g = window.__game, p = g.G.player; const { damagePlayer } = await import('./src/combat.js'); const R = window.__R; R.REV.charges = 1; p.hurtI = 0; p.hp = 5; const r = damagePlayer(99, { x: p.x + 1, y: p.y, kind: 'melee' }); return { r, dead: p.dead, mode: g.G.mode, anim: !!R.REV.anim }; });
await gameWait(page, 1.2);
const end = await page.evaluate(() => { const p = window.__game.G.player; return { hp: p.hp, dead: p.dead, mode: window.__game.G.mode }; });
console.log(JSON.stringify({ before, after, lethal, end }), errors);
await browser.close();
