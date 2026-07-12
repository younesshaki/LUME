import type { TenantDomain } from "@lume/types";

export type TenantDomainRow = {
  id: string;
  tenant_id: string;
  domain: string;
  verified: boolean;
  verification_token: string;
  verification_status: "pending" | "verified" | "failed" | null;
  verification_checked_at: string | null;
  verification_failed_at: string | null;
  vercel_config: Record<string, unknown>;
  created_at: string;
};

export function rowToTenantDomain(row: TenantDomainRow): TenantDomain {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    domain: row.domain,
    verified: row.verified,
    verificationToken: row.verification_token,
    verificationStatus: row.verified ? "verified" : row.verification_status ?? "pending",
    verificationCheckedAt: row.verification_checked_at,
    verificationFailedAt: row.verification_failed_at,
    vercelConfig: row.vercel_config,
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

export type DomainDnsInstruction = { type: string; host: string; value: string };

export function domainDnsInstructions(domain: TenantDomain): DomainDnsInstruction[] {
  const verification = domain.vercelConfig.verification;
  if (Array.isArray(verification)) {
    const instructions = verification.slice(0, 10).flatMap((entry): DomainDnsInstruction[] => {
      if (!isRecord(entry) || typeof entry.type !== "string" ||
        typeof entry.domain !== "string" || typeof entry.value !== "string") return [];
      return [{ type: entry.type, host: entry.domain, value: entry.value }];
    });
    if (instructions.length > 0) return instructions;
  }
  return [{ type: "TXT", host: verificationHost(domain.domain), value: domain.verificationToken }];
}

export function domainDnsRecommendations(domain: TenantDomain): string[] {
  const cname = domain.vercelConfig.recommendedCname;
  const ipv4 = domain.vercelConfig.recommendedIpv4;
  return [...new Set([
    ...(Array.isArray(cname) ? cname.filter((value): value is string => typeof value === "string") : []),
    ...(Array.isArray(ipv4) ? ipv4.filter((value): value is string => typeof value === "string") : []),
  ])].slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
