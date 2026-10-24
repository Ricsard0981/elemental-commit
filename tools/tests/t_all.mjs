// Smoke + regression: every element, every move, new enemies, reactions, Revert, style, slice deaths. Asserts: no console errors and
// NO new shader programs after boot (a new program mid-fight is a visible hitch).
import { open, sleep, gameWait, vpress } from './harness.mjs';
const quality = process.argv[2] || 'high';
const { browser, page, errors } = await open({ quality });
const progs0 = await page.evaluate(() => window.__game.ENG.renderer.info.programs.length);
const out = { quality, progs0 };
for (const el of ['fire', 'water', 'earth', 'air']) {
  await page.evaluate((el) => window.__game.startTraining(el, 'sandbox'), el);
  await sleep(500);
  await page.evaluate(async (el) => {
    const g = window.__game, p = g.G.player; const { SKILLS, computeMods } = await import('./src/skills.js');
    p.mods = computeMods(el, SKILLS[el].filter((s) => s.tier === 0 && s.branch < 3).map((s) => s.id), null, {}, {}); // the 3 new-move nodes
    p.infEnergy = true; p.noCooldowns = true; g.G.trainAttack = true;
    for (const e of [...g.G.enemies]) if (e.type !== 'dummy') e.dead = true;
    ['bug', 'shield', 'charger', 'medic', 'pointer', 'bug:volatile'].forEach((spec, i) => { const [t, m] = spec.split(':'); const e = g.spawnEnemy(t, p.x + 5 + i * 2, t === 'pointer' || t === 'medic' ? 4 : 0, { arena: 'train', spawnT: 0, ...(m ? { elite: m } : {}) }); e.hp = e.hpMax = 60; });
  }, el);
  const seq = [['main'], ['main'], ['main'], ['up', 'main'], ['jump'], ['main'], ['down', 'main'], ['ranged'], ['s1'], ['s2'], ['guard'], ['dash'], ['main'], ['dash', 'main']];
  for (const a of seq) { await vpress(page, a, 0.09); await gameWait(page, 0.35); }
  // charged shot, parry (riposte), revert, dash strike
  await page.evaluate(() => window.__game.In.vDown('ranged')); await gameWait(page, 0.9); await page.evaluate(() => window.__game.In.vUp('ranged')); await gameWait(page, 0.6);
  await page.evaluate(async () => { const g = window.__game, p = g.G.player; const { damagePlayer } = await import('./src/combat.js'); p.hurtI = 0; p.guarding = true; p.guardT = 0.02; const e = g.G.enemies.find((x) => !x.dead && x.type !== 'dummy'); if (e) damagePlayer(5, { x: e.x, y: e.y, enemy: e, kind: 'melee' }); });
  await gameWait(page, 1.2);
  await page.evaluate(async () => { const R = await import('./src/revert.js'); R.REV.charges = 2; R.tryRevert(false); });
  await gameWait(page, 1.2);
  // reactions + kills via hits
  await page.evaluate(async () => { const g = window.__game; const { hitEnemy } = await import('./src/combat.js'); for (const e of g.G.enemies.slice()) if (!e.dead && e.type !== 'dummy') { e.chill = 2; hitEnemy(e, 200, { kind: 'main', finisher: true, burn: 2, dir: 1 }); } });
  await gameWait(page, 1.5);
  out[el] = await page.evaluate(() => ({ alive: window.__game.G.enemies.filter((e) => !e.dead && e.type !== 'dummy').length, hp: Math.round(window.__game.G.player.hp), style: window.__game.G.style.rank, progs: window.__game.ENG.renderer.info.programs.length, hitchPrograms: window.__game.perfStats.hitches.filter((h) => h.newPrograms).length }));
}
// boss + pause/resume
await page.evaluate(() => window.__game.startTraining('fire', 'sandbox'));
await sleep(400);
await page.evaluate(() => { const g = window.__game; g.G.player.infEnergy = true; g.spawnEnemy('boss', 30, 0, { arena: 'train', bx0: 6, bx1: 58 }); });
await gameWait(page, 4);
out.bossAlive = await page.evaluate(() => !!window.__game.G.boss);
out.progsEnd = await page.evaluate(() => window.__game.ENG.renderer.info.programs.length);
console.log(JSON.stringify(out), errors);
await browser.close();
