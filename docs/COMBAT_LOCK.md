# COMBAT LOCK — what the combat does now

This document describes what is **implemented**. Things that are not done are in the last two sections. Numbers come from
the code (`src/player.js`, `src/combat.js`, `src/enemies.js`, `src/elements.js`, `src/skills.js`, `src/audio.js`).

## 1. Principles (from the research pass)
- Acknowledge every press inside ~100 ms (animation, sound, motion), even when the hit lands later.
- Inputs are buffered, the **first** buffered press wins, and a real hit taken clears the buffers.
- Every attack has an explicit timeline: startup → contact (active window) → follow-through → recovery, with a cancel point.
- Feedback comes from one table (`FEEDBACK`), so a launcher always feels like a launcher and a slam like a slam.
- Enemies attack in turns (attack tokens) and always telegraph; heavy attacks are slower, so they are fair to read.
- Stats are not the reward for progression; mechanics are. Stat bumps live on a separate track (Tempering).

## 2. Player control
| Rule | Value |
|---|---|
| Buffer windows (real time, not slowed by hit-stop or slow-mo) | main .16 s, jump .14, dash .16, special 1/2 .16, ranged .12, guard .09 |
| Several presses buffered | the oldest one wins |
| Up / down / direction on main | latched at press time (launcher vs ground resolves consistently) |
| Changing move type (ground → launcher → air) | resets the combo counters |
| Contact | `hitAt` per hit; the animation clip is started with an offset so its peak lands on `hitAt` (`CLIP_PEAK`, measured from the actual clips) |
| One swing, one hit per enemy | `atk.hit` Set; the contact window uses the recorded hit box |
| Cancel | at `cancelAt` into dash / jump / special; a buffered special/ranged also casts after contact |
| Getting hit | interrupts attack/cast/slam, clears buffers, plays the hit clip. Exception: **Stonewill** (Earth) keeps swinging during the wind-up of a combo hit |
| Dash | Roll clip plays once, forced; no restart each frame |
| Landing clip | scaled by fall speed; skipped when running through it |
| Death | plays the death clip before the model is hidden |

### Parry and block
- Guard is a tap/hold. Parry window = `0.18 s × (1 + parry mods)`.
- **Spam penalty:** every extra guard press within 0.5 s shrinks the window by 30% (floor 30%).
- A parry sets `counterT = 0.45 s`: the next main hit gets ×1.5 damage and ×2 poise and says `COUNTER`.
- A block sets 0.12 s of i-frames so one attack (brute smash + its wave) cannot be blocked twice.
- Guard cannot cancel a slam dive.

## 3. Feedback hierarchy (`FEEDBACK` in combat.js)
Hit-stop is in seconds (max, never stacked, capped at 0.3 s). Shake is spent from a per-frame budget (0.5).

| Kind | hit-stop | shake | FOV kick | aberration |
|---|---|---|---|---|
| light | .066 | .12 | .6 | 0 |
| air hit | .050 | .09 | .4 | 0 |
| ranged | .040 | .08 | .3 | 0 |
| special | .060 | .14 | .8 | 0 |
| heavy | .090 | .22 | 1.2 | 0 |
| finisher | .110 | .30 | 1.8 | .002 |
| crit | .100 | .26 | 1.5 | .003 |
| launcher | .100 | .28 | 2.0 | 0 |
| spike | .120 | .36 | 2.5 | .004 |
| bounce | .100 | .30 | 2.0 | .004 |
| slam | .170 | .60 | 4.0 | .008 |
| stagger (poise break) | .080 | .20 | 1.0 | 0 |
| block | .070 | .22 | 0 | 0 |
| deflect | .100 | .30 | 2.0 | .006 |
| parry | .220 | .50 | 5.0 | .020 |
| kill | .080 | .30 | 0 | .004 |
| big kill | .160 | .70 | 6.0 | .012 |
| hurt (you) | .120 | .50 | −2.5 (inward) | .014 |

The victim vibrates during hit-stop. A poise break plays a distinct ring + `BREAK` text + sound.

### Audio (synthesized, `audio.js`)
- Hit sound = transient + body + tail (80–150 ms) with element colour, material (flesh / metal / wood) and a combo pitch
  rise of at most 7 semitones with ±1–2 semitone variance.
- Per-sound retrigger floors and voice caps, a master limiter, fake ducking on big events.
- Each enemy has its own telegraph sound (bug / pointer / bot / boss / summon).
- Measured offline (`_record`, `OfflineAudioContext`): light hit ≈ −9 dB peak, heavy ≈ −2 dB, parry ≈ −1 dB, nothing clips.
- No sampled audio was added: no CC0 sample was good enough to justify the licence/size cost without an in-ear check.

## 4. Elements (identity enforced in code)
| Element | Plays like | Notable mechanics |
|---|---|---|
| Fire | pressure / damage over time | burn brands (+25% from everything), spreads on death, finisher pillar, Phoenix Dash refunds ranged + energy |
| Water | control | three chills freeze (0.8 s stun), Frostbite slow 42% + 30% damage, finishers shatter frozen enemies, bolt pulls |
| Earth | force / stagger | hyper-armour wind-ups, Rebound charge from blocks, quake launches / stuns |
| Air | mobility / combo extension | air hits refund the air dash and lift 15% higher, cyclone flings caught enemies |

Juggle decay: each air hit lifts 24% less; after 6 hits the target is forced down, so a chain always ends.

## 5. Enemy roles
| Enemy | Role | Tell | Counterplay |
|---|---|---|---|
| Bug | flanker, 22 HP | 0.54 s crouch + lunge arrow (pounce 0.6 s when more than one bug) | dodge, then punish its 0.8 s vulnerable window; kill it in 1–2 hits |
| Null Pointer | sniper | 0.9 s charge, aim line tracks until 0.65 s then locks, orb speed 9, max 2 orbs alive | break line of sight, parry/deflect returns the orb |
| Legacy Bot | armoured bruiser | 1.0 s wind-up with a floor danger ring, hyper-armour during it | parry or slam it; 1.5 s recovery (poise ×1.6) is the punish window |
| Boss | see below | per attack | see below |

**Encounter director:** one melee, one ranged and one heavy attack token. Enemies without a token circle at ring distance.
No attacks while off-screen (more than 8.4 m from the camera) or while you are in hit-stun. Chill slows tells with the enemy.

### Boss
- Phase 1 pattern: slam → barrage → slam → summon. Phase 2 (entered once, with a shield): sweep, double-wave slam, barrage,
  falling-block rain, summon.
- Shield: damage ×0.3, poise ×2; a poise break drops it. A poise break stuns once per 6 s.
- First parry breaks it; after that it resists for 8 s (only chips poise, `GUARDED`).
- Immune to bounce and launch. Body check is a timed shove (10 damage, 1.4 s cooldown), not per-frame contact damage.
- Slam fist locks 0.3 s before the drop, so it can be baited.

## 6. Progression (skills.js)
- Three mechanic branches + Resonance per element; tier 1 unlocks a mechanic, tier 2 modifies it, tier 3 masters it.
- One branch per element has a **fork** at tier 3 (two masteries, switch freely while owned).
- **Tempering**: 5 stat tracks × 3 ranks, 1 point each, shared. 15 ranks exist and there are never enough points for everything.
- Levels cap at 24. Save version 2 refunds owned nodes (level, XP, Resonance and records are kept).
- Fixed dead nodes: Frostbite (now slows and amplifies), Rebirth (once per run), Immovable (regenerates only while blocking).

## 7. Training Grounds as a test tool
- Lab → **Combat debug** shows attack phase / contact / cancel, buffers, guard time vs parry window, hit-stop, time scale,
  tokens and per-enemy state, tell, poise, juggle count.
- `window.__game.dbg()` returns the same data as JSON; the event bus emits `playerHit {result, amount}` for every hit taken
  (`hit`, `block`, `parry`, `deflect`).

## 8. Verified (automated, Playwright on headless Chromium)
Roll plays monotonically; ground chain 0/1/2; a real hit interrupts an attack and clears buffers; parry window and spam logic;
max one concurrent attacker per role; tell durations match the table above; boss cannot be bounced, launched or parry-locked;
guarding inside the boss costs 10 HP per 3 s instead of killing; skill purchase, fork pick and re-pick, Tempering, freeze → shatter
(real UI clicks); no console errors.

## 9. NOT verified
- **iPhone 13** frame rate and touch feel: not measured by the author.
- **In-ear audio:** levels and clipping were measured from rendered WAVs; how it sounds on headphones was not judged.
- Animation contact sync was checked with timings and the event bus, not frame by frame with screenshots for every move.
- Mechanics added to the trees (Spreading Embers, Rebound, Riptide, Undertow, Spire, Jetstream, Solar Flare, Phoenix Cadence,
  Inferno pillar) have been run in the game without errors but only Deep Chill / Shatter have scripted assertions.

- **Runtime shader programs:** a scripted run that calls `startTraining` for water → earth → air in one page still creates new programs on the
  first switch (8 programs, 1–4 hitches). The same script gives the identical result on the commit before this drop, so it is not caused by it,
  but it is not fixed either. Earth started on its own (and fire / water first) shows 0 hitches. The cause has not been tracked down.

## 10. Deferred
Extra enemy archetype (Shieldling), finger animation, a dedicated guard clip (guard is pose-only), world overhaul, Air Wind Wall
reflect cap (left strong on purpose), per-tier particle budget when many enemies are alive.
