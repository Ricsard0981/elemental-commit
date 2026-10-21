# Elemental Commit — the developer guide

> Everything about this project, from the first empty folder to today, written down so that future me (or you) can pick it
> up cold. Part devlog, part architecture doc, part "here's where the bodies are buried".

---

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

### 4.4 The player controller (`player.js`)
- **States:** `free`, `attack`, `cast`, `dash`, plus `guarding` and `stun` flags.
- **Input buffering:** buffers last 0.14–0.22 s and work even during hit-stop. Coyote time is 0.1 s. Variable jump
  height. Double jump, and a triple jump through a skill. A dash with i-frames and one air dash. Hold Down to drop
  through slabs.
- **Attack kinds** are picked in `startAttack()` from where you are and what you're holding:
  - **ground:** the element's 3-hit combo, chained inside the cancel window.
  - **launcher (Up + Attack):** pops the enemy up and gives you a small hop. Jump in the cancel window to follow it.
  - **air (Attack in the air):** a 3-hit chain with **air stall** (gravity × 0.1, fall speed capped while swinging).
    The 3rd hit **spikes**. You get 6 air swings until you land, so there's no infinite hover.
  - **slam (Down + Attack in the air):** hover wind-up, dive at -42, hit everything on the way down, then on landing an
    element shockwave and everything nearby bounces off the floor.
- **Guard:** a perfect-parry window that starts at 0.22 s and grows with skills, plus element-specific reduction and
  knockback.
- **Collision:** axis-separated AABB against the column solids from `solidsNear()`. Steps up to 0.6 are auto-climbed.

### 4.5 Combat (`combat.js`)
`hitEnemy(e, base, opts)` is the heart of the game. In order:
1. **Damage.** Base × skills × buffs × crit (10 %, ×1.75) × situational bonuses (frostbite, crushing, vulnerable).
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
   - Hit-stop of 45–85 ms scaled by weight, camera shake.
   - Directional sparks with an element sprite, an impact starburst, a micro FOV punch on main hits, a damage number.
   - Sound, with the pitch rising as the combo grows. Haptics.
7. **Bookkeeping.** Combo, energy gain, `emit('hit')`. Dummies refill their HP; everyone else checks for death.

Also in `combat.js`:
- `damagePlayer()`: block, parry or real hit. **Perfect parry** stacks hit-stop 160 ms, slow-mo 0.22, a big aberration,
  a shockwave, rings and +25 energy, and staggers the attacker or reflects the projectile.
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

### 4.7 Enemies (`enemies.js`)
| Enemy | Role |
|---|---|
| **Bug** | melee lunge |
| **Null Pointer** | flying caster with parry-able orbs |
| **Legacy Bot** | heavy brute: telegraphed smash plus a ground wave |
| **Dummy** | training only: infinite HP, walks home |
| **THE LEGACY MONOLITH** | boss: slam, barrage, summon, falling blocks; a rage phase at 50 % |

How they're built and how they behave:
- **Construction:** procedural primitives (`mk()`) with toon materials and hard outlines.
- **AI:** a per-type function gated by `busy`. Busy means staggered, stunned, airborne, knocked down or getting up, and
  in the sandbox also "attack-back is off".
- **Airborne states:** launched → juggled → spiked → ground bounce (once) → knockdown (0.6–0.8 s) → get-up (0.35 s).
  Gravity is floaty going up (26 + 4 per juggle hit) and heavy when spiked (70).
- **Reactions:** a flinch tilt and squash on every hit, tumbling in the air, lying flat when knocked down. The group
  uses Euler order `ZYX`, so the tilt is in world space whichever way they face.
- **Arena bounds:** the boss reads `bx0`/`bx1` for its rain and summon spots, so it works in the Training Grounds too.

### 4.8 Skills and the save (`skills.js`)
- **Trees:** 4 branches × 3 tiers per element. The 4th branch is **Resonance**:
  - **Attunement:** opens the secondary-element picker.
  - **Harmony:** stronger imbue.
  - **Convergence:** finishers also detonate the secondary element.
- **Points:** you get one per level. The level cap is 16, which is enough to buy all 12 nodes.
- `computeMods()` folds the owned nodes into `player.mods` (numbers add, booleans OR), then resolves `resKey`.
- **Save:** `localStorage['elemental-commit-save-v1']` holds `{ prog: { [el]: { level, xp, owned[], res } },
  best: { [el]: { score, rank } }, train: { endless, 'trial:t1'.. } }`. Settings are separate, in
  `'elemental-commit-settings-v1'`.

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
  spawner for every enemy and the boss, toggles (enemies attack back, infinite energy, no cooldowns), an element
  switch, and a Resonance switch at max tier.
- **Endless Waves:** a budget per wave (`2 + 1.7 × wave`), brutes from wave 4, a double brute every 5th wave, a score
  multiplier from combo and wave, the best score saved.
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

### 4.12 Audio (`audio.js`)
Everything is WebAudio oscillators and filtered noise, run through a compressor, a **low-pass that dips during
slow-motion**, and a short convolution reverb whose impulse is generated noise.

- **Hits** are layered: a transient click, a noise body, a pitch-dropping "thump" and a sub thump on big hits. Crits
  add a bell and a sparkle arpeggio. Dummies sound like wood.
- **Moves** have their own sounds: element-specific whooshes, a launcher "whoomph", a rising chime per air hit, a spike
  whistle-thud, a ground-bounce boom, element slam tails, and a parry made of a crystalline bell stack, a sub drop and
  a shimmer.
- **Voice throttling:** low-priority layers drop when more than 44 voices started in the last 140 ms.
- **Music:** generative. A minor-pentatonic arp over a pad, with a kick/snare/bass/hat groove in combat and a heartbeat
  at low HP. There's ambient wind, and birds in the arena.

Honest note: the M2 audio was designed carefully but **never actually listened to by its author**. Tune by ear.

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
- **Lesson learned:** test the UI by **clicking it**, not by calling the function the button calls. That's exactly how
  the dead Training Grounds buttons slipped through.

---

## 8. How do I…

**…add an enemy?** Write `buildX(x, y, o)` with `base('x', …)` and `mk()` parts. Add an `aiX(e, dt, tm)` function. Then
register it in the two type tables in `spawnEnemy()` and `updateEnemies()`, give it an `animate` branch, and add it to
the warm-up list in `warm.js` and to the sandbox spawner chips in `training.js`.

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

## 9. Known issues and debt (the honest list)
- **The combat pose layer needs a polish pass** at full frame rate. It was tuned from still frames.
- Hands are open palms, because finger tracks were dropped to save size.
- The iPhone 13 hasn't been re-measured since M2. It needs a real device session with Show FPS on.
- The M2 audio was never heard by its author.
- The arena's prop density is fixed at boot, so changing "Background detail" only affects the level until a reload.
- Particle pools resize on preset change, but the hero pool and warm-up are the slow part of a switch (about 0.5 s
  behind the overlay).
- `main.js` still owns too much: story arenas, training lifecycle, the frame loop. It will want splitting when the
  world overhaul lands.

---

## 10. A tiny peek at what's next
- **The world overhaul.** Goodbye contribution graph, hello elemental fantasy world eaten by the **Corruption**. The
  Training Grounds is the style test for it.
- **New levels and bosses** built for launchers and juggles from the start.
- Maybe: perfect dodge, an ultimate meter, elemental reactions (steam, mud, firestorm, sandstorm), gamepad support, and
  the desktop build.

That's the project. It's small, it's loud, and it's mine. Go hit something. ✦


## Addendum: Combat Lock
See `docs/COMBAT_LOCK.md` for the combat rules, `src/dbg.js` for the debug overlay (Lab → Combat debug) and `skills.js` for the new mechanic trees (forks, Tempering).
