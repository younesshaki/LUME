import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { Stage, OrbitControls } from "@react-three/drei";
import { Vector3, PointLight, Raycaster, Vector2 } from "three";
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
  const { camera, scene, size } = useThree();
  const mouse = useRef({ x: 0, y: 0, inside: false });
  const raycaster = useRef(new Raycaster());
  const pointer = useRef(new Vector2());
  const hitPos = useRef(new Vector3());

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

    const targetIntensity = mouse.current.inside ? 5000 : 0;
    lightRef.current.intensity += (targetIntensity - lightRef.current.intensity) * 0.08;

    if (mouse.current.inside) {
      pointer.current.set(mouse.current.x, mouse.current.y);
      raycaster.current.setFromCamera(pointer.current, camera);

      const intersects = raycaster.current.intersectObjects(scene.children, true);
      if (intersects.length > 0) {
        // Place light at the hit surface, offset slightly toward the camera
        hitPos.current.copy(intersects[0].point);
        const toCamera = new Vector3().subVectors(camera.position, hitPos.current).normalize();
        lightRef.current.position.copy(hitPos.current).addScaledVector(toCamera, 0.4);
      } else {
        // No hit — project to a fixed depth in front of the camera
        const dir = new Vector3(mouse.current.x, mouse.current.y, 0.5)
          .unproject(camera)
          .sub(camera.position)
          .normalize();
        lightRef.current.position.copy(camera.position).addScaledVector(dir, 2.5);
      }
    }
  });

  return (
    <pointLight
      ref={lightRef}
      intensity={0}
      color="#ffa200"
      distance={100}
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
