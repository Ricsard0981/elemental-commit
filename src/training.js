// Training Grounds: sandbox (dummies, DPS meter, spawner, toggles), endless waves and combo trials.
// Everything here listens to the combat event bus (events.js) so it never touches the combat code itself.
import { G } from './state.js';
import { on } from './events.js';
import { ELEMENTS, KEYS } from './elements.js';
import { spawnEnemy, clearEnemies } from './enemies.js';
import { giveXP, later } from './combat.js';
import { trainRecord, trainSet, prog } from './skills.js';
import * as UI from './ui.js';
import { sfx } from './audio.js';
import { ARENA_L } from './arena.js';
import { floatText, ring, flashLight } from './engine.js';
import { clamp, rand, pick } from './util.js';

const $ = (id) => document.getElementById(id);
export const T = { active: false, mode: 'sandbox', handlers: null, dummies: [], endless: null, trial: null };
const SPAWN_X = 10;

// ---------------------------------------------------------------- DPS meter (fed by events)
const dps = { log: [], total: 0, hits: 0, best: 0, last: 0, juggle: { hits: 0, h: 0, t: 0 }, bestJuggle: { hits: 0, h: 0, t: 0 }, comboMax: 0, t0: 0 };
function resetMeter() { Object.assign(dps, { log: [], total: 0, hits: 0, best: 0, last: 0, juggle: { hits: 0, h: 0, t: 0 }, bestJuggle: { hits: 0, h: 0, t: 0 }, comboMax: 0 }); G.combo.best = 0; }
on('hit', ({ d, e }) => {
  if (!T.active) return;
  const now = performance.now() / 1000;
  dps.log.push([now, d]); dps.total += d; dps.hits++; dps.last = d;
});
on('airHit', ({ n }) => { if (T.active) dps.juggle.hits = Math.max(dps.juggle.hits, n); });
on('launch', () => { if (T.active) dps.juggle = { hits: 0, h: 0, t: 0 }; });
on('land', ({ t, h, juggle }) => {
  if (!T.active) return;
  dps.juggle.h = h; dps.juggle.t = t; dps.juggle.hits = Math.max(dps.juggle.hits, juggle);
  const b = dps.bestJuggle;
  if (dps.juggle.hits > b.hits || (dps.juggle.hits === b.hits && h > b.h)) dps.bestJuggle = { ...dps.juggle };
});
function currentDps() {
  const now = performance.now() / 1000;
  while (dps.log.length && now - dps.log[0][0] > 5) dps.log.shift();
  if (!dps.log.length) return 0;
  const span = Math.max(1, Math.min(5, now - dps.log[0][0]));
  return dps.log.reduce((a, b) => a + b[1], 0) / span;
}

// ---------------------------------------------------------------- combo trials (data driven)
const AH = (n) => ({ text: `Air chain: land ${n} hits while the dummy is airborne`, ev: 'airHit', test: (d) => d.n >= n });
const LAUNCH = { text: 'Launch: hold Up + Attack (W + J)', ev: 'launcher', test: (d) => d.hits > 0 };
export const TRIALS = [
  { id: 't1', name: 'First Lift', desc: 'Pop the dummy into the air.', steps: [LAUNCH] },
  { id: 't2', name: 'Ground Chain', desc: 'Finish a full 3-hit ground combo.', steps: [{ text: 'Hit 1', ev: 'hit', test: (d) => d.o.kind === 'main' }, { text: 'Hit 2', ev: 'hit', test: (d) => d.o.kind === 'main' }, { text: 'Hit 3 (finisher)', ev: 'hit', test: (d) => d.o.kind === 'main' }] },
  { id: 't3', name: 'Juggler', desc: 'Launch, then keep it up with the air chain.', steps: [LAUNCH, AH(1), AH(2), AH(3)] },
  { id: 't4', name: 'Spike It', desc: 'Launch → air hits → the 3rd air swing spikes it down.', steps: [LAUNCH, AH(2), { text: 'Spike it into the ground (3rd air hit)', ev: 'spike' }, { text: 'Ground bounce', ev: 'bounce' }] },
  { id: 't5', name: 'Slam Dunk', desc: 'Launch, jump up and slam it back down.', steps: [LAUNCH, { text: 'Jump (Space) and Down + Attack to slam', ev: 'slam' }, { text: 'Ground bounce', ev: 'bounce' }] },
  { id: 't6', name: 'Skyfall', desc: 'A long juggle: 4 air hits in a single launch.', steps: [LAUNCH, AH(2), AH(3), AH(4)] },
  { id: 't7', name: 'The Full Course', desc: 'Launch → air hits → spike → bounce → finish it on the ground.', steps: [LAUNCH, AH(2), { text: 'Spike', ev: 'spike' }, { text: 'Bounce', ev: 'bounce' }, { text: 'Hit it again before it gets up', ev: 'hit', test: (d) => d.o.kind === 'main' }] },
  { id: 't8', name: 'Resonant', desc: 'Land 4 imbued main hits (needs a secondary element — use the Lab toggle).', needsRes: true, steps: [{ text: 'Imbued hit 1', ev: 'hit', test: imbued }, { text: 'Imbued hit 2', ev: 'hit', test: imbued }, { text: 'Imbued hit 3', ev: 'hit', test: imbued }, { text: 'Imbued hit 4', ev: 'hit', test: imbued }] },
];
function imbued(d) { return d.o.kind === 'main' && !!G.player?.mods.resKey; }

function startTrial(tr) {
  T.trial = { tr, step: 0, t: 0, done: false, fails: 0 };
  resetDummies(true); G.player.x = ARENA_L / 2 - 0.2; G.player.vx = 0; G.player.vy = 0; G.player.facing = 1; G.player.atk = null; G.player.state = 'free';
  renderTrial();
}
on('launcher', (d) => stepEvent('launcher', d)); on('airHit', (d) => stepEvent('airHit', d)); on('spike', (d) => stepEvent('spike', d)); on('bounce', (d) => stepEvent('bounce', d));
on('slam', (d) => stepEvent('slam', d)); on('hit', (d) => stepEvent('hit', d)); on('land', (d) => { if (T.trial && !T.trial.done) T.trial.landed = true; });
function stepEvent(ev, d) {
  const t = T.trial; if (!T.active || T.mode !== 'trials' || !t || t.done) return;
  const st = t.tr.steps[t.step];
  if (st.ev === ev && (!st.test || st.test(d))) {
    t.step++; t.t = 0; sfx.pickup(t.step);
    if (t.step >= t.tr.steps.length) completeTrial(); else renderTrial();
  }
}
function completeTrial() {
  const t = T.trial, tr = t.tr; t.done = true;
  const first = trainSet('trial:' + tr.id, 1);
  UI.banner('TRIAL COMPLETE', tr.name, '#ffd33d', 2.2, true);
  sfx.levelUp();
  const p = G.player; ring(p.x, p.y + 1, 0.5, 0xffd33d, { r0: 0.4, r1: 6, dur: 0.7 }); flashLight(p.x, p.y + 2, 2, 0xffd33d, 70, 0.5);
  if (first) { giveXP(40, p.x, p.y + 2); UI.toast(`First clear: <b>+40 XP</b>`, '#ffd33d'); }
  renderTrial(); renderTrialList();
  later(1.6, () => { if (T.trial === t) startTrial(tr); });
}
function failTrial(why) {
  const t = T.trial; if (!t || t.done) return;
  t.fails++; t.step = 0; t.t = 0; t.landed = false;
  UI.toast(why, '#ff7b72');
  resetDummies(true); renderTrial();
}

// ---------------------------------------------------------------- dummies / spawner
export function resetDummies(onlyCenter = false) {
  for (const d of T.dummies) d.dead = true;
  T.dummies = [];
  clearEnemies();
  if (T.mode === 'trials' || onlyCenter) { T.dummies.push(spawnEnemy('dummy', ARENA_L / 2 + 2, 0, { arena: 'train', spawnT: 0 })); return; }
  for (const x of [ARENA_L / 2 - 2, ARENA_L / 2 + 5, ARENA_L / 2 + 12]) T.dummies.push(spawnEnemy('dummy', x, 0, { arena: 'train', spawnT: 0 }));
}
function spawnNear(type) {
  const p = G.player, x = clamp(p.x + p.facing * 9, 6, ARENA_L - 6);
  const e = spawnEnemy(type, type === 'boss' ? ARENA_L / 2 + 8 : x, type === 'pointer' ? 5 : 0, { arena: 'train', ...(type === 'boss' ? { bx0: 6, bx1: ARENA_L - 6 } : {}) });
  return e;
}

// ---------------------------------------------------------------- endless waves
function waveList(n) {
  const list = []; let budget = 2 + n * 1.7;
  const pool = [['bug', 1]]; if (n >= 2) pool.push(['pointer', 2]); if (n >= 4) pool.push(['brute', 4]);
  if (n % 5 === 0) { list.push('brute', 'brute'); budget -= 8; }
  while (budget > 0 && list.length < 16) { const opts = pool.filter(([, c]) => c <= budget); if (!opts.length) break; const [t, c] = pick(opts); list.push(t); budget -= c; }
  return list;
}
function startEndless() {
  const p = G.player;
  T.endless = { wave: 0, score: 0, timer: 1.2, spawning: 0, over: false, kills: 0 };
  p.hp = p.hpMax; p.energy = p.energyMax; renderEndless();
}
on('kill', ({ e }) => {
  const E = T.endless; if (!T.active || T.mode !== 'endless' || !E || E.over) return;
  E.kills++; const mult = 1 + Math.floor(G.combo.n / 10) * 0.2;
  E.score += Math.round((e.type === 'brute' ? 40 : e.type === 'pointer' ? 20 : 10) * mult * (1 + E.wave * 0.05));
  renderEndless();
});
function updateEndless(dt, p) {
  const E = T.endless; if (!E || E.over) return;
  const alive = G.enemies.filter((e) => e.arena === 'endless' && !e.dead).length + E.spawning;
  if (E.timer > 0) {
    E.timer -= dt;
    if (E.timer <= 0) {
      E.wave++; const list = waveList(E.wave);
      UI.banner(`WAVE ${E.wave}`, `${list.length} enemies`, '#ffd33d', 1.5, true); sfx.gateClose();
      list.forEach((type, i) => {
        E.spawning++;
        later(0.2 + i * 0.3, () => {
          E.spawning--; if (E.over) return;
          let x = rand(8, ARENA_L - 8), tries = 0; while (Math.abs(x - p.x) < 10 && tries++ < 8) x = rand(8, ARENA_L - 8);
          spawnEnemy(type, x, type === 'pointer' ? 5 : 0, { arena: 'endless' });
        });
      });
      renderEndless();
    }
  } else if (alive === 0) {
    E.score += 50 + E.wave * 10; E.timer = 2.2;
    p.hp = Math.min(p.hpMax, p.hp + p.hpMax * 0.25); p.energy = p.energyMax;
    UI.banner('WAVE CLEARED', `+${50 + E.wave * 10}`, '#7ee787', 1.4, true); sfx.checkpoint(); renderEndless();
  }
}
export function endlessOver() {
  const E = T.endless; if (!E || E.over) return;
  E.over = true;
  const isBest = trainSet('endless', E.score);
  const best = trainRecord('endless') || 0;
  clearEnemies();
  const box = $('endless-over');
  box.innerHTML = `<div class="panel wide"><h2 class="red">Run over</h2><div class="end-score">${E.score}</div><p>Wave <b>${E.wave}</b> · ${E.kills} kills · best combo ×${G.combo.best}${isBest ? '<br><b class="gold">★ New best score</b>' : `<br>Best ${best}`}</p><div class="row"><button class="primary" id="end-retry">Try again</button><button id="end-menu">Training menu</button></div></div>`;
  box.classList.add('show');
  $('end-retry').onclick = () => { box.classList.remove('show'); T.handlers.restart(); };
  $('end-menu').onclick = () => { box.classList.remove('show'); T.handlers.toSelect(); };
}

// ---------------------------------------------------------------- UI
let built = false;
function toggleRow(id, label, hint, get, set) {
  return `<label class="lab-row"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><button class="tgl ${get() ? 'on' : ''}" data-tgl="${id}" role="switch" aria-checked="${!!get()}"><i></i></button></label>`;
}
export function buildLab() {
  if (built) return; built = true;
  const lab = document.createElement('div'); lab.id = 'lab';
  lab.innerHTML = `<button id="lab-toggle" aria-expanded="true"><b>Lab</b><i></i></button><div id="lab-body"></div>`;
  document.body.appendChild(lab);
  const over = document.createElement('section'); over.id = 'endless-over'; over.className = 'screen'; document.body.appendChild(over);
  const sel = document.createElement('section'); sel.id = 'train'; sel.className = 'screen';
  sel.innerHTML = `<div class="panel wide train-panel"><h2>Training Grounds</h2><p class="muted">Test moves, juggle dummies, survive endless waves or master combo trials. Your levels and skills carry over.</p>
    <div class="seg" id="train-modes"><button data-m="sandbox" class="on">Sandbox</button><button data-m="endless">Endless Waves</button><button data-m="trials">Combo Trials</button></div>
    <p id="train-desc" class="muted"></p><div id="train-els"></div><button id="train-back">Back</button></div>`;
  document.body.appendChild(sel);
  const els = sel.querySelector('#train-els');
  for (const k of KEYS) {
    const e = ELEMENTS[k], b = document.createElement('button'); b.className = 'train-el'; b.dataset.k = k; b.style.setProperty('--c', e.css); b.style.setProperty('--c2', e.css2);
    b.innerHTML = `<span class="ti">${UI.ICON[k]}</span><b>${e.name}</b><small>Lv ${prog(k).level}</small>`;
    b.onclick = () => { sfx.click(); T.handlers.start(k, trainMode); };
    els.appendChild(b);
  }
  const desc = { sandbox: 'Dummies with a DPS meter. Spawn any enemy or the boss, switch element and Resonance, toggle infinite energy and cooldowns.', endless: 'Escalating mixed waves. Score builds with kills and combos. Your best score is saved.', trials: 'Eight guided combo challenges: launch, juggle, spike, slam. First clears award XP.' };
  const setMode = (m) => { trainMode = m; sel.querySelectorAll('#train-modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === m)); $('train-desc').textContent = desc[m]; };
  sel.querySelectorAll('#train-modes button').forEach((b) => { b.onclick = () => { sfx.click(); setMode(b.dataset.m); }; });
  setMode('sandbox');
  $('train-back').onclick = () => { sfx.click(); T.handlers.back(); };
  $('lab-toggle').onclick = () => { const l = $('lab'); l.classList.toggle('closed'); $('lab-toggle').setAttribute('aria-expanded', String(!l.classList.contains('closed'))); sfx.click(); };
}
let trainMode = 'sandbox';
export function showSelect(on = true) { buildLab(); $('train').classList.toggle('show', on); }

export function renderLab() {
  const body = $('lab-body'), p = G.player;
  let h = '';
  h += `<section class="lab-sec"><h4>DPS meter</h4><div class="dps"><div><b id="d-dps">0</b><small>DPS (5s)</small></div><div><b id="d-total">0</b><small>total</small></div><div><b id="d-combo">0</b><small>max combo</small></div></div>
    <div class="juggle"><span>last hit <b id="d-last">0</b></span><span>juggle <b id="d-jug">0 hits · 0.0 m · 0.0 s</b></span><span>best <b id="d-best">0 hits</b></span></div><button id="d-reset" class="mini">Reset meter</button></section>`;
  if (T.mode === 'sandbox') {
    h += `<section class="lab-sec"><h4>Spawn</h4><div class="chips">${[['bug', 'Bug'], ['pointer', 'Pointer'], ['brute', 'Bot'], ['boss', 'Boss'], ['dummy', 'Dummy']].map(([k, n]) => `<button class="mini" data-spawn="${k}">${n}</button>`).join('')}<button class="mini warn" data-act="clear">Clear</button><button class="mini" data-act="dummies">Reset dummies</button></div></section>`;
    h += `<section class="lab-sec"><h4>Toggles</h4>${toggleRow('attack', 'Enemies attack back', '', () => G.trainAttack)}${toggleRow('energy', 'Infinite energy', '', () => p.infEnergy)}${toggleRow('cd', 'No cooldowns', '', () => p.noCooldowns)}</section>`;
  }
  if (T.mode !== 'endless') {
    h += `<section class="lab-sec"><h4>Element</h4><div class="chips">${KEYS.map((k) => `<button class="mini el ${G.element === k ? 'on' : ''}" style="--c:${ELEMENTS[k].css}" data-el="${k}">${ELEMENTS[k].name}</button>`).join('')}</div>
      <h4>Secondary (Resonance, max tier)</h4><div class="chips"><button class="mini ${!G.trainRes ? 'on' : ''}" data-res="">Off</button>${KEYS.filter((k) => k !== G.element).map((k) => `<button class="mini el ${G.trainRes === k ? 'on' : ''}" style="--c:${ELEMENTS[k].css}" data-res="${k}">${ELEMENTS[k].name}</button>`).join('')}</div></section>`;
  }
  if (T.mode === 'trials') h += `<section class="lab-sec"><h4>Combo trials</h4><div id="trial-list"></div><div id="trial-box"></div></section>`;
  if (T.mode === 'endless') h += `<section class="lab-sec"><h4>Endless waves</h4><div id="endless-box"></div></section>`;
  h += `<section class="lab-sec"><button class="mini" data-act="mode">Change mode</button><button class="mini" data-act="menu">Main menu</button></section>`;
  body.innerHTML = h;
  // wiring
  $('d-reset').onclick = () => { resetMeter(); sfx.click(); };
  body.querySelectorAll('[data-spawn]').forEach((b) => (b.onclick = () => { sfx.click(); const k = b.dataset.spawn; if (k === 'dummy') T.dummies.push(spawnEnemy('dummy', clamp(G.player.x + G.player.facing * 6, 4, ARENA_L - 4), 0, { arena: 'train', spawnT: 0 })); else spawnNear(k); }));
  body.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
    sfx.click(); const a = b.dataset.act;
    if (a === 'clear') clearEnemies(); else if (a === 'dummies') resetDummies(); else if (a === 'mode') T.handlers.toSelect(); else if (a === 'menu') T.handlers.toMenu();
  }));
  body.querySelectorAll('[data-tgl]').forEach((b) => (b.onclick = () => {
    sfx.click(); const k = b.dataset.tgl, p2 = G.player;
    if (k === 'attack') G.trainAttack = !G.trainAttack; else if (k === 'energy') p2.infEnergy = !p2.infEnergy; else if (k === 'cd') { p2.noCooldowns = !p2.noCooldowns; for (const c in p2.cd) p2.cd[c] = 0; }
    b.classList.toggle('on'); b.setAttribute('aria-checked', String(b.classList.contains('on')));
  }));
  body.querySelectorAll('[data-el]').forEach((b) => (b.onclick = () => { sfx.click(); T.handlers.switchElement(b.dataset.el); }));
  body.querySelectorAll('[data-res]').forEach((b) => (b.onclick = () => { sfx.click(); G.trainRes = b.dataset.res || null; G.player.refreshMods(); renderLab(); if (T.mode === 'trials') { renderTrialList(); renderTrial(); } }));
  if (T.mode === 'trials') { renderTrialList(); renderTrial(); }
  if (T.mode === 'endless') renderEndless();
}
function renderTrialList() {
  const box = $('trial-list'); if (!box) return;
  box.innerHTML = TRIALS.map((tr) => { const done = trainRecord('trial:' + tr.id), locked = tr.needsRes && !G.player?.mods.resKey; return `<button class="trial ${done ? 'done' : ''} ${T.trial?.tr === tr ? 'cur' : ''} ${locked ? 'locked' : ''}" data-trial="${tr.id}"><i>${done ? '✔' : locked ? '🔒' : '○'}</i><span><b>${tr.name}</b><small>${tr.desc}</small></span></button>`; }).join('');
  box.querySelectorAll('[data-trial]').forEach((b) => (b.onclick = () => { const tr = TRIALS.find((x) => x.id === b.dataset.trial); if (tr.needsRes && !G.player.mods.resKey) { UI.toast('Pick a secondary element in the Lab first', '#ffd33d'); return; } sfx.click(); startTrial(tr); renderTrialList(); }));
}
function renderTrial() {
  const box = $('trial-box'); if (!box) return;
  const t = T.trial; if (!t) { box.innerHTML = '<p class="muted">Pick a trial. The dummy resets automatically if you miss.</p>'; return; }
  box.innerHTML = `<div class="steps"><h5>${t.tr.name}</h5>${t.tr.steps.map((s, i) => `<div class="step ${i < t.step ? 'ok' : i === t.step ? 'now' : ''}"><i>${i < t.step || t.done ? '✔' : i + 1}</i><span>${s.text}</span></div>`).join('')}${t.done ? '<div class="step ok"><i>★</i><span><b>Complete!</b> Restarting…</span></div>' : ''}</div>`;
}
function renderEndless() {
  const box = $('endless-box'); if (!box) return; const E = T.endless || { wave: 0, score: 0, kills: 0 };
  box.innerHTML = `<div class="endl"><div><b>${E.wave}</b><small>wave</small></div><div><b>${E.score}</b><small>score</small></div><div><b>${trainRecord('endless') || 0}</b><small>best</small></div></div>`;
}

// ---------------------------------------------------------------- mode control
export function startMode(mode, handlers) {
  buildLab(); T.handlers = handlers; T.mode = mode; T.active = true; T.trial = null; T.endless = null; T.dummies = [];
  G.trainAttack = mode === 'endless';
  resetMeter();
  $('endless-over').classList.remove('show');
  const lab = $('lab'); lab.classList.add('show');
  lab.classList.toggle('closed', document.body.classList.contains('touch'));
  document.body.classList.add('training');
  clearEnemies();
  if (mode === 'sandbox') resetDummies();
  else if (mode === 'trials') { T.dummies.push(spawnEnemy('dummy', ARENA_L / 2 + 2, 0, { arena: 'train', spawnT: 0 })); }
  else startEndless();
  renderLab();
  UI.banner(mode === 'sandbox' ? 'TRAINING GROUNDS' : mode === 'endless' ? 'ENDLESS WAVES' : 'COMBO TRIALS', mode === 'sandbox' ? 'Hit the dummies. Open the Lab for the DPS meter.' : mode === 'endless' ? 'Survive as long as you can' : 'Pick a trial in the Lab', '#ffd33d', 2.6);
}
export function stopTraining() {
  T.active = false; T.trial = null; T.endless = null; T.dummies = [];
  G.trainAttack = true; G.trainRes = null;
  const lab = $('lab'); if (lab) lab.classList.remove('show');
  document.body.classList.remove('training');
  $('endless-over')?.classList.remove('show');
}
let uiT = 0;
export function updateTraining(dt, rdt, p) {
  if (!T.active) return;
  if (T.mode === 'endless') updateEndless(dt, p);
  if (T.mode === 'trials' && T.trial && !T.trial.done) {
    const t = T.trial; t.t += dt;
    const limit = t.step === 0 ? 1e9 : 7;
    if (t.t > limit) failTrial('Too slow — trial reset');
    else if (t.landed && t.step > 0 && t.tr.steps[t.step].ev !== 'hit' && t.tr.steps[t.step].ev !== 'bounce' && t.tr.steps[t.step].ev !== 'slam') failTrial('It hit the ground — trial reset');
    t.landed = false;
  }
  // keep the dummies topped up in the sandbox
  if (T.mode !== 'endless') T.dummies = T.dummies.filter((d) => !d.dead);
  // refresh meter text a few times a second
  uiT += rdt; if (uiT < 0.2) return; uiT = 0;
  const set = (id, v) => { const el = $(id); if (el && el.textContent !== v) el.textContent = v; };
  set('d-dps', String(Math.round(currentDps()))); set('d-total', String(dps.total)); set('d-combo', String(G.combo.best));
  set('d-last', String(dps.last)); const j = dps.juggle, b = dps.bestJuggle;
  set('d-jug', `${j.hits} hits · ${j.h.toFixed(1)} m · ${j.t.toFixed(1)} s`); set('d-best', `${b.hits} hits · ${b.h.toFixed(1)} m`);
}
