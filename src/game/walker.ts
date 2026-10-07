import { useGameStore } from "../store/gameStore";
import { getMoveVector } from "./input";
import { TILE_SIZE, isSolid, screenAt, tileAt } from "../world/tiles";

/**
 * STAGE 2 — minimal walker so the world is explorable and collision is
 * verifiable. Constant speed, axis-separated collision, no acceleration,
 * no animation. Stage 3 replaces this with real game-feel movement.
 */
const SPEED = 8; // world units per second
const RADIUS = 0.45; // player collision radius
// Collision is resolved per sub-step so the player can snug up to walls
// even when a frame's full step would overshoot (low frame rates).
const MAX_STEP = 0.1;

function hitsSolid(x: number, z: number): boolean {
  const x0 = Math.floor((x - RADIUS) / TILE_SIZE);
  const x1 = Math.floor((x + RADIUS) / TILE_SIZE);
  const z0 = Math.floor((z - RADIUS) / TILE_SIZE);
  const z1 = Math.floor((z + RADIUS) / TILE_SIZE);
  for (let tx = x0; tx <= x1; tx++) {
    for (let tz = z0; tz <= z1; tz++) {
      const t = tileAt(tx, tz); // null outside the world -> solid
      if (t === null || isSolid(t)) return true;
    }
  }
  return false;
}

export function updateWalker(dt: number): void {
  const dir = getMoveVector();
  if (dir.x === 0 && dir.z === 0) return;

  const s = useGameStore.getState();
  let { x, z } = s.player;

  // Sub-step the frame's motion so collision stays frame-rate independent.
  // Axis-separated per sub-step: slide along walls instead of sticking.
  const mx = dir.x * SPEED * dt;
  const mz = dir.z * SPEED * dt;
  const steps = Math.max(1, Math.ceil(Math.hypot(mx, mz) / MAX_STEP));
  for (let i = 0; i < steps; i++) {
    const nx = x + mx / steps;
    if (!hitsSolid(nx, z)) x = nx;
    const nz = z + mz / steps;
    if (!hitsSolid(x, nz)) z = nz;
  }

  s.setPlayerPosition(x, z);
  s.setPlayerFacing(Math.atan2(dir.x, -dir.z)); // 0 = up-screen (-z)

  const sc = screenAt(x, z);
  if (sc.x !== s.screen.x || sc.y !== s.screen.y) s.setScreen(sc.x, sc.y);
}
