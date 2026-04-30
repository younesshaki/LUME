import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export function useDisposableGLTF(url: string, dracoPath?: string) {
  const gltf = useGLTF(url, dracoPath);
  const clonedScene = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    cloned.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }
      // child.geometry = child.geometry.clone(); // Removed to save GPU memory

      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => material.clone());
      } else if (child.material) {
        child.material = child.material.clone();
      }
    });
    return cloned;
  }, [gltf.scene]);

  useEffect(() => {
    return () => {
      clonedScene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) {
          return;
        }

        // Do not dispose geometry since it is now shared from the useGLTF cache
        // child.geometry?.dispose();

        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];

        materials.forEach((material) => {
          if (!material) {
            return;
          }

          material.dispose();
        });
      });
    };
  }, [clonedScene]);

  return { ...gltf, scene: clonedScene };
}
