// Tiny pub/sub: combat emits hit / launch / airHit / slam / parry / kill, the DPS meter, trials and haptics listen.
const subs = {};
export function on(ev, fn) { (subs[ev] ||= new Set()).add(fn); return () => subs[ev].delete(fn); }
export function emit(ev, data) { const s = subs[ev]; if (s) for (const f of s) f(data); }
