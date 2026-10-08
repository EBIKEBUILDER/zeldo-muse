/**
 * Performance tracker: the engine reports each frame's render stats;
 * the HUD polls the smoothed values a couple times per second.
 * Module-level so the render loop never touches React state.
 */

import type { Scene, SceneInstrumentation } from "@babylonjs/core";

export interface PerfStats {
  fps: number;
  /** Full frame time in ms (sim + render). */
  frameMs: number;
  /** Scene render time in ms. */
  renderMs: number;
  drawCalls: number;
  activeMeshes: number;
  triangles: number;
}

const stats: PerfStats = {
  fps: 60,
  frameMs: 16.7,
  renderMs: 0,
  drawCalls: 0,
  activeMeshes: 0,
  triangles: 0,
};

let acc = 0;
let frames = 0;

/** Call once per rendered frame with delta seconds. */
export function reportFrame(dt: number): void {
  acc += dt;
  frames++;
  if (acc >= 0.5) {
    stats.fps = Math.round(frames / acc);
    acc = 0;
    frames = 0;
  }
}

/**
 * Call once per frame, after scene.render(). Copies instrumentation
 * counters and sums visible triangles — cheap, no React state involved.
 */
export function reportRender(scene: Scene, inst: SceneInstrumentation): void {
  stats.frameMs = inst.frameTimeCounter.current;
  stats.renderMs = inst.renderTimeCounter.current;
  stats.drawCalls = inst.drawCallsCounter.current;
  const meshes = scene.getActiveMeshes();
  const data = meshes.data;
  stats.activeMeshes = meshes.length;
  let tris = 0;
  for (let i = 0; i < meshes.length; i++) {
    tris += data[i].getTotalIndices() / 3;
  }
  stats.triangles = Math.round(tris);
}

export function getPerfStats(): PerfStats {
  return stats;
}

/** Back-compat for the old FPS-only call sites. */
export function getFps(): number {
  return stats.fps;
}
