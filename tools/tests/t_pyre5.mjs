import { open, sleep, gameWait, vpress, shot, cropShot } from './harness.mjs';
const { browser, page, errors } = await open({ query: '?debug' });
const ev = (f, a) => page.evaluate(f, a);
await ev(() => window.__game.startTraining('fire', 'sandbox')); await sleep(900);
await ev(() => { const g = window.__game, p = g.G.player; p.infEnergy = true; p.noCooldowns = true; document.getElementById('lab')?.classList.add('closed'); g.G.trainAttack = false; for (const e of g.G.enemies) e.dead = true; p.x = 30; });
// wait until cond() holds, freeze the game, crop, unfreeze
const snap = async (name, cond, half = 230) => {
  const ok = await ev((c) => new Promise((r) => { const f = new Function('p', 'return ' + c); const iv = setInterval(() => { const p = window.__game.G.player; if (f(p)) { clearInterval(iv); window.__game.G.freeze = 60; r(true); } }, 5); setTimeout(() => { clearInterval(iv); r(false); }, 15000); }), cond);
  await sleep(250); await cropShot(page, 'p5_' + name, half); await ev(() => { window.__game.G.freeze = 0; }); return ok;
};
const res = {};
const dummy = () => ev(() => { const g = window.__game, p = g.G.player; for (const e of g.G.enemies) e.dead = true; g.spawnEnemy('bug', p.x + 2.4 * p.facing, 0, { arena: 'train', spawnT: 0 }); });
await dummy(); await gameWait(page, 0.4);
const hits = ['sweep', 'elbow', 'spinKick', 'deckSlam'];
for (const h of hits) { await vpress(page, ['main'], 0.03); res[h] = await snap(h, `p.atk && p.atk.cfg.pose==='${h}' && p.atk.t > p.atk.hitAt + 0.02`); await ev(() => new Promise((r) => { const iv = setInterval(() => { const p = window.__game.G.player; if (!p.atk || p.atk.t > p.atk.cancelAt) { clearInterval(iv); r(); } }, 10); })); }
await gameWait(page, 0.8); await dummy(); await gameWait(page, 0.3);
await ev(() => window.__game.In.vDown('up')); await vpress(page, ['main'], 0.03); res.launcher = await snap('launcher', "p.atk && p.atk.kind==='launcher' && p.atk.t > p.atk.dur*0.45"); await ev(() => window.__game.In.vUp('up'));
await gameWait(page, 0.6);
await vpress(page, ['jump'], 0.1); await gameWait(page, 0.2); await vpress(page, ['main'], 0.03); res.meia = await snap('meia', "p.atk && p.atk.kind==='air' && p.atk.t > p.atk.hitAt");
await gameWait(page, 0.4); await ev(() => window.__game.In.vDown('down')); await vpress(page, ['main'], 0.03); res.stomp = await snap('stomp', "p.atk && p.atk.kind==='slam' && p.atk.t > 0.12"); await ev(() => window.__game.In.vUp('down'));
await gameWait(page, 1.0);
await ev(() => window.__game.In.vDown('guard')); res.guard = await snap('guard', 'p.guarding && p.guardT > 0.25'); await ev(() => window.__game.In.vUp('guard'));
await gameWait(page, 0.5);
await ev(async () => { const g = window.__game, p = g.G.player; const { damagePlayer } = await import('./src/combat.js'); p.hurtI = 0; p.guarding = true; p.guardT = 0.02; damagePlayer(5, { x: p.x + 1.5, y: p.y, kind: 'melee' }); }); res.kickturn = await snap('kickturn', 'p.kickT > 0 && p.kickT < 0.25');
await gameWait(page, 1.0);
await vpress(page, ['stance'], 0.05); res.drop = await snap('drop', 'p.skate && p.dropT > 0 && p.dropT < 0.2');
await ev(() => window.__game.In.touch.ax = 1); await gameWait(page, 1.2); res.ride = await snap('ride', 'p.skate && p.onGround && Math.abs(p.vx) > 8');
await vpress(page, ['jump'], 0.04); res.ollie = await snap('ollie', 'p.ollieT > 0 && p.ollieT < 0.3');
await gameWait(page, 1.0); await ev(() => window.__game.In.vDown('down')); await vpress(page, ['dash'], 0.04); res.slide = await snap('slide', 'p.dash && p.dash.slide && p.dash.t > 0.1'); await ev(() => { window.__game.In.vUp('down'); window.__game.In.touch.ax = 0; });
await gameWait(page, 1.5); await vpress(page, ['stance'], 0.05); await gameWait(page, 0.5);
await ev(() => { const p = window.__game.G.player; p.x = 12; p.facing = 1; p.vx = 0; }); await gameWait(page, 0.4);
await ev(() => window.__game.In.vDown('s1')); res.grind = await snap('grind', 'p.grind && p.dash && p.dash.t > 0.2', 280); await gameWait(page, 0.2); await ev(() => window.__game.In.vUp('s1'));
res.flip = await snap('flip', 'p.flipT > 0 && p.flipT < 0.35', 280);
await gameWait(page, 1.5);
await vpress(page, ['s2'], 0.05); res.spit = await snap('spit', 'p.handstand > 0 && p.handstand < 0.4', 280);
await gameWait(page, 2.5);
for (let n = 1; n <= 4; n++) { await vpress(page, ['emote' + n], 0.04); const at = [1.1, 1.5, 1.4, 0.45][n - 1]; res['emote' + n] = await snap('emote' + n, `p.emote && p.emote.n===${n - 1} && p.emote.t > ${at}`); await gameWait(page, 3.4); }
console.log(JSON.stringify(res), JSON.stringify(errors));
await browser.close();
