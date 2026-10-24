# Headless tests

Playwright (headless Chromium, software GL) driving the game through `window.__game`. Screenshots land in `shots/` (git-ignored).

Setup once: `npm install` in this folder. Then start the game server (`Play.bat`, port 8080) and run a test:

```bash
node t_regress.mjs        # all four elements: combos, specials, no console errors
node t_pyre2.mjs          # Pyre: stance, riding, combo, parry, BLAZE, rail grind, spit-trick, emotes
node t_pyre5.mjs          # Pyre: every move frozen at its key frame -> shots/p5_*.png
node t_pyre8.mjs          # Pyre: touch Skate button (tap / long press) in phone emulation
node t_all.mjs            # the big v2 sweep
```

`harness.mjs` holds the helpers (`open`, `gameWait`, `vpress`, `shot`, `cropShot`). Use `GAME_URL=http://localhost:PORT/` to test another server.
Results are CPU-side only (software rendering): frame rate and feel still need a real device.
