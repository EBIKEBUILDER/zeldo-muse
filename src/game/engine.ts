import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  TransformNode,
  UniversalCamera,
  Vector3,
} from "@babylonjs/core";
import { useGameStore } from "../store/gameStore";
import { makeFlatMaterial } from "./materials";
import { buildWorld } from "../world/buildWorld";
import { buildBreakableMeshes, createActorSync } from "./actors";
import { disposeInput, initInput, queueAttack } from "./input";
import { updateGame } from "./simulation";

/**
 * Stage 3 — engine boots the world, actors, and the full simulation.
 *
 * Per frame: input -> simulation (store) -> actor mesh sync -> render.
 * The simulation owns all game state; Babylon only mirrors it.
 */

export interface ZeldoEngine {
  dispose: () => void;
}

// Camera sits above and behind the player: ~57° overhead tilt, -z is "up-screen".
const CAM_HEIGHT = 20;
const CAM_BACK = 13;

export function createZeldoEngine(canvas: HTMLCanvasElement): ZeldoEngine {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.53, 0.81, 0.92, 1); // sky blue at the edges

  // --- Camera: fixed overhead tilt, follows the player (no user control) ---
  const camera = new UniversalCamera(
    "camera",
    new Vector3(0, CAM_HEIGHT, CAM_BACK),
    scene,
  );
  camera.setTarget(Vector3.Zero());
  camera.minZ = 0.1;

  // --- Lighting ---
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.diffuse = new Color3(1, 1, 1);
  hemi.groundColor = new Color3(0.5, 0.55, 0.45);
  hemi.intensity = 0.9;

  const sun = new DirectionalLight(
    "sun",
    new Vector3(-0.5, -1, -0.35),
    scene,
  );
  sun.diffuse = new Color3(1, 0.96, 0.88);
  sun.intensity = 1.1;
  sun.autoCalcShadowZBounds = true;
  sun.shadowOrthoScale = 2;
  const shadowGen = new ShadowGenerator(1024, sun);
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.setDarkness(0.3);

  // --- World + actors ---
  const worldRoot = buildWorld(scene, shadowGen);
  const actorSync = createActorSync(scene, shadowGen);
  const breakableMeshes = buildBreakableMeshes(
    scene,
    shadowGen,
    useGameStore.getState().breakables,
  );

  // --- Placeholder hero (real model + animation arrive in a later stage) ---
  const heroRoot = new TransformNode("heroRoot", scene);
  const body = MeshBuilder.CreateCapsule(
    "heroBody",
    { radius: 0.45, height: 1.7 },
    scene,
  );
  body.position.y = 0.85;
  body.material = makeFlatMaterial(
    scene,
    "tunicMat",
    new Color3(0.25, 0.62, 0.3),
  );
  body.parent = heroRoot;

  const head = MeshBuilder.CreateSphere(
    "heroHead",
    { diameter: 0.55, segments: 8 },
    scene,
  );
  head.position.y = 2.0;
  head.material = makeFlatMaterial(
    scene,
    "skinMat",
    new Color3(0.96, 0.8, 0.64),
  );
  head.parent = heroRoot;
  shadowGen.addShadowCaster(body);
  shadowGen.addShadowCaster(head);

  initInput();
  const onCanvasDown = (e: MouseEvent) => {
    if (e.button === 0) queueAttack();
  };
  canvas.addEventListener("mousedown", onCanvasDown);

  // --- Hot lane: simulate, then sync meshes from the store ---
  const camTarget = new Vector3();
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    updateGame(dt);
    actorSync.sync(dt);

    const { player, breakables } = useGameStore.getState();
    for (const b of breakables) {
      const m = breakableMeshes.get(b.id);
      if (m) m.setEnabled(b.alive);
    }

    heroRoot.position.x = player.x;
    heroRoot.position.z = player.z;
    heroRoot.rotation.y = player.facing;
    // Blink while invulnerable.
    const blink =
      player.invulnT > 0 && Math.floor(performance.now() / 90) % 2 === 0;
    heroRoot.setEnabled(!blink);

    camera.position.set(player.x, CAM_HEIGHT, player.z + CAM_BACK);
    camTarget.set(player.x, 0, player.z);
    camera.setTarget(camTarget);
  });

  engine.runRenderLoop(() => {
    scene.render();
  });

  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);

  return {
    dispose: () => {
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("mousedown", onCanvasDown);
      disposeInput();
      actorSync.dispose();
      for (const [, m] of breakableMeshes) m.dispose();
      worldRoot.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
