// The elemental warriors: a realistic-proportion body (Quaternius, CC0) wearing a custom costume built in code:
// zone-painted cloth + glowing runes, bone-attached armour, a carved mask, elemental hair, cape, hand trails.
// Locomotion comes from the Quaternius animation library; combat poses are layered on top procedurally.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assets } from './assets.js';
import { toonMaterial, costumeMaterial, outlineMaterial, outlineHard, addOutline } from './toon.js';
import { Animator } from './animator.js';
import { Ribbon, Trail } from './ribbons.js';
import { Q, scene } from './engine.js';
import { G } from './state.js';
import { clamp, damp, lerp, rand, easeOut } from './util.js';

const ZERO = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _e = new THREE.Euler(), _qm = new THREE.Quaternion();

// fraction of each clip where the strike lands, so hitboxes and visuals line up
export const CLIP_PEAK = { Punch_Jab: 0.2, Punch_Cross: 0.23, Sword_Attack: 0.27 }; // measured: full-extension frame of the lead hand (peaks.mjs)
export function heroReady() { return !!assets.ok; }
const POOL = {};
export function clearHeroPool() { for (const k in POOL) { POOL[k].forEach((h) => h.dispose()); POOL[k] = []; } }
export function acquireHero(key, el) { const h = POOL[key]?.pop(); if (h) { h.reset(); return h; } return new Hero(key, el); }

// body + costume definition per element
const DEF = {
  fire: { body: 'm', height: 2.02, width: 1.04, style: 0, kit: [0.0, 0, 1, 1], pal: { a: 0x8a1410, b: 0x1c0b0a, trim: 0xe9a43a, armor: 0x2b2321 } },
  water: { body: 'f', height: 1.95, width: 1.0, style: 1, kit: [0.5, 0, 0, 0], pal: { a: 0x1d7ea3, b: 0x0b2a3d, trim: 0xd8f1ff, armor: 0xcfdde6 } },
  earth: { body: 'm', height: 2.1, width: 1.14, style: 2, kit: [1.0, 0, 1, 0], pal: { a: 0x75583a, b: 0x2b2116, trim: 0x8bd450, armor: 0x6d655b } },
  air: { body: 'f', height: 1.98, width: 0.97, style: 3, kit: [1.0, 0, 0, 0], pal: { a: 0xe9f3f6, b: 0x5d808d, trim: 0x7ff3d6, armor: 0xdfe8ee } },
};
// bind-pose zone landmarks (model space) per body
const ZONES = {
  m: { z1: [0.0, 0.5, 0.3, 1.03], z2: [1.5, 0.215, 0.465, 0.69] },
  f: { z1: [0.0, 0.49, 0.28, 1.0], z2: [1.46, 0.185, 0.395, 0.63] },
};

const box = new THREE.BoxGeometry(1, 1, 1), sph = new THREE.SphereGeometry(1, 14, 10), cone = new THREE.ConeGeometry(1, 1, 6), cyl = new THREE.CylinderGeometry(1, 1, 1, 12), oct = new THREE.OctahedronGeometry(1), ico = new THREE.IcosahedronGeometry(1, 0);
const dome = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
const torus = new THREE.TorusGeometry(1, 0.16, 6, 20);

export class Hero {
  constructor(key, el) {
    this.key = key; this.el = el;
    const def = this.def = DEF[key], src = assets[def.body];
    this.group = new THREE.Group();
    this.tilt = new THREE.Group(); this.group.add(this.tilt);
    this.pivot = new THREE.Group(); this.tilt.add(this.pivot);
    const model = this.model = SkeletonUtils.clone(src.scene);
    this.pivot.add(model);
    // scale to the target height (bodies are 1.81 / 1.77 m tall)
    const bodyH = def.body === 'm' ? 1.81 : 1.77;
    this.s = def.height / bodyH;
    this.pivot.scale.set(this.s * def.width, this.s, this.s * def.width);
    model.updateMatrixWorld(true);
    const bones = this.bones = {};
    model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    this.buildMaterials();
    const skinned = [];
    model.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
    this.ink = Q.outlines ? outlineMaterial({ thick: 0.012 }) : null;
    this.bodyMesh = skinned[0]; this.inkParts = Q.outlines ? outlineMaterial({ thick: 0.009 }) : null;
    for (const o of skinned) {
      o.material = this.mat; o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
      if (this.ink) addOutline(o, this.ink);
    }
    this.parts = [];
    this.buildCostume(); this.bakeCostume();
    model.rotation.y = Math.PI / 2; // glTF faces +Z, the game faces +X
    // animation
    this.an = new Animator(model, assets.anims);
    this.an.play('Idle_Loop', { fade: 0 });
    this.hands = [bones.hand_l, bones.hand_r];
    const c = el.color, c2 = el.color2, style = { fire: 0, water: 1, earth: 2, air: 3 }[key];
    const N = Q.ribbonN;
    this.hair = N >= 2 ? this.buildHair(N, style, c, c2) : [];
    this.cape = N >= 2 ? new Ribbon(N + 2, key === 'air' ? 0.55 : 0.46, style, key === 'earth' ? 0x6b5a3a : c, c2, { alpha: 0.92, z: -0.12 }) : null;
    this.trails = Q.trailN > 0 ? this.hands.map(() => new Trail(Q.trailN, 0.24, style, c2, c)) : [];
    this.palms = [];
    for (const h of this.hands) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(c2).multiplyScalar(2.6), toneMapped: false }));
      m.position.set(0.0, 0.0, 0.0); h.add(m); this.palms.push(m);
    }
    if (key === 'earth') {
      this.shards = [];
      for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15 + (i % 2) * 0.06, 0), toonMaterial({ color: 0xb08a58, rim: c2, rimK: 0.5 }));
        m.castShadow = true; m.userData.ph = i * 1.26; scene.add(m); this.shards.push(m);
      }
    }
    this.cur = {}; this.tgt = {}; this.pelY = 0; this.spin = 0; this.spinC = 0; this.dive = 0;
    this.landT = 0; this.wasGround = true; this._atk = null; this._cast = -1; this._hurt = 0; this.lean = 0; this.t = rand(10);
  }

  // ---------------------------------------------------------------- materials
  buildMaterials() {
    const { def, el } = this, z = ZONES[def.body], p = def.pal;
    const map = this.model.getObjectByProperty('isSkinnedMesh', true)?.material?.map ?? null;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    this.mat = costumeMaterial({ map, rim: el.color2, rimK: 0.75, zones: z, kit: def.kit, style: def.style, colors: { a: p.a, b: p.b, trim: p.trim, glow: el.color2 } });
    this.armor = toonMaterial({ color: p.armor, rim: el.color2, rimK: 0.7 });
    this.trimM = toonMaterial({ color: p.trim, emissive: el.color, emissiveIntensity: 0.55, rim: el.color2, rimK: 0.5 });
    this.clothM = toonMaterial({ color: p.a, rim: el.color2, rimK: 0.5 });
    this.darkM = toonMaterial({ color: p.b, rim: el.color2, rimK: 0.5 });
    this.glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(el.color2).multiplyScalar(2.8), toneMapped: false });
    this.glowM2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(el.color).multiplyScalar(2.4), toneMapped: false });
  }

  // ---------------------------------------------------------------- costume (authored in T-pose model space, then bolted to bones)
  J(name) { return this.model.worldToLocal(this.bones[name].getWorldPosition(new THREE.Vector3())); }
  // Costume pieces are authored in T-pose model space, then baked into a few skinned meshes (one per material),
  // each vertex rigidly weighted to its bone, so the whole outfit costs a handful of draw calls.
  part(bone, geo, mat, [x, y, z], [sx, sy, sz] = [1, 1, 1], [rx, ry, rz] = [0, 0, 0]) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, ry, rz); o.updateMatrix();
    this.parts.push({ geo, mat, bone, matrix: o.matrix.clone() });
    return o;
  }
  bakeCostume() {
    const body = this.bodyMesh, skel = body.skeleton, byMat = new Map();
    for (const p of this.parts) {
      let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      g.applyMatrix4(p.matrix);
      const n = g.attributes.position.count, bi = skel.bones.findIndex((b) => b.name === p.bone);
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      if (!byMat.has(p.mat)) byMat.set(p.mat, []);
      byMat.get(p.mat).push(g);
    }
    this.costumeMeshes = [];
    for (const [mat, list] of byMat) {
      const geo = mergeGeometries(list, false);
      const m = new THREE.SkinnedMesh(geo, mat);
      m.bind(skel, body.bindMatrix); m.frustumCulled = false; m.castShadow = true;
      body.parent.add(m); this.costumeMeshes.push(m);
      if (this.ink && mat !== this.glowM && mat !== this.glowM2) addOutline(m, this.inkParts);
    }
    this.parts = [];
  }
  both(fn) { fn(1, '_l'); fn(-1, '_r'); } // +x is the character's left in the bind pose
  buildCostume() {
    const k = this.def.body === 'm' ? 1 : 0.97;
    const j = (n) => this.J(n);
    const hand = j('hand_l'), elbow = j('lowerarm_l'), shoulder = j('upperarm_l');
    const knee = j('calf_l'), ankle = j('foot_l'), pelvis = j('pelvis'), head = j('Head'), chest = j('spine_03');
    const kit = { fire: this.fireKit, water: this.waterKit, earth: this.earthKit, air: this.airKit }[this.key];
    // shared: belt + emblem, bracers, greaves
    const beltY = pelvis.y + 0.1;
    this.part('pelvis', torus, this.armor, [0, beltY, 0.0], [0.17 * k, 0.17 * k, 0.12 * k], [Math.PI / 2, 0, 0]).scale.set(0.185 * k, 0.13 * k, 0.17 * k);
    this.part('pelvis', oct, this.glowM, [0, beltY, 0.135 * k], [0.04, 0.05, 0.02], [0, 0, 0], false);
    this.both((s, sf) => {
      const mid = elbow.clone().lerp(hand, 0.5);
      this.part('lowerarm' + sf, cyl, this.armor, [s * mid.x, mid.y, mid.z], [0.058 * k, 0.15, 0.058 * k], [0, 0, Math.PI / 2]);
      this.part('lowerarm' + sf, torus, this.trimM, [s * (mid.x - 0.075), mid.y, mid.z], [0.06 * k, 0.06 * k, 0.06 * k], [0, Math.PI / 2, 0], false);
      const cm = knee.clone().lerp(ankle, 0.42);
      this.part('calf' + sf, cyl, this.armor, [s * cm.x, cm.y, cm.z - 0.005], [0.07 * k, 0.17, 0.075 * k]);
      this.part('calf' + sf, torus, this.trimM, [s * cm.x, cm.y + 0.17, cm.z], [0.075 * k, 0.075 * k, 0.075 * k], [Math.PI / 2, 0, 0], false);
    });
    kit.call(this, { k, hand, elbow, shoulder, knee, ankle, pelvis, head, chest, beltY });
    this.buildMask(head);
  }
  fireKit({ k, shoulder, chest, beltY, head }) {
    // asymmetric horned pauldron on the left, spiked bracer-plate on the right, crossed ember strap, flame tassets
    this.both((s, sf) => {
      const big = s > 0 ? 1.0 : 0.78;
      this.part('upperarm' + sf, dome, this.armor, [s * (shoulder.x + 0.015), shoulder.y + 0.045, shoulder.z], [0.12 * big * k, 0.1 * big * k, 0.12 * big * k], [0, 0, -s * 0.18]);
      this.part('upperarm' + sf, torus, this.trimM, [s * (shoulder.x + 0.015), shoulder.y + 0.03, shoulder.z], [0.115 * big * k, 0.115 * big * k, 0.115 * big * k], [Math.PI / 2, 0, 0], false);
      for (let i = 0; i < (s > 0 ? 3 : 2); i++) this.part('upperarm' + sf, cone, this.trimM, [s * (shoulder.x + 0.03 + i * 0.05), shoulder.y + 0.11 - i * 0.012, shoulder.z + (i - 1) * 0.04], [0.025, 0.12 + (s > 0 ? 0.04 : 0) - i * 0.01, 0.025], [0, 0, -s * (0.55 + i * 0.25)], false);
      // tassets
      this.part('pelvis', box, this.clothM, [s * 0.1 * k, beltY - 0.17, 0.13 * k], [0.095 * k, 0.2, 0.012], [-0.08, 0, s * 0.06]);
    });
    this.part('spine_03', box, this.armor, [0, chest.y + 0.01, 0.125 * k], [0.03, 0.34, 0.012], [0, 0, 0.62]); // crossed strap
    this.part('spine_03', oct, this.glowM, [-0.03 * k, chest.y + 0.03, 0.14 * k], [0.04, 0.055, 0.02], [0, 0, 0], false);
    this.part('pelvis', box, this.clothM, [0, beltY - 0.2, 0.15 * k], [0.14 * k, 0.28, 0.012], [-0.06, 0, 0]);
    this.part('pelvis', box, this.clothM, [0, beltY - 0.2, -0.13 * k], [0.2 * k, 0.32, 0.012], [0.06, 0, 0]);
  }
  waterKit({ k, shoulder, chest, beltY, head }) {
    // flowing drapes and pearl fins: lighter armour, long hip sashes
    this.both((s, sf) => {
      this.part('upperarm' + sf, dome, this.armor, [s * (shoulder.x + 0.01), shoulder.y + 0.04, shoulder.z], [0.085 * k, 0.07 * k, 0.085 * k], [0, 0, -s * 0.2]);
      for (let i = 0; i < 3; i++) this.part('upperarm' + sf, cone, this.trimM, [s * (shoulder.x + 0.02), shoulder.y + 0.07 + i * 0.03, shoulder.z - 0.04 - i * 0.04], [0.02, 0.15 - i * 0.025, 0.02], [-0.8 - i * 0.2, 0, -s * 0.3], false);
      this.part('pelvis', box, this.clothM, [s * 0.14 * k, beltY - 0.28, 0.02], [0.012, 0.42, 0.2 * k], [0, 0, s * 0.12]);
      this.part('pelvis', torus, this.trimM, [s * 0.14 * k, beltY, 0.0], [0.05, 0.05, 0.05], [0, Math.PI / 2, 0], false);
    });
    this.part('spine_03', box, this.armor, [0, chest.y + 0.1, 0.1 * k], [0.15 * k, 0.03, 0.02], [0, 0, 0]);
    this.part('pelvis', box, this.clothM, [0, beltY - 0.3, 0.14 * k], [0.12 * k, 0.4, 0.01], [-0.04, 0, 0]);
    this.part('pelvis', box, this.clothM, [0, beltY - 0.32, -0.12 * k], [0.2 * k, 0.44, 0.01], [0.06, 0, 0]);
  }
  earthKit({ k, shoulder, chest, beltY, head }) {
    // heavy stone: big pauldrons with rock chunks, cracked chest plate, slab belt
    this.both((s, sf) => {
      this.part('upperarm' + sf, dome, this.armor, [s * (shoulder.x + 0.01), shoulder.y + 0.05, shoulder.z], [0.17 * k, 0.14 * k, 0.17 * k], [0, 0, -s * 0.15]);
      this.part('upperarm' + sf, ico, this.armor, [s * (shoulder.x + 0.03), shoulder.y + 0.15, shoulder.z + 0.02], [0.08, 0.1, 0.08], [0.3, 0.5, 0.2]);
      this.part('upperarm' + sf, ico, this.armor, [s * (shoulder.x - 0.04), shoulder.y + 0.13, shoulder.z - 0.06], [0.055, 0.07, 0.055], [0.7, 0.1, 0.4]);
      this.part('upperarm' + sf, torus, this.trimM, [s * (shoulder.x + 0.01), shoulder.y + 0.02, shoulder.z], [0.165 * k, 0.165 * k, 0.165 * k], [Math.PI / 2, 0, 0], false);
      this.part('pelvis', box, this.armor, [s * 0.12 * k, beltY - 0.12, 0.12 * k], [0.1 * k, 0.18, 0.03], [-0.05, 0, s * 0.05]);
    });
    this.part('spine_03', box, this.armor, [0, chest.y - 0.02, 0.115 * k], [0.18 * k, 0.24, 0.05]);
    this.part('spine_03', box, this.glowM, [0.01, chest.y - 0.02, 0.143 * k], [0.008, 0.2, 0.004], [0, 0, 0.25], false);
    this.part('spine_03', box, this.glowM, [-0.05, chest.y + 0.03, 0.143 * k], [0.006, 0.12, 0.004], [0, 0, -0.5], false);
    this.part('pelvis', box, this.armor, [0, beltY - 0.15, 0.14 * k], [0.1 * k, 0.24, 0.03]);
    // big gauntlets
    this.both((s, sf) => this.part('hand' + sf, box, this.armor, [s * (this.J('hand_l').x + 0.03), this.J('hand_l').y, this.J('hand_l').z], [0.065, 0.075 * k, 0.07 * k]));
  }
  airKit({ k, shoulder, chest, beltY, head }) {
    // feather pauldrons, light wrap strap, wing fins at the ankles, sash
    this.both((s, sf) => {
      for (let i = 0; i < 4; i++) this.part('upperarm' + sf, cone, i % 2 ? this.trimM : this.armor, [s * (shoulder.x + 0.0 + i * 0.012), shoulder.y + 0.07, shoulder.z - 0.02 - i * 0.025], [0.026, 0.19 - i * 0.025, 0.012], [-0.55 - i * 0.28, 0, -s * (0.35 + i * 0.1)], i === 0);
      this.part('upperarm' + sf, dome, this.armor, [s * (shoulder.x + 0.01), shoulder.y + 0.04, shoulder.z], [0.085 * k, 0.065 * k, 0.085 * k], [0, 0, -s * 0.2]);
      const an = this.J('foot_l');
      for (let i = 0; i < 2; i++) this.part('foot' + sf, cone, this.trimM, [s * an.x, an.y + 0.07, an.z - 0.07 - i * 0.03], [0.03, 0.15, 0.012], [-1.2, 0, 0], false);
      this.part('pelvis', box, this.clothM, [s * 0.1 * k, beltY - 0.12, 0.12 * k], [0.04 * k, 0.24, 0.01], [-0.06, 0, s * 0.1]);
    });
    this.part('spine_03', box, this.armor, [0, chest.y, 0.115 * k], [0.028, 0.34, 0.012], [0, 0, -0.62]);
    this.part('spine_03', oct, this.glowM, [0.03 * k, chest.y + 0.04, 0.13 * k], [0.035, 0.05, 0.02], [0, 0, 0], false);
  }

  // ---------------------------------------------------------------- mask + hair
  buildMask(head) {
    // The head: a hair cap, a carved half-mask that wraps round to the cheeks (so it reads in profile), a glowing eye slit and
    // a per-element crown. Coordinates are T-pose model space; the head joint sits at the base of the skull.
    const c = this.el.color, c2 = this.el.color2, pal = this.def.pal;
    const hairCol = { fire: 0x2a0e0a, water: 0x0f3a52, earth: 0x2b1d12, air: 0xdfe9f0 }[this.key];
    const hairM = toonMaterial({ color: hairCol, rim: c2, rimK: 0.7 });
    const bone = toonMaterial({ color: this.key === 'earth' ? 0xc9c0a8 : 0xece4d2, rim: c2, rimK: 0.6 });
    const f = this.def.body === 'm' ? 1 : 0.96;
    const cy = head.y + 0.095 * f, cz = head.z + 0.014;
    // hair cap
    this.part('Head', new THREE.SphereGeometry(1, 22, 14, 0, Math.PI * 2, 0, 1.4), hairM, [0, cy, cz - 0.004], [0.091 * f, 0.121 * f, 0.105 * f]);
    // mask shell: spans about 230 degrees around the face so the near cheek is covered in side view
    this.part('Head', new THREE.SphereGeometry(1, 24, 14, Math.PI / 2 - 1.2, 2.4, 1.02, 0.95), bone, [0, cy - 0.003, cz], [0.094 * f, 0.124 * f, 0.108 * f]);
    this.part('Head', box, this.armor, [0, cy + 0.058 * f, cz + 0.104 * f], [0.082 * f, 0.011, 0.016]);               // brow ridge
    this.part('Head', cone, bone, [0, cy - 0.028 * f, cz + 0.114 * f], [0.016, 0.07 * f, 0.026], [Math.PI, 0, 0]);   // nose guard (reads in profile)
    for (const s2 of [-1, 1]) {
      this.part('Head', box, this.glowM, [s2 * 0.04 * f, cy + 0.016 * f, cz + 0.107 * f], [0.03 * f, 0.008, 0.01], [0, 0, s2 * -0.28]); // eye slit
      this.part('Head', box, this.glowM, [s2 * 0.091 * f, cy + 0.016 * f, cz + 0.06 * f], [0.006, 0.008, 0.03 * f], [0, 0, 0]);          // slit seen from the side
      this.part('Head', box, this.trimM, [s2 * 0.093 * f, cy - 0.025 * f, cz + 0.05 * f], [0.006, 0.012, 0.05 * f], [0, 0, 0]);          // cheek line
    }
    // per-element crown
    const top = cy + 0.118 * f;
    if (this.key === 'fire') for (let i = 0; i < 5; i++) this.part('Head', cone, this.trimM, [0, top - 0.005 - i * 0.002, cz + 0.06 - i * 0.034], [0.015, 0.11 + (i === 2 ? 0.05 : 0), 0.015], [-0.2 - i * 0.18, 0, 0]);
    if (this.key === 'earth') { for (let i = -1; i <= 1; i++) this.part('Head', ico, this.armor, [i * 0.05, top - 0.01, cz - 0.01], [0.03, 0.05 - Math.abs(i) * 0.012, 0.03], [0.2, i, 0]); this.part('Head', box, this.armor, [0, cy + 0.064 * f, cz + 0.05], [0.112 * f, 0.016, 0.07]); }
    if (this.key === 'water') for (const s2 of [-1, 1]) { this.part('Head', cone, this.trimM, [s2 * 0.105 * f, cy + 0.03, cz - 0.02], [0.016, 0.14, 0.008], [-0.5, 0, -s2 * 1.15]); this.part('Head', sph, this.glowM, [s2 * 0.107 * f, cy - 0.01, cz + 0.02], [0.014, 0.014, 0.014]); }
    if (this.key === 'air') for (const s2 of [-1, 1]) for (let i = 0; i < 3; i++) this.part('Head', cone, i % 2 ? this.trimM : bone, [s2 * 0.1 * f, cy + 0.03 + i * 0.022, cz - 0.03 - i * 0.02], [0.012, 0.11 - i * 0.02, 0.006], [-0.5 - i * 0.3, 0, -s2 * (1.0 + i * 0.2)]);
  }
  buildHair(N, style, c, c2) {
    const k = this.key;
    const specs = {
      fire: [[0.2], [0.17], [0.14]],
      water: [[0.27], [0.2]],
      earth: [],
      air: [[0.3], [0.2]],
    }[k];
    return specs.map(([w], i) => new Ribbon(N, w, style, c, c2, { alpha: 0.6, z: 0.05 + i * 0.03 }));
  }

  // ---------------------------------------------------------------- procedural combat layers
  // deltas are expressed in the model frame: X = sideways (pitch), Y = up (twist), Z = forward (lean). Positive pitch tips the
  // upper end forwards for the spine, and swings a hanging limb BACKWARDS, so limb values below are negated for "forward".
  rot(name, px, py = 0, pz = 0) { const c = this.tgt[name] || (this.tgt[name] = new THREE.Vector3()); c.set(px, py, pz); if (!this.cur[name]) this.cur[name] = new THREE.Vector3(); }
  kick(dir, k) { for (const r of [...this.hair, this.cape]) r?.kick(dir * k, k * 0.2); }
  applyOverlay(dt) {
    const m = this.model;
    m.getWorldQuaternion(_qm);
    // pelvis height offset
    if (this.bones.pelvis) this.bones.pelvis.position.y += this.pelY / this.s;
    const order = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r'];
    for (const n of order) {
      const d = this.cur[n]; if (!d || (d.x === 0 && d.y === 0 && d.z === 0)) continue;
      const b = this.bones[n]; b.parent.updateWorldMatrix(true, false);
      b.parent.getWorldQuaternion(_q);
      _e.set(d.x, d.y, d.z, 'YXZ'); _q2.setFromEuler(_e);
      // world delta = qm * delta * qm^-1
      _q3.copy(_qm).multiply(_q2).multiply(_qm.clone().invert());
      b.quaternion.premultiply(_q.clone().invert().multiply(_q3).multiply(_q)).normalize();
      b.updateMatrixWorld(true);
    }
  }
  // choose the layer for the current move (angles in radians)
  pose(p, dt) {
    const T = (n, x, y, z) => this.rot(n, x, y, z);
    for (const n in this.tgt) this.tgt[n].set(0, 0, 0);
    let pelY = 0, spin = 0, dive = 0;
    const a = p.atk, st = p.state;
    const arms = (r, l, rl, ll) => { T('upperarm_r', -r); T('upperarm_l', -l); T('lowerarm_r', -rl); T('lowerarm_l', -ll); };
    if (st === 'attack' && a) {
      const wind = clamp(a.t / Math.max(0.01, a.hitAt), 0, 1), sw = easeOut(clamp((a.t - a.hitAt) / Math.max(0.05, a.dur * 0.5), 0, 1)), fade = 1 - clamp((a.t - a.hitAt) / Math.max(0.08, a.dur - a.hitAt), 0, 1) * 0.6;
      const w = wind * (a.t < a.hitAt ? 1 : 1 - sw * 0.0);
      if (a.kind === 'launcher') {
        pelY = -0.22 * w * (1 - sw); T('spine_01', 0.3 * w - 0.55 * sw); T('spine_02', 0.25 * w - 0.35 * sw); T('Head', -0.15 * w + 0.25 * sw);
        arms(-1.0 * w + 3.0 * sw * fade, 0.6 * w, 1.5 * w, 1.6);
        T('thigh_r', 0.5 * w); T('thigh_l', -0.7 * w); T('calf_r', -0.7 * w);
      } else if (a.kind === 'air') {
        const i = a.i, f = i === 2 ? 1 : 0.7;
        T('spine_01', (0.15 + 0.2 * sw) * f); T('spine_02', 0.2 * f); spin = i === 2 ? easeOut(clamp(a.t / a.dur, 0, 1)) * Math.PI * 2 * 0.9 : (i === 0 ? sw * 0.5 : -sw * 0.5);
        arms(2.4 * (1 - sw) * w + (-0.3) * sw, 1.2, 1.2 + sw, 0.5);
        T('thigh_r', -0.9); T('thigh_l', -0.3); T('calf_r', 1.4); T('calf_l', 0.9); pelY = 0.05;
      } else if (a.kind === 'slam') {
        const dv = a.landed ? 0 : clamp((a.t - a.hitAt) * 8, 0, 1);
        arms(-2.6 * (1 - dv) * 0 + 2.7 * (1 - dv) + (-0.4) * dv, 2.7 * (1 - dv), 0.4, 0.4);
        T('spine_01', 0.5 * dv + (a.landed ? 0.6 : 0)); T('spine_02', 0.3 * dv); T('Head', -0.3 * dv);
        T('thigh_r', -0.4 * dv); T('thigh_l', 0.3 * dv); dive = dv * 1.0;
        if (a.landed) pelY = -0.35 * (1 - clamp((a.t - a.hitAt) / 0.3, 0, 1));
      } else { // ground combo: lunge, twist, big arm arcs; each element moves differently
        const hit = a.i;
        const el = this.key;
        const lunge = el === 'earth' ? 0.35 : el === 'air' ? 0.7 : 0.5;
        T('spine_01', (el === 'earth' ? 0.35 : 0.25) * w - 0.35 * sw); T('spine_02', 0.2 * w - 0.3 * sw);
        T('thigh_r', -lunge * w * (1 - sw)); T('thigh_l', 0.4 * w * (1 - sw)); pelY = -0.07 * w * (1 - sw);
        if (hit === 2) { spin = el === 'air' || el === 'water' ? easeOut(clamp(a.t / a.dur, 0, 1)) * Math.PI * 2 : 0; T('spine_03', -0.4 * sw); }
        if (el === 'water') T('spine_02', 0.2 * w - 0.3 * sw, (hit % 2 ? -1 : 1) * 0.5 * (sw - w));
      }
    } else if (p.guarding) {
      arms(1.35, 1.3, 1.9, 1.9); T('spine_01', 0.15); T('Head', 0.05); T('thigh_r', -0.35); T('thigh_l', 0.35); T('calf_r', 0.4); pelY = -0.09;
    } else if (st === 'cast') {
      const k = clamp(p.castT / 0.14, 0, 1);
      if (p.castSlot === 'ranged') { arms(1.45 * k, 0.6 * k, 0.15, 0.5); T('spine_01', 0.1 * k); }
      else { arms(2.9 * k, 2.8 * k, 0.1, 0.1); T('spine_01', -0.12 * k); T('Head', -0.2 * k); pelY = -0.04 * k; }
    } else if (st === 'dash') {
      T('spine_01', 0.5); T('spine_02', 0.2); arms(-1.2, -1.0, 0.6, 0.6); T('thigh_r', -0.9); T('thigh_l', 0.8);
    }
    // pose deltas ease in fast and ease OUT slower, so cancelling a move never pops the arms / torso
    for (const n in this.cur) { const c = this.cur[n], t = this.tgt[n]; const k = t && t.lengthSq() >= c.lengthSq() ? 34 : 15; c.lerp(t || ZERO, 1 - Math.exp(-k * dt)); }
    this.pelY = damp(this.pelY, pelY, 20, dt); this.dive = damp(this.dive, dive, 18, dt);
    // spins: a big spin finishes its turn forward instead of unwinding backwards; small angles just ease out
    if (spin !== 0) this.spinC = spin;
    else if (this.spinC > 1.2) { this.spinC += dt * 16; if (this.spinC >= Math.PI * 2 - 0.05) this.spinC = 0; }
    else this.spinC = damp(this.spinC, 0, 14, dt);
    this.spin = this.spinC;
  }

  // ---------------------------------------------------------------- per-frame
  warm() {
    this.group.updateMatrixWorld(true);
    for (const r of [...this.hair, this.cape].filter(Boolean)) { r.setAnchor(0, 1.6); r.follow(0.05, -1, 0.3, 0.3, 0.5, 0); r.upload(0); r.setVisible(true); }
    this.trails.forEach((t, i) => { for (let k = 0; k < t.n; k++) t.pts[k].set(-0.5 + k * 0.1, 1 + i * 0.2); t.upload(0); t.setVisible(true); t.mat.uniforms.uAlpha.value = 1; });
    this.shards?.forEach((m) => m.position.set(0.5, 1.2, 0));
  }
  hideAll() { this.hair.forEach((r) => r.setVisible(false)); this.cape?.setVisible(false); this.trails.forEach((t) => t.setVisible(false)); this.shards?.forEach((m) => (m.visible = false)); }
  reset() {
    this.hair.forEach((r) => (r.snap = true)); if (this.cape) this.cape.snap = true; this.an.play('Idle_Loop', { fade: 0, force: true });
    this._atk = null; this._hurt = 0; this._cast = -1; this._dash = false; this.wasGround = true; this.landT = 0; this.lean = 0; this.spin = 0; this.spinC = 0; this.dive = 0; this.pelY = 0;
    for (const n in this.cur) { this.cur[n].set(0, 0, 0); this.tgt[n]?.set(0, 0, 0); }
    this.trails.forEach((t) => { t.on = 0; t.fade = 0; t.setVisible(false); }); this.group.visible = true;
  }
  setImbue(im) {
    const c = im ? im.color : this.el.color;
    this.trails?.forEach((t) => t.mat.uniforms.uB.value.set(c));
    if (this.palms && this.palms[1]) this.palms[1].material = new THREE.MeshBasicMaterial({ color: new THREE.Color(im ? im.color : this.el.color2).multiplyScalar(2.6), toneMapped: false });
  }
  setGuardTint(on) { /* costume is a shader: guard feedback comes from the shield + pose */ }
  playAttack(name, hitAt) {
    if (!this.an.has(name)) return;
    // contact sync: the clip's strike moment (peak × length) must land exactly on hitAt. Speed is capped (fast moves would
    // look like a blur), and when the cap bites we start part-way into the clip instead, skipping the slow wind-up.
    const d = this.an.dur(name), tp = d * (CLIP_PEAK[name] ?? 0.38);
    const speed = clamp(tp / Math.max(0.04, hitAt), 0.9, 2.4);
    this.an.play(name, { fade: 0.05, speed, loop: false, force: true, from: Math.max(0, tp - hitAt * speed) });
  }
  update(dt, p) {
    this.t += dt;
    const an = this.an, st = p.state, airborne = !p.onGround;
    if (p.cheering) an.play('Dance_Loop', { fade: 0.15 });
    else if (p.dead) an.play('Death01', { loop: false, fade: 0.1, speed: 1.6 });
    else if (p.atk && p.atk !== this._atk) { this._atk = p.atk; if (p.atk.kind === 'slam') an.play('Jump_Loop', { fade: 0.05 }); else this.playAttack(p.atk.clip, p.atk.hitAt); }
    else if (!p.atk) this._atk = null;
    if (!p.dead && !p.cheering) {
      if (st === 'attack' && p.atk) { /* hold the move */ }
      else if (p.castSeq !== this._cast && st === 'cast') {
        this._cast = p.castSeq;
        an.play(p.castSlot === 'ranged' ? 'Spell_Simple_Shoot' : 'Spell_Simple_Enter', { fade: 0.06, speed: p.castSlot === 'ranged' ? 1.6 : 1.3, loop: false, force: true });
      } else if (st === 'cast') { /* hold */ }
      else if (p.stun > 0) { if (!this._hurt) an.play('Hit_Chest', { fade: 0.03, speed: 1.1, loop: false, force: true }); this._hurt = 1; }
      else if (st === 'dash') { if (!this._dash) an.play('Roll', { fade: 0.04, speed: 4.5, loop: false, force: true }); this._dash = true; }
      else if (p.guarding) an.play('Idle_Loop', { fade: 0.08, speed: 1.2 });
      else if (airborne) {
        if (this.wasGround) an.play(p.vy > 2 ? 'Jump_Start' : 'Jump_Loop', { fade: 0.05, loop: p.vy <= 2, speed: p.vy > 2 ? 2.2 : 1 });
        else if (an.curName === 'Jump_Start' && an.cur.time > 0.5) an.play('Jump_Loop', { fade: 0.12 });
        else if (p.vy < -2 && an.curName !== 'Jump_Loop' && an.curName !== 'Jump_Start') an.play('Jump_Loop', { fade: 0.1 });
      } else if (this.landT > 0) { /* landing */ }
      else if (Math.abs(p.vx) > 1.2 && (p.moveIntent || p.vx * p.facing > 0)) an.play(Math.abs(p.vx) > 7.5 ? 'Sprint_Loop' : 'Jog_Fwd_Loop', { fade: 0.1, speed: clamp(Math.abs(p.vx) / (Math.abs(p.vx) > 7.5 ? 8.5 : 5.5), 0.45, 1.5) });
      else an.play('Idle_Loop', { fade: 0.15 });
      if (st !== 'dash') this._dash = false;
      if (p.stun <= 0) this._hurt = 0;
      if (!this.wasGround && p.onGround && st === 'free' && Math.abs(p.vx) < 6.5) { this.landT = 0.14; an.play('Jump_Land', { fade: 0.05, speed: 2.2 + p.landK * 2.6, loop: false, force: true }); } // running landings stay in the run
      if (!p.onGround && this.landT > 0) this.landT = 0;
    }
    this.landT = Math.max(0, this.landT - dt);
    this.wasGround = p.onGround;
    an.update(dt);
    this.model.updateMatrixWorld(true);
    this.pose(p, dt);
    this.applyOverlay(dt);
    // whole-body layers: lean, spin, dive tilt, squash & stretch
    this.lean = damp(this.lean, p.leanT ?? 0, 14, dt);
    this.tilt.rotation.z = -(this.lean + this.dive * 0.9);
    this.pivot.rotation.y = this.spin;
    const gnd = p.onGround, stretch = !gnd && st !== 'dash' ? clamp(Math.abs(p.vy) / 40, 0, 0.14) : 0;
    const sy = 1 - p.squash * 0.45 + stretch, sxz = 1 + p.squash * 0.4 - stretch * 0.5;
    this.pivot.scale.set(this.s * this.def.width * sxz, this.s * sy, this.s * this.def.width * sxz);
    this.group.updateMatrixWorld(true);
    // ---- ribbons follow the posed skeleton
    const t = G.time, dirx = -p.facing;
    const head = this.bones.Head.getWorldPosition(_v);
    const base = Math.abs(p.vx) * 0.04;
    this.hair.forEach((r, i) => {
      r.setAnchor(head.x + dirx * 0.12, head.y + 0.17 - i * 0.06);
      const seg = this.key === 'air' ? 0.13 : 0.11, sag = this.key === 'air' ? 0.05 : this.key === 'water' ? 0.55 : -0.3 - i * 0.12;
      r.follow(dt, dirx * (1 + base), seg, sag + (p.vy < 0 ? -p.vy * 0.015 : 0), 0.9 + i * 0.4, t + i);
      r.upload(t);
    });
    const ch = this.bones.spine_03.getWorldPosition(_v2);
    if (this.cape) {
    this.cape.setAnchor(ch.x + dirx * 0.12, ch.y + 0.2);
    this.cape.follow(dt, dirx * (1 + base), 0.15, 0.55 + (p.vy < 0 ? -p.vy * 0.02 : 0) - Math.abs(p.vx) * 0.04, 0.5, t, 14);
    this.cape.upload(t);
    }
    const active = st === 'attack' || st === 'cast' || st === 'dash';
    this.trails.forEach((tr, i) => { this.hands[i].getWorldPosition(_v); tr.push(_v.x, _v.y, active, dt); tr.upload(t); });
    if (this.shards) this.shards.forEach((m) => {
      const a = t * 1.8 + m.userData.ph; m.position.set(p.x + Math.cos(a) * 1.0, p.y + 1.2 + Math.sin(a * 1.3) * 0.55, Math.sin(a) * 0.75);
      m.rotation.x += dt * 2.2; m.rotation.y += dt * 1.6; m.visible = this.group.visible;
    });
    const gv = this.group.visible;
    this.hair.forEach((r) => r.setVisible(gv)); this.cape?.setVisible(gv);
  }
  // heroes are pooled per element: building one (clone, costume bake, ribbons) and uploading its buffers costs a
  // visible stutter, so a released hero is hidden and handed back to the next run with the same element
  release() { this.group.removeFromParent(); this.hideAll(); this.setImbue(null); (POOL[this.key] ||= []).push(this); }
  dispose() {
    this.hair.forEach((r) => r.remove()); this.cape?.remove(); this.trails.forEach((r) => r.remove()); this.shards?.forEach((m) => scene.remove(m));
    // never dispose materials/programs: transient effects keep their shader cached
  }
}
