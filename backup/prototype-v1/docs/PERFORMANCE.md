# Performance notes — first optimization pass

## Test setup
- Headless Chromium + **SwiftShader** (software WebGL, no GPU) on a shared cloud CPU.
  Absolute FPS here is meaningless, so read the numbers as *relative* costs only.
- Phone viewport 844×390 @ DPR 2 with touch emulation; desktop 1280×720.
- Scene: fire element, ~10 enemies, every ability fired on a loop through the touch (virtual) input path.

## 1. Bug found and fixed: shaders recompiled during gameplay
A CPU profile of a busy fight showed **~31 % of main-thread time in `getProgramInfoLog` / `getShaderInfoLog`**.
Every ring, slash, projectile, meteor and wave created a material and `dispose()`d it a moment later.
When the last material using a shader program is disposed, three.js frees the program, so the next effect
**recompiled it, which is a synchronous GPU stall**. On a phone that shows up as a hitch on every big hit.

Fixes:
- Transient effect materials are no longer disposed (only their geometry), so programs stay alive.
- `engine.warmup()` keeps one hidden mesh per material variant and calls `renderer.compile()` at boot. The run's
  own materials are compiled again at run start, behind the intro banner.
- `renderer.debug.checkShaderErrors` is off unless the URL has `?debug`.

Result: compiles after boot went from continuous to **7 one-time compiles** in a 15 s fight. Shader-log time in the profile went from 31 % to 0 %.

## 2. Simulation (CPU) cost per frame
Each system was driven by hand for 900 frames, with rendering excluded:

| System | Low | High |
|---|---|---|
| Player | 0.11 ms | 0.10 ms |
| Enemies + projectiles + pickups | 0.27 ms | 0.33 ms |
| FX + particles + debris | 0.11 ms | 0.19 ms |
| World (animated skyline) | 0.16 ms | 0.30 ms |
| Camera + HUD + touch UI | 0.14 ms | 0.16 ms |
| **Total** | **0.80 ms** | **1.08 ms** |

That's on a server CPU. Expect roughly 3–4× on a mid-range phone, which is still only a few ms of a 16.7 ms frame.
**The phone bottleneck is the GPU (fill rate)**, which the presets below target.

Other CPU-side fixes in this pass:
- HUD writes are cached, so the DOM is touched only when a value changes (no per-frame style churn).
- No per-frame allocations in hot paths: ripple colours are precomputed, and the ice colour and hand vectors are reused.
- Floating damage numbers are capped (32 on Low/Medium, 60 on High).
- No `backdrop-filter` on the touch controls. Blurring over a WebGL canvas every frame is very expensive on mobile.

## 3. Quality presets (GPU)
| | Low | Medium | High |
|---|---|---|---|
| Max pixel ratio | 1.0 | 1.25 | 1.5 |
| Shadows | off | 1024² | 2048² |
| Bloom | off | on | on |
| Particle pool / emit budget | 2.5k / 45 % | 4.5k / 75 % | 7k / 100 % |
| Animated skyline rows | 10 | 14 | 28 |
| Flash lights | 2 | 3 | 5 |

Relative render cost per frame (same scene, phone viewport, SwiftShader): **Low ≈ 0.4–0.6× Medium**, and High is the most expensive.

## 4. Auto quality + dynamic resolution
- **Auto** (default) picks Medium on touch devices (and very low-end machines: ≤2 GB or ≤2 cores) and High elsewhere.
- Every 1.5 s it checks the smoothed frame time:
  - over 22 ms (below ~45 fps): render scale drops by 10 %, down to a minimum of 55 %.
  - under 14.5 ms: render scale creeps back up 5 % at a time.
  - still over 26 ms at minimum scale: it drops bloom, then shadows, then the particle budget.
- Turn on Settings → Show FPS to see fps, preset, render scale and JS ms live.

## Still to measure on real hardware
- Real devices (a mid-range Android and an iPhone) with remote DevTools, checking frame pacing and thermal throttling over a 10-minute run.
- Whether Medium on modern iPhones can step up to High automatically.

---

# Milestone 2 performance pass (measured on the owner's PC: RX 6600 XT, i5-11400F, 165 Hz, real Chrome)

## What was actually wrong
The owner saw "large fps drops, ~70 fps". Average frame cost was never the problem: CPU work is ~0.5–1 ms/frame and the GPU
needs ~2.3 ms/frame at 1080p and 1440p (timer-query ablation below). The drops were **single-frame freezes of 50–500 ms**,
and the per-frame hitch log (`window.__game.perfStats.hitches`, new) showed that **every one of them was a WebGL shader
program being compiled mid-game** (ANGLE → D3D11 makes each compile 50–200 ms).

Two root causes:
1. The boot warm-up only covered a handful of material variants (and the hero for one element).
2. Worse, `renderer.compile()` compiled against the **canvas** (sRGB output), while everything is drawn into the composer's
   linear render target. Every warmed program was the wrong variant, so the real one compiled on first use anyway.

## Fixes (kept, with before → after)
| Change | Before → after | Verdict |
|---|---|---|
| `warm.js`: build one of everything (4 heroes, all enemies + boss, every transient effect/projectile/pickup, the Training Grounds, gates) and **render it for real** behind the loading screen; compile against the composer's target (`compileScene`) | runtime shader compiles over a full playthrough of every element/move/mode: **28 → 0**; hitches ≥ 50 ms in that run: 7 → 0 | kept |
| Re-run the warm-up after a graphics change (behind an "Applying graphics…" overlay) instead of letting the next fight compile | 0 runtime compiles on every preset after a live switch | kept |
| Hero pooling (a released hero is hidden and reused by the next run of that element, so no clone/bake/upload at run start) | worst frame at run start **497 ms → 42 ms** | kept |
| Coalesce `resize` events into one reallocation per animation frame and skip unchanged sizes | resize storms (window drag, phone URL bar) no longer reallocate render targets several times per frame | kept |
| Stop calling `renderer.compile` at every run start (the boot warm-up covers it) | removes a full-scene material walk from the run-start frame | kept |

Worst frame per scenario, headed Chrome, High, 1920×1080 (vsync 165 Hz = 6.1 ms):

| Scenario | Before | After |
|---|---|---|
| Run start | 497 ms | 42 ms |
| Level, standing | 55–73 ms | 6.2 ms |
| Level, walking | 97–109 ms | 6.3–24 ms |
| Training combat (6 enemies, all moves + specials) | 60 ms | 18 ms |

## GPU cost ablation (timer queries, median ms per frame, High, combat)
| | full | no outlines | no shadows | no bloom | no FX pass | no particles | half res |
|---|---|---|---|---|---|---|---|
| 1080p | 2.38 | 2.00 | 2.32 | 2.01 | 1.92 | 1.75 | 1.90 |
| 1440p | 2.21 | 2.20 | 2.09 | 2.08 | 2.16 | 2.15 | 2.18 |

On this GPU nothing is fill-bound; the costs that matter on weaker hardware (phones) are particles, outlines and bloom,
which is why those are the main knobs of the presets below.

## Considered and not done (measured too small to be worth the complexity)
| Idea | Measurement | Verdict |
|---|---|---|
| Pool ring/slash meshes to avoid per-effect material creation | `getParameters`/`getProgram` ≈ 0.03 ms/frame in heavy combat | not done |
| Freeze static scene graph matrices | `updateMatrixWorld` ≈ 0.12 ms/frame | not done |
| Partial particle buffer uploads | peak live glow particles in combat = 5.6k of 7k, so the pool is genuinely used | not done |

## Graphics presets (Settings → Graphics)
Presets: **Auto, Potato, Low, Medium, High, Ultra**, plus **Advanced** per-option overrides (any change makes it "Custom"),
and a **frame cap** (Off/30/60/120/144/165/240).

| | Potato | Low | Medium | High | Ultra |
|---|---|---|---|---|---|
| Render scale | 70 % | 90 % | 100 % | 100 % | 100 % |
| Hi-DPI cap | 1× | 1× | 1.25× | 1.5× | 2× |
| Dynamic resolution | on | on | on | off | off |
| Shadows | off | off | 1024² PCF | 2048² soft | 4096² soft |
| Bloom | off | off | half-res | full | full |
| Anti-aliasing | — | — | — | — | 4× MSAA |
| Outlines | off | off | on | on | on |
| Particles | 30 % | 45 % | 75 % | 100 % | 125 % |
| Hair & capes / hand trails | off / off | low / off | low / short | high / long | ultra / long |
| Scorch decals, shockwave distortion | off, off | on, off | on, off | on, on | on, on |
| Flash lights | 1 | 2 | 3 | 5 | 8 |
| Background detail | low | low | medium | high | ultra |

Every preset was switched live in combat on the RX 6600 XT: 164–165 fps (vsync), worst frame ≤ 18 ms, **0 runtime
shader compiles**. The frame cap was verified at 30/60/120/144.

## Guard against regressions
- `perfStats.hitches` records every frame whose own work is > 12 ms, with a per-system breakdown and the names of any
  shader programs compiled in that frame. **Any entry with `newPrograms > 0` is a bug: add that variant to `warm.js`.**
- `perfStats.gaps` records frame gaps > 30 ms (work done outside our frame: GC, uploads, the browser).
- Show FPS now shows fps, the worst frame in the last half second, preset, render resolution, CPU ms and GPU submit ms.

## Update after the Combat Lock drop
- New transient effects (boss shield sphere, colossal meteor/mountain meshes, new projectiles) reuse already-warmed material variants. Not every new effect has been re-profiled on a real GPU.
- Open item: a scripted run that switches elements several times in one page (`startTraining` water → earth → air) still logs a few new shader programs on first use. It is identical before the drop and the normal flow was clean; cause not found.
- Frame-rate numbers in this file predate the Combat Lock drop: **OUTDATED until re-measured** (iPhone 13 and the owner's PC).
