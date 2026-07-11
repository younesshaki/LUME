export type BillingSubscriptionSummary = {
  id: string;
  status: "inactive" | "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  planId: string;
  currentPeriodEnd: string | null;
  createdAt: string;
};

export type PlanLimitEntry = {
  key: string;
  label: string;
  value: string;
};

export type BillingUsageMeter = {
  state: "tracked" | "untracked" | "unconfigured" | "unlimited";
  used: number | null;
  allowance: number | null;
  percentage: number | null;
};

const STATUS_PRIORITY: Record<BillingSubscriptionSummary["status"], number> = {
  active: 0,
  trialing: 1,
  past_due: 2,
  incomplete: 3,
  canceled: 4,
  inactive: 5,
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Pick the operationally relevant subscription without relying on query order. */
export function selectPrimarySubscription(
  subscriptions: readonly BillingSubscriptionSummary[],
): BillingSubscriptionSummary | null {
  return [...subscriptions].sort((left, right) =>
    STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status] ||
    timestamp(right.currentPeriodEnd) - timestamp(left.currentPeriodEnd) ||
    timestamp(right.createdAt) - timestamp(left.createdAt) ||
    left.id.localeCompare(right.id)
  )[0] ?? null;
}

export function formatBillingAmount(cents: number, currency = "USD"): string {
  if (!Number.isSafeInteger(cents) || cents < 0) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** Render only scalar limit values; nested provider metadata stays hidden. */
export function planLimitEntries(limits: Record<string, unknown>): PlanLimitEntry[] {
  const entries: PlanLimitEntry[] = [];
  for (const [key, rawValue] of Object.entries(limits)) {
    const value = formatLimitValue(rawValue);
    if (value === null) continue;
    entries.push({ key, label: humanizeKey(key), value });
  }
  return entries.sort((left, right) => left.label.localeCompare(right.label));
}

export function findPlanAllowance(
  limits: Record<string, unknown>,
  candidateKeys: readonly string[],
): number | null {
  for (const key of candidateKeys) {
    const value = limits[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  }
  return null;
}

export function buildBillingUsageMeter(
  used: number | null,
  allowance: number | null,
): BillingUsageMeter {
  const normalizedUsed = used === null || !Number.isFinite(used)
    ? null
    : Math.max(0, Math.trunc(used));
  if (normalizedUsed === null) {
    return { state: "untracked", used: null, allowance, percentage: null };
  }
  if (allowance === null || !Number.isFinite(allowance)) {
    return { state: "unconfigured", used: normalizedUsed, allowance: null, percentage: null };
  }
  const normalizedAllowance = Math.trunc(allowance);
  if (normalizedAllowance < 0) {
    return {
      state: "unlimited",
      used: normalizedUsed,
      allowance: normalizedAllowance,
      percentage: 0,
    };
  }
  const percentage = normalizedAllowance === 0
    ? (normalizedUsed === 0 ? 0 : 100)
    : Math.min(100, Math.round((normalizedUsed / normalizedAllowance) * 100));
  return {
    state: "tracked",
    used: normalizedUsed,
    allowance: normalizedAllowance,
    percentage,
  };
}

export function normalizeInvoicePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function invoicePageCount(totalInvoices: number, pageSize: number): number {
  if (!Number.isSafeInteger(totalInvoices) || totalInvoices < 0) return 1;
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(totalInvoices / pageSize));
}

export function canManageBilling(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function isBillingPlanId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isManualPlanChangeAllowed(stripeSubscriptionId: string | null): boolean {
  return stripeSubscriptionId === null;
}

function formatLimitValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 0 ? "Unlimited" : value.toLocaleString("en-US");
  }
  if (typeof value === "boolean") return value ? "Included" : "Not included";
  if (typeof value === "string") return value.trim().slice(0, 120) || null;
  return null;
}

function humanizeKey(key: string): string {
  const words = key.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Limit";
}

function timestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
