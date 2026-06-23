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
