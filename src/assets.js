// Asset preloader: two base bodies (Quaternius Universal Base Characters, CC0) + the shared animation library
// (Quaternius Universal Animation Library, CC0). Costumes, masks, hair, capes and VFX are built in code (hero.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const assets = { m: null, f: null, anims: null, pyre: null, deck: null, ok: false };
const FILES = { m: 'body_m.glb', f: 'body_f.glb', anims: 'anims.glb' };
// Pyre (the Fire hero) is his own Blender-built model + board (tools/blender/build_pyre.py, build_deck.py). Optional: if either
// fails to load, Fire falls back to the base body with the procedural outfit.
const OPTIONAL = { pyre: 'pyre.glb', deck: 'pyre_deck.glb' };

export function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  const prog = {}; const total = Object.keys(FILES).length + Object.keys(OPTIONAL).length;
  const report = () => onProgress?.(Object.values(prog).reduce((a, b) => a + b, 0) / total);
  const load = (key, file) => new Promise((resolve, reject) => {
    const url = new URL('../assets/hero/' + file, import.meta.url).href;
    prog[key] = 0;
    loader.load(url, (g) => { prog[key] = 1; report(); resolve(g); }, (e) => { if (e.total) { prog[key] = e.loaded / e.total; report(); } }, reject);
  });
  const optional = Promise.all(Object.entries(OPTIONAL).map(([k, f]) => load(k, f).catch((err) => { console.warn(`${f} failed to load`, err); prog[k] = 1; return null; })));
  return Promise.all([...Object.entries(FILES).map(([k, f]) => load(k, f)), optional]).then(([m, f, a, [pyre, deck]]) => {
    for (const g of [m, f, pyre]) g?.scene.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });
    assets.m = m; assets.f = f; assets.anims = a.animations; assets.pyre = pyre && deck ? pyre : null; assets.deck = pyre && deck ? deck : null; assets.ok = true;
    return assets;
  }).catch((err) => { console.warn('hero assets failed to load, using the procedural fallback', err); return assets; });
}
