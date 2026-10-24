// Headless Playwright helper for the v2 work. Runs at BELOW-NORMAL priority so it never competes with what the owner is doing.
import { chromium } from 'playwright';
import os from 'os';
import fs from 'fs';
try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* ignore */ }
export const BASE = process.env.GAME_URL || 'http://localhost:8080/'; // Play.bat's server
export const SHOTS = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'); // tools/tests/shots (git-ignored)
fs.mkdirSync(SHOTS, { recursive: true });

export async function open({ query = '?debug', w = 1366, h = 768, mobile = false, quality = null, gpu = false } = {}) {
  const args = gpu ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-webgl'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];
  const browser = await chromium.launch({ args });
  const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' } : { viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errors = [], logs = [];
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning') { if (!/parallel_shader/.test(t)) errors.push(`[${m.type()}] ${t}`); } else logs.push(t); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  if (quality) await page.addInitScript((q) => { try { localStorage.setItem('elemental-commit-settings-v1', JSON.stringify({ quality: q, fps: true })); } catch {} }, quality);
  await page.goto(BASE + query);
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 90000 });
  return { browser, ctx, page, errors, logs };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function shot(page, name) { await page.screenshot({ path: SHOTS + name + '.png', timeout: 120000 }); return SHOTS + name + '.png'; }
// wait N seconds of GAME time (software GL is slow, so wall time is meaningless)
export async function gameWait(page, seconds) {
  await page.evaluate((s) => new Promise((res) => { const g = window.__game.G, t0 = g.time; const iv = setInterval(() => { if (g.time - t0 >= s) { clearInterval(iv); res(); } }, 30); setTimeout(() => { clearInterval(iv); res(); }, s * 12000 + 3000); }), seconds);
}
// virtual (game-time) input
export async function vpress(page, acts, seconds = 0.15) {
  await page.evaluate((a) => { for (const x of a) window.__game.In.vDown(x); }, acts);
  await gameWait(page, seconds);
  await page.evaluate((a) => { for (const x of a) window.__game.In.vUp(x); }, acts);
}
export async function cropShot(page, name, half = 230) {
  const c = await page.evaluate(() => { const g = window.__game, p = g.G.player, v = new g.ENG.camera.position.constructor(p.x, p.y + 1.0, 0).project(g.ENG.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, w: innerWidth, h: innerHeight }; });
  const x = Math.max(0, Math.min(c.w - half * 2, c.x - half)), y = Math.max(0, Math.min(c.h - half * 2, c.y - half * 1.1));
  await page.screenshot({ path: SHOTS + name + '.png', clip: { x, y, width: half * 2, height: half * 2 }, timeout: 120000 });
}
