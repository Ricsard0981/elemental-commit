# Elemental Commit — the developer guide

> Everything about this project, from the first empty folder to today, written down so that future me (or you) can pick it
> up cold. Part devlog, part architecture doc, part "here's where the bodies are buried".

---

> **Status (Combat Lock drop).** This guide was first written at the end of Milestone 2. Sections marked **(updated)** were
> rewritten after the Combat Lock drop; the rest is still accurate. The list of facts that used to be true and no longer are is in
> **§11 Superseded facts**. The combat rules themselves live in [`COMBAT_LOCK.md`](COMBAT_LOCK.md), the research and roadmap in
> [`NEXT_STEPS.md`](NEXT_STEPS.md).

## 0. The pitch, in one breath

A side-view **3D** action game in the browser. You pick an element (**Fire, Water, Earth, Air**), and each element is a
completely different playstyle: a main attack combo, a ranged attack, a defence with a **perfect parry**, and two specials.
Then you fight your way through a level. Combat is the whole point. It should feel *crunchy*: hit-stop, slow-mo on
parries, screen shake, bloom pulses, enemies flying into the air and bouncing off the floor. If you did something cool,
the game should shout about it.

The first world is built out of a **GitHub contribution graph** (bars are days, taller = more commits). Enemies are bugs,
arenas are code-review gates, checkpoints are commits, and the boss is legacy code. That world is getting replaced later
(more on that at the end), but it's what's there today.

Hard rules I set myself early and still follow:
- **No build step.** Plain ES modules, three.js vendored, open `index.html` through any static server and it runs.
- **Runs on a phone.** Touch controls are first-class, and an iPhone 13 has to hold ~60 fps on High.
- **Browser version stays forever**, even when a desktop build (Tauri or Electron, undecided) happens.
- **All audio is synthesized.** There's not a single sound file in the repo.

---

## 1. How it got here (the devlog)

Everything below happened over a handful of very long sessions. The git log is short because work landed in big drops.

### 1.1 The vertical slice (cloud session)
`91600ad` → `fe2b37e`

Built from nothing: renderer, bloom + custom FX pass, particle systems, camera with trauma shake, input with buffering,
the contribution-graph level (~270 columns: tutorial → pits → arena A → plateau → arena B → boss), four elements with five
abilities each (20 total), the parry system, 3 enemy types plus the boss (**THE LEGACY MONOLITH**, two phases), a 9-node
skill tree per element, XP and levels, a `localStorage` save, run ranks S–C, and the juice layer. Every model was
procedural: capsules, boxes and spheres, animated by hand-written code.

The plan from that phase still lives in [`VERTICAL_SLICE.md`](VERTICAL_SLICE.md).

### 1.2 Mobile
`21ce186`

The owner (my one and only playtester so far) plays on an **iPhone 13**, so this drop added:
- a floating analog stick
- a thumb-arc button cluster
- drag-to-aim on the ranged button and sliding between buttons
- haptics, a settings screen, rotate-to-landscape and auto-pause, a PWA manifest
- quality presets and dynamic resolution

It was also the first performance pass. The headline find was that every effect created and disposed a material, so
three.js freed the shader program and **recompiled it on the next hit**. That's a GPU stall on every big impact. The
details are in [`PERFORMANCE.md`](PERFORMANCE.md), part 1.

### 1.3 Planning Milestone 2
`db3e6e8`, `922b3b3`

Owner feedback after playing: *smooth and responsive, but attacks, animations and textures feel basic, and the GitHub
world is "cool but not done well yet."* We agreed on a direction:
- **Long term:** a hybrid world, an elemental fantasy world being eaten by a digital **Corruption** (glitches, code shards,
  bug-creatures), in a **stylized toon/painterly** look.
- **This milestone:** combat feel and animation first. The world comes later.
- New combat moves: **launchers, air combos, slams**. A **secondary element** you earn in the skill tree. A **Training
  Grounds** arena to test it all in.

The plan is [`MILESTONE_2_PLAN.md`](MILESTONE_2_PLAN.md); [`HANDOFF.md`](HANDOFF.md) carries the decisions between
sessions. Then work moved from the cloud to the owner's PC.

### 1.4 Milestone 2, local, round one: the gnome
The plan said: build the hero on the **KayKit Adventurers** rig (CC0, 75 animations). I did it. The KayKit Rogue with a
mask, toon shading and ribbon hair came out cute and readable.

Then the owner looked at it and said it looked **"goofy, like a little gnome."** Fair. KayKit characters are chibi
(huge head, tiny body), and that's the wrong fantasy for a power-trip action game. The brief became: **tall, heroic,
human-proportioned, memorable characters. Custom identity. Insanely good animation and sound. More visible, more
satisfying, chaotic but smooth.**

### 1.5 Milestone 2, round two: real bodies
I switched to **Quaternius Universal Base Characters** (two realistic, stylized, muscular bodies, male + female, CC0) and
the **Universal Animation Library** (same rig, CC0). They came from itch.io through the free-download flow, driven by a
Playwright script, because I'm a robot. Everything that gives the characters identity is built in code on top:
costumes, armour, masks, hair, capes, trails and the combat pose layer.

Round two also brought:
- launchers, air chain, spike + ground bounce, slam, juggle decay
- Resonance (the 4th skill branch), with a secondary-element imbue
- the Training Grounds: sandbox, endless waves, combo trials
- new VFX: sprite-atlas particles, shader slashes, decals, shockwave distortion
- a rewritten audio engine
- a closer camera, so the new characters actually fill the screen

### 1.6 The performance scare
`5d03ea2`

The owner reported "large fps drops, ~70 fps" on a PC that has no business dropping frames (RX 6600 XT,
i5-11400F, 165 Hz). Measured on that machine, the average was fine at 160+ fps. The problem was **single frames
freezing for 50–500 ms**. A per-frame hitch logger showed every freeze was a WebGL program compiling mid-game.

The punchline: the boot warm-up was compiling **the wrong variant** of every shader. It compiled against the canvas
(sRGB output) while the game renders into the composer's linear render target. So it warmed nothing at all, and every
"warmed" program got compiled again on first use.

The fix was a real warm-up: build one of everything and render it for real, behind the loading screen. Runtime compiles
went from 28 to 0. The same drop added **graphics tiers** (Potato → Ultra), per-option overrides and a frame cap.
Full numbers are in [`PERFORMANCE.md`](PERFORMANCE.md), part 2.

### 1.8 The Combat Lock drop
The owner asked for a principal-engineer pass on combat: make it reliable, make it feel physical, make the elements feel different.
It shipped as one drop in five phases (A control, B feedback and audio, C enemies and boss, D progression and element identity,
E dev tools), plus three rounds of owner feedback after playtesting:
- *"Each element should feel DIFFERENT"* → per-element tempo/power profiles and signatures, and a colossal ability option for each
  (Solar Flare, Leviathan, Mountainfall, Maelstrom).
- *"The skill tree is weak"* → numbers were bumped first, which missed the point. The real complaint was that no node was worth a point.
  The tree was rebuilt so the first node of every branch is a **new move**.
- The research that drove this (feedback timing, hit-stop, parry windows, attack tokens, Spider-Man 2 progression) is summarised in
  `COMBAT_LOCK.md` and `NEXT_STEPS.md`.

### 1.7 Small stuff since
- `ad6c636`: the Training Grounds select screen was dead on first visit. Its buttons called handlers that only got set
  once a mode had started. Classic. Handlers are now set at boot.
- `9d188bb`: `Play.bat`. Double-click it and the game runs.

---

## 2. Running it, testing it, shipping it

```bash
npx http-server -p 8080 -c-1 .
```
Then open <http://localhost:8080>, or just double-click **`Play.bat`**. It has to be served over http, because
`file://` breaks ES modules. `-c-1` disables caching, so a reload always gets fresh files.

- **Deploy:** every push to `main` triggers `.github/workflows/pages.yml`, which uploads the repo root to GitHub Pages.
  There's no build: the repo *is* the site. Keep every asset path **relative**, because Pages serves from a subpath
  (`/elemental-commit/`) and a future desktop wrapper will serve from `file`-ish origins.
- **Phone testing:** push, then open the Pages URL on the phone. Turn on Settings → Show FPS.
- **Debug URL flag:** `?debug` turns three.js shader error checks back on. They're off by default because
  `getProgramInfoLog` is a synchronous stall.

---

## 3. Architecture

### 3.1 The shape of it
No bundler. `index.html` has an import map: `three` → `vendor/three.module.js` (r170) and `three/addons/` →
`vendor/addons/`. All game code is in `src/`, about 6,400 lines including HTML/CSS.

```
index.html / style.css     the DOM shell: HUD, menus, skill tree, settings, loading screen
src/main.js                boot, the frame loop, run lifecycle (story + training), arenas, checkpoints, win/death
src/state.js               G: the one shared mutable game-state object
src/events.js              tiny pub/sub bus (combat → DPS meter, trials, sounds)
src/engine.js              renderer, post chain, particles, debris, effects, camera, quality, dynamic resolution
src/warm.js                the shader warm-up ("render one of everything")
src/toon.js                toon / costume / outline materials
src/hero.js                the four warriors (body + costume + mask + ribbons + combat poses), hero pool
src/animator.js            AnimationMixer state machine
src/ribbons.js             shader ribbons (hair, capes, hand trails)
src/assets.js              GLB preloader
src/player.js              the controller: movement, attack kinds, guard, dash, physics, collision
src/elements.js            all 4 elements' abilities as data + functions, plus launcher/air/slam moves
src/combat.js              damage pipeline, juggle, imbue, parry, projectiles, pickups, combo, XP
src/enemies.js             Bug, Null Pointer, Legacy Bot, Dummy, the Monolith: build, AI, physics, reactions
src/skills.js              skill trees, Resonance, progression, save
src/world.js               the contribution-graph level: layout, collision, visuals, terrain override hook
src/arena.js               the Training Grounds playfield
src/training.js            sandbox / endless waves / combo trials, DPS meter, the Lab panel
src/ui.js                  HUD, banners, skill tree UI, Resonance picker
src/touch.js / input.js    touch layer / keyboard + mouse + virtual input
src/audio.js               synthesized SFX, ambience, generative music
src/settings.js / settingsUI.js   persisted settings, graphics tiers, settings screen
src/util.js                clamp, lerp, damp, rand, easing
```

### 3.2 Shared state
`G` (`state.js`) is deliberately one plain object that everyone reads and writes: `mode`
(`menu | play | paused | dead | win | settings | skills`), the clock (`time`, `dt`, time-scale `ts` for slow-mo,
`freeze` for hit-stop), `player`, and the arrays `enemies`, `projectiles`, `pickups`, `fx`, `timers`. Then `combo`,
`stats`, `element`, `boss`, and the Training Grounds fields (`training`, `trainAttack`, `trainRes`).

Why a global and not a nice architecture? Because it's a game, it's small, and grepping for `G.enemies` beats a
dependency-injection framework. Arrays get mutated **in place** (see `warm.js`'s `keep()`), because modules hold
references to them.

### 3.3 The frame (main.js `frame()`)
In order:
1. **Frame cap.** When `S.fpsCap` is set, we skip display refreshes until the next slot.
2. **Global input.** Skill tree, pause, respawn.
3. **Time scale and hit-stop.** `G.ts` eases toward `G.tsTarget` (slow-mo). While `G.freeze > 0` the game dt is 0
   (hit-stop), but particles still drift at 12 % so the freeze looks alive, not paused.
4. **Simulation.**
   - Player update
   - Story systems (arenas, roamers, checkpoints, hints) **or** training update
   - Timers, then enemies, projectiles and pickups
5. **Camera** with look-ahead and trauma shake. Then `stepEngine`: effects, particles, debris, flash lights, floating
   text and post-FX decay.
6. **World animation.** Level skyline and ripples, **or** the arena's crystals and grass.
7. **HUD and touch UI.** Both go through cached DOM writes.
8. **Render.** One `composer.render()`.
9. **Bookkeeping.**
   - Smoothed CPU and render ms, dynamic resolution, the FPS overlay
   - **Hitch log**: any frame over 12 ms is recorded with a per-system breakdown and the names of any shaders compiled
     during it

Per-system timing in steady combat on the owner's PC is under 1 ms of CPU total.

### 3.4 The event bus
`events.js` is four lines. Combat emits `hit`, `launch`, `launcher`, `airHit`, `spike`, `bounce`, `slam`, `land`,
`parry`, `kill` and `attack`. The DPS meter, the combo trials and a few sounds subscribe. That's how the Training
Grounds works without a single `if (training)` inside the combat code.

---

## 4. The systems, one by one

### 4.1 Rendering (`engine.js`)
- **Renderer:** WebGL2, ACES tone mapping. `antialias: false`, because AA is an optional MSAA render target instead.
- **Post chain:** `EffectComposer` (HalfFloat target, optional MSAA) → `RenderPass` → `UnrealBloomPass` (can run at
  half resolution) → a custom **FX pass** → `OutputPass`. The FX pass does chromatic aberration, a colour flash,
  desaturation on death, a vignette, and on High a **screen-space shockwave** (a ring that pushes UVs outwards).
- **Particles:** two `Points` pools, additive `glow` and normal-blended `dust`, used as ring buffers.
  - The shader samples a **sprite atlas drawn into a canvas at boot**: streak, smoke, droplet, rock chip, leaf,
    starburst, glint. Sprite 0 is the original soft procedural dot.
  - Streaks auto-rotate to their velocity, so sparks stretch along their path.
  - `emit(x,y,z, vx,vy,vz, colour, size0, size1, life, gravity, drag, sprite, spin)`
- **Debris:** two instanced box pools, lit and glowing, with bounce physics.
- **Effects:** `addFx(update)` registers a closure that runs each frame until it returns `false`. Rings, slashes, waves,
  meteors and pillars are all just closures. Helpers: `ring()`, `slash()`, `decal()`, `impactFlash()`, `shockwave()`,
  `sparks()`, `puff()`, `cubes()`, `flashLight()` (a pool of point lights), `floatText()` (damage numbers in the DOM).
- **Slash trails:** a crescent mesh plus a shader. The gradient runs along the arc, with an edge style per element:
  flame tongues, foam, stepped rock chips, wind streaks. With a Resonance imbue, the tail takes the secondary element's
  colour and edge.
- **Camera:** spring-damped follow with look-ahead, trauma shake (noise, squared falloff), FOV punch and zoom targets.
  `ZOOM_K = 0.68` keeps the heroes big. `cam.fovLock` and `cam.zoomLock` are debug overrides for screenshot scripts.

### 4.2 The look: toon materials (`toon.js`)
- `toonMaterial()`: `MeshToonMaterial` with a 4-step gradient ramp, plus a fresnel **rim light** injected in
  `onBeforeCompile`, plus an optional "duo" recolour. Every instance shares one program through
  `customProgramCacheKey`.
- `costumeMaterial()`: the hero body shader. More in 4.3.
- **Outlines:** the inverted hull method.
  - The skinned/smooth variant pushes vertices out along normals in view space.
  - The hard variant (for boxy enemies) pushes along the vertex direction from the object centre, so box corners stay
    joined.
  - Outlines are off on Potato/Low.

### 4.3 The heroes (`hero.js`): the part I'm proudest of
| Element | Body | Who they are |
|---|---|---|
| Fire | male | Bare-chested ember warlord: glowing flame tattoos, a horned asymmetric pauldron, flame crest |
| Water | female | Tide dancer: bandeau wrap, pearl fins, long hip sashes, flowing hair |
| Earth | male, scaled 1.14× wide | Stone breaker: huge rock pauldrons, a cracked glowing chest plate, gauntlets, orbiting shards |
| Air | female | Gale runner: feather pauldrons, wing fins at the ankles, streaming hair |

How a hero is put together:
1. **Body.** `SkeletonUtils.clone` of the base body, rotated to face +X and scaled to the element's height (about 2 m).
2. **Costume.** The body texture is only skin and underwear, so `costumeMaterial` paints clothes in the fragment shader
   using **bind-pose position zones** from the untouched `position` attribute: legs, boots, waist trim, torso (full
   tunic, chest band or bare), sleeves, forearm wraps. Bare skin gets **emissive element runes**: fire zig-zags, water
   ripples, earth cracks, air swirls. One material, no extra textures.
3. **Armour, mask and crown.** Authored as primitives in **T-pose model space** with `part(bone, geometry, material,
   position, scale, rotation)`. Then `bakeCostume()` merges them **per material into skinned meshes**, with every vertex
   rigidly weighted to its bone. Roughly 40 pieces become 4–5 draw calls.
4. **Mask.** A hair cap, plus a half-mask shell that wraps round to the cheek. In side view you only ever see the
   profile, so that wrap is what makes the mask read. Then a glowing eye slit (front and side), a brow ridge, a nose
   guard, and a per-element crown: flame spikes, rock crown, water fins, air feathers.
5. **Ribbons** (`ribbons.js`). Hair strands, a cape and hand trails are strips in the screen plane.
   - Hair and cape are spring chains anchored to the head and chest bones.
   - Trails are ring buffers of hand positions.
   - The shader has a style per element: flame tongues, flowing bands, blocky shards, thin streaming lines.
6. **Animation.**
   - `Animator` wraps `AnimationMixer` and crossfades named clips: idle, jog, sprint, jump start/loop/land, roll (the
     dash), hit, death, dance (victory), punches, sword swing, spell enter/shoot.
   - Attack clips are **speed-matched**: `CLIP_PEAK` is the fraction of each clip where the strike lands, so
     `speed = clipLength × peak / hitAt`. The visual hit lands on the frame the hitbox fires.
7. **Combat pose layer.** The library has no launcher, air combo, slam or guard. So `Hero.pose()` computes per-bone
   rotation deltas in the **model frame** (pitch, twist, lean) from the move's phase. `applyOverlay()` converts them to
   world space and applies them on top of the mixer, parents before children. On top of that come whole-body layers:
   lean, the spin on finishers, the dive tilt on the slam, and squash & stretch.
8. **Pool.** Building a hero (clone, bake, ribbons, buffer uploads) was a visible stutter at run start, so heroes are
   pooled per element. `release()` hides one; the next `acquireHero()` of that element gets it back. The warm-up builds
   all four at boot.

There's a procedural fallback: the old capsule character in `Player.buildLegacy()`. It's used if the GLBs fail to load.

### 4.4 The player controller (`player.js`) (updated)
- **States:** `free`, `attack`, `cast`, `dash`, plus `guarding` and `stun` flags.
- **Input buffering (updated):** buffers run on **real** time (`G.rdt`), so hit-stop and slow-mo don't stretch them: main .16 s, jump .14,
  dash .16, specials .16, ranged .12, guard .09. The **oldest** buffered press that can start wins. Up/Down/direction are latched when
  Main is pressed. A real hit taken clears every buffer. Coyote time 0.1 s, variable jump height, double jump, a dash with i-frames
  and one air dash. Hold Down to drop through slabs.
- **Attack kinds** are picked in `startAttack()`:
  - **ground:** the element's 3-hit combo, chained inside the cancel window.
  - **launcher (Up + Attack):** pops the enemy up. Jump in the cancel window to follow it.
  - **air (Attack in the air):** a 3-hit chain with **air stall**. 6 air swings until you land.
  - **slam (Down + Attack in the air):** hover wind-up, dive, shockwave, bounce.
  - **dashStrike (new):** Attack during or within 0.3 s after a Dash, if the Dash Strike node is owned (see §4.8).
  - Changing kind resets the combo counters.
- **Attack timeline (new):** startup → contact (`hitAt`) → active window (0.07 s, one hit per enemy per swing, recorded in `atk.hit`)
  → recovery with a cancel point (`cancelAt`). The animation clip is started at an offset so its peak lands on `hitAt`
  (`CLIP_PEAK` in `hero.js`). Swing duration is multiplied by the element profile.
- **Getting hit (new):** interrupts attack/cast/slam, plays the hit clip, clears buffers. Exception: **Stonewill**, and Earth's armoured
  finisher / Shoulder Charge, keep swinging during the wind-up.
- **Guard (updated):** tap or hold. Perfect-parry window `0.18 s × (1 + parry mods)`. Every extra press within 0.5 s shrinks it by 30 %
  (floor 30 %). A perfect parry opens a 0.45 s **counter window** (next main hit ×1.5 damage, ×2 poise). A block grants 0.12 s of
  i-frames so one attack cannot be blocked twice.
- **Charged Shot (new):** with the node owned, holding Ranged charges (0.7 s) and releasing fires the element's big shot. A tap still fires
  the normal shot at once, and holding no longer auto-repeats.
- **Element profile (new):** `ELEMENTS[key].prof` sets swing time, damage, poise, hit-stop, run speed, dash, jumps and fall (see §4.6).
- **Collision:** axis-separated AABB against `solidsNear()`. Steps up to 0.6 are auto-climbed.

### 4.5 Combat (`combat.js`)
`hitEnemy(e, base, opts)` is the heart of the game. In order:
1. **Damage (updated).** Base × skills × buffs × **element profile** × crit (10 %, ×1.75) × situational bonuses (brand +40 %, frostbite +45 %, crushing +80 %, vulnerable), then ×0.3 on the phase-2 boss shield.
2. **Knockback.** Heavies resist until they're staggered. Then poise and stagger.
3. **Statuses.** Burn, chill, stun.
4. **Resonance imbue**, on main attacks only:
   - fire: burn
   - water: chill
   - earth: a stun meter that pops at 100 %
   - air: pull and extra lift
5. **Juggle:**
   - `launch` → `launchEnemy()`. Brutes resist unless staggered, the boss never launches, flyers just get pushed.
   - In the air, `lift` → `juggleLift()` with **decay**: each air hit lifts `10 × 0.76^(n-1)`, and the fall gets
     heavier as the count goes up. After 6 hits, no more lift.
   - `spike` sends them down at -28, then they bounce once. `bounce` slams grounded enemies so they bounce too.
6. **Feedback.**
   - **(updated)** All of it comes from one `FEEDBACK` table (hit-stop, shake, FOV, aberration per kind: light … slam, parry, kill). Hit-stop is capped at 0.3 s and overlapping stops extend, never stack. Shake is spent from a per-frame budget.
   - The victim vibrates during hit-stop. Directional sparks, an impact starburst, a damage number. Sound by kind and material. Haptics.
   - Skill nodes that change a hit announce themselves with a throttled floating label (`proc()`).
7. **Bookkeeping.** Combo, energy gain, `emit('hit')`. Dummies refill their HP; everyone else checks for death.

Also in `combat.js`:
- `damagePlayer()` (updated): block, parry or real hit; it emits `playerHit` for every outcome. **Perfect parry**: hit-stop 0.22 s, slow-mo 0.22, a big aberration, rings, +25 energy, staggers the attacker or reflects the projectile, and fires the Riposte counter if that node is owned. The boss can be parry-broken once, then resists for 8 s.
- Projectiles: homing, gravity, pierce, deflect and reflect.
- Commit pickups with a magnet and a rising-pitch chain sound. Hearts.
- XP and level-ups.

### 4.6 Elements (`elements.js`)
Each element is one object:
- `main` holds `hits[]` (dur, hitAt, cancelAt, lunge, clip), a `strike(p, i)` function, and the M2 moves `launcher`,
  `air` and `slam`.
- `ranged`, `guard`, `s1` and `s2` each carry their numbers and a `cast()` function.

The four new moves share hitboxes and juggle rules, and get their flavour from small per-element FX tables:
| Element | Launcher | Slam |
|---|---|---|
| Fire | flame pillar + scorch | ember burst |
| Water | geyser + puddle | splash |
| Earth | a rock pillar mesh bursts up | debris + crack |
| Air | stacked updraft rings + leaves | leaf gust |

`groundWave()` and `melee()` helpers live here too, and the enemies use `groundWave` as well.

**Element profiles (new).** `prof: { atk, dmg, poise, hs, move, dash, jump, jumps, fall, grav }`:
| Element | Swing | Damage | Run | Dash cooldown | Signature |
|---|---|---|---|---|---|
| Fire | ×0.82 | ×1.0 | ×1.08 | 0.8 s | swings up to 22 % faster as the combo grows |
| Water | ×0.86 | ×1.12 | ×1.10 | 0.65 s | dash chills enemies it passes and cancels any swing |
| Earth | ×1.38 | ×2.0 | ×0.86 | 1.15 s | armoured 3rd hit, hit-stop ×1.35, poise ×1.8 |
| Air | ×0.64 | ×0.68 | ×1.28 | 0.5 s | 3 jumps, floaty fall, hit-stop ×0.7 |
Damage multipliers are a design target, not a measured balance.

**`MOVES` (new).** At the bottom of `elements.js`: per element `dashStrike(p)`, `charged(p, aim)`, `riposte(p, enemy)` and `dsCfg` (the
Dash Strike's timing). `player.js` dispatches the first two, `combat.js` the third (from `perfectParry`). **Colossal abilities**: Solar Flare
(Meteor), Leviathan (Tidal Wave), Mountainfall (Quake) and Maelstrom (Cyclone) are flags checked inside those casts.

### 4.7 Enemies (`enemies.js`) (updated)
| Enemy | Role | Tell | Counterplay |
|---|---|---|---|
| **Bug** (22 HP) | flanker | 0.54 s crouch + lunge arrow; pounce 0.6 s when there are several | dodge, punish the 0.8 s vulnerable window |
| **Null Pointer** | sniper | 0.9 s charge, aim line locks at 0.65 s, orb speed 9, max 2 orbs alive | break line of sight; parry/deflect |
| **Legacy Bot** | armoured bruiser | 1.0 s wind-up with a floor danger ring, hyper-armour while winding up | parry or slam; 1.5 s recovery (poise ×1.6) |
| **Dummy** | training only | | |
| **THE LEGACY MONOLITH** | boss | per attack | two real phases (below) |

- **Encounter director:** one melee, one ranged and one heavy attack token (`takeToken`/`giveToken`). Token-less enemies circle at ring
  distance. No attacks while off-screen (>8.4 m from the camera) or while you are in hit-stun. Chill slows tells with the enemy.
- **Boss:** phase 1 = slam → barrage → slam → summon. Phase 2 (entered once, with a shield) = sweep, double-wave slam, barrage, falling
  blocks, summon. The shield takes ×0.3 damage and ×2 poise; a poise break stuns once per 6 s and drops it. The first parry breaks it,
  then it resists for 8 s. It is immune to bounce and launch. The body check is a timed shove, not per-frame contact damage.
- **Construction:** procedural primitives (`mk()`), toon materials and hard outlines.
- **AI:** a per-type function gated by `busy` (staggered, stunned, airborne, knocked down, getting up, or "attack-back is off").
- **Airborne states:** launched → juggled → spiked → ground bounce (once) → knockdown (0.6–0.8 s) → get-up (0.35 s).
- **Reactions:** flinch tilt and squash, tumbling in the air, lying flat when knocked down (Euler order `ZYX`).
- **Arena bounds:** the boss reads `bx0`/`bx1`, so it works in the Training Grounds too.

### 4.8 Skills and the save (`skills.js`) (rewritten)
- **Trees:** per element, 3 mechanic branches + **Resonance**, 3 tiers each (ids `f1`..`f9`, `fr1`..`fr3` etc.).
  - **Tier 1 of every mechanic branch is a new move**: *Dash Strike* (branch 1), *Charged Shot* (branch 2), *Riposte* (branch 3), each unique per element.
  - **Tier 2** is a bundled power node (two old effects in one).
  - **Tier 3** is a mastery. Branch 2's is an **either/or fork** (`forks: [...]`, picked in a modal, re-pickable while owned): Armageddon / Solar Flare,
    Leviathan / Undertow, Crushing Weight / Mountainfall, Stormcaller / Maelstrom.
  - **Resonance:** Attunement (secondary-element picker), Harmony, Convergence.
- **Tempering:** a shared stat track (`TEMPER`: Vitality, Reservoir, Edge, Swiftness, Focus; 3 ranks each, 1 point per rank). Stats are not in the branches.
- **Points:** one per level, cap **24**. Everything costs 1 point except tier 3 (2). Branches total 15, Tempering up to 15 more: you cannot own everything.
- `computeMods(el, owned, res, temper, forks)` folds everything into `player.mods` (numbers add, booleans OR).
- **Save:** `localStorage['elemental-commit-save-v1']`, **save version 3**: `{ v, prog: { [el]: { level, xp, owned[], res, temper{}, fork{} } }, best, train }`.
  Version bumps refund owned nodes (points derive from level, so nothing is lost) and keep level, XP, Resonance and records.
  Settings are separate, in `'elemental-commit-settings-v1'`.
- **Skill UI:** `renderTree()` in `ui.js` shows a NEW MOVE tag on tier-1 nodes, the fork picker (`openForkPicker`) and the Tempering row.

### 4.9 The level (`world.js`)
- **Lane:** `laneH[]` holds one height per column (`null` is a pit), written by tiny helpers (`flat`, `ramp`, `pit`).
  It's rendered as instanced boxes whose caps react to impact ripples. Behind it is a parallax skyline of instanced
  rows (`Q.rows` of them animate), plus code panels, git nodes, fireflies and checkpoint poles.
- **Terrain hook:** `terrain.active` can replace `groundAt`, `solidsNear` and `worldLen`. That's how the Training
  Grounds has its own floor. `setLevelVisible()` hides every object `buildWorld()` created.

### 4.10 The Training Grounds (`arena.js`, `training.js`)
- **Scenery:** a style test for the future world.
  - A painterly gradient sky with stepped cloud bands and **Corruption rifts** glitching across the horizon.
  - A painted ground slab and path, layered hills with colour-fade depth, ruined arches and columns.
  - Instanced trees, rocks, grass tufts (they bend when an impact ripple passes) and flowers.
  - Instanced magenta/cyan **Corruption crystals** that snap-jitter, plus floating shards.
- **Sandbox:** 3 dummies, a **DPS meter** (5 s window, total, max combo, last hit, juggle hits/height/time and best), a
  spawner for every enemy and the boss, toggles (enemies attack back, infinite energy, no cooldowns, **Combat debug**), an element
  switch, and a Resonance switch at max tier.
- **Endless Waves (updated):** waves are composed by **role** (`waveList(n)`): bugs `min(6, 2 + n/2)`, pointers from wave 3, a brute on even waves from 4 and an extra one every 5th. A score multiplier from combo and wave, the best score saved.
- **Combo Trials:** eight trials written as data, `{ steps: [{ text, ev, test }] }`, driven by bus events. There's a
  per-step timeout, and a trial resets if the dummy lands mid-juggle. The first clear of each gives 40 XP.
- **The Lab panel:** a DOM dock on the right. It's collapsible and starts collapsed on touch devices.

### 4.11 Input and touch (`input.js`, `touch.js`)
**Keyboard:**
| Action | Key | Action | Key |
|---|---|---|---|
| Move | A / D | Main attack | J |
| Jump | Space | Ranged | K |
| Up (launcher) | W / ↑ | Defend | **F** (L still works) |
| Down (slam, drop through) | S / ↓ | Specials | Q / E |
| Dash | Shift | Skills / Pause | Tab / Esc |

Mouse: left click attacks, right click fires ranged and aims at the cursor.

**Touch:**
- Virtual actions go through `vDown`/`vUp`.
- The stick sets `up` and `down` past ±0.55–0.62.
- Flick-up-to-jump is a setting, off by default, because it fought the launcher.

My test scripts drive the game through the same virtual inputs. That's much more reliable than real key presses when
the frame rate is low.

### 4.12 Audio (`audio.js`) (updated)
Everything is WebAudio oscillators and filtered noise, through a master **limiter**, a **low-pass that dips during slow-motion**, a short
convolution reverb whose impulse is generated noise, and fake ducking on big events.

- **Hits** are `transient + body + tail` (80–150 ms), coloured by element and material (flesh / metal / wood), with a combo pitch rise of at
  most 7 semitones and ±1–2 semitones of random variance. `sfx.hit(kind, combo, material)` takes the same kinds as `FEEDBACK`.
- **Enemy tells:** each enemy has its own telegraph sound (bug, pointer, bot, boss, summon). Enemy shots differ from the player's fireball.
- **Moves:** element whooshes, launcher, air hits, spike, bounce, slam tails, a stagger "crack", a parry made of a bell stack and a sub drop.
- **Voice control:** a per-sound retrigger floor and max plays per 250 ms (`GATE` table).
- **Music:** generative. A minor-pentatonic arp over a pad, a combat groove, a heartbeat at low HP, ambient wind.
- **Measured, not heard:** `audio._record(ms)` renders to WAV (offline). Light hit ≈ −9 dB peak, heavy ≈ −2 dB, parry ≈ −1 dB, no clipping.
  **Nobody has listened to it on headphones yet.** No sampled audio was added.

### 4.13 Settings and graphics tiers (`settings.js`, `settingsUI.js`)
- **Presets:** Auto, Potato, Low, Medium, High, Ultra. Each is a set of **tiers**. `deriveQuality()` turns tiers into
  the engine numbers in `Q`.
- **Advanced:** per-option overrides stored in `S.gfx`, which makes the preset show as "Custom":
  - render scale, hi-DPI cap, dynamic resolution
  - shadows, bloom, MSAA, outlines, particles, hair/capes, trails, decals, distortion, lights, background detail
- **Frame cap.**
- **Applying changes:** `applyQuality()` applies a change live. If shader programs change (lights, shadow type,
  outlines, ribbon or trail counts, particle pools), main clears the hero pool, re-runs `warmAll()` behind an
  "Applying graphics…" overlay, and rebuilds the current player's model.
- **Dynamic resolution:** every 1.5 s, if frames average over 22 ms, it drops the render scale by 10 % (to 55 % at the
  lowest). Then it sheds bloom, then shadows, then particles. It creeps back up when there's headroom.

---

## 5. Performance: the rules I learned the hard way

1. **Never compile a shader during play.** On ANGLE/D3D11 a compile costs 50–200 ms.
   - Every new material variant (a new parameter, a new shadow flag, skinning, instancing) must exist in `warm.js`'s
     scene.
   - Compile against the **composer's render target** (`compileScene()`), never the canvas.
   - A real render is what builds the shadow-depth variants, so the warm-up does one.
2. **Don't `dispose()` transient effect materials.** Freeing the last user of a program frees the program.
3. **Pool anything expensive to build:** heroes, particles, decals, flash lights.
4. **HUD writes go through `put()`**, the cached DOM writer.
5. **Measure on the real GPU.** Headless Chromium with `--use-angle=d3d11` uses the owner's actual GPU. Headed Chrome
   through Playwright (`channel: 'chrome'`) gives true vsync frame pacing. SwiftShader is only good for screenshots.
6. **The watchdog:** `window.__game.perfStats.hitches`. Any entry with `newPrograms > 0` is a bug. `perfStats.gaps`
   catches stalls that happen outside our frame.

Where the numbers stand, on an RX 6600 XT at 1080p High:
- about 2.3 ms GPU and under 1 ms CPU per frame
- 165 fps (vsync) in heavy combat on every preset
- worst frame 18 ms in combat and 42 ms at run start
- zero runtime compiles

The iPhone 13 hasn't been re-measured since M2 landed. That's the big open question.

---

## 6. Assets and licences
- **Bodies:** `assets/hero/body_m.glb` and `body_f.glb`. These are Quaternius Universal Base Characters (CC0), stripped
  of eyes and hair, with 512 px WebP textures, no normal/roughness maps, and quantized normals and UVs.
- **Animations:** `assets/hero/anims.glb`. That's 16 clips from the Quaternius Universal Animation Library (CC0), with
  finger tracks dropped and the rest resampled.
- **Total:** about 1.3 MB.
- **Code:** three.js r170 (MIT) plus addons: GLTFLoader, SkeletonUtils, BufferGeometryUtils and the postprocessing
  passes.
- Credits are in [`vendor/CREDITS.md`](../vendor/CREDITS.md).
- Everything else (costumes, VFX, shaders, textures, scenery, audio) is original and generated in code.

The optimisation scripts used gltf-transform and live outside the repo. To redo it:
- drop the eye and hair meshes and the normal/roughness maps
- resize textures to 512 px WebP
- quantize normals, UVs and weights (not positions: the costume shader reads raw bind-pose positions)
- keep the wanted clips, drop finger, scale and non-pelvis translation tracks, then `resample()` and `dedup()`

---

## 7. Debugging and testing toolbox
- **`window.__game`** exposes `G, startRun, startTraining, TR, EV, spawnEnemy, giveXP, prog, ENG, Q, perfStats, In, cam,
  …`. Some handy ones:
  - `__game.cam.fovLock = 8` gives you a telephoto close-up.
  - `__game.In.vDown('up'); __game.In.vDown('main')` performs a launcher from the console.
  - `__game.perfStats.hitches` lists every frame that ran long and why.
- **The Playwright approach:**
  - Boot the page and wait for `#loading.done`.
  - Drive the game with `startTraining()` and virtual inputs.
  - Subscribe to the event bus to assert gameplay: did the dummy launch, did the trial complete, did the chill apply.
  - Take cropped screenshots around the player for look reviews.
  - Sample rAF timestamps for frame pacing.
  - For shader work, list `renderer.info.programs` before and after.
- **Combat debug (new):** Lab → *Combat debug* shows attack phase, contact and cancel times, buffers, guard time vs parry window, hit-stop, time scale, tokens and each enemy's state/tell/poise. `__game.dbg()` returns the same as JSON; the event bus emits `playerHit {result, amount}`.
- **Lesson learned:** test the UI by **clicking it**, not by calling the function the button calls. That's exactly how
  the dead Training Grounds buttons slipped through.

---

## 8. How do I…

**…add an enemy?** Write `buildX(x, y, o)` with `base('x', …)` and `mk()` parts. Add an `aiX(e, dt, tm)` function. Then
register it in the two type tables in `spawnEnemy()` and `updateEnemies()`, give it an `animate` branch, and add it to
the warm-up list in `warm.js` and to the sandbox spawner chips in `training.js`.

**…add a skill node or a new move?** Add an `n(id, branch, tier, name, desc, fx)` entry to `SKILLS[el]` in `skills.js`. `fx` booleans/numbers land in
`player.mods`; check the flag where it matters (`combat.js`, `elements.js`, `player.js`). A description starting `NEW MOVE: ` gets the tag in the tree. Show a
`proc('NAME', x, y)` label when it fires. A new *kind* of attack goes through `startAttack()` and `MOVES[key]`. If you change what an existing id means, bump the save version.

**…add or change an ability?** Edit the element object in `elements.js`. Numbers live next to the `cast` and `strike`
functions. If the ability creates a material with a *new* parameter combination, add a matching mesh in `warm.js`.

**…add a combo trial?** Append `{ id, name, desc, steps: [{ text, ev, test? }] }` to `TRIALS` in `training.js`. `ev` is
any bus event name.

**…add a graphics option?** Add a tier to every preset in `QUALITY`, map it in `deriveQuality()`, and list it in
`GFX_OPTS`. If it changes shader programs, add it to the return value of `applyQuality()` so it triggers a re-warm.

**…tweak how a hero looks?** Use `buildCostume()` and the per-element kits (`fireKit` etc.) in `hero.js`. Positions are
T-pose model space in metres: +X is the character's left, +Z is forward. Landmarks on the male body: head joint at
y 1.60, shoulders at x ±0.21, y 1.46, elbows at x ±0.46, wrists at x ±0.71, pelvis at y 0.95, knees at y 0.54. The female
body is about 3 % smaller.

---

## 9. Known issues and debt (the honest list) (updated)
- **Not verified on an iPhone 13** since Milestone 2, and the Combat Lock drop was never tested there at all.
- **The audio has been measured but never heard** by its author.
- **Damage balance between elements is a design target** (the `prof` multipliers), not a measured result.
- **Colossal abilities and the 12 new moves** run without errors but were not reviewed visually frame by frame.
- **Scripted element switches in one page** (`startTraining` water → earth → air) can still show new shader programs on first use. It is identical
  before the Combat Lock drop and not understood; the normal flow was clean.
- The combat pose layer still needs a polish pass at full frame rate. Hands are open palms. Guard has no dedicated clip (pose only).
- The arena's prop density is fixed at boot. The hero pool and warm-up make a graphics switch take about 0.5 s.
- `main.js` still owns too much (story arenas, training lifecycle, the frame loop).
- Deferred: Shieldling archetype, per-tier particle budget with many enemies.

---

## 10. What's next (updated)
See **[`NEXT_STEPS.md`](NEXT_STEPS.md)**: a researched list of what the game is still missing, ranked, with a proposal for something unique.

That's the project. It's small, it's loud, and it's mine. Go hit something. ✦


---

## 11. Superseded facts (these used to be true)
| Old statement | Status | Now |
|---|---|---|
| Buffers last 0.14–0.22 s (game time) | OUTDATED | real-time buffers, .09–.16 s, first press wins (§4.4) |
| Perfect-parry window starts at 0.22 s | OUTDATED | 0.18 s, shrinks 30 % per extra press |
| Hit-stop 45–85 ms scaled by weight | OUTDATED | `FEEDBACK` table, 40–220 ms, capped 0.3 s |
| Perfect parry stacks hit-stop 160 ms | OUTDATED | 0.22 s |
| Skill trees: 4 branches × 3 tiers, 12 nodes, level cap 16 | OUTDATED | 3 mechanic branches + Resonance, forks, Tempering, cap 24 |
| Skill ids and meanings (e.g. `f1` = a stat) | OUTDATED | all ids were rewritten; save version 3 refunds nodes |
| Save format `{ level, xp, owned, res }` | OUTDATED | adds `v`, `temper`, `fork` |
| Endless waves use a random budget `2 + 1.7 × wave` | OUTDATED | role-composed waves |
| Boss: "a rage phase at 50 %" | OUTDATED | two real phases, shield, pattern lists, parry-break once |
| Enemies attack whenever their cooldown allows | OUTDATED | attack tokens (1 melee, 1 ranged, 1 heavy) |
| Bug HP 34 | OUTDATED | 22 |
| Elements differ in moves only | OUTDATED | per-element tempo/power profiles and signatures |
| The M2 audio was never listened to | STILL TRUE | measured offline now, still not heard |
| "Maybe: perfect dodge, ultimate meter, elemental reactions, gamepad" | MOVED | see `NEXT_STEPS.md` |

## Addendum: Combat Lock
See `docs/COMBAT_LOCK.md` for the combat rules, `src/dbg.js` for the debug overlay (Lab → Combat debug) and `skills.js` for the move-based trees.
