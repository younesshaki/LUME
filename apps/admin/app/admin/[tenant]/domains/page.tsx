import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  rowToTenantDomain,
  type TenantDomainRow,
} from "@/lib/domains";
import DomainsClient from "./DomainsClient";

type PageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function DomainsPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const { data, error } = await (supabase.from("tenant_domains") as any)
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to load domains: ${error.message}`);
  }

  return (
    <DomainsClient
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      initialDomains={((data ?? []) as TenantDomainRow[]).map(rowToTenantDomain)}
    />
  );
}
