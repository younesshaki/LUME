/**
 * Supplier-hosted imagery is intentionally separate from vehicle_images.
 * vehicle_images contains only tenant-owned R2 objects; feed URLs are safe
 * display fallbacks until an editor explicitly imports them.
 */
/** Feed galleries may exceed the 20-image managed R2 gallery cap. */
export const MAX_FEED_VEHICLE_IMAGES = 50;

export type FeedVehicleImageSource = {
  image_src: string;
  feed_image_urls: string[] | null | undefined;
};

export function isSafeFeedVehicleImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2_048) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && !url.username && !url.password && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** The legacy primary URL is always first, followed by source-feed order. */
export function resolveFeedVehicleImageUrls(source: FeedVehicleImageSource): string[] {
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const candidate of [source.image_src, ...(source.feed_image_urls ?? [])]) {
    const url = candidate.trim();
    if (!isSafeFeedVehicleImageUrl(url) || seen.has(url)) continue;
    seen.add(url);
    resolved.push(url);
    if (resolved.length === MAX_FEED_VEHICLE_IMAGES) break;
  }
  return resolved;
}

/** Only URLs already persisted on this exact vehicle may be copied into R2. */
export function selectFeedVehicleImageUrls(
  source: FeedVehicleImageSource,
  requested: readonly string[],
): string[] {
  const allowed = new Set(resolveFeedVehicleImageUrls(source));
  const selected: string[] = [];
  for (const candidate of requested) {
    const url = candidate.trim();
    if (!allowed.has(url) || selected.includes(url)) continue;
    selected.push(url);
    if (selected.length === MAX_FEED_VEHICLE_IMAGES) break;
  }
  return selected;
}

export function parseFeedVehicleImageImport(value: unknown): string[] | null {
  if (!isRecord(value) || !Array.isArray(value.urls) || value.urls.length < 1) return null;
  if (value.urls.length > MAX_FEED_VEHICLE_IMAGES) return null;
  const urls = value.urls.filter((url): url is string => typeof url === "string");
  return urls.length === value.urls.length ? urls : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
