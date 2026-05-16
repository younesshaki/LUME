import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Vector3, PointLight, Raycaster, Vector2, ACESFilmicToneMapping } from "three";
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

    const targetIntensity = mouse.current.inside ? 1000: 0;
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

function SceneSetup() {
  const { gl } = useThree();
  useEffect(() => {
    gl.toneMapping = ACESFilmicToneMapping;
    gl.toneMappingExposure = 20.6;
  }, [gl]);
  return null;
}

type ModelStageProps = {
  lighting?: ModelLighting;
  autoRotate?: boolean;
  targetInfo: ModelTargetInfo;
  cursorInCanvas?: boolean;
  children: React.ReactNode;
};

const LIGHTING_PRESETS: Record<
  ModelLighting,
  {
    ambient: number;
    key: number;
    fill: number;
    rim: number;
    point: number;
  }
> = {
  // ACESFilmicToneMapping + no IBL: needs higher raw intensities than Stage+HDR setup
  studio:   { ambient: 3.5, key: 6.0, fill: 3.0, rim: 3.5, point: 5.0 },
  soft:     { ambient: 4.0, key: 4.0, fill: 3.5, rim: 2.0, point: 3.0 },
  dramatic: { ambient: 1.5, key: 8.0, fill: 1.0, rim: 6.0, point: 4.0 },
};

export default function ModelStage({ lighting = "studio", autoRotate = true, targetInfo, cursorInCanvas = false, children }: ModelStageProps) {
  const preset = LIGHTING_PRESETS[lighting];

  return (
    <>
      <SceneSetup />
      <ambientLight intensity={preset.ambient} />
      <hemisphereLight args={["#fff8e7", "#1a0800", preset.fill]} position={[0, 6, 0]} />
      {/* Key — front right top */}
      <directionalLight color="#fff5e0" intensity={preset.key} position={[3.5, 5, 4]} castShadow={false} />
      {/* Rim — back left */}
      <directionalLight color="#ff9b2f" intensity={preset.rim} position={[-4, 2.5, -3]} />
      {/* Fill — front left, balances key */}
      <directionalLight color="#c8d8ff" intensity={preset.fill * 0.6} position={[-3, 3, 4]} />
      {/* Under fill — prevents fully black underside */}
      <directionalLight color="#fff0cc" intensity={preset.ambient * 0.4} position={[0, -3, 2]} />
      {/* Front point — close warmth */}
      <pointLight color="#ffe0a0" intensity={preset.point} position={[0, 1.6, 3]} distance={10} decay={2} />
      <group>
        {children}
      </group>
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
