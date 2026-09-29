import { notFound } from "next/navigation";
import { createDefaultSiteDesign, getSiteTemplate } from "@lume/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  hasWebsiteSectionTourReplayRequest,
  websiteSectionTourStartMode,
} from "@/lib/websiteSectionTour";
import { websiteSectionTourDismissalsFromPreference } from "@/lib/websiteSectionTour.server";
import {
  listSiteDesignDrafts,
  listSiteDesignRevisions,
  loadSiteDesign,
} from "@/lib/siteDesign.server";
import DesignClient from "./DesignClient";

type PageProps = {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ template?: string; tour?: string | string[] }>;
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

  const [userResult, design, drafts, revisions, manageResult] = await Promise.all([
    supabase.auth.getUser(),
    loadSiteDesign(tenant.slug),
    listSiteDesignDrafts(tenant.slug),
    listSiteDesignRevisions(tenant.slug),
    supabase.rpc("user_has_tenant_role", {
      p_tenant_id: tenant.id,
      p_roles: ["owner", "admin"],
    }),
  ]);
  const user = userResult.data.user;
  const { data: preference } = user
    ? await supabase
      .from("tenant_member_preferences")
      .select("website_section_tour_dismissals")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle()
    : { data: null };
  const websiteSectionTourStart = websiteSectionTourStartMode({
    tenantSlug: tenant.slug,
    tourKey: "design",
    dismissals: websiteSectionTourDismissalsFromPreference(preference),
    replayRequested: hasWebsiteSectionTourReplayRequest(query.tour, "design"),
  });
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
      websiteSectionTourStart={websiteSectionTourStart}
      websiteSectionTourDismissible={websiteSectionTourStart === "automatic"}
    />
  );
}
