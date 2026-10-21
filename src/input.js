import { camera } from './engine.js';
import * as THREE from 'three';

const MAP = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space', 'KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  main: ['KeyJ', 'Mouse0'], ranged: ['KeyK', 'Mouse2'], guard: ['KeyL', 'KeyF'],
  s1: ['KeyQ', 'KeyU'], s2: ['KeyE', 'KeyI'], dash: ['ShiftLeft', 'ShiftRight'],
  skills: ['Tab', 'KeyT'], pause: ['Escape', 'KeyP'],
};
const held = new Set();
let pressed = new Set();
let released = new Set();
export const mouse = { x: 0, y: 0, active: 0, wx: 0, wy: 0 };
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const v2 = new THREE.Vector2();
const hit = new THREE.Vector3();

export function initInput(canvas) {
  addEventListener('keydown', (e) => {
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!held.has(e.code)) pressed.add(e.code);
    held.add(e.code);
  });
  addEventListener('keyup', (e) => { held.delete(e.code); released.add(e.code); });
  addEventListener('blur', () => held.clear());
  canvas.addEventListener('mousedown', (e) => { const c = 'Mouse' + e.button; held.add(c); pressed.add(c); mouse.active = 3; });
  addEventListener('mouseup', (e) => { const c = 'Mouse' + e.button; held.delete(c); released.add(c); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = -(e.clientY / innerHeight) * 2 + 1; mouse.active = 3;
  });
}
export const down = (a) => MAP[a].some((c) => held.has(c));
export const hitNow = (a) => MAP[a].some((c) => pressed.has(c));
export const upNow = (a) => MAP[a].some((c) => released.has(c));
export const axis = () => (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
export function endFrame(dt) {
  pressed = new Set(); released = new Set();
  mouse.active = Math.max(0, mouse.active - dt);
}
export function updateAim() {
  v2.set(mouse.x, mouse.y);
  ray.setFromCamera(v2, camera);
  if (ray.ray.intersectPlane(plane, hit)) { mouse.wx = hit.x; mouse.wy = hit.y; }
}
