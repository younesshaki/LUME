export type ExecutedLeadStatusCommand =
  | { ok: true; alreadyExecuted: boolean; leadId: string; previousStatus: string; nextStatus: string }
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
