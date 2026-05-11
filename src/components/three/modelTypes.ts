export type ModelLighting = "studio" | "soft" | "dramatic";

export type DetailModel3D = {
  enabled: true;
  modelSrc: string;
  alt: string;
  tagLabel?: string;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  camera?: {
    position: [number, number, number];
    fov?: number;
  };
  lighting?: ModelLighting;
  autoRotate?: boolean;
  backdropText?: string;
};

export function hasDetailModel3D(item: { model3d?: DetailModel3D | null }): item is { model3d: DetailModel3D } {
  return item.model3d?.enabled === true && Boolean(item.model3d.modelSrc);
}
