# Crystal Vale

A 3D action-adventure browser game built with **Three.js**. You play a small robot in a sunlit valley:
find the **7 energy crystals**, wake the ancient portal and step through it — without letting the sentinels
or the laser vaults drain your health.

## Run it

Requires Node.js 18+.

```bash
npm install
```

```bash
npm run dev
```

Open the address Vite prints (default `http://localhost:5173/`).

Production build (static files in `dist/`, can be hosted anywhere):

```bash
npm run build
```

```bash
npm run preview
```

## Controls

| Input | Action |
| --- | --- |
| `W A S D` / arrow keys | Move (physical keys, so `Z Q S D` on AZERTY) |
| Mouse | Look around, wheel zooms |
| `Shift` | Run (uses stamina) |
| `Space` | Jump — land on a sentinel to crush it |
| `C` / `Ctrl` | Crouch — sneak past sentinels, slip under lasers |
| `F` / left click | Punch |
| `E` | Interact (chests, portal) |
| `Esc` / `P` | Pause |

## How to win / lose

- **Win:** collect all 7 crystals (cyan light shafts, cyan dots on the radar), return to the portal and press `E`.
- **Lose:** health reaches 0.
- Score: coins +10, chests +50, sentinels +50, crystals +100, plus a time and health bonus on victory.

## Project structure

```
index.html          UI markup (menus, HUD)
src/main.js         bootstrap, game state machine, camera, render loop, post-processing
src/world.js        procedural terrain, water, sky, lights, trees, grass, collision queries
src/player.js       character controller + AnimationMixer state machine
src/enemies.js      sentinel AI (patrol / chase / attack)
src/level.js        crystals, coins, hearts, chests, laser vaults, portal
src/particles.js    pooled GPU particle system
src/audio.js        synthesized sound effects and music (Web Audio)
src/input.js        keyboard / mouse / pointer lock
src/ui.js           menus, HUD, settings, minimap
tests/smoke.mjs     end-to-end gameplay test (headless Chromium via Playwright)
```

## Tests

With the dev server running:

```bash
npm test
```

The test drives the real game with key and mouse events and checks menus, movement, jumping, crouching,
collisions, pickups, lasers, enemy AI, combat, pause, win, lose and restart. It needs Playwright with
Chromium available on the machine.

## Credits

- Character: *RobotExpressive* by Tomás Laulhé, modified by Don McCurdy — CC0 (from the three.js examples).
- Everything else (terrain, props, shaders, sounds) is generated in code.
