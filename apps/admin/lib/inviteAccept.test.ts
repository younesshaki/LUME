import { describe, expect, it } from "vitest";
import { validateInviteForUser, type RedeemableInvite } from "./inviteAccept";

const base: RedeemableInvite = {
  id: "i1",
  tenant_id: "t1",
  email: "invitee@acme.com",
  role: "editor",
  status: "pending",
  expires_at: "2026-12-31T00:00:00Z",
};
const now = new Date("2026-07-05T00:00:00Z");

describe("validateInviteForUser", () => {
  it("accepts a pending, unexpired invite for the matching email", () => {
    expect(validateInviteForUser(base, "invitee@acme.com", now)).toBeNull();
    expect(validateInviteForUser(base, "  INVITEE@ACME.COM ", now)).toBeNull();
  });

  it("rejects non-pending statuses distinctly", () => {
    expect(
      validateInviteForUser({ ...base, status: "accepted" }, "invitee@acme.com", now)
    ).toContain("already been used");
    expect(
      validateInviteForUser({ ...base, status: "revoked" }, "invitee@acme.com", now)
    ).toContain("no longer valid");
  });

  it("rejects expired invites even when status is still pending", () => {
    expect(
      validateInviteForUser(
        { ...base, expires_at: "2026-07-04T00:00:00Z" },
        "invitee@acme.com",
        now
      )
    ).toContain("expired");
  });

  it("rejects a signed-in user with a different email", () => {
    expect(validateInviteForUser(base, "other@acme.com", now)).toContain(
      "issued to invitee@acme.com"
    );
    expect(validateInviteForUser(base, null, now)).toContain("issued to");
  });
});
