import { notFound } from "next/navigation";
import { listPages } from "@lume/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { evaluateLaunchReadiness, type LaunchReadinessReport, type TenantLaunchSnapshot } from "@/lib/launchReadiness";
import { loadTenantLaunchSnapshot } from "@/lib/launchReadiness.server";
import WebsiteClient from "./WebsiteClient";

type PageProps = { params: Promise<{ tenant: string }> };

export default async function WebsitePage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name, theme")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const pages = await listPages(supabase, tenant.id);
  const publicSiteBaseUrl =
    process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ?? "https://lume-jade-three.vercel.app";

  // Dealer Launch Certification: one snapshot feeds both profile reports. A
  // loader failure must not take down Website Studio — surface a flag instead.
  let snapshot: TenantLaunchSnapshot | null = null;
  let launchLoadError = false;
  try {
    snapshot = await loadTenantLaunchSnapshot(supabase, slug);
  } catch {
    launchLoadError = true;
  }
  if (!launchLoadError && !snapshot) notFound();

  let pilotReport: LaunchReadinessReport | null = null;
  let publicReport: LaunchReadinessReport | null = null;
  if (snapshot) {
    const generatedAt = new Date().toISOString();
    pilotReport = evaluateLaunchReadiness(snapshot, "pilot", generatedAt);
    publicReport = evaluateLaunchReadiness(snapshot, "public", generatedAt);
  }

  const theme =
    tenant.theme && typeof tenant.theme === "object" && !Array.isArray(tenant.theme)
      ? (tenant.theme as Record<string, unknown>)
      : {};
  const navLoader =
    theme.navLoader && typeof theme.navLoader === "object" ? (theme.navLoader as Record<string, unknown>) : {};
  // On by default; a tenant opts out by setting enabled === false.
  const navLoaderEnabled = navLoader.enabled !== false;

  return (
    <WebsiteClient
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      publicSiteBaseUrl={publicSiteBaseUrl}
      pages={pages}
      navLoaderEnabled={navLoaderEnabled}
      pilotReport={pilotReport}
      publicReport={publicReport}
      launchLoadError={launchLoadError}
    />
  );
}
