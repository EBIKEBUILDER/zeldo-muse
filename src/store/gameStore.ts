import { create } from "zustand";
import { clearAttack } from "../game/input";
import {
  DUNGEON,
  OVERWORLD,
  SPAWN,
  WorldId,
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
 *  - UI lane (hp, rupees, screen, quest, phase): React subscribes with
 *    selectors; these change rarely, so re-renders stay cheap.
 */

export type Phase = "title" | "playing" | "dead" | "victory";

export interface PlayerState {
  world: WorldId;
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
  world: WorldId;
  boss: boolean;
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
  /** Pathfinding: current A* waypoints (scene space) + next index. */
  path: Array<{ x: number; z: number }>;
  pathI: number;
  /** Countdown to next repath. */
  repathT: number;
  /** Position at the last repath (boss stuck detection baseline). */
  lastX: number;
  lastZ: number;
  /** Boss ranged attack cooldown. */
  rangedCd: number;
  /** Boss fireball telegraph: countdown while the boss charges its shot. */
  windupT: number;
  /** Mob give-up: seconds of zero progress while chasing. */
  stuckT: number;
  /** Mob give-up: walking back to its spawn point. */
  returning: boolean;
  /** §8.7 Portal leash: seconds to wait at a portal entrance when the player
   *  crossed into another world through a non-traversable portal. */
  leashT: number;
  /** Boss attack state machine. Mobs stay "chase" forever. */
  mode: BossMode;
  /** Countdown for the current mode (warn / windup / lunge / stun / aim). */
  modeT: number;
  /** Locked lunge direction (unit vector), set when the windup starts. */
  lungeDx: number;
  lungeDz: number;
  /** Cooldown before the boss may lunge again. */
  lungeCd: number;
  /** Poise: after a sword hit the boss shrugs off knockback/hitstun briefly
   *  (still takes damage). This kills the sword-spam perma-lock exploit. */
  poiseT: number;
  /** Locked ranged-attack target point (where the lobbed shot will land). */
  aimX: number;
  aimZ: number;
}

/** Boss attack modes: chase → lungeWarn → lungeWindup → lunging → stunned,
 *  plus a rangedAim branch for the lobbed fire attack. */
export type BossMode =
  | "chase"
  | "lungeWarn"
  | "lungeWindup"
  | "lunging"
  | "stunned"
  | "rangedAim";

/** Boss fireball: hostile projectile. Flat shots fly straight; lobbed shots
 *  travel a ballistic arc from (sx,sz) to (tx,tz) over dur seconds, then
 *  explode into a ground hazard of radius aoe. */
export interface ProjectileState {
  id: number;
  world: WorldId;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Age; dies at life (flat) or dur (lobbed). */
  t: number;
  life: number;
  /** Lobbed-arc fields. arc=false means the legacy flat fireball. */
  arc: boolean;
  sx: number;
  sz: number;
  tx: number;
  tz: number;
  dur: number;
  aoe: number;
}

/** Ground fire left by a lobbed boss shot: standing inside hurts. */
export interface HazardState {
  id: number;
  world: WorldId;
  x: number;
  z: number;
  /** Damage radius. */
  r: number;
  /** Age; dies at life. */
  t: number;
  life: number;
}

export interface PickupState {
  id: number;
  world: WorldId;
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
  world: WorldId;
  kind: "grass" | "pot";
  x: number;
  z: number;
  alive: boolean;
}

export interface QuestState {
  hasKey: boolean;
  gateOpen: boolean;
  chestUnlocked: boolean;
  /** Doorway teleport debounce. */
  doorCd: number;
  /** Throttle for hint toasts (locked gate / sealed chest). */
  hintCd: number;
  /** Seconds of play time (for the victory screen). */
  playTime: number;
  phase: Phase;
  /** Toast message + seconds remaining. */
  message: string;
  messageT: number;
  /** Red damage vignette timer (HUD). Set on player hurt, decays in sim. */
  hurtFlashT: number;
}

interface GameState {
  player: PlayerState;
  screen: ScreenState;
  swing: SwingState;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  hazards: HazardState[];
  pickups: PickupState[];
  breakables: BreakableState[];
  rupees: number;
  quest: QuestState;
  /** Next id for spawned pickups. */
  nextId: number;
  setPlayerPosition: (x: number, z: number) => void;
  setPlayerFacing: (facing: number) => void;
  /** Full reset + begin playing (used by title / retry). */
  startGame: () => void;
}

function initialEnemies(): EnemyState[] {
  const out: EnemyState[] = [];
  let id = 1;
  for (const w of [OVERWORLD, DUNGEON]) {
    for (const s of enemySpawns(w)) {
      out.push({
        id: id++,
        world: w.id,
        boss: s.boss,
        x: s.x,
        z: s.z,
        vx: 0,
        vz: 0,
        hp: s.boss ? 8 : 2,
        maxHp: s.boss ? 8 : 2,
        hurtT: 0,
        attackCd: 0,
        dead: false,
        deadT: 0,
        spawnX: s.x,
        spawnZ: s.z,
        wx: s.x,
        wz: s.z,
        wanderT: 0,
        path: [],
        pathI: 0,
        repathT: 0,
        lastX: s.x,
        lastZ: s.z,
        rangedCd: 0,
        windupT: 0,
        stuckT: 0,
        returning: false,
        leashT: 0,
        mode: "chase",
        modeT: 0,
        lungeDx: 0,
        lungeDz: 0,
        lungeCd: 0,
        poiseT: 0,
        aimX: s.x,
        aimZ: s.z,
      });
    }
  }
  return out;
}

function initialBreakables(): BreakableState[] {
  return [
    ...createBreakables(OVERWORLD).map((b) => ({
      ...b,
      world: OVERWORLD.id as WorldId,
      alive: true,
    })),
    ...createBreakables(DUNGEON).map((b) => ({
      ...b,
      world: DUNGEON.id as WorldId,
      alive: true,
    })),
  ];
}

function initialState() {
  return {
    player: {
      world: "overworld" as WorldId,
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
    projectiles: [] as ProjectileState[],
    hazards: [] as HazardState[],
    pickups: [] as PickupState[],
    breakables: initialBreakables(),
    rupees: 0,
    quest: {
      hasKey: false,
      gateOpen: false,
      chestUnlocked: false,
      doorCd: 0,
      hintCd: 0,
      playTime: 0,
      phase: "title" as Phase,
      message: "",
      messageT: 0,
      hurtFlashT: 0,
    } as QuestState,
    nextId: 1001,
  };
}

export const useGameStore = create<GameState>()((set) => ({
  ...initialState(),

  setPlayerPosition: (x, z) =>
    set((s) => ({ player: { ...s.player, x, z } })),

  setPlayerFacing: (facing) =>
    set((s) => ({ player: { ...s.player, facing } })),

  startGame: () => {
    clearAttack();
    const fresh = initialState();
    fresh.quest.phase = "playing";
    set(fresh);
  },
}));
