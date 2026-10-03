/**
 * Quest Touch + desktop fallback.
 * Left stick / WASD: locomotion. Right stick / QE: snap turn.
 * Keyboard: 1/2/3 modes, P walkers, T triangle, R reset, V vignette, [ ] K.
 */
import type { WebGLRenderer } from "three";
import { Vector3, Quaternion } from "three";

export interface InputState {
  moveX: number;
  moveY: number;
  snapLeft: boolean;
  snapRight: boolean;
  triggerDown: boolean;
  triggerPressed: boolean;
  gripPressed: boolean;
  leftPos: Vector3;
  leftQuat: Quaternion;
  rightPos: Vector3;
  rightQuat: Quaternion;
  hasLeft: boolean;
  hasRight: boolean;
  pointerLocked: boolean;
  keys: Set<string>;
}

export function createInput(): InputState {
  return {
    moveX: 0,
    moveY: 0,
    snapLeft: false,
    snapRight: false,
    triggerDown: false,
    triggerPressed: false,
    gripPressed: false,
    leftPos: new Vector3(),
    leftQuat: new Quaternion(),
    rightPos: new Vector3(),
    rightQuat: new Quaternion(),
    hasLeft: false,
    hasRight: false,
    pointerLocked: false,
    keys: new Set(),
  };
}

const STICK_DEAD = 0.25;
const SNAP_THRESH = 0.7;
let snapArmed = true;
let prevTrigger = false;
let prevGrip = false;

export function bindDesktopInput(input: InputState, canvas: HTMLElement): void {
  const onKey = (e: KeyboardEvent, down: boolean) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (down) input.keys.add(k);
    else input.keys.delete(k);
    if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
    }
  };
  window.addEventListener("keydown", (e) => onKey(e, true));
  window.addEventListener("keyup", (e) => onKey(e, false));

  canvas.addEventListener("click", () => {
    if (!input.pointerLocked) canvas.requestPointerLock();
  });
  document.addEventListener("pointerlockchange", () => {
    input.pointerLocked = document.pointerLockElement === canvas;
  });
}

export function readInput(renderer: WebGLRenderer, input: InputState): void {
  input.moveX = 0;
  input.moveY = 0;
  input.snapLeft = false;
  input.snapRight = false;
  input.triggerPressed = false;
  input.gripPressed = false;
  input.hasLeft = false;
  input.hasRight = false;

  const session = renderer.xr.getSession();
  let xrMove = false;
  if (session) {
    for (const src of session.inputSources) {
      const handed = src.handedness;
      const gp = src.gamepad;
      const grip = src.gripSpace;
      const ray = src.targetRaySpace;
      const frame = renderer.xr.getFrame();
      const ref = renderer.xr.getReferenceSpace();
      if (frame && ref && ray) {
        const pose = frame.getPose(ray, ref);
        if (pose && handed === "left") {
          input.hasLeft = true;
          input.leftPos.set(
            pose.transform.position.x,
            pose.transform.position.y,
            pose.transform.position.z,
          );
          input.leftQuat.set(
            pose.transform.orientation.x,
            pose.transform.orientation.y,
            pose.transform.orientation.z,
            pose.transform.orientation.w,
          );
        }
        if (pose && handed === "right") {
          input.hasRight = true;
          input.rightPos.set(
            pose.transform.position.x,
            pose.transform.position.y,
            pose.transform.position.z,
          );
          input.rightQuat.set(
            pose.transform.orientation.x,
            pose.transform.orientation.y,
            pose.transform.orientation.z,
            pose.transform.orientation.w,
          );
        }
        if (!pose && grip) {
          /* fall through */
        }
      }
      if (!gp) continue;
      const ax = gp.axes;
      const stickX = ax.length >= 4 ? ax[2] : ax[0] ?? 0;
      const stickY = ax.length >= 4 ? ax[3] : ax[1] ?? 0;
      if (handed === "left") {
        xrMove = true;
        if (Math.hypot(stickX, stickY) > STICK_DEAD) {
          input.moveX += stickX;
          input.moveY += -stickY;
        }
      }
      if (handed === "right") {
        if (stickX < -SNAP_THRESH && snapArmed) {
          input.snapLeft = true;
          snapArmed = false;
        } else if (stickX > SNAP_THRESH && snapArmed) {
          input.snapRight = true;
          snapArmed = false;
        } else if (Math.abs(stickX) < 0.35) {
          snapArmed = true;
        }
        const trig = (gp.buttons[0]?.value ?? 0) > 0.6;
        input.triggerDown = trig;
        if (trig && !prevTrigger) input.triggerPressed = true;
        prevTrigger = trig;
        const gripBtn = (gp.buttons[1]?.value ?? 0) > 0.6;
        if (gripBtn && !prevGrip) input.gripPressed = true;
        prevGrip = gripBtn;
      }
    }
  }

  if (!xrMove) {
    const k = input.keys;
    if (k.has("w") || k.has("ArrowUp")) input.moveY += 1;
    if (k.has("s") || k.has("ArrowDown")) input.moveY -= 1;
    if (k.has("a") || k.has("ArrowLeft")) input.moveX -= 1;
    if (k.has("d") || k.has("ArrowRight")) input.moveX += 1;
  }
}

export function consumeKey(input: InputState, key: string): boolean {
  if (input.keys.has(key)) {
    input.keys.delete(key);
    return true;
  }
  return false;
}
