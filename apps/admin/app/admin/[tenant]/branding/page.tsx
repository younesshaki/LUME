import { notFound } from "next/navigation";
import type { TenantTheme } from "@lume/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildBrandingPreviewUrl } from "@/lib/brandingAssets";
import BrandingClient from "./BrandingClient";

type PageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function BrandingPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const [themeResult, manageResult] = await Promise.all([
    supabase
      .from("tenants")
      .select("theme")
      .eq("id", tenant.id)
      .maybeSingle(),
    supabase.rpc("user_has_tenant_role", {
      p_tenant_id: tenant.id,
      p_roles: ["owner", "admin"],
    }),
  ]);

  const migrationWarning = themeResult.error
    ? themeColumnError(themeResult.error.message)
    : null;
  const publicSiteBaseUrl =
    process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ?? "https://lume-jade-three.vercel.app";

  return (
    <BrandingClient
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      initialTheme={(themeResult.data?.theme ?? {}) as TenantTheme}
      migrationWarning={migrationWarning}
      canManageBranding={manageResult.data === true}
      previewUrl={buildBrandingPreviewUrl(publicSiteBaseUrl, tenant.slug)}
    />
  );
}

function themeColumnError(message: string): string {
  if (message.toLowerCase().includes("theme")) {
    return "Theme storage is not available yet. Apply migration 019_tenant_theme.sql before saving branding changes.";
  }
  return `Unable to load tenant theme: ${message}`;
}
