import { open, sleep, gameWait, vpress, shot } from './harness.mjs';
const { browser, page, errors } = await open({});
await page.evaluate(() => window.__game.startTraining('fire', 'sandbox'));
await sleep(500);
const res = {};
for (const [spec, label] of [['shield', 'shield'], ['charger', 'charger'], ['medic', 'medic'], ['bug:volatile', 'volatile'], ['shield:mini', 'mini']]) {
  const r = await page.evaluate(async (spec) => {
    const g = window.__game, p = g.G.player; const T = g.TR;
    for (const e of [...g.G.enemies]) if (e.type !== 'dummy') e.dead = true;
    const [type, mod] = spec.split(':');
    const e = g.spawnEnemy(type, p.x + 7, type === 'medic' ? 4 : 0, { arena: 'train', spawnT: 0, ...(mod === 'mini' ? { mini: true } : mod ? { elite: mod } : {}) });
    g.G.trainAttack = true; p.hurtI = 0; p.infEnergy = true; e.cd = 0.1;
    window.__st = new Set(); window.__e = e; window.__hits = 0;
    g.EV.on('playerHit', () => window.__hits++);
    return { type: e.type, name: e.name, hp: e.hp, elite: e.elite || null };
  }, spec);
  const states = []; for (let i = 0; i < 26; i++) { await gameWait(page, 0.25); states.push(await page.evaluate(() => { const e = window.__e; return e.state + (e.tele > 0 ? '*' : ''); })); }
  res[label] = { ...r, states: [...new Set(states)].join(' '), playerHits: await page.evaluate(() => window.__hits) };
}
// shield block test
const sb = await page.evaluate(async () => {
  const g = window.__game, p = g.G.player; const { hitEnemy } = await import('./src/combat.js');
  for (const e of [...g.G.enemies]) if (e.type !== 'dummy') e.dead = true;
  g.G.trainAttack = false;
  const e = g.spawnEnemy('shield', p.x + 2, 0, { arena: 'train', spawnT: 0 }); e.facing = -1; const hp0 = e.hp;
  hitEnemy(e, 10, { kind: 'main', dir: 1 }); const blocked = [e.hp, e.shieldHp];
  hitEnemy(e, 10, { kind: 'main', dir: -1 }); const back = e.hp;
  for (let i = 0; i < 8; i++) hitEnemy(e, 12, { kind: 'main', dir: 1, finisher: true });
  return { hp0, blocked, back, brokenStagger: e.stagger > 0, shielded: e.shielded };
});
console.log(JSON.stringify(res, null, 1), JSON.stringify(sb), errors);
await shot(page, 'enemies_new');
await browser.close();
