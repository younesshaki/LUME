import { notFound } from "next/navigation";
import { listPages } from "@lume/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import NewPageClient from "./NewPageClient";

type PageProps = { params: Promise<{ tenant: string }> };

export default async function NewPageRoute({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const pages = await listPages(supabase, tenant.id);

  return (
    <NewPageClient
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      existingSlugs={pages.map((page) => page.slug)}
      navOrder={pages.length}
    />
  );
}
