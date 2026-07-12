const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "static",
  "cdn",
]);

const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isSubdomainRoutingEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/**
 * Resolve exactly one tenant label below a configured root domain.
 * Returns null for apex, nested, reserved, malformed, and unrelated hosts.
 */
export function tenantSlugFromHost(host: string, rootDomain: string): string | null {
  const hostname = normalizeHost(host);
  const root = normalizeRootDomain(rootDomain);
  if (!hostname || !root || hostname === root || !hostname.endsWith(`.${root}`)) {
    return null;
  }

  const subdomain = hostname.slice(0, -(root.length + 1));
  if (
    subdomain.includes(".") ||
    RESERVED_SUBDOMAINS.has(subdomain) ||
    !TENANT_SLUG_PATTERN.test(subdomain)
  ) {
    return null;
  }
  return subdomain;
}

/** Preserve the pre-SCRUM-105 permissive host fallback used by public APIs. */
export function legacyTenantSlugFromHost(host: string): string | null {
  const hostname = normalizeHost(host);
  if (!hostname) return null;
  const parts = hostname.split(".");
  if (parts.length < 3) return null;
  const subdomain = parts[0] ?? "";
  if (RESERVED_SUBDOMAINS.has(subdomain) || !TENANT_SLUG_PATTERN.test(subdomain)) {
    return null;
  }
  return subdomain;
}

function normalizeHost(value: string): string | null {
  if (value.includes(",")) return null;
  const withoutPort = value.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  if (!withoutPort || !/^[a-z0-9.-]+$/.test(withoutPort)) return null;
  return withoutPort;
}

function normalizeRootDomain(value: string): string | null {
  const normalized = normalizeHost(value.trim().replace(/^\.+/, ""));
  if (!normalized || !normalized.includes(".")) return null;
  return normalized;
}
