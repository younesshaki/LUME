import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AssetsClient from "./AssetsClient";

type PageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function AssetsPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  return (
    <AssetsClient tenantId={tenant.id} tenantSlug={tenant.slug} tenantName={tenant.name} />
  );
}
