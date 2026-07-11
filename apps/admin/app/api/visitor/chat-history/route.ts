/**
 * Visitor chat history (SCRUM-130). Persists a signed-in visitor's conversation
 * per tenant so the bot can resume it.
 *
 *   GET  → messages of the visitor's most recent session (chronological)
 *   POST → append { role, content } to that session, creating one on first use
 *
 * Both require a signed-in visitor. Written with the service-role client; the
 * chat_* tables are member-readable but service-role-written.
 */
import type { VisitorChatMessage } from "@lume/types";
import { accrueLoyaltyPoints } from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { isAllowedOrigin } from "@/lib/origin";
import { resolveVisitor, visitorCorsHeaders } from "@/lib/visitorSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HISTORY = 100;
const ROLES = new Set(["user", "assistant", "system"]);

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: visitorCorsHeaders(request) });
}

export async function GET(request: Request): Promise<Response> {
  const ctx = await requireVisitor(request);
  if ("error" in ctx) return json(request, { error: ctx.error }, ctx.status);

  const supabase = createServiceClient();
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("visitor_id", ctx.visitorId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return json(request, { sessionId: null, messages: [] }, 200);

  const { data: rows } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("tenant_id", ctx.tenantId)
    .eq("session_id", session.id)
    .order("created_at", { ascending: true })
    .limit(MAX_HISTORY);

  const messages: VisitorChatMessage[] = (rows ?? []).map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  }));
  return json(request, { sessionId: session.id, messages }, 200);
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await requireVisitor(request);
  if ("error" in ctx) return json(request, { error: ctx.error }, ctx.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "Invalid JSON" }, 400);
  }
  const rec = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const role =
    typeof rec.role === "string" && ROLES.has(rec.role)
      ? (rec.role as "user" | "assistant" | "system")
      : null;
  const content = typeof rec.content === "string" ? rec.content.trim() : "";
  if (!role || !content) return json(request, { error: "role and content are required" }, 400);

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("visitor_id", ctx.visitorId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sessionId = existing?.id ?? null;
  let createdSession = false;
  if (!sessionId) {
    const { data: created, error } = await supabase
      .from("chat_sessions")
      .insert({ tenant_id: ctx.tenantId, visitor_id: ctx.visitorId })
      .select("id")
      .single();
    if (error || !created) return json(request, { error: "Unable to start session" }, 500);
    sessionId = created.id;
    createdSession = true;
  }

  const { error: msgError } = await supabase.from("chat_messages").insert({
    tenant_id: ctx.tenantId,
    session_id: sessionId,
    role,
    content: content.slice(0, 8_000),
  });
  if (msgError) return json(request, { error: "Unable to persist message" }, 500);

  if (createdSession) {
    await accrueLoyaltyPoints(supabase, {
      tenantId: ctx.tenantId,
      visitorId: ctx.visitorId,
      eventType: "chat_session",
      idempotencyKey: `chat-session:${sessionId}`,
      description: "Started a chat session",
    }).catch((error: unknown) => {
      console.error(
        "[visitor/chat-history] loyalty accrual failed:",
        error instanceof Error ? error.message : "unknown error",
      );
    });
  }

  return json(request, { sessionId }, 201);
}

async function requireVisitor(
  request: Request,
): Promise<{ tenantId: string; visitorId: string } | { error: string; status: number }> {
  if (!isAllowedOrigin(request)) return { error: "Forbidden origin", status: 403 };
  const tenant = await getTenantFromRequest(request);
  if (!tenant) return { error: "Unknown or inactive tenant", status: 404 };
  const visitor = await resolveVisitor(request, tenant.tenantId);
  if (!visitor) return { error: "Not authenticated", status: 401 };
  return { tenantId: tenant.tenantId, visitorId: visitor.id };
}

function json(request: Request, payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...visitorCorsHeaders(request) },
  });
}
