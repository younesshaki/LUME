/**
 * POST /api/consent (SCRUM-200, D-NEW-12).
 *
 * Records one anonymous cookie-consent choice in the tenant's ledger. By
 * design the row carries only choice + policy version — no IP, no user agent,
 * no cookie, no visitor linkage — so the compliance record can never become a
 * tracking vector. Fire-and-forget from the public banner; failures there are
 * swallowed because consent must work even when this endpoint is unreachable.
 */
import { createServiceClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { corsHeadersFor, isAllowedOrigin } from "@/lib/origin";
import { checkPublicRouteRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { captureError, withRouteErrorCapture } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) });
}

export const POST = withRouteErrorCapture("api/consent", handlePost);

async function handlePost(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return json({ error: "Forbidden origin" }, 403);

  const rateLimit = checkPublicRouteRateLimit("consent", request);
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit, corsHeadersFor(request));

  const tenant = await getTenantFromRequest(request);
  if (!tenant) return json({ error: "Unknown or inactive tenant" }, 404, request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, request);
  }

  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const choice = record.choice === "accepted" || record.choice === "rejected"
    ? record.choice
    : null;
  const version =
    typeof record.version === "number" && Number.isInteger(record.version) && record.version >= 1
      ? Math.min(record.version, 1_000)
      : 1;
  if (!choice) return json({ error: "choice must be 'accepted' or 'rejected'" }, 400, request);

  const { error } = await createServiceClient().from("consent_events").insert({
    tenant_id: tenant.tenantId,
    choice,
    consent_version: version,
  });
  if (error) {
    captureError("api/consent", new Error(error.message));
    return json({ error: "Unable to record consent" }, 500, request);
  }

  return json({ recorded: true }, 201, request);
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
