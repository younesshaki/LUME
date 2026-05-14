import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import VehicleForm from "../VehicleForm";

type PageProps = { params: Promise<{ tenant: string; id: string }> };

export default async function EditVehiclePage({ params }: PageProps) {
  const { tenant, id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!vehicle) notFound();

  return (
    <VehicleForm
      tenantSlug={tenant}
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
        stock_type: vehicle.stock_type,
        seller_city: vehicle.seller_city,
        seller_state: vehicle.seller_state,
      }}
    />
  );
}
