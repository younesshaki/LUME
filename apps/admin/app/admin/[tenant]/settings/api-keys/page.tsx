import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ApiKeysClient, type ApiKeyRow } from "./ApiKeysClient";

type PageProps = { params: Promise<{ tenant: string }> };

export default async function ApiKeysPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  // RLS restricts this to owner/admin; others see an empty list.
  const { data } = await supabase
    .from("tenant_api_keys")
    .select("id, name, key_prefix, scopes, last_used_at, revoked_at, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  const keys: ApiKeyRow[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: row.scopes,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        description={`Server-to-server access for ${tenant.name}. Keys are shown once at creation; revocation is immediate.`}
      />
      <ApiKeysClient slug={slug} keys={keys} />
    </div>
  );
}
