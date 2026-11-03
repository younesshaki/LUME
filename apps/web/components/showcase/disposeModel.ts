"use client";
import { BufferGeometry, Material, Texture, Object3D, Skeleton } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
/** One disposal ledger per parse, including dependencies that finish after an
 * abort/error. No strong global cache and no GPU object shared between views. */
export function resourceDisposer() {
  const seen = new WeakSet<object>(),
    images = new WeakSet<object>();
  function texture(value: Texture) {
    if (seen.has(value)) return;
    seen.add(value);
    const data = value.source?.data;
    for (const image of Array.isArray(data) ? data : [data])
      if (image && typeof image === "object" && !images.has(image)) {
        images.add(image);
        if (typeof image.close === "function") image.close();
      }
    value.dispose();
  }
  function uniforms(value: unknown, visited = new WeakSet<object>()) {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (value instanceof Texture) texture(value);
    else for (const nested of Object.values(value)) uniforms(nested, visited);
  }
  function material(value: Material) {
    if (seen.has(value)) return;
    seen.add(value);
    for (const child of Object.values(value))
      if (child instanceof Texture) texture(child);
    if ("uniforms" in value) uniforms(value.uniforms);
    value.dispose();
  }
  function geometry(value: BufferGeometry) {
    if (!seen.has(value)) {
      seen.add(value);
      value.dispose();
    }
  }
  return function dispose(value: unknown) {
    if (value instanceof Texture) texture(value);
    else if (value instanceof Material) material(value);
    else if (value instanceof BufferGeometry) geometry(value);
    else if (value instanceof Object3D)
      value.traverse((node) => {
        const mesh = node as Object3D & {
          geometry?: BufferGeometry;
          material?: Material | Material[];
          skeleton?: Skeleton;
        };
        if (mesh.geometry) geometry(mesh.geometry);
        for (const m of mesh.material
          ? Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]
          : [])
          material(m);
        if (mesh.skeleton?.boneTexture) texture(mesh.skeleton.boneTexture);
      });
  };
}
export function disposeModel(
  gltf: Pick<GLTF, "scene" | "scenes">,
  dispose = resourceDisposer(),
) {
  for (const scene of new Set([gltf.scene, ...gltf.scenes])) dispose(scene);
}
