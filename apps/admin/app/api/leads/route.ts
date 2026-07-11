/**
 * POST /api/leads
 *
 * Public lead capture endpoint. The browser uses anon credentials only; this
 * trusted server route validates origin + tenant, then writes through the
 * service-role client because the leads table intentionally has no anon insert
 * policy.
 */
import type { LeadCaptureResponse } from "@lume/types";
import { accrueLoyaltyPoints, type Database } from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { corsHeadersFor, isAllowedOrigin } from "@/lib/origin";
import { resolveVisitor } from "@/lib/visitorSession";
import {
  normalizeLeadCaptureInput,
  verifyTurnstileToken,
  type NormalizedLeadCapture,
} from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) });
}

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) {
    return json({ error: "Forbidden origin" }, 403);
  }

  const tenant = await getTenantFromRequest(request);
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
  const ip = requestIp(request);
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (
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

  // Return an existing lead for accidental retries in the same hour. This is
  // deliberately checked after Turnstile because its tokens are single-use.
  const duplicate = await findRecentDuplicate(tenant.tenantId, lead);
  if (duplicate) {
    const response: LeadCaptureResponse = { leadId: duplicate };
    return json(response, 200, request);
  }

  // SCRUM-178: attribute the lead to a signed-in visitor when one is present.
  const visitor = await resolveVisitor(request, tenant.tenantId).catch(() => null);

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

  const supabase = createServiceClient();
  const { data, error } = await supabase.from("leads").insert(insert).select("id").single();
  if (error || !data) {
    console.error("[/api/leads] insert failed:", error?.message ?? "no row");
    return json({ error: "Unable to capture lead" }, 500, request);
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

  const response: LeadCaptureResponse = { leadId: data.id };
  return json(response, 201, request);
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

function json(payload: unknown, status: number, request?: Request): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(request ? corsHeadersFor(request) : {}),
    },
  });
}
