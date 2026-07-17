import { notFound } from "next/navigation";
import { createDefaultSiteDesign, getSiteTemplate } from "@lume/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadSiteDesign } from "@/lib/siteDesign.server";
import TemplatesClient from "./TemplatesClient";

type PageProps = { params: Promise<{ tenant: string }> };

export default async function TemplatesPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const [design, manageResult] = await Promise.all([
    loadSiteDesign(tenant.slug),
    supabase.rpc("user_has_tenant_role", {
      p_tenant_id: tenant.id,
      p_roles: ["owner", "admin"],
    }),
  ]);

  return (
    <TemplatesClient
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      publishedDesign={design ?? createDefaultSiteDesign(getSiteTemplate("luxury"))}
      canManage={manageResult.data === true}
    />
  );
}
