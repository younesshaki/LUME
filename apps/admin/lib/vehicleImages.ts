export const MAX_VEHICLE_IMAGES = 20;
export const MAX_VEHICLE_IMAGE_BYTES = 10 * 1024 * 1024;

export type VehicleImageContentType = "image/jpeg" | "image/png" | "image/webp";

export type VehicleImageUploadRequest = {
  fileName: string;
  contentType: VehicleImageContentType;
  byteSize: number;
};

export type VehicleImageConfirmation = {
  r2Key: string;
  contentType: VehicleImageContentType;
  byteSize: number;
  width: number | null;
  height: number | null;
};

const CONTENT_TYPE_EXTENSIONS: Record<VehicleImageContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseVehicleImageUploadRequest(value: unknown): VehicleImageUploadRequest | null {
  if (!isRecord(value)) return null;
  const contentType = parseContentType(value.contentType);
  const fileName = typeof value.fileName === "string" ? value.fileName.trim().slice(0, 200) : "";
  const byteSize = value.byteSize;
  if (
    !contentType ||
    !fileName ||
    typeof byteSize !== "number" ||
    !Number.isInteger(byteSize) ||
    byteSize < 1 ||
    byteSize > MAX_VEHICLE_IMAGE_BYTES
  ) {
    return null;
  }
  return { fileName, contentType, byteSize };
}

export function parseVehicleImageConfirmation(value: unknown): VehicleImageConfirmation | null {
  if (!isRecord(value)) return null;
  const contentType = parseContentType(value.contentType);
  const r2Key = typeof value.r2Key === "string" ? value.r2Key.trim() : "";
  const byteSize = value.byteSize;
  const width = nullablePositiveInteger(value.width);
  const height = nullablePositiveInteger(value.height);
  if (
    !contentType ||
    !r2Key ||
    r2Key.length > 512 ||
    r2Key.split("/").includes("..") ||
    typeof byteSize !== "number" ||
    !Number.isInteger(byteSize) ||
    byteSize < 1 ||
    byteSize > MAX_VEHICLE_IMAGE_BYTES ||
    width === undefined ||
    height === undefined ||
    (width === null) !== (height === null)
  ) {
    return null;
  }
  return { r2Key, contentType, byteSize, width, height };
}

export function buildVehicleImageR2Key(
  tenantSlug: string,
  vehicleId: string,
  imageId: string,
  contentType: VehicleImageContentType,
): string {
  if (!TENANT_SLUG_PATTERN.test(tenantSlug)) throw new Error("Invalid tenant slug.");
  if (!UUID_PATTERN.test(vehicleId) || !UUID_PATTERN.test(imageId)) {
    throw new Error("Invalid vehicle image identifier.");
  }
  return `${tenantSlug}/vehicles/${vehicleId}/${imageId}.${CONTENT_TYPE_EXTENSIONS[contentType]}`;
}

export function isExpectedVehicleImageR2Key(
  key: string,
  tenantSlug: string,
  vehicleId: string,
): boolean {
  if (!TENANT_SLUG_PATTERN.test(tenantSlug) || !UUID_PATTERN.test(vehicleId)) return false;
  const prefix = `${tenantSlug}/vehicles/${vehicleId}/`;
  const parts = key.slice(prefix.length).split(".");
  const [id, extension] = parts;
  return key.startsWith(prefix)
    && parts.length === 2
    && UUID_PATTERN.test(id ?? "")
    && (extension === "jpg" || extension === "png" || extension === "webp");
}

export function vehicleImagePublicUrl(baseUrl: string, r2Key: string): string | null {
  try {
    const base = new URL(baseUrl);
    const path = r2Key.split("/").map(encodeURIComponent).join("/");
    base.pathname = `${base.pathname.replace(/\/$/, "")}/${path}`;
    return base.toString();
  } catch {
    return null;
  }
}

function parseContentType(value: unknown): VehicleImageContentType | null {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp"
    ? value
    : null;
}

function nullablePositiveInteger(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 20_000
  ) {
    return undefined;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
