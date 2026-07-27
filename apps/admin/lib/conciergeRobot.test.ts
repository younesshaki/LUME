import { describe, expect, it } from "vitest";

import { isCompanionRoute, isTenantOverviewRoute } from "./conciergeRobot";

describe("isTenantOverviewRoute", () => {
  it("matches a tenant overview, with or without a trailing slash", () => {
    expect(isTenantOverviewRoute("/admin/demo")).toBe(true);
    expect(isTenantOverviewRoute("/admin/demo/")).toBe(true);
  });

  it("does not match pages inside a tenant", () => {
    expect(isTenantOverviewRoute("/admin/demo/vehicles")).toBe(false);
    expect(isTenantOverviewRoute("/admin/demo/vehicles/import")).toBe(false);
  });

  it("does not match the tenant picker", () => {
    expect(isTenantOverviewRoute("/admin")).toBe(false);
  });
});

describe("isCompanionRoute", () => {
  it("shows the companion on pages inside a tenant", () => {
    expect(isCompanionRoute("/admin/demo/vehicles")).toBe(true);
    expect(isCompanionRoute("/admin/demo/settings/billing")).toBe(true);
  });

  it("stays off the overview, where the hero already shows the head", () => {
    expect(isCompanionRoute("/admin/demo")).toBe(false);
    expect(isCompanionRoute("/admin/demo/")).toBe(false);
  });

  it("stays off the tenant picker and non-admin routes", () => {
    expect(isCompanionRoute("/admin")).toBe(false);
    expect(isCompanionRoute("/login")).toBe(false);
    expect(isCompanionRoute("/")).toBe(false);
  });
});
