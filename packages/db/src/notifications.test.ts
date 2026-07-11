import { describe, expect, it } from "vitest";
import { buildAdminNotificationInsert, isSafeAdminNotificationLink } from "./notifications";

describe("admin notification payloads", () => {
  it("normalizes bounded tenant notification rows", () => {
    expect(buildAdminNotificationInsert({
      tenantId: " tenant-1 ",
      type: "domain.verified",
      body: "  Domain   example.com verified.  ",
      link: "/admin/acme/domains",
    })).toEqual({
      tenant_id: "tenant-1",
      user_id: null,
      type: "domain.verified",
      body: "Domain example.com verified.",
      link: "/admin/acme/domains",
    });
  });

  it("rejects empty bodies and external or protocol-relative links", () => {
    expect(buildAdminNotificationInsert({
      tenantId: "tenant-1",
      type: "storage.quota_warning",
      body: " ",
    })).toBeNull();
    expect(isSafeAdminNotificationLink("https://evil.example/admin/acme")).toBe(false);
    expect(isSafeAdminNotificationLink("//evil.example/admin/acme")).toBe(false);
    expect(isSafeAdminNotificationLink("/admin/acme/assets")).toBe(true);
    expect(isSafeAdminNotificationLink(`/admin/${"x".repeat(2_050)}`)).toBe(false);
  });
});
