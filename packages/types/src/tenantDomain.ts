import type { TenantId } from "./tenant";

export type TenantDomainId = string;

export type TenantDomain = {
  id: TenantDomainId;
  tenantId: TenantId;
  domain: string;
  verified: boolean;
  verificationToken: string;
  createdAt: string;
};
