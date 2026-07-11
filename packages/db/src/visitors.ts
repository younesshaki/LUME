/**
 * Visitor account helpers (Epic G — SCRUM-128/130) and the loyalty view
 * assembly for the public account page (SCRUM-135 backend).
 *
 * Row-mapping + derivation are pure so they can be unit-tested; the actual
 * queries run in the trusted route handlers with the service-role client.
 */
import type { Visitor, VisitorLoyaltyView } from "@lume/types";
import type { Database } from "./schema";

export type VisitorRow = Database["public"]["Tables"]["visitors"]["Row"];
type LoyaltyAccountRow = Database["public"]["Tables"]["loyalty_accounts"]["Row"];
type LoyaltyTransactionRow = Database["public"]["Tables"]["loyalty_transactions"]["Row"];
type LoyaltyTierRow = Database["public"]["Tables"]["loyalty_tiers"]["Row"];

/** Map a visitor row to the public shape — never leaks `password_hash`. */
export function rowToVisitor(row: VisitorRow): Visitor {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    createdAt: row.created_at,
  };
}

/**
 * Highest tier whose threshold the balance meets. Tiers may arrive in any
 * order; ties resolve to the larger threshold. Returns null when no tier
 * qualifies (e.g. balance below the lowest threshold, or no tiers configured).
 */
export function deriveTier(
  tiers: Array<Pick<LoyaltyTierRow, "name" | "threshold">>,
  points: number,
): { name: string; threshold: number } | null {
  let best: { name: string; threshold: number } | null = null;
  for (const tier of tiers) {
    if (points >= tier.threshold && (best === null || tier.threshold > best.threshold)) {
      best = { name: tier.name, threshold: tier.threshold };
    }
  }
  return best;
}

/** Assemble the GET /api/visitor/loyalty payload from raw rows. */
export function assembleVisitorLoyalty(
  account: Pick<LoyaltyAccountRow, "points_balance"> | null,
  transactions: Array<
    Pick<LoyaltyTransactionRow, "id" | "points_delta" | "description" | "occurred_at">
  >,
  tiers: Array<Pick<LoyaltyTierRow, "name" | "threshold">>,
): VisitorLoyaltyView {
  const points = account?.points_balance ?? 0;
  return {
    points,
    tier: deriveTier(tiers, points),
    transactions: transactions.map((tx) => ({
      id: tx.id,
      delta: tx.points_delta,
      reason: tx.description,
      createdAt: tx.occurred_at,
    })),
  };
}
