import { S, DEFAULTS, setSetting, isTouchDevice, qualityLevel } from './settings.js';
import { sfx } from './audio.js';
import { wipeSave } from './skills.js';

const $ = (id) => document.getElementById(id);
const SCHEMA = [
  { section: 'Touch controls', items: [
    { k: 'touch', type: 'seg', label: 'On-screen controls', opts: [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], hint: () => (isTouchDevice ? 'Touch screen detected' : 'No touch screen detected') },
    { k: 'btnSize', type: 'range', label: 'Button size', min: 0.8, max: 1.3, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
    { k: 'btnOpacity', type: 'range', label: 'Button opacity', min: 0.35, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
    { k: 'lefty', type: 'toggle', label: 'Left-handed layout', hint: () => 'Stick on the right, buttons on the left' },
    { k: 'haptics', type: 'toggle', label: 'Vibration', hint: () => ('vibrate' in navigator ? 'Hits, parries, level-ups' : 'Not supported on this browser') },
    { k: 'fullscreen', type: 'toggle', label: 'Fullscreen + landscape on start' },
  ] },
  { section: 'Graphics', items: [
    { k: 'quality', type: 'seg', label: 'Quality', opts: [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Med'], ['high', 'High']], hint: () => (S.quality === 'auto' ? `Auto → ${qualityLevel()} + dynamic resolution` : 'Fixed preset') },
    { k: 'fps', type: 'toggle', label: 'Show FPS' },
  ] },
  { section: 'Comfort', items: [
    { k: 'shake', type: 'range', label: 'Screen shake', min: 0, max: 1.5, step: 0.1, fmt: (v) => (v === 0 ? 'Off' : Math.round(v * 100) + '%') },
    { k: 'flashes', type: 'toggle', label: 'Flashes & colour split', hint: () => 'Turn off to reduce flashing' },
    { k: 'aimAssist', type: 'toggle', label: 'Aim assist', hint: () => 'Ranged attacks lock onto nearby enemies' },
  ] },
  { section: 'Audio', items: [
    { k: 'sfx', type: 'range', label: 'Effects volume', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
    { k: 'music', type: 'range', label: 'Music volume', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
  ] },
];

export function renderSettings() {
  const body = $('settings-body');
  body.innerHTML = '';
  for (const sec of SCHEMA) {
    const s = document.createElement('section'); s.className = 'set-sec';
    s.innerHTML = `<h3>${sec.section}</h3>`;
    for (const it of sec.items) s.appendChild(row(it));
    body.appendChild(s);
  }
  const data = document.createElement('section'); data.className = 'set-sec';
  data.innerHTML = '<h3>Data</h3>';
  const reset = document.createElement('button'); reset.className = 'danger'; reset.textContent = 'Reset all progress';
  let armed = false;
  reset.onclick = () => {
    if (!armed) { armed = true; reset.textContent = 'Tap again to confirm'; reset.classList.add('armed'); setTimeout(() => { armed = false; reset.textContent = 'Reset all progress'; reset.classList.remove('armed'); }, 3000); return; }
    wipeSave(); reset.textContent = 'Progress wiped ✔'; sfx.click();
  };
  const def = document.createElement('button'); def.textContent = 'Restore default settings';
  def.onclick = () => { for (const [k, v] of Object.entries(DEFAULTS)) setSetting(k, v); renderSettings(); sfx.click(); };
  data.append(reset, def);
  body.appendChild(data);
}

function row(it) {
  const r = document.createElement('div'); r.className = 'set-row';
  const hint = it.hint ? `<small>${it.hint()}</small>` : '';
  if (it.type === 'toggle') {
    r.innerHTML = `<label><span>${it.label}${hint}</span><button class="tgl ${S[it.k] ? 'on' : ''}" role="switch" aria-checked="${!!S[it.k]}"><i></i></button></label>`;
    r.querySelector('.tgl').onclick = () => { setSetting(it.k, !S[it.k]); sfx.click(); renderSettings(); };
  } else if (it.type === 'seg') {
    r.innerHTML = `<label><span>${it.label}${hint}</span><div class="seg">${it.opts.map(([v, l]) => `<button data-v="${v}" class="${S[it.k] === v ? 'on' : ''}">${l}</button>`).join('')}</div></label>`;
    r.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => { setSetting(it.k, b.dataset.v); sfx.click(); renderSettings(); }));
  } else {
    r.innerHTML = `<label><span>${it.label}</span><div class="rng"><input type="range" min="${it.min}" max="${it.max}" step="${it.step}" value="${S[it.k]}"><b>${it.fmt(S[it.k])}</b></div></label>`;
    const inp = r.querySelector('input'), out = r.querySelector('b');
    const paint = () => inp.style.setProperty('--p', ((inp.value - it.min) / (it.max - it.min)) * 100 + '%');
    paint();
    inp.oninput = () => { const v = parseFloat(inp.value); out.textContent = it.fmt(v); paint(); setSetting(it.k, v); };
    inp.onchange = () => sfx.click();
  }
  return r;
}
