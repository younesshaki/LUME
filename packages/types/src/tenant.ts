export type TenantId = string;

export type TenantStatus = "active" | "suspended" | "trial";

export type Tenant = {
  id: TenantId;
  slug: string;
  name: string;
  status: TenantStatus;
  createdAt: string;
};

export type TenantRole = "owner" | "admin" | "editor" | "viewer";

export type TenantMember = {
  tenantId: TenantId;
  userId: string;
  role: TenantRole;
  createdAt: string;
};

export type TenantContext = {
  tenantId: TenantId;
  slug: string;
  /** Tenant display name, when the resolution path provides it. */
  name?: string;
};
