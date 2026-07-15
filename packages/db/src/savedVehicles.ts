import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

type DbClient = SupabaseClient<Database, "public">;

export type SavedVehicleRow = {
  id: string;
  vehicleId: string;
  createdAt: string;
};

export type SaveVehicleResult = {
  saved: SavedVehicleRow;
  created: boolean;
};

/**
 * Atomically saves a vehicle for a tenant visitor. The composite unique index
 * backs the idempotency guarantee during concurrent requests.
 */
export async function saveVehicleForVisitor(
  client: DbClient,
  input: { tenantId: string; visitorId: string; vehicleId: string },
): Promise<SaveVehicleResult> {
  const insert = await client
    .from("visitor_saved_vehicles")
    .upsert({
      tenant_id: input.tenantId,
      visitor_id: input.visitorId,
      vehicle_id: input.vehicleId,
    }, {
      onConflict: "tenant_id,visitor_id,vehicle_id",
      ignoreDuplicates: true,
    })
    .select("id, vehicle_id, created_at")
    .maybeSingle();

  if (insert.error) throw new Error(`Unable to save vehicle: ${insert.error.message}`);
  if (insert.data) {
    return {
      saved: { id: insert.data.id, vehicleId: insert.data.vehicle_id, createdAt: insert.data.created_at },
      created: true,
    };
  }

  const existing = await client
    .from("visitor_saved_vehicles")
    .select("id, vehicle_id, created_at")
    .eq("tenant_id", input.tenantId)
    .eq("visitor_id", input.visitorId)
    .eq("vehicle_id", input.vehicleId)
    .maybeSingle();
  if (existing.error || !existing.data) {
    throw new Error(`Unable to read saved vehicle: ${existing.error?.message ?? "record missing"}`);
  }
  return {
    saved: { id: existing.data.id, vehicleId: existing.data.vehicle_id, createdAt: existing.data.created_at },
    created: false,
  };
}

export async function removeVehicleSaveForVisitor(
  client: DbClient,
  input: { tenantId: string; visitorId: string; vehicleId: string },
): Promise<void> {
  const { error } = await client
    .from("visitor_saved_vehicles")
    .delete()
    .eq("tenant_id", input.tenantId)
    .eq("visitor_id", input.visitorId)
    .eq("vehicle_id", input.vehicleId);
  if (error) throw new Error(`Unable to remove saved vehicle: ${error.message}`);
}
