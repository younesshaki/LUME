import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import VehicleForm from "../VehicleForm";

type PageProps = { params: Promise<{ tenant: string; id: string }> };

export default async function EditVehiclePage({ params }: PageProps) {
  const { tenant: slug, id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!tenant) notFound();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!vehicle) notFound();

  return (
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
  );
}
