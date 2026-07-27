"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@lume/db/server";
import { auditWrite } from "@/lib/audit";
import {
  normalizeBulkPriceRule,
  normalizeSelectedVehicleIds,
  previewBulkVehiclePrices,
  type BulkVehicleRow,
} from "@/lib/bulkVehicles";
import type { VehicleStatus } from "@lume/types";
import {
  VEHICLE_STATUSES,
  isVehicleStatusTransitionAllowed,
  normalizeVehicleStatusFilter,
} from "@/lib/vehicleStatus";
import { normalizeVehicleImageFilter } from "@/lib/vehicleGrid";
import {
  ARCHIVABLE_STATUSES,
  chunk,
  filterRowsByImagePresence,
  READ_PAGE_SIZE,
  selectVehicleIdsWithoutImages,
  WRITE_CHUNK_SIZE,
  type VehicleImageSourceRow,
} from "@/lib/vehiclesWithoutImages";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BulkVehicleActionResult = {
  error?: string;
  affected?: number;
};

type AuthorizedSelection = {
  tenantId: string;
  userId: string;
  ids: string[];
  vehicles: BulkVehicleRow[];
  service: ReturnType<typeof createServiceClient>;
};

export async function bulkSetVehicleStatus(
  slug: string,
  rawIds: string[],
  rawStatus: string,
): Promise<BulkVehicleActionResult> {
  const status = VEHICLE_STATUSES.find((option) => option.value === rawStatus)?.value;
  if (!status) return { error: "Choose a valid vehicle status." };

  const selection = await loadAuthorizedSelection(slug, rawIds);
  if ("error" in selection) return selection;
  if (selection.vehicles.some((vehicle) => !isVehicleStatusTransitionAllowed(
    vehicle.status,
    Boolean(vehicle.soldAt),
    status,
  ))) {
    return { error: "One or more sold vehicles cannot move to that status." };
  }

  try {
    const { data, error } = await selection.service
      .from("vehicles")
      .update({ status })
      .eq("tenant_id", selection.tenantId)
      .in("id", selection.ids)
      .select("id");
    if (error || !data || data.length !== selection.ids.length) {
      return { error: "Unable to update the selected vehicle statuses." };
    }
    await recordBulkAudit(selection, "vehicle.bulk_status", {
      status,
      affected: data.length,
    });
    revalidatePath(`/admin/${slug}/vehicles`);
    return { affected: data.length };
  } catch {
    return { error: "Bulk vehicle updates are not configured." };
  }
}

export async function bulkUpdateVehiclePrices(
  slug: string,
  rawIds: string[],
  rawKind: string,
  rawValue: number,
): Promise<BulkVehicleActionResult> {
  const rule = normalizeBulkPriceRule(rawKind, rawValue);
  if (!rule) return { error: "Choose a valid, non-zero price rule." };

  const selection = await loadAuthorizedSelection(slug, rawIds);
  if ("error" in selection) return selection;
  if (selection.vehicles.some((vehicle) => vehicle.soldAt !== null)) {
    return { error: "Sold vehicle prices are frozen. Deselect sold vehicles first." };
  }
  const preview = previewBulkVehiclePrices(selection.vehicles, rule);
  if (preview.error) return { error: preview.error };

  try {
    const { data, error } = await selection.service.rpc("bulk_update_vehicle_prices", {
      p_tenant_id: selection.tenantId,
      p_vehicle_ids: selection.ids,
      p_rule: rule.kind,
      p_value: rule.value,
    });
    if (error || data !== selection.ids.length) {
      return { error: "Unable to update the selected vehicle prices." };
    }
    await recordBulkAudit(selection, "vehicle.bulk_price", {
      rule,
      affected: data,
      totalBefore: preview.totalBefore,
      totalAfter: preview.totalAfter,
    });
    revalidatePath(`/admin/${slug}/vehicles`);
    return { affected: data };
  } catch {
    return { error: "Bulk price updates are not configured." };
  }
}

export async function bulkDeleteVehicles(
  slug: string,
  rawIds: string[],
): Promise<BulkVehicleActionResult> {
  const selection = await loadAuthorizedSelection(slug, rawIds);
  if ("error" in selection) return selection;
  if (selection.vehicles.some((vehicle) => vehicle.soldAt !== null)) {
    return { error: "Sold vehicle history cannot be deleted." };
  }

  try {
    const { data, error } = await selection.service
      .from("vehicles")
      .delete()
      .eq("tenant_id", selection.tenantId)
      .in("id", selection.ids)
      .select("id");
    if (error || !data || data.length !== selection.ids.length) {
      return { error: "Unable to delete the selected vehicles." };
    }
    await recordBulkAudit(selection, "vehicle.bulk_delete", { affected: data.length });
    revalidatePath(`/admin/${slug}/vehicles`);
    return { affected: data.length };
  } catch {
    return { error: "Bulk vehicle deletion is not configured." };
  }
}

export type InventoryFilterInput = {
  status?: string;
  q?: string;
  images?: string;
};

export type FilterScopeStatusResult = BulkVehicleActionResult & {
  /** Rows the filter matched but whose status transition is not allowed. */
  skipped?: number;
};

/**
 * Set the status of every vehicle matching an inventory filter.
 *
 * The checkbox path is capped at MAX_BULK_VEHICLES and one page of 25, which
 * cannot express "every vehicle in this view". This takes the filter itself
 * and resolves it server-side, so the client never has to carry thousands of
 * ids — and the filter is re-normalized here rather than trusted.
 *
 * Vehicles whose transition is not allowed (sold rows, mostly) are skipped and
 * counted rather than failing the whole operation, which is the only workable
 * behaviour at this scale.
 */
export async function bulkSetVehicleStatusForFilter(
  slug: string,
  filter: InventoryFilterInput,
  rawStatus: string,
): Promise<FilterScopeStatusResult> {
  const status = VEHICLE_STATUSES.find((option) => option.value === rawStatus)?.value;
  if (!status) return { error: "Choose a valid vehicle status." };

  const auth = await authorizeTenantEditor(slug);
  if ("error" in auth) return { error: auth.error };

  try {
    const rows = await loadVehiclesForFilter(auth.service, auth.tenantId, filter);
    const eligible = rows.filter((row) =>
      isVehicleStatusTransitionAllowed(row.status, Boolean(row.sold_at), status),
    );
    const skipped = rows.length - eligible.length;
    if (eligible.length === 0) return { affected: 0, skipped };

    let affected = 0;
    for (const batch of chunk(eligible.map((row) => row.id), WRITE_CHUNK_SIZE)) {
      const { data, error } = await auth.service
        .from("vehicles")
        .update({ status })
        .eq("tenant_id", auth.tenantId)
        .in("id", batch)
        .select("id");
      if (error) return { error: "Unable to update the matching vehicles." };
      affected += data?.length ?? 0;
    }

    await auditWrite({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "vehicle.bulk_status_by_filter",
      resourceType: "vehicle",
      metadata: { status, filter, affected, skipped },
    }).catch(() => undefined);

    revalidatePath(`/admin/${slug}/vehicles`);
    return { affected, skipped };
  } catch {
    return { error: "Bulk vehicle updates are not configured." };
  }
}

/** How many vehicles the given inventory filter matches right now. */
export async function countVehiclesMatchingFilter(
  slug: string,
  filter: InventoryFilterInput,
): Promise<{ error?: string; count?: number }> {
  const auth = await authorizeTenantEditor(slug);
  if ("error" in auth) return { error: auth.error };

  try {
    const rows = await loadVehiclesForFilter(auth.service, auth.tenantId, filter);
    return { count: rows.length };
  } catch {
    return { error: "Unable to count the matching vehicles." };
  }
}

type FilteredVehicleRow = VehicleImageSourceRow & {
  status: VehicleStatus;
  sold_at: string | null;
};

/**
 * Resolve an inventory filter to rows, mirroring the inventory page's own
 * query so the count the user is shown matches what gets changed.
 *
 * Status and search run in Postgres (identical operators to the page); the
 * photo filter is applied in JS against a paged set of managed-image ids,
 * exactly as the page does.
 */
async function loadVehiclesForFilter(
  service: ReturnType<typeof createServiceClient>,
  tenantId: string,
  filter: InventoryFilterInput,
): Promise<FilteredVehicleRow[]> {
  const status = normalizeVehicleStatusFilter(filter.status);
  const images = normalizeVehicleImageFilter(filter.images);
  const q = (filter.q ?? "").trim();

  const rows: FilteredVehicleRow[] = [];
  for (let page = 0; ; page++) {
    let query = service
      .from("vehicles")
      .select("id, status, sold_at, image_src, special_image_src")
      .eq("tenant_id", tenantId);

    if (status === "active") query = query.neq("status", "archived");
    else if (status !== "all") query = query.eq("status", status);

    if (q) {
      const term = `%${q.replace(/[%_]/g, (match) => `\\${match}`)}%`;
      query = query.or(`make.ilike.${term},model.ilike.${term},trim.ilike.${term}`);
    }

    const from = page * READ_PAGE_SIZE;
    const { data, error } = await query
      .order("id", { ascending: true })
      .range(from, from + READ_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as FilteredVehicleRow[]));
    if (!data || data.length < READ_PAGE_SIZE) break;
  }

  if (images === "all" || rows.length === 0) return rows;
  return filterRowsByImagePresence(rows, await loadManagedVehicleIds(service, tenantId), images);
}

/** Every vehicle id in the tenant that has at least one managed R2 image. */
async function loadManagedVehicleIds(
  service: ReturnType<typeof createServiceClient>,
  tenantId: string,
): Promise<Set<string>> {
  const managedVehicleIds = new Set<string>();
  for (let page = 0; ; page++) {
    const from = page * READ_PAGE_SIZE;
    const { data, error } = await service
      .from("vehicle_images")
      .select("vehicle_id")
      .eq("tenant_id", tenantId)
      .order("vehicle_id", { ascending: true })
      .range(from, from + READ_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const image of data ?? []) managedVehicleIds.add(image.vehicle_id);
    if (!data || data.length < READ_PAGE_SIZE) break;
  }
  return managedVehicleIds;
}

/**
 * How many vehicles bulk photo-archiving would touch right now.
 *
 * Deliberately scoped to the whole tenant, not the current page or filters —
 * the selection caps out at MAX_BULK_VEHICLES and one page, which is far too
 * small for "every vehicle without a photo".
 */
export async function countVehiclesWithoutImages(
  slug: string,
): Promise<{ error?: string; count?: number }> {
  const auth = await authorizeTenantEditor(slug);
  if ("error" in auth) return { error: auth.error };

  try {
    const ids = await loadVehicleIdsWithoutImages(auth.service, auth.tenantId);
    return { count: ids.length };
  } catch {
    return { error: "Unable to check which vehicles are missing photos." };
  }
}

/** Archive every draft/live vehicle in the tenant that has no photo. */
export async function archiveVehiclesWithoutImages(
  slug: string,
): Promise<BulkVehicleActionResult> {
  const auth = await authorizeTenantEditor(slug);
  if ("error" in auth) return { error: auth.error };

  try {
    const ids = await loadVehicleIdsWithoutImages(auth.service, auth.tenantId);
    if (ids.length === 0) return { affected: 0 };

    let affected = 0;
    for (const batch of chunk(ids, WRITE_CHUNK_SIZE)) {
      const { data, error } = await auth.service
        .from("vehicles")
        .update({ status: "archived" })
        .eq("tenant_id", auth.tenantId)
        // Re-assert the status guard at write time: a vehicle may have been
        // sold between the read above and this update.
        .in("status", ARCHIVABLE_STATUSES)
        .in("id", batch)
        .select("id");
      if (error) return { error: "Unable to archive the vehicles without photos." };
      affected += data?.length ?? 0;
    }

    await auditWrite({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "vehicle.bulk_archive_without_images",
      resourceType: "vehicle",
      metadata: { affected, candidates: ids.length },
    }).catch(() => undefined);

    revalidatePath(`/admin/${slug}/vehicles`);
    return { affected };
  } catch {
    return { error: "Bulk vehicle updates are not configured." };
  }
}

/**
 * Every draft/live vehicle id in the tenant with no photo from any source.
 *
 * Reads are paged because PostgREST caps a select at 1000 rows — this tenant
 * already has more vehicles than that, so a single select would silently
 * archive only part of the inventory.
 */
async function loadVehicleIdsWithoutImages(
  service: ReturnType<typeof createServiceClient>,
  tenantId: string,
): Promise<string[]> {
  const candidates: VehicleImageSourceRow[] = [];
  for (let page = 0; ; page++) {
    const from = page * READ_PAGE_SIZE;
    const { data, error } = await service
      .from("vehicles")
      .select("id, image_src, special_image_src")
      .eq("tenant_id", tenantId)
      .in("status", ARCHIVABLE_STATUSES)
      .order("id", { ascending: true })
      .range(from, from + READ_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    candidates.push(...(data ?? []));
    if (!data || data.length < READ_PAGE_SIZE) break;
  }
  if (candidates.length === 0) return [];

  return selectVehicleIdsWithoutImages(
    candidates,
    await loadManagedVehicleIds(service, tenantId),
  );
}

async function authorizeTenantEditor(
  slug: string,
): Promise<
  | { tenantId: string; userId: string; service: ReturnType<typeof createServiceClient> }
  | { error: string }
> {
  try {
    const supabase = await createSupabaseServerClient();
    const [tenantResult, userResult] = await Promise.all([
      supabase.from("tenants").select("id").eq("slug", slug).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    const tenant = tenantResult.data;
    const user = userResult.data.user;
    if (!user) return { error: "Sign in to manage vehicles." };
    if (!tenant) return { error: "Tenant not found." };

    const { data: allowed, error: roleError } = await supabase.rpc("user_has_tenant_role", {
      p_tenant_id: tenant.id,
      p_roles: ["owner", "admin", "editor"],
    });
    if (roleError || !allowed) return { error: "Editor access is required." };

    return { tenantId: tenant.id, userId: user.id, service: createServiceClient() };
  } catch {
    return { error: "Bulk vehicle operations are not configured." };
  }
}

async function loadAuthorizedSelection(
  slug: string,
  rawIds: string[],
): Promise<AuthorizedSelection | { error: string }> {
  const normalized = normalizeSelectedVehicleIds(rawIds);
  if (normalized.error) return { error: normalized.error };

  try {
    const supabase = await createSupabaseServerClient();
    const [tenantResult, userResult] = await Promise.all([
      supabase.from("tenants").select("id").eq("slug", slug).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    const tenant = tenantResult.data;
    const user = userResult.data.user;
    if (!user) return { error: "Sign in to manage vehicles." };
    if (!tenant) return { error: "Tenant not found." };

    const { data: allowed, error: roleError } = await supabase.rpc("user_has_tenant_role", {
      p_tenant_id: tenant.id,
      p_roles: ["owner", "admin", "editor"],
    });
    if (roleError || !allowed) return { error: "Editor access is required." };

    const service = createServiceClient();
    const { data, error } = await service
      .from("vehicles")
      .select("id, price, status, sold_at")
      .eq("tenant_id", tenant.id)
      .in("id", normalized.ids);
    if (error || !data || data.length !== normalized.ids.length) {
      return { error: "One or more selected vehicles no longer exist." };
    }
    return {
      tenantId: tenant.id,
      userId: user.id,
      ids: normalized.ids,
      vehicles: data.map((vehicle) => ({
        id: vehicle.id,
        price: vehicle.price,
        status: vehicle.status,
        soldAt: vehicle.sold_at,
      })),
      service,
    };
  } catch {
    return { error: "Bulk vehicle operations are not configured." };
  }
}

async function recordBulkAudit(
  selection: AuthorizedSelection,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await auditWrite({
    tenantId: selection.tenantId,
    actorUserId: selection.userId,
    action,
    resourceType: "vehicle",
    metadata: { ...metadata, vehicleIds: selection.ids },
  }).catch(() => undefined);
}
