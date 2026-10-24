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

// ---- Y2K textures: a neon grid floor and spray-paint tags (drawn once on canvases)
function gridTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
  g.fillStyle = '#1c1040'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#251552'; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128); // checker
  g.strokeStyle = 'rgba(25,227,255,.16)'; g.lineWidth = 1; for (let i = 0; i <= 256; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  g.strokeStyle = 'rgba(25,227,255,.9)'; g.lineWidth = 3; for (const i of [0, 128, 256]) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
function strataTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const g = cv.getContext('2d');
  g.fillStyle = '#150b30'; g.fillRect(0, 0, 256, 128);
  [['#ff2e93', 18], ['#19e3ff', 52], ['#c6ff3d', 88]].forEach(([c, y]) => { g.fillStyle = c; g.fillRect(0, y, 256, 5); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const TAG_COLS = [['#ff2e93', '#ffe14d'], ['#19e3ff', '#ff2e93'], ['#c6ff3d', '#7a2cff'], ['#ffe14d', '#ff2e93'], ['#ffffff', '#19e3ff']];
function graffitiTexture(text, seed, neon = false) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const g = cv.getContext('2d');
  const [a, b] = TAG_COLS[seed % TAG_COLS.length];
  g.translate(256, 138); g.rotate(((seed * 37) % 11 - 5) * 0.012);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineCap = 'round';
  const size = text.length > 6 ? 130 : text.length > 4 ? 160 : 200; g.font = `800 ${size}px "Barlow Condensed", Impact, "Arial Narrow", sans-serif`;
  if (neon) {
    g.shadowColor = a; g.shadowBlur = 28; g.strokeStyle = a; g.lineWidth = 10; g.strokeText(text, 0, 0); g.shadowBlur = 0; g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeText(text, 0, 0);
  } else {
    g.strokeStyle = '#0a0b0e'; g.lineWidth = 34; g.strokeText(text, 7, 8);          // hard drop shadow
    g.strokeStyle = b; g.lineWidth = 26; g.strokeText(text, 0, 0);                    // fat outline in the second colour
    g.fillStyle = a; g.fillText(text, 0, 0);                                            // bubble fill
    g.fillStyle = 'rgba(255,255,255,.45)'; g.save(); g.beginPath(); g.rect(-256, -size * 0.55, 512, size * 0.28); g.clip(); g.fillText(text, -3, -4); g.restore(); // gloss streak
    g.strokeStyle = '#0a0b0e'; g.lineWidth = 3; g.strokeText(text, 0, 0);
    g.strokeStyle = a; g.lineWidth = 7; // spray drips
    for (let i = 0; i < 4; i++) { const x = (-1.5 + i) * size * 0.28 + ((seed * 13 + i * 29) % 17) - 8, y0 = size * 0.42, l = 14 + ((seed * 7 + i * 31) % 46); g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + l); g.stroke(); g.fillStyle = a; g.beginPath(); g.arc(x, y0 + l, 5, 0, 7); g.fill(); }
    g.fillStyle = b; g.font = '800 54px "Barlow Condensed", Impact, sans-serif'; g.fillText('✦', -size * 0.55 - 20, -size * 0.4); g.fillText('★', size * 0.55 + 14, size * 0.38);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
let y2k = [];
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
        vec3 top = vec3(.04,.02,.26), mid = vec3(.56,.10,.68), hor = vec3(1.,.46,.42), low = vec3(.12,.05,.26);
        vec3 c = mix(hor, mid, smoothstep(-.02, .32, y)); c = mix(c, top, smoothstep(.25, .85, y)); c = mix(low, c, smoothstep(-.25, 0., y));
        // painterly cloud bands (stepped so they read as brush shapes)
        vec2 cp = vec2(az * 1.8 + uTime * .01, y * 3.2);
        float cl = fbm(cp * 2. + vec2(0., fbm(cp * 3.))); float band = smoothstep(.52, .56, cl) * smoothstep(.0, .2, y) * smoothstep(.75, .35, y);
        c = mix(c, mix(vec3(1.,.5,.8), vec3(.5,.3,.95), y * 1.6), band * .6);
        float band2 = smoothstep(.62, .66, cl) * smoothstep(.0, .2, y) * smoothstep(.75, .35, y); c = mix(c, vec3(1., .78, .95), band2 * .4);
        // retro sun: a striped disc with a pink halo (Y2K), plus a twinkling star field
        vec3 sd = normalize(vec3(.55, .2, -.8)); float ang = acos(clamp(dot(vP, sd), -1., 1.));
        float disc = smoothstep(.215, .205, ang); float sy = (vP.y - sd.y) / .2;
        float slits = mix(step(.38, fract(sy * 5. + 4.)), 1., step(-.15, sy));
        c = mix(c, mix(vec3(1., .22, .62), vec3(1., .92, .3), smoothstep(-.7, .6, sy)), disc * slits);
        c += vec3(1., .35, .75) * pow(max(dot(vP, sd), 0.), 30.) * .55;
        vec2 sp = vec2(az * 46., y * 46.); float sh = h(floor(sp)); c += vec3(step(.986, sh) * smoothstep(.22, .5, y) * (.6 + .4 * sin(uTime * 3. + sh * 40.)));
        // the Corruption: glitching magenta/cyan rifts tearing the horizon
        float rift = step(.86, h(vec2(floor(az * 9.), floor(uTime * 2.)))) * smoothstep(.06, .0, abs(y - .08 - h(vec2(floor(az * 9.), 3.)) * .22));
        c = mix(c, mix(vec3(1., .2, .8), vec3(.2, 1., .95), step(.5, h(vec2(floor(az * 9.), 7.)))), rift * .55);
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat); sky.renderOrder = -10; sky.frustumCulled = false; sky.userData.sky = true; root.add(sky); root.userData.sky = sky;

  // ---- ground slab (painterly top, strata cliff front)
  const top = gridTexture(); top.repeat.set(14, 4);
  const cliff = strataTexture(); cliff.repeat.set(10, 1);
  const gtop = toonMaterial({ color: 0xffffff, map: top, rim: 0x19e3ff, rimK: 0.25 }), gside = toonMaterial({ color: 0xffffff, map: cliff, rim: 0xff2e93, rimK: 0.2 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(L + 40, 6, 30), [gside, gside, gtop, gside, gside, gside]);
  slab.position.set(L / 2, -3, -9); slab.receiveShadow = true; root.add(slab);
  // dirt path along the lane + paving stones
  const path = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.7), toonMaterial({ color: 0x2f2552, rim: 0xff2e93, rimK: 0.3 })); path.rotation.x = -Math.PI / 2; path.position.set(L / 2, 0.015, 0.1); path.receiveShadow = true; root.add(path);
  const stoneM = toonMaterial({ color: 0xc6ff3d, rim: 0xffffff, rimK: 0.3 });
  inst(box1, stoneM, Array.from({ length: 20 }, (_, i) => ({ p: [2 + i * 3.1 + rand(-0.4, 0.4), 0.03, rand(-0.4, 0.5)], s: [rand(0.7, 1.4), 0.05, rand(0.4, 0.8)], r: [0, rand(-0.2, 0.2), 0] })));
  // rune circle in the middle of the arena (training pad)
  const padTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); g.translate(128, 128); g.strokeStyle = 'rgba(25,227,255,0.95)'; g.lineWidth = 4; for (const r of [118, 96]) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); } g.lineWidth = 3; for (let i = 0; i < 12; i++) { g.save(); g.rotate(i * Math.PI / 6); g.strokeRect(-6, -110, 12, 14); g.beginPath(); g.moveTo(0, -80); g.lineTo(0, -40); g.stroke(); g.restore(); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.2), new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -1 })); pad.rotation.x = -Math.PI / 2; pad.position.set(L / 2, 0.04, 0.2); root.add(pad);

  // ---- layered hills (atmospheric perspective: colour fades towards the haze)
  const hillCols = [0x24124f, 0x331a6b, 0x4b2487, 0x7a3aa8]; // a Y2K city skyline in four hazy layers
  [[-16, 9, 0], [-30, 15, 1], [-50, 24, 2], [-80, 34, 3]].forEach(([z, hgt, k]) => {
    const pts = []; const n = 40, W = L + 140;
    pts.push(new THREE.Vector2(-70, -12));
    for (let i = 0; i < n; i++) { const x0 = -70 + (W * i) / n, x1 = -70 + (W * (i + 1)) / n, hh = hgt * (0.3 + 0.7 * hash(i * 3 + 1, k)); pts.push(new THREE.Vector2(x0, hh), new THREE.Vector2(x1, hh)); }
    pts.push(new THREE.Vector2(-70 + W, -12));
    const shape = new THREE.Shape(pts);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), toonMaterial({ color: hillCols[k], rim: 0xff2e93, rimK: 0.22 }));
    m.position.set(0, 0, z); root.add(m);
  });

  // ---- ruins: gate arches, broken columns, scattered rocks
  const ruinM = toonMaterial({ color: 0x9a92c8, rim: 0xff9ad6, rimK: 0.4 }), ruinDark = toonMaterial({ color: 0x5a5486, rim: 0xff9ad6, rimK: 0.3 });
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
  const trunkM = toonMaterial({ color: 0xa8b2d8, rim: 0xffffff, rimK: 0.4 }), leafM = toonMaterial({ color: 0xff4fa5, rim: 0xffd0ec, rimK: 0.5 }), leafM2 = toonMaterial({ color: 0x2ee6ff, rim: 0xd8ffff, rimK: 0.5 });
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
  tufts = { mesh: new THREE.InstancedMesh(tuftGeo, toonMaterial({ color: 0xc6ff3d, rim: 0xfff0ff, rimK: 0.5 }), tn), base: [] };
  for (let i = 0; i < tn; i++) { const x = rand(-2, L + 2), z = rand(-9, 2.6); const s = rand(0.7, 1.7); tufts.base.push({ x, z, s, r: rand(6) }); dummyO.position.set(x, 0, z); dummyO.scale.set(s, s, s); dummyO.rotation.set(0, tufts.base[i].r, 0); dummyO.updateMatrix(); tufts.mesh.setMatrixAt(i, dummyO.matrix); }
  tufts.mesh.frustumCulled = false; root.add(tufts.mesh);
  // flowers
  const flowerMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  inst(sph1, flowerMat, Array.from({ length: 90 }, (_, i) => ({ p: [rand(0, L), 0.4, rand(-8, 2.4)], s: [0.06, 0.06, 0.06], c: new THREE.Color([0xffe14d, 0xff4fa0, 0x35f0e0][i % 3]).multiplyScalar(1.4) })));

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

  // ---- Y2K street: a concrete back wall covered in tags, neon signs, and floating chrome toys
  const wallM = toonMaterial({ color: 0x4a4478, rim: 0xff2e93, rimK: 0.25 });
  const wall = new THREE.Mesh(box1, wallM); wall.scale.set(L + 60, 9, 1); wall.position.set(L / 2, 4.5, -13); wall.receiveShadow = true; root.add(wall);
  const tags = ['COMMIT', 'FIX ME', '404', 'NULL', 'Y2K', 'MERGE', 'BUG', 'SK8', 'PUSH', 'HELLO'];
  const tagMat = (t) => new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, depthWrite: false });
  for (let i = 0; i < 9; i++) { const w = 7 + (i % 3) * 1.6; const pl = new THREE.Mesh(plane1, tagMat(graffitiTexture(tags[i % tags.length], i))); pl.scale.set(w, w * 0.5, 1); pl.position.set(-4 + i * 8.6 + rand(-1, 1), 3.4 + rand(-0.6, 1.2), -12.45); root.add(pl); }
  for (const [txt, x, y] of [['OPEN 24H', 14, 7.4], ['ARCADE', 40, 7.6], ['NO FACES', 60, 7.2]]) { const pl = new THREE.Mesh(plane1, tagMat(graffitiTexture(txt, x, true))); pl.scale.set(6.4, 3.2, 1); pl.position.set(x, y, -12.4); root.add(pl); }
  const chrome = toonMaterial({ color: 0xdbe4ff, rim: 0x19e3ff, rimK: 0.9 }), pinkM = toonMaterial({ color: 0xff2e93, rim: 0xffffff, rimK: 0.5 }), limeM = toonMaterial({ color: 0xc6ff3d, rim: 0xffffff, rimK: 0.5 }), cyM = toonMaterial({ color: 0x19e3ff, rim: 0xffffff, rimK: 0.5 });
  for (let i = 0; i < 16; i++) {
    const kind = i % 4, m = new THREE.Mesh(kind === 0 ? sph2 : kind === 1 ? oct1 : kind === 2 ? torus1 : ico1, [chrome, pinkM, cyM, limeM][kind]);
    const sc = rand(0.7, 1.7); m.scale.set(sc, kind === 1 ? sc * 1.5 : sc, sc); m.position.set(rand(-4, L + 4), rand(8, 14), -rand(22, 36)); m.scale.multiplyScalar(1.6); m.userData = { y: m.position.y, sp: rand(0.2, 0.9) * (i % 2 ? 1 : -1), ph: rand(10) };
    m.castShadow = false; root.add(m); y2k.push(m);
  }
  // wall hints at the arena ends
  for (const x of [0, L]) { const w = new THREE.Mesh(box1, ruinDark); w.scale.set(1.2, 2.2, 3); w.position.set(x, 1.1, -1); w.castShadow = true; root.add(w); }
}
const plane1 = new THREE.PlaneGeometry(1, 1), sph2 = new THREE.SphereGeometry(1, 14, 10), torus1 = new THREE.TorusGeometry(1, 0.3, 8, 18), box1 = new THREE.BoxGeometry(1, 1, 1), cyl1 = new THREE.CylinderGeometry(1, 1, 1, 10), ico1 = new THREE.IcosahedronGeometry(1, 0), ico2 = new THREE.IcosahedronGeometry(1, 1), sph1 = new THREE.SphereGeometry(1, 6, 5), oct1 = new THREE.OctahedronGeometry(1);

export function setArenaShown(v) { if (root) root.visible = v; } // used by the shader warm-up
export const arenaShown = () => !!root?.visible;

// ---------------------------------------------------------------- enter / leave
export function enterArena() {
  buildArena();
  saved = { fog: scene.fog.color.getHex(), near: scene.fog.near, far: scene.fog.far, sun: sun.color.getHex(), sunI: sun.intensity, hs: hemi.color.getHex(), hg: hemi.groundColor.getHex(), hi: hemi.intensity };
  setLevelVisible(false); root.visible = true; terrain.active = ground;
  scene.fog.color.setHex(0x7a2f8f); scene.fog.near = 38; scene.fog.far = 120;
  sun.color.setHex(0xffc0e4); sun.intensity = 2.6; hemi.color.setHex(0xb89cff); hemi.groundColor.setHex(0x3a1a5a); hemi.intensity = 1.05;
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
  for (const m of y2k) { m.rotation.y += dt * m.userData.sp; m.rotation.x += dt * m.userData.sp * 0.5; m.position.y = m.userData.y + Math.sin(time * 0.8 + m.userData.ph) * 0.5; }
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
