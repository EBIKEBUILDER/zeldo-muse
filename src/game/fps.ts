/**
 * FPS tracker: the engine reports each frame's delta; the HUD polls the
 * smoothed value a couple times per second. Module-level so the render
 * loop never touches React state.
 */

let acc = 0;
let frames = 0;
let fps = 60;

/** Call once per rendered frame with delta seconds. */
export function reportFrame(dt: number): void {
  acc += dt;
  frames++;
  if (acc >= 0.5) {
    fps = Math.round(frames / acc);
    acc = 0;
    frames = 0;
  }
}

export function getFps(): number {
  return fps;
}
