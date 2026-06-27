import type { TenantInvite, TenantRole } from "@lume/types";

export type TeamMember = {
  tenantId: string;
  userId: string;
  role: TenantRole;
  createdAt: string;
};

export type TeamMemberRow = {
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  created_at: string;
};

export type TenantInviteRow = {
  id: string;
  tenant_id: string;
  email: string;
  role: TenantRole;
  token: string;
  status: TenantInvite["status"];
  expires_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const TENANT_ROLES: TenantRole[] = ["owner", "admin", "editor", "viewer"];

export function rowToTeamMember(row: TeamMemberRow): TeamMember {
  return {
    tenantId: row.tenant_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function rowToTenantInvite(row: TenantInviteRow): TenantInvite {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    role: row.role,
    token: row.token,
    status: row.status,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function canManageTeam(role: TenantRole | null): boolean {
  return role === "owner" || role === "admin";
}

export function normalizeInviteEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateInviteEmail(value: string): string | null {
  const email = normalizeInviteEmail(value);
  if (!email) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  return null;
}
