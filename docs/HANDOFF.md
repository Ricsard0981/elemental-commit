# Handoff — everything decided so far

This file carries the context from the first (cloud) Claude Code session so nothing is lost when work continues locally.

## Owner & goals
- GitHub: **Ricsard0981**, repo `Ricsard0981/elemental-commit` (public, Pages enabled with Source = GitHub Actions).
- Original brief: a side-view but **3D** web game with smooth animations. At the start you pick one of 4 elements (Fire, Water, Earth, Air). Each has a main attack, a ranged attack, a defence and 2 specials, plus upgradeable skill trees. Above all it must be **satisfying, responsive and rewarding** ("juice" everywhere, e.g. defending should feel great).
- Long-term: ship as a **desktop program too**, while the **browser version always stays available**. Tauri vs Electron is undecided; don't block either.
- Owner's own testing: iPhone 13 runs it great (High drops to ~59 fps only in the most intense moments). PC testing still to come.

## What exists (vertical slice, done)
- One full level (~270 units) built as a GitHub contribution graph: tutorial → pits → arena A (3 waves) → plateau → arena B (3 waves) → boss arena.
- Enemies: Bug, Null Pointer (ranged, parry-able orbs), Legacy Bot (heavy, poise), boss **THE LEGACY MONOLITH** (2 phases: slam, barrage, summon, falling blocks).
- 4 elements, 20 abilities, a perfect-parry system, a 9-node skill tree per element, XP/levels, a localStorage save, and S–C run ranks.
- Juice: hit-stop, slow-mo, camera trauma/FOV punch, bloom pulses, chromatic aberration, squash/stretch, combo ranks, damage numbers, loot magnets, world ripple, synthesized SFX and music.
- Mobile:
  - Floating analog stick and thumb-arc buttons, drag-to-aim, slide between buttons, haptics.
  - A settings screen, rotate prompt, auto-pause, PWA manifest.
  - Quality presets and dynamic resolution.
- Perf work is documented in `docs/PERFORMANCE.md`. The key fix was stopping runtime shader recompiles.

## Owner feedback that drives the next milestone
It's smooth and responsive, but some things still feel basic: attacks, animations, textures. The programmer/GitHub world is "cool but not done well yet".

## Decisions for Milestone 2 (approved — see `docs/MILESTONE_2_PLAN.md`)
| Topic | Choice |
|---|---|
| Long-term world | **Hybrid:** an elemental fantasy world being eaten by a digital **Corruption** (glitches, code shards, bug-creatures). World overhaul is a later milestone. |
| Art style | **Stylized toon + painterly** (cel shading, rim light, readable shapes). |
| Assets | **Free CC0 packs + procedural.** Asset sites were blocked in the cloud sandbox, but public GitHub repos could be cloned. Use **KayKit Adventurers** (`KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0`, CC0, rigged, 75 animations). Fallback: three.js `RobotExpressive` (CC0). |
| Milestone focus | **Combat feel + animation.** |
| Hero | **Masked spirit warrior**: a KayKit rig plus a procedural mask, elemental "hair" and cape. |
| Weapons | **None — pure magic**, with much better casting animations and VFX. |
| New combat | **Air combos + launchers**: Up + Attack launches, air chain, Down + Attack slam, juggle decay. |
| Controls change | Keyboard: **W/↑ = up** (no longer jump), **Space = jump**. Touch: stick up + Attack launches; flick-up-to-jump becomes a setting, off by default. |
| Element model | Pick a main element. A **secondary element is earned via a 4th skill-tree branch ("Resonance")** and **imbues main attacks** (no new buttons). |
| Test level | A new **Training Grounds** arena: dummies + DPS meter, enemy spawner, endless waves, combo trials. The old level stays untouched. |
| Delivery | **One big drop.** |
| Desktop | Decide later. Stay compatible. |

## Not doing yet
Main-level reskin and world overhaul, new levels and bosses, perfect dodge, ultimate meter, full elemental reactions system, desktop packaging.

## Working style the owner likes
- They answer multiple-choice questions well. Offer a recommended option first.
- They test on their phone after pushes, so describe exactly what to try.
- They want honest reporting: say what was and wasn't verified.
