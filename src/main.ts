/**
 * Beyond Euclid VR — WebXR explorer of H³ {4,3,5}, E³ {4,3,4}, and S³ {4,3,3}.
 *
 * The Three camera is a tracking-space eye only. Geometry lives in 4D; we
 * upload instanceMatrix = P⁻¹ G and a per-eye boost uniform each frame.
 */
import "./style.css";
import {
  Clock,
  Color,
  Group,
  Line,
  BufferGeometry,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Scene,
  Vector3,
  WebGLRenderer,
  CanvasTexture,
  SRGBColorSpace,
  AdditiveBlending,
} from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import {
  type Kappa,
  type Mat4,
  ORIGIN,
  apply,
  distance,
  identity,
} from "./geometry/lorentz.ts";
import { LatticeWorld } from "./render/world.ts";
import { bindDesktopInput, consumeKey, createInput, readInput } from "./xr/input.ts";
import { createLoco, createVignette, stepLocomotion, updateVignette } from "./xr/locomotion.ts";
import { ParallelWalkers } from "./tools/parallelWalkers.ts";
import { TriangleTool } from "./tools/triangle.ts";
import {
  type ModeId,
  type PanelAction,
  WristPanel,
  formatTriangle,
} from "./ui/panel.ts";
import { AmbientAudio } from "./audio.ts";

const BG: Record<ModeId, number> = {
  H: 0x040614,
  E: 0x07080e,
  S: 0x10080a,
};

function kappaOf(mode: ModeId): Kappa {
  if (mode === "H") return -1;
  if (mode === "S") return 1;
  return 0;
}

const canvas = document.querySelector<HTMLCanvasElement>("#c")!;
const renderer = new WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local");
renderer.xr.setFramebufferScaleFactor(0.85);
renderer.xr.setFoveation(1);

const vrBtn = VRButton.createButton(renderer);
vrBtn.id = "vr-button";
document.body.appendChild(vrBtn);

const scene = new Scene();
const camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 48);
camera.position.set(0, 1.6, 0);
scene.add(camera);

const rig = new Group();
scene.add(rig);

let mode: ModeId = "H";
let K = 6;
let bg = new Color(BG[mode]);
scene.background = bg;

const P = identity();
const loco = createLoco();
const input = createInput();
bindDesktopInput(input, canvas);

let world!: LatticeWorld;
let walkers!: ParallelWalkers;
let triangle!: TriangleTool;

const vignette = createVignette(camera);
const audio = new AmbientAudio();

const panel = new WristPanel();
const panelTex = new CanvasTexture(panel.canvas);
panelTex.colorSpace = SRGBColorSpace;
const panelMesh = new Mesh(
  new PlaneGeometry(0.2, 0.2),
  new MeshBasicMaterial({ map: panelTex, transparent: true, depthTest: false }),
);
panelMesh.position.set(0.06, 0.04, -0.14);
panelMesh.rotation.x = -0.85;
panelMesh.rotation.y = 0.4;

const ctrlLeft = renderer.xr.getController(0);
const ctrlRight = renderer.xr.getController(1);
const gripLeft = renderer.xr.getControllerGrip(0);
const gripRight = renderer.xr.getControllerGrip(1);
scene.add(ctrlLeft, ctrlRight, gripLeft, gripRight);

const laserGeo = new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), new Vector3(0, 0, -2)]);
const laser = new Line(laserGeo, new LineBasicMaterial({ color: 0x88ddff, blending: AdditiveBlending }));
ctrlRight.add(laser);

const pointer = new Mesh(
  new PlaneGeometry(0.008, 0.008),
  new MeshBasicMaterial({ color: 0xffffff, depthTest: false }),
);
pointer.position.z = -0.01;
panelMesh.add(pointer);

const hud = document.querySelector<HTMLElement>("#hud")!;
const clock = new Clock();
const yawPitch = { yaw: 0, pitch: 0 };
const headQ = new Quaternion();
const raycaster = new Raycaster();
let stats = { instances: 0, triangles: 0 };
let walkerDist: number | null = null;
let fps = 72;
let fpsAccum = 0;
let fpsFrames = 0;
let lastPanel = 0;

document.addEventListener("mousemove", (e) => {
  if (!input.pointerLocked) return;
  yawPitch.yaw -= e.movementX * 0.0022;
  yawPitch.pitch -= e.movementY * 0.0022;
  yawPitch.pitch = Math.max(-1.4, Math.min(1.4, yawPitch.pitch));
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

canvas.addEventListener("click", () => {
  audio.resume();
  if (!renderer.xr.isPresenting && triangle.enabled) {
    /* placement happens on click via trigger analog: use a synthetic press next frame */
  }
});

let pendingDesktopPlace = false;
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0 && triangle.enabled && !renderer.xr.isPresenting) pendingDesktopPlace = true;
  if (e.button === 2) triangle.clear();
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

vrBtn.addEventListener("click", () => audio.resume());

function rebuildWorld(next: ModeId): void {
  mode = next;
  bg = new Color(BG[mode]);
  scene.background = bg;
  world?.dispose();
  walkers?.mesh.removeFromParent();
  triangle?.pointMesh.removeFromParent();
  triangle?.edgeMesh.removeFromParent();
  const k = kappaOf(mode);
  world = new LatticeWorld(k, K, bg);
  scene.add(world.mesh, world.landmarks);
  walkers = new ParallelWalkers(k, K, bg);
  scene.add(walkers.mesh);
  triangle = new TriangleTool(k, K, bg);
  scene.add(triangle.pointMesh, triangle.edgeMesh);
  P.set(identity());
  camera.near = 0.05;
  camera.far = K * 4;
  camera.updateProjectionMatrix();
}

function applyAction(a: PanelAction): void {
  if (a.type === "mode") rebuildWorld(a.mode);
  if (a.type === "walkers") walkers.toggle(P);
  if (a.type === "triangle") triangle.toggle();
  if (a.type === "vignette") loco.vignetteEnabled = !loco.vignetteEnabled;
  if (a.type === "reset") P.set(identity());
  if (a.type === "K") {
    K = a.K;
    world.setK(K, bg);
    walkers.setMode(kappaOf(mode), K, bg);
    triangle.setMode(kappaOf(mode), K, bg);
    camera.far = K * 4;
    camera.updateProjectionMatrix();
  }
}

function attachPanel(): void {
  const session = renderer.xr.getSession();
  let left: typeof gripLeft | null = null;
  if (session) {
    for (const src of session.inputSources) {
      if (src.handedness === "left") left = gripLeft;
    }
  }
  const host = left ?? (renderer.xr.isPresenting ? ctrlLeft : null);
  if (host && panelMesh.parent !== host) {
    panelMesh.parent?.remove(panelMesh);
    host.add(panelMesh);
  }
  if (!renderer.xr.isPresenting && panelMesh.parent) {
    panelMesh.parent.remove(panelMesh);
  }
}

function hitPanel(): PanelAction | "slider" | null {
  if (!panelMesh.parent) return null;
  raycaster.ray.origin.set(0, 0, 0);
  raycaster.ray.direction.set(0, 0, -1);
  ctrlRight.updateWorldMatrix(true, false);
  raycaster.ray.applyMatrix4(ctrlRight.matrixWorld);
  const hits = raycaster.intersectObject(panelMesh, false);
  if (!hits.length) {
    pointer.visible = false;
    return null;
  }
  const uv = hits[0].uv;
  if (!uv) return null;
  pointer.visible = true;
  pointer.position.set((uv.x - 0.5) * 0.2, (uv.y - 0.5) * 0.2, 0.002);
  return panel.hit(uv.x, uv.y);
}

function desktopHead(): void {
  if (renderer.xr.isPresenting) return;
  camera.rotation.order = "YXZ";
  camera.rotation.y = yawPitch.yaw;
  camera.rotation.x = yawPitch.pitch;
  camera.position.set(0, 1.6, 0);
}

function tutorial(): string {
  if (mode === "H") return "Five cubes around every edge. Parallels diverge.";
  if (mode === "S") return "Eight cubic cells. Walk 2πK metres and you return.";
  return "Control world: a flat cubic lattice.";
}

function pumpKeys(): void {
  if (consumeKey(input, "1")) applyAction({ type: "mode", mode: "H" });
  if (consumeKey(input, "2")) applyAction({ type: "mode", mode: "E" });
  if (consumeKey(input, "3")) applyAction({ type: "mode", mode: "S" });
  if (consumeKey(input, "p")) applyAction({ type: "walkers" });
  if (consumeKey(input, "t")) applyAction({ type: "triangle" });
  if (consumeKey(input, "r")) applyAction({ type: "reset" });
  if (consumeKey(input, "v")) applyAction({ type: "vignette" });
  if (consumeKey(input, "q")) input.snapLeft = true;
  if (consumeKey(input, "e")) input.snapRight = true;
  if (consumeKey(input, "[")) applyAction({ type: "K", K: Math.max(2, K - 0.5) });
  if (consumeKey(input, "]")) applyAction({ type: "K", K: Math.min(12, K + 0.5) });
}

function tick(): void {
  const dt = Math.min(0.05, clock.getDelta());
  readInput(renderer, input);
  pumpKeys();
  desktopHead();
  camera.getWorldQuaternion(headQ);

  if (pendingDesktopPlace) {
    input.triggerPressed = true;
    pendingDesktopPlace = false;
  }

  stepLocomotion(P, kappaOf(mode), K, input, headQ, dt, loco);
  updateVignette(vignette, loco);

  attachPanel();
  const action = renderer.xr.isPresenting ? hitPanel() : null;
  if (action && input.triggerPressed) {
    if (action === "slider") {
      const hits = raycaster.intersectObject(panelMesh, false);
      if (hits[0]?.uv) applyAction({ type: "K", K: panel.kFromU(hits[0].uv.x) });
    } else applyAction(action);
  } else if (action === "slider" && input.triggerDown) {
    const hits = raycaster.intersectObject(panelMesh, false);
    if (hits[0]?.uv) applyAction({ type: "K", K: panel.kFromU(hits[0].uv.x) });
  }

  const skipPlace = Boolean(action);
  if (!skipPlace) {
    triangle.handleInput(input, P, renderer.xr.isPresenting, headQ, camera.position);
  }

  stats = world.update(P);
  walkerDist = walkers.active ? walkers.update(dt, world.Pinv) : null;
  triangle.syncMatrices(world.Pinv);

  const origin = apply(P, ORIGIN);
  audio.update(loco.speed, distance(origin, ORIGIN as never, kappaOf(mode)));

  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum > 0.4) {
    fps = fpsFrames / fpsAccum;
    fpsAccum = 0;
    fpsFrames = 0;
  }

  const now = performance.now();
  if (now - lastPanel > 80) {
    lastPanel = now;
    panel.draw({
      mode,
      K,
      walkers: walkers.active,
      triangle: triangle.enabled,
      vignette: loco.vignetteEnabled,
      fps,
      instances: stats.instances,
      triangles: stats.triangles,
      walkerDist,
      triText: formatTriangle(triangle.measure, mode),
      tutorial: tutorial(),
    });
    panelTex.needsUpdate = true;
    hud.innerHTML = `
      <div class="title">Beyond Euclid</div>
      <div>${mode === "H" ? "H³ {4,3,5}" : mode === "S" ? "S³ {4,3,3}" : "E³ {4,3,4}"} · K=${K.toFixed(1)} m</div>
      <div>${fps.toFixed(0)} FPS · ${stats.instances} cells</div>
      ${walkerDist !== null ? `<div class="accent">walkers ${walkerDist.toFixed(2)} m</div>` : ""}
      ${triangle.measure ? `<div class="accent">${formatTriangle(triangle.measure, mode)}</div>` : ""}
      <div class="help">WASD move · mouse look · Q/E snap · 1 H³  2 E³  3 S³ · P walkers · T triangle · [ ] K · R reset</div>
    `;
  }

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(tick);
rebuildWorld("H");
