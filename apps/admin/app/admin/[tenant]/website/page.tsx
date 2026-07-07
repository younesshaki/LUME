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
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const pages = await listPages(supabase, tenant.id);
  const publicSiteBaseUrl =
    process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ?? "https://lume-jade-three.vercel.app";

  return (
    <WebsiteClient
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      publicSiteBaseUrl={publicSiteBaseUrl}
      pages={pages}
    />
  );
}
