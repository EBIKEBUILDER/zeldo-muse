import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  UniversalCamera,
  Vector3,
} from "@babylonjs/core";
import { useGameStore } from "../store/gameStore";

/**
 * Stage 1 — boot the engine.
 *
 * Creates the Babylon scene: overhead Zelda-style camera, lighting,
 * a ground plane, a few placeholder props (replaced by the tile map
 * in stage 2), and a placeholder hero mesh whose transform is synced
 * from the Zustand store every frame.
 *
 * The render loop is the "hot lane": it reads the store directly via
 * `useGameStore.getState()` — no React re-renders involved.
 */

export interface ZeldoEngine {
  dispose: () => void;
}

// Camera sits above and behind the player: ~57° overhead tilt, -z is "up-screen".
const CAM_HEIGHT = 20;
const CAM_BACK = 13;

function makeFlatMaterial(
  scene: Scene,
  name: string,
  color: Color3,
): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = color;
  mat.specularColor = new Color3(0, 0, 0); // matte, low-poly look
  return mat;
}

/** Stage-1 placeholder props so lighting and depth read correctly. */
function createTestProps(scene: Scene): Mesh[] {
  const casters: Mesh[] = [];
  const trunkMat = makeFlatMaterial(scene, "trunkMat", new Color3(0.42, 0.28, 0.16));
  const leafMat = makeFlatMaterial(scene, "leafMat", new Color3(0.22, 0.5, 0.24));
  const rockMat = makeFlatMaterial(scene, "rockMat", new Color3(0.55, 0.55, 0.58));

  const treePositions: Array<[number, number]> = [
    [-8, -6],
    [7, -9],
    [-5, 8],
    [9, 6],
  ];
  for (const [x, z] of treePositions) {
    const trunk = MeshBuilder.CreateCylinder(
      "trunk",
      { diameterTop: 0.35, diameterBottom: 0.5, height: 1.2, tessellation: 7 },
      scene,
    );
    trunk.position.set(x, 0.6, z);
    trunk.material = trunkMat;

    const leaves = MeshBuilder.CreateCylinder(
      "leaves",
      { diameterTop: 0.1, diameterBottom: 2.4, height: 2.8, tessellation: 7 },
      scene,
    );
    leaves.position.set(x, 2.6, z);
    leaves.material = leafMat;
    casters.push(trunk, leaves);
  }

  const rockPositions: Array<[number, number]> = [
    [-3, -4],
    [4, 3],
  ];
  for (const [x, z] of rockPositions) {
    const rock = MeshBuilder.CreateIcoSphere(
      "rock",
      { radius: 0.8, subdivisions: 0 },
      scene,
    );
    rock.position.set(x, 0.4, z);
    rock.scaling.y = 0.65;
    rock.material = rockMat;
    casters.push(rock);
  }

  return casters;
}

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

  // --- Ground ---
  const ground = MeshBuilder.CreateGround(
    "ground",
    { width: 64, height: 64 },
    scene,
  );
  ground.material = makeFlatMaterial(
    scene,
    "groundMat",
    new Color3(0.32, 0.58, 0.28),
  );

  const propCasters = createTestProps(scene);

  // --- Shadows (soft, cheap — one 1024 map from the sun) ---
  sun.autoCalcShadowZBounds = true;
  sun.shadowOrthoScale = 2;
  const shadowGen = new ShadowGenerator(1024, sun);
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.setDarkness(0.3);
  ground.receiveShadows = true;

  // --- Placeholder hero (real model + animation arrive in stage 3) ---
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

  for (const caster of [...propCasters, body, head]) {
    shadowGen.addShadowCaster(caster);
  }

  // --- Hot lane: sync meshes from the store every frame ---
  const camTarget = new Vector3();
  scene.onBeforeRenderObservable.add(() => {
    const { player } = useGameStore.getState();
    heroRoot.position.x = player.x;
    heroRoot.position.z = player.z;
    heroRoot.rotation.y = player.facing;

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
      scene.dispose();
      engine.dispose();
    },
  };
}
