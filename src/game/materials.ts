import { Color3, Scene, StandardMaterial } from "@babylonjs/core";

/** Shared matte material helper — flat low-poly look, no specular shine. */
export function makeFlatMaterial(
  scene: Scene,
  name: string,
  color: Color3,
): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = color;
  mat.specularColor = new Color3(0, 0, 0);
  return mat;
}
