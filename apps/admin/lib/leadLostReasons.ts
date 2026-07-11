/**
 * Canonical lead lost-reason taxonomy.
 *
 * Tenant configuration is intentionally treated as an overlay: disabling a
 * reason removes it from new selections without removing it from the merged
 * taxonomy. Historical leads can therefore keep resolving their stored key.
 */

export const DEFAULT_LEAD_LOST_REASON_KEYS = [
  "price",
  "timing",
  "ghosted",
  "competitor",
  "wrong-fit",
  "duplicate",
] as const;

export type DefaultLeadLostReasonKey = (typeof DEFAULT_LEAD_LOST_REASON_KEYS)[number];

export type LeadLostReason = {
  key: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  isDefault: boolean;
  /** True only for an unconfigured historical value resolved for reporting. */
  isLegacy: boolean;
};

export type TenantLeadLostReasonOverride = {
  key: string;
  label?: string | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
};

export type LeadLostReasonSummary = {
  key: string;
  label: string;
  count: number;
  isLegacy: boolean;
};

const MAX_KEY_LENGTH = 64;
const MAX_LABEL_LENGTH = 120;
const MAX_SORT_ORDER = 1_000_000;

export const DEFAULT_LEAD_LOST_REASONS: readonly LeadLostReason[] = [
  defaultReason("price", "Price", 10),
  defaultReason("timing", "Timing", 20),
  defaultReason("ghosted", "No response / ghosted", 30),
  defaultReason("competitor", "Chose a competitor", 40),
  defaultReason("wrong-fit", "Wrong fit", 50),
  defaultReason("duplicate", "Duplicate lead", 60),
];

function defaultReason(
  key: DefaultLeadLostReasonKey,
  label: string,
  sortOrder: number
): LeadLostReason {
  return {
    key,
    label,
    sortOrder,
    isActive: true,
    isDefault: true,
    isLegacy: false,
  };
}

/**
 * Convert a tenant-provided value to a stable storage key. Invalid/empty
 * values return null and should not be persisted.
 */
export function normalizeLeadLostReasonKey(value: string): string | null {
  const key = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_KEY_LENGTH)
    .replace(/-+$/g, "");

  return key.length > 0 ? key : null;
}

/** Merge defaults with tenant overrides while retaining disabled entries. */
export function mergeLeadLostReasons(
  overrides: readonly TenantLeadLostReasonOverride[] = []
): LeadLostReason[] {
  const reasons = new Map<string, LeadLostReason>(
    DEFAULT_LEAD_LOST_REASONS.map((reason) => [reason.key, { ...reason }])
  );

  overrides.forEach((override, index) => {
    const key = normalizeLeadLostReasonKey(override.key);
    if (!key) return;

    const existing = reasons.get(key);
    const label = normalizeLabel(override.label) ?? existing?.label ?? humanizeKey(key);
    const sortOrder = normalizeSortOrder(
      override.sortOrder,
      existing?.sortOrder ?? (DEFAULT_LEAD_LOST_REASONS.length + index + 1) * 10
    );

    reasons.set(key, {
      key,
      label,
      sortOrder,
      isActive: override.isActive ?? existing?.isActive ?? true,
      isDefault: existing?.isDefault ?? false,
      isLegacy: false,
    });
  });

  return [...reasons.values()].sort(compareReasons);
}

/** Reasons valid for a new lead update; historical/inactive rows stay hidden. */
export function selectableLeadLostReasons(
  reasons: readonly LeadLostReason[]
): LeadLostReason[] {
  return reasons.filter((reason) => reason.isActive).sort(compareReasons);
}

/**
 * Resolve a stored key against the complete taxonomy for reports. Disabled
 * configured reasons still resolve. Unknown historical values become a
 * read-only legacy entry rather than disappearing from analytics.
 */
export function resolveLeadLostReasonForReporting(
  storedValue: string | null | undefined,
  reasons: readonly LeadLostReason[]
): LeadLostReason | null {
  const rawValue = storedValue?.trim();
  if (!rawValue) return null;

  const normalizedKey = normalizeLeadLostReasonKey(rawValue);
  const normalizedLabel = rawValue.toLocaleLowerCase();
  const configured = reasons.find(
    (reason) =>
      (normalizedKey !== null && reason.key === normalizedKey) ||
      reason.label.toLocaleLowerCase() === normalizedLabel
  );
  if (configured) return { ...configured };

  const key = normalizedKey ?? "legacy-unknown";
  return {
    key,
    label: normalizedKey ? humanizeKey(normalizedKey) : rawValue.slice(0, MAX_LABEL_LENGTH),
    sortOrder: MAX_SORT_ORDER,
    isActive: false,
    isDefault: false,
    isLegacy: true,
  };
}

/** Group stored reason keys for reporting, retaining legacy and unspecified rows. */
export function summarizeLeadLostReasons(
  storedValues: readonly (string | null | undefined)[],
  reasons: readonly LeadLostReason[],
): LeadLostReasonSummary[] {
  const summaries = new Map<string, LeadLostReasonSummary & { sortOrder: number }>();

  for (const storedValue of storedValues) {
    const resolved = resolveLeadLostReasonForReporting(storedValue, reasons);
    const reason = resolved ?? {
      key: "unspecified",
      label: "Unspecified",
      sortOrder: MAX_SORT_ORDER + 1,
      isLegacy: true,
    };
    const current = summaries.get(reason.key);
    summaries.set(reason.key, {
      key: reason.key,
      label: reason.label,
      count: (current?.count ?? 0) + 1,
      isLegacy: reason.isLegacy,
      sortOrder: reason.sortOrder,
    });
  }

  return [...summaries.values()]
    .sort((left, right) =>
      left.sortOrder - right.sortOrder ||
      left.label.localeCompare(right.label) ||
      left.key.localeCompare(right.key)
    )
    .map(({ sortOrder: _sortOrder, ...summary }) => summary);
}

function normalizeLabel(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const label = value.trim().replace(/\s+/g, " ").slice(0, MAX_LABEL_LENGTH).trim();
  return label.length > 0 ? label : null;
}

function normalizeSortOrder(value: number | null | undefined, fallback: number): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_SORT_ORDER, Math.max(0, Math.trunc(value)));
}

function humanizeKey(key: string): string {
  const words = key.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function compareReasons(left: LeadLostReason, right: LeadLostReason): number {
  return (
    left.sortOrder - right.sortOrder ||
    left.label.localeCompare(right.label) ||
    left.key.localeCompare(right.key)
  );
}
