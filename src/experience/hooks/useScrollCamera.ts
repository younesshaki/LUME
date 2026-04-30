import { useEffect, useRef, useCallback } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { createNoise3D } from "simplex-noise";
import type { CameraKeyframe } from "../CameraConfigTypes";

gsap.registerPlugin(ScrollTrigger);

const noise3D = createNoise3D();

export type ScrollCameraConfig = {
  /** Keyframes that define camera positions at different scroll positions */
  keyframes: CameraKeyframe[];
  /** Base position when no keyframes match */
  defaultPosition: [number, number, number];
  /** Base target when no keyframes match */
  defaultTarget: [number, number, number];
  /** Default FOV */
  defaultFov?: number;
  /** Enable handheld shake effect */
  enableShake?: boolean;
  /** Global shake intensity multiplier */
  shakeMultiplier?: number;
};

export type ScrollCameraOptions = {
  /** Is this camera rig active */
  enabled: boolean;
  /** Camera configuration */
  config: ScrollCameraConfig;
  /** Current scroll progress (0-1) */
  scrollProgress: number;
  /** Scene time ranges for mapping scroll to scenes */
  sceneRanges?: Array<{
    sceneId: string;
    startProgress: number;
    endProgress: number;
  }>;
};

/**
 * Hook for scroll-driven camera animations
 * 
 * This binds camera position/rotation to scroll progress,
 * enabling smooth transitions between scenes as the user scrolls.
 */
export function useScrollCamera({
  enabled,
  config,
  scrollProgress,
  sceneRanges,
}: ScrollCameraOptions) {
  const { camera } = useThree();
  const targetPositionRef = useRef<[number, number, number]>(config.defaultPosition);
  const targetLookAtRef = useRef<[number, number, number]>(config.defaultTarget);
  const targetFovRef = useRef(config.defaultFov ?? 75);
  const currentShakeIntensityRef = useRef(0);
  const shakeOffsetRef = useRef<[number, number, number]>([0, 0, 0]);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const lastActiveSceneRef = useRef<string | null>(null);

  // Find the active keyframe based on scroll progress and scene ranges
  const getActiveKeyframe = useCallback((): CameraKeyframe | null => {
    if (!sceneRanges || sceneRanges.length === 0) {
      return null;
    }

    // Find which scene we're in based on scroll progress
    const activeRange = sceneRanges.find(
      (range) =>
        scrollProgress >= range.startProgress &&
        scrollProgress < range.endProgress
    );

    if (!activeRange) {
      return null;
    }

    // Find the keyframe for this scene
    return (
      config.keyframes.find((kf) => kf.sceneId === activeRange.sceneId) ?? null
    );
  }, [scrollProgress, sceneRanges, config.keyframes]);

  // Update camera targets when scroll changes
  useEffect(() => {
    if (!enabled) return;

    const keyframe = getActiveKeyframe();

    if (keyframe) {
      // Only animate if we've changed scenes
      if (keyframe.sceneId !== lastActiveSceneRef.current) {
        lastActiveSceneRef.current = keyframe.sceneId;

        // Kill previous tween
        tweenRef.current?.kill();

        // Animate to new position
        const duration = 1.5; // Transition duration between scenes
        const ease = keyframe.ease ?? "power2.inOut";

        tweenRef.current = gsap.to(targetPositionRef, {
          current: keyframe.position,
          duration,
          ease,
          onUpdate: () => {
            // Also update lookAt and FOV
            targetLookAtRef.current = keyframe.target;
            if (keyframe.fov) {
              targetFovRef.current = keyframe.fov;
            }
          },
        });

        // Update shake intensity
        currentShakeIntensityRef.current =
          (keyframe.shakeIntensity ?? 0) * (config.shakeMultiplier ?? 1);
      }
    } else {
      // No active keyframe, return to defaults
      if (lastActiveSceneRef.current !== null) {
        lastActiveSceneRef.current = null;
        
        tweenRef.current?.kill();
        tweenRef.current = gsap.to(targetPositionRef, {
          current: config.defaultPosition,
          duration: 1.5,
          ease: "power2.inOut",
        });
        
        targetLookAtRef.current = config.defaultTarget;
        targetFovRef.current = config.defaultFov ?? 75;
        currentShakeIntensityRef.current = 0;
      }
    }
  }, [enabled, scrollProgress, getActiveKeyframe, config]);

  // Frame loop for smooth interpolation and shake
  useFrame((_, delta) => {
    if (!enabled) return;

    // Smoothly interpolate camera position
    const lerpFactor = 1 - Math.pow(0.001, delta);
    
    camera.position.x += (targetPositionRef.current[0] - camera.position.x) * lerpFactor;
    camera.position.y += (targetPositionRef.current[1] - camera.position.y) * lerpFactor;
    camera.position.z += (targetPositionRef.current[2] - camera.position.z) * lerpFactor;

    // Apply shake effect
    if (config.enableShake && currentShakeIntensityRef.current > 0) {
      const time = performance.now() * 0.001;
      const intensity = currentShakeIntensityRef.current;

      // Remove previous shake offset
      camera.position.x -= shakeOffsetRef.current[0];
      camera.position.y -= shakeOffsetRef.current[1];
      camera.position.z -= shakeOffsetRef.current[2];

      // Calculate new shake offset
      const newOffset: [number, number, number] = [
        noise3D(time * 2, 0, 0) * intensity,
        noise3D(0, time * 2, 0) * intensity,
        0,
      ];

      // Apply new shake
      camera.position.x += newOffset[0];
      camera.position.y += newOffset[1];
      camera.position.z += newOffset[2];

      shakeOffsetRef.current = newOffset;
    } else if (
      shakeOffsetRef.current[0] !== 0 ||
      shakeOffsetRef.current[1] !== 0 ||
      shakeOffsetRef.current[2] !== 0
    ) {
      // Clear shake offset
      camera.position.x -= shakeOffsetRef.current[0];
      camera.position.y -= shakeOffsetRef.current[1];
      camera.position.z -= shakeOffsetRef.current[2];
      shakeOffsetRef.current = [0, 0, 0];
    }

    // Update lookAt
    camera.lookAt(
      targetLookAtRef.current[0],
      targetLookAtRef.current[1],
      targetLookAtRef.current[2]
    );

    // Update FOV
    if ("fov" in camera && camera.fov !== targetFovRef.current) {
      camera.fov += (targetFovRef.current - camera.fov) * lerpFactor;
      camera.updateProjectionMatrix();
    }
  });

  // Cleanup
  useEffect(() => {
    return () => {
      tweenRef.current?.kill();
    };
  }, []);

  return {
    targetPosition: targetPositionRef.current,
    targetLookAt: targetLookAtRef.current,
    activeScene: lastActiveSceneRef.current,
  };
}

/**
 * Create camera keyframes from narrative scenes
 * Helper to convert scene data to camera keyframes
 */
export function createCameraKeyframes(
  scenes: Array<{ id: string }>,
  cameraPositions: Record<string, {
    position: [number, number, number];
    target: [number, number, number];
    fov?: number;
    type?: "static" | "handheld" | "dolly" | "crane";
  }>
): CameraKeyframe[] {
  return scenes
    .map((scene) => {
      const camConfig = cameraPositions[scene.id];
      if (!camConfig) return null;

      return {
        sceneId: scene.id,
        position: camConfig.position,
        target: camConfig.target,
        fov: camConfig.fov,
        type: camConfig.type,
        shakeIntensity: camConfig.type === "handheld" ? 0.02 : 0,
      } as CameraKeyframe;
    })
    .filter((kf): kf is CameraKeyframe => kf !== null);
}
