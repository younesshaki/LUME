/**
 * POST /api/editor/chat
 *
 * Admin-only editor copilot for the Website Studio: a tenant editor sends the
 * current draft + a conversation, and gets back a short reply plus a closed
 * union of validated block-edit proposals ({@link ProposedEdit}). The model
 * never mutates anything: edits are validated here against @lume/blocks
 * descriptors and only applied client-side when the human clicks Apply.
 *
 * Deliberately separate from the public visitor chat (/api/chat): different
 * audience (authenticated editors, not anonymous visitors), different
 * contract (one JSON envelope, not SSE), different capability surface.
 *
 * Auth: Supabase session + `user_has_tenant_role` (owner/admin/editor) for
 * the tenant named in the request. Plan: `chat.actions` entitlement (same
 * gate as the action-capable visitor concierge; a dedicated editor
 * entitlement is a noted follow-up).
 */
import { createServiceClient } from "@lume/db/server";
import { resolveTenantPlan } from "@lume/db";
import { validatePageBlocksDocument, listEditorBlockDescriptors } from "@lume/blocks";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkChatRateLimit, clientIpFromRequest } from "@/lib/rateLimit";
import {
  EDITOR_CHAT_LIMITS,
  buildEditorSystemPrompt,
  parseCopilotOutput,
  parseEditorChatRequest,
  validateProposedEdits,
  type EditorChatResponse,
} from "@/lib/editorCopilot";
import { requestEditorCopilotCompletion } from "@/lib/editorCopilotLlm";
import { captureError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request): Promise<Response> {
  // Size cap before any parsing — drafts are bounded, so are conversations.
  const bodyText = await request.text();
  if (new TextEncoder().encode(bodyText).byteLength > EDITOR_CHAT_LIMITS.maxBodyBytes) {
    return json({ error: "Request too large" }, 400);
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const parsed = parseEditorChatRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { tenantSlug, pageSlug, pageTitle, draft, selectedBlockId, messages } =
    parsed.request;

  // ── Auth: session + editor-or-higher role in the named tenant ────────────
  // The slug arrives in the body, but authorization never trusts it alone:
  // the role RPC decides against the caller's real memberships.
  const supabase = await createSupabaseServerClient();
  const [{ data: tenant }, userResult] = await Promise.all([
    supabase.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const user = userResult.data.user;
  if (!user) return json({ error: "Authentication required" }, 401);
  if (!tenant) return json({ error: "Not authorized for this tenant" }, 403);
  const { data: allowed, error: roleError } = await supabase.rpc("user_has_tenant_role", {
    p_tenant_id: tenant.id,
    p_roles: ["owner", "admin", "editor"],
  });
  if (roleError || !allowed) {
    return json({ error: "Not authorized for this tenant" }, 403);
  }

  // ── Plan gate (fails closed to Basic inside resolveTenantPlan) ───────────
  const plan = await resolveTenantPlan(createServiceClient(), tenant.id);
  if (!plan.entitlements["chat.actions"]) {
    return json(
      { error: "plan_upgrade_required", feature: "chat.actions" },
      403,
    );
  }

  // ── Rate limit (own bucket; does not share the public visitors' one) ─────
  const rate = checkChatRateLimit(`editor:${clientIpFromRequest(request)}`);
  if (!rate.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(rate.retryAfterSeconds),
      },
    });
  }

  // ── The draft itself must be valid before it reaches the model ───────────
  const draftValidation = validatePageBlocksDocument(draft);
  if (!draftValidation.ok) {
    return json({ error: "draft failed validation", details: draftValidation.blockErrors }, 400);
  }

  // ── Model call (isolated seam) + deterministic validation ────────────────
  const systemPrompt = buildEditorSystemPrompt({
    pageSlug,
    pageTitle,
    draft,
    ...(selectedBlockId ? { selectedBlockId } : {}),
    descriptors: listEditorBlockDescriptors(),
  });
  const completion = await requestEditorCopilotCompletion([
    { role: "system", content: systemPrompt },
    ...messages,
  ]);
  if (!completion.ok) {
    captureError("api/editor-chat/llm", new Error(`editor copilot LLM ${completion.status}`), {
      tenantId: tenant.id,
    });
    return json({ error: "The editor concierge is temporarily unavailable." }, 502);
  }

  const { reply, rawEdits } = parseCopilotOutput(completion.content);
  const { edits, dropped } = validateProposedEdits(rawEdits, draft);

  const payload: EditorChatResponse = {
    reply: reply || (edits.length > 0 ? "Here is what I propose." : ""),
    edits,
    ...(dropped.length > 0 ? { droppedEdits: dropped } : {}),
  };
  return json(payload, 200);
}
