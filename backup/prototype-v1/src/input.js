import { camera } from './engine.js';
import * as THREE from 'three';

const MAP = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  main: ['KeyJ', 'Mouse0'], ranged: ['KeyK', 'Mouse2'], guard: ['KeyF', 'KeyL'],
  s1: ['KeyQ', 'KeyU'], s2: ['KeyE', 'KeyI'], dash: ['ShiftLeft', 'ShiftRight'],
  skills: ['Tab', 'KeyT'], pause: ['Escape', 'KeyP'],
};
const held = new Set();
let pressed = new Set();
let released = new Set();
// virtual (touch) actions
const vHeld = new Set();
let vPressed = new Set();
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
export const down = (a) => vHeld.has(a) || MAP[a].some((c) => held.has(c));
export const hitNow = (a) => vPressed.has(a) || MAP[a].some((c) => pressed.has(c));
export const upNow = (a) => MAP[a].some((c) => released.has(c));
export const axis = () => {
  const k = (MAP.right.some((c) => held.has(c)) ? 1 : 0) - (MAP.left.some((c) => held.has(c)) ? 1 : 0);
  return k || touch.ax;
};
export function vDown(a) { if (!vHeld.has(a)) vPressed.add(a); vHeld.add(a); }
export function vUp(a) { vHeld.delete(a); }
export function releaseAllVirtual() { vHeld.clear(); touch.ax = 0; touch.ay = 0; touch.aim = null; }
export function endFrame(dt) {
  pressed = new Set(); released = new Set(); vPressed = new Set();
  mouse.active = Math.max(0, mouse.active - dt);
}
export function updateAim() {
  if (mouse.active <= 0) return;
  v2.set(mouse.x, mouse.y);
  ray.setFromCamera(v2, camera);
  if (ray.ray.intersectPlane(plane, hit)) { mouse.wx = hit.x; mouse.wy = hit.y; }
}
