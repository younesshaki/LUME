"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@lume/db/server";
import { auditWrite } from "@/lib/audit";
import { isBillingPlanId, isManualPlanChangeAllowed } from "@/lib/billing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BillingPlanChangeResult = { error?: string; changed?: boolean };

export async function changeBillingPlan(
  slug: string,
  planId: string,
): Promise<BillingPlanChangeResult> {
  if (!isBillingPlanId(planId)) return { error: "Invalid plan." };

  const supabase = await createSupabaseServerClient();
  const [{ data: tenant }, userResult] = await Promise.all([
    supabase.from("tenants").select("id").eq("slug", slug).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const user = userResult.data.user;
  if (!user) return { error: "Sign in to change plans." };
  if (!tenant) return { error: "Tenant not found." };

  const [{ data: canManage, error: roleError }, { data: plan, error: planError }] =
    await Promise.all([
      supabase.rpc("user_has_tenant_role", {
        p_tenant_id: tenant.id,
        p_roles: ["owner", "admin"],
      }),
      supabase.from("plans").select("id, name").eq("id", planId).maybeSingle(),
    ]);
  if (roleError || !canManage) return { error: "Owner or admin access is required." };
  if (planError || !plan) return { error: "Plan not found." };

  try {
    const service = createServiceClient();
    const { data: current, error: currentError } = await service
      .from("subscriptions")
      .select("id, plan_id, stripe_subscription_id")
      .eq("tenant_id", tenant.id)
      .in("status", ["trialing", "active", "past_due", "incomplete"])
      .maybeSingle();
    if (currentError) return { error: "Unable to read the current subscription." };
    if (current?.plan_id === plan.id) return { changed: false };
    if (!isManualPlanChangeAllowed(current?.stripe_subscription_id ?? null)) {
      return { error: "Provider-managed subscriptions must be changed through billing support." };
    }

    const changedAt = new Date().toISOString();
    const mutation = current
      ? service
          .from("subscriptions")
          .update({
            plan_id: plan.id,
            status: "active",
            current_period_start: changedAt,
            current_period_end: null,
          })
          .eq("id", current.id)
          .eq("tenant_id", tenant.id)
      : service.from("subscriptions").insert({
          tenant_id: tenant.id,
          plan_id: plan.id,
          status: "active",
          current_period_start: changedAt,
          current_period_end: null,
        });
    const { data: changedSubscription, error: mutationError } = await mutation
      .select("id")
      .maybeSingle();
    if (mutationError || !changedSubscription) return { error: "Unable to change the plan." };

    await auditWrite({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "billing.plan_change",
      resourceType: "subscription",
      resourceId: changedSubscription.id,
      metadata: { fromPlanId: current?.plan_id ?? null, toPlanId: plan.id },
    }).catch(() => undefined);

    revalidatePath(`/admin/${slug}/settings/billing`);
    return { changed: true };
  } catch {
    return { error: "Billing is not configured on this environment." };
  }
}
