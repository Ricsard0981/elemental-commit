import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G } from './state.js';
import { clamp, damp, lerp, rand, easeOut } from './util.js';
import { S, QUALITY, qualityLevel } from './settings.js';

// active quality preset + dynamic-resolution state
export const Q = { level: 'high', ...QUALITY.high, scale: 1, budget: 1 };

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 500);
export let renderer, composer, bloom, fxPass;
export const sun = new THREE.DirectionalLight(0xfff1dd, 2.2);
export const hemi = new THREE.HemisphereLight(0x9ec8ff, 0x0b2a1c, 0.9);
export const player_light = new THREE.PointLight(0xffffff, 0, 16, 1.6);

// ---------------------------------------------------------------- init
export function initEngine(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  Object.assign(Q, QUALITY[qualityLevel()], { level: qualityLevel() });
  Q.budget = Q.particles;
  renderer.setPixelRatio(basePR());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

  for (let i = 0; i < Q.lights; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 18, 1.8);
    scene.add(l);
    flashPool.push({ l, t: 0, dur: 1, i0: 0 });
  }

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.7, 0.82);
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
  addEventListener('resize', resize);
}

function basePR() { return Math.min(devicePixelRatio || 1, Q.prMax) * Q.scale; }
export function resize() {
  const w = innerWidth, h = innerHeight;
  const pr = Math.max(0.5, basePR());
  if (Math.abs(renderer.getPixelRatio() - pr) > 0.001) { renderer.setPixelRatio(pr); composer.setPixelRatio(pr); }
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const s = (h * pr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
  for (const p of [glow, dust]) if (p) p.mat.uniforms.uScale.value = s;
}

// ---------------------------------------------------------------- post FX
const FXShader = {
  uniforms: {
    tDiffuse: { value: null }, aberr: { value: 0 }, vig: { value: 0.4 },
    flash: { value: new THREE.Vector4(0, 0, 0, 0) }, desat: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float aberr; uniform float vig; uniform vec4 flash; uniform float desat;
    varying vec2 vUv;
    void main(){
      vec2 d = vUv - .5; float r = dot(d,d);
      vec2 off = d * aberr * (.4 + r * 5.);
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(c, vec3(.299,.587,.114));
      c = mix(c, vec3(l), desat);
      c = mix(c, flash.rgb, flash.a);
      c *= 1. - vig * smoothstep(.18, .9, length(d) * 1.35);
      gl_FragColor = vec4(c, 1.);
    }`,
};
export const post = { aberr: 0, flash: [1, 1, 1], flashA: 0, bloomBoost: 0, desat: 0, vig: 0.4 };

// ---------------------------------------------------------------- particles
const PV = `
  attribute float size; attribute float alpha; attribute vec3 color;
  varying vec3 vC; varying float vA; uniform float uScale;
  void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.);
    gl_PointSize=size*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`;
const PF = `
  varying vec3 vC; varying float vA; uniform float uHard;
  void main(){ float d=length(gl_PointCoord-.5)*2.; if(d>1.) discard;
    float a=pow(1.-d, mix(2.2, .6, uHard)); gl_FragColor=vec4(vC, a*vA); }`;

class Particles {
  constructor(max, additive) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max).fill(1);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 800 }, uHard: { value: additive ? 0 : 0.6 } },
      vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 5;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, c, s0, s1, life, grav = 0, drag = 0) {
    if (Q.budget < 1 && Math.random() > Q.budget) return;
    const i = this.i; this.i = (i + 1) % this.max;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.col[k] = c[0]; this.col[k + 1] = c[1]; this.col[k + 2] = c[2];
    this.s0[i] = s0; this.s1[i] = s1; this.life[i] = life; this.maxLife[i] = life;
    this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    const { pos, vel, life, maxLife, size, alpha, s0, s1, grav, drag } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) { alpha[i] = 0; size[i] = 0; } continue; }
      life[i] -= dt;
      const k = i * 3;
      const dr = Math.max(0, 1 - drag[i] * dt);
      vel[k] *= dr; vel[k + 1] = vel[k + 1] * dr - grav[i] * dt; vel[k + 2] *= dr;
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      const t = Math.max(0, life[i] / maxLife[i]);
      size[i] = lerp(s1[i], s0[i], t); alpha[i] = Math.min(1, t * 2.2);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = true;
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
    d.s = size; d.rx = rand(6); d.ry = rand(6); d.rz = rand(6);
    d.sx = rand(-8, 8); d.sy = rand(-8, 8); d.sz = rand(-8, 8); d.bounce = 0;
    this.c.set(color); if (mult !== 1) this.c.multiplyScalar(mult);
    this.mesh.setColorAt(i, this.c);
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt, groundAt) {
    const o = this.o;
    for (let i = 0; i < this.max; i++) {
      const d = this.d[i];
      if (d.life <= 0) continue;
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
  }
}

// ---------------------------------------------------------------- particle helpers (used everywhere)
const _c = [1, 1, 1];
export function rgb(hex, m = 1) { _c[0] = ((hex >> 16) & 255) / 255 * m; _c[1] = ((hex >> 8) & 255) / 255 * m; _c[2] = (hex & 255) / 255 * m; return _c.slice(); }

export function sparks(x, y, color, n = 10, speed = 8, size = 0.22, life = 0.45, dirx = 0, spread = 1) {
  const c = rgb(color, 1.6);
  for (let i = 0; i < n; i++) {
    const a = rand(Math.PI * 2), s = rand(0.3, 1) * speed;
    glow.emit(x, y, rand(-0.3, 0.3), Math.cos(a) * s * spread + dirx * speed * 0.5, Math.sin(a) * s * spread, rand(-1, 1), c, size * rand(0.6, 1.2), 0, life * rand(0.6, 1.2), 12, 2);
  }
}
export function puff(x, y, n = 6, color = 0x8b949e, size = 0.9, life = 0.6, spd = 2.5) {
  const c = rgb(color, 0.7);
  for (let i = 0; i < n; i++) dust.emit(x + rand(-0.3, 0.3), y, rand(-0.4, 0.4), rand(-spd, spd), rand(0.3, 1.5), rand(-0.5, 0.5), c, size * rand(0.5, 1), size * 1.7, life * rand(0.7, 1.2), -1, 2);
}
export function cubes(x, y, color, n = 8, speed = 8, size = 0.28, glowy = false, life = 1.4) {
  for (let i = 0; i < n; i++) {
    const a = rand(Math.PI * 2), s = rand(0.4, 1) * speed;
    (glowy ? debrisGlow : debrisLit).emit(x, y, rand(-0.5, 0.5), Math.cos(a) * s, Math.abs(Math.sin(a)) * s + 3, rand(-3, 3), size * rand(0.6, 1.3), color, life * rand(0.7, 1.2), glowy ? 1.8 : 1);
  }
}

// ---------------------------------------------------------------- generic timed fx (rings, slashes, lights, ...)
export function addFx(update) { const f = { update, dead: false }; G.fx.push(f); return f; }

const ringGeo = new THREE.RingGeometry(0.88, 1, 64);
export function ring(x, y, z, color, { r0 = 0.3, r1 = 4, dur = 0.5, flat = false, intensity = 1.6, rot = 0 } = {}) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  m.position.set(x, y, z);
  if (flat) m.rotation.x = -Math.PI / 2;
  m.rotation.z = rot;
  scene.add(m);
  let t = 0;
  addFx((dt) => {
    t += dt; const k = Math.min(1, t / dur), e = easeOut(k);
    m.scale.setScalar(lerp(r0, r1, e)); m.material.opacity = (1 - k) * (1 - k);
    if (k >= 1) { scene.remove(m); return false; }
    return true;
  });
}

const crescents = {};
function crescent(angle) {
  const key = angle.toFixed(2);
  if (crescents[key]) return crescents[key];
  const segs = 28, pos = [], col = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, a = (t - 0.5) * angle, tap = Math.pow(Math.sin(Math.PI * t), 0.8);
    const ro = 1, ri = 1 - 0.42 * tap;
    pos.push(Math.cos(a) * ri, Math.sin(a) * ri, 0, Math.cos(a) * ro, Math.sin(a) * ro, 0);
    const b = 0.15 + 0.85 * tap;
    col.push(0.2 * b, 0.2 * b, 0.2 * b, b, b, b);
    if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return (crescents[key] = g);
}
// a swoosh arc: dir = ±1 facing; sweeps from rotStart over time
export function slash(x, y, dir, color, { radius = 2, angle = 2.2, dur = 0.22, rot = 0, sweep = 0.9, z = 0.3, intensity = 1.8, flip = 1 } = {}) {
  const m = new THREE.Mesh(crescent(angle), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  m.position.set(x, y, z);
  m.scale.set(radius * dir, radius * flip, 1);
  scene.add(m);
  let t = 0;
  addFx((dt) => {
    t += dt; const k = Math.min(1, t / dur), e = easeOut(k);
    m.rotation.z = rot * dir + (e - 0.5) * sweep * dir * flip;
    m.scale.set(radius * dir * (0.85 + e * 0.25), radius * flip * (0.85 + e * 0.25), 1);
    m.material.opacity = 1 - k * k;
    if (k >= 1) { scene.remove(m); return false; }
    return true;
  });
}

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
export const cam = { x: 0, y: 3, trauma: 0, fovKick: 0, zoom: 1, zoomT: 1, look: 0, roll: 0, bx0: 12, bx1: 250, free: false, tx: 0, ty: 0 };
export function shake(a) { cam.trauma = Math.min(1, cam.trauma + a * S.shake); }
export function punchFov(v) { cam.fovKick = Math.max(cam.fovKick, v); }
export function updateCamera(dt, tx, ty, facing, t) {
  cam.look = damp(cam.look, facing * 3.2, 2.2, dt);
  const gx = tx + cam.look, gy = ty + 2.0;
  cam.x = damp(cam.x, clamp(gx, cam.bx0, cam.bx1), 5.5, dt);
  cam.y = damp(cam.y, gy, 3.2, dt);
  cam.zoom = damp(cam.zoom, cam.zoomT, 2.5, dt);
  cam.fovKick = damp(cam.fovKick, 0, 6, dt);
  cam.trauma = Math.max(0, cam.trauma - dt * 1.7);
  const s = cam.trauma * cam.trauma;
  const sx = (Math.sin(t * 47) + Math.sin(t * 31 + 1)) * 0.5 * s * 0.7;
  const sy = (Math.sin(t * 53 + 2) + Math.sin(t * 29)) * 0.5 * s * 0.7;
  const dist = 18.5 * cam.zoom;
  camera.position.set(cam.x + sx, Math.max(cam.y, 1.5) + 3.0 * cam.zoom + sy, dist);
  camera.lookAt(cam.x + sx * 0.5, Math.max(cam.y, 1.5) + 0.2 + sy * 0.5, 0);
  camera.rotateZ(Math.sin(t * 40) * s * 0.03 + cam.roll);
  const fov = 38 - cam.fovKick;
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

// ---------------------------------------------------------------- frame
export function stepEngine(dt, rdt, groundAt) {
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
  u.desat.value = post.desat; u.vig.value = post.vig;
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
  const add = (m) => { const o = new THREE.Mesh(m.vertexColors ? crescent(2.2) : g, m); o.castShadow = false; keep.add(o); };
  const A = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false };
  add(new THREE.MeshBasicMaterial({ ...A, side: THREE.DoubleSide }));                 // rings
  add(new THREE.MeshBasicMaterial({ ...A, side: THREE.DoubleSide, vertexColors: true })); // slashes
  add(new THREE.MeshBasicMaterial(A));                                                  // waves, tornado
  add(new THREE.MeshBasicMaterial({ toneMapped: false }));                               // orbs, pickups, meteors
  add(new THREE.MeshBasicMaterial({ transparent: true, depthTest: false }));             // hp bar bg
  add(new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, toneMapped: false })); // hp bar fill
  add(new THREE.MeshStandardMaterial({ flatShading: true }));                            // rocks, pillars
  add(new THREE.MeshStandardMaterial({ emissive: 0x111111 }));                           // enemies
  renderer.compile(scene, camera);
}

// Switch preset at runtime (from the settings screen). Particle pool sizes stay as created.
export function applyQuality(level) {
  Object.assign(Q, QUALITY[level], { level });
  Q.budget = Q.particles; Q.scale = 1;
  bloom.enabled = Q.bloom;
  if (sun.castShadow !== Q.shadows || sun.shadow.mapSize.x !== Q.shadowMap) {
    sun.castShadow = Q.shadows; sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
    sun.shadow.map?.dispose(); sun.shadow.map = null;
  }
  resize();
}

// Dynamic resolution: watch smoothed frame time; trade pixels for frames (only in 'auto').
const perf = { ema: 16.7, t: 0, frames: 0, fps: 60, acc: 0 };
export const perfStats = perf;
export function adaptResolution(rdtMs) {
  perf.ema += (rdtMs - perf.ema) * 0.05;
  perf.acc += rdtMs; perf.frames++;
  if (perf.acc >= 500) { perf.fps = Math.round((perf.frames * 1000) / perf.acc); perf.acc = 0; perf.frames = 0; }
  perf.t += rdtMs;
  if (S.quality !== 'auto' || perf.t < 1500) return;
  perf.t = 0;
  let s = Q.scale;
  if (perf.ema > 22 && s > 0.55) s = Math.max(0.55, s - 0.1);        // < ~45 fps: drop resolution
  else if (perf.ema < 14.5 && s < 1) s = Math.min(1, s + 0.05);       // headroom: creep back up
  if (s !== Q.scale) { Q.scale = s; resize(); }
  // still struggling at minimum resolution → shed the expensive passes
  if (s <= 0.55 && perf.ema > 26) { if (bloom.enabled) bloom.enabled = false; else if (sun.castShadow) { sun.castShadow = false; } Q.budget = Math.max(0.35, Q.budget - 0.15); }
}
