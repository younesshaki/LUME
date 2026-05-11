import { useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import type { DetailModel3D } from "./modelTypes";

type ModelAssetProps = {
  model: DetailModel3D;
  onReady?: () => void;
};

export default function ModelAsset({ model, onReady }: ModelAssetProps) {
  const { scene } = useGLTF(model.modelSrc);

  useEffect(() => {
    onReady?.();
    return () => {
      useGLTF.clear(model.modelSrc);
    };
  // onReady is intentionally excluded — it's a callback ref, not reactive state
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
