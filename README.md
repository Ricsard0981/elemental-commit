# ELEMENTAL COMMIT

> A side-view **3D** elemental action game that lives inside a **GitHub contribution graph**.
> Pick **Fire, Water, Earth or Air**, fix the bugs, parry the review comments, and merge into `main`.

**Play:** `https://<your-user>.github.io/elemental-commit/` — deployed by the GitHub Actions workflow in `.github/workflows/pages.yml` (enable it once under *Settings → Pages → Source: GitHub Actions*).

Zero build step. The four heroes are built on two CC0 base bodies + a CC0 animation library (about 1.3 MB in `assets/hero/`, credits in `vendor/CREDITS.md`) and dressed in code — costumes, masks, hair, capes, VFX and shaders are original; all audio is synthesized with WebAudio. Just open `index.html` through any static server:

```bash
npx http-server -p 8080 .   # or: python3 -m http.server 8080
```

## The vertical slice

One complete level ("`main` branch"), start to finish, ~8–12 minutes:

1. Run through the contribution-graph skyline, collect **commits** (currency/score) and tutorial hints.
2. Hit **checkpoints** (`commit a41f9c2`) — they heal you and become your respawn.
3. Clear two **Review gates** (arena fights, 3 waves each). Gates turn from `REVIEW REQUIRED` to `APPROVED ✔`.
4. Defeat the boss — **THE LEGACY MONOLITH** (two real phases: the second adds a shield, a sweep, a double-wave slam and falling blocks; break its poise, don't spam parries).
5. Earn a rank (S/A/B/C), keep your XP and skill points, and replay with another element.

### Enemies
Enemies attack in turns (one melee, one ranged and one heavy attacker at a time) and always telegraph.
| Enemy | Role | Tell | Counter |
|---|---|---|---|
| **Bug** | Flanker, dies in 1–2 hits | 0.5 s crouch + lunge arrow | Dodge, then punish its recovery |
| **Null Pointer** | Sniper | 0.9 s charge + aim line that locks | Break line of sight, or parry/deflect the orb |
| **Legacy Bot** | Armoured bruiser | 1 s wind-up, danger ring on the floor | Parry or slam it; punish its 1.5 s recovery |
| **The Legacy Monolith** | Boss, two phases | slam, barrage, sweep, summon, falling blocks | Parry-break it once, then break its poise |

## Phones & tablets

Touch controls switch on automatically on touch screens (or force them in **Settings**). The game plays in landscape and asks you to rotate if you're in portrait.

- **Floating analog stick** on the left half. It appears under your thumb, follows you past the rim, and has walk/run zones. Push down to drop through slabs, or flick up to jump.
- **Thumb-arc action cluster** on the right. Attack (with combo pips), Jump, Dash, Defend (glows gold during the perfect-parry window), Ranged, and both specials. Each button shows a cooldown pie, an energy-starved state, and a "ready" pulse.
- **Drag to aim**: hold *Ranged* to fire with aim assist, or drag off it to aim manually. A dotted guide line shows the direction in the world.
- **Slide between buttons** without lifting your thumb (attack → jump → dash).
- **Haptics** for hits, crits, kills, blocks, parries, damage and level-ups (Android; iOS Safari doesn't expose vibration).
- **Settings**: button size and opacity, left-handed mirror layout, vibration, fullscreen + landscape lock, quality preset, FPS counter, screen-shake amount, reduced flashing, aim assist, and volumes.
- **Installable**: add it to your home screen (web manifest, fullscreen, landscape).
- Auto-pauses when the app is backgrounded or the phone is rotated.

### Performance
Quality presets (Low / Medium / High) scale pixel ratio, shadows, bloom, particle budget, the number of animated skyline rows and the flash-light count. **Auto** (the default) picks Medium on phones and High on desktops. It then runs **dynamic resolution**: when frames run long it lowers the render scale to 55%, and if that's still not enough it drops bloom, then shadows, then particles. Benchmarks are in [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md).

## v2: the "Slasher" update (this branch)
Slice deaths and cut-line hit streaks · a **Style meter** (D to SSS) that rewards variety · **perfect dodge** with witch time · **executions** on poise-broken enemies · **Revert**, a limited rewind charged by perfect parries · six **elemental reactions** (steam, thermal shock, magma, firestorm, mud, sandstorm) · new enemies (Shieldling, Rammer, Hotfix medic, elite affixes, the Gatekeeper mini-boss) · **Room Run**, a roguelite mode with Patches, shops and the boss · gamepad, key remapping, difficulty and colour-blind-safe tells. Details and how to test: [`docs/V2_SLASHER.md`](docs/V2_SLASHER.md). The previous version is playable in [`backup/prototype-v1/`](backup/prototype-v1/).

## Elements

Each element has **1 main attack, 1 ranged attack, 1 defence, 2 specials**, its own tempo (Air fastest and light, Fire and Water fast, Earth slow and crushing), and a **skill tree of three move branches + Resonance** (see below).

| | Main (`J`) | Ranged (`K`) | Defend (`F`) | Special 1 (`Q`) | Special 2 (`E`) |
|---|---|---|---|---|---|
| 🔥 **Fire** | Flame Blade — fast 3-hit combo, burning finisher | Fireball — exploding projectile | Flame Ward — parry → fire nova | Phoenix Dash — invulnerable fire dash + firetrail | Meteor Storm — rain of meteors |
| 💧 **Water** | Tide Whip — wide chilling sweeps, wave finisher | Water Bolt — rapid homing bolts | Bubble Shield — block, perfect → heal + pop wave | Tidal Wave — screen-crossing crash | Healing Rain — heal zone that hurts enemies |
| ⛰ **Earth** | Stone Fists — slow & heavy, ground slam | Rock Throw — lobbed boulder, shrapnel | Stone Skin — −85% damage, perfect → stun all | Quake — leap + slam, shockwaves | Stone Bastion — pillars that launch & block |
| 🌪 **Air** | Gale Blades — very fast, long reach | Wind Cutter — piercing crescent | Wind Wall — deflects projectiles, perfect → gust | Cyclone — tornado that pulls & shreds | Sky Dance — free flight + haste |

### Skill trees
The first node of every branch is a **new move**, unique per element: **Dash Strike** (Attack during or after a Dash), **Charged Shot** (hold Ranged 0.7 s, release) and **Riposte** (a perfect parry counter-attacks). Tier 2 nodes are bundled power-ups and tier 3 is a mastery, with an either/or fork in the middle branch (including one colossal ability per element: Solar Flare, Leviathan, Mountainfall, Maelstrom). A shared **Tempering** track holds the plain stats. Level cap 24.

### Controls
| Action | Keyboard | Mouse |
|---|---|---|
| Move / Jump (×2) / Dash | `A` `D` / `Space` / `Shift` | |
| Up / Down (launcher, slam) | `W` `↑` / `S` `↓` | |
| Main attack | `J` | Left click |
| Ranged attack | `K` (aim-assist) | Right click (aims at cursor) |
| Defend (hold) | `F` (or `L`) | |
| Specials | `Q` / `E` | |
| Skill tree | `Tab` | |
| Pause / Mute | `Esc` / `M` | |

### Combat depth (Milestone 2)
- **Launcher** — hold **Up** (`W`/`↑`) and press **Attack** on the ground: the enemy is thrown into the air. Press **Space** straight after to follow it up.
- **Air chain** — **Attack in the air**: a 3-hit chain with an *air stall* (you hang while hitting). Every air hit lifts the enemy a little less (**juggle decay**), so a juggle always ends. The 3rd air hit **spikes** the enemy into the ground for a **ground bounce**.
- **Slam** — hold **Down** + **Attack** in the air: dive, shockwave, and everything nearby bounces off the ground.
- Brutes resist launching until their poise breaks; the boss can't be launched.
- **Resonance** — the 4th skill-tree branch. Its first node lets you choose a **secondary element** that imbues all your main attacks (burn, chill, stun build-up or pull/lift); Harmony strengthens it and Convergence makes finishers detonate it.
- **Touch:** hold the stick **up** + Attack to launch, stick **down** + Attack in the air to slam. "Flick stick up to jump" is a setting (off by default).

### Training Grounds
A separate arena (menu → **Training Grounds**): **Sandbox** (dummies, DPS meter with juggle height/time, spawn any enemy or the boss, infinite energy / no cooldowns / enemies-attack toggles, a **Combat debug** overlay, element + Resonance switcher), **Endless Waves** (role-composed waves, saved best score) and **Combo Trials** (8 guided trials: launch, juggle, spike, slam, full course, Resonance). The Lab panel on the right is collapsible (collapsed by default on phones).

**Defending is the heart of the game.** Hold *Defend* to block — but press it *just before* a hit lands for a **PERFECT PARRY**: the world freezes, time slows, the attacker is staggered, projectiles are reflected, and an element-specific counter fires. Spamming the button shrinks the window, and a parry opens a short counter window (your next hit is stronger). More in [`docs/COMBAT_LOCK.md`](docs/COMBAT_LOCK.md).

## Game-feel checklist ("juice")

Hit-stop · slow-mo on parry/kills · camera trauma shake + FOV punch + look-ahead · chromatic aberration & bloom pulses · squash/stretch · input buffering & coyote time · combo ranks with milestone banners · damage numbers & crits · enemy telegraphs · commit-cube loot magnets with rising-pitch pickups · environment that **ripples** (the contribution-graph bars bounce) with every impact · procedural audio and adaptive music.

## Project layout

The full developer guide (history, architecture, every system, performance rules, how-tos) is [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md).


```
index.html / style.css       UI shell (HUD, menus, skill tree)
src/main.js                  game loop, run lifecycle, arenas, checkpoints, finish
src/engine.js                renderer, bloom + FX pass, particles, debris, rings, camera
src/world.js                 level layout (contribution graph), collision, backdrop
src/player.js                controller, attack kinds (ground / launcher / air / slam), guard & dash
src/hero.js                  the four warriors: body + costume + mask + hair/cape + combat pose layer
src/animator.js              AnimationMixer state machine (crossfades, speed-matched attacks)
src/assets.js                preloader for the bodies + animation library
src/toon.js                  toon / costume / outline materials (stepped light, rim light, inverted hull)
src/ribbons.js               shader ribbons: hair, capes, hand trails
src/events.js                combat event bus (hit, launch, airHit, spike, bounce, slam, parry, kill)
src/arena.js                 Training Grounds scenery + terrain
src/training.js              sandbox, DPS meter, endless waves, combo trials
src/elements.js              all 4 elements: main/ranged/guard/2 specials
src/enemies.js               Bug, Null Pointer, Legacy Bot, THE LEGACY MONOLITH
src/combat.js                damage, parry, projectiles, pickups, combo, XP, the FEEDBACK table
src/dbg.js                   combat debug overlay + snapshot
src/skills.js                skill trees, progression, localStorage save
src/ui.js                    HUD + skill tree UI
src/audio.js                 synthesized SFX + generative music
src/touch.js                 touch controls (stick, button cluster, aim, haptics)
src/settings.js              persisted settings, quality presets, device detection
src/settingsUI.js            settings screen
assets/hero/                  body_m.glb, body_f.glb, anims.glb (CC0, see vendor/CREDITS.md)
vendor/                      three.js r170 (MIT) + loaders/postprocessing addons
```

## Roadmap (next slices)

- More levels / biomes (`feature/*` branches), second boss, element-specific mini-bosses
- Elemental reactions (steam, mud, firestorm…) between elements
- Gamepad support
- Drag-to-rearrange touch layout editor
- More skill nodes + a shared "meta" tree, gear drops ("stashes")
- Co-op: two elements at once

## License

Code: MIT. three.js © three.js authors (MIT, see `vendor/THREE_LICENSE`). Base bodies and animations: Quaternius, CC0 (see `vendor/CREDITS.md`).
"Octocat"/GitHub marks are intentionally *not* used — this is a fan-made game and is not affiliated with GitHub.
