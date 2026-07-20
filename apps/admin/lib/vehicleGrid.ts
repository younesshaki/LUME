/**
 * Pure helpers for the Admin vehicle inventory grid view.
 *
 * Thumbnail hierarchy (managed R2 images stay authoritative):
 *   1. managed primary image from vehicle_images
 *   2. first managed image (sort_order, then created_at) when none is primary
 *   3. special_image_src
 *   4. legacy/external image_src (e.g. from a CSV feed import)
 *   5. null → the UI renders its placeholder
 */
import { vehicleImagePublicUrl } from "./vehicleImages";

export type ManagedImageRef = {
  vehicle_id: string;
  r2_key: string;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
};

export type VehicleThumbnailSource = Readonly<{
  special_image_src: string | null;
  image_src: string;
}>;

/** Primary first, then sort_order, then created_at — repository convention. */
export function pickManagedImage(images: readonly ManagedImageRef[]): ManagedImageRef | null {
  if (images.length === 0) return null;
  return [...images].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.created_at.localeCompare(b.created_at);
  })[0];
}

export function resolveVehicleThumbnail(input: {
  managed: readonly ManagedImageRef[] | undefined;
  vehicle: VehicleThumbnailSource;
  r2PublicBaseUrl: string | null;
}): string | null {
  const managed = pickManagedImage(input.managed ?? []);
  if (managed && input.r2PublicBaseUrl) {
    const url = vehicleImagePublicUrl(input.r2PublicBaseUrl, managed.r2_key);
    if (url) return url;
  }
  if (input.vehicle.special_image_src?.trim()) return input.vehicle.special_image_src;
  if (input.vehicle.image_src.trim()) return input.vehicle.image_src;
  return null;
}

/** Group one bounded vehicle_images query by vehicle for the current page. */
export function groupManagedImagesByVehicle(
  images: readonly ManagedImageRef[],
): Map<string, ManagedImageRef[]> {
  const byVehicle = new Map<string, ManagedImageRef[]>();
  for (const image of images) {
    const list = byVehicle.get(image.vehicle_id);
    if (list) list.push(image);
    else byVehicle.set(image.vehicle_id, [image]);
  }
  return byVehicle;
}
