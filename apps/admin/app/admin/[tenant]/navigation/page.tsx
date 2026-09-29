import { notFound } from "next/navigation";
import { listPages } from "@lume/db";
import type { TenantTheme } from "@lume/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  hasWebsiteSectionTourReplayRequest,
  websiteSectionTourStartMode,
} from "@/lib/websiteSectionTour";
import { websiteSectionTourDismissalsFromPreference } from "@/lib/websiteSectionTour.server";
import NavigationClient from "./NavigationClient";

type PageProps = {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ tour?: string | string[] }>;
};

export default async function NavigationPage({ params, searchParams }: PageProps) {
  const { tenant: slug } = await params;
  const { tour } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name, theme")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  // RLS scopes this to the member's tenants; listPages filters by tenant id.
  const [{ data: userData }, pages] = await Promise.all([
    supabase.auth.getUser(),
    listPages(supabase, tenant.id),
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
    tourKey: "navigation",
    dismissals: websiteSectionTourDismissalsFromPreference(preference),
    replayRequested: hasWebsiteSectionTourReplayRequest(tour, "navigation"),
  });
  const navPages = pages
    .filter((page) => page.publishedRevisionId !== null && page.archivedAt === null)
    .map((page) => ({ slug: page.slug, title: page.title, navOrder: page.navOrder }));

  return (
    <NavigationClient
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      initialTheme={(tenant.theme ?? {}) as TenantTheme}
      navPages={navPages}
      websiteSectionTourStart={websiteSectionTourStart}
      websiteSectionTourDismissible={websiteSectionTourStart === "automatic"}
    />
  );
}
