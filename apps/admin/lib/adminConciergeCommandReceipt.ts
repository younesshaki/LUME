export type ExecutedLeadStatusCommand =
  | { ok: true; alreadyExecuted: boolean; leadId: string; previousStatus: string; nextStatus: string }
  | { ok: false; reason: "not_found" | "expired" | "stale" | "failed" | "unavailable"; error: string };

export type ExecutedFeedRunCommand =
  | { ok: true; alreadyExecuted: boolean; feedSourceId: string; feedName: string; runId: string }
  | { ok: false; reason: "not_found" | "expired" | "stale" | "failed" | "unavailable"; error: string };

export type ExecutedLeadAssignCommand =
  | { ok: true; alreadyExecuted: boolean; leadId: string; assigneeUserId: string; assigneeLabel: string }
  | { ok: false; reason: "not_found" | "expired" | "stale" | "failed" | "unavailable"; error: string };

export type ExecutedVehiclePriceCommand =
  | { ok: true; alreadyExecuted: boolean; vehicleId: string; label: string; previousPrice: number; nextPrice: number }
  | { ok: false; reason: "not_found" | "expired" | "stale" | "failed" | "unavailable"; error: string };

/** Validate the opaque database receipt before it can reach an API response. */
export function parseLeadStatusCommandReceipt(value: unknown): ExecutedLeadStatusCommand {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "unavailable", error: "Unable to execute the reviewed command." };
  }
  const result = value as Record<string, unknown>;
  if (
    result.status === "executed" &&
    typeof result.leadId === "string" &&
    typeof result.previousStatus === "string" &&
    typeof result.nextStatus === "string"
  ) {
    return {
      ok: true,
      alreadyExecuted: result.alreadyExecuted === true,
      leadId: result.leadId,
      previousStatus: result.previousStatus,
      nextStatus: result.nextStatus,
    };
  }
  if (result.status === "not_found" || result.status === "expired" || result.status === "stale" || result.status === "failed") {
    return {
      ok: false,
      reason: result.status,
      error: typeof result.error === "string" ? result.error : "Command could not be completed.",
    };
  }
  return { ok: false, reason: "unavailable", error: "Command could not be completed." };
}

/** Validate the durable queue receipt before a server route claims a feed ran. */
export function parseFeedRunCommandReceipt(value: unknown): ExecutedFeedRunCommand {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "unavailable", error: "Unable to queue the reviewed feed run." };
  }
  const result = value as Record<string, unknown>;
  if (
    result.status === "queued" &&
    typeof result.feedSourceId === "string" &&
    typeof result.feedName === "string" &&
    typeof result.runId === "string"
  ) {
    return {
      ok: true,
      alreadyExecuted: result.alreadyExecuted === true,
      feedSourceId: result.feedSourceId,
      feedName: result.feedName,
      runId: result.runId,
    };
  }
  if (result.status === "not_found" || result.status === "expired" || result.status === "stale" || result.status === "failed") {
    return {
      ok: false,
      reason: result.status,
      error: typeof result.error === "string" ? result.error : "Command could not be completed.",
    };
  }
  return { ok: false, reason: "unavailable", error: "Command could not be completed." };
}

/** Same contract as the other receipts: never trust the shape from the database. */
export function parseLeadAssignCommandReceipt(value: unknown): ExecutedLeadAssignCommand {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "unavailable", error: "Unable to execute the reviewed command." };
  }
  const record = value as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status : "";
  if (status === "executed") {
    const leadId = typeof record.leadId === "string" ? record.leadId : "";
    const assigneeUserId = typeof record.assigneeUserId === "string" ? record.assigneeUserId : "";
    const assigneeLabel = typeof record.assigneeLabel === "string" ? record.assigneeLabel : "";
    if (!leadId || !assigneeUserId) {
      return { ok: false, reason: "unavailable", error: "Unable to execute the reviewed command." };
    }
    return {
      ok: true,
      alreadyExecuted: record.alreadyExecuted === true,
      leadId,
      assigneeUserId,
      assigneeLabel,
    };
  }
  const error = typeof record.error === "string" && record.error
    ? record.error
    : "The reviewed command could not be completed.";
  if (status === "not_found") return { ok: false, reason: "not_found", error: "That reviewed command no longer exists." };
  if (status === "expired") return { ok: false, reason: "expired", error };
  if (status === "stale") return { ok: false, reason: "stale", error };
  if (status === "failed") return { ok: false, reason: "failed", error };
  return { ok: false, reason: "unavailable", error };
}

export function parseVehiclePriceCommandReceipt(value: unknown): ExecutedVehiclePriceCommand {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "unavailable", error: "Unable to execute the reviewed command." };
  }
  const record = value as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status : "";
  if (status === "executed") {
    const vehicleId = typeof record.vehicleId === "string" ? record.vehicleId : "";
    const nextPrice = typeof record.nextPrice === "number" ? record.nextPrice : null;
    const previousPrice = typeof record.previousPrice === "number" ? record.previousPrice : null;
    if (!vehicleId || nextPrice === null || previousPrice === null) {
      return { ok: false, reason: "unavailable", error: "Unable to execute the reviewed command." };
    }
    return {
      ok: true,
      alreadyExecuted: record.alreadyExecuted === true,
      vehicleId,
      label: typeof record.label === "string" ? record.label : "the vehicle",
      previousPrice,
      nextPrice,
    };
  }
  const error = typeof record.error === "string" && record.error
    ? record.error
    : "The reviewed command could not be completed.";
  if (status === "not_found") return { ok: false, reason: "not_found", error: "That reviewed command no longer exists." };
  if (status === "expired") return { ok: false, reason: "expired", error };
  if (status === "stale") return { ok: false, reason: "stale", error };
  if (status === "failed") return { ok: false, reason: "failed", error };
  return { ok: false, reason: "unavailable", error };
}
