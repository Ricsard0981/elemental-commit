import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G } from './state.js';
import { clamp, damp, lerp, rand, easeOut } from './util.js';
import { S, deriveQuality } from './settings.js';
import { toonMaterial, outlineHard } from './toon.js';

// active quality preset + dynamic-resolution state
export const Q = { ...deriveQuality(), scale: 1, budget: 1 };

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 500);
export let renderer, composer, bloom, fxPass;
export const sun = new THREE.DirectionalLight(0xfff1dd, 2.2);
export const hemi = new THREE.HemisphereLight(0x9ec8ff, 0x0b2a1c, 0.9);
export const player_light = new THREE.PointLight(0xffffff, 0, 16, 1.6);

// ---------------------------------------------------------------- init
export function initEngine(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  Object.assign(Q, deriveQuality());
  Q.budget = Math.min(1, Q.particles);
  renderer.setPixelRatio(basePR());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = SHADOW_TYPE[Q.shadowType];
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  // shader error checks call getProgramInfoLog (a synchronous GPU stall) per compile — debug only
  renderer.debug.checkShaderErrors = /[?&]debug/.test(location.search);

  scene.fog = new THREE.Fog(0x0b1a22, 26, 85);
  scene.add(hemi);
  sun.position.set(-14, 26, 18);
  sun.castShadow = Q.shadows;
  sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
  const sc = sun.shadow.camera;
  sc.left = -26; sc.right = 26; sc.top = 20; sc.bottom = -16; sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  scene.add(player_light);

  setLightCount(Q.lights);

  // HalfFloat target like EffectComposer's default, plus optional MSAA (the composer clones it for its second buffer)
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Q.aa }));
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.7, 0.82);
  const bloomSetSize = bloom.setSize.bind(bloom); // bloom can run at half resolution (a quarter of the cost)
  bloom.setSize = (w, h) => bloomSetSize(Math.max(64, Math.round(w * Q.bloomRes)), Math.max(64, Math.round(h * Q.bloomRes)));
  composer.addPass(bloom);
  bloom.enabled = Q.bloom;
  fxPass = new ShaderPass(FXShader);
  composer.addPass(fxPass);
  composer.addPass(new OutputPass());

  glow = new Particles(Q.glowMax, true);
  dust = new Particles(Q.dustMax, false);
  debrisLit = new Debris(Math.round(Q.debris * 0.45), false);
  debrisGlow = new Debris(Math.round(Q.debris * 0.55), true);
  resize();
  // coalesce resize storms (mobile URL bars, window drags) into one reallocation per frame
  let pendingResize = false;
  addEventListener('resize', () => { if (pendingResize) return; pendingResize = true; requestAnimationFrame(() => { pendingResize = false; resize(); }); });
}

function basePR() { return Math.min(devicePixelRatio || 1, Q.prMax) * (Q.renderScale ?? 1) * Q.scale; }
let lastSize = '';
export function resize(force = false) {
  const w = innerWidth, h = innerHeight;
  const pr = Math.max(0.5, basePR());
  const key = w + 'x' + h + '@' + pr.toFixed(3);
  if (key === lastSize && !force) return; lastSize = key;
  if (Math.abs(renderer.getPixelRatio() - pr) > 0.001) { renderer.setPixelRatio(pr); composer.setPixelRatio(pr); }
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  fxPass.uniforms.res.value.set(w * pr, h * pr);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const s = (h * pr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
  for (const p of [glow, dust]) if (p) p.mat.uniforms.uScale.value = s;
}

// ---------------------------------------------------------------- post FX
const FXShader = {
  uniforms: {
    tDiffuse: { value: null }, aberr: { value: 0 }, vig: { value: 0.4 },
    flash: { value: new THREE.Vector4(0, 0, 0, 0) }, comic: { value: 0 }, res: { value: new THREE.Vector2(1280, 720) }, desat: { value: 0 }, shock: { value: new THREE.Vector4(0, 0, 0, 0) }, aspect: { value: 1.78 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float aberr; uniform float vig; uniform vec4 flash; uniform float desat; uniform vec4 shock; uniform float aspect; uniform float comic; uniform vec2 res;
    varying vec2 vUv;
    void main(){
      vec2 uv = vUv;
      if (shock.w > 0.0001) { vec2 sd = (uv - shock.xy) * vec2(aspect, 1.); float sr = length(sd); float ring = exp(-pow((sr - shock.z) * 9., 2.)); uv += normalize(sd + 1e-5) / vec2(aspect, 1.) * ring * shock.w; }
      vec2 d = vUv - .5; float r = dot(d,d);
      vec2 off = d * aberr * (.4 + r * 5.);
      vec3 c = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      float l = dot(c, vec3(.299,.587,.114));
      c = mix(c, vec3(l), desat);
      if (comic > 0.001) {
        // comic print: coloured shadows, richer colour, and a Ben-Day dot screen that grows in the dark areas
        c = mix(c, c * vec3(.78, .7, 1.25), (1. - smoothstep(.08, .55, l)) * .55 * comic);
        c = mix(vec3(l), c, 1. + .24 * comic);
        float cell = max(3.5, res.y / 190.);
        vec2 gp = mat2(.7071, -.7071, .7071, .7071) * (gl_FragCoord.xy / cell);
        float dist = length(fract(gp) - .5), dark = 1. - smoothstep(.12, .5, l);
        float dots = smoothstep(.0, -.08, dist - dark * .62);
        c = mix(c, c * vec3(.55, .42, .85), dots * dark * .75 * comic);
        c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5) * .028 * comic;
      }
      c = mix(c, flash.rgb, flash.a);
      c *= 1. - vig * smoothstep(.18, .9, length(d) * 1.35);
      gl_FragColor = vec4(c, 1.);
    }`,
};
export const post = { aberr: 0, flash: [1, 1, 1], flashA: 0, bloomBoost: 0, desat: 0, vig: 0.4 };

// ---------------------------------------------------------------- particles
const PV = `
  attribute float size; attribute float alpha; attribute vec3 color; attribute float sprite; attribute float rot;
  varying vec3 vC; varying float vA; varying float vS; varying float vR; uniform float uScale;
  void main(){ vC=color; vA=alpha; vS=sprite; vR=rot; vec4 mv=modelViewMatrix*vec4(position,1.);
    gl_PointSize=size*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`;
const PF = `
  varying vec3 vC; varying float vA; varying float vS; varying float vR; uniform float uHard; uniform sampler2D uAtlas;
  void main(){
    if (vS < 0.5) { float d=length(gl_PointCoord-.5)*2.; if(d>1.) discard;
      float a=pow(1.-d, mix(2.2, .6, uHard)); gl_FragColor=vec4(vC, a*vA); return; }
    vec2 pc = vec2(gl_PointCoord.x - .5, .5 - gl_PointCoord.y);
    float c = cos(vR), s = sin(vR);
    pc = vec2(c * pc.x + s * pc.y, -s * pc.x + c * pc.y) + .5;
    if (pc.x < 0. || pc.x > 1. || pc.y < 0. || pc.y > 1.) discard;
    float i = vS - 1.;
    vec2 uv = (vec2(mod(i, 4.), floor(i / 4.)) + vec2(pc.x, 1. - pc.y)) / vec2(4., 2.);
    vec4 t = texture2D(uAtlas, uv);
    gl_FragColor = vec4(vC * (0.55 + 0.45 * t.r), t.a * vA);
  }`;

// Sprite atlas generated at boot: 4x2 tiles, white shapes in alpha. glow = the original procedural soft dot.
export const SPRITE = { glow: 0, streak: 1, smoke: 2, drop: 3, chip: 4, leaf: 5, star: 6, glint: 7 };
let atlasTex = null;
function makeAtlas() {
  const T = 64, cv = document.createElement('canvas'); cv.width = T * 4; cv.height = T * 2;
  const g = cv.getContext('2d');
  const tile = (i, fn) => { g.save(); g.translate((i % 4) * T, Math.floor(i / 4) * T); g.beginPath(); g.rect(0, 0, T, T); g.clip(); fn(); g.restore(); };
  const rad = (cx, cy, r0, r1, a0, a1) => { const gr = g.createRadialGradient(cx, cy, r0, cx, cy, r1); gr.addColorStop(0, `rgba(255,255,255,${a0})`); gr.addColorStop(1, `rgba(255,255,255,${a1})`); return gr; };
  tile(0, () => { // streak: tapered spark, long axis along +x
    const gr = g.createLinearGradient(0, 0, T, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 32); g.quadraticCurveTo(40, 22, T, 32); g.quadraticCurveTo(40, 42, 0, 32); g.fill();
  });
  tile(1, () => { // smoke puff
    for (let i = 0; i < 9; i++) { const a = i * 2.1, r = 11 + (i % 3) * 3, x = 32 + Math.cos(a) * 9, y = 32 + Math.sin(a) * 9; g.fillStyle = rad(x, y, 0, r, 0.5, 0); g.fillRect(0, 0, T, T); }
  });
  tile(2, () => { // droplet
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 6); g.bezierCurveTo(46, 26, 50, 36, 32, 54); g.bezierCurveTo(14, 36, 18, 26, 32, 6); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(26, 36, 3, 8, 0.2, 0, 7); g.fill();
  });
  tile(3, () => { // rock chip
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(10, 36); g.lineTo(26, 12); g.lineTo(50, 22); g.lineTo(54, 46); g.lineTo(30, 54); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.moveTo(30, 54); g.lineTo(54, 46); g.lineTo(50, 22); g.lineTo(34, 34); g.closePath(); g.fill();
  });
  tile(4, () => { // leaf
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(6, 52); g.bezierCurveTo(10, 14, 40, 6, 58, 8); g.bezierCurveTo(56, 34, 34, 56, 6, 52); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(8, 50); g.quadraticCurveTo(30, 32, 52, 12); g.stroke();
  });
  tile(5, () => { // starburst
    g.fillStyle = rad(32, 32, 0, 30, 1, 0); g.fillRect(0, 0, T, T);
    g.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { g.save(); g.translate(32, 32); g.rotate(i * Math.PI / 4); g.beginPath(); g.moveTo(-31, 0); g.lineTo(0, -3.2); g.lineTo(31, 0); g.lineTo(0, 3.2); g.fill(); g.restore(); }
  });
  tile(6, () => { // glint (4-point sparkle)
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 2); g.quadraticCurveTo(34, 30, 62, 32); g.quadraticCurveTo(34, 34, 32, 62); g.quadraticCurveTo(30, 34, 2, 32); g.quadraticCurveTo(30, 30, 32, 2); g.fill();
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}
const atlas = () => atlasTex || (atlasTex = makeAtlas());

class Particles {
  constructor(max, additive) {
    this.max = max; this.i = 0; this.hi = -1; this.live = 0; this.dirty = false;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max).fill(1);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    this.sprite = new Float32Array(max); this.rot = new Float32Array(max); this.spin = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('sprite', new THREE.BufferAttribute(this.sprite, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ name: 'particles',
      uniforms: { uScale: { value: 800 }, uHard: { value: additive ? 0 : 0.6 }, uAtlas: { value: atlas() } },
      vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 5;
    scene.add(this.points);
  }
  // sprite 0 = soft glow; 1 (streak) auto-aligns to its velocity; the others rotate by `spin` rad/s
  emit(x, y, z, vx, vy, vz, c, s0, s1, life, grav = 0, drag = 0, sprite = 0, spin = 0) {
    if (Q.budget < 1 && Math.random() > Q.budget) return;
    const i = this.i; this.i = (i + 1) % this.max; if (i > this.hi) this.hi = i; this.live++; this.dirty = true;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.col[k] = c[0]; this.col[k + 1] = c[1]; this.col[k + 2] = c[2];
    this.s0[i] = s0; this.s1[i] = s1; this.life[i] = life; this.maxLife[i] = life;
    this.grav[i] = grav; this.drag[i] = drag;
    this.sprite[i] = sprite; this.spin[i] = spin;
    this.rot[i] = sprite === 1 ? Math.atan2(vy, vx) : sprite ? rand(6.28) : 0;
  }
  update(dt) {
    if (!this.dirty && this.live === 0) return; // nothing alive and nothing changed: no loop, no upload
    const { pos, vel, life, maxLife, size, alpha, s0, s1, grav, drag, sprite, rot, spin } = this;
    const n = this.hi + 1; let live = 0;
    for (let i = 0; i < n; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) { alpha[i] = 0; size[i] = 0; } continue; }
      live++;
      life[i] -= dt;
      const k = i * 3;
      const dr = Math.max(0, 1 - drag[i] * dt);
      vel[k] *= dr; vel[k + 1] = vel[k + 1] * dr - grav[i] * dt; vel[k + 2] *= dr;
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      const t = Math.max(0, life[i] / maxLife[i]);
      size[i] = lerp(s1[i], s0[i], t); alpha[i] = Math.min(1, t * 2.2);
      if (sprite[i] === 1) rot[i] = Math.atan2(vel[k + 1], vel[k]); else if (spin[i]) rot[i] += spin[i] * dt;
    }
    // only the part of the buffers that was in use goes to the GPU, and only that part is drawn
    const g = this.points.geometry, a = g.attributes;
    g.setDrawRange(0, n);
    for (const key in a) { const at = a[key]; at.clearUpdateRanges(); at.addUpdateRange(0, n * at.itemSize); at.needsUpdate = true; }
    this.live = live; this.dirty = live > 0; // one last upload happens in the frame the final particle dies (it zeroes its alpha)
    if (live === 0) { this.hi = -1; this.i = 0; g.setDrawRange(0, 0); }
  }
}

export let glow, dust, debrisLit, debrisGlow;

// ---------------------------------------------------------------- debris cubes (instanced)
class Debris {
  constructor(max, glowing) {
    this.max = max; this.i = 0;
    const mat = glowing
      ? new THREE.MeshBasicMaterial({ toneMapped: false })
      : new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.15 });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = !glowing;
    this.d = [];
    for (let i = 0; i < max; i++) this.d.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0, s: 0, ml: 1, bounce: 0 });
    this.o = new THREE.Object3D();
    this.c = new THREE.Color();
    for (let i = 0; i < max; i++) { this.o.scale.setScalar(0); this.o.updateMatrix(); this.mesh.setMatrixAt(i, this.o.matrix); this.mesh.setColorAt(i, this.c.set(0)); }
    scene.add(this.mesh);
  }
  emit(x, y, z, vx, vy, vz, size, color, life = 1.5, mult = 1) {
    if (Q.budget < 1 && Math.random() > Q.budget + 0.15) return;
    const i = this.i; this.i = (i + 1) % this.max;
    const d = this.d[i];
    d.life = life; d.ml = life; d.x = x; d.y = y; d.z = z; d.vx = vx; d.vy = vy; d.vz = vz;
    this.active = true; d.s = size; d.rx = rand(6); d.ry = rand(6); d.rz = rand(6);
    d.sx = rand(-8, 8); d.sy = rand(-8, 8); d.sz = rand(-8, 8); d.bounce = 0;
    this.c.set(color); if (mult !== 1) this.c.multiplyScalar(mult);
    this.mesh.setColorAt(i, this.c);
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt, groundAt) {
    if (!this.active) return;
    const o = this.o; let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const d = this.d[i];
      if (d.life <= 0) continue;
      alive++;
      d.life -= dt;
      if (d.life <= 0) { o.scale.setScalar(0); o.position.set(0, -999, 0); o.rotation.set(0, 0, 0); o.updateMatrix(); this.mesh.setMatrixAt(i, o.matrix); continue; }
      d.vy -= 26 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      const gy = groundAt(d.x);
      if (d.y - d.s * 0.5 < gy && d.y > gy - 1.5 && d.vy < 0) {
        d.y = gy + d.s * 0.5; d.vy *= -0.38; d.vx *= 0.7; d.vz *= 0.7; d.sx *= 0.5; d.sy *= 0.5; d.sz *= 0.5;
        if (Math.abs(d.vy) < 1.2) d.vy = 0;
      }
      d.rx += d.sx * dt; d.ry += d.sy * dt; d.rz += d.sz * dt;
      const t = d.life / d.ml;
      const sc = d.s * Math.min(1, t * 3);
      o.position.set(d.x, d.y, d.z); o.rotation.set(d.rx, d.ry, d.rz); o.scale.setScalar(sc);
      o.updateMatrix(); this.mesh.setMatrixAt(i, o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!alive) this.active = false;
  }
}

// ---------------------------------------------------------------- particle helpers (used everywhere)
const _c = [1, 1, 1];
export function rgb(hex, m = 1) { _c[0] = ((hex >> 16) & 255) / 255 * m; _c[1] = ((hex >> 8) & 255) / 255 * m; _c[2] = (hex & 255) / 255 * m; return _c.slice(); }

export function sparks(x, y, color, n = 10, speed = 8, size = 0.22, life = 0.45, dirx = 0, spread = 1, sprite = 1) {
  const c = rgb(color, 1.6);
  for (let i = 0; i < n; i++) {
    const a = rand(Math.PI * 2), s = rand(0.3, 1) * speed;
    glow.emit(x, y, rand(-0.3, 0.3), Math.cos(a) * s * spread + dirx * speed * 0.5, Math.sin(a) * s * spread, rand(-1, 1), c, size * rand(1.6, 2.8), size * 0.3, life * rand(0.6, 1.2), 12, 2, sprite);
  }
}
export function puff(x, y, n = 6, color = 0x8b949e, size = 0.9, life = 0.6, spd = 2.5) {
  const c = rgb(color, 0.7);
  for (let i = 0; i < n; i++) dust.emit(x + rand(-0.3, 0.3), y, rand(-0.4, 0.4), rand(-spd, spd), rand(0.3, 1.5), rand(-0.5, 0.5), c, size * rand(0.5, 1), size * 1.7, life * rand(0.7, 1.2), -1, 2, 2, rand(-1, 1));
}
export function cubes(x, y, color, n = 8, speed = 8, size = 0.28, glowy = false, life = 1.4) {
  for (let i = 0; i < n; i++) {
    const a = rand(Math.PI * 2), s = rand(0.4, 1) * speed;
    (glowy ? debrisGlow : debrisLit).emit(x, y, rand(-0.5, 0.5), Math.cos(a) * s, Math.abs(Math.sin(a)) * s + 3, rand(-3, 3), size * rand(0.6, 1.3), color, life * rand(0.7, 1.2), glowy ? 1.8 : 1);
  }
}

// ---------------------------------------------------------------- generic timed fx (rings, slashes, lights, ...)
// bright streaks racing outwards along a cut line (the "something was sliced" read of a melee hit)
export function cutLines(x, y, ang, color, n = 6, speed = 18) {
  if (Q.budget < 1) return;
  const lx = Math.cos(ang), ly = Math.sin(ang);
  for (let i = 0; i < n; i++) {
    const s = (i % 2 ? 1 : -1) * speed * (0.5 + Math.random() * 0.7);
    glow.emit(x, y, 0.45, lx * s, ly * s, 0, rgb(i % 3 ? color : 0xffffff, 2.5), 0.34, 0.02, 0.2 + Math.random() * 0.12, 0, 2.5, SPRITE.streak);
  }
}
export function addFx(update) { const f = { update, dead: false }; G.fx.push(f); return f; }

const ringGeo = new THREE.RingGeometry(0.88, 1, 64);
const ringPool = [];
export function ring(x, y, z, color, { r0 = 0.3, r1 = 4, dur = 0.5, flat = false, intensity = 1.6, rot = 0 } = {}) {
  // pooled: a fight spawns dozens of rings a second, and a fresh material per ring means a program lookup per ring
  let m = ringPool.pop();
  if (!m) m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  m.material.color.set(color).multiplyScalar(intensity); m.material.opacity = 1;
  m.position.set(x, y, z); m.rotation.set(flat ? -Math.PI / 2 : 0, 0, rot); m.scale.setScalar(r0);
  scene.add(m);
  let t = 0;
  addFx((dt) => {
    t += dt; const k = Math.min(1, t / dur), e = easeOut(k);
    m.scale.setScalar(lerp(r0, r1, e)); m.material.opacity = (1 - k) * (1 - k);
    if (k >= 1) { scene.remove(m); ringPool.push(m); return false; }
    return true;
  });
}

const crescents = {};
function crescent(angle) {
  const key = angle.toFixed(2);
  if (crescents[key]) return crescents[key];
  const segs = 28, pos = [], col = [], uvs = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, a = (t - 0.5) * angle, tap = Math.pow(Math.sin(Math.PI * t), 0.8);
    const ro = 1, ri = 1 - 0.42 * tap;
    pos.push(Math.cos(a) * ri, Math.sin(a) * ri, 0, Math.cos(a) * ro, Math.sin(a) * ro, 0);
    const b = 0.15 + 0.85 * tap;
    col.push(0.2 * b, 0.2 * b, 0.2 * b, b, b, b);
    uvs.push(t, 0, t, 1);
    if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return (crescents[key] = g);
}
// shader slash: gradient along the arc + scrolling noise, with an edge style per element (0 fire, 1 water, 2 earth, 3 air)
const SL_V = 'varying vec2 vUv; varying vec3 vK; attribute vec3 color; void main(){ vUv = uv; vK = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SL_F = `
  uniform vec3 uHead, uTail; uniform float uTime, uStyle, uStyle2, uMix, uFade, uSeed; varying vec2 vUv; varying vec3 vK;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
  float edge(float st, float u, float v, float t) {
    float e = 1.0;
    if (st < 0.5) e = smoothstep(0.15, 0.75, v + (n(vec2(u * 9.0 + uSeed, t * 9.0)) - 0.5) * 0.9);
    else if (st < 1.5) { float foam = step(0.62, n(vec2(u * 24.0 + uSeed, v * 6.0 - t * 4.0))); e = mix(smoothstep(0.1, 0.9, v), 1.0, foam * smoothstep(0.4, 1.0, v)); }
    else if (st < 2.5) { float stp = floor(u * 11.0); e = step(h(vec2(stp, uSeed)) * 0.55, v) * mix(0.6, 1.0, h(vec2(stp, 2.0))); }
    else e = smoothstep(0.0, 0.12, abs(fract(v * 3.2 + n(vec2(u * 4.0, uSeed)) * 0.4) - 0.5) - 0.18 + 0.2 * (1.0 - u));
    return e;
  }
  void main() {
    float u = vUv.x, v = vUv.y, t = uTime;
    float e = edge(uStyle, u, v, t);
    if (uMix > 0.01) e = mix(e, e * 0.5 + 0.5 * edge(uStyle2, u, v, t), uMix * 0.7);
    float head = smoothstep(0.0, 1.0, u);
    vec3 col = mix(uTail, uHead, head) * (0.8 + 0.7 * v);
    col += vec3(1.0) * smoothstep(0.85, 1.0, v) * 0.5 * head; // hot rim on the outer edge
    float a = vK.g * e * uFade;
    gl_FragColor = vec4(col * (1.0 + 0.6 * head), a);
  }`;
const SL_STYLE = { fire: 0, water: 1, earth: 2, air: 3 };
let slashBase = null;
function slashMaterial() {
  if (!slashBase) slashBase = new THREE.ShaderMaterial({ name: 'slash',
    uniforms: { uHead: { value: new THREE.Color() }, uTail: { value: new THREE.Color() }, uTime: { value: 0 }, uStyle: { value: 0 }, uStyle2: { value: 0 }, uMix: { value: 0 }, uFade: { value: 1 }, uSeed: { value: 0 } },
    vertexShader: SL_V, fragmentShader: SL_F, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  slashBase.toneMapped = false;
  return slashBase;
}
// a swoosh arc: dir = ±1 facing; sweeps from rotStart over time. Style follows the active element; a Resonance imbue tints the tail.
const slashPool = [];
export function slash(x, y, dir, color, { radius = 2, angle = 2.2, dur = 0.22, rot = 0, sweep = 0.9, z = 0.3, intensity = 1.8, flip = 1 } = {}) {
  const mat = slashPool.pop() || slashMaterial().clone(); mat.toneMapped = false;
  const u = mat.uniforms, im = G.player?.imbue;
  u.uHead.value.set(color).multiplyScalar(intensity * 0.9); u.uTail.value.set(im ? im.color : color).multiplyScalar(intensity * 0.55);
  u.uStyle.value = SL_STYLE[G.element] ?? 0; u.uStyle2.value = im ? im.style : 0; u.uMix.value = im ? 0.35 + 0.2 * (im.power || 1) : 0; u.uSeed.value = Math.random() * 20;
  const m = new THREE.Mesh(crescent(angle), mat);
  m.position.set(x, y, z);
  m.scale.set(radius * dir, radius * flip, 1);
  scene.add(m);
  let t = 0;
  addFx((dt) => {
    t += dt; const k = Math.min(1, t / dur), e = easeOut(k);
    m.rotation.z = rot * dir + (e - 0.5) * sweep * dir * flip;
    m.scale.set(radius * dir * (0.85 + e * 0.25), radius * flip * (0.85 + e * 0.25), 1);
    u.uFade.value = 1 - k * k; u.uTime.value = t;
    if (k >= 1) { scene.remove(m); slashPool.push(mat); return false; }
    return true;
  });
}

// ---------------------------------------------------------------- ground decals (scorch / puddle / crack) + impact flash + shockwave
const decalTex = {};
function decalTexture(kind) {
  if (decalTex[kind]) return decalTex[kind];
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const g = cv.getContext('2d');
  g.translate(64, 32); g.scale(1, 0.5);
  if (kind === 'scorch') {
    for (let i = 0; i < 14; i++) { const a = i * 0.9, r = 18 + (i % 4) * 6; g.fillStyle = 'rgba(8,6,6,0.55)'; g.beginPath(); g.arc(Math.cos(a) * 14, Math.sin(a) * 14, r, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(255,140,40,0.9)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 40, 0.3, 5.9); g.stroke();
  } else if (kind === 'puddle') {
    const gr = g.createRadialGradient(0, 0, 4, 0, 0, 56); gr.addColorStop(0, 'rgba(110,190,255,0.75)'); gr.addColorStop(0.8, 'rgba(60,150,255,0.5)'); gr.addColorStop(1, 'rgba(60,150,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 58, 0, 7); g.fill(); g.strokeStyle = 'rgba(220,245,255,0.9)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, 44, 0, 7); g.stroke();
  } else if (kind === 'crack') {
    g.strokeStyle = 'rgba(255,230,160,0.95)'; g.lineWidth = 3; g.lineCap = 'round';
    for (let i = 0; i < 9; i++) { let a = i * 0.7 + 0.2, x = 0, y = 0; g.beginPath(); g.moveTo(0, 0); for (let k = 0; k < 4; k++) { a += (Math.random() - 0.5) * 0.9; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); } g.stroke(); }
    g.strokeStyle = 'rgba(40,24,10,0.85)'; g.lineWidth = 6; g.globalCompositeOperation = 'destination-over';
    for (let i = 0; i < 9; i++) { let a = i * 0.7 + 0.2, x = 0, y = 0; g.beginPath(); g.moveTo(0, 0); for (let k = 0; k < 4; k++) { a += (Math.random() - 0.5) * 0.9; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); } g.stroke(); }
  } else { // wind swirl
    g.strokeStyle = 'rgba(210,245,255,0.8)'; g.lineWidth = 3; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(0, 0, 18 + k * 12, k * 1.1, k * 1.1 + 4); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; decalTex[kind] = t; return t;
}
const decalPool = [];
const decalGeo = new THREE.PlaneGeometry(1, 1);
export function decal(kind, x, y, size = 3, life = 5, color = 0xffffff) {
  if (!Q.decals) return;
  let d = decalPool.find((o) => !o.alive);
  if (!d) {
    if (decalPool.length >= Q.decals) d = decalPool.reduce((a, b) => (a.t > b.t ? a : b)); else {
      const m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 2; d = { m, alive: false, t: 0 }; decalPool.push(d); scene.add(m);
    }
  }
  d.alive = true; d.t = 0; d.life = life; d.m.visible = true;
  d.m.material.map = decalTexture(kind); d.m.material.color.set(color); d.m.material.needsUpdate = false;
  d.m.position.set(x, y + 0.04, 0.45); d.m.scale.set(size, size * 0.7, 1); d.m.material.opacity = 1;
}
function updateDecals(dt) {
  for (const d of decalPool) {
    if (!d.alive) continue;
    d.t += dt; const k = d.t / d.life;
    d.m.material.opacity = k > 0.6 ? Math.max(0, 1 - (k - 0.6) / 0.4) : 1;
    if (k >= 1) { d.alive = false; d.m.visible = false; }
  }
}
export function clearDecals() { for (const d of decalPool) { d.alive = false; d.m.visible = false; } }
// big starburst + glint at an impact point
export function impactFlash(x, y, color, size = 2.4) {
  glow.emit(x, y, 0.4, 0, 0, 0, rgb(0xffffff, 2.4), size, size * 0.4, 0.09, 0, 0, SPRITE.star, rand(-2, 2));
  glow.emit(x, y, 0.4, 0, 0, 0, rgb(color, 2), size * 1.3, size * 0.2, 0.14, 0, 0, SPRITE.glint, 0);
}
// screen-space shockwave (High only): a ring that distorts the image as it expands
const _sv = new THREE.Vector3();
export function shockwave(x, y, strength = 0.03, dur = 0.5, maxR = 0.6) {
  if (!Q.distort) return;
  _sv.set(x, y, 0).project(camera);
  const sx = _sv.x * 0.5 + 0.5, sy = _sv.y * 0.5 + 0.5; let t = 0;
  shock.on = true;
  addFx((dt) => {
    t += dt; const k = Math.min(1, t / dur);
    shock.v.set(sx, sy, k * maxR, strength * (1 - k) * (1 - k));
    if (k >= 1) { shock.v.w = 0; shock.on = false; return false; }
    return true;
  });
}
const shock = { v: new THREE.Vector4(0, 0, 0, 0), on: false };

// pooled point lights for spell flashes
const flashPool = [];
export function flashLight(x, y, z, color, intensity = 40, dur = 0.3) {
  let best = flashPool[0];
  for (const f of flashPool) if (f.t <= 0) { best = f; break; } else if (f.t < best.t) best = f;
  best.l.position.set(x, y, z); best.l.color.set(color); best.i0 = intensity; best.dur = dur; best.t = dur;
}
function updateFlashes(dt) {
  for (const f of flashPool) {
    if (f.t > 0) { f.t -= dt; f.l.intensity = Math.max(0, f.t / f.dur) ** 2 * f.i0; } else f.l.intensity = 0;
  }
}

// ---------------------------------------------------------------- floating text
const floatRoot = () => document.getElementById('floaters');
const floaters = [];
const _v = new THREE.Vector3();
export function floatText(x, y, text, { cls = '', color = '#fff', size = 22, dur = 0.9, vy = 2.6, vx = 0 } = {}) {
  if (floaters.length > (Q.level === 'high' ? 60 : 32)) { const old = floaters.shift(); old.el.remove(); }
  const el = document.createElement('div');
  el.className = 'floater ' + cls;
  el.textContent = text; el.style.color = color; el.style.fontSize = size + 'px';
  floatRoot().appendChild(el);
  floaters.push({ el, x: x + rand(-0.3, 0.3), y, vx: vx + rand(-0.6, 0.6), vy, t: 0, dur });
}
function updateFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy *= 1 - 2.2 * dt;
    _v.set(f.x, f.y, 0.5).project(camera);
    const px = (_v.x * 0.5 + 0.5) * innerWidth, py = (-_v.y * 0.5 + 0.5) * innerHeight;
    const k = f.t / f.dur;
    f.el.style.transform = `translate(${px}px,${py}px) translate(-50%,-50%) scale(${k < 0.12 ? 0.4 + (k / 0.12) * 0.8 : 1.2 - Math.min(0.3, (k - 0.12))})`;
    f.el.style.opacity = k > 0.65 ? String(1 - (k - 0.65) / 0.35) : '1';
    if (k >= 1) { f.el.remove(); floaters.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- camera
const ZOOM_K = 0.68; // characters are big and readable: the camera sits closer than the original vertical slice
export const cam = { x: 0, y: 3, trauma: 0, fovKick: 0, zoom: 1, zoomT: 1, look: 0, roll: 0, push: 0, bx0: 6, bx1: 250, free: false, tx: 0, ty: 0 };
let frameShake = 0;
// trauma is capped per FRAME, so a finisher that hits three enemies (and explodes) shakes like one big hit, not like three
export function shake(a) { const add = Math.min(a * S.shake, Math.max(0, 0.5 - frameShake)); frameShake += add; cam.trauma = Math.min(1, cam.trauma + add); }
// signed: positive zooms in (impact), negative pulls out (getting hit)
export function punchFov(v) { if (Math.abs(v) >= Math.abs(cam.fovKick)) cam.fovKick = v; }
export function updateCamera(dt, tx, ty, facing, t) {
  cam.look = damp(cam.look, facing * 3.2, 2.2, dt);
  const gx = tx + cam.look, gy = ty + 2.0;
  cam.x = damp(cam.x, clamp(gx, cam.bx0, cam.bx1), 5.5, dt);
  cam.y = damp(cam.y, gy, 3.2, dt);
  cam.zoom = damp(cam.zoom, cam.zoomLock ?? cam.zoomT, 2.5, dt); // zoomLock: debug / screenshot override
  cam.fovKick = damp(cam.fovKick, 0, 6, dt);
  cam.push = damp(cam.push, 0, 3.2, dt); // cinematic push-in (executions, perfect dodge)
  cam.trauma = Math.max(0, cam.trauma - dt * 1.7);
  const s = cam.trauma * cam.trauma;
  const sx = (Math.sin(t * 47) + Math.sin(t * 31 + 1)) * 0.5 * s * 1.5;
  const sy = (Math.sin(t * 53 + 2) + Math.sin(t * 29)) * 0.5 * s * 1.5;
  const dist = 18.5 * cam.zoom * ZOOM_K * (1 - cam.push * 0.2);
  camera.position.set(cam.x + sx, Math.max(cam.y, 1.5) + 3.0 * cam.zoom * ZOOM_K + sy, dist);
  camera.lookAt(cam.x + sx * 0.5, Math.max(cam.y, 1.5) + 0.2 + sy * 0.5, 0);
  camera.rotateZ(Math.sin(t * 40) * s * 0.03 + cam.roll);
  const fov = cam.fovLock ?? 38 - cam.fovKick; // fovLock: debug / screenshot override
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

// ---------------------------------------------------------------- frame
export function stepEngine(dt, rdt, groundAt) {
  frameShake = 0;
  // fx run on game dt; particles on blended dt so hit-stop feels crunchy but alive
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const f = G.fx[i];
    if (f.dead || f.update(dt) === false) G.fx.splice(i, 1);
  }
  const pdt = dt > 0 ? dt : rdt * 0.12;
  glow.update(pdt); dust.update(pdt);
  debrisLit.update(pdt, groundAt); debrisGlow.update(pdt, groundAt);
  updateFlashes(rdt); updateFloaters(rdt);
  // post-fx decay
  post.aberr = damp(post.aberr, 0, 7, rdt);
  post.flashA = damp(post.flashA, 0, 6, rdt);
  post.bloomBoost = damp(post.bloomBoost, 0, 4, rdt);
  post.desat = damp(post.desat, G.mode === 'dead' ? 0.85 : 0, 3, rdt);
  const u = fxPass.uniforms;
  u.aberr.value = post.aberr * (S.flashes ? 1 : 0.2); u.flash.value.set(post.flash[0], post.flash[1], post.flash[2], post.flashA);
  u.comic.value = Q.comic || 0; u.desat.value = post.desat; u.vig.value = post.vig; u.shock.value.copy(shock.v); u.aspect.value = camera.aspect;
  updateDecals(dt);
  bloom.strength = 0.55 + post.bloomBoost;
}
export function screenFlash(color, a = 0.35) {
  post.flash = rgb(color).map((v) => Math.min(1, v)); post.flashA = Math.max(post.flashA, S.flashes ? a : a * 0.25);
}
export function render() { composer.render(); }

// Shader warm-up: transient effects create materials on the fly. Keep one hidden mesh per
// material variant alive so their programs are compiled once at boot and never released
// (otherwise three.js frees a program when its last material goes away and recompiles it,
// a GPU stall, the next time an effect fires).
export function warmup() {
  const keep = new THREE.Group(); keep.position.set(0, -5000, 0); scene.add(keep);
  const g = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  const add = (m) => { const o = new THREE.Mesh(m.uniforms?.uFade ? crescent(2.2) : g, m); o.castShadow = false; keep.add(o); };
  const A = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false };
  add(new THREE.MeshBasicMaterial({ ...A, side: THREE.DoubleSide }));                 // rings
  add(slashMaterial());                                                                // shader slashes
  add(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, map: decalTexture('scorch') })); // decals
  add(toonMaterial());                                                                 // toon enemies / shards
  add(outlineHard);                                                                    // enemy outlines
  add(new THREE.MeshBasicMaterial(A));                                                  // waves, tornado
  add(new THREE.MeshBasicMaterial({ toneMapped: false }));                               // orbs, pickups, meteors
  add(new THREE.MeshBasicMaterial({ transparent: true, depthTest: false }));             // hp bar bg
  add(new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, toneMapped: false })); // hp bar fill
  add(new THREE.MeshStandardMaterial({ flatShading: true }));                            // rocks, pillars
  add(new THREE.MeshStandardMaterial({ emissive: 0x111111 }));                           // enemies
  compileScene();
}
// Compile scene materials for the variant that is actually used: everything renders into the composer's
// (linear) render target, so compiling against the canvas would build the wrong (sRGB-output) programs.
export function compileScene(async = false) {
  renderer.setRenderTarget(composer.renderTarget1);
  if (async && renderer.compileAsync) return renderer.compileAsync(scene, camera).finally(() => renderer.setRenderTarget(null));
  renderer.compile(scene, camera);
  renderer.setRenderTarget(null);
  return Promise.resolve();
}

const SHADOW_TYPE = { basic: THREE.BasicShadowMap, pcf: THREE.PCFShadowMap, soft: THREE.PCFSoftShadowMap };
function setLightCount(n) {
  while (flashPool.length < n) { const l = new THREE.PointLight(0xffffff, 0, 18, 1.8); scene.add(l); flashPool.push({ l, t: 0, dur: 1, i0: 0 }); }
  while (flashPool.length > n) { const f = flashPool.pop(); scene.remove(f.l); f.l.dispose(); }
}
// Apply the current preset + overrides at runtime. Returns true when shader programs change (lights, shadow type,
// outlines, ribbons...), so the caller re-runs the warm-up before play continues.
export function applyQuality() {
  const old = { ...Q };
  Object.assign(Q, deriveQuality());
  Q.budget = Math.min(1, Q.particles); Q.scale = 1;
  bloom.enabled = Q.bloom;
  if (sun.castShadow !== Q.shadows || sun.shadow.mapSize.x !== Q.shadowMap || old.shadowType !== Q.shadowType) {
    sun.castShadow = Q.shadows; sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
    renderer.shadowMap.type = SHADOW_TYPE[Q.shadowType];
    sun.shadow.map?.dispose(); sun.shadow.map = null;
  }
  if (old.aa !== Q.aa) for (const rt of [composer.renderTarget1, composer.renderTarget2]) { rt.samples = Q.aa; rt.dispose(); }
  setLightCount(Q.lights);
  if (old.glowMax !== Q.glowMax || old.dustMax !== Q.dustMax) {
    scene.remove(glow.points, dust.points);
    glow = new Particles(Q.glowMax, true); dust = new Particles(Q.dustMax, false);
  }
  resize(true);
  return old.lights !== Q.lights || old.shadows !== Q.shadows || old.shadowType !== Q.shadowType || old.outlines !== Q.outlines || old.ribbonN !== Q.ribbonN || old.trailN !== Q.trailN || old.glowMax !== Q.glowMax;
}

// Dynamic resolution: watch smoothed frame time; trade pixels for frames (only in 'auto').
const perf = { ema: 16.7, t: 0, frames: 0, fps: 60, acc: 0 };
export const perfStats = perf;
export function adaptResolution(rdtMs) {
  perf.ema += (rdtMs - perf.ema) * 0.05;
  perf.acc += rdtMs; perf.frames++;
  if (perf.acc >= 500) { perf.fps = Math.round((perf.frames * 1000) / perf.acc); perf.acc = 0; perf.frames = 0; }
  perf.t += rdtMs;
  if (!Q.dynRes || perf.t < 1500) return;
  perf.t = 0;
  let s = Q.scale;
  if (perf.ema > 22 && s > 0.55) s = Math.max(0.55, s - 0.1);        // < ~45 fps: drop resolution
  else if (perf.ema < 14.5 && s < 1) s = Math.min(1, s + 0.05);       // headroom: creep back up
  if (s !== Q.scale) { Q.scale = s; resize(); }
  // still struggling at minimum resolution → shed the expensive passes
  if (s <= 0.55 && perf.ema > 26) { if (bloom.enabled) bloom.enabled = false; else if (sun.castShadow) { sun.castShadow = false; } Q.budget = Math.max(0.35, Q.budget - 0.15); }
}
