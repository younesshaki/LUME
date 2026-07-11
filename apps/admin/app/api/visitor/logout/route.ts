/**
 * POST /api/visitor/logout — revoke the current visitor session (SCRUM-129).
 * Deletes the session row and clears the cookie. Always 204.
 */
import { createServiceClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { isAllowedOrigin } from "@/lib/origin";
import { hashSessionToken } from "@/lib/visitorAuth";
import {
  clearSessionCookie,
  readSessionToken,
  visitorCorsHeaders,
} from "@/lib/visitorSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: visitorCorsHeaders(request) });
}

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) {
    return new Response(null, { status: 403, headers: visitorCorsHeaders(request) });
  }

  const token = readSessionToken(request);
  const tenant = await getTenantFromRequest(request);
  if (token && tenant) {
    await createServiceClient()
      .from("visitor_sessions")
      .delete()
      .eq("tenant_id", tenant.tenantId)
      .eq("token_hash", hashSessionToken(token));
  }

  return new Response(null, {
    status: 204,
    headers: { ...visitorCorsHeaders(request), "Set-Cookie": clearSessionCookie() },
  });
}
