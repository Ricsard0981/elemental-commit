// Ribbons: shader-animated strips used for hair, capes and hand trails.
import * as THREE from 'three';
import { scene } from './engine.js';
import { damp } from './util.js';

// ---------------------------------------------------------------- ribbons (hair, cape, hand trails)
const RIB_V = `
  varying vec2 vUv; attribute float along; attribute float across;
  void main() { vUv = vec2(along, across); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIB_F = `
  uniform float uTime, uStyle, uAlpha; uniform vec3 uA, uB; varying vec2 vUv;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    float u = vUv.x, v = vUv.y; float a = 1.0; vec3 c = mix(uA, uB, u);
    if (uStyle < 0.5) {            // fire: flickering tongues
      float w = (1.0 - u) * (0.55 + 0.7 * n(vec2(u * 5.0 - uTime * 5.0, v * 2.0 + uTime)));
      a = smoothstep(w, w * 0.55, abs(v)); c *= 1.0 + (1.0 - u) * 1.2;
    } else if (uStyle < 1.5) {     // water: flowing bands
      float band = 0.5 + 0.5 * sin(u * 22.0 - uTime * 6.0 + v * 2.0);
      a = (1.0 - u * 0.8) * (0.35 + 0.65 * band) * smoothstep(1.0, 0.55, abs(v)); c = mix(c, vec3(1.0), band * 0.35);
    } else if (uStyle < 2.5) {     // earth: blocky stepped shards
      float s = floor(u * 7.0) / 7.0; float cut = step(abs(v), (1.0 - s) * (0.7 + 0.3 * h(vec2(s * 9.0, 1.0))));
      a = cut; c = mix(uA, uB, h(vec2(s * 5.0, 3.0))) * (0.8 + 0.4 * (1.0 - s));
    } else {                        // air: thin streaming lines
      float ln = smoothstep(0.12, 0.0, abs(fract(v * 1.6 + 0.5 + 0.1 * sin(u * 8.0 - uTime * 7.0)) - 0.5) - 0.18);
      a = ln * (1.0 - u) * smoothstep(1.0, 0.6, abs(v)); c *= 1.4;
    }
    gl_FragColor = vec4(c, a * uAlpha * (1.0 - u * u));
  }`;
const ribMats = {};
function ribbonMaterial(style, colA, colB, alpha = 1) {
  const additive = style !== 2;
  const m = new THREE.ShaderMaterial({ name: 'ribbon',
    uniforms: { uTime: { value: 0 }, uStyle: { value: style }, uAlpha: { value: alpha }, uA: { value: new THREE.Color(colA) }, uB: { value: new THREE.Color(colB) } },
    vertexShader: RIB_V, fragmentShader: RIB_F, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
  });
  m.toneMapped = false; ribMats[style + (additive ? 'a' : 'n')] = m;
  return m;
}

export class Ribbon {
  constructor(n, width, style, colA, colB, { alpha = 1, z = 0.15 } = {}) {
    this.n = n; this.width = width; this.z = z;
    this.pts = Array.from({ length: n }, () => new THREE.Vector2());
    const pos = new Float32Array(n * 2 * 3), along = new Float32Array(n * 2), across = new Float32Array(n * 2), idx = [];
    for (let i = 0; i < n; i++) {
      along[i * 2] = along[i * 2 + 1] = i / (n - 1); across[i * 2] = -1; across[i * 2 + 1] = 1;
      if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('along', new THREE.BufferAttribute(along, 1)); g.setAttribute('across', new THREE.BufferAttribute(across, 1));
    g.setIndex(idx);
    this.mat = ribbonMaterial(style, colA, colB, alpha);
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 8;
    scene.add(this.mesh);
    this.snap = true; this.visible = true;
  }
  // impulse for follow-through: pushes the chain forward, more towards the tip
  kick(dx, dy = 0) { for (let i = 1; i < this.n; i++) { const k = i / (this.n - 1); this.pts[i].x += dx * k; this.pts[i].y += dy * k; } }
  setAnchor(x, y) { if (this.snap) { for (const p of this.pts) p.set(x, y); this.snap = false; } this.pts[0].set(x, y); }
  // spring chain: each point trails the previous one
  follow(dt, dirx, seg, sag, wave, t, k = 16) {
    for (let i = 1; i < this.n; i++) {
      const a = this.pts[i - 1], p = this.pts[i];
      const tx = a.x + dirx * seg, ty = a.y - sag * seg + Math.sin(t * 7 + i * 0.9) * wave * seg * (i / this.n);
      p.x = damp(p.x, tx, k - i * 0.8, dt); p.y = damp(p.y, ty, k - i * 0.8, dt);
      const dx = p.x - a.x, dy = p.y - a.y, l = Math.hypot(dx, dy);
      if (l > seg * 1.6) { p.x = a.x + dx / l * seg * 1.6; p.y = a.y + dy / l * seg * 1.6; }
    }
  }
  upload(t) {
    const a = this.mesh.geometry.attributes.position.array, n = this.n;
    for (let i = 0; i < n; i++) {
      const p0 = this.pts[Math.max(0, i - 1)], p1 = this.pts[Math.min(n - 1, i + 1)];
      let tx = p1.x - p0.x, ty = p1.y - p0.y; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const w = this.width * (1 - (i / (n - 1)) * 0.65) * 0.5, nx = -ty * w, ny = tx * w, p = this.pts[i];
      const k = i * 6;
      a[k] = p.x + nx; a[k + 1] = p.y + ny; a[k + 2] = this.z; a[k + 3] = p.x - nx; a[k + 4] = p.y - ny; a[k + 5] = this.z;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mat.uniforms.uTime.value = t;
  }
  setVisible(v) { this.mesh.visible = v; }
  remove() { scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}

// hand trail: ring-buffer of world positions, only grows while active
export class Trail extends Ribbon {
  constructor(n, width, style, a, b) { super(n, width, style, a, b, { alpha: 1.1, z: 0.3 }); this.age = 0; this.hist = Array.from({ length: n }, () => ({ x: 0, y: 0 })); this.on = 0; this.fade = 0; }
  push(x, y, active, dt) {
    this.fade = damp(this.fade, active ? 1 : 0, active ? 30 : 9, dt);
    // sampled on TIME, not frames, so the trail is the same length in seconds at 30 or 165 fps
    this.acc = (this.acc || 0) + dt;
    if (this.acc >= 0.011 || !this.on) { this.acc = 0; for (let i = this.n - 1; i > 0; i--) { this.hist[i].x = this.hist[i - 1].x; this.hist[i].y = this.hist[i - 1].y; } }
    this.hist[0].x = x; this.hist[0].y = y;
    if (!this.on && active) for (const h of this.hist) { h.x = x; h.y = y; }
    this.on = active ? 1 : this.on;
    this.mesh.visible = this.fade > 0.03;
    this.mat.uniforms.uAlpha.value = this.fade;
    for (let i = 0; i < this.n; i++) this.pts[i].set(this.hist[i].x, this.hist[i].y);
    if (!active && this.fade < 0.03) this.on = 0;
  }
}

