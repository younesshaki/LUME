"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@lume/db/server";
import { auditWrite } from "@/lib/audit";
import { validateCrmWebhookInput } from "@/lib/crmWebhooks";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { encryptWebhookSecret, webhookEncryptionConfigured } from "@/lib/webhookCredentials.server";

type ActionResult = { error?: string };

export async function createCrmWebhook(slug: string, formData: FormData): Promise<ActionResult> {
  const input = validateCrmWebhookInput({
    name: String(formData.get("name") ?? ""),
    endpointUrl: String(formData.get("endpointUrl") ?? ""),
    integrationKind: String(formData.get("integrationKind") ?? ""),
    retryDelays: String(formData.get("retryDelays") ?? ""),
  });
  if (!input.ok) return { error: input.error };
  const secret = String(formData.get("signingSecret") ?? "");
  if (!webhookEncryptionConfigured()) return { error: "CRM webhook encryption is not configured." };
  let ciphertext: string;
  try {
    ciphertext = encryptWebhookSecret(secret);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid signing secret." };
  }
  const authorized = await authorizeIntegrationMutation(slug);
  if (!authorized) return { error: "Owner or admin access is required." };

  const service = createServiceClient();
  const { data: webhookId, error } = await service.rpc("create_tenant_crm_webhook", {
    p_tenant_id: authorized.tenantId,
    p_name: input.value.name,
    p_endpoint_url: input.value.endpointUrl,
    p_integration_kind: input.value.integrationKind,
    p_retry_delays_seconds: input.value.retryDelaysSeconds,
    p_signing_secret_ciphertext: ciphertext,
  });
  if (error || !webhookId) return { error: "Unable to create CRM webhook." };
  await auditWrite({
    tenantId: authorized.tenantId,
    actorUserId: authorized.userId,
    action: "crm_webhook.created",
    resourceType: "tenant_webhook",
    resourceId: webhookId,
    metadata: {
      integrationKind: input.value.integrationKind,
      retryCount: input.value.retryDelaysSeconds.length,
    },
  }).catch(() => undefined);
  revalidatePath(`/admin/${slug}/settings/integrations`);
  return {};
}

export async function setCrmWebhookEnabled(
  slug: string,
  webhookId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const authorized = await authorizeIntegrationMutation(slug);
  if (!authorized || !webhookId || typeof enabled !== "boolean") {
    return { error: "Owner or admin access is required." };
  }
  const { error } = await createServiceClient().from("tenant_webhooks")
    .update({ enabled })
    .eq("tenant_id", authorized.tenantId)
    .eq("id", webhookId);
  if (error) return { error: "Unable to update CRM webhook." };
  revalidatePath(`/admin/${slug}/settings/integrations`);
  return {};
}

export async function removeCrmWebhook(slug: string, webhookId: string): Promise<ActionResult> {
  const authorized = await authorizeIntegrationMutation(slug);
  if (!authorized || !webhookId) return { error: "Owner or admin access is required." };
  const { error } = await createServiceClient().from("tenant_webhooks")
    .delete()
    .eq("tenant_id", authorized.tenantId)
    .eq("id", webhookId);
  if (error) return { error: "Unable to remove CRM webhook." };
  await auditWrite({
    tenantId: authorized.tenantId,
    actorUserId: authorized.userId,
    action: "crm_webhook.removed",
    resourceType: "tenant_webhook",
    resourceId: webhookId,
  }).catch(() => undefined);
  revalidatePath(`/admin/${slug}/settings/integrations`);
  return {};
}

async function authorizeIntegrationMutation(slug: string) {
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
