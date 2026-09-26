import { notFound } from "next/navigation";
import { listPages } from "@lume/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PagesListClient from "./PagesListClient";

type PageProps = { params: Promise<{ tenant: string }> };

export default async function PagesListPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  // The vehicle-detail layout is only meaningful with actual inventory data.
  // Keep this read tenant-scoped and pass one real record to the editor list so
  // an author can inspect the layout against a genuine vehicle, rather than a
  // generic mockup.
  const [pages, sampleVehicleResult] = await Promise.all([
    listPages(supabase, tenant.id),
    supabase
      .from("vehicles")
      .select("id, year, make, model, trim")
      .eq("tenant_id", tenant.id)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const sampleVehicle = sampleVehicleResult.data
    ? {
        id: sampleVehicleResult.data.id,
        label: [
          sampleVehicleResult.data.year,
          sampleVehicleResult.data.make,
          sampleVehicleResult.data.model,
          sampleVehicleResult.data.trim,
        ]
          .filter(Boolean)
          .join(" "),
      }
    : null;

  const publicSiteBaseUrl =
    process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ?? "https://lume-jade-three.vercel.app";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Pages</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edit draft page content and publish changes for {tenant.name}.
        </p>
      </header>
      <PagesListClient
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        initialPages={pages}
        publicSiteBaseUrl={publicSiteBaseUrl}
        sampleVehicle={sampleVehicle}
      />
    </div>
  );
}
