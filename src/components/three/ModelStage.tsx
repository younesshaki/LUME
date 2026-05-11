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

function CameraZoom({ cursorInCanvas, targetInfo }: { cursorInCanvas: boolean; targetInfo: ModelTargetInfo }) {
  const { camera } = useThree();
  const baseDistance = useRef<number | null>(null);
  const target = useRef(new Vector3(...targetInfo.target));

  useFrame(() => {
    // Capture base distance once after CameraRig has positioned the camera
    if (baseDistance.current === null) {
      baseDistance.current = camera.position.distanceTo(target.current);
    }

    const base = baseDistance.current;
    const goalDistance = cursorInCanvas ? base * 0.75 : base;
    const currentDistance = camera.position.distanceTo(target.current);
    const t = 0.05;
    const newDistance = currentDistance + (goalDistance - currentDistance) * t;

    const dir = camera.position.clone().sub(target.current).normalize();
    camera.position.copy(target.current).addScaledVector(dir, newDistance);
  });

  return null;
}

function CursorLight() {
  const lightRef = useRef<PointLight>(null);
  const { camera, scene, size } = useThree();
  const mouse = useRef({ x: 0, y: 0, inside: false });
  const raycaster = useRef(new Raycaster());
  const pointer = useRef(new Vector2());
  const targetPos = useRef(new Vector3());
  const currentPos = useRef(new Vector3());

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

    const targetIntensity = mouse.current.inside ? 2250 : 0;
    lightRef.current.intensity += (targetIntensity - lightRef.current.intensity) * 0.08;

    if (mouse.current.inside) {
      pointer.current.set(mouse.current.x, mouse.current.y);
      raycaster.current.setFromCamera(pointer.current, camera);

      const intersects = raycaster.current.intersectObjects(scene.children, true);
      if (intersects.length > 0) {
        // Surface hit — place target just above the hit point toward the camera
        const toCamera = new Vector3().subVectors(camera.position, intersects[0].point).normalize();
        targetPos.current.copy(intersects[0].point).addScaledVector(toCamera, 0.4);
      } else {
        // No hit — place target at a fixed depth along the cursor ray
        const dir = new Vector3(mouse.current.x, mouse.current.y, 0.5)
          .unproject(camera)
          .sub(camera.position)
          .normalize();
        targetPos.current.copy(camera.position).addScaledVector(dir, 2.5);
      }

      // Lerp current position toward target every frame — no abrupt jumps
      currentPos.current.lerp(targetPos.current, 0.12);
      lightRef.current.position.copy(currentPos.current);
    }
  });

  return (
    <pointLight
      ref={lightRef}
      intensity={0}
      color="#ffa200"
      distance={0}
      decay={2}
    />
  );
}

type ModelStageProps = {
  lighting?: ModelLighting;
  autoRotate?: boolean;
  targetInfo: ModelTargetInfo;
  cursorInCanvas?: boolean;
  children: React.ReactNode;
};

const PRESET_MAP: Record<ModelLighting, "rembrandt" | "portrait" | "soft"> = {
  studio: "rembrandt",
  soft: "portrait",
  dramatic: "rembrandt",
};

export default function ModelStage({ lighting = "studio", autoRotate = true, targetInfo, cursorInCanvas = false, children }: ModelStageProps) {
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
      <CameraZoom cursorInCanvas={cursorInCanvas} targetInfo={targetInfo} />
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
