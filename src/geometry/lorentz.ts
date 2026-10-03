/**
 * Lorentz / rotation / Euclidean isometries of 3-space in a 4D embedding.
 *
 * Points live in R^4 as (x, y, z, w). The origin is O = (0,0,0,1).
 * Metric ⟨a,b⟩ = ax bx + ay by + az bz + κ aw bw, with κ ∈ {-1, 0, +1}.
 *
 *   κ = -1  hyperboloid model of H³, ⟨p,p⟩ = -1, w > 0
 *   κ =  0  Euclidean, affine plane w = 1
 *   κ = +1  hypersphere model of S³, ⟨p,p⟩ = +1
 *
 * A "boost" along a unit tangent u by distance d is the unique isometry
 * sending O to (S_κ(d) u, C_κ(d)). Matrices are 4×4 column-major,
 * matching GLSL mat4, so they upload without a transpose.
 */

export type Kappa = -1 | 0 | 1;
export type Vec4 = Float64Array;
export type Mat4 = Float64Array;

export const ORIGIN: Readonly<Vec4> = vec4(0, 0, 0, 1);

export function vec4(x: number, y: number, z: number, w: number): Vec4 {
  return new Float64Array([x, y, z, w]);
}

export function mat4(): Mat4 {
  return new Float64Array(16);
}

export function identity(): Mat4 {
  const m = mat4();
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

export function copyMat(src: Mat4, dst: Mat4 = mat4()): Mat4 {
  dst.set(src);
  return dst;
}

export function copyVec(src: Vec4, dst: Vec4 = vec4(0, 0, 0, 0)): Vec4 {
  dst.set(src);
  return dst;
}

/** C_κ(d) = cosh d | 1 | cos d */
export function Ck(d: number, kappa: number): number {
  if (kappa < 0) return Math.cosh(d);
  if (kappa > 0) return Math.cos(d);
  return 1;
}

/** S_κ(d) = sinh d | d | sin d */
export function Sk(d: number, kappa: number): number {
  if (kappa < 0) return Math.sinh(d);
  if (kappa > 0) return Math.sin(d);
  return d;
}

/** ⟨a,b⟩ = a·b_xyz + κ a.w b.w */
export function inner(a: Vec4, b: Vec4, kappa: number): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + kappa * a[3] * b[3];
}

export function apply(M: Mat4, v: Vec4, out: Vec4 = vec4(0, 0, 0, 0)): Vec4 {
  const x = v[0];
  const y = v[1];
  const z = v[2];
  const w = v[3];
  out[0] = M[0] * x + M[4] * y + M[8] * z + M[12] * w;
  out[1] = M[1] * x + M[5] * y + M[9] * z + M[13] * w;
  out[2] = M[2] * x + M[6] * y + M[10] * z + M[14] * w;
  out[3] = M[3] * x + M[7] * y + M[11] * z + M[15] * w;
  return out;
}

export function mul(A: Mat4, B: Mat4, out: Mat4 = mat4()): Mat4 {
  const r = out === A || out === B ? mat4() : out;
  for (let c = 0; c < 4; c++) {
    for (let row = 0; row < 4; row++) {
      r[c * 4 + row] =
        A[row] * B[c * 4] +
        A[4 + row] * B[c * 4 + 1] +
        A[8 + row] * B[c * 4 + 2] +
        A[12 + row] * B[c * 4 + 3];
    }
  }
  if (r !== out) out.set(r);
  return out;
}

export function transpose(M: Mat4, out: Mat4 = mat4()): Mat4 {
  const r = out === M ? mat4() : out;
  for (let c = 0; c < 4; c++) {
    for (let row = 0; row < 4; row++) {
      r[c * 4 + row] = M[row * 4 + c];
    }
  }
  if (r !== out) out.set(r);
  return out;
}

export function col(M: Mat4, j: number, out: Vec4 = vec4(0, 0, 0, 0)): Vec4 {
  out[0] = M[j * 4];
  out[1] = M[j * 4 + 1];
  out[2] = M[j * 4 + 2];
  out[3] = M[j * 4 + 3];
  return out;
}

export function setCol(M: Mat4, j: number, v: Vec4): void {
  M[j * 4] = v[0];
  M[j * 4 + 1] = v[1];
  M[j * 4 + 2] = v[2];
  M[j * 4 + 3] = v[3];
}

/**
 * Translation along unit direction u = (ux,uy,uz,0) by geodesic distance d.
 * M·O = (S_κ(d) u, C_κ(d)).
 */
export function boost(u: Vec4, d: number, kappa: number, out: Mat4 = mat4()): Mat4 {
  const C = Ck(d, kappa);
  const S = Sk(d, kappa);
  out.fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[j * 4 + i] = (i === j ? 1 : 0) + (C - 1) * u[i] * u[j];
    }
    out[12 + i] = S * u[i];
    out[i * 4 + 3] = -kappa * S * u[jOf(i)];
  }
  out[15] = C;
  return out;
}

function jOf(i: number): number {
  return i;
}

export function axis(i: number, sign = 1): Vec4 {
  const u = vec4(0, 0, 0, 0);
  u[i] = sign;
  return u;
}

export function rotationY(angle: number, out: Mat4 = identity()): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  out.fill(0);
  out[0] = c;
  out[2] = -s;
  out[5] = 1;
  out[8] = s;
  out[10] = c;
  out[15] = 1;
  return out;
}

/** Embed a unit quaternion (x,y,z,w) as a 3×3 rotation in the xyz block. */
export function rotationFromQuaternion(
  x: number,
  y: number,
  z: number,
  w: number,
  out: Mat4 = identity(),
): Mat4 {
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  out.fill(0);
  out[0] = 1 - 2 * (yy + zz);
  out[1] = 2 * (xy + wz);
  out[2] = 2 * (xz - wy);
  out[4] = 2 * (xy - wz);
  out[5] = 1 - 2 * (xx + zz);
  out[6] = 2 * (yz + wx);
  out[8] = 2 * (xz + wy);
  out[9] = 2 * (yz - wx);
  out[10] = 1 - 2 * (xx + yy);
  out[15] = 1;
  return out;
}

export function transposeRot3(R: Mat4, out: Mat4 = mat4()): Mat4 {
  out.fill(0);
  out[0] = R[0];
  out[1] = R[4];
  out[2] = R[8];
  out[4] = R[1];
  out[5] = R[5];
  out[6] = R[9];
  out[8] = R[2];
  out[9] = R[6];
  out[10] = R[10];
  out[15] = 1;
  return out;
}

/**
 * Inverse isometry. For κ ≠ 0 this is G Mᵀ G with G = diag(1,1,1,κ).
 * For κ = 0 a generic float64 4×4 inverse (Euclidean affine pose).
 */
export function inverse(M: Mat4, kappa: number, out: Mat4 = mat4()): Mat4 {
  if (kappa === 0) return inverseGeneric(M, out);
  const s = kappa;
  const r = out === M ? mat4() : out;
  for (let c = 0; c < 4; c++) {
    const sc = c === 3 ? s : 1;
    for (let row = 0; row < 4; row++) {
      const sr = row === 3 ? s : 1;
      const tRc = M[row * 4 + c];
      r[c * 4 + row] = sr * tRc * sc;
    }
  }
  if (r !== out) out.set(r);
  return out;
}

function inverseGeneric(M: Mat4, out: Mat4): Mat4 {
  const a = new Float64Array(M);
  const inv = identity();
  for (let i = 0; i < 4; i++) {
    let pivot = i;
    let best = Math.abs(a[i * 4 + i]);
    for (let r = i + 1; r < 4; r++) {
      const v = Math.abs(a[i * 4 + r]);
      if (v > best) {
        best = v;
        pivot = r;
      }
    }
    if (best < 1e-18) {
      out.set(identity());
      return out;
    }
    if (pivot !== i) {
      for (let c = 0; c < 4; c++) {
        const i0 = c * 4 + i;
        const i1 = c * 4 + pivot;
        const tmp = a[i0];
        a[i0] = a[i1];
        a[i1] = tmp;
        const t2 = inv[i0];
        inv[i0] = inv[i1];
        inv[i1] = t2;
      }
    }
    const diag = a[i * 4 + i];
    for (let c = 0; c < 4; c++) {
      a[c * 4 + i] /= diag;
      inv[c * 4 + i] /= diag;
    }
    for (let r = 0; r < 4; r++) {
      if (r === i) continue;
      const f = a[i * 4 + r];
      for (let c = 0; c < 4; c++) {
        a[c * 4 + r] -= f * a[c * 4 + i];
        inv[c * 4 + r] -= f * inv[c * 4 + i];
      }
    }
  }
  out.set(inv);
  return out;
}

/**
 * Gram–Schmidt on the columns with respect to ⟨,⟩ so player pose P does not
 * drift. Spatial columns are orthonormal and orthogonal to the position column.
 */
export function reorthonormalize(M: Mat4, kappa: number): Mat4 {
  if (kappa === 0) return reorthoEuclid(M);
  const sigma = kappa;
  const p = col(M, 3);
  const pn = inner(p, p, kappa);
  const target = sigma;
  const scale = Math.sqrt(Math.abs(target / (pn === 0 ? target : pn)));
  p[0] *= scale;
  p[1] *= scale;
  p[2] *= scale;
  p[3] *= scale;
  if (kappa < 0 && p[3] < 0) {
    p[0] = -p[0];
    p[1] = -p[1];
    p[2] = -p[2];
    p[3] = -p[3];
  }
  setCol(M, 3, p);

  const prev: Vec4[] = [];
  for (let i = 0; i < 3; i++) {
    const v = col(M, i);
    addScaled(v, p, -inner(v, p, kappa) / sigma);
    for (const e of prev) {
      addScaled(v, e, -inner(v, e, kappa));
    }
    const n = inner(v, v, kappa);
    const inv = 1 / Math.sqrt(Math.max(n, 1e-30));
    v[0] *= inv;
    v[1] *= inv;
    v[2] *= inv;
    v[3] *= inv;
    setCol(M, i, v);
    prev.push(copyVec(v));
  }
  return M;
}

function reorthoEuclid(M: Mat4): Mat4 {
  const x = col(M, 0);
  const y = col(M, 1);
  normalize3(x);
  const d = x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  y[0] -= d * x[0];
  y[1] -= d * x[1];
  y[2] -= d * x[2];
  y[3] = 0;
  normalize3(y);
  const z = vec4(
    x[1] * y[2] - x[2] * y[1],
    x[2] * y[0] - x[0] * y[2],
    x[0] * y[1] - x[1] * y[0],
    0,
  );
  normalize3(z);
  x[3] = 0;
  setCol(M, 0, x);
  setCol(M, 1, y);
  setCol(M, 2, z);
  M[3] = 0;
  M[7] = 0;
  M[11] = 0;
  M[15] = 1;
  return M;
}

function normalize3(v: Vec4): void {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= n;
  v[1] /= n;
  v[2] /= n;
  v[3] = 0;
}

function addScaled(v: Vec4, u: Vec4, s: number): void {
  v[0] += s * u[0];
  v[1] += s * u[1];
  v[2] += s * u[2];
  v[3] += s * u[3];
}

export function distance(a: Vec4, b: Vec4, kappa: number): number {
  if (kappa < 0) {
    const c = Math.max(-inner(a, b, kappa), 1);
    return Math.acosh(c);
  }
  if (kappa > 0) {
    const c = Math.min(1, Math.max(-1, inner(a, b, kappa)));
    return Math.acos(c);
  }
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Geodesic from A to B. Parameter s ∈ [0,1].
 * γ(s) = (S_κ((1−s)d) A + S_κ(s d) B) / S_κ(d)  (κ ≠ 0)
 */
export function geodesic(A: Vec4, B: Vec4, s: number, kappa: number, out: Vec4 = vec4(0, 0, 0, 0)): Vec4 {
  if (kappa === 0) {
    out[0] = A[0] + s * (B[0] - A[0]);
    out[1] = A[1] + s * (B[1] - A[1]);
    out[2] = A[2] + s * (B[2] - A[2]);
    out[3] = 1;
    return out;
  }
  const d = distance(A, B, kappa);
  const sd = Sk(d, kappa);
  if (Math.abs(sd) < 1e-12) {
    return copyVec(A, out);
  }
  const sa = Sk((1 - s) * d, kappa) / sd;
  const sb = Sk(s * d, kappa) / sd;
  out[0] = sa * A[0] + sb * B[0];
  out[1] = sa * A[1] + sb * B[1];
  out[2] = sa * A[2] + sb * B[2];
  out[3] = sa * A[3] + sb * B[3];
  return out;
}

/**
 * Unit tangent at A toward B.
 * u_B = (B + σ' ⟨A,B⟩ A) / S_κ(d) with σ' = +1 (H) or −1 (S).
 */
export function tangentAt(A: Vec4, B: Vec4, kappa: number, out: Vec4 = vec4(0, 0, 0, 0)): Vec4 {
  if (kappa === 0) {
    out[0] = B[0] - A[0];
    out[1] = B[1] - A[1];
    out[2] = B[2] - A[2];
    out[3] = 0;
    const n = Math.hypot(out[0], out[1], out[2]) || 1;
    out[0] /= n;
    out[1] /= n;
    out[2] /= n;
    return out;
  }
  const d = distance(A, B, kappa);
  const sd = Sk(d, kappa);
  const ip = inner(A, B, kappa);
  const sp = kappa < 0 ? 1 : -1;
  if (Math.abs(sd) < 1e-12) {
    out.fill(0);
    return out;
  }
  out[0] = (B[0] + sp * ip * A[0]) / sd;
  out[1] = (B[1] + sp * ip * A[1]) / sd;
  out[2] = (B[2] + sp * ip * A[2]) / sd;
  out[3] = (B[3] + sp * ip * A[3]) / sd;
  return out;
}

/** Angle at A of triangle ABC, using the metric on the tangent space. */
export function angleAt(A: Vec4, B: Vec4, C: Vec4, kappa: number): number {
  const uB = tangentAt(A, B, kappa);
  const uC = tangentAt(A, C, kappa);
  const ip = kappa === 0
    ? uB[0] * uC[0] + uB[1] * uC[1] + uB[2] * uC[2]
    : inner(uB, uC, kappa);
  return Math.acos(Math.min(1, Math.max(-1, ip)));
}

export function metricMatrix(kappa: number): Mat4 {
  const G = mat4();
  G[0] = 1;
  G[5] = 1;
  G[10] = 1;
  G[15] = kappa === 0 ? 1 : kappa;
  return G;
}

export function matAlmostEqual(A: Mat4, B: Mat4, eps = 1e-8): boolean {
  for (let i = 0; i < 16; i++) {
    if (Math.abs(A[i] - B[i]) > eps) return false;
  }
  return true;
}

export function writeMat4f32(src: Mat4, dst: Float32Array, offset = 0): void {
  for (let i = 0; i < 16; i++) dst[offset + i] = src[i];
}
