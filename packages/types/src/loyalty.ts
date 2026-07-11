import type { TenantId } from "./tenant";

export type LoyaltyAccountId = string;
export type LoyaltyTransactionId = string;

export type LoyaltyTransactionSource =
  | "manual"
  | "lead"
  | "purchase"
  | "redemption"
  | "adjustment"
  | "expiration";

export type LoyaltyAccrualEventType =
  | "chat_session"
  | "saved_vehicle"
  | "submitted_lead"
  | "referral";

export type LoyaltyAccount = {
  id: LoyaltyAccountId;
  tenantId: TenantId;
  leadId: string | null;
  externalCustomerId: string | null;
  email: string | null;
  phone: string | null;
  pointsBalance: number;
  tier: string;
  createdAt: string;
  updatedAt: string;
};

export type LoyaltyTierId = string;

/** A per-tenant loyalty tier definition (SCRUM-134). */
export type LoyaltyTier = {
  id: LoyaltyTierId;
  tenantId: TenantId;
  name: string;
  threshold: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Shape returned by GET /api/visitor/loyalty — the visitor account page reads
 * this. `tier` is the highest tier the balance qualifies for, or null.
 */
export type VisitorLoyaltyView = {
  points: number;
  tier: { name: string; threshold: number } | null;
  transactions: Array<{
    id: LoyaltyTransactionId;
    delta: number;
    reason: string | null;
    createdAt: string;
  }>;
};

export type LoyaltyTransaction = {
  id: LoyaltyTransactionId;
  tenantId: TenantId;
  accountId: LoyaltyAccountId;
  leadId: string | null;
  source: LoyaltyTransactionSource;
  pointsDelta: number;
  balanceAfter: number;
  description: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
};
