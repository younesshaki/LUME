import type { TenantId, TenantRole } from "./tenant";

export type TenantInviteId = string;
export type TenantInviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type TenantInvite = {
  id: TenantInviteId;
  tenantId: TenantId;
  email: string;
  role: TenantRole;
  token: string;
  status: TenantInviteStatus;
  expiresAt: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};
