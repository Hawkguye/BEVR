/**
 * Geodesic edge tubes and vertex nodes in the 4D embedding.
 *
 * Along an edge A→B we sample γ(s) and inflate a small circle of radius r
 * in the plane orthogonal (under ⟨,⟩) to the edge:
 *   P(s,θ) = C_κ(r) γ(s) + S_κ(r) (cosθ e1 + sinθ e2)
 * Euclid: P = γ + r (cosθ e1 + sinθ e2), w = 1.
 */

import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
} from "three";
import {
  type Kappa,
  type Vec4,
  Ck,
  Sk,
  geodesic,
  inner,
  vec4,
} from "./lorentz.ts";
import { cubeEdges, cubeVertices } from "./lattice.ts";

export interface TubeOptions {
  radius?: number;
  segments?: number;
  sides?: number;
  nodeRadius?: number;
}

function orthoPair(A: Vec4, B: Vec4, kappa: number): [Vec4, Vec4] {
  if (kappa === 0) {
    const d = vec4(B[0] - A[0], B[1] - A[1], B[2] - A[2], 0);
    const n = Math.hypot(d[0], d[1], d[2]) || 1;
    d[0] /= n;
    d[1] /= n;
    d[2] /= n;
    const helper = Math.abs(d[1]) < 0.9 ? vec4(0, 1, 0, 0) : vec4(1, 0, 0, 0);
    const e1 = vec4(
      d[1] * helper[2] - d[2] * helper[1],
      d[2] * helper[0] - d[0] * helper[2],
      d[0] * helper[1] - d[1] * helper[0],
      0,
    );
    const n1 = Math.hypot(e1[0], e1[1], e1[2]) || 1;
    e1[0] /= n1;
    e1[1] /= n1;
    e1[2] /= n1;
    const e2 = vec4(
      d[1] * e1[2] - d[2] * e1[1],
      d[2] * e1[0] - d[0] * e1[2],
      d[0] * e1[1] - d[1] * e1[0],
      0,
    );
    return [e1, e2];
  }

  const basis = [
    vec4(1, 0, 0, 0),
    vec4(0, 1, 0, 0),
    vec4(0, 0, 1, 0),
    vec4(0, 0, 0, 1),
  ];
  const out: Vec4[] = [];
  for (const b of basis) {
    const v = vec4(b[0], b[1], b[2], b[3]);
    projectOut(v, A, kappa);
    projectOut(v, B, kappa);
    for (const e of out) projectOut(v, e, kappa);
    const n = inner(v, v, kappa);
    if (n > 1e-8) {
      const inv = 1 / Math.sqrt(n);
      v[0] *= inv;
      v[1] *= inv;
      v[2] *= inv;
      v[3] *= inv;
      out.push(v);
      if (out.length === 2) break;
    }
  }
  if (out.length < 2) {
    out.push(vec4(0, 1, 0, 0), vec4(0, 0, 1, 0));
  }
  return [out[0], out[1]];
}

function projectOut(v: Vec4, u: Vec4, kappa: number): void {
  const uu = inner(u, u, kappa);
  if (Math.abs(uu) < 1e-18) return;
  const f = inner(v, u, kappa) / uu;
  v[0] -= f * u[0];
  v[1] -= f * u[1];
  v[2] -= f * u[2];
  v[3] -= f * u[3];
}

function expAt(base: Vec4, dir: Vec4, r: number, kappa: number, out: Vec4): void {
  if (kappa === 0) {
    out[0] = base[0] + r * dir[0];
    out[1] = base[1] + r * dir[1];
    out[2] = base[2] + r * dir[2];
    out[3] = 1;
    return;
  }
  const C = Ck(r, kappa);
  const S = Sk(r, kappa);
  out[0] = C * base[0] + S * dir[0];
  out[1] = C * base[1] + S * dir[1];
  out[2] = C * base[2] + S * dir[2];
  out[3] = C * base[3] + S * dir[3];
}

interface Builder {
  p4: number[];
  xyz: number[];
  idx: number[];
}

function newBuilder(): Builder {
  return { p4: [], xyz: [], idx: [] };
}

function pushTube(b: Builder, A: Vec4, B: Vec4, kappa: number, radius: number, segments: number, sides: number): void {
  const [e1, e2] = orthoPair(A, B, kappa);
  const base = b.p4.length / 4;
  const gamma = vec4(0, 0, 0, 0);
  const dir = vec4(0, 0, 0, 0);
  const P = vec4(0, 0, 0, 0);
  for (let i = 0; i <= segments; i++) {
    const s = i / segments;
    geodesic(A, B, s, kappa, gamma);
    for (let j = 0; j < sides; j++) {
      const th = (j / sides) * Math.PI * 2;
      dir[0] = Math.cos(th) * e1[0] + Math.sin(th) * e2[0];
      dir[1] = Math.cos(th) * e1[1] + Math.sin(th) * e2[1];
      dir[2] = Math.cos(th) * e1[2] + Math.sin(th) * e2[2];
      dir[3] = Math.cos(th) * e1[3] + Math.sin(th) * e2[3];
      expAt(gamma, dir, radius, kappa, P);
      b.p4.push(P[0], P[1], P[2], P[3]);
      b.xyz.push(P[0], P[1], P[2]);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < sides; j++) {
      const a = base + i * sides + j;
      const c = base + i * sides + ((j + 1) % sides);
      const d = base + (i + 1) * sides + j;
      const e = base + (i + 1) * sides + ((j + 1) % sides);
      b.idx.push(a, d, c, c, d, e);
    }
  }
}

function tangentBasis(V: Vec4, kappa: number): [Vec4, Vec4, Vec4] {
  if (kappa === 0) {
    return [vec4(1, 0, 0, 0), vec4(0, 1, 0, 0), vec4(0, 0, 1, 0)];
  }
  const basis = [
    vec4(1, 0, 0, 0),
    vec4(0, 1, 0, 0),
    vec4(0, 0, 1, 0),
    vec4(0, 0, 0, 1),
  ];
  const out: Vec4[] = [];
  for (const b of basis) {
    const v = vec4(b[0], b[1], b[2], b[3]);
    projectOut(v, V, kappa);
    for (const e of out) projectOut(v, e, kappa);
    const n = inner(v, v, kappa);
    if (n > 1e-8) {
      const inv = 1 / Math.sqrt(n);
      v[0] *= inv;
      v[1] *= inv;
      v[2] *= inv;
      v[3] *= inv;
      out.push(v);
      if (out.length === 3) break;
    }
  }
  while (out.length < 3) out.push(vec4(0, 1, 0, 0));
  return [out[0], out[1], out[2]];
}

function pushOctahedron(b: Builder, V: Vec4, kappa: number, radius: number): void {
  const [t1, t2, t3] = tangentBasis(V, kappa);
  const dirs = [t1, t2, t3];
  const poles: Vec4[] = [];
  const P = vec4(0, 0, 0, 0);
  for (const t of dirs) {
    expAt(V, t, radius, kappa, P);
    poles.push(vec4(P[0], P[1], P[2], P[3]));
    const nt = vec4(-t[0], -t[1], -t[2], -t[3]);
    expAt(V, nt, radius, kappa, P);
    poles.push(vec4(P[0], P[1], P[2], P[3]));
  }
  const base = b.p4.length / 4;
  for (const p of poles) {
    b.p4.push(p[0], p[1], p[2], p[3]);
    b.xyz.push(p[0], p[1], p[2]);
  }
  const faces = [
    [0, 2, 4],
    [0, 4, 3],
    [0, 3, 5],
    [0, 5, 2],
    [1, 4, 2],
    [1, 3, 4],
    [1, 5, 3],
    [1, 2, 5],
  ];
  for (const f of faces) {
    b.idx.push(base + f[0], base + f[1], base + f[2]);
  }
}

function geometryFromBuilder(b: Builder): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute("position4", new BufferAttribute(new Float32Array(b.p4), 4));
  geo.setAttribute("position", new BufferAttribute(new Float32Array(b.xyz), 3));
  geo.setIndex(b.idx);
  geo.computeBoundingSphere();
  return geo;
}

export function buildCellGeometry(kappa: Kappa, opts: TubeOptions = {}): BufferGeometry {
  const radius = opts.radius ?? 0.025;
  const nodeRadius = opts.nodeRadius ?? 0.045;
  const spherical = kappa > 0;
  const segments = opts.segments ?? (spherical ? 10 : 6);
  const sides = opts.sides ?? (spherical ? 8 : 6);
  const verts = cubeVertices(kappa);
  const edges = cubeEdges(verts);
  const b = newBuilder();
  for (const [i, j] of edges) {
    pushTube(b, verts[i], verts[j], kappa, radius, segments, sides);
  }
  for (const v of verts) {
    pushOctahedron(b, v, kappa, nodeRadius);
  }
  return geometryFromBuilder(b);
}

export function buildGeodesicTubeGeometry(
  A: Vec4,
  B: Vec4,
  kappa: number,
  opts: TubeOptions = {},
): BufferGeometry {
  const radius = opts.radius ?? 0.02;
  const segments = opts.segments ?? (kappa > 0 ? 16 : 10);
  const sides = opts.sides ?? 6;
  const b = newBuilder();
  pushTube(b, A, B, kappa, radius, segments, sides);
  return geometryFromBuilder(b);
}

export function buildMergedTubes(
  pairs: [Vec4, Vec4][],
  kappa: number,
  opts: TubeOptions = {},
): BufferGeometry {
  const radius = opts.radius ?? 0.02;
  const segments = opts.segments ?? (kappa > 0 ? 16 : 10);
  const sides = opts.sides ?? 6;
  const b = newBuilder();
  for (const [A, B] of pairs) {
    pushTube(b, A, B, kappa, radius, segments, sides);
  }
  return geometryFromBuilder(b);
}

export function buildOrbGeometry(kappa: Kappa, radius = 0.06): BufferGeometry {
  const b = newBuilder();
  const O = vec4(0, 0, 0, 1);
  pushOctahedron(b, O, kappa, radius);
  const geo = geometryFromBuilder(b);
  const pos4 = geo.getAttribute("position4");
  pos4.setUsage(DynamicDrawUsage);
  return geo;
}
