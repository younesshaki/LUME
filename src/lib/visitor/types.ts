// TODO(contract): Move these visitor API response types to @lume/types once
// Claude's visitor endpoint contract is published by the shared package.
export type Visitor = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
};

export type VisitorSignupInput = {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
};

export type VisitorLoginInput = {
  email: string;
  password: string;
};

export type LoyaltyTier = {
  name: string;
  /** The API-provided target used to render progress toward the next tier. */
  threshold: number;
};

export type LoyaltyTransaction = {
  id: string;
  delta: number;
  reason: string;
  createdAt: string;
};

export type VisitorLoyalty = {
  points: number;
  tier: LoyaltyTier | null;
  transactions: LoyaltyTransaction[];
};
