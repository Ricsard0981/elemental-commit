// Y2K streetwear outfits for the four heroes. Every hero is FACELESS: a blank mannequin head (the world corrupted their faces away), so the
// silhouette, the hair and the clothes carry the character:
//   fire  = a punk: studded leather jacket, tartan kilt, platform boots, a mohawk, chains
//   water = a raver: puffy cropped jacket, baggy cargo pants, headphones, twin buns, platform sneakers
//   earth = a skater: oversized hoodie, baggy jeans, beanie, backpack, chunky sneakers
//   air   = a roller kid: windbreaker with fins, goggles, spiky bleached hair, rollerblades
// Pieces are authored in T-pose model space and baked onto bones by Hero.bakeCostume() (one skinned mesh per material).
import * as THREE from 'three';
import { toonMaterial } from './toon.js';

const box = new THREE.BoxGeometry(1, 1, 1), sph = new THREE.SphereGeometry(1, 14, 10), cone = new THREE.ConeGeometry(1, 1, 6), cyl = new THREE.CylinderGeometry(1, 1, 1, 12), oct = new THREE.OctahedronGeometry(1);
const domeG = new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, 1.75), torus = new THREE.TorusGeometry(1, 0.16, 6, 20), kilt = new THREE.CylinderGeometry(1, 1.38, 1, 18, 1, true), ico = new THREE.IcosahedronGeometry(1, 0);

const PAL = {
  fire: { jacket: 0x2b4c8c, accent: 0xff2e93, kilt: 0x8f845e, face: 0x07060d, hairA: 0xff4a1c, hairB: 0xffd23a, boot: 0xf2ece4, sole: 0xff7a1a, chrome: 0xdfe6ff, extra: 0xc6ff3d, helmet: 0xe9e2d6, wood: 0xb0834f },
  water: { jacket: 0x2ad4e8, accent: 0xffffff, kilt: 0xa9c0d6, face: 0xf4f1fb, hairA: 0x19e3ff, hairB: 0xff2e93, boot: 0xf4f6ff, sole: 0x19e3ff, chrome: 0xdfe6ff, extra: 0xff2e93 },
  earth: { jacket: 0xc9852f, accent: 0xc6ff3d, kilt: 0x3a5486, face: 0xe9dfd0, hairA: 0x2b2116, hairB: 0xc6ff3d, boot: 0xf2ece4, sole: 0xff7a1a, chrome: 0xdfe6ff, extra: 0x3b6a2a },
  air: { jacket: 0xe9f3f6, accent: 0x7ff3d6, kilt: 0xaab4c8, face: 0xf5f7fb, hairA: 0xffffff, hairB: 0x7ff3d6, boot: 0xe9f3f6, sole: 0xff2e93, chrome: 0xdfe6ff, extra: 0xffe14d },
};

export function makeOutfitMaterials(h) {
  const p = PAL[h.key], el = h.el, M = (color, rimK = 0.5, extra = {}) => toonMaterial({ color, rim: el.color2, rimK, ...extra });
  h.pal = p;
  h.o = {
    jacket: M(p.jacket, 0.7), accent: M(p.accent, 0.5, { emissive: p.accent, emissiveIntensity: 0.25 }), kilt: M(p.kilt, 0.5), face: M(p.face, 0.9), hairA: M(p.hairA, 0.7, { emissive: p.hairA, emissiveIntensity: 0.35 }), hairB: M(p.hairB, 0.7, { emissive: p.hairB, emissiveIntensity: 0.4 }),
    helmet: M(p.helmet || p.boot, 0.7), wood: M(p.wood || 0xb0834f, 0.5), black: M(0x15121b, 0.6),
    boot: M(p.boot, 0.6), sole: M(p.sole, 0.5, { emissive: p.sole, emissiveIntensity: 0.3 }), chrome: M(p.chrome, 1.0), extra: M(p.extra, 0.5, { emissive: p.extra, emissiveIntensity: 0.3 }),
  };
}

// the blank mannequin head shared by all four: a smooth shell over the face, no mask, no eyes
function blankHead(h, ctx) {
  const { head } = ctx, f = h.def.body === 'm' ? 1 : 0.96, o = h.o;
  const cy = head.y + 0.095 * f, cz = head.z + 0.014;
  h.part('Head', new THREE.SphereGeometry(1, 24, 16), o.face, [0, cy - 0.002, cz], [0.097 * f, 0.126 * f, 0.111 * f]);
  return { f, cy, cz, top: cy + 0.12 * f };
}
const mid = (a, b, t = 0.5) => a.clone().lerp(b, t);

const OUTFIT = {
  fire(h, c) {
    // THE FIRE-SKATER: a faceless punk skater. Void-black face under a cracked skate helmet, a flame mohawk, a patched denim vest with pins and
    // chains, baggy cargo pants, oversized 2000s skate shoes, and a graffiti deck strapped to his back (he rides it during Ignite Grind).
    const { k, hand, elbow, shoulder, knee, ankle, pelvis, head, chest, beltY } = c, o = h.o, H = blankHead(h, c);
    // --- vest: sleeveless denim over a black tee, ripped hem, patches, safety pins, a diagonal chain
    h.part('spine_03', box, o.jacket, [0, chest.y + 0.01, 0], [0.335 * k, 0.27, 0.225 * k]);
    h.part('pelvis', box, o.jacket, [0, beltY + 0.045, 0], [0.315 * k, 0.15, 0.215 * k]);
    h.part('spine_03', box, o.black, [0, chest.y + 0.01, 0.115 * k], [0.11 * k, 0.29, 0.008]);                         // tee showing through the open front
    for (let i = 0; i < 7; i++) h.part('pelvis', cone, o.jacket, [(i - 3) * 0.045 * k, beltY - 0.045 - (i % 2) * 0.012, 0.108 * k], [0.022, 0.05 + (i % 3) * 0.018, 0.01], [Math.PI, 0, (i - 3) * 0.08]); // ripped hem
    h.part('spine_03', box, o.accent, [-0.105 * k, chest.y + 0.055, 0.118 * k], [0.065, 0.065, 0.008], [0, 0, 0.18]);   // patches
    h.part('spine_03', oct, o.extra, [0.108 * k, chest.y + 0.01, 0.12 * k], [0.04, 0.04, 0.008], [0, 0, 0.3]);
    h.part('spine_03', box, o.hairB, [-0.1 * k, chest.y - 0.07, 0.118 * k], [0.05, 0.035, 0.008], [0, 0, -0.1]);
    h.part('spine_03', cyl, o.accent, [0, chest.y, -0.118 * k], [0.1, 0.01, 0.1], [Math.PI / 2, 0, 0]);                  // big back patch
    h.part('spine_03', oct, o.hairB, [0, chest.y, -0.126 * k], [0.05, 0.05, 0.008]);
    h.part('spine_03', box, o.extra, [0.09 * k, chest.y - 0.1, -0.12 * k], [0.06, 0.04, 0.008], [0, 0, 0.3]);
    for (let i = 0; i < 4; i++) { const sx = i % 2 ? 1 : -1; h.part('spine_03', box, o.chrome, [sx * (0.1 + (i >> 1) * 0.02) * k, chest.y + 0.1 - i * 0.04, 0.119 * k], [0.03, 0.006, 0.006], [0, 0, 0.7 * sx]); } // safety pins
    for (let i = 0; i < 9; i++) h.part('spine_03', torus, o.chrome, [(-0.13 + i * 0.03) * k, chest.y + 0.12 - i * 0.034, 0.121 * k], [0.017, 0.017, 0.017], [i % 2 ? 0 : Math.PI / 2, Math.PI / 2, 0]); // chain across the chest
    // --- bare arms: tape wraps, fingerless gloves, a stud on each shoulder strap
    h.both((s, sf) => {
      for (let i = 0; i < 3; i++) { const m = mid(elbow, hand, 0.25 + i * 0.2); h.part('lowerarm' + sf, torus, o.helmet, [s * m.x, m.y, m.z], [0.052 * k, 0.052 * k, 0.052 * k], [0, Math.PI / 2, 0]); }
      h.part('hand' + sf, box, o.black, [s * (hand.x + 0.02), hand.y, hand.z], [0.07, 0.05 * k, 0.07 * k]);
      h.part('upperarm' + sf, torus, o.accent, [s * (shoulder.x + 0.07), shoulder.y - 0.02, shoulder.z], [0.058 * k, 0.058 * k, 0.058 * k], [0, Math.PI / 2, 0]); // wristband on the arm
      // baggy cargo pants: wide legs, big side pockets with straps, rolled cuffs
      const th = mid(pelvis, knee, 0.5), cm = mid(knee, ankle, 0.5);
      h.part('thigh' + sf, cyl, o.kilt, [s * th.x, th.y, th.z], [0.112 * k, 0.4, 0.114 * k]);
      h.part('thigh' + sf, box, o.kilt, [s * (th.x + 0.108 * k), th.y - 0.03, th.z], [0.045, 0.14, 0.11 * k]);
      h.part('thigh' + sf, box, o.black, [s * (th.x + 0.112 * k), th.y + 0.03, th.z], [0.048, 0.02, 0.113 * k]);
      h.part('calf' + sf, cyl, o.kilt, [s * cm.x, cm.y + 0.03, cm.z], [0.122 * k, 0.4, 0.124 * k]);
      h.part('calf' + sf, cyl, o.black, [s * cm.x, cm.y - 0.17, cm.z], [0.126 * k, 0.03, 0.128 * k]);
      // oversized 2000s skate shoes: puffy tongue, fat laces, thick orange sole, a pink side stripe
      h.part('foot' + sf, box, o.boot, [s * ankle.x, ankle.y - 0.035, ankle.z + 0.08], [0.135 * k, 0.125, 0.36 * k]);
      h.part('foot' + sf, sph, o.boot, [s * ankle.x, ankle.y + 0.05, ankle.z + 0.01], [0.075 * k, 0.07, 0.06 * k]);        // puffy tongue
      h.part('foot' + sf, box, o.sole, [s * ankle.x, ankle.y - 0.108, ankle.z + 0.085], [0.145 * k, 0.065, 0.39 * k]);
      h.part('foot' + sf, box, o.accent, [s * (ankle.x + 0.069 * k), ankle.y - 0.035, ankle.z + 0.08], [0.008, 0.045, 0.2 * k]);
      for (let i = 0; i < 3; i++) h.part('foot' + sf, box, o.black, [s * ankle.x, ankle.y + 0.04, ankle.z + 0.09 + i * 0.045], [0.1 * k, 0.012, 0.012]);
    });
    h.part('pelvis', torus, o.black, [0, beltY - 0.03, 0], [0.185 * k, 0.17 * k, 0.15 * k], [Math.PI / 2, 0, 0]);
    h.part('pelvis', box, o.chrome, [0, beltY - 0.03, 0.17 * k], [0.05, 0.04, 0.012]);
    for (let i = 0; i < 6; i++) h.part('pelvis', torus, o.chrome, [0.18 * k, beltY - 0.05 - i * 0.04, 0.03 + (i > 3 ? 0.03 : 0)], [0.02, 0.02, 0.02], [i % 2 ? 0 : Math.PI / 2, Math.PI / 2, 0]); // hanging belt chain
    // --- the deck: a battered board with neon tags strapped diagonally across his back
    const dz = -0.2 * k, dy = chest.y - 0.04, tilt = 0.5, ux = -Math.sin(tilt), uy = Math.cos(tilt);
    h.part('spine_03', box, o.wood, [0, dy, dz], [0.2 * k, 0.78, 0.022], [0, 0, tilt]);
    h.part('spine_03', box, o.accent, [ux * 0.12, dy + uy * 0.12, dz - 0.013], [0.205 * k, 0.1, 0.004], [0, 0, tilt]);
    h.part('spine_03', box, o.extra, [-ux * 0.05, dy - uy * 0.05, dz - 0.013], [0.205 * k, 0.05, 0.004], [0, 0, tilt]);
    h.part('spine_03', box, o.hairB, [ux * 0.26, dy + uy * 0.26, dz - 0.013], [0.205 * k, 0.04, 0.004], [0, 0, tilt]);
    for (const e of [-1, 1]) for (const w of [-1, 1]) h.part('spine_03', cyl, o.helmet, [ux * 0.27 * e + Math.cos(tilt) * 0.075 * w, dy + uy * 0.27 * e + Math.sin(tilt) * 0.075 * w, dz - 0.035], [0.034, 0.02, 0.034], [0, 0, tilt + Math.PI / 2]); // wheels
    h.part('spine_03', box, o.black, [0.06 * k, chest.y + 0.1, -0.113 * k], [0.03, 0.2, 0.01], [0, 0, 0.5]); // strap
    // --- head: cracked skate helmet, glowing cracks, sticker, chin strap, a flame mohawk through the top
    const hy = H.cy + 0.012, hz = H.cz - 0.01;
    h.part('Head', domeG, o.helmet, [0, hy, hz], [0.108 * H.f, 0.14 * H.f, 0.122 * H.f]);
    h.part('Head', box, o.black, [0, H.cy + 0.062 * H.f, H.cz + 0.1], [0.108 * H.f, 0.014, 0.055], [0.18, 0, 0]);          // peak
    for (const s of [-1, 1]) h.part('Head', sph, o.helmet, [s * 0.1 * H.f, H.cy - 0.005, hz], [0.022, 0.052, 0.054]);       // ear covers
    h.part('Head', torus, o.black, [0, H.cy - 0.07 * H.f, H.cz + 0.008], [0.082 * H.f, 0.082 * H.f, 0.082 * H.f], [Math.PI / 2, 0, 0]); // chin strap
    h.part('Head', box, o.accent, [0.03, H.cy + 0.095 * H.f, H.cz + 0.088], [0.008, 0.07, 0.006], [0.3, 0, 0.5]);          // cracks
    h.part('Head', box, o.accent, [0.05, H.cy + 0.075 * H.f, H.cz + 0.095], [0.008, 0.04, 0.006], [0.3, 0, -0.4]);
    h.part('Head', box, o.accent, [-0.05, H.cy + 0.105 * H.f, H.cz + 0.06], [0.008, 0.06, 0.006], [0.6, 0, 0.7]);
    h.part('Head', box, o.extra, [0.103 * H.f, H.cy + 0.04, hz + 0.02], [0.006, 0.04, 0.04], [0, 0, 0]);                      // sticker
    const fl = [0.09, 0.15, 0.21, 0.27, 0.3, 0.25, 0.2, 0.15, 0.1];                                                          // flame mohawk
    fl.forEach((hh, i) => h.part('Head', cone, i % 2 ? o.hairB : o.hairA, [0, hy + 0.1 * H.f, H.cz + 0.08 - i * 0.022], [0.026, hh, 0.036], [-0.2 + i * 0.1, 0, (i % 3 - 1) * 0.12]));
  },

  water(h, c) {
    const { k, hand, elbow, shoulder, knee, ankle, pelvis, head, chest, beltY } = c, o = h.o, H = blankHead(h, c);
    // --- puffy cropped jacket (round shoulders and chest), exposed midriff
    h.part('spine_03', sph, o.jacket, [0, chest.y + 0.04, 0.005], [0.2 * k, 0.15, 0.135 * k]);
    h.part('spine_03', torus, o.accent, [0, chest.y - 0.07, 0.0], [0.19 * k, 0.15 * k, 0.12 * k], [Math.PI / 2, 0, 0]);
    h.part('spine_03', box, o.accent, [0, chest.y + 0.03, 0.134 * k], [0.012, 0.2, 0.01]);
    h.both((s, sf) => {
      for (let i = 0; i < 3; i++) { const m = mid(shoulder, elbow, 0.12 + i * 0.3); h.part('upperarm' + sf, sph, o.jacket, [s * m.x, m.y, m.z], [0.082 * k - i * 0.004, 0.075 * k, 0.082 * k - i * 0.004]); }
      const m2 = mid(elbow, hand, 0.4); h.part('lowerarm' + sf, cyl, o.jacket, [s * m2.x, m2.y, m2.z], [0.055 * k, 0.18, 0.055 * k], [0, 0, Math.PI / 2]);
      h.part('lowerarm' + sf, torus, o.extra, [s * (hand.x - 0.07), hand.y, hand.z], [0.058 * k, 0.058 * k, 0.058 * k], [0, Math.PI / 2, 0]);
      // --- baggy cargo pants: wide legs, pockets, big cuffs; platform sneakers
      const th = mid(pelvis, knee, 0.5), cm = mid(knee, ankle, 0.5);
      h.part('thigh' + sf, cyl, o.kilt, [s * th.x, th.y, th.z], [0.108 * k, 0.4, 0.11 * k]);
      h.part('thigh' + sf, box, o.kilt, [s * (th.x + 0.1 * k), th.y - 0.02, th.z], [0.04, 0.12, 0.09 * k]);
      h.part('calf' + sf, cyl, o.kilt, [s * cm.x, cm.y + 0.03, cm.z], [0.115 * k, 0.4, 0.118 * k]);
      h.part('calf' + sf, torus, o.accent, [s * cm.x, cm.y - 0.17, cm.z], [0.118 * k, 0.118 * k, 0.118 * k], [Math.PI / 2, 0, 0]);
      h.part('foot' + sf, box, o.boot, [s * ankle.x, ankle.y - 0.04, ankle.z + 0.07], [0.1 * k, 0.09, 0.28 * k]);
      h.part('foot' + sf, box, o.sole, [s * ankle.x, ankle.y - 0.1, ankle.z + 0.075], [0.108 * k, 0.05, 0.31 * k]);
      h.part('foot' + sf, box, o.extra, [s * ankle.x, ankle.y + 0.0, ankle.z + 0.02], [0.102 * k, 0.05, 0.05 * k]); // strap
    });
    // --- wide belt with a star buckle and a loop of chain
    h.part('pelvis', torus, o.boot, [0, beltY - 0.02, 0], [0.19 * k, 0.17 * k, 0.15 * k], [Math.PI / 2, 0, 0]);
    h.part('pelvis', oct, o.extra, [0, beltY - 0.02, 0.165 * k], [0.04, 0.04, 0.012]);
    for (let i = 0; i < 6; i++) h.part('pelvis', torus, o.chrome, [-0.16 * k, beltY - 0.04 - i * 0.04 + (i > 2 ? (i - 2) * 0.03 : 0), 0.05 + i * 0.01], [0.02, 0.02, 0.02], [i % 2 ? 0 : Math.PI / 2, Math.PI / 2, 0]);
    // --- head: headphones, twin buns, butterfly clip
    h.part('Head', torus, o.chrome, [0, H.cy + 0.01, H.cz], [0.105 * H.f, 0.12 * H.f, 0.105 * H.f], [0, Math.PI / 2, 0]);
    for (const s of [-1, 1]) {
      h.part('Head', sph, o.extra, [s * 0.108 * H.f, H.cy - 0.005, H.cz], [0.03, 0.05, 0.05]);
      h.part('Head', sph, o.hairA, [s * 0.075 * H.f, H.top + 0.03, H.cz - 0.02], [0.062, 0.062, 0.062]);
      h.part('Head', cone, o.hairB, [s * 0.075 * H.f, H.top + 0.1, H.cz - 0.02], [0.02, 0.05, 0.02]);
    }
    h.part('Head', cone, o.extra, [0.04, H.top - 0.01, H.cz + 0.06], [0.02, 0.05, 0.01], [0, 0, 1.2]); h.part('Head', cone, o.extra, [0.065, H.top - 0.02, H.cz + 0.06], [0.02, 0.05, 0.01], [0, 0, -1.2]);
    h.part('Head', new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, 1.1), o.hairA, [0, H.cy + 0.012, H.cz - 0.012], [0.1 * H.f, 0.128 * H.f, 0.115 * H.f]); // hair cap behind the face
  },

  earth(h, c) {
    const { k, hand, elbow, shoulder, knee, ankle, pelvis, head, chest, beltY } = c, o = h.o, H = blankHead(h, c);
    // --- oversized hoodie, baggy jeans, chunky sneakers, a backpack
    h.part('spine_03', box, o.jacket, [0, chest.y - 0.01, 0], [0.43 * k, 0.32, 0.27 * k]);
    h.part('pelvis', box, o.jacket, [0, beltY + 0.05, 0], [0.4 * k, 0.2, 0.26 * k]);
    h.part('pelvis', box, o.accent, [0, beltY - 0.05, 0.131 * k], [0.4 * k, 0.03, 0.01]);        // hem band
    h.part('spine_03', box, o.boot, [0, chest.y - 0.05, 0.138 * k], [0.18 * k, 0.1, 0.012]);     // kangaroo pocket
    h.part('spine_03', torus, o.boot, [0.045, chest.y + 0.12, 0.125 * k], [0.02, 0.02, 0.02]);    // drawstring toggles
    h.part('neck_01', sph, o.jacket, [0, head.y - 0.05, head.z - 0.07], [0.115, 0.07, 0.09]);     // the hood, bunched up at the neck
    h.part('spine_03', box, o.kilt, [0, chest.y, -0.2 * k], [0.26, 0.32, 0.12]);                    // backpack
    h.part('spine_03', box, o.extra, [0, chest.y + 0.05, -0.262 * k], [0.2, 0.1, 0.012]);
    h.part('spine_03', oct, o.accent, [0, chest.y - 0.05, -0.264 * k], [0.04, 0.04, 0.012]);
    h.both((s, sf) => {
      const m = mid(shoulder, elbow, 0.55), m2 = mid(elbow, hand, 0.45);
      h.part('upperarm' + sf, cyl, o.jacket, [s * m.x, m.y, m.z], [0.095 * k, 0.26, 0.095 * k], [0, 0, Math.PI / 2]);
      h.part('lowerarm' + sf, cyl, o.jacket, [s * m2.x, m2.y, m2.z], [0.08 * k, 0.21, 0.08 * k], [0, 0, Math.PI / 2]);
      h.part('lowerarm' + sf, torus, o.accent, [s * (hand.x - 0.08), hand.y, hand.z], [0.083 * k, 0.083 * k, 0.083 * k], [0, Math.PI / 2, 0]);
      h.part('spine_03', box, o.extra, [s * 0.1 * k, chest.y + 0.12, 0.0], [0.04, 0.05, 0.25 * k], [0, 0, s * 0.2]); // backpack straps over the shoulders
      const th = mid(pelvis, knee, 0.5), cm = mid(knee, ankle, 0.5);
      h.part('thigh' + sf, cyl, o.kilt, [s * th.x, th.y, th.z], [0.125 * k, 0.42, 0.128 * k]);
      h.part('calf' + sf, cyl, o.kilt, [s * cm.x, cm.y + 0.02, cm.z], [0.132 * k, 0.4, 0.135 * k]);
      h.part('calf' + sf, cyl, o.accent, [s * cm.x, cm.y - 0.165, cm.z], [0.138 * k, 0.04, 0.14 * k]);         // stacked cuff
      h.part('foot' + sf, box, o.boot, [s * ankle.x, ankle.y - 0.035, ankle.z + 0.075], [0.115 * k, 0.1, 0.31 * k]);
      h.part('foot' + sf, box, o.sole, [s * ankle.x, ankle.y - 0.105, ankle.z + 0.08], [0.122 * k, 0.055, 0.34 * k]);
      h.part('foot' + sf, sph, o.extra, [s * ankle.x, ankle.y + 0.02, ankle.z + 0.17], [0.05, 0.035, 0.05]);
    });
    for (let i = 0; i < 6; i++) h.part('pelvis', torus, o.chrome, [0.2 * k, beltY - 0.04 - i * 0.04, 0.06 + (i > 3 ? 0.03 : 0)], [0.02, 0.02, 0.02], [i % 2 ? 0 : Math.PI / 2, Math.PI / 2, 0]); // wallet chain
    // --- head: a beanie with a bright fold
    h.part('Head', new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, 1.45), o.hairA, [0, H.cy + 0.01, H.cz - 0.006], [0.102 * H.f, 0.135 * H.f, 0.116 * H.f]);
    h.part('Head', torus, o.hairB, [0, H.cy + 0.052 * H.f, H.cz - 0.004], [0.099 * H.f, 0.1 * H.f, 0.112 * H.f], [Math.PI / 2, 0, 0]);
    h.part('Head', sph, o.hairB, [0, H.top + 0.02, H.cz - 0.01], [0.032, 0.032, 0.032]);
  },

  air(h, c) {
    const { k, hand, elbow, shoulder, knee, ankle, pelvis, head, chest, beltY } = c, o = h.o, H = blankHead(h, c);
    // --- windbreaker: cropped, bright, with flaring fins at the back; baggy chrome pants; rollerblades
    h.part('spine_03', box, o.jacket, [0, chest.y + 0.01, 0], [0.34 * k, 0.26, 0.21 * k]);
    h.part('spine_03', box, o.accent, [0, chest.y + 0.01, 0.107 * k], [0.012, 0.3, 0.01]);
    h.part('spine_03', box, o.accent, [0, chest.y + 0.075, 0.108 * k], [0.34 * k, 0.03, 0.008]);
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) h.part('spine_03', cone, i % 2 ? o.accent : o.extra, [s * (0.05 + i * 0.045), chest.y + 0.02 - i * 0.03, -0.14 * k], [0.03, 0.2 - i * 0.035, 0.012], [-1.2, 0, -s * (0.35 + i * 0.28)]);
    h.both((s, sf) => {
      const m = mid(shoulder, elbow, 0.55), m2 = mid(elbow, hand, 0.45);
      h.part('upperarm' + sf, cyl, o.jacket, [s * m.x, m.y, m.z], [0.066 * k, 0.25, 0.066 * k], [0, 0, Math.PI / 2]);
      h.part('lowerarm' + sf, cyl, o.accent, [s * m2.x, m2.y, m2.z], [0.058 * k, 0.2, 0.058 * k], [0, 0, Math.PI / 2]);
      h.part('lowerarm' + sf, cone, o.accent, [s * (elbow.x + 0.04), elbow.y - 0.01, elbow.z - 0.06], [0.02, 0.14, 0.01], [-1.2, 0, -s * 1.1]);
      const th = mid(pelvis, knee, 0.5), cm = mid(knee, ankle, 0.5);
      h.part('thigh' + sf, cyl, o.kilt, [s * th.x, th.y, th.z], [0.1 * k, 0.4, 0.103 * k]);
      h.part('calf' + sf, cyl, o.kilt, [s * cm.x, cm.y + 0.03, cm.z], [0.104 * k, 0.4, 0.108 * k]);
      h.part('calf' + sf, sph, o.extra, [s * knee.x, knee.y + 0.01, knee.z + 0.07], [0.055, 0.06, 0.04]);       // knee pad
      h.part('lowerarm' + sf, sph, o.extra, [s * elbow.x, elbow.y, elbow.z - 0.01], [0.05, 0.05, 0.05]);        // elbow pad
      // rollerblades: boot, frame and four glowing wheels
      h.part('foot' + sf, box, o.boot, [s * ankle.x, ankle.y - 0.04, ankle.z + 0.06], [0.088 * k, 0.1, 0.24 * k]);
      h.part('foot' + sf, box, o.accent, [s * ankle.x, ankle.y - 0.105, ankle.z + 0.06], [0.03, 0.035, 0.3 * k]);
      for (let i = 0; i < 4; i++) h.part('foot' + sf, cyl, o.sole, [s * ankle.x, ankle.y - 0.14, ankle.z - 0.06 + i * 0.075], [0.04, 0.026, 0.04], [0, 0, Math.PI / 2]);
    });
    h.part('pelvis', torus, o.accent, [0, beltY - 0.02, 0], [0.18 * k, 0.17 * k, 0.15 * k], [Math.PI / 2, 0, 0]);
    // --- head: goggles pushed up on the forehead, a fan of bleached spikes
    h.part('Head', torus, o.accent, [0, H.cy + 0.052 * H.f, H.cz - 0.004], [0.099 * H.f, 0.1 * H.f, 0.112 * H.f], [Math.PI / 2, 0, 0]);
    for (const s of [-1, 1]) { h.part('Head', cyl, o.accent, [s * 0.04, H.cy + 0.1 * H.f, H.cz + 0.065], [0.036, 0.03, 0.036], [Math.PI / 2 - 0.3, 0, 0]); h.part('Head', cyl, o.extra, [s * 0.04, H.cy + 0.103 * H.f, H.cz + 0.078], [0.03, 0.012, 0.03], [Math.PI / 2 - 0.3, 0, 0]); }
    for (let i = 0; i < 9; i++) { const a = (i - 4) * 0.34; h.part('Head', cone, i % 3 === 0 ? o.hairB : o.hairA, [Math.sin(a) * 0.05, H.top - 0.012, H.cz - 0.01 - Math.abs(a) * 0.01], [0.02, 0.13 - Math.abs(i - 4) * 0.012, 0.02], [-0.25, 0, -a * 0.9]); }
    for (const s of [-1, 1]) h.part('Head', cone, o.hairA, [s * 0.075, H.cy + 0.03, H.cz - 0.07], [0.016, 0.1, 0.012], [-0.9, 0, -s * 0.6]);
  },
};

export function buildOutfit(h, ctx) { OUTFIT[h.key](h, ctx); }
