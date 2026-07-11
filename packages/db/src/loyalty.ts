import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoyaltyAccrualEventType } from "@lume/types";
import type { Database } from "./schema";

export const LOYALTY_EVENT_POINTS = {
  chat_session: 5,
  saved_vehicle: 10,
  submitted_lead: 50,
  referral: 100,
} as const satisfies Record<LoyaltyAccrualEventType, number>;

export type LoyaltyAccrualInput = {
  tenantId: string;
  visitorId: string;
  eventType: LoyaltyAccrualEventType;
  idempotencyKey: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
};

export type LoyaltyAccrualResult = {
  applied: boolean;
  pointsDelta: number;
  balanceAfter: number;
  transactionId: string | null;
};

type DbClient = SupabaseClient<Database, "public">;

export function pointsForLoyaltyEvent(eventType: LoyaltyAccrualEventType): number {
  return LOYALTY_EVENT_POINTS[eventType];
}

export async function accrueLoyaltyPoints(
  client: DbClient,
  input: LoyaltyAccrualInput,
): Promise<LoyaltyAccrualResult> {
  const { data, error } = await client.rpc("accrue_loyalty_points", {
    p_tenant_id: input.tenantId,
    p_visitor_id: input.visitorId,
    p_event_type: input.eventType,
    p_idempotency_key: input.idempotencyKey,
    p_description: input.description ?? null,
    p_metadata: input.metadata ?? {},
  });

  if (error) throw new Error(`Unable to accrue loyalty points: ${error.message}`);
  const row = data?.[0];
  if (!row) throw new Error("Unable to accrue loyalty points: RPC returned no result.");

  return {
    applied: row.applied,
    pointsDelta: row.points_delta,
    balanceAfter: row.balance_after,
    transactionId: row.transaction_id,
  };
}
