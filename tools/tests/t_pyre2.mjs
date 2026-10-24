import { open, sleep, gameWait, vpress, shot, cropShot } from './harness.mjs';
const { browser, page, errors } = await open({ query: '?debug' });
const out = {};
const ev = (f, a) => page.evaluate(f, a);
await ev(() => window.__game.startTraining('fire', 'sandbox')); await sleep(900);
await ev(() => { const g = window.__game, p = g.G.player; p.infEnergy = true; p.noCooldowns = true; document.getElementById('lab')?.classList.add('closed'); g.G.trainAttack = false; window.__p0 = g.ENG.renderer.info.programs.length; });
// 1 stance toggle + skate ride
await vpress(page, ['stance'], 0.05); await gameWait(page, 0.4);
out.skate = await ev(() => { const p = window.__game.G.player; return { skate: p.skate, deck: p.hero.deckMode }; });
await ev(() => window.__game.In.touch.ax = 1); await gameWait(page, 2.0);
out.ride = await ev(() => { const p = window.__game.G.player; return { vx: +p.vx.toFixed(2), heat: Math.round(p.heat) }; });
await cropShot(page, 'p2_ride', 260);
await vpress(page, ['jump'], 0.05); await gameWait(page, 0.2); await cropShot(page, 'p2_ollie', 260);
await gameWait(page, 0.8);
// power slide
await ev(() => window.__game.In.vDown('down')); await vpress(page, ['dash'], 0.05); await gameWait(page, 0.15); await cropShot(page, 'p2_slide', 260); await ev(() => window.__game.In.vUp('down'));
await ev(() => window.__game.In.touch.ax = 0); await gameWait(page, 1.2);
// back on foot, combo vs dummy
await vpress(page, ['stance'], 0.05); await gameWait(page, 0.4);
out.foot = await ev(() => { const p = window.__game.G.player; return { skate: p.skate, deck: p.hero.deckMode }; });
await ev(() => { const g = window.__game, p = g.G.player; g.spawnEnemy('bug', p.x + 2.2, 0, { arena: 'train', spawnT: 0 }); });
await gameWait(page, 0.3);
const combo = [];
for (let i = 0; i < 4; i++) { await vpress(page, ['main'], 0.04); await gameWait(page, i === 3 ? 0.3 : 0.12); combo.push(await ev(() => { const p = window.__game.G.player; return p.atk ? p.atk.cfg.pose + ':' + p.hero.deckMode : p.state; })); if (i === 3) await cropShot(page, 'p2_deckslam', 260); }
out.combo = combo;
await gameWait(page, 1);
// kick-turn parry
await ev(async () => { const g = window.__game, p = g.G.player; const { damagePlayer } = await import('./src/combat.js'); const e = g.G.enemies.find((x) => !x.dead); p.hurtI = 0; p.guarding = true; p.guardT = 0.02; damagePlayer(5, { x: p.x + 1.5, y: p.y, enemy: e, kind: 'melee' }); });
await gameWait(page, 0.12); await cropShot(page, 'p2_parry', 260);
out.parry = await ev(() => { const p = window.__game.G.player; return { kickT: +p.kickT.toFixed(2), heat: Math.round(p.heat) }; });
await gameWait(page, 1.5);
// heat -> blaze
await ev(() => { const p = window.__game.G.player; p.heat = 99; }); await vpress(page, ['main'], 0.04); await gameWait(page, 0.3);
out.blaze = await ev(() => +window.__game.G.player.blaze.toFixed(2));
// rail grind: go near rail 1 (x 11..21, y 1)
await ev(() => { const p = window.__game.G.player; p.x = 12; p.facing = 1; p.vx = 0; });
await gameWait(page, 0.3);
await ev(() => window.__game.In.vDown('s1')); await gameWait(page, 0.25);
out.grind = await ev(() => { const p = window.__game.G.player; return { grind: !!p.grind, y: +p.y.toFixed(2), x: +p.x.toFixed(1) }; });
await cropShot(page, 'p2_grind', 260);
await gameWait(page, 0.6); await ev(() => window.__game.In.vUp('s1')); await gameWait(page, 0.25); await cropShot(page, 'p2_dismount', 260);
await gameWait(page, 1.5);
// spit trick
await vpress(page, ['s2'], 0.05); await gameWait(page, 0.3); await cropShot(page, 'p2_spit', 260); await gameWait(page, 1.5);
// emotes
const em = [];
for (let n = 1; n <= 4; n++) { await ev(() => { const p = window.__game.G.player; p.blaze = 0; }); await gameWait(page, 0.5); await vpress(page, ['emote' + n], 0.05); await gameWait(page, n === 4 ? 0.45 : 1.0); em.push(await ev(() => { const p = window.__game.G.player; return p.emote ? p.emote.n + ':' + p.hero.deckMode : p.state; })); await cropShot(page, 'p2_emote' + n, 260); await gameWait(page, 2.5); }
out.emotes = em;
out.newPrograms = await ev(() => window.__game.ENG.renderer.info.programs.length - window.__p0);
await shot(page, 'p2_full');
console.log(JSON.stringify(out), JSON.stringify(errors));
await browser.close();
