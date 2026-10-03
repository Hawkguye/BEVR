/**
 * Smooth locomotion and snap-turn as isometries of the player pose P.
 *
 * P ← P · boost(u, speed·dt/K, κ)  with u = flattened head-forward.
 * Snap: P ← P · rotationY(±30°).
 * Comfort vignette opacity tracks current speed.
 */
import {
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  type Camera,
} from "three";
import {
  type Kappa,
  type Mat4,
  axis,
  boost,
  mul,
  reorthonormalize,
  rotationFromQuaternion,
  rotationY,
  apply,
  vec4,
} from "../geometry/lorentz.ts";
import type { InputState } from "./input.ts";

export const WALK_SPEED = 1.5;
export const SNAP_RAD = (30 * Math.PI) / 180;

const fwd = vec4(0, 0, 0, 0);
const right = vec4(0, 0, 0, 0);
const tmpB = new Float64Array(16) as Mat4;
const tmpR = new Float64Array(16) as Mat4;
const tmpP = new Float64Array(16) as Mat4;

export interface LocoState {
  speed: number;
  vignetteEnabled: boolean;
}

export function createLoco(): LocoState {
  return { speed: 0, vignetteEnabled: true };
}

export function stepLocomotion(
  P: Mat4,
  kappa: Kappa,
  K: number,
  input: InputState,
  headQuat: { x: number; y: number; z: number; w: number },
  dt: number,
  loco: LocoState,
): void {
  let mx = input.moveX;
  let my = input.moveY;
  const mag = Math.hypot(mx, my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
  }

  rotationFromQuaternion(headQuat.x, headQuat.y, headQuat.z, headQuat.w, tmpR);
  apply(tmpR, axis(2, -1), fwd);
  fwd[1] = 0;
  fwd[3] = 0;
  let fn = Math.hypot(fwd[0], fwd[2]);
  if (fn < 1e-5) {
    fwd[0] = 0;
    fwd[2] = -1;
    fn = 1;
  }
  fwd[0] /= fn;
  fwd[2] /= fn;

  right[0] = -fwd[2];
  right[1] = 0;
  right[2] = fwd[0];
  right[3] = 0;

  const stepM = (WALK_SPEED * dt) / K;
  const dx = right[0] * mx + fwd[0] * my;
  const dz = right[2] * mx + fwd[2] * my;
  const slen = Math.hypot(dx, dz);
  loco.speed = slen * WALK_SPEED;
  if (slen > 1e-6) {
    fwd[0] = dx / slen;
    fwd[1] = 0;
    fwd[2] = dz / slen;
    fwd[3] = 0;
    boost(fwd, stepM * slen, kappa, tmpB);
    mul(P, tmpB, tmpP);
    P.set(tmpP);
  }

  if (input.snapLeft) {
    rotationY(SNAP_RAD, tmpB);
    mul(P, tmpB, tmpP);
    P.set(tmpP);
  }
  if (input.snapRight) {
    rotationY(-SNAP_RAD, tmpB);
    mul(P, tmpB, tmpP);
    P.set(tmpP);
  }

  reorthonormalize(P, kappa);
}

export function createVignette(camera: Camera): Mesh {
  const geo = new SphereGeometry(0.35, 24, 16);
  const mat = new ShaderMaterial({
    side: BackSide,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uOpacity: { value: 0 },
      uColor: { value: new Color(0x000000) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      void main() {
        vN = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec3 vN;
      void main() {
        float r = 1.0 - abs(vN.z);
        float a = smoothstep(0.25, 0.95, r) * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 999;
  camera.add(mesh);
  return mesh;
}

export function updateVignette(mesh: Mesh, loco: LocoState): void {
  const mat = mesh.material as ShaderMaterial;
  const target = loco.vignetteEnabled ? Math.min(1, loco.speed / WALK_SPEED) * 0.85 : 0;
  const cur = mat.uniforms.uOpacity.value as number;
  mat.uniforms.uOpacity.value = cur + (target - cur) * 0.2;
}
