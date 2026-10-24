# Handoff — everything decided so far

This file carries the context from the first (cloud) Claude Code session so nothing is lost when work continues locally.

## Owner & goals
- GitHub: **Ricsard0981**, repo `Ricsard0981/elemental-commit` (public, Pages enabled with Source = GitHub Actions).
- Original brief: a side-view but **3D** web game with smooth animations. At the start you pick one of 4 elements (Fire, Water, Earth, Air). Each has a main attack, a ranged attack, a defence and 2 specials, plus upgradeable skill trees. Above all it must be **satisfying, responsive and rewarding** ("juice" everywhere, e.g. defending should feel great).
- Long-term: ship as a **desktop program too**, while the **browser version always stays available**. Tauri vs Electron is undecided; don't block either.
- Owner's own testing: iPhone 13 runs it great (High drops to ~59 fps only in the most intense moments). PC testing still to come.

## What exists (vertical slice, done) — ⚠ partly OUTDATED
> The list below is the original slice. The tree is no longer "9 nodes", enemies and boss were reworked, and elements now have tempo profiles. See `COMBAT_LOCK.md` and the "Combat Lock drop" section at the end of this file.
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


---

# Update after Milestone 2 (implemented locally on the owner's PC)

## Owner feedback that shaped this drop
- PC playtest of Milestone 1: smooth, satisfying, responsive, key layout good. Only the **map/world design** (contribution-graph world) is disliked → that is the *next* milestone's world overhaul. **The old level was not touched.**
- **Defend is now `F`** (HUD slot label, tutorial hint, element cards, menu footer, README). `L` still works as a secondary key.
- After seeing the first chibi (KayKit) hero the owner said it looked "goofy, like a little gnome". New direction: **tall, heroic, human-proportioned, memorable characters; custom identity; everything more visible/satisfying/chaotic-but-smooth; insanely good animation and SFX; keep everything that exists.**

## Decisions made in this session (they replace the earlier hero plan)
| Topic | Decision |
|---|---|
| Hero base | **Quaternius Universal Base Characters** (male + female, CC0) + **Universal Animation Library (Standard, CC0)**. KayKit was tried first and dropped (proportions). Sources are in `vendor/CREDITS.md`. Downloaded through itch.io's free flow with Playwright; the originals are not in the repo, only the optimised `assets/hero/*.glb` (1.3 MB). |
| Characters | 4 distinct warriors: **Fire** (male, bare-chested ember warlord), **Water** (female, tide dancer), **Earth** (male, bulky stone breaker), **Air** (female, gale runner). Each has a zone-painted costume (cloth, trim, glowing runes), bone-attached armour, carved mask, hair cap + crown, elemental hair ribbons, cape ribbon, hand trails. All custom, in `src/hero.js` + `src/toon.js`. Armour pieces are authored in T-pose model space and baked into 4 skinned meshes (one per material) to save draw calls. |
| Animation | Locomotion/jump/roll/hit/death/dance/punches/sword/spells come from the library. Launcher, air chain, slam, guard, casts and dash poses are a **procedural layer** (`Hero.pose` / `applyOverlay`) that rotates bones in the model frame on top of the clips; clip speed is matched to each attack's `hitAt` (`CLIP_PEAK`). |
| Camera | `ZOOM_K = 0.68` in `engine.js`: the camera sits much closer so the characters are big. Camera x bounds were relaxed (`bx0 = 6`). |
| Controls | W/↑ = up (launcher), **Space = jump** (W no longer jumps), S/↓ = down (slam). Touch: stick up + Attack = launcher; flick-up-to-jump is a setting, off by default. |
| Resonance | 4th skill-tree branch for every element (T1 opens the pick-1-of-3 secondary modal; T2/T3 strengthen; T3 makes finishers detonate). `MAX_LEVEL` raised 14 → 16 so all 12 nodes are affordable. |
| Training Grounds | Separate arena (`src/arena.js`, `src/training.js`): sandbox (3 dummies, DPS meter incl. juggle hits/height/time, spawner for every enemy + boss, toggles, element + Resonance switcher), endless waves (best score saved), 8 combo trials (first clears give XP). Collision/terrain is swapped through `terrain.active` in `world.js`; the level meshes are hidden while it is active. |
| Audio | `src/audio.js` rewritten: layered hits (transient + body + sub + tail), reverb bus, element voices, launcher/air/spike/bounce/slam sounds, slow-motion low-pass, ambience, driving combat groove. **Not listened to on the dev machine** (no audio device in the automated runs) — tune by ear. |
| VFX | Sprite atlas for particles (streaks stretch with velocity, droplets, chips, leaves, stars), shader slash trails per element with Resonance tint, ground decals, impact flashes, screen-space shockwave on High, shader ribbons. All shader variants are created at boot / in `warmup()`. |
| Stylised look | `MeshToonMaterial` with a 4-step ramp + fresnel rim + cheap inverted-hull outlines (off on Low). Enemies were moved to the same toon materials. |

## Things still open / honest gaps
- Animation polish is not finished: the pose layer was tuned from screenshots on a software renderer; expect to tweak amplitudes after seeing it at 60 fps on real hardware.
- Fingers are not animated (finger tracks were dropped to save size) – hands are open palms.
- iPhone 13 performance was **not measured on device**; headless numbers (draw calls, triangles, JS ms, shader-program count) are in `docs/MILESTONE_2.md`.
- Sound was never heard by the author; mixing is by design only.
- World overhaul, new levels/bosses, perfect dodge, ultimate meter, elemental reactions, desktop packaging are still not done.

## Working notes
- `window.__game` now also exposes `startTraining`, `TR`, `EV` (event bus), `In`.
- Debug camera hooks: `cam.fovLock` and `cam.zoomLock` (used by the screenshot scripts).
- Test scripts used this session are kept outside the repo; the flows covered are listed in `docs/MILESTONE_2.md`.

## Combat Lock drop (read `docs/COMBAT_LOCK.md`)
- Phases A–E done in one drop: input buffering/animation timing/parry rules, one `FEEDBACK` table + rewritten synth audio, encounter director
  (attack tokens) + enemy roles + two-phase boss with the game-breaking exploits closed, mechanic-driven skill trees (forks + Tempering stat track,
  save v2 refunds nodes), Training Grounds "Combat debug" overlay and `window.__game.dbg()`.
- New files: `src/dbg.js`, `docs/COMBAT_LOCK.md`. The skill ids changed (see `skills.js`); old saves keep level/XP/Resonance and refund nodes.
- Not verified by the author: iPhone 13 fps/touch feel, in-ear audio. Decisions: no CC0 audio samples added (could not audition them).
- **Later in the same drop (owner feedback):** per-element tempo/power profiles (`prof`), colossal ability forks, and a skill-tree rebuild where tier 1 of each
  branch is a new move (Dash Strike, Charged Shot, Riposte). Save version 3. Skill ids from before are refunded.
- **Next:** `docs/NEXT_STEPS.md` holds the researched gap analysis and a proposed roadmap. `docs/MILESTONE_2_PLAN.md` is historical.

## v2 "Slasher" (branch `v2-slasher`, not merged)
- Owner asked for a huge step up from the prototype, "a satisfying slasher", unique features, research, optimisation without quality loss, and to work in the background (headless, low priority, separate branch). Choices: branch + merge on approval, **randomised room runs**, **Revert + Reactions** as the signature, headless-only testing.
- Backup of the old game: `backup/prototype-v1/` on main and the git tag `prototype-v1`.
- Everything is documented in `docs/V2_SLASHER.md` (what changed, how to test, what is NOT verified). Test tooling lives outside the repo in `C:\programok\_v2_tools` (Playwright scripts: `t_all.mjs` smoke suite, `t_run.mjs` full Room Run through the real UI, `t_perf.mjs`, `t_prof.mjs`).
- **Do not merge to main without the owner's go-ahead.**

