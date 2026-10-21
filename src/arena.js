// Training Grounds playfield: painterly sky, toon terrain with grass tufts, stone ruins and Corruption crystals.
// A style test for the future world (elemental fantasy being eaten by a digital Corruption), not the world overhaul.
import * as THREE from 'three';
import { scene, sun, hemi, Q } from './engine.js';
import { terrain, dyn, ripples, setLevelVisible } from './world.js';
import { toonMaterial, outlineHard, addOutline } from './toon.js';
import { rand, clamp, lerp } from './util.js';

export const ARENA_L = 64;
const ground = { L: ARENA_L, ground: () => 0, solids(x0, x1, out) {
  out.length = 0;
  out.push({ x0: Math.max(0, x0 - 1), x1: Math.min(ARENA_L, x1 + 1), y0: -50, y1: 0 });
  for (const d of dyn) if (d.x1 > x0 && d.x0 < x1) out.push(d);
  out.push({ x0: -2, x1: 0, y0: -50, y1: 60 }, { x0: ARENA_L, x1: ARENA_L + 2, y0: -50, y1: 60 });
  return out;
} };

let root = null, skyMat = null, built = false, tufts = null, crystals = [], shards = [], saved = null;
const dummyO = new THREE.Object3D();

// one draw call per instanced group (the arena has hundreds of small props)
function inst(geo, mat, items, shadow = false) {
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => { dummyO.position.set(...it.p); dummyO.scale.set(...it.s); dummyO.rotation.set(...(it.r || [0, 0, 0])); dummyO.updateMatrix(); m.setMatrixAt(i, dummyO.matrix); if (it.c !== undefined) m.setColorAt(i, new THREE.Color(it.c)); });
  m.castShadow = shadow; m.frustumCulled = false; root.add(m); return m;
}
function hash(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }

function paintTexture(w, h, base, strokes) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < strokes.n; i++) {
    const c = strokes.cols[Math.floor(Math.random() * strokes.cols.length)];
    g.strokeStyle = c; g.globalAlpha = rand(0.12, 0.4); g.lineWidth = rand(2, strokes.w);
    const x = Math.random() * w, y = Math.random() * h, l = rand(8, strokes.l), a = rand(-0.6, 0.6);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5 + rand(-4, 4), x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 2;
  return t;
}

export function buildArena() {
  if (built) return; built = true;
  root = new THREE.Group(); root.visible = false; scene.add(root);
  const L = ARENA_L;
  // ---- painterly sky dome
  skyMat = new THREE.ShaderMaterial({ name: 'arenaSky',
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform float uTime; varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * n(p); p *= 2.03; a *= .5; } return s; }
      void main(){
        float y = vP.y, az = atan(vP.x, vP.z);
        vec3 top = vec3(.10,.12,.30), mid = vec3(.46,.30,.52), hor = vec3(.98,.66,.46), low = vec3(.30,.20,.34);
        vec3 c = mix(hor, mid, smoothstep(-.02, .32, y)); c = mix(c, top, smoothstep(.25, .85, y)); c = mix(low, c, smoothstep(-.25, 0., y));
        // painterly cloud bands (stepped so they read as brush shapes)
        vec2 cp = vec2(az * 1.8 + uTime * .01, y * 3.2);
        float cl = fbm(cp * 2. + vec2(0., fbm(cp * 3.))); float band = smoothstep(.52, .56, cl) * smoothstep(.0, .2, y) * smoothstep(.75, .35, y);
        c = mix(c, mix(vec3(1.,.82,.68), vec3(.82,.6,.8), y * 1.6), band * .55);
        float band2 = smoothstep(.62, .66, cl) * smoothstep(.0, .2, y) * smoothstep(.75, .35, y); c = mix(c, vec3(1., .95, .88), band2 * .4);
        // sun
        vec3 sd = normalize(vec3(.55, .22, -.8)); float sdot = max(dot(vP, sd), 0.);
        c += vec3(1., .78, .45) * pow(sdot, 90.) * 1.6 + vec3(1., .6, .4) * pow(sdot, 6.) * .35;
        // the Corruption: glitching magenta/cyan rifts tearing the horizon
        float rift = step(.86, h(vec2(floor(az * 9.), floor(uTime * 2.)))) * smoothstep(.06, .0, abs(y - .08 - h(vec2(floor(az * 9.), 3.)) * .22));
        c = mix(c, mix(vec3(1., .2, .8), vec3(.2, 1., .95), step(.5, h(vec2(floor(az * 9.), 7.)))), rift * .55);
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat); sky.renderOrder = -10; sky.frustumCulled = false; sky.userData.sky = true; root.add(sky); root.userData.sky = sky;

  // ---- ground slab (painterly top, strata cliff front)
  const top = paintTexture(512, 256, '#4f9a4a', { n: 900, w: 7, l: 46, cols: ['#6fb85a', '#3f8040', '#8ac968', '#356f3c', '#a6d77a'] }); top.repeat.set(14, 4);
  const cliff = paintTexture(256, 128, '#6b5136', { n: 300, w: 6, l: 40, cols: ['#8a6a46', '#4a3622', '#a88458', '#5c4630'] }); cliff.repeat.set(10, 1);
  const gtop = toonMaterial({ color: 0xffffff, map: top, rim: 0xffe2a8, rimK: 0.25 }), gside = toonMaterial({ color: 0xffffff, map: cliff, rim: 0xffd29a, rimK: 0.2 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(L + 40, 6, 30), [gside, gside, gtop, gside, gside, gside]);
  slab.position.set(L / 2, -3, -9); slab.receiveShadow = true; root.add(slab);
  // dirt path along the lane + paving stones
  const path = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.7), toonMaterial({ color: 0xb89a6c, rim: 0xffe2a8, rimK: 0.2 })); path.rotation.x = -Math.PI / 2; path.position.set(L / 2, 0.015, 0.1); path.receiveShadow = true; root.add(path);
  const stoneM = toonMaterial({ color: 0x9a948a, rim: 0xffe2a8, rimK: 0.3 });
  inst(box1, stoneM, Array.from({ length: 20 }, (_, i) => ({ p: [2 + i * 3.1 + rand(-0.4, 0.4), 0.03, rand(-0.4, 0.5)], s: [rand(0.7, 1.4), 0.05, rand(0.4, 0.8)], r: [0, rand(-0.2, 0.2), 0] })));
  // rune circle in the middle of the arena (training pad)
  const padTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); g.translate(128, 128); g.strokeStyle = 'rgba(255,214,150,0.9)'; g.lineWidth = 4; for (const r of [118, 96]) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); } g.lineWidth = 3; for (let i = 0; i < 12; i++) { g.save(); g.rotate(i * Math.PI / 6); g.strokeRect(-6, -110, 12, 14); g.beginPath(); g.moveTo(0, -80); g.lineTo(0, -40); g.stroke(); g.restore(); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.2), new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -1 })); pad.rotation.x = -Math.PI / 2; pad.position.set(L / 2, 0.04, 0.2); root.add(pad);

  // ---- layered hills (atmospheric perspective: colour fades towards the haze)
  const hillCols = [0x3c7a52, 0x4f7f68, 0x6a86a0, 0x8d94b8];
  [[-16, 9, 0], [-30, 15, 1], [-50, 24, 2], [-80, 34, 3]].forEach(([z, hgt, k]) => {
    const pts = []; const n = 40, W = L + 140;
    pts.push(new THREE.Vector2(-70, -12));
    for (let i = 0; i <= n; i++) { const x = -70 + (W * i) / n; pts.push(new THREE.Vector2(x, hgt * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(i * 0.55 + k * 2.1) * Math.cos(i * 0.23 + k)) + 0.2 * hash(i, k)))); }
    pts.push(new THREE.Vector2(-70 + W, -12));
    const shape = new THREE.Shape(pts);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), toonMaterial({ color: hillCols[k], rim: 0xffe2c0, rimK: 0.1 }));
    m.position.set(0, 0, z); root.add(m);
  });

  // ---- ruins: gate arches, broken columns, scattered rocks
  const ruinM = toonMaterial({ color: 0xa59f94, rim: 0xffe2a8, rimK: 0.35 }), ruinDark = toonMaterial({ color: 0x7c766d, rim: 0xffe2a8, rimK: 0.3 });
  const arch = (x, z, hgt = 7, w = 5) => {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(cyl1, ruinM); p.scale.set(0.7, hgt, 0.7); p.position.set(s * w / 2, hgt / 2, 0); p.castShadow = true; g.add(p); const cap = new THREE.Mesh(box1, ruinDark); cap.scale.set(1.3, 0.35, 1.3); cap.position.set(s * w / 2, hgt + 0.15, 0); g.add(cap); const base = new THREE.Mesh(box1, ruinDark); base.scale.set(1.4, 0.5, 1.4); base.position.set(s * w / 2, 0.25, 0); g.add(base); }
    const lintel = new THREE.Mesh(box1, ruinM); lintel.scale.set(w + 1.4, 0.9, 1.2); lintel.position.set(0, hgt + 0.7, 0); lintel.castShadow = true; g.add(lintel);
    root.add(g); return g;
  };
  arch(4, -7, 8, 6); arch(60, -8, 7, 5.5);
  const col = (x, z, hgt, tilt = 0) => { const c = new THREE.Mesh(cyl1, ruinM); c.scale.set(0.55, hgt, 0.55); c.position.set(x, hgt / 2 - 0.2, z); c.rotation.z = tilt; c.castShadow = true; root.add(c); const b = new THREE.Mesh(box1, ruinDark); b.scale.set(1.1, 0.4, 1.1); b.position.set(x, 0.1, z); root.add(b); };
  col(14, -6, 5, 0.04); col(18, -9, 3.2, -0.05); col(47, -6.5, 4.4, 0.03); col(52, -10, 2.6, 0.08); col(32, -13, 6.4);
  for (const [mat, mod] of [[ruinM, 1], [ruinDark, 0]]) inst(ico1, mat, Array.from({ length: 26 }, (_, i) => ({ i, sz: rand(0.3, 1.1) })).filter((o) => (o.i % 3 ? 1 : 0) === mod).map((o) => ({ p: [rand(-4, L + 4), o.sz * 0.3, rand(-12, -3)], s: [o.sz * 1.3, o.sz, o.sz], r: [rand(3), rand(3), rand(3)] })), true);

  // ---- stylized trees (instanced trunks + canopy blobs)
  const trunkM = toonMaterial({ color: 0x6a4b33, rim: 0xffe2a8, rimK: 0.2 }), leafM = toonMaterial({ color: 0x4f9a55, rim: 0xe9ffb0, rimK: 0.45 }), leafM2 = toonMaterial({ color: 0x6fb85a, rim: 0xf0ffb8, rimK: 0.45 });
  const trunks = [], canopyA = [], canopyB = [];
  for (let i = 0; i < 22; i++) {
    const x = -2 + i * 3.1 + rand(-1, 1), z = -rand(8, 20), hgt = rand(3.5, 7);
    trunks.push({ p: [x, hgt / 2, z], s: [0.28, hgt, 0.28] });
    for (let k = 0; k < 3; k++) { const sc = rand(1.4, 2.4) * (1 - k * 0.15); (k % 2 ? canopyA : canopyB).push({ p: [x + rand(-0.8, 0.8), hgt + k * 0.9 - 0.2, z + rand(-0.6, 0.6)], s: [sc, sc * 0.85, sc] }); }
  }
  inst(cyl1, trunkM, trunks, true); inst(ico2, leafM, canopyA, true); inst(ico2, leafM2, canopyB, true);

  // ---- grass tufts (instanced, sway when impacts ripple past)
  const tuftGeo = new THREE.ConeGeometry(0.1, 0.55, 4); tuftGeo.translate(0, 0.27, 0);
  const tn = Math.round(520 * (Q.props ?? 1));
  tufts = { mesh: new THREE.InstancedMesh(tuftGeo, toonMaterial({ color: 0x6fc15a, rim: 0xf4ffbc, rimK: 0.5 }), tn), base: [] };
  for (let i = 0; i < tn; i++) { const x = rand(-2, L + 2), z = rand(-9, 2.6); const s = rand(0.7, 1.7); tufts.base.push({ x, z, s, r: rand(6) }); dummyO.position.set(x, 0, z); dummyO.scale.set(s, s, s); dummyO.rotation.set(0, tufts.base[i].r, 0); dummyO.updateMatrix(); tufts.mesh.setMatrixAt(i, dummyO.matrix); }
  tufts.mesh.frustumCulled = false; root.add(tufts.mesh);
  // flowers
  const flowerMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  inst(sph1, flowerMat, Array.from({ length: 90 }, (_, i) => ({ p: [rand(0, L), 0.4, rand(-8, 2.4)], s: [0.06, 0.06, 0.06], c: new THREE.Color([0xffd166, 0xff8fb8, 0xcfe9ff][i % 3]).multiplyScalar(1.4) })));

  // ---- Corruption crystals: magenta/cyan glitching clusters with floating code shards
  const crysMat = [0xff2fb4, 0x35f0e0].map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.7), toneMapped: false }));
  const cl = [[], []];
  const cluster = (x, z, n = 5, sc = 1) => {
    for (let i = 0; i < n; i++) {
      const hgt = rand(1.2, 3.4) * sc, w = rand(0.25, 0.5) * sc, ci = i % 2;
      cl[ci].push({ bx: x + rand(-1, 1) * sc, by: hgt * 0.85, bz: z + rand(-0.6, 0.6), sx: w, sy: hgt, sz: rand(0.25, 0.5) * sc, rx: rand(-0.25, 0.25), ry: rand(3), rz: rand(-0.3, 0.3), ph: rand(10), i: i + x * 3 });
    }
    const d = new THREE.Mesh(ico1, ruinDark); d.scale.set(1.4 * sc, 0.5 * sc, 1.2 * sc); d.position.set(x, 0.2, z); root.add(d);
  };
  cluster(9, -4.2, 4, 0.9); cluster(23, -11, 6, 1.5); cluster(41, -5, 4, 0.8); cluster(56, -12, 7, 1.8); cluster(-1, 1.5, 3, 0.7); cluster(65, 1.4, 3, 0.7); cluster(31, -17, 8, 2.2);
  crystals = cl.map((list, k) => { const m = new THREE.InstancedMesh(oct1, crysMat[k], list.length); m.frustumCulled = false; root.add(m); return { mesh: m, list }; });
  const sh = [[], []];
  for (let i = 0; i < 26; i++) { const s0 = rand(0.08, 0.22); sh[i % 2].push({ x: rand(2, L - 2), y: rand(1.5, 9), z: rand(-12, -2), ph: rand(10), sp: rand(0.3, 0.9), sx: s0, sy: s0 * rand(0.5, 1.6), sz: s0 * 0.5, r: rand(6) }); }
  shards = sh.map((list, k) => { const m = new THREE.InstancedMesh(box1, crysMat[k], list.length); m.frustumCulled = false; root.add(m); return { mesh: m, list }; });

  // wall hints at the arena ends
  for (const x of [0, L]) { const w = new THREE.Mesh(box1, ruinDark); w.scale.set(1.2, 2.2, 3); w.position.set(x, 1.1, -1); w.castShadow = true; root.add(w); }
}
const box1 = new THREE.BoxGeometry(1, 1, 1), cyl1 = new THREE.CylinderGeometry(1, 1, 1, 10), ico1 = new THREE.IcosahedronGeometry(1, 0), ico2 = new THREE.IcosahedronGeometry(1, 1), sph1 = new THREE.SphereGeometry(1, 6, 5), oct1 = new THREE.OctahedronGeometry(1);

export function setArenaShown(v) { if (root) root.visible = v; } // used by the shader warm-up
export const arenaShown = () => !!root?.visible;

// ---------------------------------------------------------------- enter / leave
export function enterArena() {
  buildArena();
  saved = { fog: scene.fog.color.getHex(), near: scene.fog.near, far: scene.fog.far, sun: sun.color.getHex(), sunI: sun.intensity, hs: hemi.color.getHex(), hg: hemi.groundColor.getHex(), hi: hemi.intensity };
  setLevelVisible(false); root.visible = true; terrain.active = ground;
  scene.fog.color.setHex(0xd9a68a); scene.fog.near = 38; scene.fog.far = 120;
  sun.color.setHex(0xffd6a8); sun.intensity = 2.5; hemi.color.setHex(0xb7b8ff); hemi.groundColor.setHex(0x4a3a30); hemi.intensity = 1.0;
}
export function leaveArena() {
  if (!root) return;
  root.visible = false; terrain.active = null; setLevelVisible(true);
  if (saved) { scene.fog.color.setHex(saved.fog); scene.fog.near = saved.near; scene.fog.far = saved.far; sun.color.setHex(saved.sun); sun.intensity = saved.sunI; hemi.color.setHex(saved.hs); hemi.groundColor.setHex(saved.hg); hemi.intensity = saved.hi; }
}

const _c = new THREE.Color();
export function updateArena(dt, camX, playerX, time) {
  if (!root || !root.visible) return;
  for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > ripples[i].dur) ripples.splice(i, 1); }
  skyMat.uniforms.uTime.value = time; root.userData.sky.position.set(camX, 0, 0);
  sun.position.set(playerX - 14, 26, 18); sun.target.position.set(playerX, 0, 0);
  // glitching crystals: hold, then snap-jitter for a few frames (instanced: one matrix write per crystal)
  const gl = Math.floor(time * 3), gphase = (time * 3) % 1;
  for (const g of crystals) {
    g.list.forEach((u, i) => {
      const glitch = hash(gl, u.i) > 0.93 && gphase < 0.35, hide = glitch && hash(gl, u.i + 9) > 0.7;
      dummyO.position.set(u.bx + (glitch ? (hash(gl, u.i + 5) - 0.5) * 0.5 : 0), u.by + Math.sin(time * 1.3 + u.ph) * 0.06, u.bz);
      const k = hide ? 0.0001 : 1;
      dummyO.scale.set(u.sx * (glitch ? 1.5 : 1) * k, u.sy * (1 + Math.sin(time * 2 + u.ph) * 0.03) * k, u.sz * k); dummyO.rotation.set(u.rx, u.ry, u.rz); dummyO.updateMatrix(); g.mesh.setMatrixAt(i, dummyO.matrix);
    });
    g.mesh.instanceMatrix.needsUpdate = true;
  }
  for (const g of shards) {
    g.list.forEach((u, i) => { u.r += dt * 1.4; dummyO.position.set(u.x + Math.sin(time * u.sp + u.ph) * 0.6, u.y + Math.sin(time * u.sp * 1.7 + u.ph) * 0.4, u.z); dummyO.scale.set(u.sx, u.sy, u.sz); dummyO.rotation.set(u.r * 0.6, u.r, 0); dummyO.updateMatrix(); g.mesh.setMatrixAt(i, dummyO.matrix); });
    g.mesh.instanceMatrix.needsUpdate = true;
  }
  // tufts bend away from passing impact ripples
  if (ripples.length) {
    const t = tufts; let any = false;
    for (let i = 0; i < t.base.length; i++) {
      const b = t.base[i]; if (Math.abs(b.x - camX) > 30) continue;
      let k = 0;
      for (const r of ripples) { const d = Math.abs(b.x - r.x), w = Math.abs(d - r.t * r.speed); if (w < 2.4) k += (1 - w / 2.4) * (1 - r.t / r.dur) * r.amp * Math.sign(b.x - r.x); }
      dummyO.position.set(b.x, 0, b.z); dummyO.scale.set(b.s, b.s * (1 - Math.min(0.4, Math.abs(k) * 0.12)), b.s); dummyO.rotation.set(0, b.r, clamp(-k * 0.35, -0.9, 0.9)); dummyO.updateMatrix(); t.mesh.setMatrixAt(i, dummyO.matrix); any = true;
    }
    if (any) { t.mesh.instanceMatrix.needsUpdate = true; t.dirty = true; }
  } else if (tufts.dirty) { tufts.dirty = false; for (let i = 0; i < tufts.base.length; i++) { const b = tufts.base[i]; dummyO.position.set(b.x, 0, b.z); dummyO.scale.set(b.s, b.s, b.s); dummyO.rotation.set(0, b.r, 0); dummyO.updateMatrix(); tufts.mesh.setMatrixAt(i, dummyO.matrix); } tufts.mesh.instanceMatrix.needsUpdate = true; }
}
