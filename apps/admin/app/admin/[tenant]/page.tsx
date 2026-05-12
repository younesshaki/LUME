import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function TenantOverviewPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name, status")
    .eq("slug", slug)
    .maybeSingle();

  if (!tenant) notFound();

  const [{ count: vehicleCount }, { count: ragCount }] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id),
    supabase
      .from("rag_chunks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{tenant.name}</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Slug: <code>{tenant.slug}</code> · Status: {tenant.status}
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card label="Vehicles in inventory" value={vehicleCount ?? 0} />
        <Card label="RAG chunks indexed" value={ragCount ?? 0} />
      </div>

      <p className="text-sm text-neutral-500">
        Vehicle CRUD, RAG document management, page builder, and analytics will land here in
        follow-up sessions. The data model and APIs are already in place.
      </p>
    </div>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value.toLocaleString()}</p>
    </div>
  );
}
