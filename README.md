# ELEMENTAL COMMIT

> A side-view **3D** elemental action game that lives inside a **GitHub contribution graph**.
> Pick **Fire, Water, Earth or Air**, fix the bugs, parry the review comments, and merge into `main`.

**Play:** `https://<your-user>.github.io/elemental-commit/` — deployed by the GitHub Actions workflow in `.github/workflows/pages.yml` (enable it once under *Settings → Pages → Source: GitHub Actions*).

Zero build step. Zero asset files — all models are procedural, all audio is synthesized with WebAudio. Just open `index.html` through any static server:

```bash
npx http-server -p 8080 .   # or: python3 -m http.server 8080
```

## The vertical slice

One complete level ("`main` branch"), start to finish, ~8–12 minutes:

1. Run through the contribution-graph skyline, collect **commits** (currency/score) and tutorial hints.
2. Hit **checkpoints** (`commit a41f9c2`) — they heal you and become your respawn.
3. Clear two **Review gates** (arena fights, 3 waves each). Gates turn from `REVIEW REQUIRED` to `APPROVED ✔`.
4. Defeat the boss — **THE LEGACY MONOLITH** (2 phases, parry-able attacks, stagger window).
5. Earn a rank (S/A/B/C), keep your XP and skill points, and replay with another element.

### Enemies
| Enemy | Behaviour | Counter |
|---|---|---|
| **Bug** | Fast crawler, telegraphed lunge | Parry it, or kill it first |
| **Null Pointer** | Floating caster, fires red orbs (telegraphed) | Parry/deflect the orb straight back |
| **Legacy Bot** | Heavy brute, overhead smash + ground shockwave | Parry the smash to *break* it, jump the wave |
| **The Legacy Monolith** | Boss: slam, stack-trace barrage, summons, falling code blocks | Parry the slam for a huge stagger window |

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

## Elements

Each element has **1 main attack, 1 ranged attack, 1 defence, 2 specials**, and a **9-node skill tree** (3 branches × 3 tiers).

| | Main (`J`) | Ranged (`K`) | Defend (`L`) | Special 1 (`Q`) | Special 2 (`E`) |
|---|---|---|---|---|---|
| 🔥 **Fire** | Flame Blade — fast 3-hit combo, burning finisher | Fireball — exploding projectile | Flame Ward — parry → fire nova | Phoenix Dash — invulnerable fire dash + firetrail | Meteor Storm — rain of meteors |
| 💧 **Water** | Tide Whip — wide chilling sweeps, wave finisher | Water Bolt — rapid homing bolts | Bubble Shield — block, perfect → heal + pop wave | Tidal Wave — screen-crossing crash | Healing Rain — heal zone that hurts enemies |
| ⛰ **Earth** | Stone Fists — slow & heavy, ground slam | Rock Throw — lobbed boulder, shrapnel | Stone Skin — −85% damage, perfect → stun all | Quake — leap + slam, shockwaves | Stone Bastion — pillars that launch & block |
| 🌪 **Air** | Gale Blades — very fast, long reach | Wind Cutter — piercing crescent | Wind Wall — deflects projectiles, perfect → gust | Cyclone — tornado that pulls & shreds | Sky Dance — free flight + haste |

### Controls
| Action | Keyboard | Mouse |
|---|---|---|
| Move / Jump (×2) / Dash | `A` `D` / `Space` `W` / `Shift` | |
| Main attack | `J` | Left click |
| Ranged attack | `K` (aim-assist) | Right click (aims at cursor) |
| Defend (hold) | `L` or `F` | |
| Specials | `Q` / `E` | |
| Skill tree | `Tab` | |
| Pause / Mute | `Esc` / `M` | |

**Defending is the heart of the game.** Hold *Defend* to block — but press it *just before* a hit lands for a **PERFECT PARRY**: the world freezes, time slows, the attacker is staggered, projectiles are reflected, and an element-specific counter fires.

## Game-feel checklist ("juice")

Hit-stop · slow-mo on parry/kills · camera trauma shake + FOV punch + look-ahead · chromatic aberration & bloom pulses · squash/stretch · input buffering & coyote time · combo ranks with milestone banners · damage numbers & crits · enemy telegraphs · commit-cube loot magnets with rising-pitch pickups · environment that **ripples** (the contribution-graph bars bounce) with every impact · procedural audio and adaptive music.

## Project layout

```
index.html / style.css       UI shell (HUD, menus, skill tree)
src/main.js                  game loop, run lifecycle, arenas, checkpoints, finish
src/engine.js                renderer, bloom + FX pass, particles, debris, rings, camera
src/world.js                 level layout (contribution graph), collision, backdrop
src/player.js                controller, procedural character animation, guard & dash
src/elements.js              all 4 elements: main/ranged/guard/2 specials
src/enemies.js               Bug, Null Pointer, Legacy Bot, THE LEGACY MONOLITH
src/combat.js                damage, parry, projectiles, pickups, combo, XP
src/skills.js                skill trees, progression, localStorage save
src/ui.js                    HUD + skill tree UI
src/audio.js                 synthesized SFX + generative music
src/touch.js                 touch controls (stick, button cluster, aim, haptics)
src/settings.js              persisted settings, quality presets, device detection
src/settingsUI.js            settings screen
vendor/                      three.js r170 (MIT) + postprocessing addons
```

## Roadmap (next slices)

- More levels / biomes (`feature/*` branches), second boss, element-specific mini-bosses
- Elemental reactions (steam, mud, firestorm…) between elements
- Gamepad support
- Drag-to-rearrange touch layout editor
- More skill nodes + a shared "meta" tree, gear drops ("stashes")
- Co-op: two elements at once

## License

Code: MIT. three.js © three.js authors (MIT, see `vendor/THREE_LICENSE`).
"Octocat"/GitHub marks are intentionally *not* used — this is a fan-made game and is not affiliated with GitHub.
