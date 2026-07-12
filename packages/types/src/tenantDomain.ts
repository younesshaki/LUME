import type { TenantId } from "./tenant";

export type TenantDomainId = string;

export type TenantDomain = {
  id: TenantDomainId;
  tenantId: TenantId;
  domain: string;
  verified: boolean;
  verificationToken: string;
  verificationStatus: "pending" | "verified" | "failed";
  verificationCheckedAt: string | null;
  verificationFailedAt: string | null;
  vercelConfig: Record<string, unknown>;
  createdAt: string;
};
