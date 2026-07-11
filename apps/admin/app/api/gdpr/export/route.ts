/**
 * POST /api/gdpr/export
 *
 * GDPR Art. 15/20 — data-subject access & portability. Given a visitor's
 * contact identifier (email/phone), returns every personal record the tenant
 * holds for them as a downloadable JSON bundle. Trusted server route: origin +
 * tenant checked, then read through the service-role client because the CRM
 * tables have no anon read policy.
 */
import { collectVisitorData } from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { corsHeadersFor, isAllowedOrigin } from "@/lib/origin";
import { parseGdprRequest } from "@/lib/gdpr";
import { checkPublicRouteRateLimit, rateLimitedResponse } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) });
}

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) {
    return json({ error: "Forbidden origin" }, 403);
  }

  const rateLimit = checkPublicRouteRateLimit("gdpr-export", request);
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit, corsHeadersFor(request));

  const tenant = await getTenantFromRequest(request);
  if (!tenant) return json({ error: "Unknown or inactive tenant" }, 404, request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, request);
  }

  const validation = parseGdprRequest(body);
  if (!validation.ok) return json({ error: validation.error }, 400, request);

  try {
    const bundle = await collectVisitorData(
      createServiceClient(),
      tenant.tenantId,
      validation.identifier,
    );
    return json(bundle, 200, request);
  } catch (error) {
    console.error("[gdpr/export] failed", error);
    return json({ error: "Unable to export visitor data" }, 500, request);
  }
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
