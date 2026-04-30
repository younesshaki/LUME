import { Vector3 } from "three";

export type CameraType = "dolly" | "crane" | "handheld" | "static";

export interface CameraConfig {
  position: [number, number, number];
  target: [number, number, number];
  duration: number;
  ease: string;
  fov: number;
  type: CameraType;
  path?: Vector3[];
  shakeIntensity?: number;
  useBmwRig?: boolean;
  autoRotateAfterIntro?: boolean;
  autoRotateSpeed?: number;
}

/**
 * Per-scene camera keyframe for scroll-driven animations
 */
export interface CameraKeyframe {
  /** Scene ID this keyframe belongs to */
  sceneId: string;
  /** Camera position */
  position: [number, number, number];
  /** Look-at target */
  target: [number, number, number];
  /** Field of view */
  fov?: number;
  /** Animation easing */
  ease?: string;
  /** Camera type (affects shake, etc.) */
  type?: CameraType;
  /** Shake intensity (0 = none) */
  shakeIntensity?: number;
}

/**
 * Chapter-level camera configuration with scroll-driven keyframes
 */
export interface ChapterCameraConfig extends CameraConfig {
  /** Scroll-driven keyframes for each scene */
  keyframes?: CameraKeyframe[];
}
