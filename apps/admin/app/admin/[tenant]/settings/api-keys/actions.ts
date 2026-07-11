"use server";

/**
 * API key management actions (SCRUM-106). RLS-scoped server client — the
 * tenant_api_keys policies restrict insert/update to owner/admin; tenant_id is
 * pinned for defense in depth. The raw key is returned exactly once from
 * createApiKey and never persisted or logged.
 */
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateApiKey, isApiKeyScope } from "@/lib/apiKeys";
import { auditWrite } from "@/lib/audit";

async function resolveTenantId(slug: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tenants").select("id").eq("slug", slug).maybeSingle();
  return data?.id ?? null;
}

export async function createApiKey(
  slug: string,
  formData: FormData,
): Promise<{ error?: string; rawKey?: string }> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) return { error: "Give the key a name." };

  const scopes = formData.getAll("scopes").map(String).filter(isApiKeyScope);
  if (scopes.length === 0) return { error: "Select at least one scope." };

  const tenantId = await resolveTenantId(slug);
  if (!tenantId) return { error: "Tenant not found." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const generated = generateApiKey();
  const { error } = await supabase.from("tenant_api_keys").insert({
    tenant_id: tenantId,
    name,
    key_hash: generated.keyHash,
    key_prefix: generated.keyPrefix,
    scopes,
    created_by: user?.id ?? null,
  });
  if (error) return { error: "Unable to create the key." };

  await auditWrite({
    tenantId,
    actorUserId: user?.id ?? null,
    action: "api_key.create",
    resourceType: "api_key",
    resourceId: generated.keyPrefix,
    metadata: { name, scopes },
  });

  revalidatePath(`/admin/${slug}/settings/api-keys`);
  return { rawKey: generated.rawKey };
}

export async function revokeApiKey(
  slug: string,
  keyId: string,
): Promise<{ error?: string }> {
  const tenantId = await resolveTenantId(slug);
  if (!tenantId) return { error: "Tenant not found." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("tenant_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", keyId)
    .is("revoked_at", null);
  if (error) return { error: "Unable to revoke the key." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  await auditWrite({
    tenantId,
    actorUserId: user?.id ?? null,
    action: "api_key.revoke",
    resourceType: "api_key",
    resourceId: keyId,
  });

  revalidatePath(`/admin/${slug}/settings/api-keys`);
  return {};
}
