export type AntivirusDecision = "scan" | "skip";

const IMAGE_BUCKETS = new Set(["tenant-logos", "tenant-media"]);
const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export function antivirusDecision(bucket: string, contentType: string | null): AntivirusDecision {
  const mime = contentType?.trim().toLowerCase().split(";")[0] ?? "";
  if (IMAGE_BUCKETS.has(bucket) || IMAGE_TYPES.has(mime)) return "skip";
  return bucket === "tenant-csvs" || mime === "application/pdf" ? "scan" : "skip";
}

export function tenantIdFromObjectKey(objectKey: string): string | null {
  const tenantId = objectKey.split("/", 1)[0] ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)
    ? tenantId
    : null;
}
