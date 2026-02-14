# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

No build tools. Open `index.html` directly in a browser (`open index.html` on macOS).

## Architecture

Single-page browser game — 3 files, zero dependencies:

- **`index.html`** — minimal shell that loads the canvas and script
- **`style.css`** — fullscreen black background, CRT glow effect
- **`game.js`** — all game logic (~1330 lines)

### game.js structure

The file is organized into labeled sections (marked with `// ──` comment banners):

1. **Canvas Setup** — responsive fullscreen canvas
2. **Constants** — tunable gameplay values (speeds, sizes, timers, scoring) plus ship-stat-driven `let` variables (`shipThrust`, `shipTurnSpeed`, `shipFireCooldown`, `shipBulletLife`)
3. **Ship Types** — `SHIP_TYPES` array defining 3 ships (The Wave, Interstellar, Terminator) with speed/attack/range stats; `applyShipStats()` resolves stats to gameplay constants
4. **Highscore Persistence** — top 10 via `localStorage` key `"asteroids_top10"` with name entry
5. **Audio** — Web Audio API oscillator-based sound effects (`playSound` + named `sfx*` wrappers), UFO hum oscillator
6. **Input** — `keys` object tracking pressed state via `keydown`/`keyup`
7. **Game State** — module-level variables; `initGame()` resets everything; factory functions for ship/asteroid/UFO/particles/splash rings
8. **Splash Damage** — Terminator-only mechanic: `applySplashDamage(x, y)` damages entities within `SPLASH_RADIUS`, visual expanding ring effect
9. **Update** — `update(dt)` handles state machine (`"start"` → `"shipselect"` → `"playing"` → `"gameover"` / `"entername"` → `"scores"`), physics, collisions, wave progression, UFO AI
10. **Draw** — `draw()` dispatches per state; 3 ship draw functions (`drawShipWave`/`drawShipInterstellar`/`drawShipTerminator`), ship select screen, name entry screen, scores screen
11. **Game Loop** — `requestAnimationFrame` with delta-time capping at 50ms

### Key design decisions

- All entities are plain objects with `{x, y, vx, vy}` — no classes
- Collision detection uses circle approximation (`dist < radius`)
- Screen wrapping uses a 50px offscreen buffer so objects don't visually pop
- Asteroids store pre-generated irregular polygon vertices (`verts` array)
- Top 10 highscores persist via `localStorage` key `"asteroids_top10"` with name/score/wave
- Visual style is stroke-only (no fills) for authentic vector graphics look
- Ship selection screen (`"shipselect"` state) lets player choose from 3 ships before each game
- Ship stats (speed/attack/range) map to gameplay constants via `applyShipStats()` — speed affects thrust & turn, attack affects fire cooldown, range affects bullet lifetime
- Terminator ship has unique splash damage: bullets explode on hit, damaging nearby entities within `SPLASH_RADIUS` (60px) with expanding ring VFX
