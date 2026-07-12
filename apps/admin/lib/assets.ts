import type { SupabaseClient } from "@supabase/supabase-js";
import {
  publicUrl,
  TENANT_BUCKETS,
  tenantPath,
  validateUploadWithBytes,
  type Database,
} from "@lume/db";

export type TenantAsset = {
  name: string;
  objectKey: string;
  url: string;
  updatedAt: string | null;
  contentType: string | null;
};

export type TenantAssetFilter = "all" | "image" | "other";

type StorageClient = SupabaseClient<Database, "public">;

export async function listTenantMediaAssets(
  client: StorageClient,
  tenantId: string
): Promise<TenantAsset[]> {
  const { data, error } = await client.storage.from(TENANT_BUCKETS.media).list(tenantId, {
    limit: 100,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((item) => item.name && item.id)
    .map((item) => {
      const objectKey = tenantPath(tenantId, item.name);
      return {
        name: item.name,
        objectKey,
        url: publicUrl(client, TENANT_BUCKETS.media, objectKey),
        updatedAt: item.updated_at ?? item.created_at ?? null,
        contentType: item.metadata?.mimetype ?? null,
      };
    });
}

export async function uploadTenantMediaAsset(
  client: StorageClient,
  tenantId: string,
  file: File
): Promise<TenantAsset> {
  // SCRUM-164: per-bucket MIME + size whitelist with magic-byte sniffing, so a
  // renamed binary can't land in the public media bucket as an "image".
  const leadingBytes = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  const validation = validateUploadWithBytes(
    TENANT_BUCKETS.media,
    { type: file.type, size: file.size },
    leadingBytes
  );
  if (!validation.ok) throw new Error(validation.error);

  const name = sanitizeAssetFileName(file.name);
  const objectKey = tenantPath(tenantId, name);
  const { error } = await client.storage.from(TENANT_BUCKETS.media).upload(objectKey, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return {
    name,
    objectKey,
    url: publicUrl(client, TENANT_BUCKETS.media, objectKey),
    updatedAt: new Date().toISOString(),
    contentType: file.type || null,
  };
}

export function sanitizeAssetFileName(name: string): string {
  const leafName = name.trim().split(/[\\/]+/).filter(Boolean).pop() ?? "";
  const [baseName, extension] = splitExtension(leafName.toLowerCase());
  const safeBaseName = baseName
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const safeExtension = extension.replace(/[^a-z0-9]/g, "").slice(0, 12);
  return `${safeBaseName || "asset"}${safeExtension ? `.${safeExtension}` : ""}`;
}

export function tenantAssetType(asset: TenantAsset): Exclude<TenantAssetFilter, "all"> {
  return asset.contentType?.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/i.test(asset.name)
    ? "image"
    : "other";
}

export function filterTenantAssets(
  assets: readonly TenantAsset[],
  query: string,
  type: TenantAssetFilter
): TenantAsset[] {
  const normalizedQuery = query.trim().toLowerCase();
  return assets.filter((asset) => {
    const matchesQuery =
      !normalizedQuery ||
      asset.name.toLowerCase().includes(normalizedQuery) ||
      asset.objectKey.toLowerCase().includes(normalizedQuery);
    return matchesQuery && (type === "all" || tenantAssetType(asset) === type);
  });
}

function splitExtension(name: string): [string, string] {
  const index = name.lastIndexOf(".");
  if (index <= 0 || index === name.length - 1) return [name, ""];
  return [name.slice(0, index), name.slice(index + 1)];
}
