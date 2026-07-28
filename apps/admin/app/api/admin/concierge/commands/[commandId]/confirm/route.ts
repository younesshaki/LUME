/** Confirm one previously previewed admin-concierge command. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  executeAdminConciergeCommand,
  getAdminConciergeCommandCapability,
} from "@/lib/adminConciergeCommands.server";
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
  const capabilityId = await getAdminConciergeCommandCapability({
    commandId,
    tenantId: tenant.id,
    actorUserId: userData.user.id,
  });
  if (!capabilityId) return json({ error: "Command not found." }, 404);
  const requiredRoles = capabilityId === "feed.run.enqueue" ? ["owner", "admin"] : ["editor", "admin", "owner"];
  const { data: canWrite, error: roleError } = await supabase.rpc("user_has_tenant_role", {
    p_tenant_id: tenant.id,
    p_roles: requiredRoles,
  });
  if (roleError || !canWrite) {
    return json({ error: capabilityId === "feed.run.enqueue" ? "Owner or admin access is required." : "Editor access is required." }, 403);
  }

  const executed = await executeAdminConciergeCommand({
    commandId,
    tenantId: tenant.id,
    actorUserId: userData.user.id,
    capabilityId,
  });
  if (!executed.result.ok) {
    const status = executed.result.reason === "not_found" ? 404 : executed.result.reason === "expired" ? 410 : 409;
    return json({ error: executed.result.error }, status);
  }

  if (executed.capabilityId === "feed.run.enqueue") {
    return verifyFeedRunCommand(supabase, tenant.id, userData.user.id, commandId, executed.result, request);
  }
  if (executed.capabilityId === "lead.assign") {
    return verifyLeadAssignCommand(supabase, tenant.id, userData.user.id, commandId, executed.result, request);
  }
  return verifyLeadStatusCommand(supabase, tenant.id, userData.user.id, commandId, executed.result, request);
}

/**
 * Same contract as the status verifier: the RPC receipt is never trusted on
 * its own. Re-read the lead through the authenticated tenant client and prove
 * the stored assignee is the one the operator approved.
 */
async function verifyLeadAssignCommand(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  actorUserId: string,
  commandId: string,
  executed: Extract<Awaited<ReturnType<typeof executeAdminConciergeCommand>>, { capabilityId: "lead.assign" }>['result'] & { ok: true },
  request: Request,
): Promise<Response> {
  const { data: lead, error: verifyError } = await supabase
    .from("leads")
    .select("id, assigned_to")
    .eq("tenant_id", tenantId)
    .eq("id", executed.leadId)
    .maybeSingle();
  if (verifyError || !lead || lead.assigned_to !== executed.assigneeUserId) {
    return json({ error: "The assignment could not be verified after execution." }, 502);
  }
  void actorUserId;
  void commandId;
  void request;
  return json({
    reply: executed.alreadyExecuted
      ? `That lead was already assigned to ${executed.assigneeLabel}.`
      : `Assigned to ${executed.assigneeLabel}.`,
  });
}

async function verifyLeadStatusCommand(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  actorUserId: string,
  commandId: string,
  executed: Extract<Awaited<ReturnType<typeof executeAdminConciergeCommand>>, { capabilityId: "lead.status.update" }>['result'] & { ok: true },
  request: Request,
): Promise<Response> {
  // Never claim success from the RPC result alone. Re-read through the
  // authenticated tenant client and prove that the stored lead state matches.
  const { data: lead, error: verifyError } = await supabase
    .from("leads")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("id", executed.leadId)
    .maybeSingle();
  if (verifyError || !lead || lead.status !== executed.nextStatus) {
    captureError("api/admin-concierge/lead-status-verification", new Error("fresh verification read did not match command receipt"), {
      tenantId,
      commandId,
    });
    return json({ error: "The command completed but its result could not be verified. Please refresh the lead before trying anything else." }, 502);
  }

  if (!executed.alreadyExecuted) {
    await auditWrite({
      tenantId,
      actorUserId,
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

async function verifyFeedRunCommand(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  actorUserId: string,
  commandId: string,
  executed: Extract<Awaited<ReturnType<typeof executeAdminConciergeCommand>>, { capabilityId: "feed.run.enqueue" }>['result'] & { ok: true },
  request: Request,
): Promise<Response> {
  // The executor confirms only queue insertion. Re-read the concrete run under
  // tenant RLS before saying a worker request exists; do not imply it finished.
  const { data: run, error: verifyError } = await supabase
    .from("inventory_feed_runs")
    .select("id, feed_source_id, status")
    .eq("tenant_id", tenantId)
    .eq("id", executed.runId)
    .eq("feed_source_id", executed.feedSourceId)
    .maybeSingle();
  if (verifyError || !run || run.status === "cancelled") {
    captureError("api/admin-concierge/feed-run-verification", new Error("fresh verification read did not find a usable queued feed run"), {
      tenantId,
      commandId,
    });
    return json({ error: "The feed run was requested but its queue state could not be verified. Please refresh Inventory feeds before trying anything else." }, 502);
  }
  const stillQueued = ["pending", "processing", "retrying"].includes(run.status);
  if (!executed.alreadyExecuted) {
    await auditWrite({
      tenantId,
      actorUserId,
      action: "admin_concierge.feed_run_queued",
      resourceType: "inventory_feed_run",
      resourceId: executed.runId,
      metadata: { commandId, feedSourceId: executed.feedSourceId },
      ipAddr: requestIp(request),
    }).catch(() => undefined);
  }
  return json({
    reply: executed.alreadyExecuted
      ? `This reviewed run for ${executed.feedName} was already queued and remains verified.`
      : stillQueued
        ? `Queued and verified one managed run for ${executed.feedName}. The worker will process it asynchronously.`
        : `The requested run for ${executed.feedName} was queued and has already completed with status “${run.status}”. Review Inventory feeds for its result.`,
    receipt: {
      commandId,
      feedSourceId: executed.feedSourceId,
      runId: executed.runId,
      status: run.status,
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
