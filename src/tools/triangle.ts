/**
 * Triangle tool: three points on the manifold, geodesic sides, interior angles.
 *
 * Place at 1.2 m along the controller (or camera) ray:
 *   point = P · B(t_ctrl) · R_ctrl · boost(−ẑ, 1.2/K) · O
 *
 * Reports Σ angles and deficit π−Σ (H³ area) / excess Σ−π (S³).
 */
import { Color, DynamicDrawUsage, InstancedMesh, Matrix4 } from "three";
import {
  type Kappa,
  type Mat4,
  type Vec4,
  ORIGIN,
  apply,
  angleAt,
  boost,
  copyVec,
  identity,
  mul,
  rotationFromQuaternion,
  vec4,
  writeMat4f32,
} from "../geometry/lorentz.ts";
import { buildMergedTubes, buildOrbGeometry } from "../geometry/tube.ts";
import { attachPerEyeUniform, createSpaceMaterial } from "../render/material.ts";
import type { InputState } from "../xr/input.ts";

const PLACE_M = 1.2;

export interface TriangleMeasure {
  angles: [number, number, number];
  sum: number;
  extra: number;
}

export class TriangleTool {
  points: Vec4[] = [];
  pointMesh: InstancedMesh;
  edgeMesh: InstancedMesh;
  enabled = false;
  measure: TriangleMeasure | null = null;
  private kappa: Kappa = -1;
  private K = 6;
  private tmp = new Float64Array(16) as Mat4;
  private B = new Float64Array(16) as Mat4;
  private R = new Float64Array(16) as Mat4;
  private M = new Float64Array(16) as Mat4;
  private mat = new Matrix4();

  constructor(kappa: Kappa, K: number, bg: Color) {
    this.kappa = kappa;
    this.K = K;
    const pgeo = buildOrbGeometry(kappa, 0.05);
    const pmat = createSpaceMaterial(kappa, K, bg);
    this.pointMesh = new InstancedMesh(pgeo, pmat, 3);
    this.pointMesh.frustumCulled = false;
    this.pointMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.pointMesh.count = 0;
    this.pointMesh.setColorAt(0, new Color("#ff6b8a"));
    this.pointMesh.setColorAt(1, new Color("#ffd36a"));
    this.pointMesh.setColorAt(2, new Color("#7CFFB2"));
    if (this.pointMesh.instanceColor) this.pointMesh.instanceColor.needsUpdate = true;
    attachPerEyeUniform(this.pointMesh as never);

    const empty = buildMergedTubes([], kappa);
    const emat = createSpaceMaterial(kappa, K, bg);
    this.edgeMesh = new InstancedMesh(empty, emat, 1);
    this.edgeMesh.frustumCulled = false;
    this.edgeMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.edgeMesh.count = 0;
    this.edgeMesh.setColorAt(0, new Color("#ff9ad5"));
    if (this.edgeMesh.instanceColor) this.edgeMesh.instanceColor.needsUpdate = true;
    attachPerEyeUniform(this.edgeMesh as never);
  }

  setMode(kappa: Kappa, K: number, bg: Color): void {
    this.kappa = kappa;
    this.K = K;
    this.clear();
    for (const mesh of [this.pointMesh, this.edgeMesh]) {
      const m = mesh.material as ReturnType<typeof createSpaceMaterial>;
      m.uniforms.uKappa.value = kappa;
      m.uniforms.uK.value = K;
      m.uniforms.uBg.value.copy(bg);
    }
  }

  toggle(): void {
    this.enabled = !this.enabled;
    if (!this.enabled) this.clear();
  }

  clear(): void {
    this.points = [];
    this.measure = null;
    this.pointMesh.count = 0;
    this.edgeMesh.count = 0;
  }

  placeFromPose(
    P: Mat4,
    pos: { x: number; y: number; z: number },
    quat: { x: number; y: number; z: number; w: number },
  ): void {
    if (this.points.length >= 3) this.clear();
    const k = this.kappa;
    const len = Math.hypot(pos.x, pos.y, pos.z);
    if (len > 1e-6) {
      const u = vec4(pos.x / len, pos.y / len, pos.z / len, 0);
      boost(u, len / this.K, k, this.B);
    } else {
      this.B.set(identity());
    }
    rotationFromQuaternion(quat.x, quat.y, quat.z, quat.w, this.R);
    boost(vec4(0, 0, -1, 0), PLACE_M / this.K, k, this.tmp);
    mul(this.R, this.tmp, this.M);
    mul(this.B, this.M, this.tmp);
    mul(P, this.tmp, this.M);
    this.points.push(copyVec(apply(this.M, ORIGIN)));
    this.rebuild();
  }

  handleInput(
    input: InputState,
    P: Mat4,
    presenting: boolean,
    camQuat: { x: number; y: number; z: number; w: number },
    camPos: { x: number; y: number; z: number },
  ): void {
    if (!this.enabled) return;
    if (input.gripPressed) this.clear();
    if (!input.triggerPressed) return;
    if (presenting && input.hasRight) {
      this.placeFromPose(P, input.rightPos, input.rightQuat);
    } else if (!presenting) {
      this.placeFromPose(P, camPos, camQuat);
    }
  }

  syncMatrices(Pinv: Mat4): void {
    const k = this.kappa;
    this.pointMesh.count = this.points.length;
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      poseAtPoint(p, k, this.tmp);
      mul(Pinv, this.tmp, this.M);
      writeMat4f32(this.M, this.mat.elements);
      this.pointMesh.setMatrixAt(i, this.mat);
    }
    this.pointMesh.instanceMatrix.needsUpdate = true;
    if (this.points.length === 3) {
      this.edgeMesh.count = 1;
      writeMat4f32(Pinv, this.mat.elements);
      this.edgeMesh.setMatrixAt(0, this.mat);
      this.edgeMesh.instanceMatrix.needsUpdate = true;
    } else {
      this.edgeMesh.count = 0;
    }
  }

  private rebuild(): void {
    if (this.points.length < 3) {
      this.measure = null;
      this.edgeMesh.count = 0;
      return;
    }
    const [A, B, C] = this.points;
    const k = this.kappa;
    const aA = angleAt(A, B, C, k);
    const aB = angleAt(B, C, A, k);
    const aC = angleAt(C, A, B, k);
    const sum = aA + aB + aC;
    this.measure = {
      angles: [aA, aB, aC],
      sum,
      extra: k < 0 ? Math.PI - sum : k > 0 ? sum - Math.PI : 0,
    };
    const geo = buildMergedTubes(
      [
        [A, B],
        [B, C],
        [C, A],
      ],
      k,
      { radius: 0.018 },
    );
    this.edgeMesh.geometry.dispose();
    this.edgeMesh.geometry = geo;
    this.edgeMesh.count = 1;
  }
}

function poseAtPoint(p: Vec4, k: Kappa, out: Mat4): Mat4 {
  if (k === 0) {
    const T = identity();
    T[12] = p[0];
    T[13] = p[1];
    T[14] = p[2];
    out.set(T);
    return out;
  }
  const xyz = Math.hypot(p[0], p[1], p[2]);
  const u = vec4(xyz > 1e-9 ? p[0] / xyz : 1, xyz > 1e-9 ? p[1] / xyz : 0, xyz > 1e-9 ? p[2] / xyz : 0, 0);
  const d = k < 0 ? Math.acosh(Math.max(p[3], 1)) : Math.acos(Math.min(1, Math.max(-1, p[3])));
  return boost(u, d, k, out);
}
