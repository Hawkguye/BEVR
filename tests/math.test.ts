/**
 * Unit tests for the math core (AGENTS.md §3.5).
 * The product is the geometry: these must stay green.
 */
import { describe, expect, it } from "vitest";
import {
  type Mat4,
  type Vec4,
  ORIGIN,
  angleAt,
  apply,
  boost,
  distance,
  identity,
  inner,
  inverse,
  matAlmostEqual,
  metricMatrix,
  mul,
  reorthonormalize,
  vec4,
} from "../src/geometry/lorentz.ts";
import {
  cubeVertices,
  faceDistance,
  generateLattice,
} from "../src/geometry/lattice.ts";

function almost(a: number, b: number, eps = 1e-6): void {
  expect(Math.abs(a - b)).toBeLessThan(eps);
}

function randomUnit(): Vec4 {
  const z = Math.random() * 2 - 1;
  const t = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return vec4(r * Math.cos(t), r * Math.sin(t), z, 0);
}

describe("cube vertices on the quadric", () => {
  it("hyperbolic vertices satisfy ⟨v,v⟩ = -1", () => {
    for (const v of cubeVertices(-1)) {
      almost(inner(v, v, -1), -1, 1e-9);
      expect(v[3]).toBeGreaterThan(0);
    }
  });

  it("spherical vertices satisfy ⟨v,v⟩ = +1", () => {
    for (const v of cubeVertices(1)) {
      almost(inner(v, v, 1), 1, 1e-9);
    }
  });
});

describe("dihedral angle of {4,3,5}", () => {
  it("cos θ = sinh² a = cos 72°", () => {
    const a = faceDistance(-1);
    const nx = vec4(Math.cosh(a), 0, 0, Math.sinh(a));
    const ny = vec4(0, Math.cosh(a), 0, Math.sinh(a));
    const cosTheta = -inner(nx, ny, -1);
    almost(cosTheta, Math.sinh(a) ** 2, 1e-12);
    almost(cosTheta, Math.cos((2 * Math.PI) / 5), 1e-12);
  });
});

describe("boosts and inverse", () => {
  it("boost(u,d) · boost(u,-d) ≈ I for all κ", () => {
    const u = vec4(1, 0, 0, 0);
    for (const k of [-1, 0, 1] as const) {
      const A = boost(u, 0.7, k);
      const B = boost(u, -0.7, k);
      expect(matAlmostEqual(mul(A, B), identity(), 1e-8)).toBe(true);
    }
  });

  it("G Mᵀ G recovers the inverse of a boost", () => {
    const u = vec4(0, 1 / Math.sqrt(2), 1 / Math.sqrt(2), 0);
    for (const k of [-1, 1] as const) {
      const M = boost(u, 0.4, k);
      const inv = inverse(M, k);
      expect(matAlmostEqual(mul(M, inv), identity(), 1e-8)).toBe(true);
    }
  });

  it("Mᵀ G M ≈ G after 1000 random boosts + reorthonormalize", () => {
    for (const k of [-1, 1] as const) {
      let M = identity();
      for (let i = 0; i < 1000; i++) {
        const u = randomUnit();
        const d = (Math.random() - 0.5) * 0.8;
        M = mul(M, boost(u, d, k));
        reorthonormalize(M, k);
      }
      const G = metricMatrix(k);
      const Mt = new Float64Array(16);
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) Mt[c * 4 + r] = M[r * 4 + c];
      }
      const MtG = mul(Mt as Mat4, G);
      const MtGM = mul(MtG, M);
      expect(matAlmostEqual(MtGM, G, 2e-6)).toBe(true);
    }
  });
});

describe("lattice BFS", () => {
  it("depth-1 count is 7 (1 + 6) in every mode", () => {
    for (const k of [-1, 0, 1] as const) {
      const L = generateLattice(k, { maxDepth: 1, maxCells: 32 });
      expect(L.cells.length).toBe(7);
    }
  });

  it("spherical honeycomb has exactly 8 cells", () => {
    const L = generateLattice(1, { maxDepth: 8, maxCells: 32 });
    expect(L.cells.length).toBe(8);
  });

  it("no duplicate centers", () => {
    for (const k of [-1, 0, 1] as const) {
      const L = generateLattice(k, { maxDepth: 3, maxCells: 400 });
      const keys = new Set<string>();
      for (const c of L.cells) {
        const key = [...c.center].map((x) => x.toFixed(3)).join(",");
        expect(keys.has(key)).toBe(false);
        keys.add(key);
      }
    }
  });
});

function randomPoint(kappa: number): Vec4 {
  const u = randomUnit();
  const d = 0.2 + Math.random() * 0.6;
  return apply(boost(u, d, kappa), ORIGIN);
}

describe("geodesic triangles", () => {
  it("angle sum < π in H³, = π in E³, > π in S³", () => {
    const trials = 20;
    for (let t = 0; t < trials; t++) {
      const H = [randomPoint(-1), randomPoint(-1), randomPoint(-1)];
      const sumH = angleAt(H[0], H[1], H[2], -1) + angleAt(H[1], H[2], H[0], -1) + angleAt(H[2], H[0], H[1], -1);
      expect(sumH).toBeLessThan(Math.PI - 1e-6);
      expect(Math.PI - sumH).toBeGreaterThan(0);

      const S = [randomPoint(1), randomPoint(1), randomPoint(1)];
      const sumS = angleAt(S[0], S[1], S[2], 1) + angleAt(S[1], S[2], S[0], 1) + angleAt(S[2], S[0], S[1], 1);
      expect(sumS).toBeGreaterThan(Math.PI + 1e-6);

      const E = [
        vec4(Math.random(), Math.random(), 0, 1),
        vec4(Math.random() + 0.4, Math.random(), 0, 1),
        vec4(Math.random(), Math.random() + 0.4, 0, 1),
      ];
      const sumE = angleAt(E[0], E[1], E[2], 0) + angleAt(E[1], E[2], E[0], 0) + angleAt(E[2], E[0], E[1], 0);
      almost(sumE, Math.PI, 1e-8);
    }
  });
});

describe("parallel walkers", () => {
  function orbs(kappa: number, t: number, s = 0.25, v = 0.4): [Vec4, Vec4] {
    const bx = (sign: number) => boost(vec4(sign, 0, 0, 0), s, kappa);
    const fwd = boost(vec4(0, 0, -1, 0), v * t, kappa);
    const A = apply(mul(bx(1), fwd), ORIGIN);
    const B = apply(mul(bx(-1), fwd), ORIGIN);
    return [A, B];
  }

  it("separation grows monotonically in H³", () => {
    let prev = -Infinity;
    for (let i = 0; i < 12; i++) {
      const [A, B] = orbs(-1, i * 0.15);
      const d = distance(A, B, -1);
      expect(d).toBeGreaterThan(prev + 1e-9);
      prev = d;
    }
  });

  it("separation stays constant in E³", () => {
    const d0 = distance(...orbs(0, 0), 0);
    for (let i = 1; i < 12; i++) {
      almost(distance(...orbs(0, i * 0.2), 0), d0, 1e-9);
    }
  });

  it("separation decreases in S³", () => {
    let prev = Infinity;
    for (let i = 0; i < 10; i++) {
      const [A, B] = orbs(1, i * 0.12);
      const d = distance(A, B, 1);
      expect(d).toBeLessThan(prev - 1e-9);
      prev = d;
    }
  });
});
