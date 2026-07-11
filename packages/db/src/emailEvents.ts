import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

export type ResendEmailEventType = "email.delivered" | "email.bounced" | "email.complained";

export type RecordResendEmailEventInput = {
  tenantId: string;
  providerEventId: string;
  providerEmailId: string;
  eventType: ResendEmailEventType;
  recipients: string[];
  templateKey: string | null;
  bounceType: string | null;
  bounceSubtype: string | null;
  bounceMessage: string | null;
  occurredAt: string;
};

type DbClient = SupabaseClient<Database, "public">;

/** Atomically records one provider event and any permanent-bounce suppressions. */
export async function recordResendEmailEvent(
  client: DbClient,
  input: RecordResendEmailEventInput,
): Promise<"recorded" | "duplicate" | "unknown_tenant"> {
  const { data, error } = await client.rpc("record_resend_email_event", {
    p_tenant_id: input.tenantId,
    p_provider_event_id: input.providerEventId,
    p_provider_email_id: input.providerEmailId,
    p_event_type: input.eventType,
    p_recipients: input.recipients,
    p_template_key: input.templateKey,
    p_bounce_type: input.bounceType,
    p_bounce_subtype: input.bounceSubtype,
    p_bounce_message: input.bounceMessage,
    p_occurred_at: input.occurredAt,
  });
  if (error) throw new Error(`Unable to record Resend email event: ${error.message}`);
  if (data !== "recorded" && data !== "duplicate" && data !== "unknown_tenant") {
    throw new Error("Unable to record Resend email event: RPC returned an invalid result.");
  }
  return data;
}

/**
 * Service-only suppression lookup for @lume/email's isRecipientSuppressed hook.
 * Errors throw deliberately so email delivery fails closed.
 */
export async function isEmailRecipientSuppressed(
  client: DbClient,
  recipient: string,
  tenantId: string,
): Promise<boolean> {
  const normalizedTenantId = tenantId.trim();
  const normalizedRecipient = normalizeRecipient(recipient);
  if (!normalizedTenantId || !normalizedRecipient) {
    throw new Error("Unable to check email suppression: invalid tenant or recipient.");
  }

  const { data, error } = await client
    .from("tenant_email_suppressions")
    .select("recipient_email")
    .eq("tenant_id", normalizedTenantId)
    .eq("recipient_email", normalizedRecipient)
    .maybeSingle();
  if (error) throw new Error(`Unable to check email suppression: ${error.message}`);
  return data !== null;
}

function normalizeRecipient(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return normalized.length >= 3 &&
    normalized.length <= 320 &&
    !/[\r\n\s<>]/.test(normalized) &&
    /^[^@]+@[^@]+\.[^@]+$/.test(normalized)
    ? normalized
    : null;
}
