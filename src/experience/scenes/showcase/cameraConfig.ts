import { Vector3 } from "three";
import type { CameraConfig } from "../../CameraConfigTypes";

export const SHOWCASE_AUTO_ROTATE_SPEED = 0.08;

export const cameraConfig: CameraConfig = {
  position: [0, 0.15, 5.2],
  target: [0, 0, 0],
  duration: 3.5,
  ease: "power2.inOut",
  fov: 48,
  type: "crane",
  path: [
    new Vector3(-1.2, 0.8, 6.4),
    new Vector3(-0.3, 0.3, 5.6),
    new Vector3(0, 0.05, 5.2),
  ],
  autoRotateAfterIntro: true,
  autoRotateSpeed: SHOWCASE_AUTO_ROTATE_SPEED,
};
