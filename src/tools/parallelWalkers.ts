/**
 * Parallel Walkers: two geodesics that start parallel, offset by ±s along x̂.
 *
 * Orb_i(t) = P0 · boost(x̂, ±s, κ) · boost(−ẑ, v t, κ) · O
 * HUD reports distance(orbA, orbB, κ) · K metres.
 * In E³ the distance is constant; in H³ it grows; in S³ they meet.
 */
import {
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
} from "three";
import {
  type Kappa,
  type Mat4,
  type Vec4,
  ORIGIN,
  apply,
  boost,
  copyMat,
  distance,
  identity,
  mul,
  vec4,
  writeMat4f32,
} from "../geometry/lorentz.ts";
import { buildOrbGeometry } from "../geometry/tube.ts";
import { attachPerEyeUniform, createSpaceMaterial } from "../render/material.ts";

const sSep = 0.25;
const vWalk = 0.35;

export class ParallelWalkers {
  mesh: InstancedMesh;
  active = false;
  t = 0;
  private P0: Mat4 = identity();
  private kappa: Kappa = -1;
  private K = 6;
  private scratch = new Float64Array(16) as Mat4;
  private ba = new Float64Array(16) as Mat4;
  private bb = new Float64Array(16) as Mat4;
  private posA: Vec4 = vec4(0, 0, 0, 1);
  private posB: Vec4 = vec4(0, 0, 0, 1);

  constructor(kappa: Kappa, K: number, bg: ThreeColor) {
    this.kappa = kappa;
    this.K = K;
    const geo = buildOrbGeometry(kappa, 0.07);
    const mat = createSpaceMaterial(kappa, K, bg);
    this.mesh = new InstancedMesh(geo, mat, 2);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new Color("#ffd36a"));
    this.mesh.setColorAt(1, new Color("#7ee0ff"));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    attachPerEyeUniform(this.mesh as never);
  }

  setMode(kappa: Kappa, K: number, bg: ThreeColor): void {
    this.kappa = kappa;
    this.K = K;
    const mat = this.mesh.material as ReturnType<typeof createSpaceMaterial>;
    mat.uniforms.uKappa.value = kappa;
    mat.uniforms.uK.value = K;
    mat.uniforms.uBg.value.copy(bg);
    this.stop();
  }

  start(P: Mat4): void {
    this.active = true;
    this.t = 0;
    copyMat(P, this.P0);
    this.mesh.count = 2;
  }

  stop(): void {
    this.active = false;
    this.t = 0;
    this.mesh.count = 0;
  }

  toggle(P: Mat4): void {
    if (this.active) this.stop();
    else this.start(P);
  }

  update(dt: number, Pinv: Mat4): number {
    if (!this.active) return 0;
    this.t += dt;
    const k = this.kappa;
    boost(vec4(1, 0, 0, 0), sSep, k, this.ba);
    boost(vec4(-1, 0, 0, 0), sSep, k, this.bb);
    boost(vec4(0, 0, -1, 0), vWalk * this.t, k, this.scratch);
    const Ma = mul(this.P0, mul(this.ba, this.scratch));
    const Mb = mul(this.P0, mul(this.bb, this.scratch));
    apply(Ma, ORIGIN, this.posA);
    apply(Mb, ORIGIN, this.posB);

    const ia = mul(Pinv, Ma);
    const ib = mul(Pinv, Mb);
    const m = new Matrix4();
    writeMat4f32(ia, m.elements);
    this.mesh.setMatrixAt(0, m);
    writeMat4f32(ib, m.elements);
    this.mesh.setMatrixAt(1, m);
    this.mesh.instanceMatrix.needsUpdate = true;

    return distance(this.posA, this.posB, k) * this.K;
  }
}
