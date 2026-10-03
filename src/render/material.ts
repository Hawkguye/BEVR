/**
 * Curved-space ShaderMaterial.
 *
 * We own the view: instanceMatrix = P⁻¹ G_i (float64 on CPU, float32 here).
 * uEye = R_headᵀ · B(−t/K) so stereo disparity is a true boost of the eye.
 *
 * Display maps:
 *   H³ Klein:           k = (xyz/w) · K     (geodesics stay straight)
 *   S³ azimuthal eqdst: k = (xyz/|xyz|) · acos(w) · K
 *   E³:                 k = xyz · K
 */
import {
  Color,
  type Camera,
  type Scene,
  type WebGLRenderer,
  ShaderMaterial,
} from "three";
import {
  type Kappa,
  axis,
  boost,
  mul,
  rotationFromQuaternion,
  transposeRot3,
  writeMat4f32,
  vec4,
} from "../geometry/lorentz.ts";

const vertexShader = /* glsl */ `
attribute vec4 position4;
uniform mat4 uEye;
uniform float uK;
uniform float uKappa;
uniform float uFogStart;
uniform float uFogEnd;
varying vec3 vColor;
varying float vFog;

void main() {
  vec4 p = uEye * instanceMatrix * position4;

  vec3 k;
  float dist;
  if (uKappa < 0.0) {
    dist = acosh(max(p.w, 1.0));
    float iw = 1.0 / max(p.w, 1e-4);
    k = p.xyz * iw * uK;
    if (p.w < 0.15) {
      k = vec3(0.0, 0.0, -uK * 4.0);
      dist = uFogEnd + 1.0;
    }
  } else if (uKappa > 0.0) {
    dist = acos(clamp(p.w, -1.0, 1.0));
    float n = length(p.xyz);
    k = (n > 1e-6 ? p.xyz / n : vec3(0.0, 0.0, -1.0)) * dist * uK;
  } else {
    dist = length(p.xyz);
    k = p.xyz * uK;
  }

  vFog = 1.0 - smoothstep(uFogStart, uFogEnd, dist);
#ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
#else
  vColor = vec3(0.55, 0.82, 1.0);
#endif
  gl_Position = projectionMatrix * vec4(k, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uBg;
varying vec3 vColor;
varying float vFog;

void main() {
  vec3 col = vColor * (0.35 + 0.65 * vFog);
  gl_FragColor = vec4(mix(uBg, col, vFog), 1.0);
}
`;

const eyeScratch = new Float32Array(16);
const tmpBoost = new Float64Array(16) as Mat4;
const tmpR = new Float64Array(16) as Mat4;
const tmpRt = new Float64Array(16) as Mat4;
const tmpU = vec4(0, 0, 0, 0);

export function createSpaceMaterial(kappa: Kappa, K: number, bg: Color): ShaderMaterial {
  const fog = fogRange(kappa);
  const mat = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uEye: { value: eyeScratch.slice() },
      uK: { value: K },
      uKappa: { value: kappa },
      uFogStart: { value: fog[0] },
      uFogEnd: { value: fog[1] },
      uBg: { value: bg.clone() },
    },
  });
  mat.frustumCulled = false;
  return mat;
}

export function fogRange(kappa: Kappa): [number, number] {
  if (kappa < 0) return [1.1, 2.45];
  if (kappa > 0) return [1.4, 2.9];
  return [3.2, 6.2];
}

export function setMaterialWorld(
  mat: ShaderMaterial,
  kappa: Kappa,
  K: number,
  bg: Color,
): void {
  mat.uniforms.uK.value = K;
  mat.uniforms.uKappa.value = kappa;
  const fog = fogRange(kappa);
  mat.uniforms.uFogStart.value = fog[0];
  mat.uniforms.uFogEnd.value = fog[1];
  mat.uniforms.uBg.value.copy(bg);
}

/** uEye = Rᵀ · boost(t̂, −|t|/K, κ). |t|≈0 → Rᵀ. */
export function computeEyeMatrix(
  cam: Camera,
  K: number,
  kappa: Kappa,
  dst: Float32Array,
): void {
  const q = cam.quaternion;
  rotationFromQuaternion(q.x, q.y, q.z, q.w, tmpR);
  transposeRot3(tmpR, tmpRt);
  const tx = cam.position.x;
  const ty = cam.position.y;
  const tz = cam.position.z;
  const len = Math.hypot(tx, ty, tz);
  if (len < 1e-5) {
    writeMat4f32(tmpRt, dst);
    return;
  }
  tmpU[0] = tx / len;
  tmpU[1] = ty / len;
  tmpU[2] = tz / len;
  tmpU[3] = 0;
  boost(tmpU, -len / K, kappa, tmpBoost);
  mul(tmpRt, tmpBoost, tmpR);
  writeMat4f32(tmpR, dst);
}

export function attachPerEyeUniform(mesh: { onBeforeRender: (...a: unknown[]) => void; material: ShaderMaterial }): void {
  mesh.onBeforeRender = (
    _renderer: WebGLRenderer,
    _scene: Scene,
    camera: Camera,
  ) => {
    const mat = mesh.material;
    const K = mat.uniforms.uK.value as number;
    const kappa = mat.uniforms.uKappa.value as number;
    computeEyeMatrix(camera, K, kappa as Kappa, mat.uniforms.uEye.value);
  };
}

export { vertexShader, fragmentShader };
