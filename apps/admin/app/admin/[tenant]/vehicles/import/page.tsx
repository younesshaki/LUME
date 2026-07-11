import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ImportClient from "./ImportClient";

type PageProps = { params: Promise<{ tenant: string }> };

export default async function VehicleImportPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const { data: recentImports } = await supabase
    .from("csv_imports")
    .select(
      "id, source_file_name, mode, status, total_rows, succeeded_rows, failed_rows, skipped_rows, created_at"
    )
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <ImportClient
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      recentImports={recentImports ?? []}
    />
  );
}
