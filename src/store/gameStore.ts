import { create } from "zustand";
import {
  SPAWN,
  createBreakables,
  enemySpawns,
} from "../world/tiles";

/**
 * Zeldo game state — the single source of truth for the simulation.
 *
 * Everything in here is plain serializable data (no Babylon objects).
 * Babylon is a *view* over this state: the render loop runs the simulation
 * (which mutates the store via setState) and then moves meshes to match.
 *
 * Two lanes:
 *  - Hot lane (positions, velocities, swing, enemies, pickups): read
 *    directly in the render loop via getState(). Never subscribe a React
 *    component to these at 60fps.
 *  - UI lane (hp, rupees, screen): React subscribes with selectors; these
 *    change rarely, so re-renders stay cheap.
 */

export interface PlayerState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Y rotation in radians. 0 faces "up-screen" (-z). Snapped to 8-way. */
  facing: number;
  /** Half-hearts. */
  hp: number;
  maxHp: number;
  /** Seconds of post-hit invulnerability remaining. */
  invulnT: number;
}

export interface ScreenState {
  x: number;
  y: number;
}

export interface SwingState {
  active: boolean;
  /** Seconds since the swing started. */
  t: number;
  /** Cooldown before the next swing may start. */
  cd: number;
  /** Whether the hit moment has been resolved for this swing. */
  didHit: boolean;
}

export interface EnemyState {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  hp: number;
  maxHp: number;
  /** Hit-flash timer. */
  hurtT: number;
  /** Cooldown before it may damage the player again. */
  attackCd: number;
  dead: boolean;
  deadT: number;
  spawnX: number;
  spawnZ: number;
  /** Wander target + timer. */
  wx: number;
  wz: number;
  wanderT: number;
}

export interface PickupState {
  id: number;
  kind: "rupee" | "heart";
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Age in seconds; despawns when old. */
  t: number;
}

export interface BreakableState {
  id: number;
  kind: "grass" | "pot";
  x: number;
  z: number;
  alive: boolean;
}

interface GameState {
  player: PlayerState;
  screen: ScreenState;
  swing: SwingState;
  enemies: EnemyState[];
  pickups: PickupState[];
  breakables: BreakableState[];
  rupees: number;
  /** Next id for spawned pickups. */
  nextId: number;
  setPlayerPosition: (x: number, z: number) => void;
  setPlayerFacing: (facing: number) => void;
  reset: () => void;
}

function initialEnemies(): EnemyState[] {
  return enemySpawns().map((s, i) => ({
    id: i + 1,
    x: s.x,
    z: s.z,
    vx: 0,
    vz: 0,
    hp: 2,
    maxHp: 2,
    hurtT: 0,
    attackCd: 0,
    dead: false,
    deadT: 0,
    spawnX: s.x,
    spawnZ: s.z,
    wx: s.x,
    wz: s.z,
    wanderT: 0,
  }));
}

function initialBreakables(): BreakableState[] {
  return createBreakables().map((b) => ({ ...b, alive: true }));
}

function initialState() {
  return {
    player: {
      x: SPAWN.x,
      z: SPAWN.z,
      vx: 0,
      vz: 0,
      facing: 0,
      hp: 6,
      maxHp: 6,
      invulnT: 0,
    } as PlayerState,
    screen: { x: 0, y: 0 } as ScreenState,
    swing: { active: false, t: 0, cd: 0, didHit: false } as SwingState,
    enemies: initialEnemies(),
    pickups: [] as PickupState[],
    breakables: initialBreakables(),
    rupees: 0,
    nextId: 1001,
  };
}

export const useGameStore = create<GameState>()((set) => ({
  ...initialState(),

  setPlayerPosition: (x, z) =>
    set((s) => ({ player: { ...s.player, x, z } })),

  setPlayerFacing: (facing) =>
    set((s) => ({ player: { ...s.player, facing } })),

  reset: () => set(initialState()),
}));
