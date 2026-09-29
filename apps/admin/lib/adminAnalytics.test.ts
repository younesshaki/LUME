import { describe, expect, it } from "vitest";
import { adminAnalyticsIdentity, adminSectionFromPath, publishablePostHogToken } from "./adminAnalytics";

const SEAN = "4f1b2c3d-1111-4222-8333-944455556666";

describe("adminAnalyticsIdentity", () => {
  it("tracks a demo dealer under their permanent user id, with a searchable account handle", () => {
    expect(adminAnalyticsIdentity({
      userId: SEAN,
      email: "sean@demo.lume.app",
      isPlatformAdmin: false,
      memberships: [{ slug: "demo-sean", name: "Sean Auto Group", role: "owner" }],
    })).toEqual({
      distinctId: SEAN,
      account: "demo-sean",
      personProperties: {
        lume_account: "demo-sean",
        lume_dealership: "Sean Auto Group",
        lume_role: "owner",
        lume_tenants: ["demo-sean"],
        email: "sean@demo.lume.app",
      },
    });
  });

  it("never tracks LUME platform admins or non-demo workspaces", () => {
    const demo = [{ slug: "demo-max", name: "Max Auto", role: "owner" }];
    expect(adminAnalyticsIdentity({ userId: SEAN, email: null, isPlatformAdmin: true, memberships: demo })).toBeNull();
    expect(adminAnalyticsIdentity({
      userId: SEAN, email: null, isPlatformAdmin: false,
      memberships: [{ slug: "real-dealer", name: "Real Dealer", role: "owner" }],
    })).toBeNull();
  });
});

describe("publishablePostHogToken", () => {
  it("only lets a publishable project token reach the browser", () => {
    expect(publishablePostHogToken(" phc_AbC123 ")).toBe("phc_AbC123");
    expect(publishablePostHogToken("phx_secretPersonalKey")).toBeNull();
    expect(publishablePostHogToken("")).toBeNull();
    expect(publishablePostHogToken(undefined)).toBeNull();
  });
});

describe("adminSectionFromPath", () => {
  it("names dashboard areas and collapses ids so they aggregate", () => {
    expect(adminSectionFromPath("/admin/demo-sean")).toEqual({ tenant: "demo-sean", section: "overview" });
    expect(adminSectionFromPath("/admin/demo-sean/website")).toEqual({ tenant: "demo-sean", section: "website" });
    expect(adminSectionFromPath(`/admin/demo-sean/pages/${SEAN}`)).toEqual({ tenant: "demo-sean", section: "pages/:id" });
    expect(adminSectionFromPath("/admin/platform/tenants")).toEqual({ tenant: null, section: "platform/tenants" });
  });
});
