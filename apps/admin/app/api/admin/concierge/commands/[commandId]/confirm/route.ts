/** Confirm one previously previewed admin-concierge command. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { executeLeadStatusCommand } from "@/lib/adminConciergeCommands.server";
import { auditWrite, requestIp } from "@/lib/audit";
import { captureError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ commandId: string }> };

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request, { params }: Props): Promise<Response> {
  const { commandId } = await params;
  if (!isUuid(commandId)) return json({ error: "Invalid command." }, 400);
  const body = await request.json().catch(() => null);
  const tenantSlug = isRecord(body) && typeof body.tenantSlug === "string" ? body.tenantSlug.trim() : "";
  if (!tenantSlug) return json({ error: "tenantSlug is required." }, 400);

  const supabase = await createSupabaseServerClient();
  const [{ data: userData }, { data: tenant }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle(),
  ]);
  if (!userData.user) return json({ error: "Authentication required." }, 401);
  if (!tenant) return json({ error: "Not authorized for this tenant." }, 403);
  const { data: canWrite, error: roleError } = await supabase.rpc("user_has_tenant_role", {
    p_tenant_id: tenant.id,
    p_roles: ["editor", "admin", "owner"],
  });
  if (roleError || !canWrite) return json({ error: "Editor access is required." }, 403);

  const executed = await executeLeadStatusCommand({
    commandId,
    tenantId: tenant.id,
    actorUserId: userData.user.id,
  });
  if (!executed.ok) {
    const status = executed.reason === "not_found" ? 404 : executed.reason === "expired" ? 410 : 409;
    return json({ error: executed.error }, status);
  }

  // Never claim success from the RPC result alone. Re-read through the
  // authenticated tenant client and prove that the stored lead state matches.
  const { data: lead, error: verifyError } = await supabase
    .from("leads")
    .select("id, status")
    .eq("tenant_id", tenant.id)
    .eq("id", executed.leadId)
    .maybeSingle();
  if (verifyError || !lead || lead.status !== executed.nextStatus) {
    captureError("api/admin-concierge/lead-status-verification", new Error("fresh verification read did not match command receipt"), {
      tenantId: tenant.id,
      commandId,
    });
    return json({ error: "The command completed but its result could not be verified. Please refresh the lead before trying anything else." }, 502);
  }

  if (!executed.alreadyExecuted) {
    await auditWrite({
      tenantId: tenant.id,
      actorUserId: userData.user.id,
      action: "admin_concierge.lead_status_updated",
      resourceType: "lead",
      resourceId: executed.leadId,
      metadata: { commandId, previousStatus: executed.previousStatus, nextStatus: executed.nextStatus },
      ipAddr: requestIp(request),
    }).catch(() => undefined);
  }
  return json({
    reply: executed.alreadyExecuted
      ? `This reviewed lead-status change was already completed: ${executed.previousStatus} → ${executed.nextStatus}.`
      : `Lead status updated and verified: ${executed.previousStatus} → ${executed.nextStatus}.`,
    receipt: {
      commandId,
      leadId: executed.leadId,
      previousStatus: executed.previousStatus,
      nextStatus: executed.nextStatus,
      alreadyExecuted: executed.alreadyExecuted,
    },
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
