import * as THREE from 'three';
import * as ENGW from './engine.js';
import { G } from './state.js';
import { initEngine, stepEngine, updateCamera, cam, render, ring, flashLight, screenFlash, shake, punchFov, floatText, sparks, cubes, post, scene } from './engine.js';
import * as In from './input.js';
import { initAudio, sfx, audio, toggleMute } from './audio.js';
import { buildWorld, updateWorld, groundAt, arenas, checkpoints, roamers, commitTrail, hints, setGate, setAtmosphere, activateCheckpoint, ripple, L, gates, dyn } from './world.js';
import { ELEMENTS } from './elements.js';
import { Player } from './player.js';
import { spawnEnemy, updateEnemies, clearEnemies } from './enemies.js';
import { updateProjectiles, updatePickups, clearAll, spawnCommits, spawnCommit, later, giveXP, comboBreak, killEnemy } from './combat.js';
import { prog, recordRun, pointsLeft } from './skills.js';
import * as UI from './ui.js';
import { initTouch, updateTouch, setElement as touchElement, layout as touchLayout } from './touch.js';
import { S, touchOn, onSetting, qualityLevel, isTouchDevice } from './settings.js';
import { renderSettings } from './settingsUI.js';
import { applyQuality, adaptResolution, perfStats, Q } from './engine.js';
import { setVolumes, setSlow, setAmbience } from './audio.js';
import { loadAssets, assets } from './assets.js';
import { enterArena, leaveArena, updateArena, ARENA_L } from './arena.js';
import { startMode, stopTraining, updateTraining, showSelect, endlessOver, setTrainHandlers, T as TR } from './training.js';
import { setLevelVisible } from './world.js';
import * as EV from './events.js';
import { warmAll } from './warm.js';
import { clearHeroPool } from './hero.js';

const canvas = document.getElementById('c');
const loadingEl = document.getElementById('loading');
initEngine(canvas);
In.initInput(canvas);
buildWorld();
cam.bx1 = L - 12;
ENGW.warmup();
// preload the hero model (progress on the loading screen), then compile its shaders once, behind the loading screen
await loadAssets((k) => { loadingEl.textContent = `Loading… ${Math.round(k * 100)}%`; });
await warmAll((t) => { loadingEl.textContent = t; });

let last = performance.now(), prevMode = 'play', hintIdx = 0, runT = 0, bossStarted = false, winTimer = 0;
G.checkpointX = 4;

// ----------------------------------------------------------------- run lifecycle
function resetWorldState() {
  clearEnemies(); clearAll();
  dyn.length = 0;
  for (const a of arenas) { a.state = 'idle'; a.wave = 0; a.pending = 0; a.timer = 0; a.gates?.forEach((g) => setGate(g, false)); }
  for (const g of gates) { g.closed = false; g.k = 0; g.target = 0; g.mesh.visible = false; }
  roamState = roamers.map(() => ({ spawned: false, done: false }));
  for (const cp of checkpoints) if (cp.active) { cp.active = false; }
  hintIdx = 0; bossStarted = false; winTimer = 0;
  G.checkpointX = 4;
  G.combo = { n: 0, t: 0, best: 0, rank: 0 };
  G.stats = { kills: 0, commits: 0, time: 0, parries: 0, damageTaken: 0 };
  G.boss = null; G.freeze = 0; G.ts = 1; G.tsTarget = 1; G.tsHold = 0;
  // collectible commits along the route
  for (const [x, y] of commitTrail) spawnCommit(x, y + groundAt(x) * 0, { still: true });
}
let roamState = [];

function startRun(key) {
  UI.show('menu', false); UI.show('death', false); UI.show('win', false); UI.show('pause', false); UI.show('skills', false);
  if (G.player) G.player.destroy();
  G.element = key;
  resetWorldState();
  // reset checkpoint visuals
  for (const cp of checkpoints) { cp.orb.material.color.set(0x8b949e); }
  const p = new Player(key);
  G.player = p;
  setAtmosphere(ELEMENTS[key].color);
  UI.startRunHUD(); UI.setHudVisible(true);
  G.mode = 'play'; runT = 0;
  cam.x = p.x + 6; cam.y = p.y + 2; cam.zoom = 1.3; cam.zoomT = 1;
  p.hurtI = 1; p.sinceHurt = 99;
  ring(p.x, p.y + 1, 0.5, ELEMENTS[key].color, { r0: 0.3, r1: 6, dur: 0.8 });
  flashLight(p.x, p.y + 2, 2, ELEMENTS[key].color, 80, 0.8);
  sfx.cast(key);
  UI.banner('git checkout -b ' + key, 'Reach the end of the contribution graph', '#' + ELEMENTS[key].color.toString(16).padStart(6, '0'), 3);
  UI.setHint(hintText(hints[0]), 9);
  touchElement(key);
  if (touchOn() && S.fullscreen) goFullscreen();
  document.getElementById('menu').classList.remove('show');
}
function toMenu() {
  leaveTraining(); showSelect(false); setAmbience('level');
  G.mode = 'menu'; UI.setHudVisible(false);
  ['pause', 'death', 'win', 'skills'].forEach((id) => UI.show(id, false));
  UI.refreshCards(); UI.show('menu', true);
  if (G.player) { G.player.destroy(); G.player = null; }
  resetWorldState(); UI.hideBoss();
  setAtmosphere(0x39d353);
}
// ----------------------------------------------------------------- Training Grounds
const trainHandlers = {
  start: (k, mode) => startTraining(k, mode),
  back: () => { showSelect(false); UI.show('menu', true); },
  toSelect: () => { leaveTraining(); G.mode = 'menu'; UI.setHudVisible(false); ['pause', 'death', 'win', 'skills'].forEach((id) => UI.show(id, false)); showSelect(true); },
  toMenu: () => toMenu(),
  restart: () => startTraining(G.element, TR.mode),
  switchElement: (k) => startTraining(k, TR.mode, true),
};
setTrainHandlers(trainHandlers);
function startTraining(key, mode, keepFlags = false) {
  const old = G.player, flags = keepFlags && old ? { inf: old.infEnergy, nocd: old.noCooldowns } : null;
  ['menu', 'death', 'win', 'pause', 'skills'].forEach((id) => UI.show(id, false)); showSelect(false);
  if (old) old.destroy();
  G.element = key; G.training = { mode };
  clearEnemies(); clearAll(); dyn.length = 0; UI.hideBoss();
  G.combo = { n: 0, t: 0, best: 0, rank: 0 }; G.stats = { kills: 0, commits: 0, time: 0, parries: 0, damageTaken: 0 };
  G.boss = null; G.freeze = 0; G.ts = 1; G.tsTarget = 1; G.tsHold = 0;
  enterArena(); setAmbience('arena');
  const p = new Player(key); G.player = p; p.x = 12;
  if (flags) { p.infEnergy = flags.inf; p.noCooldowns = flags.nocd; }
  if (mode === 'trials') { p.infEnergy = true; p.noCooldowns = true; }
  p.hurtI = 1; p.sinceHurt = 99;
  UI.startRunHUD(); UI.setHudVisible(true);
  G.mode = 'play';
  cam.bx0 = 8; cam.bx1 = ARENA_L - 8; cam.x = p.x + 4; cam.y = 2; cam.zoom = 1.2; cam.zoomT = 1;
  ring(p.x, p.y + 1, 0.5, ELEMENTS[key].color, { r0: 0.3, r1: 6, dur: 0.8 });
  touchElement(key);
  if (touchOn() && S.fullscreen) goFullscreen();
  startMode(mode, trainHandlers);
}
function leaveTraining() {
  if (!G.training) return;
  stopTraining(); leaveArena(); G.training = null;
  clearEnemies(); clearAll(); UI.hideBoss();
  cam.bx0 = 6; cam.bx1 = L - 12;
  if (G.player) { G.player.destroy(); G.player = null; }
}
let deadT = 0;

function respawn() {
  if (G.training) {
    UI.show('death', false); const tp = G.player;
    G.mode = 'play'; G.ts = 1; G.tsTarget = 1; G.tsHold = 0; G.freeze = 0;
    tp.respawn(12); tp.reborn = false; comboBreak(); cam.x = tp.x; UI.hideBoss();
    ring(tp.x, tp.y + 1, 0.5, 0xffffff, { r0: 0.3, r1: 6, dur: 0.7 }); sfx.checkpoint();
    return;
  }
  UI.show('death', false);
  const p = G.player;
  clearEnemies(); clearAll();
  for (const a of arenas) if (a.state !== 'done') { a.state = 'idle'; a.wave = 0; a.pending = 0; a.gates?.forEach((g) => setGate(g, false)); }
  roamState.forEach((s) => { if (!s.done) s.spawned = false; });
  G.mode = 'play'; G.ts = 1; G.tsTarget = 1; G.tsHold = 0; G.freeze = 0;
  bossStarted = false; UI.hideBoss();
  p.respawn(G.checkpointX);
  p.reborn = false;
  cam.x = p.x; cam.zoom = 1.2;
  comboBreak();
  ring(p.x, p.y + 1, 0.5, 0x39d353, { r0: 0.3, r1: 7, dur: 0.8 });
  flashLight(p.x, p.y + 2, 2, 0x39d353, 80, 0.7); screenFlash(0x39d353, 0.35);
  sfx.checkpoint();
  UI.banner('git reset --hard', 'Back at the last commit. Try again.', '#7ee787', 2);
}
function openSkills() {
  if (!G.player || G.mode === 'menu') return;
  if (G.mode !== 'skills') prevMode = G.mode;
  G.mode = 'skills';
  UI.show('skills', true); UI.renderTree(); sfx.click();
}
function closeSkills() {
  UI.show('skills', false);
  G.mode = prevMode === 'skills' ? 'play' : prevMode; sfx.click();
  UI.show('pause', G.mode === 'paused');
}
function skillsChanged() { G.player.refreshMods(); UI.refreshCards(); }
function pause() { if (G.mode !== 'play') return; G.mode = 'paused'; UI.show('pause', true); In.releaseAllVirtual(); }
let settingsPrev = 'menu';
function openSettings() {
  if (G.mode === 'settings') return;
  settingsPrev = G.mode; G.mode = 'settings';
  UI.show('pause', false); renderSettings(); UI.show('settings', true); sfx.click();
}
function closeSettings() {
  UI.show('settings', false); G.mode = settingsPrev; sfx.click();
  UI.show('pause', G.mode === 'paused');
}
const hintText = (h) => (touchOn() && h.touch ? (S.lefty ? h.touch.replace('<b>left</b>', '<b>right</b>') : h.touch) : h.text);
function syncBody() {
  document.body.classList.toggle('touch', touchOn());
  document.body.classList.toggle('showfps', !!S.fps);
}
function goFullscreen() {
  const d = document.documentElement;
  try {
    const p = d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen?.();
    Promise.resolve(p).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  } catch { /* not allowed — fine */ }
}
function resume() { if (G.mode !== 'paused') return; G.mode = 'play'; UI.show('pause', false); }

UI.initUI({
  onPick: (k) => { initAudio(); startRun(k); },
  openSkills, closeSkills, skillsChanged, resume, toMenu, respawn,
  again: () => startRun(G.element),
});
initTouch(); syncBody();
document.getElementById('btn-train').onclick = () => { sfx.click(); UI.show('menu', false); showSelect(true); };
document.getElementById('btn-pause').onclick = () => { pause(); sfx.click(); };
document.getElementById('btn-pause-settings').onclick = openSettings;
document.getElementById('btn-settings-menu').onclick = openSettings;
document.getElementById('btn-settings-close').onclick = closeSettings;
onSetting((k) => {
  if (k === 'quality' || k === 'gfx') applyGraphics();
  if (k === 'sfx' || k === 'music') setVolumes();
  if (k === 'touch' || k === 'fps') { syncBody(); touchLayout(); }
});
// graphics changes: apply immediately; if shader programs change, rebuild + re-warm behind a short overlay
let gfxBusy = false, gfxAgain = false;
async function applyGraphics() {
  if (gfxBusy) { gfxAgain = true; return; }
  gfxBusy = true;
  const rewarm = applyQuality();
  if (rewarm) {
    loadingEl.classList.remove('done'); loadingEl.textContent = 'Applying graphics…';
    await new Promise((r) => requestAnimationFrame(r));
    clearHeroPool(); await warmAll();
    G.player?.rebuildModel();
    loadingEl.classList.add('done');
  }
  gfxBusy = false;
  if (gfxAgain) { gfxAgain = false; applyGraphics(); }
}
// auto-pause when the app is backgrounded or the phone is rotated to portrait
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
const portrait = matchMedia('(orientation: portrait)');
portrait.addEventListener?.('change', () => { if (portrait.matches && touchOn()) pause(); });

// ----------------------------------------------------------------- world logic
function updateArenas(dt, p) {
  for (const a of arenas) {
    if (a.state === 'idle' && p.x > a.trigger && p.x < a.x1 - 2) {
      a.state = 'active'; a.wave = -1; a.timer = 0.8; a.pending = 0;
      a.gates.forEach((g) => setGate(g, true));
      sfx.gateClose(); shake(0.5);
      for (const g of a.gates) { ring(g.x, 6, 0, 0xf85149, { r0: 0.5, r1: 4, dur: 0.5 }); }
      if (a.boss) { UI.banner('FINAL REVIEW', 'Defeat the Monolith to merge', '#ff7b72', 2.6); }
      else UI.banner('REVIEW REQUIRED', 'Resolve every issue to continue', '#ff7b72', 2.4);
      audio.combat = 1;
    }
    if (a.state !== 'active') continue;
    if (a.boss) {
      if (a.timer > 0) { a.timer -= dt; if (a.timer <= 0 && !bossStarted) { bossStarted = true; sfx.bossRoar(); const b = spawnEnemy('boss', 250); b.arena = a.id; cam.zoomT = 1.28; } }
      continue;
    }
    cam.zoomT = 1.12;
    const alive = G.enemies.filter((e) => e.arena === a.id && !e.dead).length + a.pending;
    if (a.timer > 0) {
      a.timer -= dt;
      if (a.timer <= 0) {
        a.wave++; const w = a.waves[a.wave];
        UI.banner(`WAVE ${a.wave + 1} / ${a.waves.length}`, `${w.length} issues opened`, '#ffd33d', 1.4, true);
        w.forEach(([type, x, y], i) => { a.pending++; later(0.15 + i * 0.28, () => { a.pending--; if (a.state === 'active') spawnEnemy(type, x, y || 0, { arena: a.id }); }); });
      }
    } else if (alive === 0) {
      if (a.wave + 1 < a.waves.length) a.timer = 1.3;
      else completeArena(a, p);
    }
  }
  // restore camera zoom outside fights
  if (!arenas.some((a) => a.state === 'active')) cam.zoomT = 1;
}
function completeArena(a, p) {
  a.state = 'done'; audio.combat = 0;
  a.gates.forEach((g) => { setGate(g, false, true); ring(g.x, 6, 0, 0x39d353, { r0: 0.5, r1: 5, dur: 0.7 }); });
  sfx.gateOpen(); screenFlash(0x39d353, 0.25); shake(0.3);
  UI.banner('APPROVED ✔', 'Pull request merged', '#7ee787', 2.4);
  const cx = (a.x0 + a.x1) / 2;
  spawnCommits(p.x, p.y + 1.5, 24);
  giveXP(60, p.x, p.y + 2);
  p.hp = Math.min(p.hpMax, p.hp + 25); p.energy = p.energyMax;
  floatText(p.x, p.y + 3.4, '+25 HP · energy restored', { color: '#7ee787', size: 18 });
  ripple(p.x, 3, 0x39d353, 20, 1.5);
}
function updateRoamers(p) {
  roamers.forEach((r, i) => {
    const s = roamState[i];
    if (s.spawned || s.done) return;
    if (p.x > r[1] - 26 && p.x < r[1] + 10) {
      s.spawned = true;
      const e = spawnEnemy(r[0], r[1], r[2] || 0, { roamer: true });
      e.onDeath = () => { s.done = true; };
    }
  });
}
function updateCheckpoints(p) {
  for (const cp of checkpoints) {
    if (!cp.active && Math.abs(p.x - cp.x) < 2 && p.y < groundAt(cp.x) + 5) {
      activateCheckpoint(cp); G.checkpointX = cp.x;
      sfx.checkpoint(); const gy = groundAt(cp.x);
      ring(cp.x, gy + 3.5, -1.2, 0x39d353, { r0: 0.3, r1: 5, dur: 0.8 }); ring(cp.x, gy + 0.1, -1.2, 0x39d353, { r0: 0.3, r1: 4, dur: 0.6, flat: true });
      cubes(cp.x, gy + 3, 0x39d353, 22, 9, 0.25, true, 1.4); flashLight(cp.x, gy + 3.5, 1, 0x39d353, 60, 0.6);
      p.hp = Math.min(p.hpMax, p.hp + p.hpMax * 0.3); screenFlash(0x39d353, 0.18);
      UI.banner('✔ COMMITTED', 'commit ' + cp.name, '#7ee787', 2, true);
      floatText(p.x, p.y + 3, 'checkpoint saved', { color: '#7ee787', size: 18 });
    }
  }
}
function updateHints(p) {
  while (hintIdx < hints.length && p.x > hints[hintIdx].x) { if (hintIdx > 0) UI.setHint(hintText(hints[hintIdx]), 8); hintIdx++; }
}

// ----------------------------------------------------------------- boss / finish
G.onBossDead = () => {
  if (G.training) { UI.hideBoss(); sfx.win(); UI.banner('BOSS DOWN', 'The Monolith crumbles', '#7ee787', 2, true); return; }
  winTimer = 3.2;
  audio.combat = 0;
  const a = arenas.find((x) => x.boss);
  a.state = 'done'; a.gates.forEach((g) => setGate(g, false, true));
  for (const e of G.enemies.slice()) if (!e.dead && !e.boss) killEnemy(e, {});
  UI.hideBoss(); sfx.win();
  if (G.player) G.player.cheering = true;
  UI.banner('MERGED ✔', 'The Legacy Monolith has been refactored', '#7ee787', 3.2);
  const p = G.player;
  for (let i = 0; i < 6; i++) later(i * 0.25, () => { ring(p.x + (i - 3) * 3, p.y + 1, 0.5, [0x39d353, 0xffd33d, 0xa371f7][i % 3], { r0: 0.4, r1: 8, dur: 0.9 }); cubes(p.x + (i - 3) * 3, p.y + 2, [0x39d353, 0xffd33d, 0xa371f7][i % 3], 20, 12, 0.3, true, 2); });
};
function finishRun() {
  const s = G.stats, p = G.player;
  giveXP(150, p.x, p.y + 2);
  const score = 1000 + s.kills * 20 + s.commits * 5 + G.combo.best * 10 + s.parries * 100 - s.damageTaken * 2 - Math.floor(runT);
  const rank = score >= 3600 ? 'S' : score >= 2800 ? 'A' : score >= 2000 ? 'B' : 'C';
  const isBest = recordRun(G.element, { score, rank });
  G.mode = 'win';
  UI.showWin({ rank, time: runT, kills: s.kills, commits: s.commits, combo: G.combo.best, parries: s.parries, damage: s.damageTaken, isBest });
  UI.refreshCards();
}

// ----------------------------------------------------------------- main loop
const fpsEl = document.getElementById('fps');
const SEC = {}; perfStats.hitches = []; perfStats.gaps = [];
// short readable id of a compiled program: material name + the variant flags that usually differ (skinning, instancing, shadows, map...)
function progName(p) { const k = p.cacheKey; const f = ['SKINNING', 'INSTANCING'].filter((x) => k.includes(x)); return (p.name || '?') + '|' + k.length + '|' + k.slice(0, 18).replace(/,/g, ' '); }
let fpsT = 0;
let capT = 0, worstMs = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (S.fpsCap > 0) { // frame limiter: skip display refreshes until the next slot
    const step = 1000 / S.fpsCap;
    if (now - capT < step - 1.5) return;
    capT = now - capT > step * 3 ? now : capT + step;
  }
  const rawMs = now - last;
  if (rawMs > 30 && perfStats.gaps) { perfStats.gaps.push({ t: +(now / 1000).toFixed(2), gap: +rawMs.toFixed(1), prevWork: +(perfStats.lastWork || 0).toFixed(1), mode: G.mode }); if (perfStats.gaps.length > 60) perfStats.gaps.shift(); }
  const rdt = Math.min(0.05, rawMs / 1000); last = now;
  const t0 = performance.now(); let tp = t0; const mark = (k) => { const n = performance.now(); SEC[k] = n - tp; tp = n; };
  const p = G.player;

  // global input
  if (In.hitNow('skills') && p && G.mode !== 'menu' && G.mode !== 'settings') { G.mode === 'skills' ? closeSkills() : openSkills(); }
  if (In.hitNow('pause')) { if (G.mode === 'play') pause(); else if (G.mode === 'paused') resume(); else if (G.mode === 'skills') closeSkills(); else if (G.mode === 'settings') closeSettings(); }
  if (G.training && G.mode === 'dead') { deadT += rdt; if (deadT > 1.5) { deadT = 0; if (TR.mode === 'endless') { if (!TR.endless?.over) endlessOver(); } else respawn(); } } else deadT = 0;
  if (G.mode === 'dead' && !G.training && addEventListenerOnce.r && document.getElementById('death').classList.contains('show')) { addEventListenerOnce.r = false; respawn(); }
  if (G.mode === 'win' && winKeys.again) { winKeys.again = false; startRun(G.element); }

  // time scale & hit-stop
  if (G.tsHold > 0) G.tsHold -= rdt; else G.tsTarget = 1;
  G.ts += (G.tsTarget - G.ts) * (1 - Math.exp(-(G.tsTarget < G.ts ? 30 : 6) * rdt));
  let gdt = rdt * G.ts;
  if (G.freeze > 0) { G.freeze -= rdt; gdt = 0; }
  const active = G.mode === 'play' || G.mode === 'dead';
  if (!active) gdt = 0;
  G.dt = gdt; G.rdt = rdt;
  setSlow(G.ts); audio.lowHp = !!(p && !p.dead && G.mode === 'play' && p.hp / p.hpMax < 0.3);
  G.time += gdt;
  In.updateAim();

  if (active && p) {
    if (G.mode === 'play') {
      runT += gdt; G.stats.time = runT;
      p.update(gdt); mark('player');
      if (G.training) { updateTraining(gdt, rdt, p); cam.zoomT = 1; } else { updateArenas(gdt, p); updateRoamers(p); updateCheckpoints(p); updateHints(p); }
      G.combo.t -= gdt; if (G.combo.t <= 0 && G.combo.n > 0) comboBreak();
      if (winTimer > 0) { winTimer -= rdt; if (winTimer <= 0) finishRun(); }
      // combat music intensity
      audio.combat = G.enemies.some((e) => !e.dead && e.spawnT <= 0 && Math.abs(e.x - p.x) < 20) ? 1 : 0;
    } else p.update(gdt);
    // timers
    for (let i = G.timers.length - 1; i >= 0; i--) { const t = G.timers[i]; t.t -= gdt; if (t.t <= 0) { G.timers.splice(i, 1); t.fn(); } }
    mark('logic'); updateEnemies(gdt); mark('enemies');
    updateProjectiles(gdt);
    updatePickups(gdt); mark('proj');
  }

  // camera
  let tx, ty, face;
  if (p && G.mode !== 'menu') { tx = p.x; ty = p.y; face = p.facing; }
  else { tx = 18 + Math.sin(now * 0.00012) * 12 + (now * 0.002 % 60); tx = 10 + ((now * 0.0016) % 90); ty = groundAt(tx); face = 1; cam.zoomT = 1.15; }
  updateCamera(rdt, tx, ty, face, now / 1000);
  stepEngine(gdt, rdt, groundAt); mark('fx');
  if (G.training) updateArena(gdt || rdt * 0.1, cam.x, p ? p.x : tx, now / 1000); else updateWorld(gdt || rdt * 0.1, cam.x, p ? p.x : tx, now / 1000);
  mark('world'); UI.updateHUD(rdt);
  updateTouch(); mark('hud');
  const t1 = performance.now(); const progs0 = ENGW.renderer.info.programs.length;
  render();
  const t2 = performance.now(); SEC.render = t2 - t1;
  // hitch log: any frame whose own work took > 12 ms is recorded with its breakdown (and whether shaders compiled)
  if (t2 - t0 > 12) { perfStats.hitches.push({ t: +(now / 1000).toFixed(2), total: +(t2 - t0).toFixed(1), ...Object.fromEntries(Object.entries(SEC).map(([k, v]) => [k, +v.toFixed(1)])), newPrograms: ENGW.renderer.info.programs.length - progs0, progs: ENGW.renderer.info.programs.slice(progs0).map(progName), mode: G.mode }); if (perfStats.hitches.length > 60) perfStats.hitches.shift(); }
  for (const k in SEC) SEC[k] = 0;
  perfStats.lastWork = t2 - t0;
  perfStats.js = perfStats.js ? perfStats.js * 0.95 + (t1 - t0) * 0.05 : t1 - t0;
  perfStats.render = perfStats.render ? perfStats.render * 0.95 + (t2 - t1) * 0.05 : t2 - t1;
  if (rawMs > 0 && rawMs < 250) adaptResolution(rawMs);
  worstMs = Math.max(worstMs, rawMs);
  if (S.fps && (fpsT += rdt) > 0.5) { fpsT = 0; fpsEl.textContent = `${perfStats.fps} fps · worst ${worstMs.toFixed(0)}ms · ${Q.level} · res ${Math.round(ENGW.renderer.getPixelRatio() * 100)}% · cpu ${perfStats.js.toFixed(1)}ms · gpu-submit ${perfStats.render.toFixed(1)}ms`; worstMs = 0; }
  In.endFrame(rdt);
}

const addEventListenerOnce = { r: false }, winKeys = { again: false };
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && G.mode === 'dead') addEventListenerOnce.r = true;
  if (e.code === 'KeyM') toggleMute();
  initAudio();
});
// iOS only unlocks audio inside a real user gesture — try on every tap until it's running
for (const ev of ['pointerdown', 'pointerup', 'touchend']) addEventListener(ev, () => initAudio(), { passive: true });

document.getElementById('loading').classList.add('done');
requestAnimationFrame(frame);

import * as ENG from './engine.js';
window.__game = { EV, startTraining, TR, S, Q, perfStats, openSettings, ENG, G, startRun, respawn, spawnEnemy, openSkills, closeSkills, ELEMENTS, prog, giveXP, cam, finishRun, In };
