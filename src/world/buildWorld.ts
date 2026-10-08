import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
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
 *
 * Performance: every static mesh is baked and merged by material, so the
 * whole world renders in ~15 draw calls instead of hundreds. The visual
 * result is identical — merging only concatenates vertex buffers.
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
  const rockM = makeFlatMaterial(scene, `rockMat-${w.id}`, new Color3(0.34, 0.34, 0.38));
  const flowerM = makeFlatMaterial(scene, `flowerMat-${w.id}`, new Color3(0.95, 0.55, 0.65));
  const torchPostM = makeFlatMaterial(scene, `torchPostMat-${w.id}`, new Color3(0.35, 0.25, 0.15));
  const flameM = makeFlatMaterial(scene, `flameMat-${w.id}`, new Color3(1, 0.6, 0.15));
  flameM.emissiveColor = new Color3(1, 0.45, 0.1);
  const doorM = makeFlatMaterial(scene, `doorMat-${w.id}`, new Color3(0.18, 0.14, 0.2));
  const doorDark = makeFlatMaterial(scene, `doorDark-${w.id}`, new Color3(0.02, 0.02, 0.03));
  const patchM = makeFlatMaterial(scene, `patchMat-${w.id}`, new Color3(0.27, 0.5, 0.24));

  // --- Merge buckets: material -> { meshes, castShadow, receiveShadow } ---
  interface Bucket {
    mat: StandardMaterial;
    meshes: Mesh[];
    cast: boolean;
    receive: boolean;
  }
  const buckets = new Map<StandardMaterial, Bucket>();
  const bucket = (mat: StandardMaterial): Bucket => {
    let b = buckets.get(mat);
    if (!b) {
      b = { mat, meshes: [], cast: false, receive: false };
      buckets.set(mat, b);
    }
    return b;
  };
  /** Stage a mesh for merging: bake its transform, queue by material. */
  const stage = (
    m: Mesh,
    mat: StandardMaterial,
    opts?: { cast?: boolean; receive?: boolean },
  ) => {
    m.material = mat;
    m.bakeCurrentTransformIntoVertices();
    const b = bucket(mat);
    b.meshes.push(m);
    if (opts?.cast) b.cast = true;
    if (opts?.receive) b.receive = true;
  };

  // --- Grass patches: flat darker discs scattered on grass for texture ---
  if (!stone) {
    let seed = 12345 + w.originX * 7 + w.originZ * 13;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 26; i++) {
      const px = w.originX + rand() * screenPx(w) * w.sx;
      const pz = w.originZ + rand() * screenPz(w) * w.sz;
      const pr = 0.7 + rand() * 1.3;
      const patch = MeshBuilder.CreateCylinder(
        `patch-${w.id}-${i}`,
        { diameterTop: pr * 2, diameterBottom: pr * 2, height: 0.02, tessellation: 7 },
        scene,
      );
      patch.position.set(px, 0.015, pz);
      stage(patch, patchM);
    }
  }

  // --- Ground: one plane per screen (merged into one) ---
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
      stage(ground, groundM, { receive: true });
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
          stage(m, pathM);
          break;
        }
        case "~": {
          const m = MeshBuilder.CreateBox(`water-${tx}-${tz}`, { width: TILE_SIZE, height: 0.08, depth: TILE_SIZE }, scene);
          m.position.set(wx, 0.04, wz);
          stage(m, waterM);
          break;
        }
        case "=": {
          const wm = MeshBuilder.CreateBox(`water-${tx}-${tz}`, { width: TILE_SIZE, height: 0.08, depth: TILE_SIZE }, scene);
          wm.position.set(wx, 0.04, wz);
          stage(wm, waterM);
          const b = MeshBuilder.CreateBox(`bridge-${tx}-${tz}`, { width: TILE_SIZE, height: 0.14, depth: TILE_SIZE }, scene);
          b.position.set(wx, 0.1, wz);
          stage(b, bridgeM, { cast: true, receive: true });
          break;
        }
        case "*": {
          const m = MeshBuilder.CreateIcoSphere(`flower-${tx}-${tz}`, { radius: 0.22, subdivisions: 0 }, scene);
          m.position.set(wx, 0.18, wz);
          stage(m, flowerM);
          break;
        }
        case "#": {
          const m = MeshBuilder.CreateBox(`hedge-${tx}-${tz}`, { width: TILE_SIZE, height: 1.4, depth: TILE_SIZE }, scene);
          m.position.set(wx, 0.7, wz);
          stage(m, hedgeM, { cast: true });
          break;
        }
        case "W": {
          const m = MeshBuilder.CreateBox(`wall-${tx}-${tz}`, { width: TILE_SIZE, height: 2.2, depth: TILE_SIZE }, scene);
          m.position.set(wx, 1.1, wz);
          stage(m, wallM, { cast: true });
          break;
        }
        case "T": {
          const trunk = MeshBuilder.CreateCylinder(
            `trunk-${tx}-${tz}`,
            { diameterTop: 0.35, diameterBottom: 0.5, height: 1.2, tessellation: 7 },
            scene,
          );
          trunk.position.set(wx, 0.6, wz);
          stage(trunk, trunkM, { cast: true });
          // Layered pine: three stacked tiers, widest at the bottom.
          const tiers: Array<[number, number, number]> = [
            [2.6, 1.5, 1.55], // [bottomDiameter, height, yCenter]
            [1.9, 1.3, 2.55],
            [1.2, 1.1, 3.4],
          ];
          for (let ti = 0; ti < tiers.length; ti++) {
            const [dBot, h, y] = tiers[ti];
            const leaves = MeshBuilder.CreateCylinder(
              `leaves-${tx}-${tz}-${ti}`,
              { diameterTop: 0.12, diameterBottom: dBot, height: h, tessellation: 8 },
              scene,
            );
            leaves.position.set(wx, y, wz);
            stage(leaves, leafM, { cast: true });
          }
          break;
        }
        case "R": {
          const m = MeshBuilder.CreateIcoSphere(`rock-${tx}-${tz}`, { radius: 0.8, subdivisions: 0 }, scene);
          m.position.set(wx, 0.32, wz);
          // Irregular rock, not a ball: deterministic pseudo-random squash,
          // tilt and size per tile so no two read as a perfect sphere.
          const v1 = ((tx * 7 + tz * 13) % 10) / 10;
          const v2 = ((tx * 11 + tz * 5) % 10) / 10;
          const v3 = ((tx * 3 + tz * 17) % 10) / 10;
          m.scaling.set(0.75 + v1 * 0.5, 0.5 + v2 * 0.3, 0.75 + v3 * 0.5);
          m.rotation.y = v1 * Math.PI * 2;
          m.rotation.x = (v2 - 0.5) * 0.5;
          m.rotation.z = (v3 - 0.5) * 0.5;
          stage(m, rockM, { cast: true });
          break;
        }
        case "o": {
          const post = MeshBuilder.CreateCylinder(
            `torchpost-${tx}-${tz}`,
            { diameterTop: 0.16, diameterBottom: 0.2, height: 1.6, tessellation: 6 },
            scene,
          );
          post.position.set(wx, 0.8, wz);
          stage(post, torchPostM);
          const flame = MeshBuilder.CreateIcoSphere(
            `flame-${tx}-${tz}`,
            { radius: 0.28, subdivisions: 0 },
            scene,
          );
          flame.position.set(wx, 1.85, wz);
          stage(flame, flameM);
          break;
        }
        case "D": {
          const arch = MeshBuilder.CreateBox(
            `door-${tx}-${tz}`,
            { width: 2.2, height: 2.6, depth: 0.7 },
            scene,
          );
          arch.position.set(wx, 1.3, wz);
          stage(arch, doorM, { cast: true });
          const mouth = MeshBuilder.CreateBox(
            `doormouth-${tx}-${tz}`,
            { width: 1.4, height: 2.0, depth: 0.75 },
            scene,
          );
          mouth.position.set(wx, 1.0, wz);
          stage(mouth, doorDark);
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
      stage(b, hedgeM, { cast: true });
    };
    border(`border-n-${w.id}`, worldW + 4, 2, w.originX + worldW / 2, w.originZ - 1);
    border(`border-s-${w.id}`, worldW + 4, 2, w.originX + worldW / 2, w.originZ + worldH + 1);
    border(`border-w-${w.id}`, 2, worldH + 4, w.originX - 1, w.originZ + worldH / 2);
    border(`border-e-${w.id}`, 2, worldH + 4, w.originX + worldW + 1, w.originZ + worldH / 2);
  }

  // --- Merge each material bucket into a single draw call ---
  for (const b of buckets.values()) {
    if (b.meshes.length === 0) continue;
    const merged = Mesh.MergeMeshes(b.meshes, true, false, undefined, false, true);
    if (!merged) continue;
    merged.name = `merged-${w.id}-${b.mat.name}`;
    merged.material = b.mat;
    merged.parent = root;
    merged.receiveShadows = b.receive;
    if (b.cast) shadowGen.addShadowCaster(merged);
  }

  return root;
}
