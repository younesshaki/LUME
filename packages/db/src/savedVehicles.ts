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
  operationalEventId: string | null;
};

export type RemoveVehicleSaveResult = {
  removed: boolean;
  operationalEventId: string | null;
};

/**
 * Atomically saves a vehicle for a tenant visitor. The composite unique index
 * backs the idempotency guarantee during concurrent requests.
 */
export async function saveVehicleForVisitor(
  client: DbClient,
  input: { tenantId: string; visitorId: string; vehicleId: string },
): Promise<SaveVehicleResult> {
  const row = await mutateSavedVehicle(client, input, "save");
  if (!row.saved_id || !row.saved_at) {
    throw new Error("Unable to save vehicle: RPC returned no saved row.");
  }
  return {
    saved: { id: row.saved_id, vehicleId: row.vehicle_id, createdAt: row.saved_at },
    created: row.changed,
    operationalEventId: row.operational_event_id,
  };
}

export async function removeVehicleSaveForVisitor(
  client: DbClient,
  input: { tenantId: string; visitorId: string; vehicleId: string },
): Promise<RemoveVehicleSaveResult> {
  const row = await mutateSavedVehicle(client, input, "unsave");
  return { removed: row.changed, operationalEventId: row.operational_event_id };
}

async function mutateSavedVehicle(
  client: DbClient,
  input: { tenantId: string; visitorId: string; vehicleId: string },
  operation: "save" | "unsave",
) {
  const { data, error } = await client.rpc("mutate_visitor_saved_vehicle", {
    p_tenant_id: input.tenantId,
    p_visitor_id: input.visitorId,
    p_vehicle_id: input.vehicleId,
    p_operation: operation,
  });
  if (error) throw new Error(`Unable to ${operation === "save" ? "save" : "remove saved"} vehicle: ${error.message}`);
  const row = data?.[0];
  if (!row) throw new Error("Unable to mutate saved vehicle: RPC returned no result.");
  return row;
}
