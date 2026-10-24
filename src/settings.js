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
  quality: 'auto',     // auto | potato | low | medium | high | ultra
  gfx: {},             // advanced overrides on top of the preset (makes it 'Custom')
  fpsCap: 0,           // 0 = follow the display (vsync)
  fps: false,
  shake: 1,            // 0 – 1.5
  flashes: true,       // false = reduced flashing / chromatic aberration
  sfx: 0.9,
  music: 0.6,
  fullscreen: true,    // go fullscreen + lock landscape when a run starts (touch)
  flickJump: false,    // touch: flick the stick up to jump (off: stick up + Attack = launcher)
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

// ----------------------------------------------------------------- graphics
// A preset is a set of tiers; any tier can be overridden in Settings → Graphics → Advanced (S.gfx), which turns the
// preset into "Custom". deriveQuality() turns tiers into the numbers the engine uses.
export const PRESETS = ['potato', 'low', 'medium', 'high', 'ultra'];
export const QUALITY = {
  potato: { prMax: 1, renderScale: 0.7, shadows: 'off', bloom: 'off', aa: 0, outlines: false, particles: 0.3, ribbons: 'off', trails: 'off', decals: false, distort: false, lights: 1, detail: 'low', dynRes: true },
  low: { prMax: 1, renderScale: 0.9, shadows: 'off', bloom: 'off', aa: 0, outlines: false, particles: 0.45, ribbons: 'low', trails: 'off', decals: true, distort: false, lights: 2, detail: 'low', dynRes: true },
  medium: { prMax: 1.25, renderScale: 1, shadows: 'medium', bloom: 'half', aa: 0, outlines: true, particles: 0.75, ribbons: 'low', trails: 'short', decals: true, distort: false, lights: 3, detail: 'medium', dynRes: true },
  high: { prMax: 1.5, renderScale: 1, shadows: 'high', bloom: 'full', aa: 0, outlines: true, particles: 1, ribbons: 'high', trails: 'long', decals: true, distort: true, lights: 5, detail: 'high', dynRes: false },
  ultra: { prMax: 2, renderScale: 1, shadows: 'ultra', bloom: 'full', aa: 4, outlines: true, particles: 1.25, ribbons: 'ultra', trails: 'long', decals: true, distort: true, lights: 8, detail: 'ultra', dynRes: false },
};
// the options shown under Advanced (label, choices); values are the tier keys above
export const GFX_OPTS = [
  { k: 'renderScale', label: 'Render scale', opts: [[0.5, '50%'], [0.7, '70%'], [0.9, '90%'], [1, '100%'], [1.25, '125%'], [1.5, '150%'], [2, '200%']], hint: 'Above 100% supersamples (sharper, much heavier)' },
  { k: 'prMax', label: 'Hi-DPI cap', opts: [[1, '1×'], [1.25, '1.25×'], [1.5, '1.5×'], [2, '2×'], [3, 'Native']], hint: 'Limits retina / phone screens; no effect on 1× monitors' },
  { k: 'dynRes', label: 'Dynamic resolution', opts: [[true, 'On'], [false, 'Off']], hint: 'Lowers the resolution when frames run long' },
  { k: 'shadows', label: 'Shadows', opts: [['off', 'Off'], ['low', 'Low'], ['medium', 'Med'], ['high', 'High'], ['ultra', 'Ultra']] },
  { k: 'bloom', label: 'Bloom (glow)', opts: [['off', 'Off'], ['half', 'Half-res'], ['full', 'Full']] },
  { k: 'aa', label: 'Anti-aliasing', opts: [[0, 'Off'], [2, '2× MSAA'], [4, '4× MSAA']] },
  { k: 'outlines', label: 'Character outlines', opts: [[true, 'On'], [false, 'Off']] },
  { k: 'particles', label: 'Particles', opts: [[0.3, '30%'], [0.45, '45%'], [0.75, '75%'], [1, '100%'], [1.25, '125%']] },
  { k: 'ribbons', label: 'Hair & capes', opts: [['off', 'Off'], ['low', 'Low'], ['high', 'High'], ['ultra', 'Ultra']] },
  { k: 'trails', label: 'Hand trails', opts: [['off', 'Off'], ['short', 'Short'], ['long', 'Long']] },
  { k: 'decals', label: 'Ground scorch marks', opts: [[true, 'On'], [false, 'Off']] },
  { k: 'distort', label: 'Shockwave distortion', opts: [[true, 'On'], [false, 'Off']] },
  { k: 'lights', label: 'Dynamic lights', opts: [[1, '1'], [2, '2'], [3, '3'], [5, '5'], [8, '8']] },
  { k: 'detail', label: 'Background detail', opts: [['low', 'Low'], ['medium', 'Med'], ['high', 'High'], ['ultra', 'Ultra']] },
];
export const FPS_CAPS = [[0, 'Off'], [30, '30'], [60, '60'], [120, '120'], [144, '144'], [165, '165'], [240, '240']];
// Resolved preset ('auto' picks by device; dynamic resolution then keeps fps up)
export function qualityLevel() {
  if (PRESETS.includes(S.quality)) return S.quality;
  return lowEndGuess ? 'medium' : 'high';
}
export const isCustom = () => Object.keys(S.gfx || {}).length > 0;
export function gfxTiers() { return { ...QUALITY[qualityLevel()], ...(S.quality === 'auto' ? { dynRes: true } : {}), ...(S.gfx || {}) }; }
export function deriveQuality(t = gfxTiers()) {
  const p = Math.min(1.25, t.particles);
  return {
    level: isCustom() ? 'custom' : qualityLevel(), tiers: t,
    prMax: t.prMax, renderScale: t.renderScale ?? 1, dynRes: t.dynRes,
    shadows: t.shadows !== 'off', shadowMap: { off: 512, low: 512, medium: 1024, high: 2048, ultra: 4096 }[t.shadows], shadowType: { off: 'basic', low: 'basic', medium: 'pcf', high: 'soft', ultra: 'soft' }[t.shadows],
    bloom: t.bloom !== 'off', bloomRes: t.bloom === 'half' ? 0.5 : 1, aa: t.aa,
    outlines: t.outlines, particles: p, glowMax: Math.round(7000 * p), dustMax: Math.round(1200 * p), debris: Math.round(800 * Math.max(0.4, p)),
    ribbonN: { off: 0, low: 5, high: 9, ultra: 12 }[t.ribbons], trailN: { off: 0, short: 10, long: 20 }[t.trails],
    decals: t.decals ? (t.detail === 'ultra' ? 20 : 12) : 0, distort: t.distort, lights: t.lights,
    rows: { low: 8, medium: 14, high: 28, ultra: 28 }[t.detail], farRows: t.detail !== 'low', props: { low: 0.4, medium: 0.7, high: 1, ultra: 1 }[t.detail],
  };
}

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
