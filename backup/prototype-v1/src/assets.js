// Asset preloader: two base bodies (Quaternius Universal Base Characters, CC0) + the shared animation library
// (Quaternius Universal Animation Library, CC0). Costumes, masks, hair, capes and VFX are built in code (hero.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const assets = { m: null, f: null, anims: null, ok: false };
const FILES = { m: 'body_m.glb', f: 'body_f.glb', anims: 'anims.glb' };

export function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  const prog = {}; const total = Object.keys(FILES).length;
  const report = () => onProgress?.(Object.values(prog).reduce((a, b) => a + b, 0) / total);
  const load = (key) => new Promise((resolve, reject) => {
    const url = new URL('../assets/hero/' + FILES[key], import.meta.url).href;
    prog[key] = 0;
    loader.load(url, (g) => { prog[key] = 1; report(); resolve(g); }, (e) => { if (e.total) { prog[key] = e.loaded / e.total; report(); } }, reject);
  });
  return Promise.all(Object.keys(FILES).map(load)).then(([m, f, a]) => {
    for (const g of [m, f]) g.scene.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });
    assets.m = m; assets.f = f; assets.anims = a.animations; assets.ok = true;
    return assets;
  }).catch((err) => { console.warn('hero assets failed to load, using the procedural fallback', err); return assets; });
}
