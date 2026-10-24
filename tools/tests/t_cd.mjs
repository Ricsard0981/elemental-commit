import { open, sleep, gameWait, vpress, shot } from './harness.mjs';
const { browser, page, errors } = await open({});
await page.evaluate(() => window.__game.startTraining('water', 'sandbox'));
await sleep(600);
const r = await page.evaluate(async () => {
  const g = window.__game, p = g.G.player; const { damagePlayer, hitEnemy } = await import('./src/combat.js');
  const out = {};
  const ev = []; g.EV.on('perfectDodge', () => ev.push('dodge')); g.EV.on('execute', () => ev.push('exec'));
  p.dashInv = 0.2; p.hurtI = 0; out.r = damagePlayer(5, { x: p.x + 2, y: p.y, kind: 'melee' });
  out.witch = g.G.witch; out.cd = g.G.witchCd;
  const b = g.spawnEnemy('bug', p.x + 3, 0); b.spawnT = 0; b.stagger = 2; b.hp = 5; b.hpMax = 22;
  hitEnemy(b, 3, { kind: 'main', finisher: true, dir: 1 });
  out.dead = b.dead; out.hp = b.hp; out.push = g.cam.push;
  out.ev = ev;
  return out;
});
console.log(JSON.stringify(r), errors);
await browser.close();
