import { describe, expect, it } from "vitest";
import { extractVehicleFilters } from "@lume/rag";
import {
  ADMIN_CAPABILITIES,
  adminIntentMinimumRole,
  adminCapabilityHref,
  capabilityById,
  capabilityFromAdminPath,
  buildAdminConciergeSystemPrompt,
  compileDeterministicAdminIntent,
  findNavigationCapability,
  hasAdminCapabilityRole,
  parseAdminConciergeModelPlan,
  parseAdminConciergeRequest,
} from "./adminConcierge";

describe("admin concierge control plane", () => {
  it("keeps the launch registry read-only except for one confirmed lead-status capability", () => {
    expect(ADMIN_CAPABILITIES.every((capability) =>
      capability.effect === "read" || capability.effect === "navigate" || capability.id === "lead.status.update",
    )).toBe(true);
    expect(capabilityById("lead.status.update")?.confirmation).toBe("standard");
  });

  it("covers every tenant-facing sidebar surface with an explicit capability", () => {
    const routes = new Set(ADMIN_CAPABILITIES.map((capability) => capability.route));
    expect([
      "/", "/vehicles", "/leads", "/customers", "/loyalty",
      "/website", "/pages", "/templates", "/design", "/navigation", "/branding", "/assets",
      "/persona", "/concierge-targets", "/knowledge", "/analytics", "/team", "/domains",
      "/settings/billing", "/settings/api-keys", "/settings/integrations", "/settings/inventory-feeds", "/settings/system-preferences",
    ].every((route) => routes.has(route))).toBe(true);
  });

  it("enforces the registry's declared role boundary independently of UI access", () => {
    expect(hasAdminCapabilityRole("viewer", "viewer")).toBe(true);
    expect(hasAdminCapabilityRole("viewer", "editor")).toBe(false);
    expect(hasAdminCapabilityRole("admin", "editor")).toBe(true);
    expect(adminIntentMinimumRole({ kind: "describe_current_page" })).toBe("viewer");
    expect(adminIntentMinimumRole({ kind: "update_lead_status", leadQuery: "jane@example.com", status: "qualified" })).toBe("editor");
    expect(adminIntentMinimumRole({ kind: "navigate", capabilityId: "analytics.view" })).toBe("viewer");
    expect(adminIntentMinimumRole({ kind: "navigate", capabilityId: "unknown" })).toBeNull();
  });

  it("parses bounded, client-safe requests and drops untrusted path values", () => {
    expect(parseAdminConciergeRequest({ tenantSlug: " demo ", message: "show vehicles", currentPath: "/admin/demo/vehicles", sessionId: "11111111-1111-4111-8111-111111111111" })).toEqual({
      ok: true,
      request: { tenantSlug: "demo", message: "show vehicles", currentPath: "/admin/demo/vehicles", sessionId: "11111111-1111-4111-8111-111111111111" },
    });
    expect(parseAdminConciergeRequest({ tenantSlug: "demo", message: "hello", currentPath: "https://attacker.test" })).toEqual({
      ok: true,
      request: { tenantSlug: "demo", message: "hello" },
    });
    expect(parseAdminConciergeRequest({ tenantSlug: "", message: "hello" }).ok).toBe(false);
    expect(parseAdminConciergeRequest({ tenantSlug: "demo", message: "hello", sessionId: "not-a-session" })).toEqual({
      ok: true,
      request: { tenantSlug: "demo", message: "hello" },
    });
  });

  it("grounds vehicle and lead searches to closed intent shapes", () => {
    expect(compileDeterministicAdminIntent("where am I?")).toEqual({ kind: "describe_current_page" });
    expect(compileDeterministicAdminIntent("give me a dashboard summary")).toEqual({ kind: "summarize_overview" });
    expect(compileDeterministicAdminIntent("show me BMW vehicles")).toEqual({ kind: "search_vehicles", query: "BMW" });
    expect(compileDeterministicAdminIntent("list new leads")).toEqual({ kind: "search_leads", status: "new" });
    expect(compileDeterministicAdminIntent("find customer jane@example.com")).toEqual({ kind: "search_customers", query: "jane@example.com" });
    expect(compileDeterministicAdminIntent("show pages")).toEqual({ kind: "search_pages", query: null });
    expect(compileDeterministicAdminIntent("what is the latest failed inventory feed?")).toEqual({
      kind: "inspect_feed_runs",
      status: "failed",
    });
  });

  it("reflects only known paths belonging to the active tenant", () => {
    expect(capabilityFromAdminPath("/admin/demo/vehicles/11111111-1111-4111-8111-111111111111", "demo")?.id).toBe("vehicles.search");
    expect(capabilityFromAdminPath("/admin/demo/settings/inventory-feeds", "demo")?.id).toBe("feeds.view");
    expect(capabilityFromAdminPath("/admin/other/vehicles", "demo")).toBeNull();
    expect(capabilityFromAdminPath("https://attacker.test/admin/demo/vehicles", "demo")).toBeNull();
  });

  it("uses the shared trusted filter extractor for natural budget phrasing", () => {
    expect(extractVehicleFilters("show BMWs under 70k")).toMatchObject({ make: "BMW", priceMax: 70_000 });
    expect(extractVehicleFilters("only show me BMWs between 40k and 55k")).toMatchObject({
      make: "BMW",
      priceMin: 40_000,
      priceMax: 55_000,
    });
    expect(extractVehicleFilters("show all inventory under 10k")).toMatchObject({ priceMax: 10_000 });
  });

  it("prepares a bounded lead-status change but never treats lost as a zero-context update", () => {
    expect(compileDeterministicAdminIntent("mark lead Jane Doe as qualified")).toEqual({
      kind: "update_lead_status",
      leadQuery: "Jane Doe",
      status: "qualified",
    });
    expect(compileDeterministicAdminIntent("mark lead Jane Doe as lost")).toEqual({ kind: "unsupported" });
  });

  it("navigates only when one registry capability matches", () => {
    expect(compileDeterministicAdminIntent("take me to analytics")).toEqual({ kind: "navigate", capabilityId: "analytics.view" });
    expect(compileDeterministicAdminIntent("open the site pages")).toEqual({ kind: "search_pages", query: null });
    const feeds = capabilityById("feeds.view");
    expect(feeds && adminCapabilityHref("demo", feeds)).toBe("/admin/demo/settings/inventory-feeds");
  });

  it("prefers a specific route phrase over overlapping generic aliases", () => {
    expect(findNavigationCapability("open inventory feeds")?.id).toBe("feeds.view");
    expect(compileDeterministicAdminIntent("open inventory feeds")).toEqual({ kind: "navigate", capabilityId: "feeds.view" });
    expect(compileDeterministicAdminIntent("take me to concierge targets")).toEqual({ kind: "navigate", capabilityId: "concierge.targets.view" });
    // "open settings" names no specific settings surface, so it must not guess.
    expect(findNavigationCapability("open settings")).toBeNull();
  });

  it("does not invent a capability for unsupported operation requests", () => {
    expect(compileDeterministicAdminIntent("delete every sold vehicle")).toEqual({ kind: "unsupported" });
    expect(compileDeterministicAdminIntent("change our billing plan")).toEqual({ kind: "unsupported" });
  });

  it("accepts only safe, closed model plans and ignores model prose", () => {
    expect(parseAdminConciergeModelPlan('{"intent":{"kind":"navigate","capabilityId":"analytics.view"},"reply":"invented metric"}')).toEqual({
      kind: "navigate",
      capabilityId: "analytics.view",
    });
    expect(parseAdminConciergeModelPlan('{"intent":{"kind":"navigate","capabilityId":"billing.change"}}')).toBeNull();
    expect(parseAdminConciergeModelPlan('{"intent":{"kind":"search_vehicles","query":"BMW; DROP TABLE vehicles"}}')).toEqual({
      kind: "search_vehicles",
      query: "BMW DROP TABLE vehicles",
    });
    expect(parseAdminConciergeModelPlan('{"intent":{"kind":"update_lead_status","leadQuery":"Jane Doe","status":"qualified"}}')).toEqual({
      kind: "update_lead_status",
      leadQuery: "Jane Doe",
      status: "qualified",
    });
    expect(parseAdminConciergeModelPlan('{"intent":{"kind":"inspect_feed_runs","status":"dead_letter"}}')).toEqual({
      kind: "inspect_feed_runs",
      status: "dead_letter",
    });
    expect(parseAdminConciergeModelPlan('{"intent":{"kind":"search_customers","query":"Jane Doe"}}')).toEqual({
      kind: "search_customers",
      query: "Jane Doe",
    });
    expect(parseAdminConciergeModelPlan('{"intent":{"kind":"search_pages","query":"inventory"}}')).toEqual({
      kind: "search_pages",
      query: "inventory",
    });
    expect(parseAdminConciergeModelPlan('{"intent":{"kind":"summarize_overview"}}')).toEqual({ kind: "summarize_overview" });
    expect(parseAdminConciergeModelPlan('{"intent":{"kind":"describe_current_page"}}')).toEqual({ kind: "describe_current_page" });
    expect(parseAdminConciergeModelPlan("not json")).toBeNull();
    expect(buildAdminConciergeSystemPrompt()).toContain("clarify");
  });
});
