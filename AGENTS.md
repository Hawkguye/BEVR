# Project spec: "Beyond Euclid VR" (Three.js + WebXR, Meta Quest 2)

> Instructions for the Cursor agent. Read all of it before writing code. Build in the milestone order at the bottom. Do not skip the unit tests: the math is the product.
> (Tip: copy this file to the repo root as `AGENTS.md` so Cursor always loads it.)

## 1. What we are building

A VR experience (runs in the Quest 2 browser via WebXR, plus a desktop fallback) where you **physically walk through curved 3D space**.

Hackathon brief: non-Euclidean geometry must be central and meaningful; judged on Geometric Creativity 30%, UX/Interaction 30%, Graphics/Technical 25% (target 30+ FPS, we target 72), Docs/Presentation 15%. Bonuses: educational value, beyond-gaming, polish, novel technical approach.

**Concept:** one explorer app with three worlds, switchable at runtime:

| Mode | κ | World | Cell |
|---|---|---|---|
| Hyperbolic (hero mode) | −1 | H³, honeycomb {4,3,5} (5 cubes around every edge) | cube |
| Euclidean (control) | 0 | ordinary cubic lattice {4,3,4} | cube |
| Spherical | +1 | S³, honeycomb {4,3,3} = the 8 cubic cells of the tesseract | cube |

Same lattice-of-glowing-edges aesthetic in all modes, so the player directly compares how space behaves.

**Educational tools (these make it "felt", not cosmetic):**
1. **Parallel Walkers:** two orbs start side by side and walk "straight ahead, parallel". Live HUD shows the distance between them: constant (Euclid), exponentially growing (hyperbolic), shrinking and meeting (spherical).
2. **Triangle Tool:** trigger places 3 points; the app draws the geodesic triangle and shows the three angles, their sum, and the angle deficit/excess (area = π − sum in H³ plane with κ=−1).
3. **Curvature scale slider:** changes `K` (meters per curvature radius). Small K = strongly curved world.

## 2. Tech stack

- Vite + TypeScript + Three.js (latest r17x or newer) + `vitest` for unit tests.
- WebXR via `renderer.xr`, session `immersive-vr`, reference space `local`.
- Dev loop: `adb reverse tcp:5173 tcp:5173` then open `http://localhost:5173` in the Quest browser (localhost is a secure context, no certificates needed). Fallback: `@vitejs/plugin-basic-ssl`.
- Desktop dev without headset: mouse-look + WASD fallback (required) and/or Meta's Immersive Web Emulator extension.
- No heavy dependencies. No post-processing passes (Quest 2 budget).

## 3. Math core (`src/geometry/`)

Everything lives in 4D embedding coordinates `(x, y, z, w)`. **All CPU math in float64** (plain `Float64Array`/numbers). Only the final per-frame matrices go to the GPU as float32.

### 3.1 Conventions
- Matrices are 4×4, **column-major** (`m[col*4+row]`), column vectors, `v' = M·v`. This matches GLSL `mat4` so arrays upload directly.
- Metric sign `σ = −1` for hyperbolic, `+1` for spherical. Form: `⟨a,b⟩ = a.x*b.x + a.y*b.y + a.z*b.z + σ*a.w*b.w`.
- The origin (player/cell center) is `O = (0,0,0,1)`. Valid points satisfy `⟨p,p⟩ = −1` (hyperbolic, w>0) or `= +1` (spherical) or `w = 1` (Euclid, affine).
- Helpers parameterized by κ:

```
C_κ(d) = cosh d | 1 | cos d        (κ = -1 | 0 | +1)
S_κ(d) = sinh d | d | sin d
```

### 3.2 Boost / translation along unit direction `u` by distance `d`
```ts
// M[i][j] = row i, col j (store column-major!)
M[i][j] = (i==j ? 1 : 0) + (C - 1) * u[i] * u[j]   // i,j in 0..2
M[i][3] = S * u[i]                                  // i in 0..2
M[3][j] = -kappa * S * u[j]                         // j in 0..2  (+S·u for hyperbolic, −S·u for spherical, 0 for Euclid)
M[3][3] = C
```
Check: `M·O = (S·u, C)`. For κ=−1 that is `(sinh d·u, cosh d)`, a point at distance d. For κ=+1 the matrix is a rotation in the (u,w) plane.

### 3.3 Required functions (`lorentz.ts`)
- `inner(a,b,κ)`, `distance(a,b,κ)` (`acosh(-⟨a,b⟩)` / `acos(⟨a,b⟩)` / Euclid norm of xyz difference).
- `boost(u,d,κ)`, `rotationY(angle)`, `rotationFromQuaternion(q)` (3×3 embedded in 4×4), `mul`, `identity`.
- `inverse(M,κ)`: for κ≠0 use `G·Mᵀ·G` with `G = diag(1,1,1,σ)`; for κ=0 use a generic float64 4×4 inverse.
- `reorthonormalize(M,κ)`: Gram–Schmidt on the columns using the form `⟨,⟩`, so the player pose does not drift. Call every frame (κ≠0).
- `geodesic(A,B,s,κ)`: with `d` from the inner product,
  `γ(s) = (S_κ((1−s)d)·A + S_κ(s·d)·B) / S_κ(d)` for κ≠0, linear interpolation for κ=0.
- `angleAt(A,B,C,κ)`: tangent at A toward B is `u_B = (B + σ'⟨A,B⟩·A)/S_κ(d_AB)` where `σ' = +1` hyperbolic (since ⟨A,B⟩=−cosh d), `−1` spherical; the angle is `acos(⟨u_B,u_C⟩)`. Euclid: ordinary angle between xyz difference vectors.

### 3.4 Lattice (`lattice.ts`)
- Face-center distance of the base cube (call it `a`):
  - hyperbolic: `a = asinh(sqrt(cos(2π/5)))` ≈ 0.5331 (this makes the dihedral angle exactly 72°, so 5 cubes close up around an edge)
  - spherical: `a = π/4` (dihedral 120°, 3 cubes per edge)
  - Euclid: `a = 0.5` (any scale; dihedral 90°)
- The 8 cube vertices are `(±c, ±c, ±c, w)`:
  - hyperbolic: `coth a = cosh a / sinh a`, `c = 1/sqrt(coth²a − 3)`, `w = c·coth a` (≈ 0.8995, 1.851)
  - spherical: `c = w = 1/2`
  - Euclid: `c = a`, `w = 1`
- Cube edges connect vertices that differ in exactly one sign (12 edges).
- Neighbor cells: the 6 generator isometries are `T_i = boost(±axis_i, 2a, κ)`. A cell is a matrix `G`; its neighbors are `G·T_i`. BFS from the identity, **deduplicate by the cell center** (last column of `G`) rounded to 1e-3, cap at `maxCells` (default 4000) and/or max graph depth. Spherical mode terminates naturally with 8 cells.
- Because the tiling is homogeneous, **no recentering is needed**. Keep the player pose `P` unbounded and re-orthonormalize it.
- Per frame: compute player position `p = P·O`, select cells whose center is within `visRadius` (hyperbolic units, default ≈ 2.4, tune for FPS) of `p`, and write the instance matrices (see section 4).

### 3.5 Unit tests (must pass before moving on)
- `‖M·O‖` constraint: all cube vertices satisfy `⟨v,v⟩ = −1` (H) / `+1` (S).
- Dihedral check: with outward normals `n_x=(cosh a,0,0,sinh a)`, `n_y=(0,cosh a,0,sinh a)`, `cos θ = −⟨n_x,n_y⟩ = sinh²a = cos 72°`.
- `boost(u,d)·boost(u,−d) ≈ I`; `MᵀGM ≈ G` after 1000 random boosts + `reorthonormalize`.
- Lattice BFS: depth-1 count = 7 (1 + 6); spherical total = 8; no duplicate centers.
- Triangle: random triangles give angle sum `< π` (H), `> π` (S), `= π` (E); hyperbolic area `= π − sum` is positive.
- Parallel walkers: separation computed with `distance()` grows monotonically (H), stays constant (E), and decreases (S) as the walkers advance.

## 4. Rendering (`src/render/`)

**Key idea:** do not use Three's camera for geometry. We own the view matrix. Three's `projectionMatrix` per eye is still used so the stereo frustum is correct.

### 4.1 Geometry of the cell mesh
Build ONE `BufferGeometry` for the whole cube cell, in the cell's local frame, in 4D coordinates:
- Attribute `position4` (vec4): 4D point. Also set `position` (xyz) and an index so Three draws correctly.
- **Edge tubes:** for each of the 12 edges `A→B`, sample `γ(s)` at ~6 steps. Let `e1, e2` be two unit vectors orthogonal (under `⟨,⟩`) to both A and B (Gram–Schmidt from standard basis vectors). Tube vertex:
  `P(s,θ) = C_κ(r)·γ(s) + S_κ(r)·(cosθ·e1 + sinθ·e2)`, with `r ≈ 0.02–0.03` hyperbolic units, 6 sides.
  Euclid: `e1,e2` are perpendicular to the edge in xyz with `w=0`, and `P = γ + r(...)`.
- **Nodes:** small low-poly sphere (octahedron/icosphere) at each of the 8 vertices using the same exp-map formula with tangent directions orthogonal to the vertex.
- Budget: ≤ ~1000 triangles per cell, ≤ 300k visible triangles total. Fewer sides/segments if FPS drops.
- Optional extra: faint translucent face panes, and a "landmark" (bright object) in specific cells chosen by hashing the cell center, so players can tell cells apart.

### 4.2 Instancing
One `InstancedMesh` with `ShaderMaterial` (Three auto-declares `attribute mat4 instanceMatrix` and `USE_INSTANCING` for ShaderMaterial; do NOT redeclare it). Set `frustumCulled = false`, `instanceMatrix.setUsage(DynamicDrawUsage)`.
Each frame, per visible cell: `instanceMatrix_i = inverse(P) · G_i` (float64, then write into the float32 array). Also set `instanceColor` (hash of cell id, or a calm palette, hue shifted by depth).

### 4.3 Per-eye uniform
Register `mesh.onBeforeRender = (renderer, scene, camera) => { ... }`. With WebXR, Three calls this once per eye with that eye's sub-camera (verify on the installed Three version). In it:
1. `t` = camera world position (Euclidean meters, tracking space; keep the camera rig at the origin so this is head+eye offset).
2. `R` = rotation from `camera.quaternion`.
3. `uEye = Rᵀ · boost(t̂, −|t|/K, κ)` (the full view is `Rᵀ·B(−t)·P⁻¹`; the `P⁻¹` part is already baked into `instanceMatrix`). If `|t|` is ~0 use `Rᵀ` alone.
   This makes stereo disparity come from true curved-space eye offsets.

### 4.4 Vertex shader sketch
```glsl
attribute vec4 position4;
uniform mat4 uEye;
uniform float uK;       // meters per unit curvature radius
uniform float uKappa;   // -1, 0, +1
varying vec3 vColor;
varying float vFog;

void main() {
  vec4 p = uEye * instanceMatrix * position4;   // point in eye frame, camera at (0,0,0,1)

  vec3 k;      // position in "display space", meters
  float dist;  // geodesic distance from eye, in curvature units
  if (uKappa < 0.0) {            // hyperbolic: Klein model (geodesics -> straight lines)
    dist = acosh(max(p.w, 1.0));
    k = p.xyz / p.w * uK;
  } else if (uKappa > 0.0) {     // spherical: azimuthal equidistant (direction-preserving)
    dist = acos(clamp(p.w, -1.0, 1.0));
    float n = length(p.xyz);
    k = (n > 1e-6 ? p.xyz / n : vec3(0.0, 0.0, -1.0)) * dist * uK;
  } else {                       // Euclidean
    dist = length(p.xyz);
    k = p.xyz * uK;
  }
  vFog = 1.0 - smoothstep(uFogStart, uFogEnd, dist);   // add these uniforms
  vColor = instanceColor;                               // use USE_INSTANCING_COLOR guard
  gl_Position = projectionMatrix * vec4(k, 1.0);
}
```
Why this is correct: in the Klein model, hyperbolic straight lines are Euclidean straight lines, so the normal rasterizer with a standard perspective projection yields exact hyperbolic perspective. Near the eye it is ordinary meters (`k ≈ xyz·K`). The whole infinite hyperbolic world fits in a ball of radius `K` meters; far plane must be > K (use `near=0.05`, `far = K*4`; enable logarithmic depth only if z-fighting appears).
Spherical mode needs finer tessellation because the equidistant mapping is per-vertex, not line-preserving.

Fragment shader: emissive-style color, `gl_FragColor = vec4(vColor * (0.35 + 0.65*vFog), 1.0)` blended toward the background by `vFog`. No lights, no textures: cheap and readable on Quest.

### 4.5 Performance (Quest 2)
- `renderer.xr.setFramebufferScaleFactor(0.8..1.0)`, `renderer.xr.setFoveation(1)`, `antialias:false` first, then test `true`.
- Target 72 FPS. Draw calls < 30. Show an FPS/instances/triangles HUD toggle.
- If slow: lower `visRadius`, tube sides, or `maxCells`. Optional: dedupe shared edges.

## 5. Interaction (`src/xr/`)

Player state: `P` (float64 4×4 Lorentz/rotation pose), always re-orthonormalized.
Frame pose of the eye: `P · B(t) · R_head` (the shader and `instanceMatrix` implement its inverse).

- **Smooth locomotion:** left thumbstick. Direction `u` = head-forward in tracking space, flattened to the horizontal plane: `u = normalize(R_head · (0,0,−1))` with y=0. Update `P ← P · boost(u, speed·dt/K, κ)`. Strafe uses the perpendicular vector. Speed ≈ 1.5 m/s.
- **Snap turn:** right stick, 30° steps, `P ← P · rotationY(±30°)`.
- **Comfort:** vignette ring (a small inward-facing mesh or full-screen quad parented to the camera) that fades in proportional to current speed; a settings toggle to disable it.
- **Real walking:** the headset's own movement is already handled by `t` in section 4.3 (the world responds to leaning/walking).
- **Mode switch:** a floating wrist/menu panel (canvas texture on a quad attached to the left controller) with buttons: Hyperbolic / Euclidean / Spherical, Parallel Walkers on/off, Triangle Tool on/off, curvature slider (K from 2 m to 12 m), reset position. Select with right-controller ray + trigger. Keyboard shortcuts on desktop: `1/2/3`, `P`, `T`.
- Read thumbsticks from `session.inputSources[i].gamepad.axes` (axes 2,3 on Quest Touch).
- **Desktop fallback:** pointer lock mouse-look builds `R_head`, WASD moves, same code path for geometry.

### Tools
**Parallel Walkers** (`tools/parallelWalkers.ts`): at activation, spawn two glowing orbs. Orb_i pose `= P · boost(x̂, ±s, κ) · boost(−ẑ, v·t, κ)` with `s ≈ 0.25` units. They walk forward on geodesics that start parallel. HUD number: `distance(orbA, orbB, κ)` in meters-equivalent (`× K`). Render orbs as small instanced spheres drawn through the same shader (give them their own `instanceMatrix`).

**Triangle Tool** (`tools/triangle.ts`): trigger places a point at distance ~1.2 m along the controller ray (convert via boost: `point = P·B(t_ctrl)·R_ctrl·boost(−ẑ, 1.2/K)·O`). After 3 points draw 3 geodesic tubes (reuse the tube generator with arbitrary endpoints, stored in world coordinates, drawn with an instance matrix `inverse(P)`). Show the angles, sum, and `π − sum` (area, hyperbolic) / `sum − π` (spherical excess) on the wrist panel. Grip button clears.

## 6. Project layout

```
src/
  main.ts                 renderer, XR session, game loop
  geometry/lorentz.ts     4x4 math, boost, inverse, reorthonormalize
  geometry/lattice.ts     cell BFS, vertex/edge tables per mode
  geometry/tube.ts        cell mesh + arbitrary geodesic tube generator
  render/material.ts      ShaderMaterial + per-eye uniforms
  xr/input.ts             gamepad + controller reading, desktop fallback
  xr/locomotion.ts        move, snap turn, vignette
  tools/parallelWalkers.ts
  tools/triangle.ts
  ui/panel.ts             canvas-texture VR menu + HUD
tests/                    vitest unit tests for section 3.5
docs/MATH.md              write-up (see section 8)
README.md                 setup, controls, architecture, demo video link
```

## 7. Milestones (do in order; commit after each)

1. **Scaffold:** Vite + TS + Three, a hello-world cube renders in WebXR on Quest and on desktop. Set up vitest.
2. **Math core + tests** (section 3). All tests green before any rendering work.
3. **Euclidean mode end to end:** cubic lattice drawn with the custom shader and our own pose `P`; smooth walk + snap turn in VR. This proves the pipeline (stereo, eye boost, instancing).
4. **Hyperbolic mode:** swap κ and the lattice. Verify: five cubes around every edge, exponential growth of what you see, correct 72° dihedral angles visually.
5. **Spherical mode:** 8-cell tesseract world; walk straight ahead and return to your starting point after 2π·K meters.
6. **Tools:** Parallel Walkers, then Triangle Tool, then the wrist panel + curvature slider.
7. **Comfort + performance pass:** vignette, fog tuning, FPS HUD, hit 72 FPS on Quest 2.
8. **Polish:** colors/palette, ambient audio (WebAudio, pitch tied to speed or geodesic distance from origin), landmarks, short in-VR tutorial text.
9. **Docs + demo:** `docs/MATH.md`, README, 2-minute demo script.

## 8. Documentation requirements (15% of the score)

`docs/MATH.md` must explain, with diagrams or ASCII sketches:
- Why 4D embedding (hyperboloid / hypersphere) and what a "boost" is.
- Why the Klein model for rendering (lines stay lines) and why we use equidistant projection for S³.
- How the lattice {4,3,5} is derived (the 72° dihedral → `a = asinh(√cos 72°)`), and how neighbors are generated.
- How stereo works in curved space (eye offset as a boost).
- How parallel walkers and the triangle tool demonstrate curvature, with the numbers.
- Performance decisions for Quest 2.

All source files need header comments stating the math they implement. Keep functions small and named after the math (`boost`, `geodesic`, `angleAt`).

## 9. Acceptance checklist

- [ ] Runs in Quest 2 browser at ~72 FPS in all three modes; desktop fallback works.
- [ ] Unit tests pass (`npm test`).
- [ ] Hyperbolic mode visibly shows exponential branching; Euclidean mode is a normal grid.
- [ ] Walking straight in spherical mode loops back to the start.
- [ ] Parallel Walkers: distance constant / growing / shrinking in E / H / S.
- [ ] Triangle Tool: angle sum `= 180°` / `< 180°` / `> 180°`.
- [ ] Comfort vignette + snap turn present; no forced camera motion.
- [ ] README with run instructions (`adb reverse` workflow) and `docs/MATH.md` complete.

## 10. Pitfalls to avoid
- Do not do geometry math in float32 on the GPU for far cells; precompute `inverse(P)·G_i` in float64 on the CPU.
- Do not forget to re-orthonormalize `P` every frame.
- Do not let the headset position fight the shader: keep the Three camera rig at the origin so `camera.position` is purely head/eye offset.
- Do not use post-processing, shadows, or many lights.
- If `onBeforeRender` is not called per eye on the installed Three version, fall back to reading `renderer.xr.getCamera().cameras[i]` in the render loop and updating a per-eye uniform in a custom render pass (or draw the mesh twice with layers).
- If something looks wrong, test Euclidean mode first (κ=0 must look like a normal VR grid).
