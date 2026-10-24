// Generates Pyre's 1024x1024 texture atlas (flat colour swatches + patches/decals) with a headless browser canvas, and atlas.json
// (cell rectangles) for build_pyre.py. Run from a folder that has `playwright` installed:
//   node tools/blender/atlas_gen.mjs      (writes tools/blender/atlas.png + tools/blender/atlas.json)
import fs from 'fs';
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright'); // e.g. PLAYWRIGHT=file:///C:/programok/_v2_tools/node_modules/playwright/index.mjs
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.resolve(here, '../../assets/fonts');
const font = fs.readFileSync(path.join(fontDir, 'BarlowCondensed-800.woff2')).toString('base64');

const SWATCHES = {
  denim: '#3a6a9a', denimDark: '#27496b', hoodie: '#8f4b2a', cargo: '#5b6038', cargoDark: '#3f4326', helmet: '#3a3d45', helmetLight: '#5a5e68',
  shoe: '#f2ece4', shoeGrey: '#b9b4ac', sole: '#ff7a1a', black: '#14121a', silver: '#cfd6e4', pink: '#ff2e93', lime: '#c6ff3d', yellow: '#ffd23a',
  cyan: '#19e3ff', skin: '#c98c64', face: '#f9e1d7', tape: '#e9dfc8', purple: '#6a2cb0', wood: '#b0834f', red: '#e5262f', flame: '#ff6a1a', white: '#ffffff',
};
const page_html = `<html><body style="margin:0"><canvas id="c" width="1024" height="1024"></canvas><script>
const FONT = 'data:font/woff2;base64,${font}';
const SW = ${JSON.stringify(SWATCHES)};
(async () => {
  const ff = new FontFace('BC', 'url(' + FONT + ')', { weight: '800' }); await ff.load(); document.fonts.add(ff);
  const c = document.getElementById('c'), g = c.getContext('2d');
  g.fillStyle = '#14121a'; g.fillRect(0, 0, 1024, 1024);
  const cells = {}; let i = 0;
  for (const [k, col] of Object.entries(SW)) { const x = (i % 16) * 64, y = Math.floor(i / 16) * 64; g.fillStyle = col; g.fillRect(x, y, 64, 64); cells[k] = [x, y, 64, 64]; i++; }
  const patch = (name, x, y, w, h, fn) => { cells[name] = [x, y, w, h]; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); fn(w, h); g.restore(); };
  const ink = (w) => { g.lineWidth = w; g.strokeStyle = '#14121a'; g.lineJoin = 'round'; g.lineCap = 'round'; };
  const mush = (w, h, capCol = '#e5262f') => { // a spotted mushroom, used for the small patch and the big back patch
    g.fillStyle = '#e9dfc8'; ink(w * 0.03); g.beginPath(); g.roundRect(w * 0.38, h * 0.5, w * 0.24, h * 0.36, w * 0.05); g.fill(); g.stroke();
    g.fillStyle = capCol; g.beginPath(); g.moveTo(w * 0.1, h * 0.55); g.bezierCurveTo(w * 0.1, h * 0.12, w * 0.9, h * 0.12, w * 0.9, h * 0.55); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#fff'; for (const [dx, dy, r] of [[0.3, 0.38, 0.07], [0.52, 0.27, 0.08], [0.7, 0.42, 0.06], [0.45, 0.47, 0.04]]) { g.beginPath(); g.arc(w * dx, h * dy, w * r, 0, 7); g.fill(); }
  };
  patch('p_mushroom', 0, 192, 128, 128, (w, h) => { g.fillStyle = '#27496b'; g.fillRect(0, 0, w, h); ink(5); g.strokeRect(4, 4, w - 8, h - 8); mush(w, h); });
  patch('p_skull', 128, 192, 128, 128, (w, h) => { g.fillStyle = '#14121a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2ece4'; g.beginPath(); g.arc(64, 54, 38, 0, 7); g.fill(); g.fillRect(44, 70, 40, 34); g.fillStyle = '#14121a'; g.beginPath(); g.arc(50, 56, 9, 0, 7); g.arc(78, 56, 9, 0, 7); g.fill(); g.fillRect(60, 72, 8, 10); for (const x of [50, 60, 70, 80]) g.fillRect(x, 92, 3, 12); });
  patch('p_heart', 256, 192, 128, 128, (w, h) => { g.fillStyle = '#ffd23a'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff2e93'; ink(6); g.beginPath(); g.moveTo(64, 108); g.bezierCurveTo(8, 70, 18, 20, 64, 46); g.bezierCurveTo(110, 20, 120, 70, 64, 108); g.fill(); g.stroke(); });
  patch('p_bolt', 384, 192, 128, 128, (w, h) => { g.fillStyle = '#14121a'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd23a'; g.beginPath(); g.moveTo(76, 8); g.lineTo(30, 70); g.lineTo(60, 70); g.lineTo(46, 120); g.lineTo(100, 52); g.lineTo(68, 52); g.closePath(); g.fill(); });
  patch('p_star', 512, 192, 128, 128, (w, h) => { g.fillStyle = '#c6ff3d'; g.fillRect(0, 0, w, h); g.fillStyle = '#14121a'; g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 22 : 52, a = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(64 + r * Math.cos(a), 64 + r * Math.sin(a)); } g.closePath(); g.fill(); });
  patch('p_x', 640, 192, 128, 128, (w, h) => { g.fillStyle = '#ff2e93'; g.fillRect(0, 0, w, h); ink(18); g.strokeStyle = '#14121a'; g.beginPath(); g.moveTo(24, 24); g.lineTo(104, 104); g.moveTo(104, 24); g.lineTo(24, 104); g.stroke(); });
  patch('p_crash', 0, 320, 384, 384, (w, h) => { g.fillStyle = '#27496b'; g.fillRect(0, 0, w, h); mush(w, h * 0.78); g.font = '800 120px BC'; g.textAlign = 'center'; g.lineJoin = 'round'; g.strokeStyle = '#14121a'; g.lineWidth = 18; g.strokeText('CRASH', w / 2, h * 0.92); g.fillStyle = '#ffd23a'; g.fillText('CRASH', w / 2, h * 0.92); });
  patch('p_flame', 384, 320, 384, 96, (w, h) => { g.fillStyle = '#f2ece4'; g.fillRect(0, 0, w, h); const fl = (cx, base, hh, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(cx - 28, base); g.bezierCurveTo(cx - 34, base - hh * 0.5, cx - 6, base - hh * 0.6, cx, base - hh); g.bezierCurveTo(cx + 6, base - hh * 0.6, cx + 34, base - hh * 0.5, cx + 28, base); g.closePath(); g.fill(); };
    for (let k = 0; k < 6; k++) { fl(36 + k * 62, h, 78 - (k % 2) * 22, '#ff6a1a'); fl(36 + k * 62, h, 48 - (k % 2) * 14, '#ffd23a'); } });
  patch('p_sticker1', 384, 432, 96, 96, (w, h) => { g.fillStyle = '#19e3ff'; g.fillRect(0, 0, w, h); g.fillStyle = '#14121a'; g.beginPath(); g.arc(48, 48, 34, 0, 7); g.fill(); g.fillStyle = '#c6ff3d'; g.font = '800 40px BC'; g.textAlign = 'center'; g.fillText('SK8', 48, 61); });
  patch('p_sticker2', 480, 432, 96, 96, (w, h) => { g.fillStyle = '#ff2e93'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '800 54px BC'; g.textAlign = 'center'; g.fillText('404', 48, 62); });
  patch('p_sticker3', 576, 432, 96, 96, (w, h) => { g.fillStyle = '#ffd23a'; g.fillRect(0, 0, w, h); g.fillStyle = '#14121a'; g.beginPath(); for (let k = 0; k < 12; k++) { const r = k % 2 ? 22 : 44, a = k * Math.PI / 6; g.lineTo(48 + r * Math.cos(a), 48 + r * Math.sin(a)); } g.closePath(); g.fill(); });
  // the deck: neon graffiti on purple, 256 x 768 (the long side runs along v)
  patch('deck', 768, 192, 256, 768, (w, h) => { g.fillStyle = '#6a2cb0'; g.fillRect(0, 0, w, h);
    g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.font = '800 150px BC'; g.lineJoin = 'round';
    g.strokeStyle = '#14121a'; g.lineWidth = 34; g.strokeText('IGNITE', 4, 52); g.strokeStyle = '#ff2e93'; g.lineWidth = 24; g.strokeText('IGNITE', 0, 48); g.fillStyle = '#ffd23a'; g.fillText('IGNITE', 0, 48); g.restore();
    g.fillStyle = '#19e3ff'; g.font = '800 40px BC'; g.textAlign = 'left'; g.save(); g.translate(40, 70); g.rotate(-Math.PI / 2 * 0.0); g.fillText('PYRO', 0, 0); g.restore(); g.fillStyle = '#c6ff3d'; g.fillText('FIRE', 110, 730);
    g.strokeStyle = '#ffd23a'; g.lineWidth = 6; for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(20 + k * 34, 40); g.lineTo(26 + k * 34, 130 + (k % 3) * 22); g.stroke(); }
    g.strokeStyle = '#19e3ff'; g.lineWidth = 5; g.beginPath(); g.moveTo(30, 640); g.bezierCurveTo(90, 600, 160, 700, 226, 650); g.stroke(); });
  patch('grip', 768, 960, 256, 64, (w, h) => { g.fillStyle = '#14121a'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a2830'; for (let y = 0; y < h; y += 6) for (let x = (y / 6 % 2) * 3; x < w; x += 6) g.fillRect(x, y, 2, 2); });
  window.__cells = cells; window.__png = c.toDataURL('image/png'); window.__done = true;
})();
</script></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(page_html);
await page.waitForFunction('window.__done === true', null, { timeout: 30000 });
const png = await page.evaluate('window.__png'), cells = await page.evaluate('window.__cells');
fs.writeFileSync(path.join(here, 'atlas.png'), Buffer.from(png.split(',')[1], 'base64'));
fs.writeFileSync(path.join(here, 'atlas.json'), JSON.stringify({ size: 1024, cells }, null, 1));
console.log('atlas ok', Object.keys(cells).length, 'cells');
await browser.close();
