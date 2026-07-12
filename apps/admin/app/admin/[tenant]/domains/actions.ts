"use server";

import { revalidatePath } from "next/cache";
import type { TenantDomain } from "@lume/types";
import {
  getTenantCustomDomainLimit,
  reserveTenantDomain,
  VercelDomainApiError,
  type VercelDomainOperation,
} from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { auditWrite } from "@/lib/audit";
import { normalizeDomainInput, rowToTenantDomain, validateDomainInput } from "@/lib/domains";
import { captureError } from "@/lib/observability";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { configuredVercelDomainClient } from "@/lib/vercelDomains.server";

type DomainActionResult = { domain?: TenantDomain; error?: string };

export async function addTenantDomain(slug: string, input: string): Promise<DomainActionResult> {
  const validationError = validateDomainInput(input);
  if (validationError) return { error: validationError };
  const authorized = await authorizeDomainMutation(slug);
  if (!authorized) return { error: "Editor access is required." };
  const domain = normalizeDomainInput(input);
  const service = createServiceClient();
  const existing = await service.from("tenant_domains").select("id").eq("domain", domain).maybeSingle();
  if (existing.error) return { error: "Unable to check domain availability." };
  if (existing.data) return { error: "This domain is already registered." };
  try {
    const [limit, countResult] = await Promise.all([
      getTenantCustomDomainLimit(service, authorized.tenantId),
      service.from("tenant_domains").select("id", { count: "exact", head: true })
        .eq("tenant_id", authorized.tenantId),
    ]);
    if (countResult.error || countResult.count === null) {
      return { error: "Unable to load the custom-domain allowance." };
    }
    if (limit >= 0 && countResult.count >= limit) return { error: domainLimitMessage(limit) };
  } catch {
    return { error: "Unable to load the custom-domain allowance." };
  }

  let provider: VercelDomainOperation;
  try {
    provider = await configuredVercelDomainClient().addDomain(domain);
  } catch (error) {
    captureError("admin/domains/add-provider", error, { tenantId: authorized.tenantId, domain });
    return { error: providerErrorMessage(error, "Unable to add this domain to Vercel.") };
  }

  let reservation: Awaited<ReturnType<typeof reserveTenantDomain>>;
  try {
    reservation = await reserveTenantDomain(service, {
      tenantId: authorized.tenantId,
      domain,
      verified: provider.status === "configured" && provider.verified,
      verificationStatus: provider.status === "configured" && provider.verified
        ? "verified"
        : "pending",
      verificationCheckedAt: provider.status === "configured" ? new Date().toISOString() : null,
      vercelConfig: providerConfig(provider),
    });
  } catch (error) {
    await rollbackProviderDomain(provider, domain, authorized.tenantId);
    captureError("admin/domains/reserve", error, { tenantId: authorized.tenantId, domain });
    return { error: "Unable to enforce the custom-domain allowance." };
  }
  if (reservation.outcome !== "created" || !reservation.domainId) {
    await rollbackProviderDomain(provider, domain, authorized.tenantId);
    return reservation.outcome === "limit_exceeded"
      ? { error: domainLimitMessage(reservation.limit) }
      : { error: "This domain is already registered." };
  }
  const { data, error } = await service.from("tenant_domains")
    .select("*")
    .eq("tenant_id", authorized.tenantId)
    .eq("id", reservation.domainId)
    .single();
  if (error || !data) return { error: "Domain reserved; refresh to see its status." };

  await auditWrite({
    tenantId: authorized.tenantId,
    actorUserId: authorized.userId,
    action: "domain.created",
    resourceType: "tenant_domain",
    resourceId: data.id,
    metadata: { domain, providerConfigured: provider.status === "configured" },
  }).catch(() => undefined);
  revalidatePath(`/admin/${slug}/domains`);
  return { domain: rowToTenantDomain(data) };
}

export async function removeTenantDomain(slug: string, domainId: string): Promise<DomainActionResult> {
  if (!domainId.trim()) return { error: "Invalid domain." };
  const authorized = await authorizeDomainMutation(slug);
  if (!authorized) return { error: "Editor access is required." };
  const service = createServiceClient();
  const { data: row, error: readError } = await service
    .from("tenant_domains")
    .select("id, domain")
    .eq("tenant_id", authorized.tenantId)
    .eq("id", domainId)
    .maybeSingle();
  if (readError || !row) return { error: "Domain not found." };

  try {
    await configuredVercelDomainClient().removeDomain(row.domain);
  } catch (error) {
    captureError("admin/domains/remove-provider", error, {
      tenantId: authorized.tenantId,
      domainId,
      domain: row.domain,
    });
    return { error: providerErrorMessage(error, "Unable to remove this domain from Vercel.") };
  }

  const { error } = await service
    .from("tenant_domains")
    .delete()
    .eq("tenant_id", authorized.tenantId)
    .eq("id", domainId);
  if (error) return { error: "Unable to remove this domain." };

  await auditWrite({
    tenantId: authorized.tenantId,
    actorUserId: authorized.userId,
    action: "domain.removed",
    resourceType: "tenant_domain",
    resourceId: domainId,
    metadata: { domain: row.domain },
  }).catch(() => undefined);
  revalidatePath(`/admin/${slug}/domains`);
  return {};
}

async function authorizeDomainMutation(slug: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: tenant }, userResult] = await Promise.all([
    supabase.from("tenants").select("id").eq("slug", slug).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const user = userResult.data.user;
  if (!tenant || !user) return null;
  const { data: allowed, error } = await supabase.rpc("user_has_tenant_role", {
    p_tenant_id: tenant.id,
    p_roles: ["owner", "admin", "editor"],
  });
  return !error && allowed ? { tenantId: tenant.id, userId: user.id } : null;
}

function providerConfig(provider: VercelDomainOperation): Record<string, unknown> {
  return provider.status === "configured" ? { ...provider } : {};
}

function providerErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof VercelDomainApiError)) return fallback;
  if (error.code === "forbidden") return "Vercel does not permit this domain for the configured team.";
  if (error.status === 409) return "This domain is assigned to another Vercel project.";
  return fallback;
}

async function rollbackProviderDomain(
  provider: VercelDomainOperation,
  domain: string,
  tenantId: string,
): Promise<void> {
  if (provider.status !== "configured") return;
  await configuredVercelDomainClient().removeDomain(domain).catch((error: unknown) => {
    captureError("admin/domains/add-rollback", error, { tenantId, domain });
  });
}

function domainLimitMessage(limit: number): string {
  if (limit <= 0) return "Your current plan does not include a custom domain.";
  return `Your current plan includes ${limit} custom domain${limit === 1 ? "" : "s"}.`;
}
