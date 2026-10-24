import { open, sleep } from './harness.mjs';
const { browser, page, errors } = await open({});
const out = {};
for (const [el, setup, name] of [
  ['fire', (e) => { e.chill = 3; }, 'STEAM'], ['water', (e) => { e.burn = 3; }, 'STEAM'], ['fire', (e) => { e.frozen = 1; e.chill = 2; }, 'THERMAL SHOCK'],
  ['fire', (e) => { e.stun = 2; }, 'MAGMA'], ['earth', (e) => { e.burn = 3; }, 'MAGMA'], ['fire', (e) => { e.air = true; e.onGround = false; }, 'FIRESTORM'],
  ['air', (e) => { e.burn = 3; }, 'FIRESTORM'], ['water', (e) => { e.stun = 2; }, 'MUD'], ['earth', (e) => { e.chill = 3; }, 'MUD'],
  ['air', (e) => { e.stun = 2; }, 'SANDSTORM'], ['earth', (e) => { e.air = true; e.onGround = false; }, 'SANDSTORM'],
]) {
  await page.evaluate((el) => window.__game.startTraining(el, 'sandbox'), el);
  await sleep(400);
  const r = await page.evaluate(async ([setupSrc]) => {
    const g = window.__game, p = g.G.player; const { hitEnemy } = await import('./src/combat.js');
    const names = []; const off = g.EV.on('reaction', (x) => names.push(x.name));
    const e = g.spawnEnemy('brute', p.x + 3, 0); e.spawnT = 0; e.hp = e.hpMax = 900; e.heavy = true;
    const b = g.spawnEnemy('bug', p.x + 4.5, 0); b.spawnT = 0; b.hp = b.hpMax = 900;
    eval('(' + setupSrc + ')')(e);
    hitEnemy(e, 5, { kind: 'special', dir: 1 });
    off(); return names;
  }, [setup.toString()]);
  out[el + ':' + name] = r.join(',') === name ? 'ok' : 'GOT ' + r.join(',');
}
console.log(JSON.stringify(out, null, 1), errors);
await browser.close();
