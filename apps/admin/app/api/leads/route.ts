/**
 * POST /api/leads
 *
 * Public lead capture endpoint. The browser uses anon credentials only; this
 * trusted server route validates origin + tenant, then writes through the
 * service-role client because the leads table intentionally has no anon insert
 * policy.
 *
 * Two caller classes (SCRUM-106): browsers pass the origin allowlist +
 * Turnstile; server-to-server integrations authenticate with a tenant API key
 * (`Authorization: Bearer lume_sk_…`, scope `leads:write`), which pins the
 * tenant to the key, forces source "api", and skips the browser-only checks.
 */
import type { LeadCaptureResponse } from "@lume/types";
import {
  accrueLoyaltyPoints,
  enqueueLeadCreatedWebhooks,
  quotaExceededPayload,
  quotaResponseHeaders,
  type Database,
} from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { corsHeadersFor, isAllowedOrigin } from "@/lib/origin";
import { resolveVisitor } from "@/lib/visitorSession";
import {
  normalizeLeadCaptureInput,
  verifyTurnstileToken,
  type NormalizedLeadCapture,
} from "@/lib/leads";
import { checkPublicApiQuota } from "@/lib/quota.server";
import { checkPublicRouteRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { apiKeyFromRequest, verifyTenantApiKey } from "@/lib/apiKeys";
import { notifyNewLead } from "@/lib/leadEmailNotifications.server";
import { captureError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) });
}

export async function POST(request: Request): Promise<Response> {
  // SCRUM-106: a presented API key is authoritative — it must verify, and it
  // binds the tenant. Browser callers (no key) keep the origin gate.
  const presentedKey = apiKeyFromRequest(request);
  const apiKey = presentedKey ? await verifyTenantApiKey(presentedKey, "leads:write") : null;
  if (presentedKey && !apiKey) {
    return json({ error: "Invalid or revoked API key" }, 401, request);
  }

  if (!apiKey && !isAllowedOrigin(request)) {
    return json({ error: "Forbidden origin" }, 403, request);
  }

  const rateLimit = checkPublicRouteRateLimit("leads", request);
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit, corsHeadersFor(request));

  const tenant = apiKey
    ? { tenantId: apiKey.tenantId }
    : await getTenantFromRequest(request);
  if (!tenant) return json({ error: "Unknown or inactive tenant" }, 404, request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, request);
  }

  const validation = normalizeLeadCaptureInput(body);
  if (!validation.ok) return json({ error: validation.error }, 400, request);

  const lead = validation.value;
  if (apiKey) lead.source = "api";
  const ip = requestIp(request);
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (
    !apiKey &&
    turnstileSecret &&
    lead.source !== "chat" &&
    !(await verifyTurnstileToken({
      secret: turnstileSecret,
      token: lead.turnstileToken ?? "",
      remoteIp: ip,
    }))
  ) {
    return json({ error: "Bot verification failed" }, 400, request);
  }

  const supabase = createServiceClient();

  // A public inquiry may only reference a currently live vehicle owned by the
  // resolved tenant. The FK alone cannot prevent a cross-tenant vehicle ID from
  // being attached to a lead.
  if (lead.vehicleId) {
    if (!UUID_PATTERN.test(lead.vehicleId)) {
      return json({ error: "Vehicle is unavailable" }, 400, request);
    }
    const { data: vehicle, error: vehicleError } = await supabase
      .from("vehicles")
      .select("id")
      .eq("id", lead.vehicleId)
      .eq("tenant_id", tenant.tenantId)
      .eq("status", "live")
      .maybeSingle();
    if (vehicleError) {
      captureError("api/leads/vehicle-validation", vehicleError, {
        tenantId: tenant.tenantId,
        vehicleId: lead.vehicleId,
      });
      return json({ error: "Unable to validate vehicle" }, 500, request);
    }
    if (!vehicle) return json({ error: "Vehicle is unavailable" }, 400, request);
  }

  const quota = await checkPublicApiQuota(tenant.tenantId, "lead_requests", supabase);
  if (!quota.allowed) return json(quotaExceededPayload(quota), 429, request);
  const quotaHeaders = quotaResponseHeaders(quota);

  // Return an existing lead for accidental retries in the same hour. This is
  // deliberately checked after Turnstile because its tokens are single-use.
  const duplicate = await findRecentDuplicate(tenant.tenantId, lead);
  if (duplicate) {
    const response: LeadCaptureResponse = { leadId: duplicate };
    return json(response, 200, request, quotaHeaders);
  }

  // SCRUM-178: attribute the lead to a signed-in visitor when one is present.
  const visitor = await resolveVisitor(request, tenant.tenantId, supabase).catch(() => null);

  const insert: Database["public"]["Tables"]["leads"]["Insert"] = {
    tenant_id: tenant.tenantId,
    source: lead.source,
    status: "new",
    assigned_to: null,
    visitor_id: visitor?.id ?? null,
    first_name: lead.firstName,
    last_name: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    message: lead.message,
    vehicle_id: lead.vehicleId,
    utm_source: lead.utmSource,
    utm_medium: lead.utmMedium,
    utm_campaign: lead.utmCampaign,
    utm_content: lead.utmContent,
    referrer: lead.referrer ?? boundedHeader(request.headers.get("referer"), 2_048),
    source_context: lead.sourceContext,
    ip_addr: ip,
    user_agent: request.headers.get("user-agent"),
    lost_reason: null,
  };

  const { data, error } = await supabase
    .from("leads")
    .insert(insert)
    .select("id, assigned_to, created_at")
    .single();
  if (error || !data) {
    console.error("[/api/leads] insert failed:", error?.message ?? "no row");
    return json({ error: "Unable to capture lead" }, 500, request, quotaHeaders);
  }

  if (visitor) {
    await accrueLoyaltyPoints(supabase, {
      tenantId: tenant.tenantId,
      visitorId: visitor.id,
      eventType: "submitted_lead",
      idempotencyKey: `lead:${data.id}`,
      description: "Submitted an enquiry",
      metadata: { leadId: data.id, source: lead.source },
    }).catch((accrualError: unknown) => {
      console.error(
        "[/api/leads] loyalty accrual failed:",
        accrualError instanceof Error ? accrualError.message : "unknown error",
      );
    });
  }

  try {
    const notification = await notifyNewLead(
      supabase,
      tenant.tenantId,
      data.id,
      new URL(request.url).origin,
    );
    if (notification.status === "failed") {
      captureError("api/leads/email", new Error(notification.reason), {
        tenantId: tenant.tenantId,
        leadId: data.id,
      });
    }
  } catch (notificationError) {
    captureError("api/leads/email", notificationError, {
      tenantId: tenant.tenantId,
      leadId: data.id,
    });
  }

  await enqueueLeadCreatedWebhooks(supabase, tenant.tenantId, data.id)
    .catch((webhookError: unknown) => {
      captureError("api/leads/crm-webhook", webhookError, {
        tenantId: tenant.tenantId,
        leadId: data.id,
      });
    });

  const response: LeadCaptureResponse = { leadId: data.id };
  return json(response, 201, request, quotaHeaders);
}

function boundedHeader(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  return value.slice(0, maxLength);
}

async function findRecentDuplicate(
  tenantId: string,
  lead: NormalizedLeadCapture
): Promise<string | null> {
  const supabase = createServiceClient();
  let query = supabase
    .from("leads")
    .select("id")
    .eq("tenant_id", tenantId)
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  query = lead.email ? query.eq("email", lead.email) : query.eq("phone", lead.phone!);
  query = lead.vehicleId ? query.eq("vehicle_id", lead.vehicleId) : query.is("vehicle_id", null);

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[/api/leads] duplicate lookup failed:", error.message);
    return null;
  }
  return data?.id ?? null;
}

function requestIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    null
  );
}

function json(
  payload: unknown,
  status: number,
  request?: Request,
  responseHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(request ? corsHeadersFor(request) : {}),
      ...responseHeaders,
    },
  });
}
