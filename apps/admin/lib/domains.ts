import type { TenantDomain } from "@lume/types";

export type TenantDomainRow = {
  id: string;
  tenant_id: string;
  domain: string;
  verified: boolean;
  verification_token: string;
  created_at: string;
};

export function rowToTenantDomain(row: TenantDomainRow): TenantDomain {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    domain: row.domain,
    verified: row.verified,
    verificationToken: row.verification_token,
    createdAt: row.created_at,
  };
}

export function normalizeDomainInput(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

export function validateDomainInput(value: string): string | null {
  const domain = normalizeDomainInput(value);
  if (!domain) return "Domain is required.";
  if (domain.length > 253) return "Domain is too long.";
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return "Enter a valid domain such as example.com.";
  }
  if (domain.includes("..") || domain.startsWith(".") || domain.endsWith(".")) {
    return "Domain format is invalid.";
  }
  return null;
}

export function verificationHost(domain: string): string {
  return `_lume-verify.${domain}`;
}
