"use server";

import { revalidatePath } from "next/cache";
import { BOT_TOOLS } from "@lume/bot";
import { resolveTenantPlan } from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { auditWrite } from "@/lib/audit";
import {
  isConciergeModelId,
  isPremiumConciergeModel,
  normalizeConciergeModelId,
  type ConciergeModelId,
} from "@/lib/conciergeModels";
import { isConciergeModelConfigured } from "@/lib/chatProvider.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SaveConciergeModelResult =
  | { ok: true; modelId: ConciergeModelId }
  | { ok: false; error: string };

export async function saveConciergeModel(
  slug: string,
  incomingModelId: string,
): Promise<SaveConciergeModelResult> {
  if (!isConciergeModelId(incomingModelId)) {
    return { ok: false, error: "Choose a supported concierge model." };
  }
  if (!isConciergeModelConfigured(incomingModelId)) {
    return {
      ok: false,
      error: "This model's provider is not configured in this environment.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: tenant }, userResult] = await Promise.all([
    supabase.from("tenants").select("id").eq("slug", slug).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const user = userResult.data.user;
  if (!tenant || !user) {
    return { ok: false, error: "Tenant not found." };
  }

  const { data: allowed, error: roleError } = await supabase.rpc(
    "user_has_tenant_role",
    {
      p_tenant_id: tenant.id,
      p_roles: ["owner", "admin"],
    },
  );
  if (roleError || !allowed) {
    return { ok: false, error: "Owner or admin access is required." };
  }

  // Premium intelligence levels are a paid capability — same gate as the
  // editor copilot ("chat.premium_models"; fails closed to Basic).
  if (isPremiumConciergeModel(incomingModelId)) {
    const plan = await resolveTenantPlan(createServiceClient(), tenant.id);
    if (!plan.entitlements["chat.premium_models"]) {
      return {
        ok: false,
        error:
          "This intelligence level is available on the Pro and Ultra plans. Upgrade to unlock it.",
      };
    }
  }

  const currentResult = await supabase
    .from("tenant_bot_config")
    .select("model")
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (currentResult.error) {
    return {
      ok: false,
      error: "Bot model configuration is unavailable until migration 031 is applied.",
    };
  }

  const previousModelId = currentResult.data
    ? normalizeConciergeModelId(currentResult.data.model)
    : null;
  if (previousModelId === incomingModelId) {
    return { ok: true, modelId: incomingModelId };
  }

  let mutationError: { message: string } | null = null;
  let mutationApplied = false;
  if (currentResult.data) {
    const result = await supabase
      .from("tenant_bot_config")
      .update({ model: incomingModelId })
      .eq("tenant_id", tenant.id)
      .select("tenant_id")
      .maybeSingle();
    mutationError = result.error;
    mutationApplied = Boolean(result.data);
  } else {
    // A missing config row historically means all registered tools are
    // available. Seed that same allowlist so selecting a model cannot
    // accidentally disable every concierge action.
    const insertResult = await supabase
      .from("tenant_bot_config")
      .insert({
        tenant_id: tenant.id,
        model: incomingModelId,
        allowed_tools: BOT_TOOLS.map((tool) => tool.name),
      })
      .select("tenant_id")
      .maybeSingle();
    mutationError = insertResult.error;
    mutationApplied = Boolean(insertResult.data);

    // If another settings write created the row between read and insert,
    // update only the model; never overwrite its tool selection.
    if (mutationError) {
      const retryResult = await supabase
        .from("tenant_bot_config")
        .update({ model: incomingModelId })
        .eq("tenant_id", tenant.id)
        .select("tenant_id")
        .maybeSingle();
      mutationError = retryResult.error;
      mutationApplied = Boolean(retryResult.data);
    }
  }

  if (mutationError || !mutationApplied) {
    return { ok: false, error: "Unable to update the concierge model." };
  }

  await auditWrite({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "bot.model_updated",
    resourceType: "tenant_bot_config",
    resourceId: tenant.id,
    metadata: {
      previousModelId,
      modelId: incomingModelId,
    },
  }).catch(() => undefined);

  revalidatePath(`/admin/${slug}/persona`);
  return { ok: true, modelId: incomingModelId };
}
