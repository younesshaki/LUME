// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  canManageTeam,
  normalizeInviteEmail,
  rowToTeamMember,
  rowToTenantInvite,
  validateInviteEmail,
} from "./team";

describe("team helpers", () => {
  it("allows only owner and admin roles to manage team settings", () => {
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageTeam("admin")).toBe(true);
    expect(canManageTeam("editor")).toBe(false);
    expect(canManageTeam("viewer")).toBe(false);
    expect(canManageTeam(null)).toBe(false);
  });

  it("normalizes and validates invite emails", () => {
    expect(normalizeInviteEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(validateInviteEmail("  Ada@Example.COM ")).toBeNull();
    expect(validateInviteEmail("")).toBe("Email is required.");
    expect(validateInviteEmail("not-an-email")).toBe("Enter a valid email address.");
  });

  it("maps team member rows to app models", () => {
    expect(
      rowToTeamMember({
        tenant_id: "tenant-1",
        user_id: "user-1",
        role: "editor",
        created_at: "2026-07-03T10:00:00.000Z",
      })
    ).toEqual({
      tenantId: "tenant-1",
      userId: "user-1",
      role: "editor",
      createdAt: "2026-07-03T10:00:00.000Z",
    });
  });

  it("maps tenant invite rows to app models", () => {
    expect(
      rowToTenantInvite({
        id: "invite-1",
        tenant_id: "tenant-1",
        email: "ada@example.com",
        role: "viewer",
        token: "token-1",
        status: "pending",
        expires_at: "2026-07-10T10:00:00.000Z",
        created_by: null,
        created_at: "2026-07-03T10:00:00.000Z",
        updated_at: "2026-07-03T10:00:00.000Z",
      })
    ).toEqual({
      id: "invite-1",
      tenantId: "tenant-1",
      email: "ada@example.com",
      role: "viewer",
      token: "token-1",
      status: "pending",
      expiresAt: "2026-07-10T10:00:00.000Z",
      createdBy: null,
      createdAt: "2026-07-03T10:00:00.000Z",
      updatedAt: "2026-07-03T10:00:00.000Z",
    });
  });
});
