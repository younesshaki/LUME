import { useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import { Box3, Vector3 } from "three";
import type { DetailModel3D } from "./modelTypes";

type ModelAssetProps = {
  model: DetailModel3D;
  onReady?: () => void;
  onTarget?: (target: [number, number, number]) => void;
};

export default function ModelAsset({ model, onReady, onTarget }: ModelAssetProps) {
  const { scene } = useGLTF(model.modelSrc);

  useEffect(() => {
    const box = new Box3().setFromObject(scene);
    const center = new Vector3();
    const max = new Vector3();
    box.getCenter(center);
    box.getSize(max);

    // Bias the target toward the upper portion of the bounding box —
    // the main subject (can) sits above the splash which extends below.
    const targetY = center.y + (box.max.y - center.y) * 0.5;
    onTarget?.([center.x, targetY, center.z]);
    onReady?.();

    return () => {
      useGLTF.clear(model.modelSrc);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.modelSrc]);

  return (
    <primitive
      object={scene}
      scale={model.scale ?? 1}
      position={model.position ?? [0, 0, 0]}
      rotation={model.rotation ?? [0, 0, 0]}
    />
  );
}
