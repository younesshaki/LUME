import { Stage, OrbitControls } from "@react-three/drei";
import type { ModelLighting } from "./modelTypes";

type ModelStageProps = {
  lighting?: ModelLighting;
  autoRotate?: boolean;
  cameraTarget?: [number, number, number];
  children: React.ReactNode;
};

const PRESET_MAP: Record<ModelLighting, "rembrandt" | "portrait" | "soft"> = {
  studio: "rembrandt",
  soft: "portrait",
  dramatic: "rembrandt",
};

export default function ModelStage({ lighting = "studio", autoRotate = true, cameraTarget, children }: ModelStageProps) {
  const target = cameraTarget ?? [0, 0, 0];
  return (
    <>
      <Stage
        preset={PRESET_MAP[lighting]}
        shadows={false}
        environment="studio"
        intensity={0.6}
        adjustCamera={0.15}
      >
        {children}
      </Stage>
      <OrbitControls
        target={target}
        enableZoom={false}
        enablePan={false}
        autoRotate={autoRotate}
        autoRotateSpeed={1.4}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 1.6}
        makeDefault
      />
    </>
  );
}
