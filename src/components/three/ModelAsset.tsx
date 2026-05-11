import { useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import type { DetailModel3D } from "./modelTypes";

type ModelAssetProps = {
  model: DetailModel3D;
};

export default function ModelAsset({ model }: ModelAssetProps) {
  const { scene } = useGLTF(model.modelSrc);

  useEffect(() => {
    return () => {
      useGLTF.clear(model.modelSrc);
    };
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
