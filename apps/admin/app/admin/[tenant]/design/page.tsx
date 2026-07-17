import { notFound } from "next/navigation";
import { createDefaultSiteDesign, getSiteTemplate } from "@lume/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  listSiteDesignRevisions,
  loadSiteDesign,
} from "@/lib/siteDesign.server";
import DesignClient from "./DesignClient";

type PageProps = { params: Promise<{ tenant: string }> };

export default async function DesignPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const [design, revisions, manageResult] = await Promise.all([
    loadSiteDesign(tenant.slug),
    listSiteDesignRevisions(tenant.slug),
    supabase.rpc("user_has_tenant_role", {
      p_tenant_id: tenant.id,
      p_roles: ["owner", "admin"],
    }),
  ]);
  const publicSiteBaseUrl =
    process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ?? "https://lume-jade-three.vercel.app";
  const previewUrl = `${publicSiteBaseUrl.replace(/\/+$/, "")}/home?tenant=${encodeURIComponent(tenant.slug)}&preview=lume`;

  return (
    <DesignClient
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      initialPublishedDesign={design ?? createDefaultSiteDesign(getSiteTemplate("luxury"))}
      initialRevisions={revisions}
      canManage={manageResult.data === true}
      livePreviewUrl={previewUrl}
    />
  );
}
