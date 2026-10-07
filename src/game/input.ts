/**
 * Stage 2 — keyboard input. WASD + arrow keys.
 * Real input mapping (gamepad, remapping UI) arrives in stage 3.
 */

const down = new Set<string>();
let initialized = false;

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

/** Normalized 2D move vector. +x = east, +z = south (screen-down). */
export function getMoveVector(): { x: number; z: number } {
  const x =
    (down.has("KeyD") || down.has("ArrowRight") ? 1 : 0) -
    (down.has("KeyA") || down.has("ArrowLeft") ? 1 : 0);
  const z =
    (down.has("KeyS") || down.has("ArrowDown") ? 1 : 0) -
    (down.has("KeyW") || down.has("ArrowUp") ? 1 : 0);
  if (x === 0 && z === 0) return { x: 0, z: 0 };
  const len = Math.hypot(x, z);
  return { x: x / len, z: z / len };
}
