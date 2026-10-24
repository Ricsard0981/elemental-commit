import { open, sleep, gameWait, shot } from './harness.mjs';
const { browser, page, errors } = await open({});
const log = [];
// real UI: pick Room Run, then Earth
await page.click('#mode-seg button[data-mode="run"]');
await page.click('.card[data-el="earth"]');
await sleep(1200);
const st = () => page.evaluate(() => { const g = window.__game, r = g.G.run; return r ? { mode: g.G.mode, room: r.rooms, type: r.type, wave: r.wave + '/' + r.waves.length, alive: g.G.enemies.filter((e) => !e.dead).length, patches: r.patches.length, revert: window.__R?.REV.charges } : null; });
log.push(['start', await st()]);
async function clearRoom() {
  for (let guard = 0; guard < 8; guard++) {
    await gameWait(page, 1.6);
    const s = await st();
    if (s.mode === 'ui') return;
    await page.evaluate(async () => { const { killEnemy } = await import('./src/combat.js'); for (const e of window.__game.G.enemies.slice()) if (!e.dead && e.type !== 'dummy' && !e.boss) killEnemy(e, { noSlice: true }); });
  }
}
await page.evaluate(async () => { window.__R = await import('./src/revert.js'); });
const seen = [];
for (let step = 0; step < 60; step++) {
  const s = await st(); if (!s) break;
  if (s.mode === 'ui') {
    const html = await page.evaluate(() => document.getElementById('runui').innerText.split('\n').slice(0, 3).join(' | '));
    seen.push(html.slice(0, 60));
    if (await page.$('#runui .patch-card')) { await page.click('#runui .patch-card >> nth=0'); }
    else if (await page.$('#runui .door-card')) { await shot(page, 'run_doors'); const ts = await page.$$eval('#runui .door-card', (els) => els.map((e) => e.dataset.t)); const pri = ['boss', 'minibos', 'shop', 'rest', 'elite', 'combat']; const t = pri.find((x) => ts.includes(x)); seen.push('door ' + t); await page.click('#runui .door-card[data-t="' + t + '"]'); }
    else if (await page.$('#runui .shop-card')) { await page.evaluate(() => { window.__game.G.stats.commits += 200; }); await page.click('#runui .shop-card >> nth=0'); await page.click('#runui #shop-done'); }
    else if (await page.$('#runui .rest-card')) { await page.click('#runui .rest-card >> nth=2'); }
    else if (await page.$('#runui #run-again')) { log.push('VICTORY'); break; }
    await sleep(300);
    continue;
  }
  if (s.type === 'boss') { log.push(['boss room', s]); await shot(page, 'run_boss'); await page.evaluate(async () => { const { killEnemy } = await import('./src/combat.js'); const b = window.__game.G.boss; if (b) { b.spawnT = 0; killEnemy(b, { noSlice: true }); } }); await gameWait(page, 4); continue; }
  await clearRoom();
}
log.push(['end', await st(), seen]);
await shot(page, 'run_end');
console.log(JSON.stringify(log), errors);
await browser.close();
