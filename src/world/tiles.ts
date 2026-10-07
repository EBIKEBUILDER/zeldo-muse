/**
 * Stage 4 — two worlds: the overworld and a small dungeon.
 *
 * Each world is a grid of screens authored as ASCII maps. Tile legend:
 *
 *   .  grass/stone floor (walkable)
 *   ,  path             (walkable, visual only)
 *   *  flowers          (walkable, visual only)
 *   =  bridge          (walkable, renders planks over water)
 *   ~  water           (solid)
 *   #  hedge           (solid)
 *   T  tree            (solid)
 *   R  rock            (solid)
 *   E  enemy spawn     (walkable, renders as floor)
 *   P  pot             (walkable, smashable)
 *   W  stone wall      (solid, dungeon)
 *   o  torch           (walkable decor, dungeon)
 *   D  doorway         (walkable, teleports between worlds)
 *   G  gate            (solid until opened with the key)
 *   K  key pedestal    (walkable, grants the dungeon key)
 *   C  chest           (solid, victory when opened)
 *   B  boss spawn      (walkable, renders as floor)
 *
 * The dungeon lives at a scene offset so both worlds can share one
 * Babylon scene — the camera only ever shows the player's world.
 */

export const TILE_SIZE = 2;
export const SCREEN_COLS = 16;
export const SCREEN_ROWS = 12;

export type WorldId = "overworld" | "dungeon";

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
  | "P"
  | "W"
  | "o"
  | "D"
  | "G"
  | "K"
  | "C"
  | "B";

export interface WorldDef {
  id: WorldId;
  /** Screens across / down. */
  sx: number;
  sz: number;
  /** Scene-space offset of the world's origin. */
  originX: number;
  originZ: number;
  screens: string[][][];
  names: string[][];
  theme: "grass" | "stone";
}

// ---------------------------------------------------------------- overworld

const SCREEN_A = [
  "................",
  "..TT........TT..",
  "..TT........TT..",
  "................",
  "................",
  "......,,,,,,,,,,",
  "......,,,,,,,,,,",
  ".....PP.........",
  "..TT........TT..",
  "..TT........TT..",
  "..............E.",
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
  ".............D..",
  "......RR........",
  "......RR........",
  "..........E.....",
  "................",
];

export const OVERWORLD: WorldDef = {
  id: "overworld",
  sx: 3,
  sz: 2,
  originX: 0,
  originZ: 0,
  screens: [
    [SCREEN_A, SCREEN_B, SCREEN_C],
    [SCREEN_D, SCREEN_E, SCREEN_F],
  ],
  names: [
    ["Home", "Pond", "Hedgefield"],
    ["Forest", "Meadow", "Rocks"],
  ],
  theme: "grass",
};

// ------------------------------------------------------------------ dungeon

const DUNGEON_0 = [
  "WWWWWWWWWWWWWWWW",
  "W..............W",
  "W.PP...........W",
  "W.PP.....E.....W",
  "W..........E...W",
  "W..K..........GG",
  "W......E......GG",
  "W..............W",
  "W..o........o..W",
  "W..............W",
  "W.....D........W",
  "WWWWWWWWWWWWWWWW",
];

const DUNGEON_1 = [
  "WWWWWWWWWWWWWWWW",
  "W..............W",
  "W..o........o..W",
  "W..............W",
  "W......B.......W",
  "...............W",
  "...............W",
  "W..............W",
  "W......C.......W",
  "W..............W",
  "W..............W",
  "WWWWWWWWWWWWWWWW",
];

export const DUNGEON: WorldDef = {
  id: "dungeon",
  sx: 2,
  sz: 1,
  originX: 200,
  originZ: 0,
  screens: [[DUNGEON_0, DUNGEON_1]],
  names: [["Entry", "Boss Room"]],
  theme: "stone",
};

export const WORLDS: WorldDef[] = [OVERWORLD, DUNGEON];

// Fail fast on a malformed map (miscounted row, missing screen).
for (const w of WORLDS) {
  for (let sz = 0; sz < w.sz; sz++) {
    for (let sx = 0; sx < w.sx; sx++) {
      const rows = w.screens[sz][sx];
      if (rows.length !== SCREEN_ROWS) {
        throw new Error(
          `${w.id} screen (${sx},${sz}): expected ${SCREEN_ROWS} rows, got ${rows.length}`,
        );
      }
      rows.forEach((row, i) => {
        if (row.length !== SCREEN_COLS) {
          throw new Error(
            `${w.id} screen (${sx},${sz}) row ${i}: expected ${SCREEN_COLS} chars, got ${row.length}`,
          );
        }
      });
    }
  }
}

export function screenPx(w: WorldDef): number {
  return SCREEN_COLS * TILE_SIZE;
}
export function screenPz(w: WorldDef): number {
  return SCREEN_ROWS * TILE_SIZE;
}

/** Tile at tile coords local to the world. Null outside the world. */
export function tileAtWorld(w: WorldDef, tx: number, tz: number): Tile | null {
  const maxTx = w.sx * SCREEN_COLS;
  const maxTz = w.sz * SCREEN_ROWS;
  if (tx < 0 || tz < 0 || tx >= maxTx || tz >= maxTz) return null;
  const sx = Math.floor(tx / SCREEN_COLS);
  const sz = Math.floor(tz / SCREEN_ROWS);
  const lx = tx - sx * SCREEN_COLS;
  const lz = tz - sz * SCREEN_ROWS;
  return w.screens[sz][sx][lz][lx] as Tile;
}

export function isSolid(t: Tile, gateOpen: boolean): boolean {
  if (t === "G") return !gateOpen;
  return t === "~" || t === "#" || t === "T" || t === "R" || t === "W" || t === "C";
}

/** Circle-vs-tilemap collision in scene space. */
export function circleHitsSolid(
  w: WorldDef,
  x: number,
  z: number,
  r: number,
  gateOpen: boolean,
): boolean {
  const x0 = Math.floor((x - w.originX - r) / TILE_SIZE);
  const x1 = Math.floor((x - w.originX + r) / TILE_SIZE);
  const z0 = Math.floor((z - w.originZ - r) / TILE_SIZE);
  const z1 = Math.floor((z - w.originZ + r) / TILE_SIZE);
  for (let tx = x0; tx <= x1; tx++) {
    for (let tz = z0; tz <= z1; tz++) {
      const t = tileAtWorld(w, tx, tz);
      if (t === null || isSolid(t, gateOpen)) return true;
    }
  }
  return false;
}

/** True if the circle overlaps any tile of the given kind. */
export function touchesTile(
  w: WorldDef,
  x: number,
  z: number,
  r: number,
  kind: Tile,
): boolean {
  const x0 = Math.floor((x - w.originX - r) / TILE_SIZE);
  const x1 = Math.floor((x - w.originX + r) / TILE_SIZE);
  const z0 = Math.floor((z - w.originZ - r) / TILE_SIZE);
  const z1 = Math.floor((z - w.originZ + r) / TILE_SIZE);
  for (let tx = x0; tx <= x1; tx++) {
    for (let tz = z0; tz <= z1; tz++) {
      if (tileAtWorld(w, tx, tz) === kind) return true;
    }
  }
  return false;
}

/** Scene-space center of a tile. */
export function tileScenePos(
  w: WorldDef,
  tx: number,
  tz: number,
): { x: number; z: number } {
  return {
    x: w.originX + tx * TILE_SIZE + TILE_SIZE / 2,
    z: w.originZ + tz * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** All tiles of a kind, in tile coords local to the world. */
export function findTiles(
  w: WorldDef,
  kind: Tile,
): Array<{ tx: number; tz: number }> {
  const out: Array<{ tx: number; tz: number }> = [];
  for (let tx = 0; tx < w.sx * SCREEN_COLS; tx++) {
    for (let tz = 0; tz < w.sz * SCREEN_ROWS; tz++) {
      if (tileAtWorld(w, tx, tz) === kind) out.push({ tx, tz });
    }
  }
  return out;
}

/** Screen coords (local to world) containing a scene-space position. */
export function screenAtWorld(
  w: WorldDef,
  x: number,
  z: number,
): { x: number; y: number } {
  return {
    x: Math.max(
      0,
      Math.min(w.sx - 1, Math.floor((x - w.originX) / screenPx(w))),
    ),
    y: Math.max(
      0,
      Math.min(w.sz - 1, Math.floor((z - w.originZ) / screenPz(w))),
    ),
  };
}

export function worldById(id: WorldId): WorldDef {
  return id === "dungeon" ? DUNGEON : OVERWORLD;
}

/** Spawn: overworld screen A, tile (8, 6) — on the path, clear of trees. */
export const SPAWN = { x: 8 * TILE_SIZE + 1, z: 6 * TILE_SIZE + 1 };

/** Where the overworld doorway leads (dungeon local tile 6,8). */
export const DUNGEON_SPAWN = tileScenePos(DUNGEON, 6, 8);
/** Where the dungeon doorway leads (overworld, south of the door). */
export const OVERWORLD_RETURN = tileScenePos(OVERWORLD, 45, 21);

export interface EnemySpawn {
  x: number;
  z: number;
  boss: boolean;
}

/** Enemy spawns for a world, in scene space. */
export function enemySpawns(w: WorldDef): EnemySpawn[] {
  const out: EnemySpawn[] = [];
  for (let tx = 0; tx < w.sx * SCREEN_COLS; tx++) {
    for (let tz = 0; tz < w.sz * SCREEN_ROWS; tz++) {
      const t = tileAtWorld(w, tx, tz);
      if (t === "E" || t === "B") {
        const p = tileScenePos(w, tx, tz);
        out.push({ x: p.x, z: p.z, boss: t === "B" });
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
 * in the overworld (22 per screen max, seeded). Called once at startup.
 */
export function createBreakables(w: WorldDef): BreakableDef[] {
  const out: BreakableDef[] = [];
  let id = w.id === "dungeon" ? 2001 : 101;
  const maxTx = w.sx * SCREEN_COLS;
  const maxTz = w.sz * SCREEN_ROWS;
  for (let tx = 0; tx < maxTx; tx++) {
    for (let tz = 0; tz < maxTz; tz++) {
      if (tileAtWorld(w, tx, tz) === "P") {
        const p = tileScenePos(w, tx, tz);
        out.push({ id: id++, kind: "pot", x: p.x, z: p.z });
      }
    }
  }
  if (w.id === "overworld") {
    const rng = mulberry32(1337);
    for (let sx = 0; sx < w.sx; sx++) {
      for (let sz = 0; sz < w.sz; sz++) {
        let placed = 0;
        for (let tries = 0; tries < 60 && placed < 22; tries++) {
          const tx = sx * SCREEN_COLS + Math.floor(rng() * SCREEN_COLS);
          const tz = sz * SCREEN_ROWS + Math.floor(rng() * SCREEN_ROWS);
          if (tileAtWorld(w, tx, tz) !== ".") continue;
          const p = tileScenePos(w, tx, tz);
          if (Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z) < 3) continue;
          out.push({ id: id++, kind: "grass", x: p.x, z: p.z });
          placed++;
        }
      }
    }
  }
  return out;
}
