import { createHash } from "node:crypto";
import { emailIdempotencyKey } from "@lume/email";
import { createEmailSender } from "@lume/email/server";
import { domainVerificationEmailTemplate } from "@lume/email/templates";
import {
  createAdminNotification,
  isEmailRecipientSuppressed,
  resolveDomainVerificationState,
  VercelDomainApiError,
  type Database,
  type DomainVerificationState,
  type VercelDomainOperation,
} from "@lume/db";
import type { ServerSupabaseClient } from "@lume/db/server";
import { configuredVercelDomainClient } from "./vercelDomains.server";

type DomainRow = Database["public"]["Tables"]["tenant_domains"]["Row"];

export type DomainVerificationOutcome =
  | { status: "not_configured" }
  | { status: DomainVerificationState; domain: DomainRow; transitioned: boolean };

export async function checkTenantDomainVerification(
  client: ServerSupabaseClient,
  row: DomainRow,
  adminOrigin: string,
  now = new Date(),
): Promise<DomainVerificationOutcome> {
  const provider = configuredVercelDomainClient();
  let snapshot: VercelDomainOperation;
  try {
    snapshot = hasManagedVercelConfig(row.vercel_config)
      ? await provider.verifyDomain(row.domain)
      : await provider.addDomain(row.domain);
  } catch (error) {
    if (!(error instanceof VercelDomainApiError) || error.status !== 400) throw error;
    snapshot = await provider.getDomain(row.domain);
  }
  if (snapshot.status === "not_configured") return { status: "not_configured" };

  const nextState = resolveDomainVerificationState(snapshot.verified, row.created_at, now.getTime());
  const previousState: DomainVerificationState = row.verified
    ? "verified"
    : row.verification_status ?? "pending";
  const transitioned = nextState !== previousState;
  if (transitioned && (nextState === "verified" || nextState === "failed")) {
    await sendDomainTransitionEmail(client, row, nextState, adminOrigin);
  }

  const { data, error } = await client.from("tenant_domains").update({
    verified: nextState === "verified",
    verification_status: nextState,
    verification_checked_at: now.toISOString(),
    verification_failed_at: nextState === "failed"
      ? row.verification_failed_at ?? now.toISOString()
      : null,
    vercel_config: { ...snapshot },
  }).eq("tenant_id", row.tenant_id).eq("id", row.id).select("*").single();
  if (error || !data) throw new Error(`Unable to save domain verification: ${error?.message ?? "no row"}`);

  if (transitioned && nextState === "verified") {
    await createAdminNotification(client, {
      tenantId: row.tenant_id,
      type: "domain.verified",
      body: `Domain ${row.domain} verified.`,
      link: `/admin/${encodeURIComponent(await tenantSlug(client, row.tenant_id))}/domains`,
      dedupeKey: `domain:${row.id}:${nextState}`,
    });
  }
  return { status: nextState, domain: data, transitioned };
}

function hasManagedVercelConfig(value: Record<string, unknown>): boolean {
  return value.status === "configured" && typeof value.projectId === "string";
}

async function sendDomainTransitionEmail(
  client: ServerSupabaseClient,
  row: DomainRow,
  state: "verified" | "failed",
  adminOrigin: string,
): Promise<void> {
  const [tenantResult, settingsResult, ownersResult] = await Promise.all([
    client.from("tenants").select("id, slug, name").eq("id", row.tenant_id).maybeSingle(),
    client.from("tenant_settings").select("email_from_address").eq("tenant_id", row.tenant_id).maybeSingle(),
    client.from("tenant_members").select("user_id").eq("tenant_id", row.tenant_id).eq("role", "owner").limit(20),
  ]);
  const error = tenantResult.error || settingsResult.error || ownersResult.error;
  if (error) throw new Error(`Unable to load domain email recipients: ${error.message}`);
  const tenant = tenantResult.data;
  if (!tenant) throw new Error("Unable to load domain notification tenant.");

  const ownerEmails: string[] = [];
  for (const owner of ownersResult.data ?? []) {
    const result = await client.auth.admin.getUserById(owner.user_id);
    if (result.error) throw new Error(`Unable to load domain notification owner: ${result.error.message}`);
    const email = result.data.user.email?.trim().toLowerCase();
    if (email && !ownerEmails.includes(email)) ownerEmails.push(email);
  }
  if (ownerEmails.length === 0) return;

  const sender = createEmailSender({
    isRecipientSuppressed: (recipient, tenantId) =>
      isEmailRecipientSuppressed(client, recipient, tenantId),
  });
  const domainsUrl = new URL(`/admin/${encodeURIComponent(tenant.slug)}/domains`, adminOrigin).toString();
  const results = await Promise.all(ownerEmails.sort().map((recipient) => sender({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      fromAddress: settingsResult.data?.email_from_address ?? null,
    },
    to: recipient,
    template: domainVerificationEmailTemplate,
    props: { tenantName: tenant.name, domain: row.domain, state, domainsUrl },
    idempotencyKey: requiredEmailKey(row.tenant_id, row.id, state, recipient),
    tags: [{ name: "state", value: state }],
  })));
  const failed = results.some((result) =>
    result.status === "failed" || result.status === "invalid"
  );
  if (failed) throw new Error("Domain verification email delivery failed.");
}

async function tenantSlug(client: ServerSupabaseClient, tenantId: string): Promise<string> {
  const { data } = await client.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
  return data?.slug ?? tenantId;
}

function requiredEmailKey(
  tenantId: string,
  domainId: string,
  state: string,
  recipient: string,
): string {
  const recipientToken = createHash("sha256").update(recipient).digest("hex").slice(0, 20);
  const key = emailIdempotencyKey({
    tenantId,
    templateKey: domainVerificationEmailTemplate.key,
    entityId: `${domainId}.${state}.${recipientToken}`,
  });
  if (!key) throw new Error("Unable to build domain email idempotency key.");
  return key;
}
