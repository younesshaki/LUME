import type { SupabaseClient } from "@supabase/supabase-js";
import {
  publicUrl,
  TENANT_BUCKETS,
  tenantPath,
  type Database,
} from "@lume/db";

export type BrandingAssetKind = "logo" | "favicon32" | "favicon192";

export type BrandingAssetCandidate = {
  type: string;
  size: number;
  width?: number;
  height?: number;
};

export type UploadedBrandingAsset = {
  objectKey: string;
  url: string;
};

type StorageClient = SupabaseClient<Database, "public">;

const MAX_BRANDING_ASSET_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = new Set(["image/svg+xml", "image/png", "image/webp"]);
const FAVICON_TYPES = new Set(["image/png", "image/webp"]);

export const BRANDING_ASSET_ACCEPT: Record<BrandingAssetKind, string> = {
  logo: "image/svg+xml,image/png,image/webp",
  favicon32: "image/png,image/webp",
  favicon192: "image/png,image/webp",
};

export function validateBrandingAsset(
  candidate: BrandingAssetCandidate,
  kind: BrandingAssetKind,
): string | null {
  const allowedTypes = kind === "logo" ? LOGO_TYPES : FAVICON_TYPES;
  if (!allowedTypes.has(candidate.type)) {
    return kind === "logo"
      ? "Choose an SVG, PNG, or WebP image."
      : "Choose a PNG or WebP favicon.";
  }
  if (candidate.size <= 0 || candidate.size > MAX_BRANDING_ASSET_BYTES) {
    return "Brand images must be 2 MB or smaller.";
  }
  if (kind === "logo") return null;

  const requiredSize = kind === "favicon32" ? 32 : 192;
  if (candidate.width !== requiredSize || candidate.height !== requiredSize) {
    return `This favicon must be exactly ${requiredSize}×${requiredSize} pixels.`;
  }
  return null;
}

export function brandingAssetObjectKey(
  tenantId: string,
  kind: BrandingAssetKind,
): string {
  const name = kind === "logo"
    ? "logo"
    : kind === "favicon32"
      ? "favicon-32"
      : "favicon-192";
  return tenantPath(tenantId, "branding", name);
}

export function buildBrandingPreviewUrl(baseUrl: string, tenantSlug: string): string {
  try {
    const url = new URL("/home", baseUrl);
    url.searchParams.set("tenant", tenantSlug);
    url.searchParams.set("preview", "lume");
    return url.toString();
  } catch {
    return "";
  }
}

export async function uploadTenantBrandingAsset(
  client: StorageClient,
  tenantId: string,
  kind: BrandingAssetKind,
  file: File,
): Promise<UploadedBrandingAsset> {
  const dimensions = kind === "logo" ? {} : await readImageDimensions(file);
  const validationError = validateBrandingAsset({
    type: file.type,
    size: file.size,
    ...dimensions,
  }, kind);
  if (validationError) throw new Error(validationError);

  const objectKey = brandingAssetObjectKey(tenantId, kind);
  const { error } = await client.storage.from(TENANT_BUCKETS.logos).upload(objectKey, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(error.message);

  const baseUrl = publicUrl(client, TENANT_BUCKETS.logos, objectKey);
  const separator = baseUrl.includes("?") ? "&" : "?";
  return {
    objectKey,
    url: `${baseUrl}${separator}v=${file.lastModified || Date.now()}`,
  };
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const finish = () => URL.revokeObjectURL(objectUrl);
    image.onload = () => {
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
      finish();
      resolve(dimensions);
    };
    image.onerror = () => {
      finish();
      reject(new Error("The selected image could not be decoded."));
    };
    image.src = objectUrl;
  });
}
