/**
 * GET /api/vehicles/:id?tenant=<slug>
 *
 * Public, tenant-scoped single-vehicle detail. Returns the full ordered
 * managed-image gallery (primary first, then sort_order, then created_at),
 * unlike the list endpoint which returns only the primary image per vehicle.
 *
 * The vehicle row is read via the anon client + RLS. The gallery metadata is
 * read with the SERVICE-role client, mirroring the root api/vehicles/[id].ts
 * function: the anon RLS policy on vehicle_images gates on the tenants table,
 * which anon cannot read, so an anon gallery read always comes back empty (the
 * placeholder bug). The .eq("tenant_id")/.eq("vehicle_id") filters keep it
 * tenant-scoped for defense in depth.
 *
 * This mirrors the standalone root serverless function api/vehicles/[id].ts
 * so local dev (Vite proxies /api/* here) matches production behavior.
 */
import type { VehicleDetailResponse, VehicleGalleryImage } from "@lume/types";
import { quotaExceededPayload, quotaResponseHeaders, rowToVehicle } from "@lume/db";
import { createAnonServerClient, createServiceClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { corsHeadersFor, isAllowedOrigin } from "@/lib/origin";
import { readR2PublicBaseUrl } from "@/lib/r2Config";
import { vehicleImagePublicUrl } from "@/lib/vehicleImages";
import { resolveFeedVehicleImageUrls } from "@/lib/feedVehicleImages";
import { checkPublicApiQuota } from "@/lib/quota.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isAllowedOrigin(request)) {
    return json({ error: "Forbidden origin" }, 403);
  }

  const { id } = await params;
  const vehicleId = id?.trim();
  if (!vehicleId || !UUID_PATTERN.test(vehicleId)) {
    return json({ error: "Invalid vehicle id" }, 400, request);
  }

  const tenant = await getTenantFromRequest(request);
  if (!tenant) return json({ error: "Unknown or inactive tenant" }, 404, request);

  const quota = await checkPublicApiQuota(tenant.tenantId, "vehicle_requests");
  if (!quota.allowed) return json(quotaExceededPayload(quota), 429, request);
  const quotaHeaders = quotaResponseHeaders(quota);

  const supabase = createAnonServerClient();
  const { data: row, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("tenant_id", tenant.tenantId)
    .eq("id", vehicleId)
    .eq("status", "live")
    .maybeSingle();

  if (error) {
    console.error("[/api/vehicles/:id] query error:", error.message);
    return json({ error: error.message }, 500, request, quotaHeaders);
  }
  if (!row) {
    return json({ error: "Vehicle not found" }, 404, request, quotaHeaders);
  }

  // Service-role read for image metadata (see file header) — anon RLS on
  // vehicle_images is unreadable, so anon returns an empty gallery.
  const gallery = await loadGallery(createServiceClient(), tenant.tenantId, vehicleId);
  const resolvedGallery = gallery.length > 0
    ? gallery
    : resolveFeedVehicleImageUrls({
      image_src: row.image_src,
      feed_image_urls: row.feed_image_urls,
    }).map((src, index) => ({
      src,
      alt: `${row.year} ${row.make} ${row.model}`,
      isPrimary: index === 0,
      sortOrder: index,
    }));
  const primary = resolvedGallery[0];
  const response: VehicleDetailResponse = {
    vehicle: {
      ...rowToVehicle(row),
      primaryImageSrc: primary?.src,
      primaryImageAlt: primary?.alt,
    },
    images: resolvedGallery,
  };
  return json(response, 200, request, quotaHeaders);
}

async function loadGallery(
  supabase: ReturnType<typeof createAnonServerClient>,
  tenantId: string,
  vehicleId: string,
): Promise<VehicleGalleryImage[]> {
  const publicBaseUrl = readR2PublicBaseUrl();
  if (!publicBaseUrl) return [];
  const { data, error } = await supabase
    .from("vehicle_images")
    .select("r2_key, ai_description, is_primary, sort_order")
    .eq("tenant_id", tenantId)
    .eq("vehicle_id", vehicleId)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    // Legacy image_src remains valid if the images table/policy is unavailable.
    console.warn("[/api/vehicles/:id] gallery query unavailable:", error.message);
    return [];
  }

  const images: VehicleGalleryImage[] = [];
  for (const image of data ?? []) {
    const src = vehicleImagePublicUrl(publicBaseUrl, image.r2_key);
    if (!src) continue;
    images.push({
      src,
      ...(image.ai_description ? { alt: image.ai_description } : {}),
      isPrimary: Boolean(image.is_primary),
      sortOrder: image.sort_order ?? 0,
    });
  }
  return images;
}

function json(
  payload: unknown,
  status: number,
  request?: Request,
  responseHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(request ? corsHeadersFor(request) : {}),
      ...responseHeaders,
    },
  });
}
