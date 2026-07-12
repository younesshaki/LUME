import { createHash } from "node:crypto";
import { emailIdempotencyKey, type SendEmailResult } from "@lume/email";
import {
  leadCreatedEmailTemplate,
  leadDigestEmailTemplate,
  type LeadEmailSummary,
} from "@lume/email/templates";
import { createEmailSender } from "@lume/email/server";
import {
  enqueueLeadEmailDigest,
  isEmailRecipientSuppressed,
  type ClaimedLeadDigestBatch,
  type Database,
} from "@lume/db";
import type { ServerSupabaseClient } from "@lume/db/server";
import {
  leadMessagePreview,
  leadNotificationAddresses,
  leadNotificationUserIds,
  normalizeLeadEmailSettings,
  type LeadEmailSettings,
  type LeadNotificationMember,
} from "./leadEmailPolicy";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

export type LeadNotificationOutcome =
  | { status: "disabled" | "no_recipients" | "not_configured" }
  | { status: "queued"; batchId: string }
  | { status: "sent"; recipientCount: number }
  | { status: "failed"; reason: string };

export async function notifyNewLead(
  client: ServerSupabaseClient,
  tenantId: string,
  leadId: string,
  adminOrigin: string,
): Promise<LeadNotificationOutcome> {
  const context = await loadNotificationContext(client, tenantId, [leadId]);
  if (!context || !context.settings.enabled) return { status: "disabled" };
  const lead = context.leads[0];
  if (!lead) return { status: "failed", reason: "Lead could not be loaded." };

  if (context.settings.mode === "hourly") {
    const batchId = await enqueueLeadEmailDigest(client, tenantId, lead.id, lead.created_at);
    return batchId
      ? { status: "queued", batchId }
      : { status: "failed", reason: "Digest batch could not be queued." };
  }

  const recipients = await resolveRecipientEmails(
    client,
    context.members,
    context.settings,
    [lead],
  );
  if (recipients.length === 0) return { status: "no_recipients" };
  const summary = buildLeadEmailSummary(lead, context.vehicleLabels, context.tenant.slug, adminOrigin);
  const sender = configuredSender(client);
  const results = await Promise.all(recipients.map((recipient) => sender({
    tenant: {
      id: tenantId,
      name: context.tenant.name,
      fromAddress: context.settings.fromAddress,
    },
    to: recipient,
    template: leadCreatedEmailTemplate,
    props: { tenantName: context.tenant.name, lead: summary },
    idempotencyKey: requiredIdempotencyKey(
      tenantId,
      leadCreatedEmailTemplate.key,
      `${lead.id}.${recipientToken(recipient)}`,
    ),
    tags: [{ name: "source", value: lead.source.replace(/[^A-Za-z0-9_-]/g, "-") }],
  })));
  return summarizeDelivery(results, recipients.length);
}

export async function deliverLeadDigest(
  client: ServerSupabaseClient,
  batch: ClaimedLeadDigestBatch,
  adminOrigin: string,
): Promise<LeadNotificationOutcome> {
  const context = await loadNotificationContext(client, batch.tenantId, batch.leadIds);
  if (!context || !context.settings.enabled || context.settings.mode !== "hourly") {
    return { status: "disabled" };
  }
  if (context.leads.length === 0) return { status: "no_recipients" };
  const recipients = await resolveRecipientEmails(
    client,
    context.members,
    context.settings,
    context.leads,
  );
  if (recipients.length === 0) return { status: "no_recipients" };

  const leads = context.leads.map((lead) =>
    buildLeadEmailSummary(lead, context.vehicleLabels, context.tenant.slug, adminOrigin)
  );
  const leadsUrl = new URL(`/admin/${encodeURIComponent(context.tenant.slug)}/leads`, adminOrigin)
    .toString();
  const sender = configuredSender(client);
  const results = await Promise.all(recipients.map((recipient) => sender({
    tenant: {
      id: batch.tenantId,
      name: context.tenant.name,
      fromAddress: context.settings.fromAddress,
    },
    to: recipient,
    template: leadDigestEmailTemplate,
    props: { tenantName: context.tenant.name, leadsUrl, leads },
    idempotencyKey: requiredIdempotencyKey(
      batch.tenantId,
      leadDigestEmailTemplate.key,
      `${batch.id}.${recipientToken(recipient)}`,
    ),
  })));
  return summarizeDelivery(results, recipients.length);
}

export function buildLeadEmailSummary(
  lead: LeadRow,
  vehicleLabels: ReadonlyMap<string, string>,
  tenantSlug: string,
  adminOrigin: string,
): LeadEmailSummary {
  const name = [lead.first_name, lead.last_name].map((value) => value.trim()).filter(Boolean).join(" ");
  return {
    contactName: name || lead.email || lead.phone || "New enquiry",
    email: lead.email,
    phone: lead.phone,
    messagePreview: leadMessagePreview(lead.message),
    source: lead.source.replace(/-/g, " "),
    vehicleLabel: lead.vehicle_id ? vehicleLabels.get(lead.vehicle_id) ?? null : null,
    leadUrl: new URL(
      `/admin/${encodeURIComponent(tenantSlug)}/leads/${encodeURIComponent(lead.id)}`,
      adminOrigin,
    ).toString(),
  };
}

async function loadNotificationContext(
  client: ServerSupabaseClient,
  tenantId: string,
  leadIds: string[],
) {
  const [tenantResult, settingsResult, membersResult, leadsResult] = await Promise.all([
    client.from("tenants").select("id, slug, name").eq("id", tenantId).maybeSingle(),
    client
      .from("tenant_settings")
      .select("lead_email_enabled, lead_email_roles, lead_email_mode, lead_email_unassigned_address, email_from_address")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    client
      .from("tenant_members")
      .select("user_id, role")
      .eq("tenant_id", tenantId)
      .limit(200),
    client
      .from("leads")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("id", leadIds)
      .limit(100),
  ]);
  const error = tenantResult.error || settingsResult.error || membersResult.error || leadsResult.error;
  if (error) throw new Error(`Unable to load lead email context: ${error.message}`);
  if (!tenantResult.data || !settingsResult.data) return null;
  const settings = normalizeLeadEmailSettings({
    enabled: settingsResult.data.lead_email_enabled,
    roles: settingsResult.data.lead_email_roles,
    mode: settingsResult.data.lead_email_mode,
    unassignedAddress: settingsResult.data.lead_email_unassigned_address,
    fromAddress: settingsResult.data.email_from_address,
  });
  if (!settings) throw new Error("Lead email settings are invalid.");

  const leads = (leadsResult.data ?? []) as LeadRow[];
  const vehicleIds = [...new Set(leads.flatMap((lead) => lead.vehicle_id ? [lead.vehicle_id] : []))];
  const vehicleResult = vehicleIds.length > 0
    ? await client
        .from("vehicles")
        .select("id, year, make, model, trim")
        .eq("tenant_id", tenantId)
        .in("id", vehicleIds)
    : { data: [], error: null };
  if (vehicleResult.error) throw new Error(`Unable to load lead vehicle context: ${vehicleResult.error.message}`);
  const vehicleLabels = new Map((vehicleResult.data ?? []).map((vehicle) => [
    vehicle.id,
    [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" "),
  ]));

  return {
    tenant: tenantResult.data,
    settings,
    members: (membersResult.data ?? []).map((member) => ({
      userId: member.user_id,
      role: member.role,
    })),
    leads,
    vehicleLabels,
  };
}

async function resolveRecipientEmails(
  client: ServerSupabaseClient,
  members: LeadNotificationMember[],
  settings: LeadEmailSettings,
  leads: LeadRow[],
): Promise<string[]> {
  const userIds = new Set<string>();
  for (const lead of leads) {
    for (const userId of leadNotificationUserIds(members, settings.roles, lead.assigned_to)) {
      userIds.add(userId);
    }
  }
  const memberEmails: Array<string | null> = [];
  const ids = [...userIds];
  for (let offset = 0; offset < ids.length; offset += 10) {
    const users = await Promise.all(ids.slice(offset, offset + 10).map(async (id) => {
      const { data, error } = await client.auth.admin.getUserById(id);
      if (error) throw new Error(`Unable to resolve lead notification recipient: ${error.message}`);
      return data.user.email ?? null;
    }));
    memberEmails.push(...users);
  }
  return leadNotificationAddresses(
    memberEmails,
    settings.unassignedAddress,
    leads.some((lead) => lead.assigned_to === null),
  );
}

function configuredSender(client: ServerSupabaseClient) {
  return createEmailSender({
    isRecipientSuppressed: (recipient, tenantId) =>
      isEmailRecipientSuppressed(client, recipient, tenantId),
  });
}

function requiredIdempotencyKey(tenantId: string, templateKey: string, entityId: string): string {
  const key = emailIdempotencyKey({ tenantId, templateKey, entityId });
  if (!key) throw new Error("Unable to build lead email idempotency key.");
  return key;
}

function recipientToken(recipient: string): string {
  return createHash("sha256").update(recipient).digest("hex").slice(0, 20);
}

function summarizeDelivery(results: SendEmailResult[], recipientCount: number): LeadNotificationOutcome {
  if (results.every((result) =>
    result.status === "sent" || (result.status === "skipped" && result.reason === "suppressed")
  )) {
    return { status: "sent", recipientCount };
  }
  if (results.some((result) =>
    result.status === "skipped" && result.reason === "not_configured"
  )) {
    return { status: "not_configured" };
  }
  return { status: "failed", reason: "One or more lead notification emails failed." };
}
