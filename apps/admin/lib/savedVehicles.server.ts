import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lume/db";

type DbClient = SupabaseClient<Database, "public">;

export type VisitorSavedVehicle = {
  id: string;
  vehicleId: string;
  savedAt: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  price: number | null;
  status: "live" | "sold" | "archived" | "draft" | "unavailable";
  imageSrc: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isVehicleId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export async function isPublicVehicle(
  client: DbClient,
  tenantId: string,
  vehicleId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("vehicles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", vehicleId)
    .eq("status", "live")
    .maybeSingle();
  if (error) throw new Error(`Unable to validate vehicle: ${error.message}`);
  return Boolean(data);
}

export async function listVisitorSavedVehicles(
  client: DbClient,
  tenantId: string,
  visitorId: string,
  limit = 50,
): Promise<VisitorSavedVehicle[]> {
  const { data: saves, error: savesError } = await client
    .from("visitor_saved_vehicles")
    .select("id, vehicle_id, created_at")
    .eq("tenant_id", tenantId)
    .eq("visitor_id", visitorId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (savesError) throw new Error(`Unable to load saved vehicles: ${savesError.message}`);
  if (!saves?.length) return [];

  const vehicleIds = saves.map((save) => save.vehicle_id);
  const [{ data: vehicles, error: vehiclesError }, { data: images, error: imagesError }] = await Promise.all([
    client
      .from("vehicles")
      .select("id, year, make, model, trim, price, status, image_src, special_image_src")
      .eq("tenant_id", tenantId)
      .in("id", vehicleIds),
    client
      .from("vehicle_images")
      .select("vehicle_id, r2_key, is_primary, sort_order, created_at")
      .eq("tenant_id", tenantId)
      .in("vehicle_id", vehicleIds)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  if (vehiclesError) throw new Error(`Unable to load saved vehicle details: ${vehiclesError.message}`);
  if (imagesError) throw new Error(`Unable to load saved vehicle images: ${imagesError.message}`);

  const vehicleById = new Map((vehicles ?? []).map((vehicle) => [vehicle.id, vehicle]));
  const primaryImageByVehicleId = new Map<string, string>();
  for (const image of images ?? []) {
    if (!primaryImageByVehicleId.has(image.vehicle_id)) {
      primaryImageByVehicleId.set(image.vehicle_id, publicImageUrl(image.r2_key));
    }
  }

  return saves.map((save) => {
    const vehicle = vehicleById.get(save.vehicle_id);
    if (!vehicle) {
      return {
        id: save.id,
        vehicleId: save.vehicle_id,
        savedAt: save.created_at,
        year: null,
        make: null,
        model: null,
        trim: null,
        price: null,
        status: "unavailable",
        imageSrc: null,
      };
    }
    return {
      id: save.id,
      vehicleId: save.vehicle_id,
      savedAt: save.created_at,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      price: vehicle.price,
      status: vehicle.status,
      imageSrc: primaryImageByVehicleId.get(vehicle.id) ?? vehicle.special_image_src ?? vehicle.image_src ?? null,
    };
  });
}

function publicImageUrl(key: string): string {
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return base ? `${base}/${key.replace(/^\//, "")}` : key;
}
