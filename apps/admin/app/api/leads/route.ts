/**
 * POST /api/leads
 *
 * Public lead capture endpoint. The browser uses anon credentials only; this
 * trusted server route validates origin + tenant, then writes through the
 * service-role client because the leads table intentionally has no anon insert
 * policy.
 */
import type { LeadCaptureResponse } from "@lume/types";
import type { Database } from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { corsHeadersFor, isAllowedOrigin } from "@/lib/origin";
import { normalizeLeadCaptureInput } from "@/lib/leads";

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
  const insert: Database["public"]["Tables"]["leads"]["Insert"] = {
    tenant_id: tenant.tenantId,
    source: lead.source,
    status: "new",
    assigned_to: null,
    first_name: lead.firstName,
    last_name: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    message: lead.message,
    vehicle_id: lead.vehicleId,
    utm_source: lead.utmSource,
    utm_medium: lead.utmMedium,
    utm_campaign: lead.utmCampaign,
    referrer: request.headers.get("referer"),
    ip_addr: requestIp(request),
    user_agent: request.headers.get("user-agent"),
    lost_reason: null,
  };

  const supabase = createServiceClient();
  const { data, error } = await supabase.from("leads").insert(insert).select("id").single();
  if (error || !data) {
    console.error("[/api/leads] insert failed:", error?.message ?? "no row");
    return json({ error: "Unable to capture lead" }, 500, request);
  }

  const response: LeadCaptureResponse = { leadId: data.id };
  return json(response, 201, request);
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
