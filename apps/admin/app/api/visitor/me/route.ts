/**
 * GET /api/visitor/me — the signed-in visitor, or 401 (SCRUM-129/132).
 */
import { getTenantFromRequest } from "@/lib/tenant";
import { isAllowedOrigin } from "@/lib/origin";
import { resolveVisitor, visitorCorsHeaders } from "@/lib/visitorSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: visitorCorsHeaders(request) });
}

export async function GET(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return json(request, { error: "Forbidden origin" }, 403);

  const tenant = await getTenantFromRequest(request);
  if (!tenant) return json(request, { error: "Unknown or inactive tenant" }, 404);

  const visitor = await resolveVisitor(request, tenant.tenantId);
  if (!visitor) return json(request, { error: "Not authenticated" }, 401);

  return json(request, { visitor }, 200);
}

function json(request: Request, payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...visitorCorsHeaders(request) },
  });
}
