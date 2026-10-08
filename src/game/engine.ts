import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  SceneInstrumentation,
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
import { consumeTrauma } from "./events";
import { reportFrame, reportRender } from "./perf";
import { updateGame } from "./simulation";
import { SPAWN, WORLDS } from "../world/tiles";

/**
 * Stage 4 — the full game.
 *
 * Both worlds share one scene (the dungeon sits at a scene offset).
 * Per frame: simulate (playing only) -> sync actor meshes -> render.
 * Title screen gets a slow orbital camera over the spawn.
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

  // Subtle distance fog for depth.
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 55;
  scene.fogEnd = 110;
  scene.fogColor = new Color3(0.68, 0.82, 0.9);
  const shadowGen = new ShadowGenerator(1024, sun);
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.setDarkness(0.3);

  // Instrumentation for the HUD perf panel — counters only, no per-frame cost.
  const instrumentation = new SceneInstrumentation(scene);
  instrumentation.captureFrameTime = true;
  instrumentation.captureRenderTime = true;

  // --- Worlds + actors ---
  const worldRoots = WORLDS.map((w) => buildWorld(scene, shadowGen, w));
  const actorSync = createActorSync(scene, shadowGen);
  const breakableMeshes = buildBreakableMeshes(
    scene,
    shadowGen,
    useGameStore.getState().breakables,
  );

  // --- Hero: little tunic-wearing adventurer (low-poly) ---
  const heroRoot = new TransformNode("heroRoot", scene);
  const tunicMat = makeFlatMaterial(scene, "tunicMat", new Color3(0.22, 0.58, 0.28));
  const tunicDark = makeFlatMaterial(scene, "tunicDark", new Color3(0.16, 0.42, 0.2));
  const skinMat = makeFlatMaterial(scene, "skinMat", new Color3(0.96, 0.8, 0.64));
  const beltMat = makeFlatMaterial(scene, "beltMat", new Color3(0.4, 0.26, 0.14));
  const eyeMat = makeFlatMaterial(scene, "heroEyeMat", new Color3(0.12, 0.1, 0.12));

  // Tunic: tapered cylinder, wider at the hem.
  const body = MeshBuilder.CreateCylinder(
    "heroBody",
    { diameterTop: 0.55, diameterBottom: 0.85, height: 1.05, tessellation: 8 },
    scene,
  );
  body.position.y = 0.55;
  body.material = tunicMat;
  body.parent = heroRoot;
  // Belt.
  const belt = MeshBuilder.CreateCylinder(
    "heroBelt",
    { diameterTop: 0.62, diameterBottom: 0.66, height: 0.14, tessellation: 8 },
    scene,
  );
  belt.position.y = 0.78;
  belt.material = beltMat;
  belt.parent = heroRoot;
  // Head.
  const head = MeshBuilder.CreateSphere(
    "heroHead",
    { diameter: 0.55, segments: 8 },
    scene,
  );
  head.position.y = 1.35;
  head.material = skinMat;
  head.parent = heroRoot;
  // Pointed adventurer's hat, tilted back a touch.
  const hat = MeshBuilder.CreateCylinder(
    "heroHat",
    { diameterTop: 0.02, diameterBottom: 0.5, height: 0.75, tessellation: 8 },
    scene,
  );
  hat.position.set(0, 1.95, 0.08);
  hat.rotation.x = -0.22;
  hat.material = tunicDark;
  hat.parent = heroRoot;
  // Eyes on the face (front = -z).
  for (const sx of [-0.13, 0.13]) {
    const eye = MeshBuilder.CreateSphere(
      `heroEye-${sx}`,
      { diameter: 0.09, segments: 6 },
      scene,
    );
    eye.position.set(sx, 1.38, -0.25);
    eye.material = eyeMat;
    eye.parent = heroRoot;
  }
  // Simple arms.
  for (const sx of [-0.42, 0.42]) {
    const arm = MeshBuilder.CreateCapsule(
      `heroArm-${sx}`,
      { radius: 0.11, height: 0.5 },
      scene,
    );
    arm.position.set(sx, 0.75, 0);
    arm.material = tunicMat;
    arm.parent = heroRoot;
  }
  shadowGen.addShadowCaster(body);
  shadowGen.addShadowCaster(head);
  shadowGen.addShadowCaster(hat);

  initInput();
  const onCanvasDown = (e: MouseEvent) => {
    if (e.button === 0 && useGameStore.getState().quest.phase === "playing") {
      queueAttack();
    }
  };
  canvas.addEventListener("mousedown", onCanvasDown);

  // --- Hot lane: simulate, then sync meshes from the store ---
  const camTarget = new Vector3();
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    const before = useGameStore.getState();
    if (before.quest.phase === "playing") updateGame(dt);
    actorSync.sync(dt);

    const { player, breakables, quest } = useGameStore.getState();
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

    if (quest.phase === "title") {
      // Slow orbital establishing shot over the spawn.
      const t = performance.now() / 1000;
      camera.position.set(
        SPAWN.x + Math.cos(t * 0.25) * 20,
        15,
        SPAWN.z + Math.sin(t * 0.25) * 20,
      );
      camTarget.set(SPAWN.x, 0, SPAWN.z);
    } else {
      camera.position.set(player.x, CAM_HEIGHT, player.z + CAM_BACK);
      camTarget.set(player.x, 0, player.z);
    }
    // Impact shake: trauma decays as it's consumed.
    const trauma = consumeTrauma(dt);
    if (trauma > 0.01) {
      const s = trauma * trauma * 0.6;
      camera.position.x += (Math.random() * 2 - 1) * s;
      camera.position.y += (Math.random() * 2 - 1) * s * 0.4;
      camera.position.z += (Math.random() * 2 - 1) * s;
    }
    camera.setTarget(camTarget);
  });

  engine.runRenderLoop(() => {
    reportFrame(engine.getDeltaTime() / 1000);
    scene.render();
    reportRender(scene, instrumentation);
  });

  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);

  return {
    dispose: () => {
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("mousedown", onCanvasDown);
      disposeInput();
      actorSync.dispose();
      instrumentation.dispose();
      for (const [, m] of breakableMeshes) m.dispose();
      for (const r of worldRoots) r.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
