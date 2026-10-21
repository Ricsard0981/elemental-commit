import { G } from './state.js';
import { ELEMENTS, KEYS } from './elements.js';
import { SKILLS, TREE_BRANCHES, prog, pointsLeft, spent, xpNeed, canBuy, isUnlocked, buy, respec, MAX_LEVEL, bestRun, setResonance } from './skills.js';
import { sfx } from './audio.js';
import { css, clamp } from './util.js';

const $ = (id) => document.getElementById(id);
let H = {}; // game callbacks
const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

const SVG = {
  fire: '<svg viewBox="0 0 24 24"><path d="M12.5 2c.6 3.6-3.6 5.6-3.6 9.7 0 1.3.5 2.4 1.3 3.2-.2-1.8.7-3 1.8-4 .3 1.6 1.7 2.2 1.7 4 0 .5-.1.9-.3 1.2 1.7-.8 2.9-2.5 2.9-4.5 0-2.9-1.7-4.2-2.3-6.3-.6.6-1.1 1.4-1.2 2.3C12.2 6.5 13 4.4 12.5 2zM12 22a6 6 0 0 1-6-6c0-2.2 1.2-3.9 2.3-5.2C8.2 13.600 9.600 15 12 15s3.800-1.400 3.700-4.200c1.100 1.300 2.300 3 2.300 5.200a6 6 0 0 1-6 6z" fill="currentColor"/></svg>',
  water: '<svg viewBox="0 0 24 24"><path d="M12 2.500C9.500 6.700 5.500 10.300 5.500 14.800a6.500 6.500 0 0 0 13 0c0-4.500-4-8.100-6.500-12.300z" fill="currentColor"/><path d="M9 15a3 3 0 0 0 3 3" stroke="#fff" stroke-opacity=".6" stroke-width="1.500" fill="none" stroke-linecap="round"/></svg>',
  earth: '<svg viewBox="0 0 24 24"><path d="M1.500 20.500 9 7l4 6.500 2.500-3.500 7 10.500z" fill="currentColor"/><path d="M9 7l2 3.500-2.200-1-2.200 2z" fill="#fff" fill-opacity=".5"/></svg>',
  air: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"><path d="M3 8.500h11a3 3 0 1 0-3-3"/><path d="M3 13h15.500a3 3 0 1 1-3 3"/><path d="M3 17.500h7"/></svg>',
};
export const ICON = SVG;
const SLOTS = [['main', 'J', 'Main'], ['ranged', 'K', 'Ranged'], ['guard', 'F', 'Defend'], ['s1', 'Q', 'Special'], ['s2', 'E', 'Special'], ['dash', '⇧', 'Dash']];
const RANKS = ['', 'NICE', 'GREAT', 'EXCELLENT', 'BRILLIANT', 'LEGENDARY', 'GODLIKE', 'MERGE MASTER', 'FULL STACK'];
const RANK_COL = ['#fff', '#7ee787', '#58a6ff', '#d2a8ff', '#ffd33d', '#ff9a4d', '#ff6b6b', '#ff6bd6', '#ffffff'];

export function initUI(handlers) {
  H = handlers;
  // ---- element selection
  const cards = $('cards');
  KEYS.forEach((k, i) => {
    const e = ELEMENTS[k];
    const card = document.createElement('button');
    card.className = 'card'; card.style.setProperty('--c', e.css); card.style.setProperty('--c2', e.css2); card.dataset.el = k;
    const pr = prog(k);
    const stat = (n, label) => `<div class="stat"><span>${label}</span><i><b style="width:${n * 20}%"></b></i></div>`;
    card.innerHTML = `
      <div class="key">${i + 1}</div>
      <div class="art">${SVG[k]}</div>
      <h3>${e.name}</h3><p class="blurb">${e.blurb}</p>
      <div class="stats">${stat(e.stats[0], 'Power')}${stat(e.stats[1], 'Sustain')}${stat(e.stats[2], 'Defense')}${stat(e.stats[3], 'Speed')}</div>
      <ul class="abil">
        <li><kbd>J</kbd> <b>${e.main.name}</b></li><li><kbd>K</kbd> <b>${e.ranged.name}</b></li><li><kbd>F</kbd> <b>${e.guard.name}</b></li>
        <li><kbd>Q</kbd> <b>${e.s1.name}</b></li><li><kbd>E</kbd> <b>${e.s2.name}</b></li></ul>
      <div class="lvl" data-lvl="${k}"></div>`;
    card.onclick = () => { sfx.click(); H.onPick(k); };
    card.onmouseenter = () => sfx.hover();
    cards.appendChild(card);
  });
  refreshCards();
  addEventListener('keydown', (e) => { if (G.mode === 'menu' && /^Digit[1-4]$/.test(e.code)) { sfx.click(); H.onPick(KEYS[+e.code[5] - 1]); } });
  // ---- hud slots
  const ab = $('abilities');
  SLOTS.forEach(([id, key, label]) => {
    const d = document.createElement('div');
    d.className = 'slot'; d.id = 'slot-' + id;
    d.innerHTML = `<div class="cdfill"></div><div class="skey">${key}</div><div class="sname"></div><div class="cdnum"></div>`;
    ab.appendChild(d);
  });
  $('btn-skills').onclick = () => H.openSkills();
  $('skillhint').onclick = () => H.openSkills();
  $('btn-resume').onclick = () => H.resume();
  $('btn-pause-skills').onclick = () => H.openSkills();
  $('btn-pause-menu').onclick = () => H.toMenu();
  $('btn-respawn').onclick = () => H.respawn();
  $('btn-death-skills').onclick = () => H.openSkills();
  $('btn-again').onclick = () => H.again();
  $('btn-win-menu').onclick = () => H.toMenu();
  $('btn-win-skills').onclick = () => H.openSkills();
  $('btn-skills-close').onclick = () => H.closeSkills();
  $('btn-respec').onclick = () => { respec(G.element); H.skillsChanged(); renderTree(); sfx.click(); toast('Skills refunded', '#58a6ff'); };
  // progress strip
  const pg = $('progress');
  for (let i = 0; i < 34; i++) { const s = document.createElement('i'); pg.appendChild(s); }
}

export function refreshCards() {
  for (const k of KEYS) {
    const pr = prog(k), pts = pointsLeft(k), best = bestRun(k);
    const el = document.querySelector(`[data-lvl="${k}"]`);
    if (el) el.innerHTML = `Lv <b>${pr.level}</b>${pts > 0 ? ` · <span class="pts">${pts} skill point${pts > 1 ? 's' : ''}</span>` : ''}${best ? ` · best ${best.rank}` : ''}`;
  }
}

export function show(id, on = true) { $(id).classList.toggle('show', on); }
export function setHudVisible(v) { $('hud').classList.toggle('show', v); }

// ----------------------------------------------------------------- HUD
let lagHp = 100, lastCombo = 0, hintT = 0, lastLvlKey = '';
export function startRunHUD() {
  const e = ELEMENTS[G.element], root = document.documentElement;
  root.style.setProperty('--c', e.css); root.style.setProperty('--c2', e.css2);
  $('elicon').innerHTML = SVG[G.element]; $('elname').textContent = e.name;
  for (const [id] of SLOTS) {
    const slot = $('slot-' + id);
    const a = id === 'dash' ? { name: 'Dash' } : e[id];
    slot.querySelector('.sname').textContent = a.name;
    slot.title = a.desc || '';
  }
  lagHp = 100; hideBoss();
}
// cached DOM writes — the HUD updates every frame, so only touch the DOM when a value changes
const _w = new Map();
function put(id, prop, val) {
  const key = id + '|' + prop;
  if (_w.get(key) === val) return;
  _w.set(key, val);
  const el = typeof id === 'string' ? $(id) : id;
  if (prop === 'text') el.textContent = val; else el.style[prop] = val;
}
export function updateHUD(dt) {
  const p = G.player; if (!p) return;
  const hpK = clamp(p.hp / p.hpMax, 0, 1);
  lagHp = lagHp > hpK * 100 ? Math.max(hpK * 100, lagHp - 28 * dt) : hpK * 100;
  put('hp-fill', 'width', (hpK * 100).toFixed(1) + '%'); put('hp-lag', 'width', lagHp.toFixed(1) + '%');
  put('hp-txt', 'text', `${Math.ceil(p.hp)} / ${p.hpMax}`);
  const low = hpK < 0.3; if (_w.get('low') !== low) { _w.set('low', low); $('hpbar').classList.toggle('low', low); }
  const enK = clamp(p.energy / p.energyMax, 0, 1);
  put('en-fill', 'width', (enK * 100).toFixed(1) + '%'); put('en-txt', 'text', String(Math.floor(p.energy)));
  // xp
  const pr = prog(G.element);
  const need = xpNeed(pr.level);
  put('xp-fill', 'width', (pr.level >= MAX_LEVEL ? 100 : (pr.xp / need) * 100).toFixed(1) + '%');
  const lk = pr.level + ':' + pointsLeft(G.element);
  if (lk !== lastLvlKey) { lastLvlKey = lk; $('ellvl').textContent = 'Lv ' + pr.level; const pts = pointsLeft(G.element); $('skillhint').classList.toggle('show', pts > 0); $('skillhint').textContent = `${document.body.classList.contains('touch') ? '' : 'Tab · '}${pts} skill point${pts > 1 ? 's' : ''}`; }
  // abilities (desktop bar — the touch layer draws its own)
  if (!document.body.classList.contains('touch')) {
    const set = (id, cd, max, cost) => {
      const s = $('slot-' + id);
      const f = cd > 0 ? cd / max : 0;
      put(s.querySelector('.cdfill'), 'transform', `scaleY(${f.toFixed(3)})`);
      put(s.querySelector('.cdnum'), 'text', cd > 0.05 ? (cd >= 1 ? String(Math.ceil(cd)) : cd.toFixed(1)) : '');
      s.classList.toggle('cd', cd > 0.05);
      s.classList.toggle('poor', !!cost && p.energy < cost);
      s.classList.toggle('active', (id === 'guard' && p.guarding) || (id === 'main' && p.state === 'attack'));
    };
    const e = ELEMENTS[G.element];
    set('main', 0, 1, 0); set('ranged', p.cd.ranged, p.cdMax.ranged, e.ranged.cost); set('guard', p.cd.guard, 0.35, 0);
    set('s1', p.cd.s1, p.cdMax.s1, e.s1.cost); set('s2', p.cd.s2, p.cdMax.s2, e.s2.cost); set('dash', p.cd.dash, p.cdMax.dash, 0);
  }
  // combo
  const c = G.combo;
  const showC = c.n >= 2; if (_w.get('cshow') !== showC) { _w.set('cshow', showC); $('combo').classList.toggle('show', showC); }
  if (c.n !== lastCombo) {
    if (c.n > lastCombo) restart($('combo-n'), 'bump');
    lastCombo = c.n;
    $('combo-n').textContent = c.n;
    const col = RANK_COL[Math.min(c.rank, RANK_COL.length - 1)];
    $('combo-n').style.color = col; $('combo-rank').style.color = col; $('combo-rank').textContent = RANKS[Math.min(c.rank, RANKS.length - 1)];
  }
  put('combo-bar', 'transform', `scaleX(${clamp(c.t / 3.4, 0, 1).toFixed(3)})`);
  put('commit-n', 'text', String(G.stats.commits));
  // level progress strip
  const pgs = $('progress').children, prog_ = clamp(p.x / 268, 0, 1);
  for (let i = 0; i < pgs.length; i++) { const on = i / pgs.length < prog_; if (pgs[i].dataset.on !== String(on)) { pgs[i].dataset.on = String(on); pgs[i].className = on ? 'on l' + (1 + (i % 4)) : ''; } }
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('hint').classList.remove('show'); }
}
export function setHint(html, dur = 7) { const h = $('hint'); h.innerHTML = html; h.classList.add('show'); hintT = dur; }

// ----------------------------------------------------------------- event feedback
export function comboMilestone(rank) {
  const el = $('combo-rank'); restart(el, 'bump');
  banner(RANKS[Math.min(rank, RANKS.length - 1)] + '!', `${G.combo.n} hit combo`, RANK_COL[Math.min(rank, RANK_COL.length - 1)], 1.3, true);
}
let bannerTimer;
export function banner(title, sub = '', color = '#fff', dur = 2.4, small = false) {
  const b = $('banner');
  b.className = small ? 'small' : '';
  b.innerHTML = `<div class="bt" style="color:${color};text-shadow:0 0 30px ${color}">${title}</div><div class="bs">${sub}</div>`;
  restart(b, 'play'); clearTimeout(bannerTimer);
  b.style.setProperty('--dur', dur + 's');
}
export function levelUpBanner(lvl) {
  banner('LEVEL UP!', `Level ${lvl} · +1 skill point — press <b>Tab</b>`, '#7ee787', 2.6);
}
export function toast(text, color = '#fff') {
  const t = document.createElement('div'); t.className = 'toast'; t.style.borderColor = color; t.innerHTML = text;
  $('toasts').appendChild(t); setTimeout(() => t.remove(), 3200);
}
export function damageVignette() { restart($('vignette'), 'hit'); }
export function parryFlash() { restart($('parryfx'), 'go'); }
export function commitPop() { restart($('commits'), 'pop'); }
export function noEnergy(slot) { const s = $('slot-' + slot); if (s) restart(s, 'shake'); restart($('enbar'), 'shake'); }
export function castFlash(slot) { const s = $('slot-' + slot); if (s) restart(s, 'cast'); }
export function ready(slot) { const s = $('slot-' + slot); if (s) restart(s, 'ready'); }
export function showDeath() {
  if (G.training) return;
  setTimeout(() => { if (G.mode === 'dead') { show('death', true); refreshDeath(); } }, 1400);
}
function refreshDeath() {
  $('death-pts').textContent = pointsLeft(G.element) > 0 ? `You have ${pointsLeft(G.element)} unspent skill point(s)!` : '';
}
export function bossBar(e) {
  const b = $('bossbar'); b.classList.add('show');
  $('boss-name').textContent = e.name;
  $('boss-fill').style.width = clamp(e.hp / e.hpMax, 0, 1) * 100 + '%';
  $('boss-poise').style.width = clamp(e.poise / e.poiseMax, 0, 1) * 100 + '%';
}
export function hideBoss() { $('bossbar').classList.remove('show'); }
export function showWin(r) {
  $('win-rank').textContent = r.rank; $('win-rank').className = 'r' + r.rank;
  $('win-stats').innerHTML = `
    <div><span>Time</span><b>${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}</b></div>
    <div><span>Bugs squashed</span><b>${r.kills}</b></div><div><span>Commits</span><b>${r.commits}</b></div>
    <div><span>Best combo</span><b>×${r.combo}</b></div><div><span>Perfect parries</span><b>${r.parries}</b></div><div><span>Damage taken</span><b>${r.damage}</b></div>`;
  $('win-new').style.display = r.isBest ? 'block' : 'none';
  show('win', true);
}

// ----------------------------------------------------------------- skill tree
export function renderTree() {
  const el = G.element, e = ELEMENTS[el], tree = $('tree');
  document.documentElement.style.setProperty('--c', e.css); document.documentElement.style.setProperty('--c2', e.css2);
  const pr = prog(el), pts = pointsLeft(el);
  $('sk-title').innerHTML = `<span class="ico">${SVG[el]}</span> ${e.name} <small>Skill Tree</small>`;
  $('sk-level').innerHTML = `Level <b>${pr.level}</b> · XP ${pr.xp}/${pr.level >= MAX_LEVEL ? '—' : xpNeed(pr.level)}`;
  $('sk-points').innerHTML = `<b>${pts}</b> skill point${pts === 1 ? '' : 's'}`;
  $('sk-points').classList.toggle('has', pts > 0);
  tree.innerHTML = '<svg id="tree-lines"></svg>';
  const root = document.createElement('div'); root.className = 'node root'; root.innerHTML = `<div class="ico">${SVG[el]}</div><b>${e.name}</b>`; root.id = 'node-root';
  tree.appendChild(root);
  const cols = document.createElement('div'); cols.className = 'branches'; tree.appendChild(cols);
  for (let b = 0; b < 4; b++) {
    const col = document.createElement('div'); col.className = 'branch' + (b === 3 ? ' reson' : '');
    const sec = b === 3 && pr.res ? `<small class="sec" style="color:${ELEMENTS[pr.res].css}">${ELEMENTS[pr.res].name}</small>` : '';
    col.innerHTML = `<h4>${TREE_BRANCHES[el][b]}${sec}</h4>`;
    for (let t = 0; t < 3; t++) {
      const s = SKILLS[el].find((x) => x.branch === b && x.tier === t);
      const owned = pr.owned.includes(s.id), unlocked = isUnlocked(el, s), buyable = canBuy(el, s);
      const n = document.createElement('button');
      n.className = 'node ' + (owned ? 'owned' : buyable ? 'avail' : unlocked ? 'poor' : 'locked');
      n.id = 'node-' + s.id;
      n.innerHTML = `<div class="ico">${s.icon}</div><div class="nt"><b>${s.name}</b><span>${s.desc}</span></div><div class="cost">${owned ? '✔' : s.cost}</div>`;
      n.onclick = () => {
        if (buy(el, s)) {
          sfx.buy(); H.skillsChanged(); renderTree();
          const nn = $('node-' + s.id); restart(nn, 'bought');
          const r = nn.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2);
          if (s.branch === 3 && s.tier === 0) openResPicker();
        } else { sfx.hover(); restart(n, 'shake'); }
      };
      n.onmouseenter = () => sfx.hover();
      col.appendChild(n);
    }
    cols.appendChild(col);
  }
  requestAnimationFrame(drawLines);
}
function drawLines() {
  const tree = $('tree'), svg = $('tree-lines'); if (!svg) return;
  const tr = tree.getBoundingClientRect(); svg.setAttribute('width', tr.width); svg.setAttribute('height', tr.height);
  svg.innerHTML = '';
  const c = (id) => { const e = $(id); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2 - tr.left, top: r.top - tr.top, bot: r.bottom - tr.top }; };
  const el = G.element, owned = prog(el).owned;
  const line = (a, b, on) => {
    if (!a || !b) return;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const my = (a.bot + b.top) / 2;
    p.setAttribute('d', `M${a.x} ${a.bot} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.top}`);
    p.setAttribute('class', on ? 'on' : ''); svg.appendChild(p);
  };
  for (let b = 0; b < 4; b++) {
    const ids = [0, 1, 2].map((t) => SKILLS[el].find((x) => x.branch === b && x.tier === t).id);
    line(c('node-root'), c('node-' + ids[0]), owned.includes(ids[0]));
    line(c('node-' + ids[0]), c('node-' + ids[1]), owned.includes(ids[1]));
    line(c('node-' + ids[1]), c('node-' + ids[2]), owned.includes(ids[2]));
  }
}
addEventListener('resize', () => requestAnimationFrame(drawLines));

// ---- Resonance: pick the secondary element (T1 of the 4th branch)
export function openResPicker() {
  const el = G.element, pr = prog(el);
  let m = $('resmodal');
  if (!m) { m = document.createElement('section'); m.id = 'resmodal'; m.className = 'screen'; document.body.appendChild(m); }
  const opts = KEYS.filter((k) => k !== el);
  m.innerHTML = `<div class="panel wide"><h2>Choose your Resonance</h2><p class="muted">A second element flows through every main attack: ground combo, launcher, air chain and slam. Upgrade it with Harmony and Convergence. You can change it any time while the node is owned.</p>
    <div class="res-cards">${opts.map((k) => { const e = ELEMENTS[k]; return `<button class="res-card ${pr.res === k ? 'on' : ''}" data-k="${k}" style="--c:${e.css};--c2:${e.css2}"><span class="ri">${SVG[k]}</span><b>${e.name}</b><small>${RES_TXT[k]}</small></button>`; }).join('')}</div></div>`;
  m.classList.add('show');
  m.querySelectorAll('.res-card').forEach((b) => (b.onclick = () => { setResonance(el, b.dataset.k); sfx.buy(); m.classList.remove('show'); H.skillsChanged(); renderTree(); toast(`Resonance: <b>${ELEMENTS[b.dataset.k].name}</b>`, ELEMENTS[b.dataset.k].css); }));
}
const RES_TXT = { fire: 'Main hits ignite enemies — burn damage over time.', water: 'Main hits chill and slow enemies.', earth: 'Main hits build stun and break poise.', air: 'Main hits pull enemies in and add extra lift.' };
function burst(x, y) {
  const c = getComputedStyle(document.documentElement).getPropertyValue('--c2') || '#fff';
  for (let i = 0; i < 26; i++) {
    const d = document.createElement('i'); d.className = 'confetti';
    const a = Math.random() * 6.28, r = 60 + Math.random() * 120;
    d.style.cssText = `left:${x}px;top:${y}px;background:${i % 3 ? c : '#7ee787'};--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px;`;
    document.body.appendChild(d); setTimeout(() => d.remove(), 900);
  }
}
