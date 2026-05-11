import { OrbitControls, Environment, Bounds, Center } from "@react-three/drei";
import type { ModelLighting } from "./modelTypes";

type ModelStageProps = {
  lighting?: ModelLighting;
  autoRotate?: boolean;
  children: React.ReactNode;
};

const PRESET_MAP: Record<ModelLighting, "studio" | "apartment" | "dawn"> = {
  studio: "studio",
  soft: "apartment",
  dramatic: "dawn",
};

export default function ModelStage({ lighting = "studio", autoRotate = true, children }: ModelStageProps) {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 6, 4]} intensity={1.2} castShadow />
      <directionalLight position={[-4, 2, -4]} intensity={0.4} />
      <Environment preset={PRESET_MAP[lighting]} />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate={autoRotate}
        autoRotateSpeed={1.4}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 1.6}
        makeDefault
      />
      <Bounds fit clip observe margin={1.2}>
        <Center>
          {children}
        </Center>
      </Bounds>
    </>
  );
}
