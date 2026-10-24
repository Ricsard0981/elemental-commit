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

## 13. UI skin: "ink & ledger" (anti-generic pass)
The first v2 UI still looked like a generic dark dashboard (rounded GitHub-grey cards, glow on every number, pulsing green pills). It was rebuilt as one cohesive skin in the last block of `style.css`:
- **Shapes:** flat ink-black plates with square corners, a thick spine/top bar in the element's colour, and hard offset shadows instead of blur. No glows, no gradients on chrome, no pulsing buttons.
- **Type:** Barlow Condensed (display: all HUD and menu text, numbers) and Barlow (body), vendored in `assets/fonts/` (SIL OFL, credited in `vendor/CREDITS.md`).
- **Colour discipline:** paper-white text on near-black, ONE accent per run (your element); green only for commits.
- **Game-specific details:** HP/energy as segmented ledger bars, the Style rank as a tilted stamp tile, primary buttons in paper-white, stats as segmented pips, touch buttons as flat discs with an accent rim.
- Checked on desktop and a 844x390 phone viewport (Menu, HUD, skill tree, pause, Lab, Settings). Not checked on a real phone.


## 14. Y2K / Spider-Verse art pass, main menu, faceless heroes, the Fire-Skater
**Main menu:** a title screen (`#title`) with Campaign / Room Run / Training Grounds / Settings / Credits, then the element-select screen with a Back button. Keyboard: arrows or W/S, Enter, or the digits 1-5.
**Look:**
- The arena is now a neon-grid Y2K street: a striped retro sun and star field, a pink/cyan/lime palette, a graffiti-covered back wall (tags are drawn on canvases in `arena.js`), neon signs, floating chrome toys, a blocky city skyline. Room Run rooms have their own fog mood.
- **Comic print** post effect (`engine.js` FX pass, `Q.comic`, Graphics > "Comic print look": off on Potato/Low, Light on Medium, Full on High/Ultra): coloured (purple) shadows, richer colour, a Ben-Day halftone dot screen that grows in the dark areas, a little paper grain.
- Menu/HUD keep the "ink & ledger" skin; the title adds the hot-pink / cyan / lime sticker palette and offset-print logo.
- The **Campaign** level still uses the old contribution-graph world (the world overhaul is separate), so it does not have this look yet.
**Heroes:** all four are faceless (a blank mannequin head) in Y2K streetwear (`src/outfits.js`): Fire a punk skater, Water a raver (headphones, twin buns, cargo pants), Earth a skater brute (hoodie, beanie, backpack), Air a roller kid (goggles, windbreaker, rollerblades).
**Fire-Skater:** deliberately NOT built yet. The owner has a detailed brief and concept art for it and asked to do it later; an early prototype of it was written and reverted (it is in git history, commits b4a6366 and its revert). Fire currently wears the first-draft punk outfit.
**Not done / not verified:** the Fire-Skater (waiting for the owner's instructions); the Campaign world is not re-skinned (the world overhaul is separate); the heroes' outfits are first drafts judged only on screenshots; iPhone 13 untested.

## 15. Pyre: the Fire hero's own Blender model
Fire is now **Pyre**, the faceless fire-punk skater from `ELEMENT_GAME_v2/assets/concept/FIRE_GUY`. He is a separate model built entirely by script in Blender (headless, repeatable):
- `tools/blender/atlas_gen.mjs` draws the 1024 texture atlas (flat swatches, sewn patches, the CRASH back art, the shoe flame print, the deck graphic) into `atlas.png` + `atlas.json`.
- `tools/blender/build_pyre.py` models him (bmesh), UV-maps every part to an atlas cell, skins him to the game's own rig (same bone names, so every clip in `anims.glb` plays) and exports `assets/hero/pyre.glb` (~7.6k tris, flame as its own glowing mesh). The rest pose is a relaxed A-pose with bent elbows; clips set bone rotations outright, so this does not affect animation.
- `tools/blender/build_deck.py` builds the purple IGNITE board, `assets/hero/pyre_deck.glb` (~1k tris).
- `render_preview.py` renders a front/3-4/side/back sheet; `photo_pyre.py` is a look-dev photo set (night, brick wall, sodium lights + flash, toon bands, ink outlines, halftone) and is not part of the game.
Run: `blender --background --python tools/blender/build_pyre.py` (Blender 5.2).
In game (`hero.js`): when `pyre.glb` and `pyre_deck.glb` load, Fire uses them (toon material on the atlas, a glowing flame material, outlines) and skips the procedural costume; the deck rides on `spine_03`. If either fails to load, Fire falls back to the old body + outfit.
**Not done yet:** Skate Mode, the Heat gauge, board attacks, parry, backflips (the plan is in this repo's history / the Pyre plan). **Not verified:** iPhone 13 frame rate with Pyre; the colours read darker in the arena lighting than in the Blender renders.

## 16. Pyre's kit (Skate Mode, Heat, combat, Ignite Grind, Spit-Trick, emotes) — `src/pyre.js`
Everything Fire-specific lives in `src/pyre.js`; `player.js`, `hero.js`, `input.js`, `touch.js`, `ui.js` only call into it for Fire.
- **Stances.** On foot: the deck rides on `spine_03`, normal snappy movement. **Skate Mode**: toggle with **C** (gamepad L3, touch "Skate" button) or **hold Dash** ~0.3 s; 0.12 s stance cooldown; board-drop hop. Riding: +35% top speed, slow acceleration and long coasting (momentum), wide carves with sparks and skid marks, body turns side-on to the camera with a wide knees-bent stance on the deck. **Down + Dash** = burning power slide (light fire damage behind him), **Attack during it** = slide kick. **Jump** = ollie with a kickflip.
- **Heat** (HUD bar under energy, Fire only): +14/s riding fast, +5 per landed main hit, +20 on a perfect parry, −10/s when idle. At 100: **BLAZE** for 6 s: the deck glows and trails fire, main hits splash burning damage on neighbours, riding leaves burning wheel marks that damage enemies.
- **Street Rhythm** (4 hits): Capoeira sweep → flame elbow → 360 spin kick → **Deck Slam** (board in hand, 360 bat swing, CRUNCH! sticker). **Up + Attack**: Kickflip Uppercut (the board flips up and launches). **Air**: Meia-Lua kicks with flaming shoe trails. **Down + Attack in the air**: Board Stomp (shockwave ring).
- **Kick-Turn** (guard): blocks with the deck held up; a perfect parry = 360 kick-turn, fire waves both ways, white flash, spark shower, PARRY! sticker, +20 Heat, then the existing counter window.
- **Ignite Grind** (Q): if a rail/ledge is within reach it **locks on and grinds along the top edge** (hold Q to keep grinding; it ends at the rail end or on release) with a burning trail, then an explosive **backflip dismount**. Otherwise a blazing ground grind (longer from Skate Mode). Rails: the two graffiti rails in the Training arena (`arena.js` RAILS) and the floating slabs in the campaign (`world.js` `railsHere()`).
- **Volcanic Spit-Trick** (E): handstand flip around the deck, a fire breath into the floor, a burning graffiti stamp for 6 s (BURN! sticker). In **BLAZE** (or with Meteor Mastery) meteors rain onto the stamp.
- **Emotes**: **1** Kickflip Catch, **2** Heel-Grind Flame Check, **3** Board Plant, **4** Backflip Flex (**G** / gamepad R3 / long-press the touch Skate button cycles them). Any input cancels an emote. Standing still out of combat for 8 s plays one by itself.
- **Comic stickers** (CRUNCH! PARRY! BURN! BLAZE! GRIND!): pooled float texts with a starburst (`.floater.sticker`), max 3 at once, plain text when "Flashes" is off.
- All of Pyre's animation is procedural on top of the existing clips (`Hero.pyrePose`, deck placement in `Hero.updateDeck`); no new clips.
**Tested (headless, software GL):** stance toggle + riding speed, Heat build/BLAZE, full 4-hit combo, launcher, air chain, perfect Kick-Turn, rail grind lock + dismount, Spit-Trick, all 4 emotes, touch Skate button (tap / long press) in phone emulation; no console errors, no new shader programs during play. Pose screenshots were checked by eye.
**Not done / not verified:** melting Corruption blocks/crystals with the grind trail (those are decoration today, no gameplay object to melt); a dedicated "on twos" freeze (the existing hit-stop table is used); the deck sling back onto the spine after an emote is an instant switch; iPhone 13 frame rate and feel; audio is the existing Fire sounds.
