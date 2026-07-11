export type PublicUsageEventType =
  | "chat_requests"
  | "vehicle_requests"
  | "bot_action_requests"
  | "lead_requests";

export type UsageRpc = (
  functionName: "increment_usage_event",
  args: {
    p_tenant_id: string;
    p_event_type: PublicUsageEventType;
    p_period_start: null;
    p_increment: number;
  },
) => PromiseLike<{ error: unknown }>;

/** Best-effort metering for root Vercel functions that do not use @lume/db. */
export async function recordPublicUsage(
  rpc: UsageRpc | null,
  tenantId: string,
  eventType: PublicUsageEventType,
): Promise<boolean> {
  const normalizedTenantId = tenantId.trim();
  if (!rpc || !normalizedTenantId) return false;
  try {
    const { error } = await rpc("increment_usage_event", {
      p_tenant_id: normalizedTenantId,
      p_event_type: eventType,
      p_period_start: null,
      p_increment: 1,
    });
    return !error;
  } catch {
    return false;
  }
}
