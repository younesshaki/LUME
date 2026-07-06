import { notFound } from "next/navigation";
import { listPages } from "@lume/db";
import type { TenantTheme } from "@lume/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import NavigationClient from "./NavigationClient";

type PageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function NavigationPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name, theme")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  // RLS scopes this to the member's tenants; listPages filters by tenant id.
  const pages = await listPages(supabase, tenant.id);
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
    />
  );
}
