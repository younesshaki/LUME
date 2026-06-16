/**
 * Tenant storage helpers — SCRUM-159.
 *
 * Every object in the tenant buckets lives under a top-level folder equal to
 * the owning tenant's id (`{tenant_id}/...`). The RLS policies in migration
 * 013 enforce that. These helpers make the convention impossible to get wrong
 * from application code and provide a typed signed-URL helper for the private
 * buckets (csvs, 3d-models) which are not publicly readable.
 *
 * The functions take a SupabaseClient so they work with either a service-role
 * client (server, bypasses RLS) or an authenticated browser client (RLS
 * enforces tenant scope). They never read env directly.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

export const TENANT_BUCKETS = {
  logos: "tenant-logos",
  media: "tenant-media",
  csvs: "tenant-csvs",
  models: "tenant-3d-models",
} as const;

export type TenantBucket = (typeof TENANT_BUCKETS)[keyof typeof TENANT_BUCKETS];

/** Buckets that are NOT publicly readable — access them via signed URLs. */
export const PRIVATE_BUCKETS: readonly TenantBucket[] = [
  TENANT_BUCKETS.csvs,
  TENANT_BUCKETS.models,
];

/**
 * Build a tenant-scoped object key. Throws if any segment is empty or tries to
 * traverse out of the tenant folder — defense against path injection.
 *
 *   tenantPath("abc", "logos", "logo.png") → "abc/logos/logo.png"
 */
export function tenantPath(tenantId: string, ...segments: string[]): string {
  if (!tenantId) throw new Error("[storage] tenantId is required");
  const parts = [tenantId, ...segments];
  for (const part of parts) {
    if (!part || part.includes("..") || part.startsWith("/")) {
      throw new Error(`[storage] invalid path segment: ${JSON.stringify(part)}`);
    }
  }
  return parts.join("/");
}

/** True if `objectKey` is inside `tenantId`'s folder. */
export function isTenantOwnedPath(tenantId: string, objectKey: string): boolean {
  return objectKey === tenantId || objectKey.startsWith(`${tenantId}/`);
}

type AnySupabaseClient = SupabaseClient<Database> | SupabaseClient;

/**
 * Create a time-limited signed URL for a private object. Returns null on error
 * (e.g. the object does not exist or RLS denied access) rather than throwing,
 * so callers can render a fallback.
 *
 * @param expiresInSeconds defaults to 1 hour.
 */
export async function createSignedUrl(
  client: AnySupabaseClient,
  bucket: TenantBucket,
  objectKey: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(objectKey, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Signed URL for a private object, enforcing the tenant-prefixed path. Use this
 * from server code instead of createSignedUrl when you have a tenantId — it
 * guarantees you can never sign a URL for another tenant's object key.
 */
export function createTenantSignedUrl(
  client: AnySupabaseClient,
  bucket: TenantBucket,
  tenantId: string,
  relativePath: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  return createSignedUrl(
    client,
    bucket,
    tenantPath(tenantId, relativePath),
    expiresInSeconds
  );
}

/** Public CDN URL for an object in a public bucket (logos, media). */
export function publicUrl(
  client: AnySupabaseClient,
  bucket: Extract<TenantBucket, "tenant-logos" | "tenant-media">,
  objectKey: string
): string {
  return client.storage.from(bucket).getPublicUrl(objectKey).data.publicUrl;
}
