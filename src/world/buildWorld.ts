import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  TransformNode,
} from "@babylonjs/core";
import { makeFlatMaterial } from "../game/materials";
import {
  SCREEN_COLS,
  SCREEN_PX,
  SCREEN_PZ,
  SCREEN_ROWS,
  TILE_SIZE,
  WORLD_H,
  WORLD_SX,
  WORLD_SZ,
  WORLD_W,
  tileAt,
} from "./tiles";

/**
 * Stage 2 — builds the whole overworld from the ASCII screens.
 *
 * One ground plane per screen, thin detail boxes for path/water/bridge
 * tiles, and one mesh per prop (tree trunk + cone, rock, hedge, flower).
 * Everything parents to a single root so the world can be disposed at once.
 */
export function buildWorld(
  scene: Scene,
  shadowGen: ShadowGenerator,
): TransformNode {
  const root = new TransformNode("worldRoot", scene);

  const grassM = makeFlatMaterial(scene, "grassMat", new Color3(0.32, 0.58, 0.28));
  const pathM = makeFlatMaterial(scene, "pathMat", new Color3(0.76, 0.68, 0.5));
  const waterM = makeFlatMaterial(scene, "waterMat", new Color3(0.25, 0.5, 0.85));
  const bridgeM = makeFlatMaterial(scene, "bridgeMat", new Color3(0.5, 0.35, 0.2));
  const hedgeM = makeFlatMaterial(scene, "hedgeMat", new Color3(0.16, 0.38, 0.18));
  const trunkM = makeFlatMaterial(scene, "trunkMat", new Color3(0.42, 0.28, 0.16));
  const leafM = makeFlatMaterial(scene, "leafMat", new Color3(0.22, 0.5, 0.24));
  const rockM = makeFlatMaterial(scene, "rockMat", new Color3(0.55, 0.55, 0.58));
  const flowerM = makeFlatMaterial(scene, "flowerMat", new Color3(0.95, 0.55, 0.65));

  const cast = (m: Mesh) => shadowGen.addShadowCaster(m);

  // --- Ground: one plane per screen ---
  for (let sx = 0; sx < WORLD_SX; sx++) {
    for (let sz = 0; sz < WORLD_SZ; sz++) {
      const ground = MeshBuilder.CreateGround(
        `ground-${sx}-${sz}`,
        { width: SCREEN_PX, height: SCREEN_PZ },
        scene,
      );
      ground.position.set(sx * SCREEN_PX + SCREEN_PX / 2, 0, sz * SCREEN_PZ + SCREEN_PZ / 2);
      ground.material = grassM;
      ground.receiveShadows = true;
      ground.parent = root;
    }
  }

  // --- Tiles ---
  const maxTx = WORLD_SX * SCREEN_COLS;
  const maxTz = WORLD_SZ * SCREEN_ROWS;
  for (let tx = 0; tx < maxTx; tx++) {
    for (let tz = 0; tz < maxTz; tz++) {
      const tile = tileAt(tx, tz);
      // '.' and 'E' are plain grass; 'P' is rendered by the breakables pass.
      if (tile === null || tile === "." || tile === "E" || tile === "P") continue;
      const wx = tx * TILE_SIZE + TILE_SIZE / 2;
      const wz = tz * TILE_SIZE + TILE_SIZE / 2;

      switch (tile) {
        case ",": {
          const p = MeshBuilder.CreateBox(`path-${tx}-${tz}`, { width: 1.9, height: 0.06, depth: 1.9 }, scene);
          p.position.set(wx, 0.03, wz);
          p.material = pathM;
          p.parent = root;
          break;
        }
        case "~": {
          const w = MeshBuilder.CreateBox(`water-${tx}-${tz}`, { width: TILE_SIZE, height: 0.08, depth: TILE_SIZE }, scene);
          w.position.set(wx, 0.04, wz);
          w.material = waterM;
          w.parent = root;
          break;
        }
        case "=": {
          // Planks over water.
          const w = MeshBuilder.CreateBox(`water-${tx}-${tz}`, { width: TILE_SIZE, height: 0.08, depth: TILE_SIZE }, scene);
          w.position.set(wx, 0.04, wz);
          w.material = waterM;
          w.parent = root;
          const b = MeshBuilder.CreateBox(`bridge-${tx}-${tz}`, { width: TILE_SIZE, height: 0.14, depth: TILE_SIZE }, scene);
          b.position.set(wx, 0.1, wz);
          b.material = bridgeM;
          b.receiveShadows = true;
          b.parent = root;
          cast(b);
          break;
        }
        case "*": {
          const f = MeshBuilder.CreateIcoSphere(`flower-${tx}-${tz}`, { radius: 0.22, subdivisions: 0 }, scene);
          f.position.set(wx, 0.18, wz);
          f.material = flowerM;
          f.parent = root;
          break;
        }
        case "#": {
          const h = MeshBuilder.CreateBox(`hedge-${tx}-${tz}`, { width: TILE_SIZE, height: 1.4, depth: TILE_SIZE }, scene);
          h.position.set(wx, 0.7, wz);
          h.material = hedgeM;
          h.parent = root;
          cast(h);
          break;
        }
        case "T": {
          const trunk = MeshBuilder.CreateCylinder(
            `trunk-${tx}-${tz}`,
            { diameterTop: 0.35, diameterBottom: 0.5, height: 1.2, tessellation: 7 },
            scene,
          );
          trunk.position.set(wx, 0.6, wz);
          trunk.material = trunkM;
          trunk.parent = root;
          const leaves = MeshBuilder.CreateCylinder(
            `leaves-${tx}-${tz}`,
            { diameterTop: 0.1, diameterBottom: 2.4, height: 2.8, tessellation: 7 },
            scene,
          );
          leaves.position.set(wx, 2.6, wz);
          leaves.material = leafM;
          leaves.parent = root;
          cast(trunk);
          cast(leaves);
          break;
        }
        case "R": {
          const r = MeshBuilder.CreateIcoSphere(`rock-${tx}-${tz}`, { radius: 0.8, subdivisions: 0 }, scene);
          r.position.set(wx, 0.4, wz);
          r.scaling.y = 0.65;
          r.material = rockM;
          r.parent = root;
          cast(r);
          break;
        }
      }
    }
  }

  // --- Perimeter hedge border (visual edge of the world; collision already clamps) ---
  const border = (name: string, w: number, d: number, x: number, z: number) => {
    const b = MeshBuilder.CreateBox(name, { width: w, height: 1.5, depth: d }, scene);
    b.position.set(x, 0.75, z);
    b.material = hedgeM;
    b.parent = root;
    cast(b);
  };
  border("border-n", WORLD_W + 4, 2, WORLD_W / 2, -1);
  border("border-s", WORLD_W + 4, 2, WORLD_W / 2, WORLD_H + 1);
  border("border-w", 2, WORLD_H + 4, -1, WORLD_H / 2);
  border("border-e", 2, WORLD_H + 4, WORLD_W + 1, WORLD_H / 2);

  return root;
}
