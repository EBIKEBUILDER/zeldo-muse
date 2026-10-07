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
  SCREEN_ROWS,
  TILE_SIZE,
  WorldDef,
  screenPx,
  screenPz,
  tileAtWorld,
  tileScenePos,
} from "./tiles";

/**
 * Stage 4 — builds one world from its ASCII screens.
 *
 * Static geometry only: grounds, tile detail, props, walls, torches,
 * door archways. Interactive pieces (gate, key, chest) live in actors.ts
 * because they react to quest state.
 */
export function buildWorld(
  scene: Scene,
  shadowGen: ShadowGenerator,
  w: WorldDef,
): TransformNode {
  const root = new TransformNode(`worldRoot-${w.id}`, scene);
  const stone = w.theme === "stone";

  const groundM = makeFlatMaterial(
    scene,
    `groundMat-${w.id}`,
    stone ? new Color3(0.42, 0.42, 0.47) : new Color3(0.32, 0.58, 0.28),
  );
  const pathM = makeFlatMaterial(scene, `pathMat-${w.id}`, new Color3(0.76, 0.68, 0.5));
  const waterM = makeFlatMaterial(scene, `waterMat-${w.id}`, new Color3(0.25, 0.5, 0.85));
  const bridgeM = makeFlatMaterial(scene, `bridgeMat-${w.id}`, new Color3(0.5, 0.35, 0.2));
  const hedgeM = makeFlatMaterial(scene, `hedgeMat-${w.id}`, new Color3(0.16, 0.38, 0.18));
  const wallM = makeFlatMaterial(scene, `wallMat-${w.id}`, new Color3(0.35, 0.34, 0.38));
  const trunkM = makeFlatMaterial(scene, `trunkMat-${w.id}`, new Color3(0.42, 0.28, 0.16));
  const leafM = makeFlatMaterial(scene, `leafMat-${w.id}`, new Color3(0.22, 0.5, 0.24));
  const rockM = makeFlatMaterial(scene, `rockMat-${w.id}`, new Color3(0.55, 0.55, 0.58));
  const flowerM = makeFlatMaterial(scene, `flowerMat-${w.id}`, new Color3(0.95, 0.55, 0.65));
  const torchPostM = makeFlatMaterial(scene, `torchPostMat-${w.id}`, new Color3(0.35, 0.25, 0.15));
  const flameM = makeFlatMaterial(scene, `flameMat-${w.id}`, new Color3(1, 0.6, 0.15));
  flameM.emissiveColor = new Color3(1, 0.45, 0.1);
  const doorM = makeFlatMaterial(scene, `doorMat-${w.id}`, new Color3(0.18, 0.14, 0.2));
  const doorDark = makeFlatMaterial(scene, `doorDark-${w.id}`, new Color3(0.02, 0.02, 0.03));

  const cast = (m: Mesh) => shadowGen.addShadowCaster(m);

  // --- Ground: one plane per screen ---
  for (let sx = 0; sx < w.sx; sx++) {
    for (let sz = 0; sz < w.sz; sz++) {
      const ground = MeshBuilder.CreateGround(
        `ground-${w.id}-${sx}-${sz}`,
        { width: screenPx(w), height: screenPz(w) },
        scene,
      );
      ground.position.set(
        w.originX + sx * screenPx(w) + screenPx(w) / 2,
        0,
        w.originZ + sz * screenPz(w) + screenPz(w) / 2,
      );
      ground.material = groundM;
      ground.receiveShadows = true;
      ground.parent = root;
    }
  }

  // --- Tiles ---
  const maxTx = w.sx * SCREEN_COLS;
  const maxTz = w.sz * SCREEN_ROWS;
  for (let tx = 0; tx < maxTx; tx++) {
    for (let tz = 0; tz < maxTz; tz++) {
      const tile = tileAtWorld(w, tx, tz);
      // '.', 'E', 'B' are plain floor; 'P'/'G'/'K'/'C' are built by actors.
      if (
        tile === null ||
        tile === "." ||
        tile === "E" ||
        tile === "B" ||
        tile === "P" ||
        tile === "G" ||
        tile === "K" ||
        tile === "C"
      ) {
        continue;
      }
      const { x: wx, z: wz } = tileScenePos(w, tx, tz);

      switch (tile) {
        case ",": {
          const m = MeshBuilder.CreateBox(`path-${tx}-${tz}`, { width: 1.9, height: 0.06, depth: 1.9 }, scene);
          m.position.set(wx, 0.03, wz);
          m.material = pathM;
          m.parent = root;
          break;
        }
        case "~": {
          const m = MeshBuilder.CreateBox(`water-${tx}-${tz}`, { width: TILE_SIZE, height: 0.08, depth: TILE_SIZE }, scene);
          m.position.set(wx, 0.04, wz);
          m.material = waterM;
          m.parent = root;
          break;
        }
        case "=": {
          const wm = MeshBuilder.CreateBox(`water-${tx}-${tz}`, { width: TILE_SIZE, height: 0.08, depth: TILE_SIZE }, scene);
          wm.position.set(wx, 0.04, wz);
          wm.material = waterM;
          wm.parent = root;
          const b = MeshBuilder.CreateBox(`bridge-${tx}-${tz}`, { width: TILE_SIZE, height: 0.14, depth: TILE_SIZE }, scene);
          b.position.set(wx, 0.1, wz);
          b.material = bridgeM;
          b.receiveShadows = true;
          b.parent = root;
          cast(b);
          break;
        }
        case "*": {
          const m = MeshBuilder.CreateIcoSphere(`flower-${tx}-${tz}`, { radius: 0.22, subdivisions: 0 }, scene);
          m.position.set(wx, 0.18, wz);
          m.material = flowerM;
          m.parent = root;
          break;
        }
        case "#": {
          const m = MeshBuilder.CreateBox(`hedge-${tx}-${tz}`, { width: TILE_SIZE, height: 1.4, depth: TILE_SIZE }, scene);
          m.position.set(wx, 0.7, wz);
          m.material = hedgeM;
          m.parent = root;
          cast(m);
          break;
        }
        case "W": {
          const m = MeshBuilder.CreateBox(`wall-${tx}-${tz}`, { width: TILE_SIZE, height: 2.2, depth: TILE_SIZE }, scene);
          m.position.set(wx, 1.1, wz);
          m.material = wallM;
          m.parent = root;
          cast(m);
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
          const m = MeshBuilder.CreateIcoSphere(`rock-${tx}-${tz}`, { radius: 0.8, subdivisions: 0 }, scene);
          m.position.set(wx, 0.4, wz);
          m.scaling.y = 0.65;
          m.material = rockM;
          m.parent = root;
          cast(m);
          break;
        }
        case "o": {
          const post = MeshBuilder.CreateCylinder(
            `torchpost-${tx}-${tz}`,
            { diameterTop: 0.16, diameterBottom: 0.2, height: 1.6, tessellation: 6 },
            scene,
          );
          post.position.set(wx, 0.8, wz);
          post.material = torchPostM;
          post.parent = root;
          const flame = MeshBuilder.CreateIcoSphere(
            `flame-${tx}-${tz}`,
            { radius: 0.28, subdivisions: 0 },
            scene,
          );
          flame.position.set(wx, 1.85, wz);
          flame.material = flameM;
          flame.parent = root;
          break;
        }
        case "D": {
          const arch = MeshBuilder.CreateBox(
            `door-${tx}-${tz}`,
            { width: 2.2, height: 2.6, depth: 0.7 },
            scene,
          );
          arch.position.set(wx, 1.3, wz);
          arch.material = doorM;
          arch.parent = root;
          const mouth = MeshBuilder.CreateBox(
            `doormouth-${tx}-${tz}`,
            { width: 1.4, height: 2.0, depth: 0.75 },
            scene,
          );
          mouth.position.set(wx, 1.0, wz);
          mouth.material = doorDark;
          mouth.parent = root;
          cast(arch);
          break;
        }
      }
    }
  }

  // --- Perimeter hedge border (overworld only; the dungeon has stone walls) ---
  if (w.id === "overworld") {
    const worldW = w.sx * screenPx(w);
    const worldH = w.sz * screenPz(w);
    const border = (name: string, bw: number, bd: number, x: number, z: number) => {
      const b = MeshBuilder.CreateBox(name, { width: bw, height: 1.5, depth: bd }, scene);
      b.position.set(x, 0.75, z);
      b.material = hedgeM;
      b.parent = root;
      cast(b);
    };
    border(`border-n-${w.id}`, worldW + 4, 2, w.originX + worldW / 2, w.originZ - 1);
    border(`border-s-${w.id}`, worldW + 4, 2, w.originX + worldW / 2, w.originZ + worldH + 1);
    border(`border-w-${w.id}`, 2, worldH + 4, w.originX - 1, w.originZ + worldH / 2);
    border(`border-e-${w.id}`, 2, worldH + 4, w.originX + worldW + 1, w.originZ + worldH / 2);
  }

  return root;
}
