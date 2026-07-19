import { notFound } from "next/navigation";
import { createDefaultSiteDesign, getSiteTemplate } from "@lume/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  listSiteDesignDrafts,
  listSiteDesignRevisions,
  loadSiteDesign,
} from "@/lib/siteDesign.server";
import DesignClient from "./DesignClient";

type PageProps = {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ template?: string }>;
};

export default async function DesignPage({ params, searchParams }: PageProps) {
  const { tenant: slug } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const [design, drafts, revisions, manageResult] = await Promise.all([
    loadSiteDesign(tenant.slug),
    listSiteDesignDrafts(tenant.slug),
    listSiteDesignRevisions(tenant.slug),
    supabase.rpc("user_has_tenant_role", {
      p_tenant_id: tenant.id,
      p_roles: ["owner", "admin"],
    }),
  ]);
  const publicSiteBaseUrl =
    process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ?? "https://lume-jade-three.vercel.app";
  const previewUrl = `${publicSiteBaseUrl.replace(/\/+$/, "")}/home?tenant=${encodeURIComponent(tenant.slug)}&preview=lume`;
  const publishedDesign = design ?? createDefaultSiteDesign(getSiteTemplate("luxury"));
  const queriedTemplate = typeof query.template === "string"
    ? getSiteTemplate(query.template)
    : getSiteTemplate(publishedDesign.template.key);
  const requestedTemplate = query.template === queriedTemplate.key
    ? queriedTemplate
    : getSiteTemplate(publishedDesign.template.key);
  const initialDraft =
    drafts.find((draft) => draft.templateKey === requestedTemplate.key)?.design ??
    (requestedTemplate.key === publishedDesign.template.key
      ? publishedDesign
      : createDefaultSiteDesign(requestedTemplate));

  return (
    <DesignClient
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      initialPublishedDesign={publishedDesign}
      initialDraft={initialDraft}
      initialRevisions={revisions}
      canManage={manageResult.data === true}
      livePreviewUrl={previewUrl}
    />
  );
}
