# NEXT STEPS: what the game is still missing

> **Status update (branch `v2-slasher`).** Done in v2: Style meter with variety rank, perfect dodge + witch time, executions, elemental reactions (6), **Revert**,
> Shieldling / Rammer / Hotfix / elite affixes / Gatekeeper mini-boss, **Room Run** with Patches, shop and rest stops (+ a daily seed), gamepad with rumble, key remapping,
> difficulty and colour-blind-safe tells, a touch Revert button, an optimisation pass. Still open from this list: a second boss and biomes (world overhaul), story frame,
> music variety, achievements/stats page, a real online leaderboard, CI smoke tests in the repo (the scripts live in `tools/tests/`), and the iPhone 13 / headphones verification.
> See `docs/V2_SLASHER.md` for what shipped. The text below is the ORIGINAL analysis and is partly OUTDATED.

A researched gap analysis and roadmap. It is **opinion backed by evidence, not a spec**: nothing here is implemented, and the ranking is mine, for the owner to overrule.
Read together with `user_plans.md` (mandatory direction), `COMBAT_LOCK.md` (what exists) and `DEVELOPER_GUIDE.md`.

## 0. Method and honesty
- I audited the game against what the code actually contains (not what the docs claim), then searched for how shipped action games solve each gap.
- The web search returned mostly **player-facing guides, reviews and community posts**, few developer postmortems. Treat the cited points as directional.
  Where a claim rests on one weak source I say so. The design recommendations (especially §4) are my own judgement and **untested**.
- Effort: **S** = hours, **M** = a day or two, **L** = several days. Rough, for this codebase.

## 1. What the game is today (verified in code)
- One authored level (~270 units, ~8–12 min): tutorial, pits, two arenas of 3 waves, a boss. Plus the Training Grounds (sandbox, endless, 8 trials).
- 4 elements × (main, ranged, guard, 2 specials), per-element tempo, 3 new moves each, a skill tree with forks, Resonance (secondary element imbue), Tempering stats.
- 3 enemy roles + a 2-phase boss, with attack tokens and fair tells. Procedural audio. Touch + keyboard/mouse. Graphics tiers.
- **Not present** (grepped): gamepad, key remapping, difficulty setting, seeded or daily runs, leaderboard, achievements, any currency sink (commits are score only),
  any way to choose build options mid-run, any second level or boss, hazards beyond pits, interaction *between* elements beyond Resonance.

## 2. Gap analysis, ranked

### 2.1 No reason to play twice in a row (biggest gap) — **L**
Replay value is the defining quality of the genre; the Hades analyses I found put it down to **content that multiplies in combination** and **progression after failure**,
and say combat alone wears thin. Dead Cells is credited with fusing randomised reruns with unlock progression.
Today a run is the same 10 minutes; the only variable is which element you pick and what you bought.
- **Options:** (a) roguelite structure: a run is a chain of encounter rooms with a choice of reward between them; (b) keep authored levels but add *run modifiers* and *challenge
  tiers*; (c) both, with (b) first because it is cheap.
- **Pitfall, from the same research:** permanent upgrades make the game hardest at the start and easiest later, and can trivialise skill. Prefer **sideways** meta progression
  (new moves, new options) over bigger numbers. The move-based tree already leans that way.

### 2.2 No in-run build choices — **M**
The tree is permanent and slow. Hades' loop is *a choice every room*: three offered boons, some that only appear if you hold a matching pair (duo boons), plus ways to bias what is offered.
- **Proposal ("Patches"):** after each arena or room, offer 1 of 3 temporary run mutations (e.g. "burning enemies explode", "dash leaves a wave", "parry heals"). Tag each with an element.
  A **Merge patch** needs two tags (your element + your Resonance secondary), which finally gives Resonance an active payoff.
- Keeps `user_plans.md` in view: mechanics and synergies, not stat bumps.

### 2.3 Elements do not talk to each other — **M**
Genshin's whole combat depth is **auras that decay and combine into reactions**, so *timing and order* matter; Noita's is materials that interact (water conducts, fire burns oil, lava + water makes rock).
We have status effects (burn, chill, stun, lift, freeze) but they never combine.
- **Proposal ("Reactions"):** a small table where statuses on one enemy produce a visible payoff, each with a name popup:
  | Statuses | Reaction | Effect |
  |---|---|---|
  | burn + chill | **Steam** | AoE blind: enemies miss/lose target for 2 s |
  | chill + stun | **Shatter** (partly exists) | burst, bonus damage |
  | burn + lift | **Firestorm** | rising fire column, juggle extender |
  | stun + lift | **Sandstorm** | lingering pull-and-shred zone |
  | chill + burn on Bot armour | **Thermal shock** | armour break |
  Six is enough. They apply to solo play through Resonance, so no new buttons.
- Why it matters for the owner's goal: it makes *picking the secondary* a real decision and rewards using more than one tool.

### 2.4 Enemy and boss variety is thin — **M each**
Roster: Bug (flanker), Null Pointer (sniper), Legacy Bot (bruiser), Dummy, one boss. The design lessons I found: each attack maps to a specific answer, **bosses can recombine earlier enemies**,
small variants (a few numbers) are an efficient way to widen a roster, and early introduction foreshadows hard fights; the counter-example is bosses with **no readable windup**.
- Next roles, each forcing a different answer: **Shieldling** (deferred already: frontal shield, must be hit from behind or launched), **Healer/Summoner** (kill first, fragile),
  **Charger** (straight-line rush, must be sidestepped or parried), **Swarm** (flyers in groups, wants area attacks), **Turret/trap** (positional), **Assassin** (teleports behind, parry or dash).
- **Elites** = any enemy plus an affix (burning aura, reflects projectiles, splits on death): cheap variety.
- A **mini-boss** per arena and a **second boss** that recombines two earlier enemies' attacks.

### 2.5 No dodge-based defence — **S/M**
Parry is the heart of the game, but the only defensive alternative is the dash. A **perfect dodge** (dash through an attack's active frames) with a short slow-mo and a reward is the standard
companion in the genre and keeps the game playable for people who struggle with the parry window.

### 2.6 Accessibility, input and onboarding — **S to M**
The Game Accessibility Guidelines name **remapping** among the four most-complained-about issues; they also recommend toggle alternatives to holding inputs, a difficulty choice, saved settings and **interactive** tutorials.
We have: touch layout options, reduced flashing, screen-shake slider, volumes. We lack:
- **Gamepad support** (Gamepad API; haptics through `vibrationActuator`) — **M**, high value for the PC audience.
- **Key remapping**, hold-to-toggle for Defend and Ranged charge — **S/M**.
- **Difficulty / assist options**: enemy damage, parry window size, tell length — **S**. Our systems already have the numbers to scale.
- A **first-run tutorial** that teaches the action, not the key (the existing hints are text prompts) — **M**.
- Colour-blind-safe tell colours (tells rely on red/purple/orange) — **S**.

### 2.7 Currency with nothing to buy — **S/M**
Commits are collected for score. Pickups that cannot be spent feel hollow. Either spend them (shop between arenas, reroll a Patch offer, buy a heal) or drop the pickup and make kills feed the style meter.

### 2.8 Retention for a browser game — **M**
Evidence is thin (developer blog posts and platform docs), but consistent: **a seeded daily run** (same rules for everyone), a short **share string** copied to the clipboard,
and friends-scoped rather than global boards are what small games use. A **local best-of-day** needs no backend. A real leaderboard needs a server and score validation, which is a decision for the owner.

### 2.9 Combat polish still on the table — **S each**
- A **style/variety meter** (Devil May Cry's rank rewards varied moves and penalises repetition; getting hit drops the rank). Our run rank is only computed at the end. With 12 new moves, this is the natural scoring system.
- **Execution / finisher** on a staggered enemy (a short cinematic hit with a camera push).
- **Dedicated guard animation**, finger poses, boss kill cinematic, per-element death effects.
- **Ultimate meter** (filled by parries and kills) to give each element a signature burst.

### 2.10 World, story, audio — **L**
- The **world overhaul** (Corruption fantasy world replacing the contribution-graph level) is already planned; the owner dislikes the current map design. Everything level-related (biomes per element, hazards, secrets) should wait for it.
- **Story** is one banner line. A light frame (what the Corruption is, who the masked warrior is) would make the new boss and biomes mean something.
- **Music** is one generative loop. Per-area themes, a boss theme with a phase-2 layer, and a **listening pass** are missing. Audio has been measured, never heard (see `COMBAT_LOCK.md` §9).

### 2.11 Engineering and quality — **S to M**
- **iPhone 13 has not been measured since Milestone 2**, and never after the Combat Lock drop. This is the most important unknown for a mobile-first game.
- No CI: the Playwright scripts live outside the repo. Moving a smoke test (boot, each element, one fight, no console errors, zero runtime shader programs) into `tests/` and a GitHub Action would catch regressions before the owner does.
- `main.js` owns too much. Save data has versioning but no export/import or cloud. Offline PWA behaviour is untested.
- The unexplained "new shader programs after scripted element switches" item in `PERFORMANCE.md`.

## 3. What a game like this should have (checklist)
| Area | Have | Missing |
|---|---|---|
| Core combat | yes, strong | perfect dodge, execution |
| Enemy variety | 3 + boss | 4–6 roles, elites, mini-bosses |
| Boss fights | 1 | a second, recombining boss |
| Progression | tree + forks + tempering | in-run choices, sideways unlocks |
| Replayability | element swap | runs, modifiers, daily, style rank |
| Economy | score pickups | a sink |
| Elemental depth | imbue, freeze/shatter | reactions |
| Level variety | 1 level | biomes, hazards, secrets (after world overhaul) |
| Accessibility | partial | gamepad, remap, difficulty, tutorial |
| Meta | rank + records | achievements/badges, stats page, share |
| Presentation | strong visuals | story frame, music variety, boss cinematics |
| Quality | manual scripts | CI smoke tests, device measurements |

## 4. Something unique
The signature should come from what the game already is: **defence is the heart** (parry), the hero is a **masked spirit warrior**, and the world is being eaten by a **Corruption** that glitches
like broken code. Three candidates, with my honest assessment:

**A. Reactions + Merge (recommended as the elemental core).** Not unique by itself (Genshin, Noita), but it is the right *foundation*, and our version is different in one way: reactions are driven by
**your secondary element (Resonance)**, so every build is a *pair*, and the Merge patches (§2.2) only exist for pairs. Six elements-pairs = six distinct builds from four elements.

**B. Revert (limited rewind) — recommended as the unique signature.** The death screen already says `git reset --hard`; make the theme a verb.
- **Perfect parries charge Revert.** One charge rewinds the last ~3 seconds: your position, HP and energy return (enemy positions and HP too, coarsely), with a glitch-reverse visual and a pitched-down audio sweep.
  It turns the game's best skill into the thing that saves your run, so *defending well is literally how you undo mistakes*.
- Evidence and caution: Braid's reviewers note that Prince of Persia: Sands of Time **limited** its rewind because in an action game unlimited rewind makes combat too easy. Rewinding every object's state each frame is also
  expensive in the naive version, so snapshot at ~10 Hz and interpolate; keep the ring buffer to the player plus enemies in view.
- Fits `user_plans.md`: a new mechanic that changes play, not a stat.
- Risk: it can trivialise the boss. Mitigate with a hard cap (1–2 charges, none while the boss shield is up) and tuning in the Lab.

**C. The living board (terrain statuses).** Fire leaves burning columns, water ice, air updrafts, earth pillars; reactions happen on the ground too. High spectacle, but it leans on the lane/column terrain the owner is replacing, so **wait for the world overhaul**.

**Recommendation:** build **A** (reactions) and **B** (Revert) together as the identity, and carry **C** into the new world.

## 5. Suggested roadmap
| Step | Contents | Effort | Why now |
|---|---|---|---|
| 1 | **Verify**: iPhone 13 session, headphones audio pass, visual review of the 12 moves and 4 colossal abilities, then fix what that finds | S | everything else sits on top of it |
| 2 | Perfect dodge, difficulty/assist options, remapping, gamepad | M | accessibility and the PC audience |
| 3 | Reactions table + 6 reactions | M | element depth, cheap |
| 4 | Style/variety meter with rank | S | scores the new moves, feeds the Revert and Ultimate |
| 5 | Revert (rewind) | M | the unique signature |
| 6 | Patches (in-run choices) + Merge patches + currency sink | M | replayability |
| 7 | 2–3 new enemy roles, elites, one mini-boss | M each | variety |
| 8 | Daily seed + share string, local board | M | retention without a backend |
| 9 | CI smoke tests | S | stops regressions |
| 10 | World overhaul, biomes, second boss, story, music | L | the big content drop |

## 6. Questions for the owner
1. **Run structure:** keep one authored level, or move to short randomised runs (rooms + choices)? This decides steps 6 and 8.
2. **Unique feature:** is Revert (rewind) the identity you want, or would you rather the signature be terrain/world interaction (C)?
3. **Backend:** is a real online leaderboard worth running a server, or is local + share-string enough?
4. **Gamepad:** do you play with one on PC? (Decides whether step 2 is urgent.)
5. **Scope of the world overhaul:** before or after the systems above? I would put systems first so the new world is built for them.

## 7. Sources used
Web searches (directional, mostly secondary sources):
- Hades replayability analysis (Game Maker's-Toolkit-style video transcript): https://amara.org/videos/8d0Rd4ibbKQz/en/3318737
- Duo boons and keepsakes: https://primagames.com/gaming/hades-guide-legendary-heroic-duo-boons
- Roguelite persistence: https://amara.org/videos/7doGHxwrhRpX/en/3100738 and https://bugnet.io/blog/how-to-design-a-roguelite-meta-progression
- Genshin elemental reactions (player guides): https://www.rpgsite.net/feature/10318-genshin-impact-elements-elemental-combos-reactions-burst-and-their-effects
- Noita materials and emergent play: https://en.wikipedia.org/wiki/Noita_(video_game)
- Sekiro combat and boss design: https://www.superjumpmagazine.com/the-art-and-science-of-sekiros-combat/ and https://www.gameinformer.com/index.php/2019/01/14/sekiro-shadows-die-twices-new-combat-options-means-bosses-are-a-little-different
- Devil May Cry style rank: https://shacknews.com/article/110322/stylish-points-and-style-ranks-in-devil-may-cry-5
- Game Accessibility Guidelines: https://gameaccessibilityguidelines.com/basic/ and the IGDA SIG list https://igda-gasig.org/?p=3404
- Braid / rewind design: https://en.wikipedia.org/wiki/Braid_(video_game) and https://gamedeveloper.com/programming/recreating-the-time-mechanics-of-braid-part-1-
- Daily seeds and leaderboards (developer blog, platform docs): https://bootdiskrevolution.com/2021Blog/?p=2386 and https://developers.facebook.com/documentation/games/retain/leaderboards
- Earlier in this project (Combat Lock research): feedback timing, hit-stop tiers, parry windows, attack tokens, Spider-Man 2 progression; summarised in `COMBAT_LOCK.md`.
