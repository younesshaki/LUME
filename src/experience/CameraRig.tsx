import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { CatmullRomCurve3, PerspectiveCamera } from "three";
import gsap from "gsap";
import CustomEase from "gsap/CustomEase";
import { createNoise3D } from "simplex-noise";
import { getCameraConfig, CameraConfig } from "./cameraConfigs";

gsap.registerPlugin(CustomEase);
const noise3D = createNoise3D();

// Default fallback config
const DEFAULT_CONFIG: CameraConfig = {
  position: [0, 0, 5],
  target: [0, 0, 0],
  duration: 2.5,
  ease: "power2.inOut",
  fov: 75,
  type: "static",
};

export default function CameraRig({
  sceneIndex,
  currentPart,
  currentChapter,
  enabled,
}: {
  sceneIndex: number;
  currentPart: number;
  currentChapter: number;
  enabled: boolean;
}) {
  const { camera } = useThree();
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const autoRotateRef = useRef(false);
  const autoRotateSpeedRef = useRef(0.15);
  const rotateTargetRef = useRef<[number, number, number]>([0, 0, 0]);
  const shakeIntensityRef = useRef(0);
  const shakeOffsetRef = useRef<[number, number, number]>([0, 0, 0]);
  const shakeRotZRef = useRef(0);
  const isScrollChapter = currentPart === 1 && currentChapter === 1;

  useFrame((_, delta) => {
    if (!enabled || isScrollChapter) {
      return;
    }
    if (autoRotateRef.current) {
      const target = rotateTargetRef.current;
      const dx = camera.position.x - target[0];
      const dz = camera.position.z - target[2];
      const radius = Math.hypot(dx, dz);
      const angle = Math.atan2(dz, dx) + delta * autoRotateSpeedRef.current;

      camera.position.x = target[0] + Math.cos(angle) * radius;
      camera.position.z = target[2] + Math.sin(angle) * radius;
      camera.lookAt(target[0], target[1], target[2]);
    }

    if (shakeIntensityRef.current > 0) {
      const time = performance.now() * 0.001;
      const intensity = shakeIntensityRef.current;
      const nextOffset: [number, number, number] = [
        noise3D(time * 2, 0, 0) * intensity,
        noise3D(0, time * 2, 0) * intensity,
        0,
      ];
      const nextRotZ = noise3D(0, 0, time * 2) * intensity * 0.5;

      camera.position.x -= shakeOffsetRef.current[0];
      camera.position.y -= shakeOffsetRef.current[1];
      camera.position.z -= shakeOffsetRef.current[2];
      camera.rotation.z -= shakeRotZRef.current;

      camera.position.x += nextOffset[0];
      camera.position.y += nextOffset[1];
      camera.position.z += nextOffset[2];
      camera.rotation.z += nextRotZ;

      shakeOffsetRef.current = nextOffset;
      shakeRotZRef.current = nextRotZ;
    } else if (shakeOffsetRef.current[0] || shakeOffsetRef.current[1] || shakeOffsetRef.current[2] || shakeRotZRef.current) {
      camera.position.x -= shakeOffsetRef.current[0];
      camera.position.y -= shakeOffsetRef.current[1];
      camera.position.z -= shakeOffsetRef.current[2];
      camera.rotation.z -= shakeRotZRef.current;
      shakeOffsetRef.current = [0, 0, 0];
      shakeRotZRef.current = 0;
    }
  });

  useEffect(() => {
    if (!enabled) {
      timelineRef.current?.kill();
      timelineRef.current = null;
      autoRotateRef.current = false;
      autoRotateSpeedRef.current = 0.15;
      shakeIntensityRef.current = 0;
      if (shakeOffsetRef.current[0] || shakeOffsetRef.current[1] || shakeOffsetRef.current[2]) {
        camera.position.x -= shakeOffsetRef.current[0];
        camera.position.y -= shakeOffsetRef.current[1];
        camera.position.z -= shakeOffsetRef.current[2];
        shakeOffsetRef.current = [0, 0, 0];
      }
      if (shakeRotZRef.current) {
        camera.rotation.z -= shakeRotZRef.current;
        shakeRotZRef.current = 0;
      }
      return;
    }

    if (isScrollChapter) {
      timelineRef.current?.kill();
      timelineRef.current = null;
      autoRotateRef.current = false;
      autoRotateSpeedRef.current = 0.15;
      rotateTargetRef.current = [-2.6, -0.6, 0];
      shakeIntensityRef.current = 0;
      if (shakeOffsetRef.current[0] || shakeOffsetRef.current[1] || shakeOffsetRef.current[2]) {
        camera.position.x -= shakeOffsetRef.current[0];
        camera.position.y -= shakeOffsetRef.current[1];
        camera.position.z -= shakeOffsetRef.current[2];
        shakeOffsetRef.current = [0, 0, 0];
      }
      if (shakeRotZRef.current) {
        camera.rotation.z -= shakeRotZRef.current;
        shakeRotZRef.current = 0;
      }
      return;
    }

    // Director Pattern: Get config for current chapter
    const config = getCameraConfig(currentPart, currentChapter) ?? DEFAULT_CONFIG;
    
    const duration = config.duration;
    const ease = config.ease;
    
    timelineRef.current?.kill();
    autoRotateRef.current = false;
    autoRotateSpeedRef.current = config.autoRotateSpeed ?? 0.15;
    rotateTargetRef.current = config.target;
    
    // Config can force shake, or we default based on type
    if (config.shakeIntensity !== undefined) {
      shakeIntensityRef.current = config.shakeIntensity;
    } else {
      shakeIntensityRef.current = config.type === "handheld" ? 0.02 : 0;
    }

    const tl = gsap.timeline();
    timelineRef.current = tl;
    const path = config.path;

    if (path && path.length > 2) {
      const curve = new CatmullRomCurve3(path);
      const tState = { t: 0 };
      tl.to(tState, {
        t: 1,
        duration,
        ease,
        onUpdate: () => {
          const point = curve.getPoint(tState.t);
          camera.position.copy(point);
          camera.lookAt(...config.target);
        },
      });
    } else {
      // Anticipation: slight pull back before the main move.
      tl.to(camera.position, {
        z: camera.position.z + 0.5,
        duration: 0.3,
        ease: "power2.in",
      })
        .to(camera.position, {
          x: config.position[0],
          y: config.position[1],
          z: config.position[2] - 0.2,
          duration,
          ease: "power3.out",
        })
        .to(camera.position, {
          z: config.position[2],
          duration: 0.4,
          ease: "power2.out",
        });
    }

    if (config.fov && camera instanceof PerspectiveCamera) {
      tl.to(
        camera,
        {
          fov: config.fov,
          duration,
          ease,
          onUpdate: () => {
            camera.updateProjectionMatrix();
          },
        },
        0,
      );
    }

    if (!path) {
      tl.to(
        { t: 0 },
        {
          t: 1,
          duration: duration * 0.8,
          ease: "power2.out",
          onUpdate: () => {
            camera.lookAt(...config.target);
          },
        },
        0.2,
      );
    }

    if (config.useBmwRig) {
      tl.to(camera.position, {
        x: -2.08,
        y: 1.12,
        z: 4.41,
        duration: 2,
        ease: "power2.inOut",
      }).to(camera.rotation, {
        x: -0.25,
        y: -0.43,
        z: -0.11,
        duration: 2,
        ease: "power2.inOut",
      }, "<").call(() => {
        autoRotateRef.current = true;
      });
    }

    if (config.autoRotateAfterIntro) {
      tl.call(() => {
        autoRotateRef.current = true;
      });
    }
    
    camera.updateProjectionMatrix();

    return () => {
      tl.kill();
    };
  }, [camera, currentPart, currentChapter, enabled]); // removed sceneIndex dependency as it is now derived from part/chapter

  return null;
}
