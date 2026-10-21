# Elemental Commit — notes for Claude

Side-view **3D** elemental action game (three.js, plain ES modules, **no build step**). Live at
https://ricsard0981.github.io/elemental-commit/ (GitHub Pages, auto-deploys on every push to `main`
via `.github/workflows/pages.yml`).

**Read `docs/DEVELOPER_GUIDE.md` and `docs/HANDOFF.md` first.** They have the full history, decisions and the owner's preferences.
Milestone 2 and the Combat Lock drop are done (`docs/MILESTONE_2_PLAN.md` is historical). Combat rules are in `docs/COMBAT_LOCK.md`; the researched roadmap is `docs/NEXT_STEPS.md`.
`user_plans.md` is mandatory, top-priority product direction.

## Run / test
- Serve: `npx http-server -p 8080 -c-1 .` → http://localhost:8080. It must be served over http; `file://` breaks ES modules.
- Phone testing: push to `main` and open the Pages URL. The owner tests on an **iPhone 13**.
- Debug handle in the browser console: `window.__game` (G, startRun, spawnEnemy, giveXP, ENG, Q, perfStats, In, …).
- `?debug` in the URL turns three.js shader error checks back on.
- Automated checks: Playwright (headless Chromium) driving `window.__game`, with phone emulation + CDP touch events for touch controls.

## Code map (`src/`)
main.js (loop, run lifecycle, arenas, checkpoints, win/death) · engine.js (renderer, bloom/FX pass, particles, debris, rings/slashes, camera, quality presets, dynamic resolution, shader warm-up) · world.js (level layout, collision, contribution-graph terrain, backdrop) · player.js · elements.js (4 elements × main/ranged/guard/2 specials) · enemies.js · combat.js (damage, parry, projectiles, pickups, combo, XP) · skills.js (trees, progression, save) · ui.js (HUD, skill tree UI) · touch.js (touch controls) · settings.js / settingsUI.js · input.js · audio.js (all synthesized) · state.js (shared `G`) · util.js

## Rules that matter
- No bundler. three.js r170 is vendored in `vendor/` through an import map in `index.html`. Keep asset paths **relative** (Pages subpath, future desktop wrapper).
- **Don't `dispose()` transient effect materials.** A program is freed when its last material goes, so the next effect recompiles it (a GPU stall). Add new material variants to `warmup()` in engine.js.
- Every feature must work with **touch** (`touch.js`) and on the **Low/Medium/High** presets (`Q` in engine.js, `QUALITY` in settings.js). Keep iPhone 13 on High at ~60 fps.
- HUD per-frame writes go through the cached `put()` in ui.js.
- Commit messages are plain and descriptive. The owner reviews on GitHub and on their phone.
