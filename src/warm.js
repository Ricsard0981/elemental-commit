// Shader warm-up: build one of everything (all four heroes, every enemy, every transient effect type, the Training
// Grounds, gates, pickups, projectiles) in front of the camera and render it for real behind the loading screen.
// Compiling a WebGL program on ANGLE/D3D11 costs 50–500 ms, so nothing may compile for the first time mid-fight.
// A real render (not just renderer.compile) is needed so the shadow-depth variants are built too.
import * as THREE from 'three';
import * as ENG from './engine.js';
import { G } from './state.js';
import { KEYS } from './elements.js';
import { Player } from './player.js';
import { spawnEnemy } from './enemies.js';
import { spawnProj, spawnCommit, spawnHeart } from './combat.js';
import { gates, groundAt } from './world.js';
import { buildArena, setArenaShown, arenaShown } from './arena.js';

const keep = (arr, set) => { for (let i = arr.length - 1; i >= 0; i--) if (!set.has(arr[i])) arr.splice(i, 1); }; // in place: other modules hold these arrays

export async function warmAll(onStep) {
  const { scene, camera, renderer, sun } = ENG;
  // remember what the running game owns, so only the warm-up's own objects are removed afterwards
  const prevPlayer = G.player, prevBoss = G.boss, prevArena = arenaShown();
  const had = { enemies: new Set(G.enemies), proj: new Set(G.projectiles), pick: new Set(G.pickups), fx: new Set(G.fx), timers: new Set(G.timers) };
  const gateVis = gates.map((g) => g.mesh.visible);
  const X = 10;
  buildArena(); setArenaShown(true);
  // heroes (with shields, ribbons and trails visible)
  const players = KEYS.map((k, i) => {
    const p = new Player(k); p.x = X - 6 + i * 3; p.y = 0; p.syncModel();
    for (const s of Object.values(p.shields)) s.visible = true;
    p.hero?.warm(); return p;
  });
  G.player = players[0];
  // enemies (hp bars on)
  const ens = ['bug', 'pointer', 'brute', 'dummy', 'boss', 'shield', 'charger', 'medic'].map((t, i) => {
    const e = spawnEnemy(t, X - 6 + i * 3, 0, { spawnT: 0 }); e.y = groundAt(e.x) + (t === 'pointer' ? 3 : 0);
    e.group.position.set(e.x, e.y, 0); e.bar.visible = true; e.bar.position.set(e.x, e.y + 2, 1); return e;
  });
  // transient effect types, with the same material parameters and shadow flags as the real ones
  ENG.ring(X, 1, 0.3, 0xffffff, { r0: 1, r1: 2, dur: 5 }); ENG.ring(X, 0.05, 0.3, 0xffffff, { r0: 1, r1: 2, dur: 5, flat: true });
  ENG.slash(X, 1.2, 1, 0xff6a2b, { dur: 5 });
  for (const k of ['scorch', 'puddle', 'crack', 'wind']) ENG.decal(k, X + Math.random() * 4 - 2, 0, 2, 5);
  ENG.impactFlash(X, 1.2, 0xffffff); ENG.sparks(X, 1, 0xffffff, 6); ENG.puff(X, 0.5, 4); ENG.cubes(X, 1, 0xffffff, 4, 4, 0.3, false); ENG.cubes(X, 1, 0xffffff, 4, 4, 0.3, true);
  for (const shape of [undefined, 'rock', 'blade']) spawnProj({ x: X, y: 1.5, vx: 0, vy: 0, shape, color: 0xffffff, life: 99 });
  spawnCommit(X + 1, 1); spawnHeart(X - 1, 1);
  const extra = [];
  const addM = (mat, geo, cast = false, recv = false) => { const m = new THREE.Mesh(geo, mat); m.position.set(X, 1, 0.5); m.castShadow = cast; m.receiveShadow = recv; scene.add(m); extra.push(m); };
  const A = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false };
  addM(new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.85, flatShading: true }), new THREE.BoxGeometry(1, 1, 1), true, true); // pillars
  addM(new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.85, flatShading: true }), new THREE.BoxGeometry(1, 1, 1), true, false); // rock pillar
  addM(new THREE.MeshBasicMaterial(A), new THREE.BoxGeometry(1, 1, 1)); // tidal wave / tornado
  addM(new THREE.MeshBasicMaterial({ ...A, side: THREE.DoubleSide }), new THREE.TorusGeometry(1, 0.1, 6, 12)); // shields / rings
  addM(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), new THREE.IcosahedronGeometry(0.5, 1)); // meteor
  for (const g of gates) g.mesh.visible = true;
  // look at it all, with the sun's shadow camera covering it
  camera.position.set(X, 3.5, 17); camera.lookAt(X, 1, 0); camera.updateMatrixWorld();
  sun.position.set(X - 14, 26, 18); sun.target.position.set(X, 0, 0); sun.target.updateMatrixWorld();
  scene.updateMatrixWorld(true);
  onStep?.('Compiling shaders…');
  try { await ENG.compileScene(true); } catch { /* fall back to plain renders */ }
  ENG.render(); ENG.render();
  // tear down
  for (const p of players) p.destroy();
  for (const e of G.enemies) if (!had.enemies.has(e)) { scene.remove(e.group); scene.remove(e.bar); e.fists?.forEach((f) => scene.remove(f.g)); e.dead = true; }
  keep(G.enemies, had.enemies);
  for (const pr of G.projectiles) if (!had.proj.has(pr)) scene.remove(pr.mesh);
  keep(G.projectiles, had.proj);
  for (const k of G.pickups) if (!had.pick.has(k)) scene.remove(k.mesh);
  keep(G.pickups, had.pick);
  for (const f of G.fx) if (!had.fx.has(f)) { for (let i = 0; i < 4 && f.update(99) !== false; i++); } // finish (and remove) the warm-up's rings/slashes
  keep(G.fx, had.fx); keep(G.timers, had.timers);
  if (!prevPlayer) ENG.clearDecals();
  for (const m of extra) scene.remove(m);
  gates.forEach((g, i) => (g.mesh.visible = gateVis[i]));
  setArenaShown(prevArena);
  G.player = prevPlayer; G.boss = prevBoss;
  return renderer.info.programs.length;
}
