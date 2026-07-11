/**
 * Tenant-scoped vehicle queries driven by the canonical VehicleQuery type.
 *
 * This is the data layer behind the bot's BotToolContext (SCRUM-144): the
 * chat route wires `queryTenantVehicles`/`getTenantVehicle` into @lume/bot,
 * which stays database-free. Pass an anon client so RLS remains the backstop
 * on top of the explicit tenant filter.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Vehicle, VehicleListResponse, VehicleQuery, VehicleSort } from "@lume/types";
import type { Database } from "./schema";
import { rowToVehicle } from "./mappers";

type DbClient = SupabaseClient<Database, "public">;

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

export async function queryTenantVehicles(
  client: DbClient,
  tenantId: string,
  q: VehicleQuery
): Promise<VehicleListResponse> {
  const limit = clamp(q.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = Math.max(0, q.offset ?? 0);

  let query = client
    .from("vehicles")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("status", "live");

  if (q.make) query = query.ilike("make", escapeLike(q.make));
  if (q.model) query = query.ilike("model", `%${escapeLike(q.model)}%`);
  if (q.bodyStyle) query = query.ilike("body_style", escapeLike(q.bodyStyle));
  if (q.fuelType) query = query.ilike("fuel_type", escapeLike(q.fuelType));
  if (q.drivetrain) query = query.ilike("drivetrain", escapeLike(q.drivetrain));
  if (q.stockType) query = query.ilike("stock_type", escapeLike(q.stockType));
  if (q.sellerState) query = query.ilike("seller_state", escapeLike(q.sellerState));
  if (q.sellerCity) query = query.ilike("seller_city", escapeLike(q.sellerCity));
  if (q.yearMin !== undefined) query = query.gte("year", q.yearMin);
  if (q.yearMax !== undefined) query = query.lte("year", q.yearMax);
  if (q.priceMin !== undefined) query = query.gte("price", q.priceMin);
  if (q.priceMax !== undefined) query = query.lte("price", q.priceMax);
  if (q.mileageMax !== undefined) query = query.lte("mileage", q.mileageMax);
  if (q.query) {
    const term = `%${escapeLike(q.query)}%`;
    query = query.or(`make.ilike.${term},model.ilike.${term},trim.ilike.${term}`);
  }

  query = applySort(query, q.sort ?? "recommended").range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(`vehicle query failed: ${error.message}`);

  const vehicles = (data ?? []).map(rowToVehicle);
  const totalCount = count ?? vehicles.length;
  return {
    vehicles,
    totalCount,
    hasMore: offset + vehicles.length < totalCount,
  };
}

export async function getTenantVehicle(
  client: DbClient,
  tenantId: string,
  vehicleId: string
): Promise<Vehicle | null> {
  const { data, error } = await client
    .from("vehicles")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", vehicleId)
    .eq("status", "live")
    .maybeSingle();
  if (error) throw new Error(`vehicle lookup failed: ${error.message}`);
  return data ? rowToVehicle(data) : null;
}

type VehicleSelectQuery = ReturnType<
  ReturnType<DbClient["from"]>["select"]
>;

function applySort(query: VehicleSelectQuery, sort: VehicleSort): VehicleSelectQuery {
  switch (sort) {
    case "price_asc":
      return query.order("price", { ascending: true });
    case "price_desc":
      return query.order("price", { ascending: false });
    case "year_desc":
      return query.order("year", { ascending: false });
    case "year_asc":
      return query.order("year", { ascending: true });
    case "mileage_asc":
      return query.order("mileage", { ascending: true, nullsFirst: false });
    case "mileage_desc":
      return query.order("mileage", { ascending: false, nullsFirst: false });
    case "recommended":
    default:
      return query
        .order("is_special", { ascending: false })
        .order("created_at", { ascending: false });
  }
}

/** Escape LIKE wildcards in user/LLM-supplied terms so they match literally. */
function escapeLike(value: string): string {
  return value.replace(/[%_]/g, (m) => `\\${m}`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
