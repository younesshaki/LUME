/**
 * POST /api/visitor/signup — create a public-site visitor account (SCRUM-129).
 * Origin + tenant checked; account written with the service-role client (the
 * visitors table is deny-all under RLS). Returns 201 + a session cookie.
 */
import { createServiceClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { isAllowedOrigin } from "@/lib/origin";
import { parseSignupInput } from "@/lib/visitorInput";
import { hashPassword, createSessionToken } from "@/lib/visitorAuth";
import { buildSessionCookie, visitorCorsHeaders } from "@/lib/visitorSession";
import { checkPublicRouteRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { captureError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: visitorCorsHeaders(request) });
}

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return json(request, { error: "Forbidden origin" }, 403);

  const rateLimit = checkPublicRouteRateLimit("visitor-signup", request);
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit, visitorCorsHeaders(request));

  const tenant = await getTenantFromRequest(request);
  if (!tenant) return json(request, { error: "Unknown or inactive tenant" }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "Invalid JSON" }, 400);
  }

  const parsed = parseSignupInput(body);
  if (!parsed.ok) return json(request, { error: parsed.error }, 400);

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("visitors")
    .select("id")
    .eq("tenant_id", tenant.tenantId)
    .eq("email", parsed.value.email)
    .maybeSingle();
  if (existing) return json(request, { error: "An account with this email already exists." }, 409);

  const password_hash = await hashPassword(parsed.value.password);
  const { data: visitor, error } = await supabase
    .from("visitors")
    .insert({
      tenant_id: tenant.tenantId,
      email: parsed.value.email,
      password_hash,
      first_name: parsed.value.firstName,
      last_name: parsed.value.lastName,
    })
    .select("id")
    .single();
  if (error || !visitor) {
    console.error("[visitor/signup] insert failed:", error?.message);
    return json(request, { error: "Unable to create account" }, 500);
  }

  const session = createSessionToken();
  await supabase.from("visitor_sessions").insert({
    tenant_id: tenant.tenantId,
    visitor_id: visitor.id,
    token_hash: session.tokenHash,
    expires_at: session.expiresAt.toISOString(),
  });

  const { error: conversionError } = await supabase.from("conversion_events").insert({
    tenant_id: tenant.tenantId,
    visitor_id: visitor.id,
    event_name: "account_created",
    event_category: "operational",
    metadata: {},
  });
  if (conversionError) captureError("api/visitor/signup/conversion-event", conversionError, { tenantId: tenant.tenantId, visitorId: visitor.id });

  return json(
    request,
    { visitorId: visitor.id },
    201,
    buildSessionCookie(session.token, session.expiresAt),
  );
}

function json(request: Request, payload: unknown, status: number, setCookie?: string): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...visitorCorsHeaders(request),
      ...(setCookie ? { "Set-Cookie": setCookie } : {}),
    },
  });
}
