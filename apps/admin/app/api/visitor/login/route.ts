/**
 * POST /api/visitor/login — authenticate a visitor (SCRUM-129). On success sets
 * a session cookie and returns the visitor. Failures are deliberately generic
 * to avoid account enumeration.
 */
import { rowToVisitor } from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { isAllowedOrigin } from "@/lib/origin";
import { parseLoginInput } from "@/lib/visitorInput";
import { verifyPassword, createSessionToken } from "@/lib/visitorAuth";
import { buildSessionCookie, visitorCorsHeaders } from "@/lib/visitorSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: visitorCorsHeaders(request) });
}

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return json(request, { error: "Forbidden origin" }, 403);

  const tenant = await getTenantFromRequest(request);
  if (!tenant) return json(request, { error: "Unknown or inactive tenant" }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "Invalid JSON" }, 400);
  }

  const parsed = parseLoginInput(body);
  if (!parsed.ok) return json(request, { error: parsed.error }, 400);

  const supabase = createServiceClient();
  const { data: visitor } = await supabase
    .from("visitors")
    .select("*")
    .eq("tenant_id", tenant.tenantId)
    .eq("email", parsed.value.email)
    .maybeSingle();

  const ok = visitor ? await verifyPassword(parsed.value.password, visitor.password_hash) : false;
  if (!visitor || !ok) return json(request, { error: "Invalid email or password." }, 401);

  const session = createSessionToken();
  await supabase.from("visitor_sessions").insert({
    tenant_id: tenant.tenantId,
    visitor_id: visitor.id,
    token_hash: session.tokenHash,
    expires_at: session.expiresAt.toISOString(),
  });

  return json(
    request,
    { visitor: rowToVisitor(visitor) },
    200,
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
