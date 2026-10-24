// AnimationMixer state machine: crossfades between named clips, scales clip speed to move timings.
import * as THREE from 'three';

export class Animator {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = {}; this.actions = {};
    for (const c of clips) { this.clips[c.name] = c; this.actions[c.name] = this.mixer.clipAction(c); }
    this.cur = null; this.curName = ''; this.locked = 0;
  }
  has(n) { return !!this.actions[n]; }
  dur(n) { return this.clips[n]?.duration ?? 1; }
  // play a clip. loop:false holds the last pose until something else is played.
  play(name, { fade = 0.12, speed = 1, loop = true, from = 0, force = false } = {}) {
    const a = this.actions[name];
    if (!a) return null;
    // already the current clip: just update its speed (one-shots are NOT restarted every frame; pass force to restart)
    if (this.cur === a && !force) { a.timeScale = speed; return a; }
    const prev = this.cur;
    a.reset(); a.enabled = true;
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.timeScale = speed; a.time = from; a.setEffectiveWeight(1);
    // crossfade from a different clip; restarting the same clip is an instant cut (a fade-in from zero weight would dip to the bind pose)
    if (prev && prev !== a) a.crossFadeFrom(prev, fade, false); else if (!prev) a.fadeIn(fade);
    a.play();
    this.cur = a; this.curName = name;
    return a;
  }
  update(dt) { this.mixer.update(dt); }
  get time() { return this.cur ? this.cur.time : 0; }
  get progress() { return this.cur ? this.cur.time / this.cur.getClip().duration : 0; }
}
