// Touch controls: floating analog stick (left), thumb-arc action cluster (right),
// drag-to-aim on the ranged button, slide-between buttons, cooldown rings, haptics.
import * as In from './input.js';
import { G } from './state.js';
import { S, touchOn, haptic, onSetting } from './settings.js';
import { ELEMENTS } from './elements.js';
import { ICON } from './ui.js';

const SVG = (inner, fill = false) => `<svg viewBox="0 0 24 24" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"'}>${inner}</svg>`;
const ICONS = {
  main: SVG('<path d="M4.500 19.500C11 18 17 12.500 19.500 4.500"/><path d="M8 20.500c5-.500 9.500-4 12-9" stroke-opacity=".45"/><path d="M3.500 14.500 9.500 20.500"/>'),
  jump: SVG('<path d="M6 13.500l6-6 6 6"/><path d="M6 19l6-6 6 6" stroke-opacity=".5"/>'),
  dash: SVG('<path d="M5 6l6 6-6 6"/><path d="M12 6l6 6-6 6"/>'),
  guard: SVG('<path d="M12 3l7.500 3v5.500c0 4.800-3.200 8-7.500 9.500C7.700 19.500 4.500 16.300 4.500 11.500V6z"/>'),
  ranged: SVG('<circle cx="12" cy="12" r="7.500"/><circle cx="12" cy="12" r="1.600" fill="currentColor"/><path d="M12 1.500v4M12 18.500v4M1.500 12h4M18.500 12h4"/>'),
  s2: SVG('<path d="M12 2.500l2.300 6.400 6.700.300-5.300 4.100 1.900 6.500L12 16l-5.600 3.800 1.900-6.500L3 9.200l6.700-.300z"/>', true),
};
// layout: angle (deg, 0 = right, 90 = up) + radius around the attack button, in px at size 1
const LAYOUT = [
  { id: 'main', act: 'main', a: 0, r: 0, size: 96, label: 'Attack' },
  { id: 'jump', act: 'jump', a: 192, r: 122, size: 76, label: 'Jump' },
  { id: 'dash', act: 'dash', a: 153, r: 118, size: 60, label: 'Dash' },
  { id: 'guard', act: 'guard', a: 116, r: 122, size: 68, label: 'Defend' },
  { id: 'ranged', act: 'ranged', a: 76, r: 120, size: 68, label: 'Ranged', aim: true },
  { id: 's1', act: 's1', a: 166, r: 216, size: 64, label: 'Q' },
  { id: 's2', act: 's2', a: 132, r: 216, size: 64, label: 'E' },
];
// short labels that fit a thumb-sized button (and never clash with Jump/Dash)
const SHORT = {
  fire: { main: 'Blade', ranged: 'Fireball', guard: 'Ward', s1: 'Phoenix', s2: 'Meteors' },
  water: { main: 'Whip', ranged: 'Bolt', guard: 'Bubble', s1: 'Wave', s2: 'Rain' },
  earth: { main: 'Fists', ranged: 'Rock', guard: 'Stone', s1: 'Quake', s2: 'Bastion' },
  air: { main: 'Blades', ranged: 'Cutter', guard: 'Wall', s1: 'Cyclone', s2: 'Fly' },
};
const ANCHOR = { x: 78, y: 82 }; // attack-button centre measured from the bottom-right corner

let root, stickBase, stickKnob, ghost;
const btns = {};
const ptr = new Map(); // pointerId → { kind: 'stick'|'btn', id, x0, y0, ... }
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, lastAy: 0, lastT: 0 };
let built = false, visible = false;

export function initTouch() {
  root = document.getElementById('touch');
  root.innerHTML = `<div class="tc-ghost"><i></i></div><div class="tc-stick"><i></i></div>`;
  ghost = root.querySelector('.tc-ghost');
  stickBase = root.querySelector('.tc-stick');
  stickKnob = stickBase.querySelector('i');
  for (const b of LAYOUT) {
    const el = document.createElement('div');
    el.className = 'tc-btn tc-' + b.id; el.dataset.id = b.id;
    el.innerHTML = `<div class="tc-ring"></div><div class="tc-ico"></div><div class="tc-lbl"></div><div class="tc-cd"></div>${b.id === 'main' ? '<div class="tc-pips"><i></i><i></i><i></i></div>' : ''}${b.aim ? '<div class="tc-aim"><i></i></div>' : ''}`;
    root.appendChild(el);
    btns[b.id] = { ...b, el, ring: el.querySelector('.tc-ring'), cdTxt: el.querySelector('.tc-cd'), lbl: el.querySelector('.tc-lbl'), ico: el.querySelector('.tc-ico'), aimEl: el.querySelector('.tc-aim'), pips: el.querySelectorAll('.tc-pips i'), held: null, lastCd: 0, k: '' };
  }
  root.addEventListener('pointerdown', onDown, { passive: false });
  root.addEventListener('pointermove', onMove, { passive: false });
  root.addEventListener('pointerup', onUp, { passive: false });
  root.addEventListener('pointercancel', onUp, { passive: false });
  root.addEventListener('lostpointercapture', onUp);
  // stop iOS double-tap zoom / long-press callout / scroll bounce
  for (const ev of ['touchstart', 'touchmove', 'touchend']) root.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  layout();
  addEventListener('resize', layout);
  onSetting((k) => { if (['btnSize', 'lefty', 'btnOpacity', 'touch'].includes(k)) layout(); });
  built = true;
}

export function layout() {
  if (!root) return;
  const s = S.btnSize * Math.min(1.15, Math.max(0.78, Math.min(innerWidth, innerHeight) / 390));
  const side = S.lefty ? 'left' : 'right', other = S.lefty ? 'right' : 'left';
  root.style.setProperty('--tc-op', S.btnOpacity);
  root.classList.toggle('lefty', S.lefty);
  for (const b of Object.values(btns)) {
    const rad = (b.a * Math.PI) / 180, dx = Math.cos(rad) * b.r, dy = Math.sin(rad) * b.r;
    const size = b.size * s, cx = (ANCHOR.x - dx) * s, cy = (ANCHOR.y + dy) * s;
    const st = b.el.style;
    st.width = st.height = size + 'px';
    st[side] = `calc(env(safe-area-inset-${side}, 0px) + ${cx - size / 2}px)`; st[other] = 'auto';
    st.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${cy - size / 2}px)`;
    b.cx = cx; b.cy = cy; b.size_ = size;
  }
  root.style.setProperty('--stick', 128 * s + 'px');
  ghost.style[other] = `calc(env(safe-area-inset-${other}, 0px) + ${70 * s}px)`; ghost.style[side] = 'auto';
  ghost.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${44 * s}px)`;
  stick.R = 58 * s; stick.s = s;
}

// refresh icons/labels for the current element (called when a run starts)
export function setElement(key) {
  if (!built) return;
  const e = ELEMENTS[key];
  root.style.setProperty('--c', e.css); root.style.setProperty('--c2', e.css2);
  const names = { ...SHORT[key], jump: 'Jump', dash: 'Dash' };
  for (const b of Object.values(btns)) {
    b.ico.innerHTML = b.id === 's1' ? ICON[key] : ICONS[b.id];
    b.lbl.textContent = names[b.id] || b.label;
  }
}

// ----------------------------------------------------------------- pointer handling
function btnAt(x, y) {
  const el = document.elementFromPoint(x, y)?.closest?.('.tc-btn');
  return el && root.contains(el) ? btns[el.dataset.id] : null;
}
function press(b, pid) {
  b.held = pid; b.el.classList.add('down');
  In.vDown(b.act);
  haptic('tap');
  const r = document.createElement('span'); r.className = 'tc-ripple'; b.el.appendChild(r); setTimeout(() => r.remove(), 450);
}
function release(b) {
  if (!b) return;
  b.held = null; b.el.classList.remove('down', 'aiming');
  In.vUp(b.act);
  if (b.aim) { In.touch.aim = null; }
}
function onDown(e) {
  e.preventDefault();
  In.touch.last = performance.now();
  try { root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  const b = btnAt(e.clientX, e.clientY);
  if (b && b.held === null) {
    const r = b.el.getBoundingClientRect();
    ptr.set(e.pointerId, { kind: 'btn', id: b.id, cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
    press(b, e.pointerId);
    return;
  }
  // stick: anywhere on the movement half of the screen
  const leftHalf = S.lefty ? e.clientX > innerWidth * 0.5 : e.clientX < innerWidth * 0.5;
  if (leftHalf && stick.id === null && e.clientY > innerHeight * 0.22) {
    stick.id = e.pointerId;
    const m = stick.R + 12;
    stick.ox = Math.min(Math.max(e.clientX, m), innerWidth - m); stick.oy = Math.min(Math.max(e.clientY, m), innerHeight - m);
    stick.x = e.clientX; stick.y = e.clientY; stick.lastAy = 0; stick.lastT = performance.now();
    ptr.set(e.pointerId, { kind: 'stick' });
    stickBase.style.transform = `translate(${stick.ox}px, ${stick.oy}px)`;
    root.classList.add('sticking');
    updateStick();
  }
}
function onMove(e) {
  const p = ptr.get(e.pointerId); if (!p) return;
  e.preventDefault();
  if (p.kind === 'stick') { stick.x = e.clientX; stick.y = e.clientY; updateStick(); return; }
  const b = btns[p.id];
  if (b.aim) {
    const dx = e.clientX - p.cx, dy = e.clientY - p.cy, l = Math.hypot(dx, dy);
    if (l > 16 * stick.s) {
      In.touch.aim = { x: dx / l, y: -dy / l };
      b.el.classList.add('aiming');
      b.aimEl.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    }
    return;
  }
  // slide from one button to another (e.g. attack → jump) without lifting the thumb
  const nb = btnAt(e.clientX, e.clientY);
  if (nb && nb !== b && nb.held === null && !nb.aim) {
    release(b); const r = nb.el.getBoundingClientRect();
    p.id = nb.id; p.cx = r.left + r.width / 2; p.cy = r.top + r.height / 2;
    press(nb, e.pointerId);
  }
}
function onUp(e) {
  const p = ptr.get(e.pointerId); if (!p) return;
  ptr.delete(e.pointerId);
  if (p.kind === 'stick') {
    stick.id = null; In.touch.ax = 0; In.touch.ay = 0; In.vUp('down'); In.vUp('up');
    root.classList.remove('sticking');
    stickKnob.style.transform = 'translate(-50%,-50%)';
  } else release(btns[p.id]);
}
function updateStick() {
  let dx = stick.x - stick.ox, dy = stick.y - stick.oy;
  const R = stick.R, l = Math.hypot(dx, dy);
  // floating base: drag past the rim and the base follows the thumb
  if (l > R * 1.35) { const k = (l - R * 1.35) / l; stick.ox += dx * k; stick.oy += dy * k; dx = stick.x - stick.ox; dy = stick.y - stick.oy; stickBase.style.transform = `translate(${stick.ox}px, ${stick.oy}px)`; }
  const cl = Math.min(1, Math.hypot(dx, dy) / R);
  const ang = Math.atan2(dy, dx);
  const kx = Math.cos(ang) * cl * R, ky = Math.sin(ang) * cl * R;
  stickKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
  const nx = kx / R, ny = ky / R, ax = Math.abs(nx);
  // response curve: deadzone → walk → full run (snappy at the rim)
  In.touch.ax = ax < 0.2 ? 0 : Math.sign(nx) * (ax > 0.55 ? 1 : 0.45 + ((ax - 0.2) / 0.35) * 0.45);
  In.touch.ay = ny;
  if (ny > 0.62 && ax < 0.75) In.vDown('down'); else In.vUp('down');
  if (ny < -0.55 && ax < 0.8) In.vDown('up'); else In.vUp('up');
  // flick up = jump
  const now = performance.now();
  if (S.flickJump && ny < -0.72 && stick.lastAy > -0.45 && now - stick.lastT < 180) { In.vDown('jump'); setTimeout(() => In.vUp('jump'), 120); haptic('tap'); }
  if (ny > -0.45) stick.lastT = now;
  stick.lastAy = ny;
}

// ----------------------------------------------------------------- per-frame visuals
export function updateTouch() {
  if (!built) return;
  const want = touchOn() && G.mode === 'play' && !!G.player;
  if (want !== visible) {
    visible = want; root.classList.toggle('show', want);
    if (!want) { for (const b of Object.values(btns)) if (b.held !== null) release(b); ptr.clear(); stick.id = null; root.classList.remove('sticking'); In.releaseAllVirtual(); }
  }
  if (!visible) return;
  const p = G.player, e = ELEMENTS[G.element];
  const cds = { ranged: [p.cd.ranged, p.cdMax.ranged, e.ranged.cost], s1: [p.cd.s1, p.cdMax.s1, e.s1.cost], s2: [p.cd.s2, p.cdMax.s2, e.s2.cost], dash: [p.cd.dash, p.cdMax.dash, 0], guard: [p.cd.guard, 0.3, 0] };
  for (const b of Object.values(btns)) {
    const c = cds[b.id];
    let k = '';
    if (c) {
      const f = c[0] > 0 ? Math.min(1, c[0] / c[1]) : 0, poor = c[2] && p.energy < c[2];
      k = f.toFixed(2) + (poor ? 'p' : '') + (c[0] > 1 ? Math.ceil(c[0]) : '');
      if (k !== b.k) {
        b.el.style.setProperty('--cd', f);
        b.el.classList.toggle('poor', !!poor);
        b.el.classList.toggle('cooling', f > 0);
        b.cdTxt.textContent = c[0] > 1 ? Math.ceil(c[0]) : '';
        if (b.lastCd > 0 && c[0] <= 0) { b.el.classList.remove('ready'); void b.el.offsetWidth; b.el.classList.add('ready'); }
      }
      b.lastCd = c[0];
    }
    if (b.id === 'main') {
      const idx = p.state === 'attack' ? p.combo : p.comboT > 0 ? p.combo : -1;
      k = 'm' + idx;
      if (k !== b.k) b.pips.forEach((pip, i) => pip.classList.toggle('on', i <= idx));
    }
    if (b.id === 'guard') {
      const perfect = p.guarding && p.guardT <= p.parryWindow;
      k += perfect ? 'P' : p.guarding ? 'G' : '';
      if (k !== b.k) { b.el.classList.toggle('perfect', perfect); b.el.classList.toggle('active', p.guarding); }
    }
    b.k = k;
  }
}
export function touchVisible() { return visible; }
