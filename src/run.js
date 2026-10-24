// ROOM RUN: a roguelite mode built on the Training Grounds arena. A run is a short chain of rooms (skirmishes, elite hunts, shops,
// rest stops, a Gatekeeper mini-boss and finally THE LEGACY MONOLITH). After every cleared room you take one of three Patches and pick
// the next door. Death ends the run; XP and skill points still carry over to your permanent tree.
import { G } from './state.js';
import * as UI from './ui.js';
import { sfx } from './audio.js';
import { on } from './events.js';
import { spawnEnemy, clearEnemies, AFFIXES } from './enemies.js';
import { ARENA_L } from './arena.js';
import { spawnCommits, spawnHeart, later, clearAll } from './combat.js';
import { gainRevert, REV } from './revert.js';
import { offerPatches, patchById, TAG_COL } from './patches.js';
import { ELEMENTS, KEYS } from './elements.js';
import { cam, ring, screenFlash } from './engine.js';
import { pickR as pick, rand, clamp, rr, seedRng, todaySeed } from './util.js';
import { scene } from './engine.js';

const PLAN = [['combat', 'elite'], ['combat', 'elite'], ['shop', 'rest'], ['combat', 'elite'], ['minibos'], ['shop', 'rest'], ['boss']];
const TYPE = {
  combat: { icon: '⚔', name: 'Skirmish', desc: 'A few waves. Reward: a Patch.' },
  elite: { icon: '☠', name: 'Elite hunt', desc: 'Tougher enemies with affixes. Reward: a RARE Patch.' },
  shop: { icon: '⛁', name: 'Shop', desc: 'Spend your commits.' },
  rest: { icon: '♥', name: 'Rest stop', desc: 'Recover, or sharpen yourself.' },
  minibos: { icon: '♛', name: 'The Gatekeeper', desc: 'Mini-boss. Reward: a RARE Patch and a heal.' },
  boss: { icon: '☢', name: 'THE LEGACY MONOLITH', desc: 'The final fight.' },
};
const BEST_KEY = 'elemental-commit-runs-v1';
const api = { gainRevert: (n) => gainRevert(n), giveRes: () => { const r = G.run; r.res = pick(KEYS.filter((k) => k !== r.key)); r.hasRes = true; G.player?.refreshMods(); } };

export function runActive() { return !!(G.run && G.run.active); }
const FOG = { combat: 0xd9a68a, elite: 0xd98a86, shop: 0xe3cf8f, rest: 0x9ad9a8, minibos: 0xb08ad9, boss: 0x8a86b8 };
export function newRun(key, daily = false) {
  const seed = daily ? todaySeed() : Math.floor(Math.random() * 1e9); seedRng(seed);
  G.run = { seed, daily, active: true, key, room: 0, depth: 0, type: 'combat', patches: [], res: null, hasRes: false, wave: 0, waves: [], delay: 0, cleared: false, spawning: 0, rooms: 0, bestStyle: 0, startedAt: performance.now() };
  return G.run;
}
export function runMods(m) { /* patches are merged by Player.refreshMods through patches.applyPatches */ return m; }
export function endRun() { if (G.run) G.run.active = false; closeScreen(); const el = document.getElementById('runinfo'); if (el) el.classList.remove('show'); }

// ----------------------------------------------------------------- screens (the world is paused while one is open)
function host() {
  let s = document.getElementById('runui');
  if (!s) { s = document.createElement('section'); s.id = 'runui'; s.className = 'screen'; document.body.appendChild(s); }
  return s;
}
function openScreen(html, bind) {
  const s = host(); s.innerHTML = html; s.classList.add('show'); G.mode = 'ui';
  bind?.(s);
  return s;
}
export function closeScreen() { const s = document.getElementById('runui'); if (s) s.classList.remove('show'); if (G.mode === 'ui') G.mode = 'play'; }

function patchCard(p, i, price) {
  const c = TAG_COL[p.tag] || '#fff';
  return `<button class="res-card patch-card" data-i="${i}" style="--c:${c}"><span class="ri pi">${p.tag === 'merge' ? '⚯' : p.rare ? '✦' : '◆'}</span><b>${p.name}</b><small>${p.desc}</small><em class="ptag">${p.tag === 'any' ? 'ANY ELEMENT' : p.tag === 'merge' ? 'MERGE · ' + p.pair.map((k) => k.toUpperCase()).join(' + ') : p.tag.toUpperCase()}${p.rare ? ' · RARE' : ''}</em>${price ? `<span class="price">${price} ⛁</span>` : ''}</button>`;
}
function takePatch(p) {
  const r = G.run; r.patches.push(p.id); p.onTake?.(api);
  G.player.refreshMods(); sfx.buy(); screenFlash(0xffd33d, 0.18);
  UI.toast(`Patch: <b>${p.name}</b>`, TAG_COL[p.tag]); renderPatches();
}
function pickPatch(rare, then) {
  const r = G.run, offers = offerPatches(3, r, rare);
  if (!offers.length) { then(); return; }
  openScreen(`<div class="panel wide"><h2>${rare ? 'Choose a RARE Patch' : 'Choose a Patch'}</h2><p class="muted">Temporary for this run. Merge patches need your element plus your secondary element.</p><div class="res-cards">${offers.map((p, i) => patchCard(p, i)).join('')}</div></div>`, (s) => {
    s.querySelectorAll('.patch-card').forEach((b) => (b.onclick = () => { closeScreen(); takePatch(offers[+b.dataset.i]); then(); }));
    s.onkeydown = null;
  });
}
function doors() {
  const r = G.run, opts = PLAN[r.depth] || ['boss'];
  openScreen(`<div class="panel wide"><h2>Next room</h2><p class="muted">Room ${r.rooms + 1} of ${PLAN.length + 1} · ${r.patches.length} patch${r.patches.length === 1 ? '' : 'es'} · ${G.stats.commits} commits</p><div class="res-cards">${opts.map((t, i) => `<button class="res-card door-card" data-t="${t}"><span class="ri pi">${TYPE[t].icon}</span><b>${TYPE[t].name}</b><small>${TYPE[t].desc}</small></button>`).join('')}</div></div>`, (s) => {
    s.querySelectorAll('.door-card').forEach((b) => (b.onclick = () => { closeScreen(); r.depth++; enterRoom(b.dataset.t); }));
  });
}
function shop() {
  const r = G.run, p = G.player;
  const items = [
    { id: 'heal', name: 'Hotfix', desc: 'Heal 40% HP.', cost: 25, buy: () => { p.hp = Math.min(p.hpMax, p.hp + p.hpMax * 0.4); sfx.heal(); }, multi: true },
    { id: 'rev', name: 'Revert charge', desc: 'One more rewind.', cost: 55, buy: () => gainRevert(1), multi: true },
    { id: 'patch', name: 'Patch', desc: 'A random common Patch.', cost: 45, buy: () => { const o = offerPatches(1, r, false)[0]; if (o) takePatch(o); } },
    { id: 'rare', name: 'Rare Patch', desc: 'A random RARE Patch.', cost: 95, buy: () => { const o = offerPatches(1, r, true)[0]; if (o) takePatch(o); } },
  ];
  const render = () => openScreen(`<div class="panel wide"><h2>Shop</h2><p class="muted">You have <b>${G.stats.commits}</b> commits.</p><div class="res-cards">${items.map((it, i) => `<button class="res-card shop-card ${it.sold || G.stats.commits < it.cost ? 'off' : ''}" data-i="${i}"><b>${it.name}</b><small>${it.desc}</small><span class="price">${it.sold ? 'SOLD' : it.cost + ' ⛁'}</span></button>`).join('')}</div><button class="primary" id="shop-done">Leave</button></div>`, (s) => {
    s.querySelectorAll('.shop-card').forEach((b) => (b.onclick = () => { const it = items[+b.dataset.i]; if (it.sold || G.stats.commits < it.cost) { sfx.hover(); return; } G.stats.commits -= it.cost; sfx.buy(); closeScreen(); it.buy(); if (!it.multi) it.sold = true; render(); }));
    s.querySelector('#shop-done').onclick = () => { closeScreen(); doors(); };
  });
  render();
}
function rest() {
  const p = G.player;
  openScreen(`<div class="panel wide"><h2>Rest stop</h2><p class="muted">Choose one.</p><div class="res-cards">
    <button class="res-card rest-card" data-k="heal"><span class="ri pi">♥</span><b>Recover</b><small>Heal 50% HP and refill energy.</small></button>
    <button class="res-card rest-card" data-k="rev"><span class="ri pi">⟲</span><b>Rewind</b><small>Gain a Revert charge.</small></button>
    <button class="res-card rest-card" data-k="edge"><span class="ri pi">⚔</span><b>Sharpen</b><small>+10% damage for the rest of the run.</small></button></div></div>`, (s) => {
    s.querySelectorAll('.rest-card').forEach((b) => (b.onclick = () => {
      const k = b.dataset.k; closeScreen();
      if (k === 'heal') { p.hp = Math.min(p.hpMax, p.hp + p.hpMax * 0.5); p.energy = p.energyMax; sfx.heal(); } else if (k === 'rev') gainRevert(1); else takePatch(patchById('edge'));
      doors();
    }));
  });
}

// ----------------------------------------------------------------- rooms
function budgetPool(room) {
  const pool = [['bug', 1, 0]];
  if (room >= 1) pool.push(['pointer', 2, 1], ['shield', 3, 1]);
  if (room >= 2) pool.push(['charger', 3, 2], ['medic', 2, 2]);
  if (room >= 3) pool.push(['brute', 5, 3]);
  return pool;
}
function buildWaves(type, room) {
  if (type === 'boss') return [['boss']];
  if (type === 'minibos') return [['shield:mini', 'bug', 'bug']];
  const pool = budgetPool(room), nWaves = type === 'elite' ? 2 : 2 + (room >= 3 ? 1 : 0), waves = [];
  for (let w = 0; w < nWaves; w++) {
    let budget = 4 + room * 1.7 + w * 1.5, list = [];
    if (type === 'elite') { const pc = pool.filter((x) => x[1] >= 2 && x[0] !== 'medic'); const c = pick(pc.length ? pc : pool); list.push(c[0] + ':' + pick(AFFIXES)); budget -= c[1] + 1; }
    for (let guard = 0; guard < 14 && budget >= 1; guard++) {
      const opts = pool.filter(([k, c]) => c <= budget && (k !== 'medic' || list.length >= 2));
      if (!opts.length) break; const [k, c] = pick(opts); list.push(k); budget -= c;
    }
    waves.push(list.slice(0, 9));
  }
  return waves;
}
function spawnWave() {
  const r = G.run, p = G.player, list = r.waves[r.wave];
  if (!list) return; r.wave++;
  r.delay = 0; r.spawning = list.length;
  list.forEach((spec, i) => {
    const [type, mod] = spec.split(':');
    later(0.1 + i * 0.28, () => {
      r.spawning--;
      if (!runActive() || r.type === 'ended') return;
      const side = (i % 2 ? 1 : -1) * (Math.random() < 0.85 ? 1 : -1);
      let x = clamp(p.x + side * rand(9, 17), 6, ARENA_L - 6); if (Math.abs(x - p.x) < 7) x = clamp(p.x + (x < p.x ? -1 : 1) * 9, 6, ARENA_L - 6);
      const o = { arena: 'run', ...(mod === 'mini' ? { mini: true } : mod ? { elite: mod } : {}), ...(type === 'boss' ? { bx0: 6, bx1: ARENA_L - 6 } : {}) };
      spawnEnemy(type, type === 'boss' ? ARENA_L / 2 + 6 : x, type === 'pointer' || type === 'medic' ? 4.5 : 0, o);
    });
  });
}
export function enterRoom(type) {
  const r = G.run, p = G.player;
  r.type = type; r.rooms++; r.wave = 0; r.cleared = false; r.spawning = 0; r.delay = 0;
  clearEnemies(); clearAll();
  p.x = 10; p.y = 0; p.vx = 0; p.vy = 0; p.hurtI = Math.max(p.hurtI, 1); cam.x = p.x + 4;
  r.waves = buildWaves(type, r.rooms - 1);
  const info = document.getElementById('runinfo'); if (info) { info.classList.add('show'); info.innerHTML = `<b>ROOM ${r.rooms}/${PLAN.length + 1}</b> ${TYPE[type].icon} ${TYPE[type].name} <small>seed ${r.daily ? 'DAILY ' : ''}${r.seed}</small>`; }
  if (scene.fog && FOG[type]) scene.fog.color.setHex(FOG[type]); // each room type has its own mood
  ring(p.x, p.y + 1, 0.5, ELEMENTS[r.key].color, { r0: 0.3, r1: 6, dur: 0.7 });
  UI.banner(TYPE[type].name.toUpperCase(), TYPE[type].desc, '#ffd33d', 2.2);
  if (type === 'shop') { later(0.6, shop); return; }
  if (type === 'rest') { later(0.6, rest); return; }
  r.delay = -0.2; // updateRun spawns the first wave after a short breather
}
function roomCleared() {
  const r = G.run, p = G.player; r.cleared = true;
  if (r.type === 'boss') return; // the boss kill ends the run via the kill event
  sfx.checkpoint(); UI.banner('ROOM CLEARED', '', '#7ee787', 1.4);
  spawnCommits(p.x, p.y + 1.2, 6 + r.rooms * 2);
  if (r.type === 'minibos') { p.hp = Math.min(p.hpMax, p.hp + p.hpMax * 0.5); spawnHeart(p.x + 2, p.y + 1.5); }
  else if (Math.random() < 0.3) spawnHeart(p.x + 2, p.y + 1.5);
  later(1.7, () => { if (!runActive()) return; pickPatch(r.type === 'elite' || r.type === 'minibos', doors); });
}
export function updateRun(dt, p) {
  const r = G.run; if (!r || !r.active || G.mode !== 'play') return;
  const s = G.style; if (s) r.bestStyle = Math.max(r.bestStyle, s.rank);
  if (r.type === 'shop' || r.type === 'rest' || r.cleared) return;
  if (r.spawning > 0) return;
  const alive = G.enemies.some((e) => !e.dead && e.type !== 'dummy');
  if (alive) { r.delay = 0; return; }
  if (r.wave < r.waves.length) { r.delay += dt; if (r.delay > 0.7) spawnWave(); } else roomCleared();
}
// the run's own HUD list of patches
export function renderPatches() {
  const el = document.getElementById('patches'); if (!el) return;
  const r = G.run; el.innerHTML = r && r.active ? r.patches.map((id) => { const p = patchById(id); return `<i style="--c:${TAG_COL[p.tag]}" title="${p.name}: ${p.desc}">${p.name}</i>`; }).join('') : '';
}
export function startRoomRunState(key, daily = false) {
  newRun(key, daily); renderPatches();
  const info = document.getElementById('runinfo'); if (info) info.classList.remove('show');
}
export function firstRoom() { G.run.depth = 0; enterRoom('combat'); }

// end of run (boss dead): victory summary
function bestLoad() { try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch { return {}; } }
export function finishRunVictory() {
  const r = G.run; if (!r || !r.active) return; r.active = false;
  const best = bestLoad(), prev = best[r.key]; const t = (performance.now() - r.startedAt) / 1000;
  const isBest = !prev || t < prev.time; if (isBest) { best[r.key] = { time: t, patches: r.patches.length, style: r.bestStyle }; try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch { /* ignore */ } }
  sfx.checkpoint(); G.mode = 'ui';
  const s = G.stats, names = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
  openScreen(`<div class="panel wide"><div class="merged">RUN COMPLETE ✔</div><h2>The Monolith is refactored.</h2><div class="win-stats"><div><span>Time</span><b>${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}</b></div><div><span>Rooms</span><b>${r.rooms}</b></div><div><span>Patches</span><b>${r.patches.length}</b></div><div><span>Best style</span><b>${names[r.bestStyle]}</b></div><div><span>Kills</span><b>${s.kills}</b></div><div><span>Perfect parries</span><b>${s.parries}</b></div></div>${isBest ? '<div id="win-new" style="display:block">★ New best run</div>' : ''}<p class="muted">Seed ${r.daily ? 'DAILY ' : ''}${r.seed}</p><div class="row"><button class="primary" id="run-again">Run again</button><button id="run-share">Copy result</button><button id="run-menu">Main menu</button></div></div>`, (sc) => {
    const share = `Elemental Commit · Room Run · ${ELEMENTS[r.key].name} · ${r.daily ? 'Daily ' + r.seed : 'seed ' + r.seed} · ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · style ${names[r.bestStyle]} · ${r.patches.length} patches`;
    sc.querySelector('#run-share').onclick = () => { try { navigator.clipboard.writeText(share); UI.toast('Result copied', '#7ee787'); } catch { UI.toast(share, '#7ee787'); } };
    sc.querySelector('#run-again').onclick = () => { closeScreen(); window.dispatchEvent(new CustomEvent('run-again')); };
    sc.querySelector('#run-menu').onclick = () => { closeScreen(); window.dispatchEvent(new CustomEvent('run-menu')); };
  });
}
on('kill', ({ e }) => { if (e.boss && runActive()) later(2.4, finishRunVictory); });
export const RUN_PLAN_LEN = PLAN.length + 1;
