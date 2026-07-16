import { SITE_MODES, type SiteMode } from "@lume/types";

export const SITE_BACKGROUND_MAX_BYTES = 8 * 1024 * 1024;
export const SITE_BACKGROUND_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

export type SiteBackgroundCandidate = { name: string; type: string; size: number };

export function validateSiteBackgroundCandidate(candidate: SiteBackgroundCandidate): string | null {
  if (!SITE_BACKGROUND_MIME_TYPES.includes(candidate.type as (typeof SITE_BACKGROUND_MIME_TYPES)[number])) {
    return "Choose a JPEG, PNG, WebP, or AVIF image.";
  }
  if (!Number.isFinite(candidate.size) || candidate.size <= 0 || candidate.size > SITE_BACKGROUND_MAX_BYTES) {
    return "Choose an image no larger than 8 MB.";
  }
  return null;
}

export function siteBackgroundObjectKey(
  tenantId: string,
  mode: SiteMode,
  mimeType: string,
  id: string,
): string {
  if (!SITE_MODES.includes(mode)) throw new Error("Unsupported website mode.");
  const extension = extensionForMimeType(mimeType);
  if (!extension) throw new Error("Unsupported website background format.");
  return `${tenantId}/site-design/${mode}/siteBackground-${id}.${extension}`;
}

/**
 * Whether a background URL is a legitimate asset for this tenant.
 *
 * Root-relative product assets are allowed. An absolute URL must be https AND
 * (when `allowedOrigin` is supplied) live on the tenant-media storage origin —
 * pinning the host, not just the path substring, so a privileged user cannot
 * point the background at an arbitrary or internal host (blind SSRF via the
 * server-side upload verification) or reference another tenant's prefix.
 */
export function isTenantSiteDesignAssetUrl(
  url: string,
  tenantId: string,
  allowedOrigin?: string,
): boolean {
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (allowedOrigin && parsed.origin !== allowedOrigin) return false;
    const path = decodeURIComponent(parsed.pathname);
    return path.includes(`/storage/v1/object/public/tenant-media/${tenantId}/site-design/`);
  } catch {
    return false;
  }
}

function extensionForMimeType(mimeType: string): string | null {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/avif") return "avif";
  return null;
}
