import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadConciergeTargets } from "@/lib/conciergeTargets";
import ConciergeTargetsClient from "./ConciergeTargetsClient";

type PageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function ConciergeTargetsPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const [loaded, manageResult] = await Promise.all([
    loadConciergeTargets(supabase, tenant.id),
    supabase.rpc("user_has_tenant_role", {
      p_tenant_id: tenant.id,
      p_roles: ["owner", "admin"],
    }),
  ]);

  return (
    <ConciergeTargetsClient
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      initialTargets={loaded.targets}
      migrationWarning={loaded.warning}
      canManage={manageResult.data === true}
    />
  );
}
