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
import {
  VEHICLE_STATUSES,
  isVehicleStatusTransitionAllowed,
} from "@/lib/vehicleStatus";
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
