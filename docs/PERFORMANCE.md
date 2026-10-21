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
