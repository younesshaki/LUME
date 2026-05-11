import { useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import { Box3, Vector3 } from "three";
import type { DetailModel3D } from "./modelTypes";

export type ModelTargetInfo = {
  target: [number, number, number];
  cameraPosition: [number, number, number];
};

type ModelAssetProps = {
  model: DetailModel3D;
  onReady?: () => void;
  onTarget?: (info: ModelTargetInfo) => void;
};

export default function ModelAsset({ model, onReady, onTarget }: ModelAssetProps) {
  const { scene } = useGLTF(model.modelSrc);

  useEffect(() => {
    const box = new Box3().setFromObject(scene);
    const center = new Vector3();
    box.getCenter(center);

    const targetY = center.y;
    const target: [number, number, number] = [center.x, targetY, center.z];

    // Camera distance based on the longest bounding box dimension
    const size = box.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.7;
    const cameraPosition: [number, number, number] = [center.x, targetY, center.z + distance];

    onTarget?.({ target, cameraPosition });
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
