import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebhookDeliveryOutcome, WebhookDeliveryJob } from "./webhooks";
import type { Database } from "./schema";

type DbClient = SupabaseClient<Database, "public">;

export type ClaimedWebhookDelivery = WebhookDeliveryJob & {
  tenantId: string;
  webhookId: string;
  signingSecretCiphertext: string;
  retryDelaysSeconds: number[];
  claimedAttemptCount: number;
};

export async function enqueueLeadCreatedWebhooks(
  client: DbClient,
  tenantId: string,
  leadId: string,
): Promise<number> {
  const [webhooksResult, leadResult] = await Promise.all([
    client.from("tenant_webhooks")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("enabled", true)
      .contains("events", ["lead.created"]),
    client.from("leads")
      .select("id, first_name, last_name, email, phone, message, source, vehicle_id, assigned_to, created_at")
      .eq("tenant_id", tenantId)
      .eq("id", leadId)
      .maybeSingle(),
  ]);
  const error = webhooksResult.error || leadResult.error;
  if (error) throw new Error(`Unable to prepare CRM webhook: ${error.message}`);
  const lead = leadResult.data;
  const webhooks = webhooksResult.data ?? [];
  if (!lead || webhooks.length === 0) return 0;

  const payload = {
    lead: {
      id: lead.id,
      firstName: lead.first_name,
      lastName: lead.last_name,
      email: lead.email,
      phone: lead.phone,
      message: lead.message,
      source: lead.source,
      vehicleId: lead.vehicle_id,
      assignedTo: lead.assigned_to,
      createdAt: lead.created_at,
    },
  };
  const { error: insertError } = await client.from("webhook_deliveries").upsert(
    webhooks.map((webhook) => ({
      tenant_id: tenantId,
      webhook_id: webhook.id,
      event_type: "lead.created" as const,
      event_id: lead.id,
      payload,
    })),
    { onConflict: "webhook_id,event_type,event_id", ignoreDuplicates: true },
  );
  if (insertError) throw new Error(`Unable to enqueue CRM webhook: ${insertError.message}`);
  return webhooks.length;
}

export async function claimWebhookDeliveries(
  client: DbClient,
  limit = 50,
): Promise<ClaimedWebhookDelivery[]> {
  const { data, error } = await client.rpc("claim_webhook_deliveries", {
    p_limit: Math.min(100, Math.max(1, Math.trunc(limit))),
  });
  if (error) throw new Error(`Unable to claim webhook deliveries: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    webhookId: row.webhook_id,
    endpointUrl: row.endpoint_url,
    eventType: row.event_type,
    eventId: row.event_id,
    payload: row.payload,
    claimedAttemptCount: row.attempt_count,
    attemptCount: Math.max(0, row.attempt_count - 1),
    signingSecretCiphertext: row.signing_secret_ciphertext,
    retryDelaysSeconds: row.retry_delays_seconds,
  }));
}

export async function finishWebhookDelivery(
  client: DbClient,
  delivery: Pick<ClaimedWebhookDelivery, "id" | "claimedAttemptCount">,
  outcome: Exclude<WebhookDeliveryOutcome, { status: "not_configured" }>,
): Promise<void> {
  const update: Database["public"]["Tables"]["webhook_deliveries"]["Update"] =
    outcome.status === "succeeded"
      ? {
          status: "succeeded",
          response_status: outcome.responseStatus,
          delivered_at: new Date().toISOString(),
          last_error: null,
        }
      : outcome.status === "retrying"
        ? {
            status: "retrying",
            response_status: outcome.responseStatus,
            next_attempt_at: outcome.nextAttemptAt,
            last_error: outcome.error.slice(0, 500),
          }
        : {
            status: "dead_letter",
            response_status: outcome.responseStatus,
            last_error: outcome.error.slice(0, 500),
          };
  const { error } = await client.from("webhook_deliveries").update(update)
    .eq("id", delivery.id)
    .eq("status", "delivering")
    .eq("attempt_count", delivery.claimedAttemptCount);
  if (error) throw new Error(`Unable to finish webhook delivery: ${error.message}`);
}
