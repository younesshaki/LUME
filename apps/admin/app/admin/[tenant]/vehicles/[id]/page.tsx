import { notFound } from "next/navigation";
import type { TenantTheme } from "@lume/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import VehicleForm from "../VehicleForm";
import { VehicleImageUploader } from "../VehicleImageUploader";
import { VehiclePriceHistory } from "../VehiclePriceHistory";

type PageProps = { params: Promise<{ tenant: string; id: string }> };

export default async function EditVehiclePage({ params }: PageProps) {
  const { tenant: slug, id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, theme")
    .eq("slug", slug)
    .maybeSingle();

  if (!tenant) notFound();

  const [vehicleResult, historyResult, imageCountResult, manageResult] = await Promise.all([
    supabase
      .from("vehicles")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    supabase
      .from("price_history")
      .select("id, old_price, new_price, changed_at")
      .eq("tenant_id", tenant.id)
      .eq("vehicle_id", id)
      .order("changed_at", { ascending: false })
      .limit(200),
    supabase
      .from("vehicle_images")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("vehicle_id", id),
    supabase.rpc("user_has_tenant_role", {
      p_tenant_id: tenant.id,
      p_roles: ["owner", "admin"],
    }),
  ]);
  const vehicle = vehicleResult.data;

  if (!vehicle) notFound();
  if (historyResult.error) throw new Error(`Unable to load price history: ${historyResult.error.message}`);
  const theme = tenant.theme as TenantTheme;

  return (
    <div className="space-y-8">
      <VehicleForm
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        vehicleId={vehicle.id}
        initial={{
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          trim: vehicle.trim,
          price: vehicle.price,
          mileage: vehicle.mileage,
          body_style: vehicle.body_style,
          exterior_color: vehicle.exterior_color,
          interior_color: vehicle.interior_color,
          drivetrain: vehicle.drivetrain,
          fuel_type: vehicle.fuel_type,
          stock_type: vehicle.stock_type ?? "Used",
          seller_city: vehicle.seller_city,
          seller_state: vehicle.seller_state,
          status: vehicle.status,
          sold_at: vehicle.sold_at,
          sold_price: vehicle.sold_price,
        }}
      />
      <VehicleImageUploader
        tenantSlug={tenant.slug}
        vehicleId={vehicle.id}
        initialImageCount={imageCountResult.count ?? 0}
        migrationWarning={imageCountResult.error
          ? "Vehicle image metadata is not configured. Apply migration 043_vehicle_images.sql first."
          : null}
      />
      <VehiclePriceHistory
        tenantSlug={tenant.slug}
        currentPrice={vehicle.price}
        history={(historyResult.data ?? []).map((change) => ({
          id: change.id,
          oldPrice: change.old_price,
          newPrice: change.new_price,
          changedAt: change.changed_at,
        }))}
        signalEnabled={theme.vehiclePricing?.showPriceReductionSignal === true}
        canManageSignal={manageResult.data === true}
      />
    </div>
  );
}
