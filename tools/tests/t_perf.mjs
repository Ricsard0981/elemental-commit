// usage: GAME_URL=http://localhost:8092/ node t_perf.mjs [query] [quality]
// Same scripted fight in any build: 6 enemies attacking, the player spamming attacks, 10 s of game time. Reports CPU ms per frame
// (perfStats.js = everything before the render call), draw calls, triangles, live particles, JS heap, new shader programs.
import { open, sleep, gameWait } from './harness.mjs';
const query = process.argv[2] || '?debug', quality = process.argv[3] || 'high';
const { browser, page, errors } = await open({ query, quality, w: 1280, h: 720 });
await page.evaluate(() => window.__game.startTraining('fire', 'sandbox'));
await sleep(800);
await page.evaluate(() => {
  const g = window.__game, p = g.G.player; p.infEnergy = true; p.hp = p.hpMax = 99999; g.G.trainAttack = true;
  for (const e of [...g.G.enemies]) if (e.type !== 'dummy') e.dead = true;
  ['bug', 'bug', 'bug', 'pointer', 'brute', 'bug'].forEach((t, i) => { const e = g.spawnEnemy(t, p.x + 5 + i * 2.2, t === 'pointer' ? 4 : 0, { arena: 'train', spawnT: 0 }); e.hp = e.hpMax = 99999; });
  const seq = [['main'], ['main'], ['main'], ['up', 'main'], ['jump'], ['main'], ['main'], ['ranged'], ['s1'], ['guard'], ['s2'], ['dash']];
  let i = 0; window.__spam = setInterval(() => { const a = seq[i++ % seq.length]; a.forEach((x) => g.In.vDown(x)); setTimeout(() => a.forEach((x) => g.In.vUp(x)), 70); }, 140);
  window.__samples = []; window.__p0 = g.ENG.renderer.info.programs.length; g.perfStats.hitches.length = 0;
  window.__iv = setInterval(() => { const r = g.ENG.renderer.info.render; window.__samples.push({ js: g.perfStats.js, calls: r.calls, tris: r.triangles, heap: performance.memory ? performance.memory.usedJSHeapSize / 1e6 : 0 }); }, 250);
});
await gameWait(page, 10);
const res = await page.evaluate(() => {
  clearInterval(window.__spam); clearInterval(window.__iv); const g = window.__game, S = window.__samples.slice(4);
  const avg = (k) => +(S.reduce((a, s) => a + s[k], 0) / S.length).toFixed(2), mx = (k) => +Math.max(...S.map((s) => s[k])).toFixed(1);
  const info = g.ENG.renderer.info;
  return { samples: S.length, jsMsAvg: avg('js'), jsMsMax: mx('js'), calls: avg('calls'), callsMax: mx('calls'), trisK: +(avg('tris') / 1000).toFixed(0), heapMB: mx('heap'), geometries: info.memory.geometries, textures: info.memory.textures, newPrograms: g.ENG.renderer.info.programs.length - window.__p0, hitches: g.perfStats.hitches.length, sections: Object.fromEntries(Object.entries(g.perfStats.avg || {}).map(([k, v]) => [k, +v.toFixed(2)])), meshes: (() => { let n = 0, pts = 0; g.ENG.scene.traverse((o) => { if (o.visible && (o.isMesh || o.isPoints || o.isLine)) n++; if (o.isPoints) pts++; }); return n; })() };
});
console.log(JSON.stringify(res), errors.length ? errors : '');
await browser.close();
