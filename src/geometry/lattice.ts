/**
 * Regular cubic honeycombs in H³, E³, S³.
 *
 * Face-center distance a of the base cube:
 *   H³ {4,3,5}: a = asinh(√cos 72°) so the dihedral is 72° (five cubes per edge)
 *   E³ {4,3,4}: a = 1/2, dihedral 90°
 *   S³ {4,3,3}: a = π/4, dihedral 120° (three cubes per edge; 8 cells total)
 *
 * Neighbor generators are boosts by 2a along ±e_i. Cells are isometries G;
 * neighbors are G · T_i. Dedup by the cell center (last column of G).
 */

import {
  type Kappa,
  type Mat4,
  type Vec4,
  ORIGIN,
  apply,
  axis,
  boost,
  identity,
  mul,
  vec4,
} from "./lorentz.ts";

export interface Cell {
  G: Mat4;
  center: Vec4;
  depth: number;
  id: number;
}

export interface Lattice {
  kappa: Kappa;
  a: number;
  vertices: Vec4[];
  edges: [number, number][];
  cells: Cell[];
  generators: Mat4[];
}

export function faceDistance(kappa: Kappa): number {
  if (kappa < 0) return Math.asinh(Math.sqrt(Math.cos((2 * Math.PI) / 5)));
  if (kappa > 0) return Math.PI / 4;
  return 0.5;
}

export function cubeVertices(kappa: Kappa): Vec4[] {
  const a = faceDistance(kappa);
  let c: number;
  let w: number;
  if (kappa < 0) {
    const coth = Math.cosh(a) / Math.sinh(a);
    c = 1 / Math.sqrt(coth * coth - 3);
    w = c * coth;
  } else if (kappa > 0) {
    c = 0.5;
    w = 0.5;
  } else {
    c = a;
    w = 1;
  }
  const verts: Vec4[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        verts.push(vec4(sx * c, sy * c, sz * c, w));
      }
    }
  }
  return verts;
}

/** 12 edges: vertices that differ in exactly one sign. */
export function cubeEdges(verts: Vec4[]): [number, number][] {
  const edges: [number, number][] = [];
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      let diffs = 0;
      for (let k = 0; k < 3; k++) {
        if (Math.sign(verts[i][k]) !== Math.sign(verts[j][k])) diffs++;
      }
      if (diffs === 1) edges.push([i, j]);
    }
  }
  return edges;
}

export function generators(kappa: Kappa): Mat4[] {
  const a = faceDistance(kappa);
  const gens: Mat4[] = [];
  for (let i = 0; i < 3; i++) {
    gens.push(boost(axis(i, 1), 2 * a, kappa));
    gens.push(boost(axis(i, -1), 2 * a, kappa));
  }
  return gens;
}

function centerKey(p: Vec4): string {
  const q = (x: number) => Math.round(x * 1000);
  return `${q(p[0])},${q(p[1])},${q(p[2])},${q(p[3])}`;
}

export interface LatticeOptions {
  maxCells?: number;
  maxDepth?: number;
}

export function generateLattice(kappa: Kappa, opts: LatticeOptions = {}): Lattice {
  const maxCells = opts.maxCells ?? (kappa > 0 ? 8 : 4000);
  const maxDepth = opts.maxDepth ?? (kappa > 0 ? 8 : 12);
  const gens = generators(kappa);
  const verts = cubeVertices(kappa);
  const edges = cubeEdges(verts);

  const cells: Cell[] = [];
  const seen = new Map<string, number>();
  const I = identity();
  const o = apply(I, ORIGIN);
  seen.set(centerKey(o), 0);
  cells.push({ G: I, center: o, depth: 0, id: 0 });

  let head = 0;
  while (head < cells.length && cells.length < maxCells) {
    const cur = cells[head++];
    if (cur.depth >= maxDepth) continue;
    for (const T of gens) {
      const G = mul(cur.G, T);
      const c = apply(G, ORIGIN);
      const key = centerKey(c);
      if (seen.has(key)) continue;
      seen.set(key, cells.length);
      cells.push({ G, center: c, depth: cur.depth + 1, id: cells.length });
      if (cells.length >= maxCells) break;
    }
  }

  return { kappa, a: faceDistance(kappa), vertices: verts, edges, cells, generators: gens };
}

export function cellsInRadius(
  lattice: Lattice,
  playerPos: Vec4,
  visRadius: number,
  distFn: (a: Vec4, b: Vec4, k: number) => number,
): Cell[] {
  const out: Cell[] = [];
  const k = lattice.kappa;
  for (const cell of lattice.cells) {
    if (distFn(playerPos, cell.center, k) <= visRadius) out.push(cell);
  }
  return out;
}

export function visRadiusFor(kappa: Kappa): number {
  if (kappa < 0) return 2.4;
  if (kappa > 0) return Math.PI;
  return 5.5;
}

export function isLandmark(center: Vec4): boolean {
  const h = Math.abs(
    Math.sin(center[0] * 127.1 + center[1] * 311.7 + center[2] * 74.7 + center[3] * 19.13) *
      43758.5453,
  );
  return h - Math.floor(h) < 0.07;
}
