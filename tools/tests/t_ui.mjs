import { open, sleep, gameWait, vpress, shot } from './harness.mjs';
const mobile = process.argv[2] === 'mobile';
const { browser, page, errors } = await open({ mobile, query: '?debug' });
const tag = mobile ? 'ui_m_' : 'ui_';
await sleep(800); await shot(page, tag + 'menu');
await page.click('#mode-seg button[data-mode="run"]'); await page.click('.card[data-el="fire"]'); await sleep(1500);
await page.evaluate(() => { const g = window.__game, p = g.G.player; p.hp = 62; p.energy = 55; for (let i = 0; i < 4; i++) g.spawnEnemy(['bug', 'shield', 'brute', 'pointer'][i], p.x + 6 + i * 2, i === 3 ? 4 : 0, { arena: 'run', spawnT: 0 }); g.G.stats.commits = 34; });
for (const a of [['main'], ['main'], ['main'], ['up', 'main'], ['main']]) { await vpress(page, a, 0.08); await gameWait(page, 0.25); }
await page.evaluate(() => { window.__game.G.style.pts = 130; window.__game.G.style.rank = 3; window.__game.G.combo.n = 14; window.__game.G.combo.t = 3; });
await gameWait(page, 0.4); await shot(page, tag + 'hud');
await page.evaluate(() => window.__game.openSkills()); await sleep(600); await shot(page, tag + 'skills');
await page.evaluate(() => window.__game.closeSkills());
await page.keyboard.press('Escape'); await sleep(400); await shot(page, tag + 'pause');
console.log(errors);
await browser.close();
