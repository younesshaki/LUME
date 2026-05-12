import type { DetailModel3D } from "./modelTypes";

export type DetailModelViewerProps = {
  model: DetailModel3D;
  fallbackImageSrc?: string;
  title: string;
  className?: string;
};
