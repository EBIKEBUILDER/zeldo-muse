import {
  BreakableState,
  EnemyState,
  PickupState,
  useGameStore,
} from "../store/gameStore";
import { getMoveVector, takeAttack } from "./input";
import { SPAWN, circleHitsSolid, screenAt } from "../world/tiles";

/**
 * Stage 3 — the game simulation, run once per frame before rendering.
 *
 * Player: velocity movement with acceleration + friction, 8-way snapped
 * facing, sword swings, knockback, invulnerability, death -> respawn.
 * Enemies: wander until the player is close, then chase; contact deals
 * damage with per-enemy cooldown; knockback + hit flash; death drops
 * pickups and respawns after a while.
 * Pickups: pop out with random velocity, magnet to the player, collect.
 */

const PLAYER_R = 0.45;
const ACCEL = 55;
const MAXV = 8;
const FRICTION = 11;
const MAX_STEP = 0.1; // collision sub-step (frame-rate independent walls)

const SWING_TIME = 0.25;
const SWING_CD = 0.45;
const SWING_HIT_AT = 0.08;
const SWING_RANGE = 2.6;
const SWING_ARC = 1.05; // radians each side of facing (~60 deg)

const ENEMY_R = 0.5;
const ENEMY_SPEED = 4.2;
const ENEMY_WANDER = 1.8;
const AGGRO = 11;
const TOUCH_RANGE = 1.15;
const ENEMY_RESPAWN = 20;

function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function spawnPickup(
  id: number,
  kind: "rupee" | "heart",
  x: number,
  z: number,
): PickupState {
  const a = Math.random() * Math.PI * 2;
  const sp = 2.5 + Math.random() * 2.5;
  return { id, kind, x, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, t: 0 };
}

export function updateGame(dt: number): void {
  const st = useGameStore.getState();
  const p = st.player;

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
  }

  // ---- player movement (velocity, accel + friction) ----
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
    if (!circleHitsSolid(nx, z, PLAYER_R)) x = nx;
    else vx = 0;
    const nz = z + (vz * dt) / steps;
    if (!circleHitsSolid(x, nz, PLAYER_R)) z = nz;
    else vz = 0;
  }

  let facing = p.facing;
  if (dir.x !== 0 || dir.z !== 0) {
    facing = Math.round(Math.atan2(dir.x, -dir.z) / (Math.PI / 4)) * (Math.PI / 4);
  }

  // ---- sword hit resolution (single hit moment per swing) ----
  let enemies: EnemyState[] = st.enemies;
  let breakables: BreakableState[] = st.breakables;
  const newPickups: PickupState[] = [];
  let nextId = st.nextId;
  let rupees = st.rupees;

  if (swing.active && !swing.didHit && swing.t >= SWING_HIT_AT) {
    swing.didHit = true;
    enemies = st.enemies.map((e) => {
      if (e.dead) return e;
      const dx = e.x - x;
      const dz = e.z - z;
      const d = Math.hypot(dx, dz);
      if (d > SWING_RANGE + ENEMY_R) return e;
      if (angDiff(Math.atan2(dx, -dz), facing) > SWING_ARC) return e;
      const hp = e.hp - 1;
      const nx = d > 0.01 ? dx / d : 0;
      const nz = d > 0.01 ? dz / d : 0;
      if (hp <= 0) {
        newPickups.push(spawnPickup(nextId++, "rupee", e.x, e.z));
        if (Math.random() < 0.3) {
          newPickups.push(spawnPickup(nextId++, "heart", e.x, e.z));
        }
        return { ...e, hp: 0, dead: true, deadT: 0 };
      }
      return { ...e, hp, hurtT: 0.25, vx: e.vx + nx * 11, vz: e.vz + nz * 11 };
    });
    breakables = st.breakables.map((b) => {
      if (!b.alive) return b;
      const dx = b.x - x;
      const dz = b.z - z;
      const d = Math.hypot(dx, dz);
      if (d > SWING_RANGE) return b;
      if (angDiff(Math.atan2(dx, -dz), facing) > SWING_ARC) return b;
      if (b.kind === "grass") {
        if (Math.random() < 0.12) {
          newPickups.push(spawnPickup(nextId++, "rupee", b.x, b.z));
        }
      } else {
        newPickups.push(spawnPickup(nextId++, "rupee", b.x, b.z));
        newPickups.push(spawnPickup(nextId++, "rupee", b.x, b.z));
        if (Math.random() < 0.2) {
          newPickups.push(spawnPickup(nextId++, "heart", b.x, b.z));
        }
      }
      return { ...b, alive: false };
    });
  }

  // ---- enemies ----
  let hp = p.hp;
  enemies = enemies.map((e) => {
    if (e.dead) {
      const deadT = e.deadT + dt;
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
        };
      }
      return { ...e, deadT };
    }
    const dx = x - e.x;
    const dz = z - e.z;
    const distP = Math.hypot(dx, dz);
    let tx: number;
    let tz: number;
    let spd: number;
    let wx = e.wx;
    let wz = e.wz;
    let wanderT = e.wanderT;
    if (distP < AGGRO) {
      tx = x;
      tz = z;
      spd = ENEMY_SPEED;
    } else {
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
    }
    const ddx = tx - e.x;
    const ddz = tz - e.z;
    const dd = Math.hypot(ddx, ddz) || 1;
    const k = 1 - Math.exp(-6 * dt);
    let evx = e.vx + ((ddx / dd) * spd - e.vx) * k;
    let evz = e.vz + ((ddz / dd) * spd - e.vz) * k;
    let ex = e.x + evx * dt;
    let ez = e.z + evz * dt;
    if (circleHitsSolid(ex, ez, ENEMY_R)) {
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
      hurtT: Math.max(0, e.hurtT - dt),
      attackCd: Math.max(0, e.attackCd - dt),
    };
  });

  // Separation so enemies don't stack.
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.dead) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.dead) continue;
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

  // Contact damage.
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.dead || e.attackCd > 0 || invulnT > 0) continue;
    const d = Math.hypot(e.x - x, e.z - z);
    if (d < TOUCH_RANGE) {
      hp -= 1;
      invulnT = 1.0;
      const dd = d || 1;
      vx += ((x - e.x) / dd) * 11;
      vz += ((z - e.z) / dd) * 11;
      enemies[i] = { ...e, attackCd: 1.0 };
    }
  }

  if (hp <= 0) {
    x = SPAWN.x;
    z = SPAWN.z;
    vx = 0;
    vz = 0;
    hp = p.maxHp;
    invulnT = 2;
  }

  // ---- pickups ----
  const pickups: PickupState[] = [];
  for (const pk of [...st.pickups, ...newPickups]) {
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
      if (pk.kind === "rupee") rupees += 1;
      else hp = Math.min(p.maxHp, hp + 2);
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
  const sc = screenAt(x, z);
  const screen =
    sc.x !== st.screen.x || sc.y !== st.screen.y ? sc : st.screen;

  useGameStore.setState({
    player: { x, z, vx, vz, facing, hp, maxHp: p.maxHp, invulnT },
    screen,
    swing,
    enemies,
    pickups,
    breakables,
    rupees,
    nextId,
  });
}
