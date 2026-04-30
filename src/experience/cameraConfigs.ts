import { cameraConfig as p7c1 } from "./scenes/showcase/cameraConfig";
import { CameraConfig } from "./CameraConfigTypes";

export const CAMERA_CONFIGS: Record<string, CameraConfig> = {
  "7-1": p7c1,
};

export * from "./CameraConfigTypes";

export const getCameraConfig = (part: number, chapter: number): CameraConfig | undefined => {
  return CAMERA_CONFIGS[`${part}-${chapter}`];
};
