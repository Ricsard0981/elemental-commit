import * as THREE from 'three';
import { scene, sun, hemi, Q } from './engine.js';
import { rand, clamp, hex, lerp } from './util.js';

// The level IS a GitHub contribution graph: every bar is a day, taller = more commits.
export const L = 268; // level length (columns)
export const GH = [0x161b22, 0x0e4429, 0x006d32, 0x26a641, 0x39d353];
const laneH = new Array(L + 1).fill(0);

function flat(a, b, h) { for (let i = a; i < b; i++) laneH[i] = h; }
function ramp(a, b, h0, h1) { for (let i = a; i < b; i++) laneH[i] = Math.round(lerp(h0, h1, (i - a) / (b - a - 1)) * 2) / 2; }
function pit(a, b) { for (let i = a; i < b; i++) laneH[i] = null; }
// ---- layout ----
flat(0, 18, 0); ramp(18, 24, 0.5, 1); flat(24, 34, 1); ramp(34, 37, 0.5, 0); flat(37, 48, 0);
pit(48, 55); flat(55, 70, 0);
flat(70, 100, 0); flat(82, 87, 1);                // arena 1
ramp(100, 118, 0.5, 2); flat(118, 135, 2); ramp(135, 140, 1.5, 0); flat(140, 143, 0);
pit(143, 149); flat(149, 155, 0);
flat(155, 195, 0); flat(155, 160, 1); flat(190, 195, 1); flat(172, 178, 0.5); // arena 2
for (let i = 195; i < 215; i++) laneH[i] = Math.round((0.7 + Math.sin((i - 195) * 0.45) * 0.8 + 0.8) * 2) / 2;
flat(215, L, 0);                                  // boss arena

export const platforms = [ // one-way floating "commit" slabs {x (center), y (top), w}
  { x: 43, y: 3.4, w: 4 }, { x: 51.5, y: 1.6, w: 2.6 }, { x: 94, y: 3.6, w: 3.2 }, { x: 76, y: 3.4, w: 3.2 },
  { x: 108, y: 4.0, w: 3 }, { x: 124, y: 4.4, w: 3.6 }, { x: 130, y: 6.4, w: 3 }, { x: 146, y: 2.0, w: 2.4 },
  { x: 165, y: 3.5, w: 3.4 }, { x: 185, y: 3.5, w: 3.4 }, { x: 175, y: 5.8, w: 3.4 },
  { x: 204, y: 4.6, w: 2.8 }, { x: 206.5, y: 8.0, w: 2.6 }, { x: 228, y: 3.6, w: 3.4 }, { x: 250, y: 3.6, w: 3.4 }, { x: 239, y: 6.2, w: 3 },
];
export const checkpoints = [
  { x: 40, name: 'a41f9c2' }, { x: 120, name: '7be03d1' }, { x: 199, name: 'c5d8a40' },
];
export const arenas = [
  { id: 'A', x0: 70, x1: 100, trigger: 74, waves: [[['bug', 80], ['bug', 92], ['bug', 96]], [['bug', 76], ['pointer', 90, 5], ['bug', 98]], [['brute', 90], ['pointer', 78, 5]]] },
  { id: 'B', x0: 155, x1: 195, trigger: 160, waves: [[['brute', 185], ['bug', 168], ['bug', 180]], [['pointer', 166, 5], ['pointer', 186, 5], ['bug', 175], ['bug', 176], ['bug', 178]], [['brute', 164], ['brute', 188], ['pointer', 176, 6]]] },
];
arenas.push({ id: 'C', x0: 218, x1: 266, trigger: 226, boss: true, waves: [] });
export const roamers = [
  ['bug', 26], ['bug', 31], ['bug', 38], ['bug', 62], ['bug', 65], ['pointer', 60, 4.5],
  ['bug', 106], ['pointer', 112, 6], ['bug', 122], ['bug', 127], ['pointer', 132, 8], ['bug', 138],
  ['bug', 152], ['bug', 198], ['pointer', 210, 6], ['bug', 208],
];
export const commitTrail = [];
(function () {
  const arc = (x0, x1, y, h, n) => { for (let i = 0; i < n; i++) { const t = i / (n - 1); commitTrail.push([lerp(x0, x1, t), y + Math.sin(t * Math.PI) * h]); } };
  arc(8, 16, 1.2, 1.5, 5); arc(21, 33, 2.4, 1.5, 6); arc(40, 46, 4.4, 0.8, 5); arc(48, 55, 2.2, 2.4, 7);
  arc(102, 116, 3, 2.5, 7); arc(122, 131, 7.4, 1.6, 6); arc(143, 149, 3, 2.5, 6); arc(196, 208, 3, 2, 6);
  commitTrail.push([204, 5.8], [206.5, 9.2], [207.6, 9.2], [205.4, 9.2]);
  arc(225, 232, 5, 1, 4); arc(236, 242, 7.6, 1, 4);
})();
export const hints = [
  { x: 2, text: '<b>A / D</b> move &nbsp; <b>Space</b> jump (twice!) &nbsp; <b>Shift</b> dash', touch: 'Drag anywhere on the <b>left</b> to move · <b>Jump</b> twice for a double jump · flick the stick up to jump too' },
  { x: 14, text: '<b>J</b> / <b>Left click</b> — main attack. Chain 3 hits for a finisher', touch: 'Tap <b>Attack</b> in rhythm — the 3rd hit is a finisher. Slide your thumb to <b>Jump</b> without lifting' },
  { x: 25, text: '<b>K</b> / <b>Right click</b> — ranged attack (aim with the mouse) · <b>Q</b> / <b>E</b> — specials', touch: 'Hold <b>Ranged</b> to fire (auto-aims) — <i>drag</i> from it to aim manually · the two outer buttons are your specials' },
  { x: 44, text: 'Hold <b>L</b> to defend. Tap it <i>just before</i> a hit lands for a <b>PERFECT PARRY</b>', touch: 'Hold <b>Defend</b> to block. Tap it <i>just before</i> a hit lands for a <b>PERFECT PARRY</b>' },
  { x: 56, text: 'Press <b>Tab</b> to open your skill tree and spend skill points', touch: 'Tap <b>Skills</b> (top-left) to spend skill points' },
];
export const BOSS_X0 = 218, BOSS_X1 = 264;

// ----------------------------------------------------------------- queries
export function laneTop(i) { return i < 0 || i >= L ? 0 : laneH[i]; }
export function groundAt(x) { // top of the playable lane (null → pit)
  const i = Math.floor(x);
  if (i < 0 || i >= L) return 0;
  const h = laneH[i];
  return h === null ? -60 : h;
}
export const dyn = []; // dynamic solids {x0,x1,y0,y1,owner}
export const gates = [];

export function solidsNear(x0, x1, out) {
  out.length = 0;
  for (let i = Math.max(0, Math.floor(x0)); i <= Math.min(L - 1, Math.floor(x1)); i++) {
    const h = laneH[i];
    if (h !== null) out.push({ x0: i, x1: i + 1, y0: -50, y1: h });
  }
  for (const d of dyn) if (d.x1 > x0 && d.x0 < x1) out.push(d);
  for (const g of gates) if (g.closed && g.x + 0.35 > x0 && g.x - 0.35 < x1) out.push({ x0: g.x - 0.35, x1: g.x + 0.35, y0: -50, y1: 60 });
  out.push({ x0: -2, x1: 0, y0: -50, y1: 60 }, { x0: L, x1: L + 2, y0: -50, y1: 60 });
  return out;
}
export function supportAt(x, y, w) { // is there a floor within reach below y? used by AI ledge checks
  return groundAt(x) > -50;
}

// ----------------------------------------------------------------- visuals
const dummy = new THREE.Object3D();
// fade bars to black below the lane so the playfield pops
function darkenBelow(mat, lo = -8, hi = 0.8, floor = 0.1) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying float vWY;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\n vWY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying float vWY;\nvoid main() {').replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.rgb *= mix(${floor.toFixed(2)}, 1.0, smoothstep(${lo.toFixed(1)}, ${hi.toFixed(1)}, vWY));`);
  };
}
const col = new THREE.Color();
const bars = { rows: [], lane: null, caps: null };
export const ripples = [];
export function ripple(x, amp = 1.2, color = 0x39d353, speed = 14, dur = 1.0) { const c = new THREE.Color(color); ripples.push({ x, t: 0, amp, color: c, hot: c.clone().multiplyScalar(2.5), speed, dur }); if (ripples.length > 14) ripples.shift(); }

let skyMat, panels = [], nodes = [], graphGroup, sparks;
export const worldState = { tint: new THREE.Color(0x39d353) };

function hash(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
}

export function buildWorld() {
  // ---- sky dome
  skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x03060c) }, mid: { value: new THREE.Color(0x0b1a2a) }, hor: { value: new THREE.Color(0x0e4429) }, tint: { value: new THREE.Color(0x39d353) } },
    vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 top,mid,hor,tint; varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      void main(){ float y=vP.y; vec3 c=mix(hor, mid, smoothstep(-.05,.35,y)); c=mix(c, top, smoothstep(.3,.95,y));
        c+=tint*.18*exp(-abs(y+.02)*7.);
        vec2 g=floor(vec2(atan(vP.x,vP.z)*60., y*90.)); float s=step(.9965,h(g))*smoothstep(.1,.5,y); c+=s*vec3(.7,1.,.8);
        gl_FragColor=vec4(c,1.); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false; sky.userData.sky = true;
  scene.add(sky);
  worldState.sky = sky;

  // ---- lane (playable contribution bars)
  const lanes = []; for (let i = 0; i < L; i++) if (laneH[i] !== null) lanes.push(i);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const laneMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1 }); darkenBelow(laneMat, -4.2, 0.1, 0.05);
  bars.lane = new THREE.InstancedMesh(geo, laneMat, lanes.length);
  bars.lane.castShadow = bars.lane.receiveShadow = true;
  bars.caps = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), lanes.length);
  bars.laneIdx = lanes;
  bars.capBase = [];
  lanes.forEach((i, k) => {
    const h = laneH[i];
    dummy.position.set(i + 0.5, (h - 40) / 2, 0); dummy.scale.set(0.94, h + 40, 0.94); dummy.updateMatrix();
    bars.lane.setMatrixAt(k, dummy.matrix);
    const lvl = 2 + (hash(i, 7) > 0.55 ? 1 : 0) + (hash(i, 9) > 0.9 ? 1 : 0);
    col.setHex(GH[lvl]); bars.lane.setColorAt(k, col);
    dummy.position.set(i + 0.5, h + 0.02, 0); dummy.scale.set(0.9, 0.07, 0.9); dummy.updateMatrix();
    bars.caps.setMatrixAt(k, dummy.matrix);
    const c = new THREE.Color(GH[Math.min(4, lvl + 1)]).multiplyScalar(1.15); bars.capBase.push(c);
    bars.caps.setColorAt(k, c);
  });
  scene.add(bars.lane, bars.caps);

  // ---- background rows (animated skyline), near rows full-res, far rows 2-wide
  for (let r = 1; r <= 28; r++) {
    const far = r > 11, step = far ? 2 : 1;
    const items = [];
    for (let i = -34; i < L + 40; i += step) {
      const n = vnoise(i * 0.09 + r * 3.1, r * 0.35) * 0.65 + vnoise(i * 0.31, r * 1.7) * 0.35;
      let h = Math.pow(n, 1.8) * (r < 3 ? 2.4 : 2.5 + r * 0.32);
      if (r < 3) h = Math.min(h, 0.3 + n * 1.5);
      // keep a clear valley right behind the lane near row 1
      h = Math.max(0.15, Math.round(h * 2) / 2);
      items.push({ i, h, lvl: clamp(Math.floor(n * 5.4), 0, 4), ph: Math.random() * 6 });
    }
    const rmat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05 }); darkenBelow(rmat, -6, 1.5, 0.15);
    const m = new THREE.InstancedMesh(geo, rmat, items.length);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.receiveShadow = r < 6; m.castShadow = false; m.frustumCulled = false;
    items.forEach((it, k) => {
      dummy.position.set(it.i + step * 0.5, (it.h - 40) / 2, -r); dummy.scale.set(step, it.h + 40, 1); dummy.updateMatrix();
      m.setMatrixAt(k, dummy.matrix);
      col.setHex(GH[it.lvl]); if (it.lvl === 0) col.multiplyScalar(1.4); col.multiplyScalar(r < 5 ? 0.5 : r < 12 ? 0.38 : 0.28); m.setColorAt(k, col);
    });
    scene.add(m);
    bars.rows.push({ m, items, r, step });
  }

  // ---- floating commit slabs
  for (const p of platforms) {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(p.w, 0.4, 0.94), new THREE.MeshStandardMaterial({ color: 0x1f6f3a, roughness: 0.4, metalness: 0.2, emissive: 0x0e4429, emissiveIntensity: 0.6 }));
    slab.castShadow = slab.receiveShadow = true; slab.position.y = -0.2;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(p.w, 0.06, 0.96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x39d353).multiplyScalar(1.6), toneMapped: false }));
    rim.position.y = 0.01;
    g.add(slab, rim); g.position.set(p.x, p.y, 0); g.userData.baseY = p.y; g.userData.ph = rand(6);
    scene.add(g); p.mesh = g;
  }

  buildBackdrop();
  buildCheckpoints();
  buildGates();

  // lighting tone
  hemi.color.set(0x9ec8ff); hemi.groundColor.set(0x0d3b25);
}

// ---- git graph + code panels + drifting squares
function codeTexture(lines, w = 512, h = 384, accent = '#39d353') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(13,17,23,0.9)'; g.fillRect(0, 0, w, h);
  g.strokeStyle = accent; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
  g.fillStyle = '#161b22'; g.fillRect(0, 0, w, 34);
  ['#ff5f56', '#ffbd2e', '#27c93f'].forEach((cc, i) => { g.fillStyle = cc; g.beginPath(); g.arc(20 + i * 22, 17, 6, 0, 7); g.fill(); });
  g.font = '19px ui-monospace, Menlo, Consolas, monospace';
  lines.forEach((ln, i) => {
    let x = 18; const y = 66 + i * 26;
    ln.forEach(([t, cc]) => { g.fillStyle = cc; g.fillText(t, x, y); x += g.measureText(t).width; });
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
const K = '#ff7b72', F = '#d2a8ff', S = '#a5d6ff', N = '#79c0ff', C = '#8b949e', T = '#c9d1d9', GRN = '#7ee787', RED = '#ffa198';
const SNIPPETS = [
  [[['function ', K], ['fixBug', F], ['(issue) {', T]], [['  if ', K], ['(!issue.reproducible)', T]], [['    return ', K], ['"works on my machine"', S]], [['  ', T], ['// TODO: add tests', C]], [['  ', T], ['ship', F], ['(issue.patch);', T]], [['}', T]]],
  [[['$ ', C], ['git commit -m ', T], ['"fix: everything"', S]], [['[main ', GRN], ['a41f9c2', N], [']', GRN]], [[' 3 files changed, ', T], ['42 insertions(+)', GRN]], [['                  ', T], ['9 deletions(-)', RED]], [['$ ', C], ['git push --force', T]], [['! [remote rejected]', RED]]],
  [[['<<<<<<< HEAD', RED]], [['const power = ', T], ['"fire"', S], [';', T]], [['=======', K]], [['const power = ', T], ['"water"', S], [';', T]], [['>>>>>>> feature/elements', GRN]], [['// resolve manually', C]]],
  [[['class ', K], ['Hero ', F], ['extends ', K], ['Element {', T]], [['  cast', F], ['(spell) {', T]], [['    this.mana -= spell.cost;', T]], [['    return ', K], ['spell.fire(this);', T]], [['  }', T]], [['}', T]]],
  [[['- return null;', RED]], [['+ return new Hero();', GRN]], [['  ', T]], [['- if (hp == 0) crash();', RED]], [['+ if (hp <= 0) respawn();', GRN]], [['  ', T]]],
];
function buildBackdrop() {
  graphGroup = new THREE.Group(); scene.add(graphGroup);
  // main branch + two side branches (a living git graph in the sky)
  const mainY = 17, z = -34;
  const mk = (pts, color) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 140, 0.16, 6, false), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.3), toneMapped: false, fog: false }));
    graphGroup.add(tube);
  };
  mk([new THREE.Vector3(-30, mainY, z), new THREE.Vector3(L + 40, mainY, z)], 0x39d353);
  for (const [a, b, dy, col2] of [[30, 110, 6, 0xa371f7], [120, 190, -5, 0x58a6ff], [175, 245, 7, 0xa371f7], [60, 150, -7, 0xf0883e]]) {
    mk([new THREE.Vector3(a, mainY, z), new THREE.Vector3(a + 8, mainY + dy * 0.6, z - 1), new THREE.Vector3((a + b) / 2, mainY + dy, z - 2), new THREE.Vector3(b - 8, mainY + dy * 0.6, z - 1), new THREE.Vector3(b, mainY, z)], col2);
    for (let x = a + 12; x < b - 8; x += 14) addNode(x, mainY + dy * (0.8 + Math.sin((x - a) * 0.05) * 0.1), z - 2, col2);
  }
  for (let x = -20; x < L + 30; x += 9) addNode(x, mainY, z, 0x39d353);
  // code windows
  for (let i = 0; i < 16; i++) {
    const tex = codeTexture(SNIPPETS[i % SNIPPETS.length], 512, 300, ['#39d353', '#58a6ff', '#a371f7'][i % 3]);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    m.position.set(10 + i * 17 + rand(-4, 4), rand(8, 22), -rand(18, 30));
    m.rotation.y = rand(-0.25, 0.25);
    m.userData = { baseY: m.position.y, ph: rand(6) };
    scene.add(m); panels.push(m);
  }
  // drifting contribution squares (fireflies)
  const n = 260, pos = new Float32Array(n * 3), seeds = [];
  for (let i = 0; i < n; i++) { pos[i * 3] = rand(-20, L + 20); pos[i * 3 + 1] = rand(0, 26); pos[i * 3 + 2] = rand(-14, 8); seeds.push(rand(6)); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sparks = new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(0x39d353).multiplyScalar(2), size: 0.22, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sparks.userData.seeds = seeds; sparks.frustumCulled = false;
  scene.add(sparks);
}
function addNode(x, y, z, color) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.8), toneMapped: false, fog: false }));
  m.position.set(x, y, z); m.userData = { x, s: 1, hit: false };
  graphGroup.add(m); nodes.push(m);
}

// ---- checkpoints
function textSprite(text, color = '#7ee787', scale = 3) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d'); g.font = 'bold 30px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 12; g.fillText(text, 128, 42);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  s.scale.set(scale, scale / 4, 1); return s;
}
function buildCheckpoints() {
  for (const cp of checkpoints) {
    const g = new THREE.Group(); const gy = groundAt(cp.x);
    g.position.set(cp.x, gy, -1.2);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0x30363d, metalness: 0.6, roughness: 0.3 }));
    pole.position.y = 1.6; pole.castShadow = true;
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8b949e), toneMapped: false }));
    orb.position.y = 3.5;
    const lab = textSprite('commit ' + cp.name, '#8b949e'); lab.position.y = 4.4;
    g.add(pole, orb, lab); scene.add(g); cp.group = g; cp.orb = orb; cp.lab = lab; cp.active = false;
  }
}
export function activateCheckpoint(cp) {
  cp.active = true;
  cp.orb.material.color.set(0x39d353).multiplyScalar(2.2);
  cp.lab.material.map.dispose();
  const s = textSprite('✔ commit ' + cp.name, '#7ee787'); cp.group.remove(cp.lab); s.position.y = 4.4; cp.group.add(s); cp.lab = s;
}

// ---- review gates (arena locks)
function gateTexture(ok) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const g = c.getContext('2d'); const col2 = ok ? '#39d353' : '#f85149';
  g.fillStyle = ok ? 'rgba(57,211,83,0.18)' : 'rgba(248,81,73,0.2)'; g.fillRect(0, 0, 128, 512);
  g.strokeStyle = col2; g.lineWidth = 5; g.strokeRect(3, 3, 122, 506);
  g.globalAlpha = 0.5; g.lineWidth = 4;
  for (let y = -128; y < 512; y += 40) { g.beginPath(); g.moveTo(0, y + 128); g.lineTo(128, y); g.stroke(); }
  g.globalAlpha = 1; g.fillStyle = col2; g.font = 'bold 26px ui-monospace, monospace'; g.save(); g.translate(78, 256); g.rotate(-Math.PI / 2); g.textAlign = 'center';
  g.fillText(ok ? 'APPROVED ✔' : 'REVIEW REQUIRED', 0, 0); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function buildGates() {
  const redTex = gateTexture(false), greenTex = gateTexture(true);
  for (const a of arenas) {
    a.gates = [a.x0, a.x1].map((x) => {
      const gy = groundAt(x) + 6.5;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 14), new THREE.MeshBasicMaterial({ map: redTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      mesh.position.set(x, gy, 0); mesh.visible = false; scene.add(mesh);
      const gate = { x, mesh, closed: false, redTex, greenTex, k: 0 };
      gates.push(gate); return gate;
    });
  }
}
export function setGate(gate, closed, ok = false) {
  gate.closed = closed;
  gate.mesh.material.map = ok ? gate.greenTex : gate.redTex; gate.mesh.material.needsUpdate = true;
  gate.mesh.visible = true; gate.target = closed ? 1 : 0;
}

// ----------------------------------------------------------------- per-frame
let animT = 0;
export function updateWorld(dt, camX, playerX, time) {
  animT += dt;
  const c0 = camX - 34, c1 = camX + 34;
  // ripples
  for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > ripples[i].dur) ripples.splice(i, 1); }
  // lane caps colour reaction + bars wobble
  const caps = bars.caps; let capsDirty = false;
  const lo = Math.max(0, Math.floor(c0)), hi = Math.min(L, Math.ceil(c1));
  bars.laneIdx.forEach((colIdx, k) => {
    if (colIdx < lo || colIdx > hi) return;
    let boost = 0; col.copy(bars.capBase[k]);
    for (const r of ripples) {
      const d = Math.abs(colIdx + 0.5 - r.x), w = Math.abs(d - r.t * r.speed);
      if (w < 2.2) { const a = (1 - w / 2.2) * (1 - r.t / r.dur) * r.amp; boost += a; col.lerp(r.hot, Math.min(1, a * 0.8)); }
    }
    caps.setColorAt(k, col); capsDirty = true;
  });
  if (capsDirty) caps.instanceColor.needsUpdate = true;
  // skyline rows
  for (const row of bars.rows) {
    const { m, items, r, step } = row;
    if (r > Q.rows) continue; // far rows stay static on lower presets
    let any = false;
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      if (it.i < c0 - 6 - r * 0.8 || it.i > c1 + 6 + r * 0.8) continue;
      let h = it.h + Math.sin(animT * 0.7 + it.ph) * 0.14;
      for (const rp of ripples) {
        const dx = it.i - rp.x, d = Math.sqrt(dx * dx + r * r), w = Math.abs(d - rp.t * rp.speed);
        if (w < 3) h += (1 - w / 3) * (1 - rp.t / rp.dur) * rp.amp * (r < 12 ? 1.5 : 3);
      }
      dummy.position.set(it.i + step * 0.5, (h - 40) / 2, -r); dummy.scale.set(step, h + 40, 1); dummy.updateMatrix();
      m.setMatrixAt(k, dummy.matrix); any = true;
    }
    if (any) m.instanceMatrix.needsUpdate = true;
  }
  // platforms bob slightly (visual only; collision uses base y) — keep static for fairness, just glow pulse
  for (const p of platforms) p.mesh.children[1].material.color.setRGB(0.22, 0.83, 0.33).multiplyScalar(1.3 + Math.sin(time * 2 + p.mesh.userData.ph) * 0.2);
  // code panels float
  for (const p of panels) p.position.y = p.userData.baseY + Math.sin(time * 0.5 + p.userData.ph) * 0.5;
  // git nodes pop when the player passes
  for (const n of nodes) {
    if (!n.userData.hit && playerX > n.userData.x) { n.userData.hit = true; n.userData.s = 2.2; }
    n.userData.s = lerp(n.userData.s, n.userData.hit ? 1.25 : 0.8, 1 - Math.exp(-4 * dt));
    n.scale.setScalar(n.userData.s); n.rotation.y += dt;
  }
  // fireflies
  if (sparks) {
    const p = sparks.geometry.attributes.position, s = sparks.userData.seeds;
    for (let i = 0; i < s.length; i++) {
      p.array[i * 3 + 1] += Math.sin(time * 0.6 + s[i]) * 0.4 * dt;
      p.array[i * 3] += Math.cos(time * 0.4 + s[i] * 2) * 0.5 * dt;
    }
    p.needsUpdate = true;
  }
  // gates fade
  for (const g of gates) {
    if (g.target === undefined) continue;
    g.k += (g.target - g.k) * (1 - Math.exp(-7 * dt));
    g.mesh.material.opacity = g.k * (0.75 + Math.sin(time * 9) * 0.12);
    g.mesh.scale.y = 0.3 + g.k * 0.7;
    if (g.k < 0.01 && g.target === 0) g.mesh.visible = false;
  }
  // sky follows camera, sun follows player
  worldState.sky.position.set(camX, 0, 0);
  sun.position.set(playerX - 14, 26, 18); sun.target.position.set(playerX, 0, 0);
}

export function setAtmosphere(tintHex) {
  worldState.tint.setHex(tintHex);
  skyMat.uniforms.tint.value.setHex(tintHex);
  skyMat.uniforms.hor.value.setHex(tintHex).multiplyScalar(0.22).lerp(new THREE.Color(0x0e4429), 0.5);
  scene.fog.color.copy(skyMat.uniforms.hor.value).lerp(skyMat.uniforms.mid.value, 0.55);
}
export { textSprite };
