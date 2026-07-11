import type { TenantId } from "./tenant";

export type VisitorId = string;

/** A public-site visitor identity. Never carries the password hash. */
export type Visitor = {
  id: VisitorId;
  tenantId: TenantId;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
};

/** Request bodies for the public visitor auth endpoints. */
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

/** One persisted chat message in a visitor's history. */
export type VisitorChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

/** Normalized, non-identifying vehicle preferences learned server-side. */
export type VisitorBudgetPreference = {
  min: number | null;
  max: number | null;
  currency: "USD";
};

export type VisitorPreferences = {
  preferredMakes: string[];
  bodyStyles: string[];
  budget: VisitorBudgetPreference | null;
};
