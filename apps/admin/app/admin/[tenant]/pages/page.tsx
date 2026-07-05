import { notFound } from "next/navigation";
import { listPages } from "@lume/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PagesListClient from "./PagesListClient";

type PageProps = { params: Promise<{ tenant: string }> };

export default async function PagesListPage({ params }: PageProps) {
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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Pages</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edit draft page content and publish changes for {tenant.name}.
        </p>
      </header>
      <PagesListClient tenantId={tenant.id} tenantSlug={tenant.slug} initialPages={pages} />
    </div>
  );
}
