> ⚠ **HISTORICAL — implemented.** This was the plan for Milestone 2. It shipped, then the Combat Lock drop changed a lot of it (skill trees, enemies, parry, audio).
> For what is true now read `DEVELOPER_GUIDE.md`, `COMBAT_LOCK.md` and `NEXT_STEPS.md`. Statements below about a 9-node tree, 16-level cap, hit-stop values or enemy behaviour are **OUTDATED**.

# Milestone 2 — "Combat Feel & Animation" (+ Training Grounds)

## Context
The vertical slice is live on GitHub Pages and runs smoothly: about 59 fps at worst on an iPhone 13 on High. Your feedback was that it's responsive but basic in places: simple attacks, simple animations, simple textures, and a programmer-world concept that isn't done well yet.

Your choices for this milestone:
- **Direction (long-term):** an elemental fantasy world eaten by a digital **Corruption**, in a **stylized toon/painterly** look.
- **This milestone:** **combat feel + animation first.** The world overhaul is a later milestone.
- **Hero:** a **masked spirit warrior**, built from **free CC0 assets plus procedural** extras.
- **Magic, no weapons.**
- **Air combos and launchers,** controlled with **Up + Attack.**
- **Secondary element** earned through the **skill tree.** It **imbues your main attacks** and adds no new buttons.
- **A new Training Grounds arena** with dummies and a DPS meter, an enemy spawner, endless waves, and combo trials. The current level stays as it is.
- **One big drop,** web only. Nothing may block a future desktop app (Tauri or Electron, decided later).
- **Hard constraint:** keep phone performance (iPhone 13 on High stays around 60 fps) and every feature must work on touch.

## Asset source (checked)
Asset websites (itch.io, kenney.nl, quaternius.com, poly.pizza) are blocked from this environment, but **public GitHub repos can be cloned**. I confirmed `KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0` is reachable. It is **CC0**, with rigged low-poly characters, **75 shared animations**, glTF files, and a single gradient-atlas texture that suits toon shading. The plan builds the hero on this rig, starting from the hooded Rogue or Mage. If a needed clip is missing, I'll build it from the closest existing clip plus a procedural offset. As a fallback, three.js's CC0 `RobotExpressive` model is also reachable.

## Work plan

### A. Asset pipeline
- Vendor `GLTFLoader` and `SkeletonUtils` from three r170 into `vendor/addons/` (alongside the existing postprocessing addons). Credit KayKit in `vendor/CREDITS.md` (CC0, so credit is courtesy, not required).
- Copy only the needed `.glb` files and the atlas into `assets/hero/`. Budget: 1.5 MB or less. Paths stay relative so they work on GitHub Pages and a desktop wrapper.
- Add `src/assets.js`: a preloader with progress shown on the existing `#loading` screen, and the game starts only when assets are ready.

### B. Hero: masked spirit warrior (`src/hero.js`)
- Replace the procedural body built in `Player.build()` (`src/player.js`). Keep all of `Player`'s movement, guard, dash and casting logic, and the scarf, which becomes the cape.
- **Toon look:** a shared `toonMaterial()` (MeshToonMaterial with a 3–4 step gradient map, plus a fresnel rim light injected with the same `onBeforeCompile` approach as `darkenBelow()` in `src/world.js`). Add a cheap **inverted-hull outline** for hero and enemies, which also works on mobile.
- **Spirit parts on bones:** a carved mask on the head bone with glowing eye slits. Elemental "hair" and cape use shader-animated ribbons per element: flickering flame, flowing water, orbiting stone shards, streaming wind. They're tinted from `ELEMENTS[key].color`/`color2` in `src/elements.js`.
- **`src/animator.js`:** an AnimationMixer state machine with crossfades. It maps player states to clips: idle, run, jump/fall/land, dash, the 3-hit combo, launcher, air attacks, slam, cast, guard, hurt, death and victory. Clip speed is scaled to each attack's `dur`/`hitAt`.
- Keep the procedural layers on top: lean, squash/stretch, hand glows, blink on i-frames.
- Attack data in `elements.js` `main.hits[]` gains `clip`, `speed`, and startup/active/recovery windows, so the visuals match the hitboxes.

### C. Combat depth (`src/player.js`, `src/combat.js`, `src/enemies.js`)
- **New moves (all elements):**
  - Up + Attack on the ground: a **launcher** that pops the enemy upward, and the player can follow with a jump.
  - Attack in the air: a 3-hit **air chain** with an **air stall** (reduced gravity while hitting).
  - Down + Attack in the air: a **slam** with a ground bounce and an element shockwave, reusing `groundWave()`.
  - The last air hit can **spike** the enemy down.
  - Each element gets its own flavour per move. Example: Earth's launcher is a rock pillar, Air's is an updraft.
- **Enemy airborne/juggle states:**
  - New enemy states: airborne, juggled, ground-bounce (once), knockdown, and get-up.
  - **Juggle decay:** each air hit shortens the hang time, so there are no infinite combos.
  - The brute and boss resist launching until their poise is broken (reuses `poise`/`stagger`).
- **Hit reactions and impact:** directional hit sparks, 1–2 frame impact flashes (white silhouette via the existing `e.flash`), a micro camera zoom (`punchFov`), procedural flinch/recoil poses, and knockback curves.
- **Controls:**
  - **Keyboard:** W and ↑ become "up" for launchers, and **Space stays jump**. This is a change: W no longer jumps.
  - **Touch:** stick held up + Attack launches. Flick-up-to-jump becomes a setting, **off by default**, so it doesn't fight the launcher.
- **Secondary element ("Resonance"):** add a **4th skill-tree branch** to every element in `src/skills.js`.
  - T1 opens a pick-1-of-3 modal for the secondary element.
  - T2 and T3 strengthen the imbue.
  - The imbue adds the secondary element's status and VFX tint to main attacks, using the existing `hitEnemy` statuses: burn, chill, stun buildup, pull/extra knock-up.
  - The skill-tree UI (`renderTree` in `src/ui.js`) goes to 4 columns, with a phone layout check.

### D. VFX upgrade (procedural, shader-based, in `src/engine.js`)
- Replace the flat crescent `slash()` with **shader slash trails**: gradient plus scrolling noise, with an edge style per element (flame tongues, foam, rock chips, wind streaks).
- Add **ribbon trails** that follow hand bones during attacks.
- Generate a **particle sprite atlas** in a canvas at boot (glow, spark streak, smoke, droplet, chip, leaf). The `Particles` shader gains a sprite index, rotation, and velocity-stretched sparks.
- Add **ground decals** (scorch, puddle, crack) that fade out, plus a stronger hit-flash sprite.
- Screen-space shockwave distortion runs on **High only**.
- Everything respects the `Q` presets and `Q.budget`. All new materials are added to `warmup()` so no shaders compile mid-fight.

### E. Training Grounds (`src/arena.js`, a new menu entry)
- A small arena that previews the new art direction: painterly gradient sky, toon terrain with grass tufts, stone ruins, and Corruption glitch crystals. This is a style test, not the world overhaul.
- **Sandbox:**
  - Dummies with a **DPS meter panel** showing DPS, total damage, max combo, and juggle time/height.
  - An **enemy spawner menu** listing every enemy and the boss.
  - Toggles: enemies attack back, infinite energy, no cooldowns, and an element/secondary switcher.
- **Endless Waves:** escalating mixed waves, score and wave counter, and a best score saved via `skills.js` storage.
- **Combo Trials:** about 8 data-driven trials, for example `launch → air ×3 → slam`, with step-by-step on-screen guidance and completion rewards.
- **New `src/events.js` bus:** combat emits `hit`, `launch`, `airHit`, `slam`, `parry` and `kill`. The DPS meter, trials and haptics subscribe to it.

### F. Enemies (existing, procedural)
- Apply the toon material and outlines to the Bug, Null Pointer, Legacy Bot and Monolith, and add the new reaction states. Add a **Dummy** enemy type.
- A full enemy model swap waits for the world milestone.

### G. Performance and compatibility
- **Budget:** one skinned hero (GPU skinning), outlines add about one draw per mesh, and trails are pooled.
- Re-run the existing benchmarks: the CPU profile for no runtime compiles, the per-system ms table, and the phone preset comparison.
- **Shed new costs on phones:** outlines and distortion are off on Low, and trails are reduced on Medium.
- **No desktop blockers:** relative asset paths, no required service worker, and no browser-only APIs without fallbacks.

### H. Docs
- Update README controls (W = up, Space = jump, launcher/air/slam, Training Grounds).
- Add `docs/MILESTONE_2.md`, and update `docs/PERFORMANCE.md` with the new measurements.

## Out of scope this milestone
Main-level reskin and world overhaul, new levels and bosses, perfect dodge, the ultimate meter, the full elemental reactions system, and desktop packaging.

## Verification
- Headless Playwright scripts in the scratchpad, on desktop plus iPhone-landscape emulation with CDP multi-touch, as before:
  - Assets load with no console errors.
  - The animation mixer advances and the expected clips play per state.
  - Launcher test: a dummy goes airborne (y > 2) after Up + Attack, an air chain keeps it up, juggle decay ends it, and the slam causes a ground bounce. Run it with both keyboard and touch input.
  - Buying the Resonance node and picking a secondary applies its status on main hits.
  - All three arena modes run, and a trial completes from scripted inputs.
  - Profile: no shader compiles mid-fight. Per-system CPU stays close to today's ~1 ms on this machine. The preset comparison is repeated.
  - Screenshots of the hero, VFX, skill tree (4 branches, phone too) and arena are reviewed.
- Then push to `main` (Pages redeploys automatically). You test on the iPhone 13 (Show FPS on), and on PC when ready.
