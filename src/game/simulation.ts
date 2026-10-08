import {
  BreakableState,
  EnemyState,
  PickupState,
  ProjectileState,
  useGameStore,
} from "../store/gameStore";
import { getMoveVector, takeAttack } from "./input";
import { addTrauma, emitSpark } from "./events";
import { sfx } from "./audio";
import { findPath } from "./pathfinding";
import {
  DUNGEON_SPAWN,
  OVERWORLD_RETURN,
  SPAWN,
  WorldDef,
  circleHitsSolid,
  findTiles,
  screenAtWorld,
  tileScenePos,
  touchesTile,
  worldById,
} from "../world/tiles";

/**
 * Stage 4 — the full game simulation.
 *
 * Everything from stage 3 (movement, sword, enemies, pickups) plus the
 * quest layer: dungeon doorways, the key pedestal, the boss gate, the
 * mini-boss, the chest, and the title/dead/victory phases.
 */

const PLAYER_R = 0.45;
const ACCEL = 55;
const MAXV = 8;
const FRICTION = 11;
const MAX_STEP = 0.1;

const SWING_TIME = 0.25;
const SWING_CD = 0.45;
const SWING_HIT_AT = 0.08;
const SWING_RANGE = 2.6;
const SWING_ARC = 1.05;

const ENEMY_R = 0.5;
const ENEMY_SPEED = 4.2;
const BOSS_SPEED = 5.0;
const ENEMY_WANDER = 1.8;
const AGGRO = 11;
/** Enemies never aggro a player standing inside the spawn safe zone. */
const SPAWN_SAFE = 8;
const TOUCH_RANGE = 1.15;
const ENEMY_RESPAWN = 20;
/** Pathfinding repath cadence: the boss thinks faster. */
const BOSS_REPATH = 0.45;
const MOB_REPATH = 0.8;
/** Boss fires a surprise fireball when stuck this far from the player. */
const BOSS_STUCK_RANGE = 3.0;
const BOSS_STUCK_MOVE = 0.5;
const BOSS_RANGED_CD = 2.4;
/** Telegraph: the boss visibly charges this long before releasing the fireball. */
export const BOSS_WINDUP = 0.6;
const FIREBALL_SPEED = 9;
const FIREBALL_LIFE = 2.5;
/** Mobs give up chasing after this long making zero progress (generous: they don't quit easily). */
const MOB_GIVE_UP = 6.0;
/** Per-repath movement below this counts as "no progress" toward the player. */
const MOB_STUCK_MOVE = 0.3;
/** Inside this range the mob is fighting, not stuck — never time out in melee. */
const MOB_FIGHT_RANGE = 2.5;

function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function spawnPickup(
  id: number,
  world: WorldDef["id"],
  kind: "rupee" | "heart",
  x: number,
  z: number,
): PickupState {
  const a = Math.random() * Math.PI * 2;
  const sp = 2.5 + Math.random() * 2.5;
  return { id, world, kind, x, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, t: 0 };
}

export function updateGame(dt: number): void {
  const st = useGameStore.getState();
  if (st.quest.phase !== "playing") return;
  const p = st.player;
  const world = worldById(p.world);
  const quest = { ...st.quest };

  quest.playTime += dt;
  quest.doorCd = Math.max(0, quest.doorCd - dt);
  quest.hintCd = Math.max(0, quest.hintCd - dt);
  quest.messageT = Math.max(0, quest.messageT - dt);
  quest.hurtFlashT = Math.max(0, quest.hurtFlashT - dt);
  const say = (text: string) => {
    quest.message = text;
    quest.messageT = 3;
  };

  // ---- timers ----
  let invulnT = Math.max(0, p.invulnT - dt);
  const swing = { ...st.swing };
  swing.t += dt;
  swing.cd = Math.max(0, swing.cd - dt);
  if (swing.active && swing.t >= SWING_TIME) swing.active = false;

  if (takeAttack() && swing.cd <= 0 && !swing.active) {
    swing.active = true;
    swing.t = 0;
    swing.cd = SWING_CD;
    swing.didHit = false;
    sfx.swing();
  }

  // ---- player movement ----
  const dir = getMoveVector();
  let { vx, vz } = p;
  const moveScale = swing.active ? 0.4 : 1;
  if (dir.x !== 0 || dir.z !== 0) {
    vx += dir.x * ACCEL * moveScale * dt;
    vz += dir.z * ACCEL * moveScale * dt;
    const sp = Math.hypot(vx, vz);
    if (sp > MAXV) {
      vx = (vx / sp) * MAXV;
      vz = (vz / sp) * MAXV;
    }
  } else {
    const f = Math.exp(-FRICTION * dt);
    vx *= f;
    vz *= f;
    if (Math.hypot(vx, vz) < 0.05) {
      vx = 0;
      vz = 0;
    }
  }

  let x = p.x;
  let z = p.z;
  const travel = Math.hypot(vx * dt, vz * dt);
  const steps = Math.max(1, Math.ceil(travel / MAX_STEP));
  for (let i = 0; i < steps; i++) {
    const nx = x + (vx * dt) / steps;
    if (!circleHitsSolid(world, nx, z, PLAYER_R, quest.gateOpen)) x = nx;
    else vx = 0;
    const nz = z + (vz * dt) / steps;
    if (!circleHitsSolid(world, x, nz, PLAYER_R, quest.gateOpen)) z = nz;
    else vz = 0;
  }

  let facing = p.facing;
  if (dir.x !== 0 || dir.z !== 0) {
    // Facing = the rotation.y the visuals use. Local -z (the visual front)
    // maps to world (-sin θ, -cos θ), so facing a world direction needs
    // atan2(-dx, -dz). (The x negates because +x renders as screen-left.)
    facing = Math.round(Math.atan2(-dir.x, -dir.z) / (Math.PI / 4)) * (Math.PI / 4);
  }

  // ---- doorways ----
  let worldId = p.world;
  if (quest.doorCd <= 0 && touchesTile(world, x, z, 0.5, "D")) {
    if (world.id === "overworld") {
      worldId = "dungeon";
      x = DUNGEON_SPAWN.x;
      z = DUNGEON_SPAWN.z;
      say("The dungeon swallows you...");
    } else {
      worldId = "overworld";
      x = OVERWORLD_RETURN.x;
      z = OVERWORLD_RETURN.z;
      say("You escape into daylight.");
    }
    quest.doorCd = 1;
    vx = 0;
    vz = 0;
  }
  const wNow = worldById(worldId);

  // ---- key pedestal ----
  if (
    !quest.hasKey &&
    worldId === "dungeon" &&
    touchesTile(wNow, x, z, 0.7, "K")
  ) {
    quest.hasKey = true;
    sfx.key();
    say("You got the Dungeon Key! It hums with purpose.");
  }

  // ---- boss gate ----
  if (touchesTile(wNow, x, z, 0.6, "G")) {
    if (quest.gateOpen) {
      // walk through
    } else if (quest.hasKey) {
      quest.gateOpen = true;
      sfx.gate();
      say("The key turns! The gate grinds open.");
    } else if (quest.hintCd <= 0) {
      quest.hintCd = 4;
      say("Locked tight. A keyhole glints in the iron...");
    }
  }

  // ---- sword hit resolution ----
  let enemies: EnemyState[] = st.enemies;
  let breakables: BreakableState[] = st.breakables;
  const newPickups: PickupState[] = [];
  let nextId = st.nextId;
  let rupees = st.rupees;

  if (swing.active && !swing.didHit && swing.t >= SWING_HIT_AT) {
    swing.didHit = true;
    let hitSomething = false;
    enemies = st.enemies.map((e) => {
      if (e.dead || e.world !== worldId) return e;
      const dx = e.x - x;
      const dz = e.z - z;
      const d = Math.hypot(dx, dz);
      if (d > SWING_RANGE + ENEMY_R) return e;
      if (angDiff(Math.atan2(-dx, -dz), facing) > SWING_ARC) return e;
      hitSomething = true;
      const hp = e.hp - 1;
      const nx = d > 0.01 ? dx / d : 0;
      const nz = d > 0.01 ? dz / d : 0;
      emitSpark({ x: e.x, z: e.z, kind: "hit" });
      if (hp <= 0) {
        sfx.enemyDie();
        emitSpark({ x: e.x, z: e.z, kind: "poof" });
        newPickups.push(spawnPickup(nextId++, worldId, "rupee", e.x, e.z));
        if (e.boss) {
          quest.chestUnlocked = true;
          sfx.chest();
          say("The boss falls! Somewhere, a chest clicks open...");
          newPickups.push(spawnPickup(nextId++, worldId, "heart", e.x, e.z));
          newPickups.push(spawnPickup(nextId++, worldId, "rupee", e.x, e.z));
          newPickups.push(spawnPickup(nextId++, worldId, "rupee", e.x, e.z));
        } else if (Math.random() < 0.3) {
          newPickups.push(spawnPickup(nextId++, worldId, "heart", e.x, e.z));
        }
        return { ...e, hp: 0, dead: true, deadT: 0 };
      }
      return { ...e, hp, hurtT: 0.25, vx: e.vx + nx * 11, vz: e.vz + nz * 11 };
    });
    breakables = st.breakables.map((b) => {
      if (!b.alive || b.world !== worldId) return b;
      const dx = b.x - x;
      const dz = b.z - z;
      const d = Math.hypot(dx, dz);
      if (d > SWING_RANGE) return b;
      if (angDiff(Math.atan2(-dx, -dz), facing) > SWING_ARC) return b;
      hitSomething = true;
      emitSpark({ x: b.x, z: b.z, kind: b.kind === "grass" ? "grass" : "pot" });
      if (b.kind === "grass") {
        if (Math.random() < 0.12) {
          newPickups.push(spawnPickup(nextId++, worldId, "rupee", b.x, b.z));
        }
      } else {
        newPickups.push(spawnPickup(nextId++, worldId, "rupee", b.x, b.z));
        newPickups.push(spawnPickup(nextId++, worldId, "rupee", b.x, b.z));
        if (Math.random() < 0.2) {
          newPickups.push(spawnPickup(nextId++, worldId, "heart", b.x, b.z));
        }
      }
      return { ...b, alive: false };
    });
    if (hitSomething) sfx.swordHit();
  }

  // ---- enemies ----
  let hp = p.hp;
  const newProjectiles: ProjectileState[] = [];
  enemies = enemies.map((e) => {
    if (e.dead) {
      const deadT = e.deadT + dt;
      if (e.boss) return { ...e, deadT }; // the boss stays dead
      if (deadT > ENEMY_RESPAWN) {
        return {
          ...e,
          dead: false,
          deadT: 0,
          hp: e.maxHp,
          x: e.spawnX,
          z: e.spawnZ,
          vx: 0,
          vz: 0,
          hurtT: 0,
          attackCd: 0,
          path: [],
          pathI: 0,
          repathT: 0,
          lastX: e.spawnX,
          lastZ: e.spawnZ,
          rangedCd: 0,
          windupT: 0,
          stuckT: 0,
          returning: false,
        };
      }
      return { ...e, deadT };
    }
    const eWorld = worldById(e.world);
    const dx = x - e.x;
    const dz = z - e.z;
    const distP = Math.hypot(dx, dz);
    // The spawn point is a safe zone: enemies never aggro there, so a new
    // player always gets a fair start (an enemy once spawned inside aggro
    // range of spawn and killed idle players in seconds on fast machines).
    const distSpawn = Math.hypot(x - SPAWN.x, z - SPAWN.z);
    const seesPlayer =
      e.world === worldId && distP < AGGRO && distSpawn > SPAWN_SAFE;
    let tx: number;
    let tz: number;
    let spd: number;
    let wx = e.wx;
    let wz = e.wz;
    let wanderT = e.wanderT;
    let path = e.path;
    let pathI = e.pathI;
    let repathT = e.repathT - dt;
    let lastX = e.lastX;
    let lastZ = e.lastZ;
    let rangedCd = Math.max(0, e.rangedCd - dt);
    let windupT = Math.max(0, e.windupT - dt);
    let stuckT = e.stuckT;
    let returning = e.returning;
    // Boss fireball release: the telegraph finished this tick, so the shot
    // aims at where the player is *now* — keep moving to dodge it.
    const windupDone = e.windupT > 0 && windupT <= 0;
    if (returning) {
      // Gave up the chase: walk home, then resume normal behavior.
      const dh = Math.hypot(e.spawnX - e.x, e.spawnZ - e.z);
      if (dh < 1.2) {
        returning = false;
        stuckT = 0;
      }
      if (returning) {
        tx = e.spawnX;
        tz = e.spawnZ;
        spd = ENEMY_WANDER;
        path = [];
        pathI = 0;
      } else {
        // Just arrived home: idle a tick, normal logic resumes next tick.
        tx = e.x;
        tz = e.z;
        spd = 0;
      }
    } else if (seesPlayer) {
      spd = e.boss ? BOSS_SPEED : ENEMY_SPEED;
      // Chase with A*: repath on a cadence (the boss thinks faster, so it
      // maneuvers around obstacles more intelligently than trash mobs).
      // Throttle repath to the timer when there's no path: without this, an
      // unreachable target repathed every frame (wasteful A* spam and a
      // meaningless per-frame stuck measurement).
      if (repathT <= 0 || (path.length > 0 && pathI >= path.length)) {
        const moved = Math.hypot(e.x - lastX, e.z - lastZ);
        const interval = e.boss ? BOSS_REPATH : MOB_REPATH;
        const prevEmpty = path.length === 0;
        path = findPath(eWorld, quest.gateOpen, e.x, e.z, x, z) ?? [];
        pathI = 0;
        repathT = interval;
        lastX = e.x;
        lastZ = e.z;
        const stillEmpty = path.length === 0;
        if (e.boss) {
          // Boss stuck check: barely moved over the last repath window while
          // the player is out of reach, or no route two repaths running
          // (player somewhere the boss can't reach, e.g. a far corner) ->
          // telegraph a fireball. This keeps the boss threatening even when
          // the geometry beats its pathfinding.
          if (
            (moved < BOSS_STUCK_MOVE || (prevEmpty && stillEmpty)) &&
            distP > BOSS_STUCK_RANGE &&
            rangedCd <= 0 &&
            windupT <= 0
          ) {
            windupT = BOSS_WINDUP;
            sfx.bossCharge();
            emitSpark({ x: e.x, z: e.z, kind: "fire" });
            emitSpark({ x: e.x, z: e.z, kind: "fire" });
          }
        } else {
          // Mob stuck check: an extended period of zero progress toward the
          // player means the geometry won — give up and walk home. The bar
          // is deliberately high (mobs don't quit easily), and standing in
          // melee range never counts as stuck.
          if (moved < MOB_STUCK_MOVE && distP > MOB_FIGHT_RANGE) {
            stuckT += interval;
          } else {
            stuckT = Math.max(0, stuckT - interval * 2);
          }
          if (stuckT >= MOB_GIVE_UP) {
            returning = true;
            stuckT = 0;
            path = [];
            pathI = 0;
          }
        }
      }
      // Skip waypoints we've already reached.
      while (
        pathI < path.length &&
        Math.hypot(path[pathI].x - e.x, path[pathI].z - e.z) < 0.7
      ) {
        pathI++;
      }
      if (pathI < path.length) {
        tx = path[pathI].x;
        tz = path[pathI].z;
      } else {
        // No path (unreachable) or path exhausted: head straight in.
        tx = x;
        tz = z;
      }
      if (windupT > 0) {
        // Telegraphing: the boss plants its feet and charges the shot.
        tx = e.x;
        tz = e.z;
      }
    } else {
      // Lost sight of the player: not stuck, just wandering — reset the
      // give-up meter so a fresh chase starts clean.
      stuckT = 0;
      wanderT -= dt;
      if (wanderT <= 0 || Math.hypot(wx - e.x, wz - e.z) < 0.5) {
        const a = Math.random() * Math.PI * 2;
        const r = 2 + Math.random() * 4;
        wx = e.spawnX + Math.cos(a) * r;
        wz = e.spawnZ + Math.sin(a) * r;
        wanderT = 2 + Math.random() * 2;
      }
      tx = wx;
      tz = wz;
      spd = ENEMY_WANDER;
      path = [];
      pathI = 0;
    }
    // Boss fireball release (the telegraph just finished): hurl it at the
    // player's current position. Still only 1 damage — first boss, fair.
    if (windupDone) {
      const d = distP || 1;
      newProjectiles.push({
        id: nextId++,
        world: e.world,
        x: e.x + (dx / d) * 1.1,
        z: e.z + (dz / d) * 1.1,
        vx: (dx / d) * FIREBALL_SPEED,
        vz: (dz / d) * FIREBALL_SPEED,
        t: 0,
        life: FIREBALL_LIFE,
      });
      rangedCd = BOSS_RANGED_CD;
      sfx.bossShoot();
      emitSpark({ x: e.x, z: e.z, kind: "fire" });
      addTrauma(0.25);
    }
    const ddx = tx - e.x;
    const ddz = tz - e.z;
    const dd = Math.hypot(ddx, ddz) || 1;
    // Hitstun: a struck enemy doesn't immediately re-approach, so the
    // sword knockback reads clearly instead of being swallowed.
    const stun = e.hurtT > 0 ? 0.25 : 1;
    const k = 1 - Math.exp(-6 * dt);
    let evx = e.vx + ((ddx / dd) * spd * stun - e.vx) * k;
    let evz = e.vz + ((ddz / dd) * spd * stun - e.vz) * k;
    let ex = e.x + evx * dt;
    let ez = e.z + evz * dt;
    if (circleHitsSolid(eWorld, ex, ez, ENEMY_R, quest.gateOpen)) {
      ex = e.x;
      ez = e.z;
      evx = 0;
      evz = 0;
    }
    return {
      ...e,
      x: ex,
      z: ez,
      vx: evx,
      vz: evz,
      wx,
      wz,
      wanderT,
      path,
      pathI,
      repathT,
      lastX,
      lastZ,
      rangedCd,
      windupT,
      stuckT,
      returning,
      hurtT: Math.max(0, e.hurtT - dt),
      attackCd: Math.max(0, e.attackCd - dt),
    };
  });

  // Separation so enemies don't stack (same world only).
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.dead) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.dead || b.world !== a.world) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.1 && d > 0.001) {
        const push = (1.1 - d) / 2;
        const px = (dx / d) * push;
        const pz = (dz / d) * push;
        enemies[i] = { ...a, x: a.x - px, z: a.z - pz };
        enemies[j] = { ...b, x: b.x + px, z: b.z + pz };
      }
    }
  }

  // Solid bodies: the player and enemies can't overlap. Without this,
  // fighters stack directly on top of each other, which reads as a bug.
  // The player is shoved out (enemies are heavy); if the player is pinned
  // against a wall, the enemy gives way instead.
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.dead || e.world !== worldId) continue;
    let dx = x - e.x;
    let dz = z - e.z;
    let d = Math.hypot(dx, dz);
    const minD = PLAYER_R + ENEMY_R;
    if (d >= minD) continue;
    if (d < 0.001) {
      dx = 1;
      dz = 0;
      d = 1;
    }
    const push = minD - d;
    const px = (dx / d) * push;
    const pz = (dz / d) * push;
    const nx = x + px;
    const nz = z + pz;
    if (!circleHitsSolid(wNow, nx, nz, PLAYER_R, quest.gateOpen)) {
      x = nx;
      z = nz;
    } else {
      const ex = e.x - px;
      const ez = e.z - pz;
      if (!circleHitsSolid(worldById(e.world), ex, ez, ENEMY_R, quest.gateOpen)) {
        enemies[i] = { ...e, x: ex, z: ez };
      }
    }
  }

  // Contact damage.
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.dead || e.world !== worldId || e.attackCd > 0 || invulnT > 0) continue;
    const d = Math.hypot(e.x - x, e.z - z);
    if (d < TOUCH_RANGE) {
      hp -= e.boss ? 2 : 1;
      invulnT = 1.0;
      quest.hurtFlashT = 0.35;
      addTrauma(0.55);
      sfx.hurt();
      const dd = d || 1;
      vx += ((x - e.x) / dd) * 11;
      vz += ((z - e.z) / dd) * 11;
      enemies[i] = { ...e, attackCd: 1.0 };
    }
  }

  if (hp <= 0) {
    quest.phase = "dead";
    hp = 0;
  }

  // ---- boss fireballs ----
  const projectiles: ProjectileState[] = [];
  for (const pr of [...st.projectiles, ...newProjectiles]) {
    const t = pr.t + dt;
    if (t > pr.life) continue;
    const nx = pr.x + pr.vx * dt;
    const nz = pr.z + pr.vz * dt;
    const pw = worldById(pr.world);
    if (circleHitsSolid(pw, nx, nz, 0.25, quest.gateOpen)) {
      emitSpark({ x: nx, z: nz, kind: "fire" });
      sfx.fireHit();
      continue;
    }
    if (pr.world === worldId && invulnT <= 0) {
      const d = Math.hypot(nx - x, nz - z);
      if (d < PLAYER_R + 0.35) {
        hp -= 1;
        invulnT = 1.0;
        quest.hurtFlashT = 0.35;
        addTrauma(0.5);
        sfx.hurt();
        sfx.fireHit();
        emitSpark({ x: nx, z: nz, kind: "fire" });
        const dd = d || 1;
        vx += ((x - nx) / dd) * 9;
        vz += ((z - nz) / dd) * 9;
        continue;
      }
    }
    projectiles.push({ ...pr, x: nx, z: nz, t });
  }

  // ---- chest: victory ----
  if (quest.phase === "playing" && worldId === "dungeon") {
    const chestTiles = findTiles(wNow, "C");
    if (chestTiles.length > 0) {
      const cp = tileScenePos(wNow, chestTiles[0].tx, chestTiles[0].tz);
      const d = Math.hypot(cp.x - x, cp.z - z);
      if (d < 2.2) {
        if (quest.chestUnlocked) {
          quest.phase = "victory";
          sfx.victory();
        } else if (quest.hintCd <= 0) {
          quest.hintCd = 4;
          say("Sealed by dark magic... the boss must fall first.");
        }
      }
    }
  }

  // ---- pickups ----
  const pickups: PickupState[] = [];
  for (const pk of [...st.pickups, ...newPickups]) {
    if (pk.world !== worldId) {
      pickups.push(pk);
      continue;
    }
    const t = pk.t + dt;
    if (t > 60) continue;
    let pvx = pk.vx;
    let pvz = pk.vz;
    let px = pk.x;
    let pz = pk.z;
    const dx = x - px;
    const dz = z - pz;
    const d = Math.hypot(dx, dz);
    if (d < 0.9) {
      if (pk.kind === "rupee") {
        rupees += 1;
        sfx.rupee();
      } else {
        hp = Math.min(p.maxHp, hp + 2);
        sfx.heart();
      }
      continue;
    }
    if (d < 3.5 && d > 0.01) {
      pvx += (dx / d) * 28 * dt;
      pvz += (dz / d) * 28 * dt;
      const s = Math.hypot(pvx, pvz);
      if (s > 9) {
        pvx = (pvx / s) * 9;
        pvz = (pvz / s) * 9;
      }
    } else {
      const f = Math.exp(-6 * dt);
      pvx *= f;
      pvz *= f;
    }
    px += pvx * dt;
    pz += pvz * dt;
    pickups.push({ ...pk, x: px, z: pz, vx: pvx, vz: pvz, t });
  }

  // ---- screen tracking ----
  const sc = screenAtWorld(wNow, x, z);
  const screen =
    sc.x !== st.screen.x || sc.y !== st.screen.y ? sc : st.screen;

  useGameStore.setState({
    player: { world: worldId, x, z, vx, vz, facing, hp, maxHp: p.maxHp, invulnT },
    screen,
    swing,
    enemies,
    projectiles,
    pickups,
    breakables,
    rupees,
    quest,
    nextId,
  });
}
