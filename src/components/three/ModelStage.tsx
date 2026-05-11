import { Stage, OrbitControls } from "@react-three/drei";
import type { ModelLighting } from "./modelTypes";

type ModelStageProps = {
  lighting?: ModelLighting;
  autoRotate?: boolean;
  children: React.ReactNode;
};

const PRESET_MAP: Record<ModelLighting, "rembrandt" | "portrait" | "soft"> = {
  studio: "rembrandt",
  soft: "portrait",
  dramatic: "rembrandt",
};

export default function ModelStage({ lighting = "studio", autoRotate = true, children }: ModelStageProps) {
  return (
    <>
      <Stage
        preset={PRESET_MAP[lighting]}
        shadows={false}
        environment="studio"
        intensity={0.6}
        adjustCamera={1}
      >
        {children}
      </Stage>
      <OrbitControls
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
