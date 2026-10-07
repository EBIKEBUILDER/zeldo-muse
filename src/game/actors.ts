import {
  Color3,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
} from "@babylonjs/core";
import { makeFlatMaterial } from "./materials";
import { BreakableState, useGameStore } from "../store/gameStore";

/**
 * Stage 3 — Babylon meshes for the simulated actors.
 * The simulation owns the state; this module only mirrors it into meshes.
 */

export function createActorSync(scene: Scene, shadowGen: ShadowGenerator) {
  const enemyMeshes = new Map<
    number,
    { root: TransformNode; bodyMat: StandardMaterial }
  >();
  const pickupMeshes = new Map<number, TransformNode>();

  // --- Sword: hidden pivot, blade sweeps during the swing ---
  const swordPivot = new TransformNode("swordPivot", scene);
  const blade = MeshBuilder.CreateBox(
    "blade",
    { width: 0.16, height: 0.1, depth: 1.4 },
    scene,
  );
  blade.position.set(0, 0, -1.05);
  blade.material = makeFlatMaterial(scene, "bladeMat", new Color3(0.85, 0.88, 0.92));
  blade.parent = swordPivot;
  const guard = MeshBuilder.CreateBox(
    "guard",
    { width: 0.5, height: 0.08, depth: 0.12 },
    scene,
  );
  guard.position.set(0, 0, -0.35);
  guard.material = makeFlatMaterial(scene, "guardMat", new Color3(0.5, 0.35, 0.2));
  guard.parent = swordPivot;
  swordPivot.setEnabled(false);
  shadowGen.addShadowCaster(blade);

  const rupeeMat = makeFlatMaterial(scene, "rupeeMat", new Color3(0.2, 0.85, 0.3));
  rupeeMat.emissiveColor = new Color3(0.1, 0.4, 0.15);
  const heartMat = makeFlatMaterial(scene, "heartMat", new Color3(0.9, 0.2, 0.25));
  heartMat.emissiveColor = new Color3(0.35, 0.08, 0.1);

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
        const body = MeshBuilder.CreateIcoSphere(
          `ebody-${e.id}`,
          { radius: 0.55, subdivisions: 1 },
          scene,
        );
        body.position.y = 0.5;
        body.scaling.y = 0.85;
        const bodyMat = makeFlatMaterial(
          scene,
          `ebodyMat-${e.id}`,
          new Color3(0.75, 0.25, 0.22),
        );
        body.material = bodyMat;
        body.parent = root;
        const eyeMat = makeFlatMaterial(
          scene,
          `eeyeMat-${e.id}`,
          new Color3(1, 1, 1),
        );
        for (const sx of [-0.2, 0.2]) {
          const eye = MeshBuilder.CreateSphere(
            `eeye-${e.id}-${sx}`,
            { diameter: 0.16, segments: 6 },
            scene,
          );
          eye.position.set(sx, 0.62, -0.42);
          eye.material = eyeMat;
          eye.parent = root;
        }
        shadowGen.addShadowCaster(body);
        rec = { root, bodyMat };
        enemyMeshes.set(e.id, rec);
      }
      rec.root.position.set(e.x, 0, e.z);
      const sp = Math.hypot(e.vx, e.vz);
      if (sp > 0.5) rec.root.rotation.y = Math.atan2(e.vx, -e.vz);
      const pop = 1 + Math.max(0, e.hurtT) * 1.5;
      const shrink = e.dead ? Math.max(0.01, 1 - e.deadT / 0.25) : 1;
      rec.root.scaling.set(pop * shrink, pop * shrink, pop * shrink);
      rec.bodyMat.emissiveColor =
        e.hurtT > 0 ? new Color3(0.7, 0.7, 0.7) : new Color3(0, 0, 0);
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

  return {
    sync(dt: number) {
      clock += dt;
      syncEnemies();
      syncPickups();
      syncSword();
    },
    dispose() {
      for (const [, r] of enemyMeshes) r.root.dispose();
      for (const [, r] of pickupMeshes) r.dispose();
      swordPivot.dispose();
      enemyMeshes.clear();
      pickupMeshes.clear();
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
      const tuft = MeshBuilder.CreateCylinder(
        `tuft-${d.id}`,
        { diameterTop: 0.12, diameterBottom: 0.5, height: 0.8, tessellation: 5 },
        scene,
      );
      tuft.position.y = 0.4;
      tuft.material = tuftMat;
      tuft.parent = root;
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
