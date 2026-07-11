/**
 * POST /api/gdpr/delete
 *
 * GDPR Art. 17 — right to erasure. Given a visitor's contact identifier,
 * permanently deletes every personal record the tenant holds for them
 * (leads + their activities cascade). Trusted server route: origin + tenant
 * checked, then written through the service-role client. Returns a count
 * summary as the erasure receipt.
 */
import { deleteVisitorData } from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { corsHeadersFor, isAllowedOrigin } from "@/lib/origin";
import { parseGdprRequest } from "@/lib/gdpr";
import { auditWrite, requestIp } from "@/lib/audit";
import { checkPublicRouteRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { captureError, withRouteErrorCapture } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) });
}

export const POST = withRouteErrorCapture("api/gdpr/delete", handlePost);

async function handlePost(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) {
    return json({ error: "Forbidden origin" }, 403);
  }

  const rateLimit = checkPublicRouteRateLimit("gdpr-delete", request);
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
    const result = await deleteVisitorData(
      createServiceClient(),
      tenant.tenantId,
      validation.identifier,
    );
    // Erasure is exactly the kind of irreversible write the audit log exists for.
    await auditWrite({
      tenantId: tenant.tenantId,
      action: "gdpr.delete",
      resourceType: "visitor",
      resourceId: validation.identifier.email ?? validation.identifier.phone ?? null,
      metadata: {
        deletedLeads: result.deletedLeads,
        deletedLeadActivities: result.deletedLeadActivities,
      },
      ipAddr: requestIp(request),
    });
    return json(result, 200, request);
  } catch (error) {
    captureError("api/gdpr/delete", error);
    return json({ error: "Unable to delete visitor data" }, 500, request);
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
