/**
 * Stage 4 — keyboard + touch input. WASD + arrows to move, Space/J/click
 * to swing, M to mute. On touch devices a virtual joystick drives the
 * same move vector via setVirtualMove(). Real input mapping (gamepad,
 * remapping UI) is future work.
 */
import { toggleMute } from "./audio";

const down = new Set<string>();
let initialized = false;
let attackQueued = false;
/** Virtual joystick vector (world space, normalized-ish). Set by the touch UI. */
let virtualMove = { x: 0, z: 0 };

/** Called by the virtual joystick on touch devices. */
export function setVirtualMove(x: number, z: number): void {
  virtualMove = { x, z };
}

/** Called by the simulation once per frame; true if attack was pressed. */
export function takeAttack(): boolean {
  const a = attackQueued;
  attackQueued = false;
  return a;
}

/** Mouse click also swings the sword (wired by the engine). */
export function queueAttack(): void {
  attackQueued = true;
}

/** Drain a stale queued attack (e.g. on game start). */
export function clearAttack(): void {
  attackQueued = false;
}

function onKeyDown(e: KeyboardEvent): void {
  if (
    e.code === "ArrowUp" ||
    e.code === "ArrowDown" ||
    e.code === "ArrowLeft" ||
    e.code === "ArrowRight" ||
    e.code === "Space"
  ) {
    e.preventDefault();
  }
  if ((e.code === "Space" || e.code === "KeyJ") && !e.repeat) {
    attackQueued = true;
  }
  if (e.code === "KeyM" && !e.repeat) {
    toggleMute();
  }
  down.add(e.code);
}

function onKeyUp(e: KeyboardEvent): void {
  down.delete(e.code);
}

function onBlur(): void {
  down.clear();
}

export function initInput(): void {
  if (initialized) return;
  initialized = true;
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
}

export function disposeInput(): void {
  if (!initialized) return;
  initialized = false;
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("blur", onBlur);
  down.clear();
}

/** Screen-space move vector. +z = south (screen-down).
 *
 * NOTE: screen-right is -x in world space. The camera sits south of the
 * player looking north, and in this Babylon setup +x renders as
 * screen-left (verified on screen), so D/ArrowRight must drive -x.
 * Get this backwards and A/D feel inverted. */
export function getMoveVector(): { x: number; z: number } {
  const x =
    (down.has("KeyA") || down.has("ArrowLeft") ? 1 : 0) -
    (down.has("KeyD") || down.has("ArrowRight") ? 1 : 0) +
    virtualMove.x;
  const z =
    (down.has("KeyS") || down.has("ArrowDown") ? 1 : 0) -
    (down.has("KeyW") || down.has("ArrowUp") ? 1 : 0) +
    virtualMove.z;
  if (x === 0 && z === 0) return { x: 0, z: 0 };
  const len = Math.hypot(x, z);
  // Clamp to unit length so diagonal keyboard + joystick can't stack speed.
  const cl = Math.min(1, len);
  return { x: (x / len) * cl, z: (z / len) * cl };
}
