import { notFound } from "next/navigation";
import type { TenantTheme } from "@lume/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  const { data: themeRow, error: themeError } = await supabase
    .from("tenants")
    .select("theme")
    .eq("id", tenant.id)
    .maybeSingle();

  const migrationWarning = themeError
    ? themeColumnError(themeError.message)
    : null;

  return (
    <BrandingClient
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      initialTheme={(themeRow?.theme ?? {}) as TenantTheme}
      migrationWarning={migrationWarning}
    />
  );
}

function themeColumnError(message: string): string {
  if (message.toLowerCase().includes("theme")) {
    return "Theme storage is not available yet. Apply migration 019_tenant_theme.sql before saving branding changes.";
  }
  return `Unable to load tenant theme: ${message}`;
}
