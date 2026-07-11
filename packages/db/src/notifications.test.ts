import { describe, expect, it, vi } from "vitest";
import {
  buildAdminNotificationInsert,
  createAdminNotification,
  isSafeAdminNotificationLink,
  isSafeNotificationDedupeKey,
} from "./notifications";

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
      dedupe_key: null,
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
    expect(isSafeNotificationDedupeKey("storage:80:plan-1:100")).toBe(true);
    expect(isSafeNotificationDedupeKey("storage warning")).toBe(false);
  });

  it("treats a duplicate dedupe key as an already-delivered success", async () => {
    const insert = vi.fn(async () => ({ error: { code: "23505" } }));
    const from = vi.fn(() => ({ insert }));
    await expect(createAdminNotification({ from } as never, {
      tenantId: "tenant-1",
      type: "storage.quota_warning",
      body: "Storage is at 80%.",
      link: "/admin/acme/settings/billing",
      dedupeKey: "storage:80:plan-1:100",
    })).resolves.toBe(true);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      dedupe_key: "storage:80:plan-1:100",
    }));
  });
});
