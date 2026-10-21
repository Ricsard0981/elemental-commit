# Vertical Slice Plan — Elemental Commit

## 1. Pillars
1. **Every action pays off visually.** If the player did something skillful (parry, combo, kill, level-up, pickup), the screen, sound and world answer back.
2. **Defence is an attack.** Perfect parries are the most rewarding verb in the game.
3. **Four elements, four playstyles.** Same level, different game. Replaying with another element should feel new.
4. **The environment is GitHub.** Contribution-graph terrain, commits as currency, bugs as enemies, review gates as arenas, checkpoints as commits, the boss is legacy code.

## 2. Scope of the slice (what ships in this repo)
| Area | In the slice |
|---|---|
| Camera / look | Side-view gameplay on a 2D plane, full 3D rendering (perspective camera, shadows, bloom, fog, parallax skyline) |
| Elements | Fire, Water, Earth, Air — each: 1 main, 1 ranged, 1 defence, 2 specials |
| Movement | Run, variable jump, double jump (+1 via skill), dash with i-frames, coyote time, input buffer, drop-through slabs |
| Skill trees | 3 branches × 3 tiers per element (36 nodes), points from level-ups, refund, saved in `localStorage` |
| Enemies | Bug (melee), Null Pointer (ranged, parry-able), Legacy Bot (heavy, poise), THE LEGACY MONOLITH (2-phase boss) |
| Level | ~270 m long: tutorial → pits → arena A → rise → arena B → victory lap → boss arena. 3 checkpoints |
| Progression | XP, levels (cap 14), run rank S–C, best-run per element |
| Feedback | See "Juice budget" below |
| Audio | Fully synthesized SFX + generative adaptive music (no files) |
| Hosting | Static site, GitHub Pages via Actions |

## 3. Core loop
`Explore → Fight (combo/parry) → Collect commits + XP → Level up → Spend skill point → Stronger → Review gate → Boss → Rank → Replay with another element`

## 4. Element design
Each element answers "what is the player's fantasy?":

| Element | Fantasy | Main | Ranged | Defence | Special 1 | Special 2 | Signature passive feel |
|---|---|---|---|---|---|---|---|
| Fire | Glass cannon, DoT, explosions | Flame Blade (fast, ignites) | Fireball (AoE) | Flame Ward → nova | Phoenix Dash | Meteor Storm | Burning enemies chain-explode (T3) |
| Water | Control + sustain | Tide Whip (wide, chills) | Water Bolt (homing) | Bubble Shield → heal + wave | Tidal Wave | Healing Rain | Chill → frostbite → splitting bolts |
| Earth | Tank, poise breaker | Stone Fists (heavy) | Rock Throw (lobbed) | Stone Skin → mass stun | Quake | Stone Bastion | Stun-crush, reflect, immovable |
| Air | Mobility + zoning | Gale Blades (fast, long) | Wind Cutter (pierce) | Wind Wall → deflect | Cyclone | Sky Dance (flight) | Haste loops, vacuum deflect |

### Defence rules (shared)
- Hold **Defend** → block (element-specific reduction, facing matters except Water).
- Press **just before** a hit lands (window 0.22 s, +skills) → **Perfect Parry**:
  hit-stop 0.16 s → slow-mo → chromatic aberration → shock rings → attacker staggered/vulnerable → projectile reflected ×3 → element counter (nova / heal / stun / gust).
- Releasing guard has a 0.3 s cooldown — no parry spam.

## 5. Juice budget (why it "feels satisfying")
- **Hit-stop** scaled by hit weight (45 ms → 160 ms) + **camera trauma** (noise-based shake) + **FOV punch**.
- **Slow-mo** on parries, heavy kills, boss phase change, death.
- **Squash & stretch** on the player; procedural attack/guard/cast poses.
- **Post FX**: bloom pulses, chromatic aberration on impacts, element-tinted flashes, vignette flash on damage.
- **World reacts**: every explosion / slam / wave sends a ripple through the contribution-graph bars.
- **Enemy telegraphs** (red flash, sound, ground markers) so every hit is readable & parry-able.
- **Loot magnet**: killed enemies burst into commit cubes that fly to you with rising-pitch pickups.
- **Combo ranks** (NICE → FULL STACK) with banners; combo multiplies drops.
- **Level-up / gate / checkpoint** moments: banners, shock rings, confetti cubes, heal, fanfare.
- **Input feel**: coyote time, jump & action buffering (even through hit-stop), soft aim-assist, mouse-aimed ranged attacks.

## 6. Milestones
- [x] M1 — Engine: renderer, post, particles, camera, input, audio
- [x] M2 — World: contribution-graph terrain, platforms, pits, backdrop, checkpoints, gates
- [x] M3 — Player controller + procedural animation
- [x] M4 — Combat core: damage, hit-stop, poise, statuses, projectiles, pickups, combo
- [x] M5 — Four elements (20 abilities) + defence/parry
- [x] M6 — Enemies + arenas + boss
- [x] M7 — Skill trees + progression + save
- [x] M8 — HUD, menus, banners, death/win flow
- [ ] M9 — Playtest tuning pass (numbers in `elements.js` / `enemies.js`), perf pass on low-end GPUs
- [ ] M10 — Gamepad + accessibility toggles (screen-shake / flash reduction)

## 7. Known limitations (honest list)
- Tuned by feel, not by telemetry — expect balance changes.
- No touch controls yet.
- Enemy pathing is lane-based (they don't use floating slabs).
- Audio is synthesized, so it is functional/charming rather than studio quality.

## 8. Next slices
1. **Biomes** — Issues tab swamp, Actions factory, Pull-request tower.
2. **Elemental reactions** — steam (fire+water), mud (water+earth), firestorm (fire+air), sandstorm (earth+air).
3. **Gear / stashes** — passive items found in chests.
4. **Second boss** — "The Merge Conflict" (two arms, `<<<<<<<` vs `>>>>>>>`).
5. **Co-op / hot-seat** — two elements at once.
