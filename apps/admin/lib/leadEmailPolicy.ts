import type { TenantRole } from "@lume/types";

export type LeadEmailMode = "instant" | "hourly";

export type LeadEmailSettings = {
  enabled: boolean;
  roles: TenantRole[];
  mode: LeadEmailMode;
  unassignedAddress: string | null;
  fromAddress: string | null;
};

export type LeadNotificationMember = {
  userId: string;
  role: TenantRole;
};

const ALLOWED_ROLES = new Set<TenantRole>(["owner", "admin", "editor", "viewer"]);

export function normalizeLeadEmailSettings(value: {
  enabled: unknown;
  roles: unknown;
  mode: unknown;
  unassignedAddress: unknown;
  fromAddress?: unknown;
}): LeadEmailSettings | null {
  if (typeof value.enabled !== "boolean") return null;
  const roles = normalizeRoles(value.roles);
  const mode = value.mode === "instant" || value.mode === "hourly" ? value.mode : null;
  const unassignedAddress = normalizeOptionalEmail(value.unassignedAddress);
  const fromAddress = normalizeOptionalEmail(value.fromAddress ?? null);
  if (!roles || !mode || unassignedAddress === undefined || fromAddress === undefined) return null;
  return { enabled: value.enabled, roles, mode, unassignedAddress, fromAddress };
}

/** Owners are always notified; configured roles and the assignee are additive. */
export function leadNotificationUserIds(
  members: readonly LeadNotificationMember[],
  configuredRoles: readonly TenantRole[],
  assignedTo: string | null,
): string[] {
  const roles = new Set<TenantRole>(["owner", ...configuredRoles]);
  const ids = new Set<string>();
  for (const member of members) {
    if (roles.has(member.role) || member.userId === assignedTo) ids.add(member.userId);
  }
  return [...ids].sort();
}

export function leadNotificationAddresses(
  memberEmails: readonly (string | null)[],
  unassignedAddress: string | null,
  hasUnassignedLead: boolean,
): string[] {
  const addresses = new Set<string>();
  for (const value of memberEmails) {
    const email = normalizeOptionalEmail(value);
    if (email) addresses.add(email);
  }
  if (hasUnassignedLead && unassignedAddress) addresses.add(unassignedAddress);
  return [...addresses].sort();
}

export function normalizeOptionalEmail(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized.length <= 320 && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(normalized)
    ? normalized
    : undefined;
}

export function leadMessagePreview(value: string | null, maxLength = 400): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  if (!normalized) return null;
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function normalizeRoles(value: unknown): TenantRole[] | null {
  if (!Array.isArray(value) || value.length > 4) return null;
  const roles = new Set<TenantRole>();
  for (const role of value) {
    if (typeof role !== "string" || !ALLOWED_ROLES.has(role as TenantRole)) return null;
    roles.add(role as TenantRole);
  }
  return [...roles];
}
