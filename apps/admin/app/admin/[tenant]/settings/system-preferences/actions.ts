"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };

export async function updateSidebarExpandPreference(
  slug: string,
  sidebarSingleExpand: boolean,
): Promise<ActionResult> {
  if (!slug || typeof sidebarSingleExpand !== "boolean") {
    return { error: "Invalid preference." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Sign in to update your preferences." };

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) return { error: "Tenant not found." };

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return { error: "You do not have access to this tenant." };

  const { error } = await supabase.from("tenant_member_preferences").upsert(
    {
      tenant_id: tenant.id,
      user_id: user.id,
      sidebar_single_expand: sidebarSingleExpand,
    },
    { onConflict: "tenant_id,user_id" },
  );
  if (error) return { error: "Unable to update the sidebar preference." };

  revalidatePath(`/admin/${slug}`);
  return {};
}
