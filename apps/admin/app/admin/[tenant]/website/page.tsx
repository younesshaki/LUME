import { notFound } from "next/navigation";
import { listPages } from "@lume/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
    />
  );
}
