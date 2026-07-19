import "server-only";
import {
  CONCIERGE_TARGET_LIMITS,
  DEFAULT_CONCIERGE_TARGETS,
  isConciergeTargetKey,
  validateConciergeTargetInput,
  type ConciergeTarget,
  type ConciergeTargetConfig,
} from "@lume/types";
import { createServiceClient } from "@lume/db/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { auditWrite } from "@/lib/audit";
import { loadConciergeTargets } from "./conciergeTargets";

type AuthorizedTenant = { tenantId: string; userId: string };

export type ConciergeTargetMutationResult =
  | { ok: true; targets: ConciergeTarget[] }
  | { ok: false; error: string };

export async function authorizeConciergeMutation(
  slug: string,
): Promise<AuthorizedTenant | null> {
  const supabase = await createSupabaseServerClient();
  const [{ data: tenant }, userResult] = await Promise.all([
    supabase.from("tenants").select("id").eq("slug", slug).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const user = userResult.data.user;
  if (!tenant || !user) return null;
  const { data: allowed, error } = await supabase.rpc("user_has_tenant_role", {
    p_tenant_id: tenant.id,
    p_roles: ["owner", "admin"],
  });
  return !error && allowed ? { tenantId: tenant.id, userId: user.id } : null;
}

export async function saveConciergeTarget(
  slug: string,
  incoming: Partial<ConciergeTargetConfig>,
  originalKey: string | null,
): Promise<ConciergeTargetMutationResult> {
  const authorized = await authorizeConciergeMutation(slug);
  if (!authorized) return { ok: false, error: "Owner or admin access is required." };
  const validation = validateConciergeTargetInput(incoming);
  if (!validation.ok) return validation;
  if (originalKey !== null && originalKey !== validation.value.key) {
    return {
      ok: false,
      error: "A concierge target's stable key cannot be changed.",
    };
  }

  const service = createServiceClient();
  const isExisting = await service
    .from("concierge_targets")
    .select("id")
    .eq("tenant_id", authorized.tenantId)
    .eq("key", validation.value.key)
    .maybeSingle();
  if (isExisting.error) {
    return {
      ok: false,
      error: "Concierge targets are unavailable until migration 073 is applied.",
    };
  }
  if (
    originalKey === null &&
    (isExisting.data ||
      DEFAULT_CONCIERGE_TARGETS.some(
        (target) => target.key === validation.value.key,
      ))
  ) {
    return {
      ok: false,
      error: "A concierge target with this stable key already exists.",
    };
  }
  if (originalKey === null) {
    const { count, error: countError } = await service
      .from("concierge_targets")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", authorized.tenantId);
    if (countError) {
      return {
        ok: false,
        error: "Unable to validate the concierge target limit.",
      };
    }
    if ((count ?? 0) >= CONCIERGE_TARGET_LIMITS.maxTargetsPerTenant) {
      return {
        ok: false,
        error: `A dealership can configure at most ${CONCIERGE_TARGET_LIMITS.maxTargetsPerTenant} concierge targets.`,
      };
    }
  }

  const row = {
    tenant_id: authorized.tenantId,
    key: validation.value.key,
    label: validation.value.label,
    kind: validation.value.kind,
    destination: validation.value.destination,
    ai_description: validation.value.aiDescription,
    is_conversion: validation.value.isConversion,
    enabled: validation.value.enabled,
    example_prompts: validation.value.examplePrompts,
    sort_order: validation.value.sortOrder,
    created_by: isExisting.data ? undefined : authorized.userId,
    updated_by: authorized.userId,
  };
  const { error } =
    originalKey === null
      ? await service.from("concierge_targets").insert(row)
      : await service
          .from("concierge_targets")
          .upsert(row, { onConflict: "tenant_id,key" });
  if (error) return { ok: false, error: "Unable to save this concierge target." };

  await auditWrite({
    tenantId: authorized.tenantId,
    actorUserId: authorized.userId,
    action: "concierge_target.saved",
    resourceType: "concierge_target",
    resourceId: validation.value.key,
    metadata: {
      enabled: validation.value.enabled,
      isConversion: validation.value.isConversion,
      kind: validation.value.kind,
    },
  }).catch(() => undefined);
  return currentTargets(service, authorized.tenantId);
}

/**
 * Deleting a built-in row resets it to its source-controlled default; deleting
 * a custom row removes it from the effective registry.
 */
export async function resetOrDeleteConciergeTarget(
  slug: string,
  key: string,
): Promise<ConciergeTargetMutationResult> {
  if (!isConciergeTargetKey(key)) {
    return { ok: false, error: "Concierge target key is invalid." };
  }
  const authorized = await authorizeConciergeMutation(slug);
  if (!authorized) return { ok: false, error: "Owner or admin access is required." };
  const service = createServiceClient();
  const { error } = await service
    .from("concierge_targets")
    .delete()
    .eq("tenant_id", authorized.tenantId)
    .eq("key", key);
  if (error) return { ok: false, error: "Unable to reset this concierge target." };

  const builtIn = DEFAULT_CONCIERGE_TARGETS.some((target) => target.key === key);
  await auditWrite({
    tenantId: authorized.tenantId,
    actorUserId: authorized.userId,
    action: builtIn ? "concierge_target.reset" : "concierge_target.deleted",
    resourceType: "concierge_target",
    resourceId: key,
    metadata: {},
  }).catch(() => undefined);
  return currentTargets(service, authorized.tenantId);
}

async function currentTargets(
  service: ReturnType<typeof createServiceClient>,
  tenantId: string,
): Promise<ConciergeTargetMutationResult> {
  const loaded = await loadConciergeTargets(service, tenantId);
  return loaded.warning
    ? { ok: false, error: loaded.warning }
    : { ok: true, targets: loaded.targets };
}
