# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

No build tools. Open `index.html` directly in a browser (`open index.html` on macOS).

## Architecture

Single-page browser game — 3 files, zero dependencies:

- **`index.html`** — minimal shell that loads the canvas and script
- **`style.css`** — fullscreen black background, CRT glow effect
- **`game.js`** — all game logic (~540 lines)

### game.js structure

The file is organized into labeled sections (marked with `// ──` comment banners):

1. **Canvas Setup** — responsive fullscreen canvas
2. **Constants** — all tunable gameplay values (speeds, sizes, timers, scoring)
3. **Audio** — Web Audio API oscillator-based sound effects (`playSound` + named `sfx*` wrappers)
4. **Input** — `keys` object tracking pressed state via `keydown`/`keyup`
5. **Game State** — module-level variables; `initGame()` resets everything; `createShip()`/`createAsteroid()`/`spawnWave()`/`spawnExplosion()` are factory functions
6. **Update** — single `update(dt)` handles state machine (`"start"` → `"playing"` → `"gameover"`), physics, collisions, and wave progression
7. **Draw** — `draw()` dispatches to `drawShip`/`drawAsteroid`/`drawHUD`/`drawTitleScreen`/`drawGameOver`
8. **Game Loop** — `requestAnimationFrame` with delta-time capping at 50ms

### Key design decisions

- All entities are plain objects with `{x, y, vx, vy}` — no classes
- Collision detection uses circle approximation (`dist < radius`)
- Screen wrapping uses a 50px offscreen buffer so objects don't visually pop
- Asteroids store pre-generated irregular polygon vertices (`verts` array)
- High score persists via `localStorage` key `"asteroids_highscore"`
- Visual style is stroke-only (no fills) for authentic vector graphics look
