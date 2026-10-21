// Player settings (persisted) + device detection + haptics.
const KEY = 'elemental-commit-settings-v1';

export const isTouchDevice = (() => {
  try { return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 || 'ontouchstart' in window; } catch { return false; }
})();
const lowEndGuess = (() => {
  const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
  return isTouchDevice || mem <= 2 || cores <= 2; // dynamic resolution covers the rest
})();

export const DEFAULTS = {
  touch: 'auto',       // auto | on | off
  lefty: false,        // mirror the touch layout
  btnSize: 1,          // 0.8 – 1.3
  btnOpacity: 0.9,     // 0.4 – 1
  haptics: true,
  aimAssist: true,
  quality: 'auto',     // auto | low | medium | high
  fps: false,
  shake: 1,            // 0 – 1.5
  flashes: true,       // false = reduced flashing / chromatic aberration
  sfx: 0.9,
  music: 0.6,
  fullscreen: true,    // go fullscreen + lock landscape when a run starts (touch)
};

function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
export const S = { ...DEFAULTS, ...load() };
const listeners = new Set();
export function onSetting(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function setSetting(k, v) {
  S[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode */ }
  for (const f of listeners) f(k, v);
}
export const touchOn = () => S.touch === 'on' || (S.touch === 'auto' && isTouchDevice);

// Resolved quality preset ('auto' picks by device, then dynamic resolution keeps fps up)
export function qualityLevel() {
  if (S.quality !== 'auto') return S.quality;
  return lowEndGuess ? 'medium' : 'high';
}
export const QUALITY = {
  low: { pr: 0.85, prMax: 1, shadows: false, shadowMap: 512, bloom: false, particles: 0.45, glowMax: 2500, dustMax: 500, debris: 300, rows: 10, farRows: false, lights: 2 },
  medium: { pr: 1, prMax: 1.25, shadows: true, shadowMap: 1024, bloom: true, particles: 0.75, glowMax: 4500, dustMax: 900, debris: 500, rows: 14, farRows: true, lights: 3 },
  high: { pr: 1.5, prMax: 1.5, shadows: true, shadowMap: 2048, bloom: true, particles: 1, glowMax: 7000, dustMax: 1200, debris: 800, rows: 28, farRows: true, lights: 5 },
};

// ----------------------------------------------------------------- haptics
const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;
const PATTERNS = {
  tap: 6, press: 9, hit: 12, crit: [18, 20, 14], kill: [16, 30, 24], hurt: [45, 30, 25],
  parry: [12, 25, 18, 25, 60], level: [25, 40, 25, 40, 25, 40, 90], dash: 10, block: 22, cast: [14, 20, 22], boss: [60, 40, 120],
};
let lastBuzz = 0;
export function haptic(kind) {
  if (!S.haptics || !canVibrate || !touchOn()) return;
  const now = performance.now();
  const big = typeof PATTERNS[kind] !== 'number';
  if (!big && now - lastBuzz < 55) return; // don't turn rapid hits into one long buzz
  lastBuzz = now;
  try { navigator.vibrate(PATTERNS[kind] ?? 10); } catch { /* ignore */ }
}
