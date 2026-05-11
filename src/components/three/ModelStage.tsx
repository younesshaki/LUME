import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { Stage, OrbitControls } from "@react-three/drei";
import { Vector3, PointLight } from "three";
import type { ModelLighting } from "./modelTypes";
import type { ModelTargetInfo } from "./ModelAsset";

function CameraRig({ info }: { info: ModelTargetInfo }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(...info.cameraPosition);
    camera.lookAt(...info.target);
    camera.updateProjectionMatrix();
  }, [camera, info]);

  return null;
}

function CursorLight() {
  const lightRef = useRef<PointLight>(null);
  const { camera, size } = useThree();
  const mouse = useRef({ x: 0, y: 0, inside: false });
  const worldPos = useRef(new Vector3());

  useEffect(() => {
    const canvas = document.querySelector(".detailModelViewer__canvas canvas") as HTMLCanvasElement | null;
    if (!canvas) return;

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mouse.current.inside = true;
    };
    const onLeave = () => { mouse.current.inside = false; };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [size]);

  useFrame(() => {
    if (!lightRef.current) return;

    const targetIntensity = mouse.current.inside ? 3.5 : 0;
    lightRef.current.intensity += (targetIntensity - lightRef.current.intensity) * 0.08;

    if (mouse.current.inside) {
      worldPos.current.set(mouse.current.x, mouse.current.y, 0.5);
      worldPos.current.unproject(camera);
      const dir = worldPos.current.sub(camera.position).normalize();
      const dist = 2.5;
      lightRef.current.position.copy(camera.position).addScaledVector(dir, dist);
    }
  });

  return (
    <pointLight
      ref={lightRef}
      intensity={0}
      color="#fff8ec"
      distance={6}
      decay={2}
    />
  );
}

type ModelStageProps = {
  lighting?: ModelLighting;
  autoRotate?: boolean;
  targetInfo: ModelTargetInfo;
  children: React.ReactNode;
};

const PRESET_MAP: Record<ModelLighting, "rembrandt" | "portrait" | "soft"> = {
  studio: "rembrandt",
  soft: "portrait",
  dramatic: "rembrandt",
};

export default function ModelStage({ lighting = "studio", autoRotate = true, targetInfo, children }: ModelStageProps) {
  return (
    <>
      <Stage
        preset={PRESET_MAP[lighting]}
        shadows={false}
        environment="studio"
        intensity={0.6}
        adjustCamera={false}
      >
        {children}
      </Stage>
      <CameraRig info={targetInfo} />
      <CursorLight />
      <OrbitControls
        target={targetInfo.target}
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
