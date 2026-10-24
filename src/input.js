import { camera } from './engine.js';
import { S, setSetting, rumbleHooks } from './settings.js';
import * as THREE from 'three';

const MAP = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  main: ['KeyJ', 'Mouse0'], ranged: ['KeyK', 'Mouse2'], guard: ['KeyF', 'KeyL'],
  s1: ['KeyQ', 'KeyU'], s2: ['KeyE', 'KeyI'], dash: ['ShiftLeft', 'ShiftRight'], revert: ['KeyR'],
  skills: ['Tab', 'KeyT'], pause: ['Escape', 'KeyP'],
};
// user key bindings (Settings -> Controls): the primary key of an action can be rebound, mouse buttons stay as secondaries
for (const [a, code] of Object.entries(S.keymap || {})) if (MAP[a] && typeof code === 'string') MAP[a][0] = code;
export const DEFAULT_KEYS = Object.fromEntries(Object.entries(MAP).map(([a, c]) => [a, c[0]]));
export const ACTIONS = [['left', 'Move left'], ['right', 'Move right'], ['jump', 'Jump'], ['up', 'Up (launcher)'], ['down', 'Down (slam)'], ['main', 'Attack'], ['ranged', 'Ranged'], ['guard', 'Defend'], ['s1', 'Special 1'], ['s2', 'Special 2'], ['dash', 'Dash'], ['revert', 'Revert']];
export const keyName = (c) => (c || '').replace(/^Key/, '').replace(/^Digit/, '').replace('Arrow', '').replace('Left', 'Left ').replace('Right', 'Right ').replace(/^Mouse0$/, 'Click').replace(/^Mouse2$/, 'Right click').replace('Space', 'Space').trim();
let capture = null;
export function captureNext(cb) { capture = cb; }
export function setBinding(action, code) {
  for (const [a, codes] of Object.entries(MAP)) if (a !== action && codes[0] === code && DEFAULT_KEYS[a]) { codes[0] = MAP[action][0]; } // swap rather than leave two actions on one key
  MAP[action][0] = code;
  setSetting('keymap', Object.fromEntries(Object.entries(MAP).filter(([a, c]) => c[0] !== DEFAULT_KEYS[a]).map(([a, c]) => [a, c[0]])));
}
export function resetBindings() { for (const [a, k] of Object.entries(DEFAULT_KEYS)) MAP[a][0] = k; setSetting('keymap', {}); }
const held = new Set();
const pressed = new Set();
const released = new Set();
// virtual (touch) actions
const vHeld = new Set();
const vPressed = new Set();
// ---- gamepad (standard mapping): A jump, X attack, Y ranged, B dash, RT defend, RB/LB specials, LT revert, left stick move/up/down, right stick aims
const pad = { ax: 0, held: new Set(), pressed: new Set(), connected: false, aiming: false };
const PAD = { 0: 'jump', 2: 'main', 3: 'ranged', 1: 'dash', 7: 'guard', 5: 's1', 4: 's2', 6: 'revert', 9: 'pause', 8: 'skills', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
let activePad = null;
export const padConnected = () => pad.connected;
export function pollPad() {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null; for (const g of list) if (g && g.connected && g.mapping !== '') { gp = g; break; }
  if (!gp) { if (pad.connected) { pad.connected = false; pad.held.clear(); pad.ax = 0; if (pad.aiming) { touch.aim = null; pad.aiming = false; } } return; }
  pad.connected = true; activePad = gp;
  const next = new Set();
  gp.buttons.forEach((b, i) => { if ((b.pressed || b.value > 0.55) && PAD[i]) next.add(PAD[i]); });
  const lx = gp.axes[0] || 0, ly = gp.axes[1] || 0, dead = 0.26;
  pad.ax = Math.abs(lx) > dead ? Math.sign(lx) * Math.min(1, (Math.abs(lx) - dead) / (1 - dead)) : 0;
  if (next.has('left')) pad.ax = -1; if (next.has('right')) pad.ax = 1; next.delete('left'); next.delete('right');
  if (ly < -0.6) next.add('up'); if (ly > 0.6) next.add('down');
  const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0, rl = Math.hypot(rx, ry);
  if (rl > 0.35) { touch.aim = { x: rx / rl, y: -ry / rl }; pad.aiming = true; } else if (pad.aiming) { touch.aim = null; pad.aiming = false; }
  for (const a of next) if (!pad.held.has(a)) pad.pressed.add(a);
  pad.held = next;
}
const RUMBLE = { hit: [0.15, 0.35, 45], crit: [0.4, 0.6, 80], kill: [0.3, 0.5, 70], block: [0.25, 0.3, 60], parry: [0.9, 0.9, 150], damage: [0.7, 0.3, 170], hurt: [0.7, 0.3, 170], dash: [0, 0.3, 40], cast: [0.3, 0.3, 60], boss: [1, 1, 320], levelup: [0.5, 0.5, 200] };
rumbleHooks.push((kind) => {
  if (!pad.connected || !activePad || !S.haptics) return;
  const r = RUMBLE[kind]; if (!r) return;
  try { activePad.vibrationActuator?.playEffect('dual-rumble', { duration: r[2], strongMagnitude: r[0], weakMagnitude: r[1] }); } catch { /* ignore */ }
});
export const touch = { ax: 0, ay: 0, aim: null, last: -1e9 };
export const mouse = { x: 0, y: 0, active: 0, wx: 0, wy: 0 };
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const v2 = new THREE.Vector2();
const hit = new THREE.Vector3();
// browsers synthesize mouse events after a tap — ignore those so touch aim isn't hijacked
const fromTouch = (e) => e.sourceCapabilities?.firesTouchEvents || performance.now() - touch.last < 900;

export function initInput(canvas) {
  addEventListener('keydown', (e) => {
    if (capture) { e.preventDefault(); const cb = capture; capture = null; cb(e.code === 'Escape' ? null : e.code); return; }
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!held.has(e.code)) pressed.add(e.code);
    held.add(e.code);
  });
  addEventListener('keyup', (e) => { held.delete(e.code); released.add(e.code); });
  addEventListener('blur', () => { held.clear(); releaseAllVirtual(); });
  canvas.addEventListener('mousedown', (e) => { if (fromTouch(e)) return; const c = 'Mouse' + e.button; held.add(c); pressed.add(c); mouse.active = 3; });
  addEventListener('mouseup', (e) => { const c = 'Mouse' + e.button; held.delete(c); released.add(c); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => {
    if (fromTouch(e)) return;
    mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = -(e.clientY / innerHeight) * 2 + 1; mouse.active = 3;
  });
  addEventListener('touchstart', () => { touch.last = performance.now(); mouse.active = 0; }, { passive: true, capture: true });
}
export const down = (a) => vHeld.has(a) || pad.held.has(a) || MAP[a].some((c) => held.has(c));
export const hitNow = (a) => vPressed.has(a) || pad.pressed.has(a) || MAP[a].some((c) => pressed.has(c));
export const upNow = (a) => MAP[a].some((c) => released.has(c));
export const axis = () => {
  const k = (MAP.right.some((c) => held.has(c)) ? 1 : 0) - (MAP.left.some((c) => held.has(c)) ? 1 : 0);
  return k || touch.ax || pad.ax;
};
export function vDown(a) { if (!vHeld.has(a)) vPressed.add(a); vHeld.add(a); }
export function vUp(a) { vHeld.delete(a); }
export function releaseAllVirtual() { vHeld.clear(); touch.ax = 0; touch.ay = 0; touch.aim = null; }
export function endFrame(dt) {
  pressed.clear(); released.clear(); vPressed.clear(); pad.pressed.clear();
  mouse.active = Math.max(0, mouse.active - dt);
}
export function updateAim() {
  if (mouse.active <= 0) return;
  v2.set(mouse.x, mouse.y);
  ray.setFromCamera(v2, camera);
  if (ray.ray.intersectPlane(plane, hit)) { mouse.wx = hit.x; mouse.wy = hit.y; }
}
