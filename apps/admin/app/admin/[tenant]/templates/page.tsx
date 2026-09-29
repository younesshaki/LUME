import { notFound } from "next/navigation";
import { createDefaultSiteDesign, getSiteTemplate } from "@lume/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listSiteDesignDrafts, loadSiteDesign } from "@/lib/siteDesign.server";
import {
  hasWebsiteSectionTourReplayRequest,
  websiteSectionTourStartMode,
} from "@/lib/websiteSectionTour";
import { websiteSectionTourDismissalsFromPreference } from "@/lib/websiteSectionTour.server";
import TemplatesClient from "./TemplatesClient";

type PageProps = {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ tour?: string | string[] }>;
};

type StoredChrome = {
  headerVariant: "centred" | "left" | "split" | "minimal";
  footerVariant: "columns" | "stacked" | "minimal";
};

function hasStoredTemplate(theme: unknown): boolean {
  if (typeof theme !== "object" || theme === null || Array.isArray(theme)) return false;
  const template = (theme as { template?: unknown }).template;
  return typeof template === "object" && template !== null &&
    typeof (template as { key?: unknown }).key === "string";
}

function readStoredChrome(theme: unknown): StoredChrome {
  const source = typeof theme === "object" && theme !== null && !Array.isArray(theme)
    ? theme as { header?: { variant?: unknown }; footer?: { variant?: unknown } }
    : {};
  const headerVariant = source.header?.variant;
  const footerVariant = source.footer?.variant;
  return {
    headerVariant: headerVariant === "left" || headerVariant === "split" || headerVariant === "minimal"
      ? headerVariant
      : "centred",
    footerVariant: footerVariant === "columns" || footerVariant === "minimal"
      ? footerVariant
      : "stacked",
  };
}

export default async function TemplatesPage({ params, searchParams }: PageProps) {
  const { tenant: slug } = await params;
  const { tour } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name, theme, updated_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();
  const storedTemplate = hasStoredTemplate(tenant.theme);
  const chrome = readStoredChrome(tenant.theme);
  const publicSiteBaseUrl =
    process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ?? "https://lume-jade-three.vercel.app";
  const liveSiteUrl = `${publicSiteBaseUrl.replace(/\/+$/, "")}/?tenant=${encodeURIComponent(tenant.slug)}`;

  const [{ data: userData }, design, drafts, manageResult] = await Promise.all([
    supabase.auth.getUser(),
    loadSiteDesign(tenant.slug),
    listSiteDesignDrafts(tenant.slug),
    supabase.rpc("user_has_tenant_role", {
      p_tenant_id: tenant.id,
      p_roles: ["owner", "admin"],
    }),
  ]);
  const user = userData.user;
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
    tourKey: "templates",
    dismissals: websiteSectionTourDismissalsFromPreference(preference),
    replayRequested: hasWebsiteSectionTourReplayRequest(tour, "templates"),
  });

  return (
    <TemplatesClient
        mediaBaseUrl={process.env.R2_PUBLIC_BASE_URL ?? ""}
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      publishedDesign={design ?? createDefaultSiteDesign(getSiteTemplate("luxury"))}
      hasStoredTemplate={storedTemplate}
      publishedAt={storedTemplate ? tenant.updated_at : null}
      headerVariant={chrome.headerVariant}
      footerVariant={chrome.footerVariant}
      liveSiteUrl={liveSiteUrl}
      initialDrafts={drafts}
      canManage={manageResult.data === true}
      websiteSectionTourStart={websiteSectionTourStart}
      websiteSectionTourDismissible={websiteSectionTourStart === "automatic"}
    />
  );
}
