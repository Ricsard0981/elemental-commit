# v2 "Slasher": what changed, how to test it

Branch `v2-slasher`. The previous game is preserved as **`backup/prototype-v1/`** (playable, and tagged `prototype-v1`, commit `742d657`).
Everything here is implemented in code and was exercised headlessly (Playwright, software GL, below-normal priority). Things that are NOT verified are listed at the end.

## 1. Slash feel
| Feature | Where | Notes |
|---|---|---|
| **Slice deaths** | `enemies.js sliceEnemy()`, called from `killEnemy` | The enemy's parts are split by a cut plane that follows the swing (diagonal for slashes, steep for launchers, vertical for spikes/slams), flung apart, then shrink into glow shards, with a bright seam and streaks along the cut. Uses no new materials (so no shader cost). Not used for the boss or the arena-clear sweep. |
| **Cut lines on every melee hit** | `engine.js cutLines()` | Bright streaks race outwards along the cut angle. |
| **Time-based weapon trails** | `ribbons.js Trail` | Sampled on time, not frames, so the trail is the same length at 30 or 165 fps. 10 / 20 points on Medium / High (was 8 / 14). |

## 2. Style meter (D → SSS) — `style.js`
- Points come from what you do: hits (a launcher is worth more than a jab), parries, perfect dodges, executions, reactions, counters, kills.
- **Variety:** repeating the same move decays its value (20% per repeat in the last 8 moves, `REPEATING` label).
- Getting hit drops you a tier. The meter drains when you stop fighting.
- The rank feeds back: damage ×(1 + 3.5% per rank), energy gain +12% per rank, commit drops +15% per rank.
- HUD: `#style` (letter + progress bar), rank-up banner from A upwards.

## 3. Defence
- **Perfect dodge + witch time:** a hit that would have landed during dash i-frames triggers 1.1 s in which enemies and their shots run at 20% speed while you stay at full speed. 2.2 s cooldown. Camera push-in, desaturation, bell sound. (`combat.js perfectDodge`, `witchK()` in `enemies.js` and `updateProjectiles`.)
- **Execution:** a finisher, launcher, spike or bounce on a **poise-broken** enemy kills it with a slow-mo + camera push + "EXECUTED" (heavies need to be under 60% HP). Heals, refunds energy.
- **Revert (the unique move) — `revert.js`:** perfect parries charge it (max 2). Press **R** (or the touch button, or take a lethal hit: it triggers automatically) to rewind ~3 seconds: position, HP and energy return; enemy attacks in flight are cancelled; enemies return to where they stood; **kills and enemy damage are not undone**. 10 snapshots a second, the rewind plays back in real time with a glitch effect.

## 4. Elemental reactions — `reactions.js`
Statuses from different elements on one enemy combine into a named reaction (consumes the statuses; 0.9 s per-enemy cooldown). Your main attacks also carry your Resonance (secondary) element, so a pair of elements gives you reactions in solo play.
| Reaction | Trigger | Effect |
|---|---|---|
| STEAM | fire on chilled / water on burning | blinds everything nearby (they lose their attack) |
| THERMAL SHOCK | fire on frozen | armour + poise break, big hit |
| MAGMA | fire on stunned / earth on burning | eruption + vulnerable |
| FIRESTORM | fire on airborne / air on burning | fire column that launches neighbours |
| MUD | water on stunned / earth on chilled | slows everything nearby to 30% |
| SANDSTORM | air on stunned / earth on airborne | pulls enemies in and stuns them |

## 5. Enemies
| New | Role | Counterplay |
|---|---|---|
| **Shieldling** | frontal shield: hits from the front are blocked and chip the shield; launchers / spikes / bounces / hits from behind go through; breaking the shield staggers it; its bash has a 0.75 s tell | go around, launch it, break the shield with finishers |
| **Rammer** | charge lane drawn on the ground (0.9 s), straight-line rush, crashes into stagger | perfect dodge, jump, or parry |
| **Hotfix** | flying medic: heals the most hurt ally 40% with a visible beam (1.1 s tell) and keeps its distance | kill it first |
| **Elite affixes** | any enemy with `armoured` (2.4× HP, poise ×2), `volatile` (delayed blast with a ground warning), `swift` (+40% speed) | ×3 XP and commits |
| **Gatekeeper** | mini-boss (a giant Shieldling, 340 HP) that summons bugs at 50% | |
The Lab spawner has chips for all of them (Swift Bug, Volatile Bug, Elite Bot, Gatekeeper).

## 6. Room Run (new game mode) — `run.js`, `patches.js`
Menu → **Room Run** → pick an element. A run is 8 rooms: skirmish, then door choices (skirmish / elite hunt / shop / rest stop), a Gatekeeper, a shop or rest, then THE LEGACY MONOLITH.
- After each cleared room you pick **1 of 3 Patches** (rare ones after elites and the Gatekeeper). 25 patches: universal, per element, and **5 Merge patches that need your element AND your secondary element**.
- **Shop** (commits): heal, Revert charge, patch, rare patch. **Rest stop:** recover, +1 Revert, or +10% damage.
- Death ends the run (XP and skill points are kept). Best time per element is stored locally.
- The authored Campaign is unchanged and still in the menu.

## 7. Input and access
- **Gamepad** (Gamepad API, standard mapping, with rumble): A jump, X attack, Y ranged, B dash, RT defend, RB/LB specials, LT revert, left stick move / up / down, right stick aims.
- **Key remapping** (Settings → Controls): click an action, press a key; swaps on conflict; saved. Mouse buttons keep working.
- **Difficulty:** Easy / Normal / Hard (enemy damage, health, speed and the parry window).
- **Colour-blind-safe tells:** enemy warnings pulse bright yellow instead of red.
- **Touch:** new Revert button; Charged Shot is a hold on the Ranged button.

## 8. Audio
New synthesized sounds: slice (every kill), perfect dodge, execution, one voice per reaction, Revert (gain / rewind / land), telegraphs for the Shieldling, Rammer and Hotfix. All go through the existing limiter and retrigger gates.

## 9. Performance
Changes: pooled ring meshes/materials, pooled slash materials, pooled projectile orb materials, shared enemy HP-bar materials, particle buffers upload and draw only the used range and skip idle frames, debris skips idle frames, HUD class toggles are cached, `input.endFrame` no longer allocates.
Measured with the same scripted fight (6 enemies attacking, 10 s) on the headless software renderer:
| | CPU ms per frame before render (avg) |
|---|---|
| prototype-v1 | 5.4 and 1.8 (two runs) |
| v2 before the pass | 9.3 and 8.0 |
| v2 after the pass | 6.5, 4.6 and 2.3 |
The machine was in use by the owner while this ran, so **the runs are noisy**; the honest reading is "v2 costs about what the prototype costs despite many more features". `renderer.info.programs` stayed at 41 across a run of every element, move, new enemy, reaction, Revert and a full Room Run (**0 runtime shader compiles**).
On **Medium**, the same smoke run on the headless software renderer showed 8-10 programs created after boot. This is NOT new: the prototype does the same (4). Cause: the software renderer is so slow that **dynamic resolution** drops to its minimum scale and sheds shadows, which recompiles the materials without shadows (the cache key flips `shadows 1 -> 0`). High (no dynamic resolution) and Low (no shadows to shed) show 0. On a real GPU it only happens if the device really cannot keep up.
CPU profile finding that drove the pass: three.js `getParameters` / program-cache-key work from creating a new material for every ring, slash and projectile.

## 10. Bugs found while building this
- The boss crashed `applyStatus` every frame when the elite-crown field collided with the boss's own `crown` array (caught by the smoke test, fixed).
- Two simultaneous wave spawns in Room Run (timer + update loop) (caught by the run test, fixed).

## 11. How to test (PC)
Serve the branch: `npx http-server -p 8092 -c-1 .` in `C:\programok\ELEMENT_GAME_v2`, open http://localhost:8092. The Lab (Training Grounds) has every new enemy; infinite energy + no cooldowns make move testing easy.
1. Kill something with a finisher: look for the cut, shards and streaks. 2. Watch the Style letter climb while mixing moves, drop when you repeat one. 3. Dash through an attack for witch time. 4. Break a Shieldling's shield, then execute it. 5. Burn + chill an enemy for STEAM, etc. 6. Parry twice, then press **R** after taking damage. 7. Menu → Room Run, play a few rooms. 8. Settings → Controls: rebind a key; plug in a gamepad.

## 12. NOT verified
- **iPhone 13** (fps and touch feel), and any real GPU frame-rate numbers. Measurements here are CPU-side on a software renderer.
- **In-ear audio**: levels were not measured for the new sounds; none of them were listened to.
- **Visual quality of the new effects** was reviewed on a few screenshots, not frame by frame. The slice seam is subtle.
- Balance: Room Run difficulty curve, patch strength, Revert on the boss, Style rank thresholds are first guesses.
- The Gamepad was tested with a mocked controller, not hardware.
