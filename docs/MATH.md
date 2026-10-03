# The geometry of Beyond Euclid

This note is the judging write-up for the math. The source files in `src/geometry/` implement exactly these formulae, in float64, with unit tests in `tests/math.test.ts`.

## Why 4D?

A 3-manifold of constant curvature embeds cleanly as a quadric in R⁴:

```
          w
          |          H³ hyperboloid
          |         /   ⟨p,p⟩ = −1,  w > 0
          |      _/
          |    /
          |   /          S³ sphere
          |  /           ⟨p,p⟩ = +1
          | /
    ------+------ x,y,z
          |
```

- **Hyperbolic** κ = −1: the sheet `x²+y²+z² − w² = −1`, `w>0`. The origin of the player is `O = (0,0,0,1)`.
- **Spherical** κ = +1: the 3-sphere `x²+y²+z² + w² = +1`. Same origin.
- **Euclidean** κ = 0: the affine plane `w = 1`. Translations live in the xyz block.

The inner product that makes isometries linear maps is

```
⟨a,b⟩ = ax bx + ay by + az bz + κ aw bw.
```

A **boost** is a translation of the origin along a unit tangent `u = (ux,uy,uz,0)` by geodesic distance `d`:

```
C = C_κ(d) = cosh d | 1 | cos d
S = S_κ(d) = sinh d | d | sin d

M · O = (S u, C)
```

For κ = −1 this is `(sinh d · u, cosh d)` — the usual hyperbolic translation. For κ = +1 it is a rotation in the `(u,w)` plane. For κ = 0 it is an ordinary translation by `d u`.

The player pose `P` is one of these isometries (composed with yaw). We re-orthonormalize its columns with Gram–Schmidt in `⟨,⟩` every frame so float64 drift cannot accumulate.

## Why Klein for H³, equidistant for S³

The **Klein (gnomonic) model** of H³ is `k = (x,y,z)/w`. Straight geodesics on the hyperboloid project to Euclidean straight lines in the unit ball. A GPU that rasterizes triangles with a standard perspective matrix is therefore *exactly* drawing hyperbolic geodesics, with no extra tessellation. Near the eye, `k ≈ xyz · K` metres, so IPD and head motion feel ordinary.

The whole infinite hyperbolic world fits in a Euclidean ball of radius `K` (the curvature radius in metres). Far plane is `4K`.

S³ has no Klein model that is both global and line-preserving in the same way (gnomonic S³ has a hemisphere cut). We use **azimuthal equidistant** projection: direction of `xyz` is preserved and radial distance is the geodesic `acos(w)`. That map is only as accurate as the mesh, so spherical tubes use more segments.

```
H³ Klein:     k = xyz/w · K          dist = acosh(w)
S³ eqdst:     k = xyẑ · acos(w) · K  dist = acos(w)
E³:           k = xyz · K            dist = |xyz|
```

## The lattice {4,3,5}

A cube in H³ has a dihedral angle that *depends on size*. We want five cubes around every edge, so the dihedral must be `72°`.

Outward face normals at the origin cell:

```
n_x = (cosh a, 0, 0, sinh a)
n_y = (0, cosh a, 0, sinh a)
cos θ = −⟨n_x, n_y⟩ = sinh² a
```

Set `sinh² a = cos 72° = cos(2π/5)`:

```
a = asinh(√cos 72°)  ≈ 0.5331
```

Cube vertices `(±c,±c,±c,w)` then follow from sitting on the hyperboloid and on all three face-planes:

```
coth a = cosh a / sinh a
c = 1 / √(coth² a − 3)     ≈ 0.8995
w = c · coth a             ≈ 1.851
```

Neighbors: six generators `T_i = boost(±e_i, 2a)`. A cell is an isometry `G`; its six neighbors are `G · T_i`. BFS from the identity, keyed by the cell center (last column of `G`) rounded to 10⁻³.

```
        T_{+x}
     □ ──── □
     │      │
T_{-z}      T_{+z}     five cubes around the shared edge
     │      │          (the 72° dihedral closes the fan)
     □ ──── □
```

Spherical {4,3,3} is the same recipe with `a = π/4` (dihedral 120°). The BFS terminates at **8 cells** — the cubic cells of the tesseract. Euclidean {4,3,4} is the integer lattice of translations by `1`.

No recentering: `P` is allowed to wander; we only *draw* cells whose centers lie within `visRadius` of `P·O` (default 2.4 in H³).

## Stereo as a boost

Keep the Three.js camera rig at the tracking origin. Then `camera.position` is purely the headset/eye offset `t` in metres.

```
eye pose     = P · B(t̂, |t|/K) · R_head
view         = R_headᵀ · B(t̂, −|t|/K) · P⁻¹
```

`P⁻¹ G_i` is baked into `instanceMatrix` on the CPU (float64). The vertex shader multiplies by `uEye = Rᵀ B(−t)` per eye in `onBeforeRender`. Inter-pupillary distance is therefore a true geodesic offset, not a Euclidean afterthought.

## Parallel walkers

At activation, snapshot `P₀`. Two orbs

```
Orb_±(t) = P₀ · boost(x̂, ±0.25) · boost(−ẑ, v t) · O
```

travel on geodesics that start parallel. The HUD shows `distance(Orb_+, Orb_−) · K` metres.

| Space | Distance |
|---|---|
| E³ | exactly `0.5 K` for all `t` |
| H³ | grows like `cosh(vt)` — exponential spreading |
| S³ | shrinks; they meet at `t = π/(2v)` |

That single number is the curvature.

## Triangle tool

Three points on the manifold, sides are geodesics `γ(s)`. Angle at `A` is `acos(⟨u_B, u_C⟩)` with unit tangents

```
u_B = (B + σ' ⟨A,B⟩ A) / S_κ(d_AB)
σ' = +1 in H³,  −1 in S³.
```

Gauss–Bonnet on a geodesic triangle in a space of curvature `κ`:

```
∠A+∠B+∠C − π = κ · Area
```

So in H³ (`κ = −1`) the **deficit** `π − Σ` *is* the area. In S³ the **excess** is the area. In E³ the sum is 180°.

## Quest 2 budget

- One `InstancedMesh` for the honeycomb, one for landmarks, two small tool meshes. Draw calls stay in the teens.
- No lights, no textures, no post-processing. Emissive fog in the fragment shader.
- `antialias: false`, `framebufferScaleFactor 0.85`, `foveation 1`.
- Tube mesh: 6 segments × 6 sides in H³/E³, a bit finer in S³ because equidistant is per-vertex. Cap ≈ 1000 tris/cell.
- Hyperbolic visibility radius 2.4 curvature units — exponential growth makes this the FPS knob.

If something “looks wrong”, switch to Euclidean (`2`). κ = 0 must be an ordinary VR grid; that certifies the eye boost, instancing, and locomotion before curvature is blamed.
