import "server-only";

import { createServiceClient } from "@lume/db/server";
import {
  parseFeedRunCommandReceipt,
  parseLeadAssignCommandReceipt,
  parseVehiclePriceCommandReceipt,
  parseLeadStatusCommandReceipt,
  type ExecutedFeedRunCommand,
  type ExecutedLeadAssignCommand,
  type ExecutedVehiclePriceCommand,
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

export type FeedRunCommandPreview = {
  commandId: string;
  expiresAt: string;
  feed: { id: string; name: string; configVersion: number };
};

export type CreateFeedRunCommandResult =
  | { ok: true; command: FeedRunCommandPreview }
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

export type LeadAssignCommandPreview = {
  commandId: string;
  expiresAt: string;
  lead: { id: string; label: string };
  assignee: { userId: string; label: string };
};

export type CreateLeadAssignCommandResult =
  | { ok: true; command: LeadAssignCommandPreview }
  | { ok: false; reason: "migration_required" | "unavailable" };

export async function createLeadAssignCommand(input: {
  tenantId: string;
  actorUserId: string;
  lead: { id: string; label: string; currentAssignee: string | null };
  assignee: { userId: string; label: string };
}): Promise<CreateLeadAssignCommandResult> {
  const expiresAt = new Date(Date.now() + COMMAND_TTL_MS).toISOString();
  const preview = {
    // currentAssignee is the compare-and-swap precondition the executor checks.
    lead: { id: input.lead.id, label: input.lead.label, currentAssignee: input.lead.currentAssignee },
    assignee: { userId: input.assignee.userId, label: input.assignee.label },
  };
  const { data, error } = await createServiceClient()
    .from("admin_concierge_commands")
    .insert({
      tenant_id: input.tenantId,
      actor_user_id: input.actorUserId,
      capability_id: "lead.assign",
      intent: { leadId: input.lead.id, assigneeUserId: input.assignee.userId },
      preview,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, reason: error?.code === "42P01" ? "migration_required" : "unavailable" };
  }
  return {
    ok: true,
    command: {
      commandId: data.id,
      expiresAt,
      lead: { id: input.lead.id, label: input.lead.label },
      assignee: preview.assignee,
    },
  };
}

export async function executeLeadAssignCommand(input: {
  commandId: string;
  tenantId: string;
  actorUserId: string;
}): Promise<ExecutedLeadAssignCommand> {
  const { data, error } = await createServiceClient().rpc(
    "execute_admin_concierge_lead_assign_command",
    {
      p_command_id: input.commandId,
      p_tenant_id: input.tenantId,
      p_actor_user_id: input.actorUserId,
    },
  );
  return error ? parseLeadAssignCommandReceipt(null) : parseLeadAssignCommandReceipt(data);
}

export type VehiclePriceCommandPreview = {
  commandId: string;
  expiresAt: string;
  vehicle: { id: string; label: string; currentPrice: number; nextPrice: number };
};

export type CreateVehiclePriceCommandResult =
  | { ok: true; command: VehiclePriceCommandPreview }
  | { ok: false; reason: "migration_required" | "unavailable" };

export async function createVehiclePriceCommand(input: {
  tenantId: string;
  actorUserId: string;
  vehicle: { id: string; label: string; currentPrice: number };
  nextPrice: number;
}): Promise<CreateVehiclePriceCommandResult> {
  const expiresAt = new Date(Date.now() + COMMAND_TTL_MS).toISOString();
  const preview = {
    // currentPrice is the compare-and-swap precondition the executor checks.
    vehicle: {
      id: input.vehicle.id,
      label: input.vehicle.label,
      currentPrice: input.vehicle.currentPrice,
      nextPrice: input.nextPrice,
    },
  };
  const { data, error } = await createServiceClient()
    .from("admin_concierge_commands")
    .insert({
      tenant_id: input.tenantId,
      actor_user_id: input.actorUserId,
      capability_id: "vehicle.price.update",
      intent: { vehicleId: input.vehicle.id, price: input.nextPrice },
      preview,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, reason: error?.code === "42P01" ? "migration_required" : "unavailable" };
  }
  return { ok: true, command: { commandId: data.id, expiresAt, vehicle: preview.vehicle } };
}

export async function executeVehiclePriceCommand(input: {
  commandId: string;
  tenantId: string;
  actorUserId: string;
}): Promise<ExecutedVehiclePriceCommand> {
  const { data, error } = await createServiceClient().rpc(
    "execute_admin_concierge_vehicle_price_command",
    {
      p_command_id: input.commandId,
      p_tenant_id: input.tenantId,
      p_actor_user_id: input.actorUserId,
    },
  );
  return error ? parseVehiclePriceCommandReceipt(null) : parseVehiclePriceCommandReceipt(data);
}

export async function createFeedRunCommand(input: {
  tenantId: string;
  actorUserId: string;
  feed: { id: string; name: string; configVersion: number };
}): Promise<CreateFeedRunCommandResult> {
  const expiresAt = new Date(Date.now() + COMMAND_TTL_MS).toISOString();
  const preview = { feed: input.feed };
  const { data, error } = await createServiceClient()
    .from("admin_concierge_commands")
    .insert({
      tenant_id: input.tenantId,
      actor_user_id: input.actorUserId,
      capability_id: "feed.run.enqueue",
      intent: { feedSourceId: input.feed.id, configVersion: input.feed.configVersion },
      preview,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, reason: error?.code === "42P01" ? "migration_required" : "unavailable" };
  }
  return { ok: true, command: { commandId: data.id, expiresAt, feed: input.feed } };
}

export async function executeFeedRunCommand(input: {
  commandId: string;
  tenantId: string;
  actorUserId: string;
}): Promise<ExecutedFeedRunCommand> {
  const { data, error } = await createServiceClient().rpc(
    "execute_admin_concierge_feed_run_command",
    {
      p_command_id: input.commandId,
      p_tenant_id: input.tenantId,
      p_actor_user_id: input.actorUserId,
    },
  );
  return error ? parseFeedRunCommandReceipt(null) : parseFeedRunCommandReceipt(data);
}

export type AdminConciergeCommandCapability = "lead.status.update" | "feed.run.enqueue" | "lead.assign" | "vehicle.price.update";
export type ExecutedAdminConciergeCommand =
  | { capabilityId: "lead.status.update"; result: ExecutedLeadStatusCommand }
  | { capabilityId: "feed.run.enqueue"; result: ExecutedFeedRunCommand }
  | { capabilityId: "lead.assign"; result: ExecutedLeadAssignCommand }
  | { capabilityId: "vehicle.price.update"; result: ExecutedVehiclePriceCommand }
  | { capabilityId: null; result: { ok: false; reason: "not_found" | "unavailable"; error: string } };

/** Load only the command kind needed to select the independently secured executor. */
export async function getAdminConciergeCommandCapability(input: {
  commandId: string;
  tenantId: string;
  actorUserId: string;
}): Promise<AdminConciergeCommandCapability | null> {
  const { data, error } = await createServiceClient()
    .from("admin_concierge_commands")
    .select("capability_id")
    .eq("id", input.commandId)
    .eq("tenant_id", input.tenantId)
    .eq("actor_user_id", input.actorUserId)
    .maybeSingle();
  if (error || !data) return null;
  return data.capability_id === "lead.status.update"
    || data.capability_id === "feed.run.enqueue"
    || data.capability_id === "lead.assign"
    || data.capability_id === "vehicle.price.update"
    ? data.capability_id
    : null;
}

export async function executeAdminConciergeCommand(input: {
  commandId: string;
  tenantId: string;
  actorUserId: string;
  capabilityId: AdminConciergeCommandCapability;
}): Promise<ExecutedAdminConciergeCommand> {
  if (input.capabilityId === "lead.status.update") {
    return { capabilityId: input.capabilityId, result: await executeLeadStatusCommand(input) };
  }
  if (input.capabilityId === "vehicle.price.update") {
    return { capabilityId: input.capabilityId, result: await executeVehiclePriceCommand(input) };
  }
  if (input.capabilityId === "lead.assign") {
    return { capabilityId: input.capabilityId, result: await executeLeadAssignCommand(input) };
  }
  return { capabilityId: input.capabilityId, result: await executeFeedRunCommand(input) };
}

/**
 * Resolve teammate display names for an already-verified member list.
 *
 * profiles is RLS'd to `auth.uid() = id`, so the authenticated tenant client
 * can only ever see the caller's own row — teammates are invisible to it. The
 * service client is safe here because the caller has already reduced the ids
 * to confirmed members of one tenant; this function never widens that set.
 */
export async function resolveTenantTeammateNames(
  memberUserIds: readonly string[],
): Promise<Array<{ id: string; username: string }>> {
  if (memberUserIds.length === 0) return [];
  const { data, error } = await createServiceClient()
    .from("profiles")
    .select("id, username")
    .in("id", [...memberUserIds]);
  if (error || !data) return [];
  return data.flatMap((row) =>
    typeof row.username === "string" && row.username ? [{ id: row.id, username: row.username }] : []);
}
