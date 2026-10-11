import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
} from "@babylonjs/core";
import { makeFlatMaterial } from "./materials";
import { drainSparks, SparkKind } from "./events";
import {
  BreakableState,
  useGameStore,
} from "../store/gameStore";
import { DUNGEON, findTiles, tileScenePos } from "../world/tiles";
import {
  AOE_R,
  BOSS_WINDUP,
  LOB_HEIGHT,
  LUNGE_DIST,
  LUNGE_WARN,
  LUNGE_WINDUP,
  RANGED_AIM,
  STUN_TIME,
} from "./simulation";

/**
 * Stage 4 — Babylon meshes for the simulated actors.
 * The simulation owns the state; this module only mirrors it into meshes.
 */

export function createActorSync(scene: Scene, shadowGen: ShadowGenerator) {
  const enemyMeshes = new Map<
    number,
    { root: TransformNode; bodyMat: StandardMaterial }
  >();
  const pickupMeshes = new Map<number, TransformNode>();
  const projectileMeshes = new Map<number, Mesh>();
  const hazardMeshes = new Map<number, Mesh>();
  const fireballMat = makeFlatMaterial(scene, "fireballMat", new Color3(1, 0.42, 0.1));
  fireballMat.emissiveColor = new Color3(1, 0.3, 0.05);

  // --- Boss telegraphs: ground decals, reused every frame ---
  const laneMat = makeFlatMaterial(scene, "laneMat", new Color3(1, 0.55, 0.12));
  laneMat.alpha = 0.38;
  laneMat.emissiveColor = new Color3(0.9, 0.4, 0.08);
  const lungeLane = MeshBuilder.CreateBox(
    "lungeLane",
    { width: 1.7, height: 0.05, depth: LUNGE_DIST },
    scene,
  );
  lungeLane.material = laneMat;
  lungeLane.setEnabled(false);

  const targetMat = makeFlatMaterial(scene, "targetMat", new Color3(1, 0.3, 0.12));
  targetMat.alpha = 0.55;
  targetMat.emissiveColor = new Color3(0.9, 0.2, 0.08);
  const targetDisc = MeshBuilder.CreateDisc(
    "targetDisc",
    { radius: 0.55, tessellation: 24 },
    scene,
  );
  targetDisc.rotation.x = Math.PI / 2;
  targetDisc.material = targetMat;
  targetDisc.setEnabled(false);

  const aoeMat = makeFlatMaterial(scene, "aoeMat", new Color3(1, 0.4, 0.1));
  aoeMat.alpha = 0.28;
  aoeMat.emissiveColor = new Color3(0.8, 0.25, 0.05);
  const aoeDisc = MeshBuilder.CreateDisc(
    "aoeDisc",
    { radius: AOE_R, tessellation: 32 },
    scene,
  );
  aoeDisc.rotation.x = Math.PI / 2;
  aoeDisc.material = aoeMat;
  aoeDisc.setEnabled(false);

  // --- Telegraph outlines: bright rims around the telegraph fills ---
  const laneRimMat = makeFlatMaterial(scene, "laneRimMat", new Color3(1, 0.85, 0.25));
  laneRimMat.emissiveColor = new Color3(1, 0.7, 0.15);
  laneRimMat.alpha = 0.85;
  const laneOutline = new TransformNode("laneOutline", scene);
  {
    // 4 thin boxes forming the lane perimeter, relative to lane center.
    const t = 0.14;
    const h = 0.06;
    const mkRim = (name: string, w: number, d: number, px: number, pz: number) => {
      const rim = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
      rim.position.set(px, 0, pz);
      rim.material = laneRimMat;
      rim.parent = laneOutline;
    };
    mkRim("laneRimL", t, LUNGE_DIST, -1.7 / 2, 0);
    mkRim("laneRimR", t, LUNGE_DIST, 1.7 / 2, 0);
    mkRim("laneRimF", 1.7 + 2 * t, t, 0, -LUNGE_DIST / 2);
    mkRim("laneRimB", 1.7 + 2 * t, t, 0, LUNGE_DIST / 2);
  }
  laneOutline.setEnabled(false);

  const targetRimMat = makeFlatMaterial(scene, "targetRimMat", new Color3(1, 0.45, 0.15));
  targetRimMat.emissiveColor = new Color3(1, 0.3, 0.08);
  targetRimMat.alpha = 0.9;
  const targetRim = MeshBuilder.CreateTorus(
    "targetRim",
    { diameter: 1.1, thickness: 0.08, tessellation: 32 },
    scene,
  );
  // Note: Babylon's torus already lies flat in the XZ plane (no rotation
  // needed — rotating it stands it up like an arch out of the ground).
  targetRim.material = targetRimMat;
  targetRim.setEnabled(false);

  const aoeRim = MeshBuilder.CreateTorus(
    "aoeRim",
    { diameter: AOE_R * 2, thickness: 0.09, tessellation: 40 },
    scene,
  );
  aoeRim.material = targetRimMat;
  aoeRim.setEnabled(false);

  const fireMat = makeFlatMaterial(scene, "fireMat", new Color3(1, 0.45, 0.08));
  fireMat.alpha = 0.6;
  fireMat.emissiveColor = new Color3(1, 0.35, 0.05);

  // --- Sword: hidden pivot, blade sweeps during the swing ---
  const swordPivot = new TransformNode("swordPivot", scene);
  const bladeMat = makeFlatMaterial(scene, "bladeMat", new Color3(0.88, 0.91, 0.95));
  bladeMat.emissiveColor = new Color3(0.12, 0.13, 0.15);
  // Tapered blade: box + pyramid tip.
  const blade = MeshBuilder.CreateBox(
    "blade",
    { width: 0.16, height: 0.07, depth: 1.0 },
    scene,
  );
  blade.position.set(0, 0, -0.95);
  blade.material = bladeMat;
  blade.parent = swordPivot;
  const tip = MeshBuilder.CreateCylinder(
    "bladeTip",
    { diameterTop: 0.02, diameterBottom: 0.16, height: 0.35, tessellation: 4 },
    scene,
  );
  tip.rotation.x = Math.PI / 2;
  tip.position.set(0, 0, -1.62);
  tip.material = bladeMat;
  tip.parent = swordPivot;
  const guard = MeshBuilder.CreateBox(
    "guard",
    { width: 0.55, height: 0.09, depth: 0.14 },
    scene,
  );
  guard.position.set(0, 0, -0.42);
  guard.material = makeFlatMaterial(scene, "guardMat", new Color3(0.85, 0.65, 0.25));
  guard.parent = swordPivot;
  const grip = MeshBuilder.CreateCylinder(
    "grip",
    { diameterTop: 0.09, diameterBottom: 0.09, height: 0.35, tessellation: 6 },
    scene,
  );
  grip.rotation.x = Math.PI / 2;
  grip.position.set(0, 0, -0.2);
  grip.material = makeFlatMaterial(scene, "gripMat", new Color3(0.35, 0.22, 0.12));
  grip.parent = swordPivot;
  swordPivot.setEnabled(false);
  shadowGen.addShadowCaster(blade);

  // --- Interactive quest pieces (gates, key pedestal, chest) ---
  const gateMeshes: TransformNode[] = [];
  const ironM = makeFlatMaterial(scene, "ironMat", new Color3(0.22, 0.22, 0.28));
  for (const { tx, tz } of findTiles(DUNGEON, "G")) {
    const { x, z } = tileScenePos(DUNGEON, tx, tz);
    const gate = new TransformNode(`gate-${tx}-${tz}`, scene);
    const bars = MeshBuilder.CreateBox(`gatebars-${tx}-${tz}`, { width: 1.9, height: 2.0, depth: 0.35 }, scene);
    bars.position.set(0, 1.0, 0);
    bars.material = ironM;
    bars.parent = gate;
    const top = MeshBuilder.CreateBox(`gatetop-${tx}-${tz}`, { width: 1.9, height: 0.25, depth: 0.5 }, scene);
    top.position.set(0, 2.1, 0);
    top.material = ironM;
    top.parent = gate;
    gate.position.set(x, 0, z);
    // Gates sit in the east wall (doorway runs north-south), so rotate 90°
    // to seal the opening instead of lying parallel to it.
    gate.rotation.y = Math.PI / 2;
    shadowGen.addShadowCaster(bars);
    gateMeshes.push(gate);
  }

  const keyTiles = findTiles(DUNGEON, "K");
  const keyAnchor =
    keyTiles.length > 0 ? tileScenePos(DUNGEON, keyTiles[0].tx, keyTiles[0].tz) : null;
  let keyFloat: TransformNode | null = null;
  if (keyAnchor) {
    const ped = MeshBuilder.CreateCylinder(
      "keypedestal",
      { diameterTop: 0.9, diameterBottom: 1.1, height: 1.0, tessellation: 8 },
      scene,
    );
    ped.position.set(keyAnchor.x, 0.5, keyAnchor.z);
    ped.material = makeFlatMaterial(scene, "pedMat", new Color3(0.5, 0.5, 0.55));
    shadowGen.addShadowCaster(ped);
    keyFloat = new TransformNode("keyfloat", scene);
    const keyMesh = MeshBuilder.CreateIcoSphere("keymesh", { radius: 0.3, subdivisions: 0 }, scene);
    const goldM = makeFlatMaterial(scene, "goldMat", new Color3(1, 0.8, 0.2));
    goldM.emissiveColor = new Color3(0.5, 0.35, 0.05);
    keyMesh.material = goldM;
    keyMesh.scaling.y = 1.6;
    keyMesh.parent = keyFloat;
    keyFloat.position.set(keyAnchor.x, 1.6, keyAnchor.z);
  }

  const chestTiles = findTiles(DUNGEON, "C");
  const chestAnchor =
    chestTiles.length > 0 ? tileScenePos(DUNGEON, chestTiles[0].tx, chestTiles[0].tz) : null;
  let chestLid: TransformNode | null = null;
  if (chestAnchor) {
    const base = MeshBuilder.CreateBox("chestbase", { width: 1.6, height: 0.8, depth: 1.1 }, scene);
    base.position.set(chestAnchor.x, 0.4, chestAnchor.z);
    base.material = makeFlatMaterial(scene, "chestMat", new Color3(0.45, 0.3, 0.15));
    shadowGen.addShadowCaster(base);
    const goldTrim = makeFlatMaterial(scene, "chestGold", new Color3(0.85, 0.65, 0.2));
    goldTrim.emissiveColor = new Color3(0.25, 0.18, 0.03);
    chestLid = new TransformNode("chestlid", scene);
    const lid = MeshBuilder.CreateBox("chestlidmesh", { width: 1.6, height: 0.3, depth: 1.1 }, scene);
    lid.position.set(0, 0.15, -0.55);
    lid.material = goldTrim;
    lid.parent = chestLid;
    // Hinge at the back (+z) edge of the chest.
    chestLid.position.set(chestAnchor.x, 0.85, chestAnchor.z + 0.55);
  }

  const rupeeMat = makeFlatMaterial(scene, "rupeeMat", new Color3(0.2, 0.85, 0.3));
  rupeeMat.emissiveColor = new Color3(0.1, 0.4, 0.15);
  const heartMat = makeFlatMaterial(scene, "heartMat", new Color3(0.9, 0.2, 0.25));
  heartMat.emissiveColor = new Color3(0.35, 0.08, 0.1);

  // --- Hit particles: Zeldo-style impact sparks, debris, death poofs ---
  interface Particle {
    mesh: TransformNode;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
  }
  const particles: Particle[] = [];
  const sparkMats = new Map<SparkKind, StandardMaterial>();
  function sparkMat(kind: SparkKind): StandardMaterial {
    let m = sparkMats.get(kind);
    if (!m) {
      const color =
        kind === "hit"
          ? new Color3(1, 0.95, 0.55)
          : kind === "grass"
            ? new Color3(0.35, 0.65, 0.3)
            : kind === "pot"
              ? new Color3(0.78, 0.48, 0.28)
              : kind === "fire"
                ? new Color3(1, 0.35, 0.08)
                : new Color3(0.92, 0.92, 0.95);
      m = makeFlatMaterial(scene, `sparkMat-${kind}`, color);
      m.emissiveColor = color.scale(0.6);
      sparkMats.set(kind, m);
    }
    return m;
  }
  function spawnSparks(x: number, z: number, kind: SparkKind): void {
    const n = kind === "poof" ? 7 : 5;
    const speed = kind === "hit" ? 7 : 4.5;
    const size = kind === "poof" ? 0.22 : 0.15;
    for (let i = 0; i < n; i++) {
      const mesh = new TransformNode(`spark-${clock.toFixed(3)}-${i}`, scene);
      const bit = MeshBuilder.CreateBox(
        `sparkbit-${clock.toFixed(3)}-${i}`,
        { size },
        scene,
      );
      bit.material = sparkMat(kind);
      bit.parent = mesh;
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      mesh.position.set(x, 0.8, z);
      particles.push({
        mesh,
        vx: Math.cos(a) * sp,
        vy: 2 + Math.random() * 3.5,
        vz: Math.sin(a) * sp,
        life: 0.28 + Math.random() * 0.14,
        maxLife: 0.42,
      });
    }
  }
  function updateParticles(dt: number): void {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.dispose();
        particles.splice(i, 1);
        continue;
      }
      p.vy -= 14 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.08, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      const s = Math.max(0.01, p.life / p.maxLife);
      p.mesh.scaling.set(s, s, s);
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 8;
    }
  }

  let clock = 0;

  function syncEnemies() {
    const { enemies } = useGameStore.getState();
    const seen = new Set<number>();
    for (const e of enemies) {
      if (e.dead && e.deadT > 0.25) {
        const rec = enemyMeshes.get(e.id);
        if (rec) {
          rec.root.dispose();
          enemyMeshes.delete(e.id);
        }
        continue;
      }
      seen.add(e.id);
      let rec = enemyMeshes.get(e.id);
      if (!rec) {
        const root = new TransformNode(`enemy-${e.id}`, scene);
        const r = e.boss ? 0.95 : 0.55;
        const body = MeshBuilder.CreateIcoSphere(
          `ebody-${e.id}`,
          { radius: r, subdivisions: 2 },
          scene,
        );
        body.position.y = r * 0.9;
        body.scaling.y = 0.85;
        const bodyMat = makeFlatMaterial(
          scene,
          `ebodyMat-${e.id}`,
          e.boss ? new Color3(0.5, 0.1, 0.32) : new Color3(0.72, 0.22, 0.2),
        );
        body.material = bodyMat;
        body.parent = root;
        // Angry eyes: white with red pupils, angled inward.
        const eyeWhite = makeFlatMaterial(scene, `eeyeW-${e.id}`, new Color3(1, 1, 1));
        const pupilMat = makeFlatMaterial(scene, `eeyeP-${e.id}`, new Color3(0.7, 0.08, 0.08));
        const eyeOff = r * 0.36;
        for (const sx of [-eyeOff, eyeOff]) {
          const eye = MeshBuilder.CreateSphere(
            `eeye-${e.id}-${sx}`,
            { diameter: r * 0.32, segments: 12 },
            scene,
          );
          eye.position.set(sx, r * 1.08, -r * 0.7);
          eye.rotation.z = sx < 0 ? 0.25 : -0.25;
          eye.material = eyeWhite;
          eye.parent = root;
          const pupil = MeshBuilder.CreateSphere(
            `epupil-${e.id}-${sx}`,
            { diameter: r * 0.15, segments: 12 },
            scene,
          );
          pupil.position.set(sx * 0.92, r * 1.06, -r * 0.86);
          pupil.material = pupilMat;
          pupil.parent = root;
        }
        // Horns: little cones on top (boss gets a crown of them).
        const hornMat = makeFlatMaterial(
          scene,
          `ehorn-${e.id}`,
          e.boss ? new Color3(0.95, 0.75, 0.25) : new Color3(0.9, 0.85, 0.7),
        );
        const hornCount = e.boss ? 5 : 2;
        for (let hi = 0; hi < hornCount; hi++) {
          const hx = e.boss ? (hi - 2) * r * 0.42 : (hi === 0 ? -r * 0.45 : r * 0.45);
          const horn = MeshBuilder.CreateCylinder(
            `ehorn-${e.id}-${hi}`,
            {
              diameterTop: 0.02,
              diameterBottom: r * (e.boss ? 0.22 : 0.28),
              height: r * (e.boss ? 0.7 : 0.55),
              tessellation: 5,
            },
            scene,
          );
          horn.position.set(hx, r * (e.boss ? 1.75 : 1.55), r * 0.1);
          horn.rotation.z = e.boss ? (hi - 2) * -0.18 : (hi === 0 ? 0.3 : -0.3);
          horn.material = hornMat;
          horn.parent = root;
        }
        shadowGen.addShadowCaster(body);
        rec = { root, bodyMat };
        enemyMeshes.set(e.id, rec);
      }
      rec.root.position.set(e.x, 0, e.z);
      const sp = Math.hypot(e.vx, e.vz);
      if (sp > 0.5) rec.root.rotation.y = Math.atan2(-e.vx, -e.vz);
      // Boss attack telegraphs, driven by the mode machine:
      // warn = red flash, windup/aim = orange swell, lunging = stretched,
      // stunned = gray wobble (punish window).
      const bmode = e.boss ? e.mode : "chase";
      const winding = bmode === "lungeWindup" || bmode === "rangedAim";
      const windupTotal = bmode === "rangedAim" ? RANGED_AIM : LUNGE_WINDUP;
      const windupP = winding ? 1 - e.modeT / windupTotal : 0;
      const swell = 1 + windupP * 0.14;
      const stretch = bmode === "lunging" ? 1.25 : 1;
      const pop = (1 + Math.max(0, e.hurtT) * 1.5) * swell;
      const shrink = e.dead ? Math.max(0.01, 1 - e.deadT / 0.25) : 1;
      rec.root.scaling.set(pop * shrink * stretch, (pop * shrink) / stretch, pop * shrink * stretch);
      // Stunned wobble: the boss lists to one side, dazed.
      rec.root.rotation.z = bmode === "stunned" ? Math.sin(clock * 7) * 0.12 : 0;
      if (e.hurtT > 0) {
        rec.bodyMat.emissiveColor = new Color3(0.7, 0.7, 0.7);
      } else if (bmode === "lungeWarn") {
        const flash = 0.5 + 0.5 * Math.sin(clock * 30);
        rec.bodyMat.emissiveColor = new Color3(1.6 * flash, 0.08 * flash, 0.08 * flash);
      } else if (winding) {
        const flick = 0.75 + 0.25 * Math.sin(clock * 26);
        const g = (0.35 + 0.65 * windupP) * flick;
        rec.bodyMat.emissiveColor = new Color3(1.4 * g, 0.32 * g, 0.05 * g);
      } else if (bmode === "lunging") {
        rec.bodyMat.emissiveColor = new Color3(0.9, 0.25, 0.05);
      } else if (bmode === "stunned") {
        rec.bodyMat.emissiveColor = new Color3(0.25, 0.25, 0.3);
      } else {
        rec.bodyMat.emissiveColor = new Color3(0, 0, 0);
      }
    }
    for (const [id, rec] of enemyMeshes) {
      if (!seen.has(id)) {
        rec.root.dispose();
        enemyMeshes.delete(id);
      }
    }
  }

  function syncPickups() {
    const { pickups } = useGameStore.getState();
    const seen = new Set<number>();
    for (const pk of pickups) {
      seen.add(pk.id);
      let root = pickupMeshes.get(pk.id);
      if (!root) {
        root = new TransformNode(`pickup-${pk.id}`, scene);
        const m =
          pk.kind === "rupee"
            ? MeshBuilder.CreateIcoSphere(
                `rm-${pk.id}`,
                { radius: 0.28, subdivisions: 0 },
                scene,
              )
            : MeshBuilder.CreateSphere(
                `hm-${pk.id}`,
                { diameter: 0.55, segments: 8 },
                scene,
              );
        if (pk.kind === "rupee") m.scaling.y = 1.5;
        else m.scaling.y = 0.8;
        m.material = pk.kind === "rupee" ? rupeeMat : heartMat;
        m.parent = root;
        shadowGen.addShadowCaster(m);
        pickupMeshes.set(pk.id, root);
      }
      root.position.set(pk.x, 0.45 + Math.sin(clock * 4 + pk.id) * 0.12, pk.z);
      root.rotation.y = clock * 2 + pk.id;
    }
    for (const [id, root] of pickupMeshes) {
      if (!seen.has(id)) {
        root.dispose();
        pickupMeshes.delete(id);
      }
    }
  }

  function syncSword() {
    const { swing, player } = useGameStore.getState();
    if (!swing.active) {
      swordPivot.setEnabled(false);
      return;
    }
    swordPivot.setEnabled(true);
    const k = Math.min(1, swing.t / 0.25);
    const ease = 1 - Math.pow(1 - k, 3);
    swordPivot.position.set(player.x, 1.0, player.z);
    swordPivot.rotation.y = player.facing - 1.25 + ease * 2.5;
  }

  function syncQuest() {
    const { quest } = useGameStore.getState();
    for (const g of gateMeshes) g.setEnabled(!quest.gateOpen);
    if (keyFloat) {
      keyFloat.setEnabled(!quest.hasKey);
      keyFloat.rotation.y = clock * 1.5;
      keyFloat.position.y = 1.6 + Math.sin(clock * 2.5) * 0.15;
    }
    if (chestLid) {
      const target = quest.chestUnlocked ? -1.9 : 0;
      chestLid.rotation.x += (target - chestLid.rotation.x) * 0.15;
    }
  }

  function syncProjectiles() {
    const { projectiles, player } = useGameStore.getState();
    const seen = new Set<number>();
    for (const pr of projectiles) {
      if (pr.world !== player.world) continue;
      seen.add(pr.id);
      let mesh = projectileMeshes.get(pr.id);
      if (!mesh) {
        mesh = MeshBuilder.CreateSphere(
          `fireball-${pr.id}`,
          { diameter: 0.55, segments: 8 },
          scene,
        );
        mesh.material = fireballMat;
        projectileMeshes.set(pr.id, mesh);
      }
      // Lobbed shots ride a ballistic arc; flat shots skim low.
      const y = pr.arc
        ? 0.9 + Math.sin(Math.PI * Math.min(1, pr.t / pr.dur)) * LOB_HEIGHT
        : 0.9;
      mesh.position.set(pr.x, y, pr.z);
      // Pulse: growing threat as it flies.
      const s = 1 + Math.sin(clock * 18) * 0.18;
      mesh.scaling.set(s, s, s);
    }
    for (const [id, mesh] of projectileMeshes) {
      if (!seen.has(id)) {
        mesh.dispose();
        projectileMeshes.delete(id);
      }
    }
  }

  function syncHazards() {
    const { hazards, player } = useGameStore.getState();
    const seen = new Set<number>();
    for (const h of hazards) {
      if (h.world !== player.world) continue;
      seen.add(h.id);
      let mesh = hazardMeshes.get(h.id);
      if (!mesh) {
        mesh = MeshBuilder.CreateDisc(
          `hazard-${h.id}`,
          { radius: h.r, tessellation: 28 },
          scene,
        );
        mesh.rotation.x = Math.PI / 2;
        mesh.material = fireMat;
        hazardMeshes.set(h.id, mesh);
      }
      // Flicker: the fire is alive and dangerous.
      const flick = 0.85 + 0.15 * Math.sin(clock * 22 + h.id * 1.7);
      const fade = Math.min(1, (h.life - h.t) / 0.6);
      mesh.position.set(h.x, 0.09, h.z);
      mesh.scaling.set(flick, flick, flick);
      (mesh.material as StandardMaterial).alpha = 0.6 * fade;
    }
    for (const [id, mesh] of hazardMeshes) {
      if (!seen.has(id)) {
        mesh.dispose();
        hazardMeshes.delete(id);
      }
    }
  }

  function syncTelegraphs() {
    const { enemies, player } = useGameStore.getState();
    const boss = enemies.find((e) => e.boss && !e.dead && e.world === player.world);
    // Lunge lane: visible during windup, pointing down the locked dash.
    if (boss && boss.mode === "lungeWindup") {
      const pulse = 0.3 + 0.18 * Math.sin(clock * 20);
      laneMat.alpha = pulse;
      laneRimMat.alpha = 0.65 + 0.3 * Math.sin(clock * 20);
      const lx = boss.x + boss.lungeDx * (LUNGE_DIST / 2);
      const lz = boss.z + boss.lungeDz * (LUNGE_DIST / 2);
      const rot = Math.atan2(boss.lungeDx, boss.lungeDz);
      lungeLane.position.set(lx, 0.07, lz);
      lungeLane.rotation.y = rot;
      laneOutline.position.set(lx, 0.08, lz);
      laneOutline.rotation.y = rot;
      lungeLane.setEnabled(true);
      laneOutline.setEnabled(true);
    } else {
      lungeLane.setEnabled(false);
      laneOutline.setEnabled(false);
    }
    // Ranged target: impact point + AoE splash ring while aiming.
    if (boss && boss.mode === "rangedAim") {
      const p = 1 - boss.modeT / RANGED_AIM;
      const pulse = 0.45 + 0.2 * Math.sin(clock * 16);
      targetMat.alpha = pulse;
      aoeMat.alpha = 0.22 + 0.12 * Math.sin(clock * 16);
      targetRimMat.alpha = 0.7 + 0.25 * Math.sin(clock * 16);
      // The rings tighten as the shot nears release: dodge NOW.
      const tighten = 1 - p * 0.25;
      targetDisc.position.set(boss.aimX, 0.08, boss.aimZ);
      targetDisc.scaling.set(tighten, tighten, tighten);
      aoeDisc.position.set(boss.aimX, 0.06, boss.aimZ);
      targetRim.position.set(boss.aimX, 0.09, boss.aimZ);
      targetRim.scaling.set(tighten, tighten, tighten);
      aoeRim.position.set(boss.aimX, 0.07, boss.aimZ);
      targetDisc.setEnabled(true);
      aoeDisc.setEnabled(true);
      targetRim.setEnabled(true);
      aoeRim.setEnabled(true);
    } else {
      targetDisc.setEnabled(false);
      aoeDisc.setEnabled(false);
      targetRim.setEnabled(false);
      aoeRim.setEnabled(false);
    }
  }

  return {
    sync(dt: number) {
      clock += dt;
      for (const s of drainSparks()) spawnSparks(s.x, s.z, s.kind);
      updateParticles(dt);
      syncEnemies();
      syncPickups();
      syncSword();
      syncQuest();
      syncProjectiles();
      syncHazards();
      syncTelegraphs();
    },
    dispose() {
      for (const [, r] of enemyMeshes) r.root.dispose();
      for (const [, r] of pickupMeshes) r.dispose();
      for (const [, m] of projectileMeshes) m.dispose();
      for (const [, m] of hazardMeshes) m.dispose();
      for (const g of gateMeshes) g.dispose();
      for (const p of particles) p.mesh.dispose();
      particles.length = 0;
      swordPivot.dispose();
      lungeLane.dispose();
      laneOutline.dispose();
      targetDisc.dispose();
      aoeDisc.dispose();
      targetRim.dispose();
      aoeRim.dispose();
      enemyMeshes.clear();
      pickupMeshes.clear();
      projectileMeshes.clear();
      hazardMeshes.clear();
    },
  };
}

/** Static meshes for breakables; the engine toggles visibility from state. */
export function buildBreakableMeshes(
  scene: Scene,
  shadowGen: ShadowGenerator,
  defs: BreakableState[],
): Map<number, TransformNode> {
  const map = new Map<number, TransformNode>();
  const tuftMat = makeFlatMaterial(scene, "tuftMat", new Color3(0.25, 0.52, 0.26));
  const potMat = makeFlatMaterial(scene, "potMat", new Color3(0.72, 0.42, 0.25));
  const potDark = makeFlatMaterial(scene, "potDark", new Color3(0.3, 0.16, 0.1));

  for (const d of defs) {
    const root = new TransformNode(`breakable-${d.id}`, scene);
    if (d.kind === "grass") {
      // Grass tuft: three crossed blades instead of a cone, so it reads as
      // a grass tuft instead of a miniature tree. Thin boxes give it volume
      // from the overhead camera without double-sided plane fuss.
      // The blades share one material, so they're baked + merged into a
      // single mesh per tuft (3 draw calls -> 1).
      const blades: Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const blade = MeshBuilder.CreateBox(
          `tuft-${d.id}-${i}`,
          { width: 0.16, height: 0.7, depth: 0.55 },
          scene,
        );
        blade.position.y = 0.32;
        blade.rotation.y = (i / 3) * Math.PI + ((d.id * 2.39) % 1) * 0.5;
        blade.rotation.x = (i === 1 ? -1 : 1) * 0.12;
        blade.bakeCurrentTransformIntoVertices();
        blades.push(blade);
      }
      const merged = Mesh.MergeMeshes(blades, true, false, undefined, false, true);
      if (merged) {
        merged.name = `tuft-${d.id}`;
        merged.material = tuftMat;
        merged.parent = root;
      }
      root.rotation.y = (d.id * 2.39) % (Math.PI * 2);
    } else {
      const pot = MeshBuilder.CreateCylinder(
        `pot-${d.id}`,
        { diameterTop: 0.72, diameterBottom: 0.55, height: 0.9, tessellation: 9 },
        scene,
      );
      pot.position.y = 0.45;
      pot.material = potMat;
      pot.parent = root;
      const mouth = MeshBuilder.CreateCylinder(
        `potmouth-${d.id}`,
        { diameterTop: 0.5, diameterBottom: 0.5, height: 0.06, tessellation: 9 },
        scene,
      );
      mouth.position.y = 0.9;
      mouth.material = potDark;
      mouth.parent = root;
      shadowGen.addShadowCaster(pot);
    }
    root.position.set(d.x, 0, d.z);
    map.set(d.id, root);
  }
  return map;
}
