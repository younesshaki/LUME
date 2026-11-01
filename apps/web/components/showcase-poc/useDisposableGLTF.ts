"use client";
import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Mesh, Box3, Vector3 } from "three";

/** Disposable copy of src/hooks/useDisposableGLTF.ts for this spike only.
 * Material clones belong to this mount; geometry/textures belong to the loader
 * cache and must survive a router back/remount. Never mutate the cached model.
 */
export function useDisposableGLTF(url: string) {
  const gltf = useGLTF(url);
  const prepared = useMemo(() => {
    const scene = gltf.scene.clone(true);
    let meshes = 0;
    scene.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      meshes++;
      child.material = Array.isArray(child.material)
        ? child.material.map((m) => m.clone())
        : child.material.clone();
    });
    const bounds = new Box3().setFromObject(scene);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    return {
      scene,
      meshes,
      center,
      scale: 2.7 / Math.max(size.x, size.y, size.z, 0.001),
    };
  }, [gltf.scene]);
  useEffect(
    () => () => {
      prepared.scene.traverse((child) => {
        if (child instanceof Mesh) {
          for (const material of Array.isArray(child.material)
            ? child.material
            : [child.material])
            material.dispose();
        }
      });
    },
    [prepared],
  );
  return prepared;
}
