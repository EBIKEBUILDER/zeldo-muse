/**
 * Grid pathfinding (A*) for monsters and the boss.
 *
 * The world is a tile grid (TILE_SIZE = 2, enemies are ~0.5 radius), so
 * tile-center A* with 8-directional movement is plenty. Diagonal moves
 * refuse to cut corners through solid tiles.
 *
 * Usage: call findPath() when an enemy acquires (or loses) its target,
 * then steer toward path[i] in order. Repath on a timer — every frame
 * would be wasteful since the grid is small and targets move slowly.
 */

import {
  TILE_SIZE,
  WorldDef,
  isSolid,
  tileAtWorld,
  tileScenePos,
} from "../world/tiles";

export interface Waypoint {
  x: number;
  z: number;
}

const MAX_ITER = 600;

interface Node {
  tx: number;
  tz: number;
  g: number;
  f: number;
  parent: Node | null;
}

function tileOf(w: WorldDef, x: number, z: number): { tx: number; tz: number } {
  return {
    tx: Math.floor((x - w.originX) / TILE_SIZE),
    tz: Math.floor((z - w.originZ) / TILE_SIZE),
  };
}

function walkable(w: WorldDef, tx: number, tz: number, gateOpen: boolean): boolean {
  const t = tileAtWorld(w, tx, tz);
  if (t === null) return false;
  return !isSolid(t, gateOpen);
}

const DIRS = [
  { dx: 1, dz: 0, cost: 1 },
  { dx: -1, dz: 0, cost: 1 },
  { dx: 0, dz: 1, cost: 1 },
  { dx: 0, dz: -1, cost: 1 },
  { dx: 1, dz: 1, cost: Math.SQRT2 },
  { dx: 1, dz: -1, cost: Math.SQRT2 },
  { dx: -1, dz: 1, cost: Math.SQRT2 },
  { dx: -1, dz: -1, cost: Math.SQRT2 },
];

/**
 * A* from scene-space (fromX, fromZ) to (toX, toZ).
 * Returns waypoints in scene space, or null when unreachable.
 * The last waypoint is the exact target (not the tile center).
 */
export function findPath(
  w: WorldDef,
  gateOpen: boolean,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): Waypoint[] | null {
  const start = tileOf(w, fromX, fromZ);
  const goal = tileOf(w, toX, toZ);
  if (start.tx === goal.tx && start.tz === goal.tz) {
    return [{ x: toX, z: toZ }];
  }
  if (!walkable(w, goal.tx, goal.tz, gateOpen)) {
    // Target inside a wall (shouldn't happen) — try neighbors.
    let found = false;
    for (const d of DIRS) {
      if (walkable(w, goal.tx + d.dx, goal.tz + d.dz, gateOpen)) {
        goal.tx += d.dx;
        goal.tz += d.dz;
        found = true;
        break;
      }
    }
    if (!found) return null;
  }

  const key = (tx: number, tz: number) => tx * 100000 + tz;
  const open: Node[] = [];
  const openSet = new Set<number>();
  const closed = new Set<number>();
  const heur = (tx: number, tz: number) =>
    Math.hypot(tx - goal.tx, tz - goal.tz);

  const s: Node = { tx: start.tx, tz: start.tz, g: 0, f: heur(start.tx, start.tz), parent: null };
  open.push(s);
  openSet.add(key(s.tx, s.tz));

  let iter = 0;
  let end: Node | null = null;
  while (open.length > 0 && iter++ < MAX_ITER) {
    // Pop lowest f (linear scan is fine at this grid size).
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bi].f) bi = i;
    }
    const cur = open.splice(bi, 1)[0];
    openSet.delete(key(cur.tx, cur.tz));
    if (cur.tx === goal.tx && cur.tz === goal.tz) {
      end = cur;
      break;
    }
    closed.add(key(cur.tx, cur.tz));
    for (const d of DIRS) {
      const nx = cur.tx + d.dx;
      const nz = cur.tz + d.dz;
      const nk = key(nx, nz);
      if (closed.has(nk) || openSet.has(nk)) continue;
      if (!walkable(w, nx, nz, gateOpen)) continue;
      if (d.dx !== 0 && d.dz !== 0) {
        // No corner cutting.
        if (
          !walkable(w, cur.tx + d.dx, cur.tz, gateOpen) ||
          !walkable(w, cur.tx, cur.tz + d.dz, gateOpen)
        ) {
          continue;
        }
      }
      const g = cur.g + d.cost;
      const n: Node = {
        tx: nx,
        tz: nz,
        g,
        f: g + heur(nx, nz),
        parent: cur,
      };
      open.push(n);
      openSet.add(nk);
    }
  }
  if (!end) return null;

  // Reconstruct, tile centers -> scene space.
  const tiles: Array<{ tx: number; tz: number }> = [];
  let n: Node | null = end;
  while (n) {
    tiles.push({ tx: n.tx, tz: n.tz });
    n = n.parent;
  }
  tiles.reverse();
  // Drop the start tile (we're already there).
  tiles.shift();
  const pts: Waypoint[] = tiles.map((t) => {
    const p = tileScenePos(w, t.tx, t.tz);
    return { x: p.x, z: p.z };
  });
  // End exactly on the target.
  pts.push({ x: toX, z: toZ });
  return pts;
}
