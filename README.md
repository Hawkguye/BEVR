# Beyond Euclid VR

Walk through **curved 3D space** in a browser — Meta Quest 2 via WebXR, or desktop with mouse + WASD.

Three worlds, same glowing cubic lattice, switched at runtime:

| Key | Space | Honeycomb | What you should feel |
|---|---|---|---|
| `1` | Hyperbolic H³ | {4,3,5} — 5 cubes per edge | Space explodes outward; parallels diverge |
| `2` | Euclidean E³ | {4,3,4} — ordinary grid | The control world |
| `3` | Spherical S³ | {4,3,3} — 8 cells of the tesseract | Walk straight for `2πK` metres and return |

The math is the product. CPU geometry is float64 in a 4D embedding; only the final instance matrices go to the GPU as float32. See [docs/MATH.md](docs/MATH.md).

## Run locally

```bash
npm install
npm test          # math core — must be green
npm run dev       # http://localhost:5173
```

### Quest 2 (no certificates)

On the host, with the headset plugged in and USB debugging on:

```bash
adb reverse tcp:5173 tcp:5173
```

Open **`http://localhost:5173`** in the Quest browser (localhost is a secure context). Tap **ENTER VR**.

HTTPS fallback if you are not using adb reverse:

```bash
HTTPS=1 npm run dev
```

### Desktop

Click the canvas to pointer-lock. Headset not required.

| Control | Action |
|---|---|
| Mouse | Look |
| WASD | Walk (1.5 m/s) |
| Q / E | Snap turn 30° |
| 1 / 2 / 3 | H³ / E³ / S³ |
| P | Parallel Walkers |
| T | Triangle tool (click places a vertex; right-click clears) |
| `[` `]` | Curvature radius K (2–12 m) |
| R | Reset pose |
| V | Comfort vignette on/off |

In VR: left stick walk, right stick snap turn, right trigger selects the left-wrist panel and places triangle points, grip clears the triangle.

## Educational tools

1. **Parallel Walkers** — two orbs set off on geodesics that start parallel. Live distance: constant (E), growing (H), shrinking (S).
2. **Triangle tool** — three geodesic vertices. Angle sum = / < / > 180° in E / H / S. Hyperbolic deficit equals area (`κ = −1`).
3. **K slider** — metres per curvature radius. Small K = strongly curved world.

## Architecture

```
src/geometry/   lorentz.ts, lattice.ts, tube.ts   float64 4D math
src/render/     material.ts, world.ts             Klein / equidistant shader + instancing
src/xr/         input.ts, locomotion.ts           sticks, WASD, vignette
src/tools/      parallelWalkers.ts, triangle.ts
src/ui/         panel.ts                          wrist canvas + HUD
tests/          vitest — AGENTS.md §3.5
```

The Three.js camera stays at the tracking origin (plus head offset). Player pose `P` is a Lorentz/rotation matrix; we never use `camera.matrix` as the world transform.

## Performance (Quest 2 target)

- `framebufferScaleFactor 0.85`, foveation 1, no antialias, no lights, no post
- One instanced draw for the lattice, fog by geodesic distance
- Tune `visRadius` in `lattice.ts` if FPS drops below 72

## Demo script (2 minutes)

See [docs/DEMO.md](docs/DEMO.md).
