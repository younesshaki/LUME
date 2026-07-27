import "server-only";

import { createServiceClient } from "@lume/db/server";
import {
  parseLeadStatusCommandReceipt,
  type ExecutedLeadStatusCommand,
} from "./adminConciergeCommandReceipt";

const COMMAND_TTL_MS = 5 * 60 * 1000;

export type LeadStatusCommandPreview = {
  commandId: string;
  expiresAt: string;
  lead: { id: string; label: string; currentStatus: string; nextStatus: string };
};

export type CreateLeadStatusCommandResult =
  | { ok: true; command: LeadStatusCommandPreview }
  | { ok: false; reason: "migration_required" | "unavailable" };

export async function createLeadStatusCommand(input: {
  tenantId: string;
  actorUserId: string;
  lead: { id: string; label: string; currentStatus: string };
  nextStatus: "new" | "contacted" | "qualified" | "won";
}): Promise<CreateLeadStatusCommandResult> {
  const expiresAt = new Date(Date.now() + COMMAND_TTL_MS).toISOString();
  const preview = {
    lead: {
      id: input.lead.id,
      label: input.lead.label,
      currentStatus: input.lead.currentStatus,
      nextStatus: input.nextStatus,
    },
  };
  const { data, error } = await createServiceClient()
    .from("admin_concierge_commands")
    .insert({
      tenant_id: input.tenantId,
      actor_user_id: input.actorUserId,
      capability_id: "lead.status.update",
      intent: { leadId: input.lead.id, status: input.nextStatus },
      preview,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, reason: error?.code === "42P01" ? "migration_required" : "unavailable" };
  }
  return { ok: true, command: { commandId: data.id, expiresAt, lead: preview.lead } };
}

export async function executeLeadStatusCommand(input: {
  commandId: string;
  tenantId: string;
  actorUserId: string;
}): Promise<ExecutedLeadStatusCommand> {
  const { data, error } = await createServiceClient().rpc(
    "execute_admin_concierge_lead_status_command",
    {
      p_command_id: input.commandId,
      p_tenant_id: input.tenantId,
      p_actor_user_id: input.actorUserId,
    },
  );
  return error ? parseLeadStatusCommandReceipt(null) : parseLeadStatusCommandReceipt(data);
}
