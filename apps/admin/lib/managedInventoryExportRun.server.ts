/** Server-only execution of one leased inventory syndication run. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClaimedInventoryExportRun,
  Database,
  InventoryExportRunCompletion,
} from "@lume/db";
import type { Vehicle } from "@lume/types";
import {
  assertValidInventorySyndicationProfile,
  createInventorySyndicationOutput,
  INVENTORY_SYNDICATION_MAX_RECORDS,
} from "@lume/db";
import {
  decryptInventoryIntegrationCredential,
  inventoryIntegrationCredentialHeaders,
} from "@/lib/inventoryIntegrationCredentials.server";
import { deliverManagedInventoryExport } from "@/lib/managedFeedRemoteFetch.server";
import { readR2PublicBaseUrl } from "@/lib/r2Config";
import { MAX_VEHICLE_IMAGES, vehicleImagePublicUrl } from "@/lib/vehicleImages";
import { shouldSkipUnchangedManagedExport } from "./managedInventoryExportPolicy";

export { shouldSkipUnchangedManagedExport } from "./managedInventoryExportPolicy";

type ServiceClient = SupabaseClient<Database, "public">;
type ExportSnapshot = {
  endpointUrl: string;
  httpMethod: "POST" | "PUT";
  exportFormat: "csv" | "json" | "xml";
  profile: Record<string, unknown>;
  configVersion: number;
};

/**
 * Build a deterministic tenant catalog, suppress semantically unchanged
 * payloads, and deliver a bounded HTTPS snapshot via the pinned transport.
 */
export async function executeManagedInventoryExportRun(
  service: ServiceClient,
  run: ClaimedInventoryExportRun,
): Promise<InventoryExportRunCompletion> {
  const snapshot = parseExportSnapshot(run.destinationSnapshot);
  const profile = { ...snapshot.profile, format: snapshot.exportFormat };
  assertValidInventorySyndicationProfile(profile);
  const vehicles = await loadExportVehicles(service, run.tenantId);
  const output = await createInventorySyndicationOutput(vehicles, profile);

  if (shouldSkipUnchangedManagedExport(
    run.lastPayloadHash,
    output,
    run.destinationConfigVersion,
    snapshot.configVersion,
  )) {
    return {
      status: "skipped",
      payloadHash: output.semanticHash,
      recordCount: output.records.length,
      responseStatus: null,
    };
  }

  const credential = run.credentialCiphertext
    ? decryptInventoryIntegrationCredential(run.credentialCiphertext)
    : null;
  // Archiving blocks while a delivery is running. Recheck immediately before
  // the outbound side effect so future worker paths cannot bypass that guard.
  await assertExportDestinationNotArchived(service, run.tenantId, run.exportDestinationId);
  const delivered = await deliverManagedInventoryExport({
    endpointUrl: snapshot.endpointUrl,
    method: snapshot.httpMethod,
    content: new TextEncoder().encode(output.content),
    contentType: contentTypeFor(snapshot.exportFormat),
    headers: inventoryIntegrationCredentialHeaders(credential),
  });
  return {
    status: "succeeded",
    payloadHash: output.semanticHash,
    recordCount: output.records.length,
    responseStatus: delivered.responseStatus,
  };
}

function parseExportSnapshot(value: Record<string, unknown>): ExportSnapshot {
  if (!isPlainRecord(value) || !isPlainRecord(value.profile)) {
    throw new Error("Inventory export run has an invalid destination snapshot.");
  }
  const endpointUrl = typeof value.endpointUrl === "string" ? value.endpointUrl.trim() : "";
  const httpMethod = value.httpMethod;
  const exportFormat = value.exportFormat;
  const configVersion = value.configVersion;
  if (!endpointUrl || (httpMethod !== "POST" && httpMethod !== "PUT") ||
    (exportFormat !== "csv" && exportFormat !== "json" && exportFormat !== "xml") ||
    typeof configVersion !== "number" || !Number.isInteger(configVersion) || configVersion < 1) {
    throw new Error("Inventory export run has an invalid destination snapshot.");
  }
  return { endpointUrl, httpMethod, exportFormat, profile: value.profile, configVersion };
}

async function assertExportDestinationNotArchived(
  service: ServiceClient,
  tenantId: string,
  destinationId: string,
): Promise<void> {
  const { data, error } = await service.from("inventory_export_destinations")
    .select("archived_at")
    .eq("tenant_id", tenantId)
    .eq("id", destinationId)
    .maybeSingle();
  if (error || !data || data.archived_at) {
    throw new Error("Inventory export destination is no longer available.");
  }
}

async function loadExportVehicles(service: ServiceClient, tenantId: string): Promise<Vehicle[]> {
  const rows: Database["public"]["Tables"]["vehicles"]["Row"][] = [];
  const pageSize = 1_000;
  let afterId: string | null = null;
  for (;;) {
    // Fetch one extra record at most. This applies the output bound before we
    // load any image gallery and avoids unbounded memory/DB work for a tenant
    // whose live catalog is too large for this first syndication release.
    const remaining = INVENTORY_SYNDICATION_MAX_RECORDS + 1 - rows.length;
    if (remaining <= 0) {
      throw new Error(`Managed inventory exports support at most ${INVENTORY_SYNDICATION_MAX_RECORDS} live vehicles.`);
    }
    let query = service.from("vehicles")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "live")
      .order("id", { ascending: true })
      .limit(Math.min(pageSize, remaining));
    if (afterId) query = query.gt("id", afterId);
    const { data, error } = await query;
    if (error) throw new Error("Live inventory could not be loaded for export.");
    rows.push(...(data ?? []));
    if (rows.length > INVENTORY_SYNDICATION_MAX_RECORDS) {
      throw new Error(`Managed inventory exports support at most ${INVENTORY_SYNDICATION_MAX_RECORDS} live vehicles.`);
    }
    const fetched = data ?? [];
    if (fetched.length < Math.min(pageSize, remaining)) break;
    afterId = fetched[fetched.length - 1]?.id ?? null;
    if (!afterId) break;
  }

  const managedImages = await loadManagedImageUrls(service, tenantId, rows.map((row) => row.id));
  return rows.map((row) => {
    const managed = managedImages.get(row.id);
    return {
      id: row.id,
      tenantId: row.tenant_id,
      ...(row.external_id ? { externalId: row.external_id } : {}),
      ...(row.feed_vin ? { feedVin: row.feed_vin } : {}),
      feedImageUrls: row.feed_image_urls,
      stockType: row.stock_type ?? "",
      year: row.year,
      make: row.make,
      model: row.model,
      trim: row.trim,
      price: row.price,
      mileage: row.mileage,
      bodyStyle: row.body_style,
      exteriorColor: row.exterior_color,
      interiorColor: row.interior_color,
      drivetrain: row.drivetrain,
      fuelType: row.fuel_type,
      imageSrc: row.image_src,
      ...(managed?.primaryImageSrc ? { primaryImageSrc: managed.primaryImageSrc } : {}),
      ...(managed?.urls.length ? { managedImageUrls: managed.urls } : {}),
      sellerCity: row.seller_city,
      sellerState: row.seller_state,
      isSpecial: row.is_special,
      ...(row.special_image_src ? { specialImageSrc: row.special_image_src } : {}),
      status: row.status,
      soldAt: row.sold_at,
      soldPrice: row.sold_price,
    };
  });
}

type ManagedImageUrls = {
  primaryImageSrc?: string;
  urls: string[];
};

async function loadManagedImageUrls(
  service: ServiceClient,
  tenantId: string,
  vehicleIds: readonly string[],
): Promise<Map<string, ManagedImageUrls>> {
  const publicBaseUrl = readR2PublicBaseUrl();
  if (!publicBaseUrl || vehicleIds.length === 0) return new Map();
  const values = new Map<string, ManagedImageUrls>();
  // The normal managed gallery cap is 20, so this keeps a healthy chunk under
  // common 1,000-row PostgREST caps. Explicit per-chunk paging still prevents
  // silently truncating an old/corrupt gallery that violates that cap.
  const chunkSize = 25;
  const pageSize = 500;
  for (let offset = 0; offset < vehicleIds.length; offset += chunkSize) {
    let pageOffset = 0;
    for (;;) {
      const { data, error } = await service.from("vehicle_images")
        .select("vehicle_id, r2_key, is_primary, sort_order")
        .eq("tenant_id", tenantId)
        .in("vehicle_id", vehicleIds.slice(offset, offset + chunkSize))
        .order("vehicle_id", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .range(pageOffset, pageOffset + pageSize - 1);
      if (error) throw new Error("Managed vehicle images could not be loaded for export.");
      const images = data ?? [];
      for (const image of images) {
        const url = vehicleImagePublicUrl(publicBaseUrl, image.r2_key);
        if (!url) continue;
        const entry = values.get(image.vehicle_id) ?? { urls: [] };
        entry.urls.push(url);
        if (entry.urls.length > MAX_VEHICLE_IMAGES) {
          throw new Error(`Vehicle ${image.vehicle_id} exceeds the ${MAX_VEHICLE_IMAGES}-image managed gallery limit.`);
        }
        if (image.is_primary) entry.primaryImageSrc = url;
        values.set(image.vehicle_id, entry);
      }
      if (images.length < pageSize) break;
      pageOffset += images.length;
    }
  }
  return values;
}

function contentTypeFor(format: ExportSnapshot["exportFormat"]) {
  if (format === "csv") return "text/csv; charset=utf-8" as const;
  if (format === "json") return "application/json; charset=utf-8" as const;
  return "application/xml; charset=utf-8" as const;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
