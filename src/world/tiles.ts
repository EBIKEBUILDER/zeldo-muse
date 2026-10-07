/**
 * Stage 2 — world data model.
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

export type Tile = "." | "," | "*" | "=" | "~" | "#" | "T" | "R";

const SCREEN_A = [
  "................",
  "..TT........TT..",
  "..TT........TT..",
  "................",
  "................",
  "......,,,,,,,,,,",
  "......,,,,,,,,,,",
  "................",
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
  "..TT....,,,,,,,,",
  "..TT....,,,,,,,,",
  "....TT..........",
  "......TT..TT....",
  "..TT.....TT.....",
  "..TT............",
  "................",
];

const SCREEN_E = [
  ".......,,.......",
  "................",
  "...**....**.....",
  "................",
  ".......,,.......",
  ",,,,,,,,,,,,,,,,",
  ",,,,,,,,,,,,,,,,",
  ".......,,.......",
  "................",
  ".....**...**....",
  "................",
  ".......,,.......",
];

const SCREEN_F = [
  ".......,,.......",
  "....RR..........",
  "....RR.....TT...",
  "................",
  "..TT............",
  ",,..........TT..",
  ",,..........TT..",
  "................",
  "......RR........",
  "......RR........",
  "................",
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
      throw new Error(`screen (${sx},${sz}): expected ${SCREEN_ROWS} rows, got ${rows.length}`);
    }
    rows.forEach((row, i) => {
      if (row.length !== SCREEN_COLS) {
        throw new Error(`screen (${sx},${sz}) row ${i}: expected ${SCREEN_COLS} chars, got ${row.length}`);
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

/** Screen coords containing a world position. */
export function screenAt(x: number, z: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(WORLD_SX - 1, Math.floor(x / SCREEN_PX))),
    y: Math.max(0, Math.min(WORLD_SZ - 1, Math.floor(z / SCREEN_PZ))),
  };
}

/** Spawn: screen A, tile (8, 6) — on the path, clear of trees. */
export const SPAWN = { x: 8 * TILE_SIZE + 1, z: 6 * TILE_SIZE + 1 };
