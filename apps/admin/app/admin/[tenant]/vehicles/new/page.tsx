import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import VehicleForm from "../VehicleForm";

type PageProps = { params: Promise<{ tenant: string }> };

export default async function NewVehiclePage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!tenant) notFound();

  return <VehicleForm tenantId={tenant.id} tenantSlug={tenant.slug} />;
}
