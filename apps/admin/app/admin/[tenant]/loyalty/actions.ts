"use server";

/**
 * Loyalty tier configuration mutations (SCRUM-134). Server actions using the
 * RLS-scoped server client — the loyalty_tiers write policy already restricts
 * these to editor+; we also pin tenant_id for defense in depth.
 */
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function resolveTenantId(slug: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tenants").select("id").eq("slug", slug).maybeSingle();
  return data?.id ?? null;
}

export async function createTier(
  slug: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const threshold = Number(formData.get("threshold"));
  if (!name) return { error: "Tier name is required." };
  if (!Number.isFinite(threshold) || threshold < 0) {
    return { error: "Threshold must be a non-negative number." };
  }

  const tenantId = await resolveTenantId(slug);
  if (!tenantId) return { error: "Tenant not found." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("loyalty_tiers").insert({
    tenant_id: tenantId,
    name,
    threshold: Math.floor(threshold),
    sort_order: Math.floor(threshold),
  });
  if (error) {
    return {
      error: error.code === "23505" ? "A tier with that name already exists." : "Unable to save tier.",
    };
  }

  revalidatePath(`/admin/${slug}/loyalty`);
  return {};
}

export async function deleteTier(slug: string, tierId: string): Promise<{ error?: string }> {
  const tenantId = await resolveTenantId(slug);
  if (!tenantId) return { error: "Tenant not found." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("loyalty_tiers")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", tierId);
  if (error) return { error: "Unable to delete tier." };

  revalidatePath(`/admin/${slug}/loyalty`);
  return {};
}
