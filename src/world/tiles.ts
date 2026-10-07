/**
 * Stage 2 — world data model. Stage 3 adds spawn/breakable data.
 *
 * The overworld is a 3x2 grid of screens, each 16x12 tiles, each tile
 * 2 world units. Screens are authored as ASCII maps:
 *
 *   .  grass      (walkable)
 *   ,  path       (walkable, visual only)
 *   *  flowers    (walkable, visual only)
 *   =  bridge     (walkable, renders planks over water)
 *   ~  water      (solid)
 *   #  hedge      (solid)
 *   T  tree       (solid)
 *   R  rock       (solid)
 *   E  enemy spawn (walkable, renders as grass)
 *   P  pot        (walkable, renders a smashable pot)
 *
 * World coordinates: x in [0, 96), z in [0, 48).
 * Screen (sx, sz) covers x in [sx*32, sx*32+32), z in [sz*24, sz*24+24).
 */

export const TILE_SIZE = 2;
export const SCREEN_COLS = 16;
export const SCREEN_ROWS = 12;
export const SCREEN_PX = SCREEN_COLS * TILE_SIZE; // 32
export const SCREEN_PZ = SCREEN_ROWS * TILE_SIZE; // 24
export const WORLD_SX = 3;
export const WORLD_SZ = 2;
export const WORLD_W = WORLD_SX * SCREEN_PX; // 96
export const WORLD_H = WORLD_SZ * SCREEN_PZ; // 48

export type Tile =
  | "."
  | ","
  | "*"
  | "="
  | "~"
  | "#"
  | "T"
  | "R"
  | "E"
  | "P";

const SCREEN_A = [
  "................",
  "..TT........TT..",
  "..TT........TT..",
  "............E...",
  "................",
  "......,,,,,,,,,,",
  "......,,,,,,,,,,",
  ".....PP.........",
  "..TT........TT..",
  "..TT........TT..",
  "................",
  ".......,,.......",
];

const SCREEN_B = [
  "................",
  "................",
  ".....~~~~~~.....",
  "....~~~~~~~~....",
  "....~~~~~~~~....",
  ",,,,=====,,,,,,,",
  ",,,,=====,,,,,,,",
  "....~~~~~~~~....",
  ".....~~~~~~.....",
  "................",
  "................",
  ".......,,.......",
];

const SCREEN_C = [
  "................",
  "..#####.........",
  "..#####...TT....",
  "................",
  ".....TT.........",
  ",,..............",
  ",,..............",
  "................",
  ".........#####..",
  ".........#####..",
  "................",
  ".......,,.......",
];

const SCREEN_D = [
  ".......,,.......",
  "..TT..,,...TT...",
  "..TT.......TT...",
  "....TT..TT......",
  "......TT........",
  "..TT.E..,,,,,,,,",
  "..TT....,,,,,,,,",
  "....TT..........",
  "...E..TT..TT....",
  "..TT.....TT.....",
  "..TT........E...",
  "................",
];

const SCREEN_E = [
  ".......,,.......",
  "................",
  "...**....**.....",
  "................",
  ".......,,.E.....",
  ",,,,,,,,,,,,,,,,",
  ",,,,,,,,,,,,,,,,",
  ".......,,.......",
  "..E.............",
  ".....**P..**....",
  "................",
  ".......,,.......",
];

const SCREEN_F = [
  ".......,,.......",
  "....RR..........",
  "....RR.....TT...",
  "................",
  "..TT....E.......",
  ",,..........TT..",
  ",,..........TT..",
  "................",
  "......RR........",
  "......RR........",
  "..........E.....",
  "................",
];

/** SCREENS[sy][sx] -> 12 rows of 16 chars. */
const SCREENS: string[][][] = [
  [SCREEN_A, SCREEN_B, SCREEN_C],
  [SCREEN_D, SCREEN_E, SCREEN_F],
];

export const SCREEN_NAMES = [
  ["Home", "Pond", "Hedgefield"],
  ["Forest", "Meadow", "Rocks"],
];

// Fail fast on a malformed map (miscounted row, missing screen).
for (let sz = 0; sz < WORLD_SZ; sz++) {
  for (let sx = 0; sx < WORLD_SX; sx++) {
    const rows = SCREENS[sz][sx];
    if (rows.length !== SCREEN_ROWS) {
      throw new Error(
        `screen (${sx},${sz}): expected ${SCREEN_ROWS} rows, got ${rows.length}`,
      );
    }
    rows.forEach((row, i) => {
      if (row.length !== SCREEN_COLS) {
        throw new Error(
          `screen (${sx},${sz}) row ${i}: expected ${SCREEN_COLS} chars, got ${row.length}`,
        );
      }
    });
  }
}

/** Tile at tile coords (tx, tz). Null outside the world (treated as solid). */
export function tileAt(tx: number, tz: number): Tile | null {
  const maxTx = WORLD_SX * SCREEN_COLS;
  const maxTz = WORLD_SZ * SCREEN_ROWS;
  if (tx < 0 || tz < 0 || tx >= maxTx || tz >= maxTz) return null;
  const sx = Math.floor(tx / SCREEN_COLS);
  const sz = Math.floor(tz / SCREEN_ROWS);
  const lx = tx - sx * SCREEN_COLS;
  const lz = tz - sz * SCREEN_ROWS;
  return SCREENS[sz][sx][lz][lx] as Tile;
}

export function isSolid(t: Tile): boolean {
  return t === "~" || t === "#" || t === "T" || t === "R";
}

/** Circle-vs-tilemap collision. Null tiles (outside world) count as solid. */
export function circleHitsSolid(x: number, z: number, r: number): boolean {
  const x0 = Math.floor((x - r) / TILE_SIZE);
  const x1 = Math.floor((x + r) / TILE_SIZE);
  const z0 = Math.floor((z - r) / TILE_SIZE);
  const z1 = Math.floor((z + r) / TILE_SIZE);
  for (let tx = x0; tx <= x1; tx++) {
    for (let tz = z0; tz <= z1; tz++) {
      const t = tileAt(tx, tz);
      if (t === null || isSolid(t)) return true;
    }
  }
  return false;
}

/** Screen coords containing a world position. */
export function screenAt(x: number, z: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(WORLD_SX - 1, Math.floor(x / SCREEN_PX))),
    y: Math.max(0, Math.min(WORLD_SZ - 1, Math.floor(z / SCREEN_PZ))),
  };
}

/** Spawn: screen A, tile (8, 6) — on the path, clear of trees. */
export const SPAWN = { x: 8 * TILE_SIZE + 1, z: 6 * TILE_SIZE + 1 };

/** World-space center of every 'E' tile. */
export function enemySpawns(): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = [];
  const maxTx = WORLD_SX * SCREEN_COLS;
  const maxTz = WORLD_SZ * SCREEN_ROWS;
  for (let tx = 0; tx < maxTx; tx++) {
    for (let tz = 0; tz < maxTz; tz++) {
      if (tileAt(tx, tz) === "E") {
        out.push({ x: tx * TILE_SIZE + TILE_SIZE / 2, z: tz * TILE_SIZE + TILE_SIZE / 2 });
      }
    }
  }
  return out;
}

export interface BreakableDef {
  id: number;
  kind: "grass" | "pot";
  x: number;
  z: number;
}

/** Deterministic RNG so breakable placement is stable across loads. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pots come from 'P' map tiles; grass tufts are scattered on grass tiles
 * (22 per screen max, seeded). Called once at startup.
 */
export function createBreakables(): BreakableDef[] {
  const out: BreakableDef[] = [];
  let id = 101;
  const maxTx = WORLD_SX * SCREEN_COLS;
  const maxTz = WORLD_SZ * SCREEN_ROWS;
  for (let tx = 0; tx < maxTx; tx++) {
    for (let tz = 0; tz < maxTz; tz++) {
      if (tileAt(tx, tz) === "P") {
        out.push({
          id: id++,
          kind: "pot",
          x: tx * TILE_SIZE + TILE_SIZE / 2,
          z: tz * TILE_SIZE + TILE_SIZE / 2,
        });
      }
    }
  }
  const rng = mulberry32(1337);
  for (let sx = 0; sx < WORLD_SX; sx++) {
    for (let sz = 0; sz < WORLD_SZ; sz++) {
      let placed = 0;
      for (let tries = 0; tries < 60 && placed < 22; tries++) {
        const tx = sx * SCREEN_COLS + Math.floor(rng() * SCREEN_COLS);
        const tz = sz * SCREEN_ROWS + Math.floor(rng() * SCREEN_ROWS);
        if (tileAt(tx, tz) !== ".") continue;
        // Keep the spawn tile clear.
        const wx = tx * TILE_SIZE + TILE_SIZE / 2;
        const wz = tz * TILE_SIZE + TILE_SIZE / 2;
        if (Math.hypot(wx - SPAWN.x, wz - SPAWN.z) < 3) continue;
        out.push({ id: id++, kind: "grass", x: wx, z: wz });
        placed++;
      }
    }
  }
  return out;
}
