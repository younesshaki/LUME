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
  extractLeadAssignment,
  extractVehiclePriceUpdate,
  extractVehicleStatusUpdate,
  conversionWindowFromMessage,
  findNavigationCapability,
  hasAdminCapabilityRole,
  parseAdminConciergeModelPlan,
  parseAdminConciergeRequest,
} from "./adminConcierge";

describe("admin concierge control plane", () => {
  // The registry stays read-only apart from an explicit, enumerated set of
  // bounded write capabilities. Adding a write must be a deliberate edit here,
  // not something that slips in with a feature.
  const CONFIRMED_WRITES = ["lead.status.update", "feed.run.enqueue", "lead.assign", "vehicle.price.update", "vehicle.status.update"];

  it("keeps the launch registry read-only except for confirmed bounded capabilities", () => {
    expect(ADMIN_CAPABILITIES.every((capability) =>
      capability.effect === "read" || capability.effect === "navigate" ||
      CONFIRMED_WRITES.includes(capability.id),
    )).toBe(true);
  });

  it("requires explicit confirmation on every write", () => {
    for (const id of CONFIRMED_WRITES) {
      expect(capabilityById(id)?.confirmation).toBe("standard");
      expect(capabilityById(id)?.effect).toBe("write");
    }
  });

  it("has no write capability outside the enumerated set", () => {
    const writes = ADMIN_CAPABILITIES.filter((c) => c.effect === "write").map((c) => c.id).sort();
    expect(writes).toEqual([...CONFIRMED_WRITES].sort());
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
    expect(compileDeterministicAdminIntent("what model is the concierge using?")).toEqual({ kind: "summarize_concierge_config" });
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

  it("prepares only a named managed-feed run for review", () => {
    expect(compileDeterministicAdminIntent("run inventory feed Nightly Homenet now")).toEqual({
      kind: "enqueue_feed_run",
      feedQuery: "Nightly Homenet",
    });
    expect(compileDeterministicAdminIntent("run every feed and retry all failures")).toEqual({ kind: "unsupported" });
  });

  it("navigates only when one registry capability matches", () => {
    expect(compileDeterministicAdminIntent("take me to analytics")).toEqual({ kind: "navigate", capabilityId: "analytics.view" });
    expect(compileDeterministicAdminIntent("open the site pages")).toEqual({ kind: "search_pages", query: null });
    const feeds = capabilityById("feeds.view");
    expect(feeds && adminCapabilityHref("demo", feeds)).toBe("/admin/demo/settings/inventory-feeds");
  });

  it("asks a targeted question rather than guessing an ambiguous settings destination", () => {
    expect(compileDeterministicAdminIntent("open settings")).toEqual({
      kind: "clarify",
      question: "Which settings area should I open: team, domains, billing, API keys, integrations, inventory feeds, or system preferences?",
    });
    expect(compileDeterministicAdminIntent("take me to CRM")).toEqual({
      kind: "clarify",
      question: "Which CRM area should I open: leads, customers, or loyalty?",
    });
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
    expect(parseAdminConciergeModelPlan('{"intent":{"kind":"enqueue_feed_run","feedQuery":"Nightly Homenet"}}')).toEqual({
      kind: "enqueue_feed_run",
      feedQuery: "Nightly Homenet",
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
    expect(parseAdminConciergeModelPlan('{"intent":{"kind":"summarize_concierge_config"}}')).toEqual({ kind: "summarize_concierge_config" });
    expect(parseAdminConciergeModelPlan("not json")).toBeNull();
    expect(buildAdminConciergeSystemPrompt()).toContain("clarify");
  });
});

describe("creation intents", () => {
  const intent = (message: string) => compileDeterministicAdminIntent(message);

  it("routes 'add a vehicle' to the new-vehicle form", () => {
    expect(intent("add a vehicle")).toEqual({ kind: "navigate", capabilityId: "vehicles.new" });
  });

  it("routes phrasings a dealer actually uses", () => {
    for (const phrase of ["new vehicle", "create vehicle", "add a car"]) {
      expect(intent(phrase)).toEqual({ kind: "navigate", capabilityId: "vehicles.new" });
    }
  });

  it("routes import wording to the importer, not the inventory list", () => {
    for (const phrase of ["import inventory", "import csv", "upload vehicles"]) {
      expect(intent(phrase)).toEqual({ kind: "navigate", capabilityId: "vehicles.import" });
    }
  });

  it("routes 'new page' to the page builder", () => {
    expect(intent("new page")).toEqual({ kind: "navigate", capabilityId: "pages.new" });
  });

  it("keeps creation capabilities behind editor", () => {
    for (const id of ["vehicles.new", "vehicles.import", "pages.new"]) {
      expect(capabilityById(id)?.minRole).toBe("editor");
    }
  });

  // The verb gate now includes "new"/"add"; searches must still win, or
  // "show me new leads" would open a form instead of listing leads.
  it("does not let creation verbs hijack a search", () => {
    expect(intent("show me new leads").kind).toBe("search_leads");
    expect(intent("show me new vehicles").kind).toBe("search_vehicles");
  });

  // "open inventory" is claimed by the vehicle search branch, which runs
  // first and lands on the same page with a verified result set. Asserted so
  // the precedence is deliberate rather than accidental.
  it("lets vehicle search claim plain inventory wording", () => {
    expect(intent("open inventory").kind).toBe("search_vehicles");
  });
});

describe("photo coverage intent", () => {
  const intent = (message: string) => compileDeterministicAdminIntent(message);

  it("recognises the ways a dealer asks about photo gaps", () => {
    for (const phrase of [
      "how many vehicles are missing photos",
      "which cars have no photos",
      "show me vehicles without images",
      "what is my photo coverage",
    ]) {
      expect(intent(phrase).kind).toBe("inspect_photo_gap");
    }
  });

  // Must beat search_vehicles: the phrase contains "vehicles", and the
  // inventory search branch runs first.
  it("is not swallowed by the inventory search branch", () => {
    expect(intent("vehicles without photos").kind).toBe("inspect_photo_gap");
  });

  it("leaves ordinary inventory searches alone", () => {
    expect(intent("show me BMW vehicles").kind).toBe("search_vehicles");
  });

  it("is readable by any member", () => {
    expect(capabilityById("inventory.photo_gap")?.minRole).toBe("viewer");
    expect(capabilityById("inventory.photo_gap")?.effect).toBe("read");
  });
});

describe("aging inventory intent", () => {
  const intent = (message: string) => compileDeterministicAdminIntent(message);

  it("recognises how dealers phrase it", () => {
    for (const phrase of ["show me aging inventory", "what has been sitting too long", "stale inventory"]) {
      expect(intent(phrase).kind).toBe("inspect_aging_inventory");
    }
  });

  it("defaults to 60 days, the usual floor-plan pain point", () => {
    const parsed = intent("aging inventory");
    expect(parsed.kind === "inspect_aging_inventory" && parsed.days).toBe(60);
  });

  it("honours an explicit threshold", () => {
    const parsed = intent("what has been sitting for 90 days");
    expect(parsed.kind === "inspect_aging_inventory" && parsed.days).toBe(90);
  });

  it("ignores an implausible threshold rather than trusting it", () => {
    const parsed = intent("aging inventory over 999 days");
    expect(parsed.kind === "inspect_aging_inventory" && parsed.days).toBe(60);
  });

  it("does not hijack an ordinary inventory search", () => {
    expect(intent("show me BMW vehicles").kind).toBe("search_vehicles");
  });
});

describe("launch readiness intent", () => {
  const intent = (message: string) => compileDeterministicAdminIntent(message);

  it("recognises the ways an owner asks if they can go live", () => {
    for (const phrase of [
      "am i ready to launch",
      "launch readiness",
      "what is left to set up",
      "what's blocking",
      "can i go live",
    ]) {
      expect(intent(phrase).kind).toBe("inspect_launch_readiness");
    }
  });

  it("is readable by any member", () => {
    expect(capabilityById("setup.readiness")?.minRole).toBe("viewer");
    expect(capabilityById("setup.readiness")?.effect).toBe("read");
  });

  it("does not swallow unrelated requests", () => {
    expect(intent("show me BMW vehicles").kind).toBe("search_vehicles");
    expect(intent("add a vehicle").kind).toBe("navigate");
  });
});

describe("lead assignment intent", () => {
  const intent = (message: string) => compileDeterministicAdminIntent(message);

  it("parses both halves of an assignment", () => {
    expect(extractLeadAssignment("assign Jane Doe to marcus")).toEqual({
      leadQuery: "Jane Doe",
      assigneeQuery: "marcus",
    });
  });

  it("accepts the natural phrasings", () => {
    for (const phrase of [
      "reassign the lead Jane Doe to marcus",
      "hand off Jane Doe to marcus",
      "give the lead Jane Doe to marcus",
    ]) {
      expect(intent(phrase).kind).toBe("assign_lead");
    }
  });

  // Guessing here reassigns someone's commission, so a half-formed
  // instruction must fall through rather than be completed.
  it("refuses a half-formed instruction", () => {
    expect(extractLeadAssignment("assign Jane Doe")).toBeNull();
    expect(extractLeadAssignment("assign to marcus")).toBeNull();
    expect(extractLeadAssignment("assign J to m")).toBeNull();
  });

  it("requires editor to even prepare one", () => {
    expect(adminIntentMinimumRole({ kind: "assign_lead", leadQuery: "a", assigneeQuery: "b" })).toBe("editor");
    expect(capabilityById("lead.assign")?.effect).toBe("write");
    expect(capabilityById("lead.assign")?.confirmation).toBe("standard");
  });

  it("does not hijack unrelated requests", () => {
    expect(intent("show me new leads").kind).toBe("search_leads");
    expect(intent("mark Jane Doe as contacted").kind).toBe("update_lead_status");
  });
});

describe("vehicle reprice intent", () => {
  const intent = (message: string) => compileDeterministicAdminIntent(message);

  it("parses the phrasings a dealer uses", () => {
    expect(extractVehiclePriceUpdate("reprice the CX-90 to 52000")).toEqual({ vehicleQuery: "CX-90", price: 52000 });
    expect(extractVehiclePriceUpdate("set the price of the Gladiator to $44,500")).toEqual({ vehicleQuery: "Gladiator", price: 44500 });
    expect(extractVehiclePriceUpdate("reprice the Durango at 39k")).toEqual({ vehicleQuery: "Durango", price: 39000 });
    expect(intent("reprice the CX-90 to 52000").kind).toBe("update_vehicle_price");
  });

  // A missing or implausible amount must never be invented or clamped —
  // mis-parsing would publish a real car at a wrong asking price.
  it("refuses an instruction with no usable price", () => {
    expect(extractVehiclePriceUpdate("reprice the Camry")).toBeNull();
    expect(extractVehiclePriceUpdate("reprice the Camry to 12")).toBeNull();
    expect(extractVehiclePriceUpdate("reprice the Camry to 900000000")).toBeNull();
  });

  it("requires editor and explicit confirmation", () => {
    expect(adminIntentMinimumRole({ kind: "update_vehicle_price", vehicleQuery: "CX-90", price: 52000 })).toBe("editor");
    expect(capabilityById("vehicle.price.update")?.confirmation).toBe("standard");
  });

  it("leaves ordinary inventory questions alone", () => {
    expect(intent("show me BMW vehicles").kind).toBe("search_vehicles");
    expect(intent("show me aging inventory").kind).toBe("inspect_aging_inventory");
  });
});

describe("extractVehicleStatusUpdate", () => {
  it("maps archive verbs to the archived status", () => {
    expect(extractVehicleStatusUpdate("archive the 2019 Civic")).toEqual({
      vehicleQuery: "2019 Civic",
      status: "archived",
    });
    expect(extractVehicleStatusUpdate("delist the Tacoma")?.status).toBe("archived");
    expect(extractVehicleStatusUpdate("take down the Model 3")?.status).toBe("archived");
  });

  it("maps publish verbs to live and unpublish to draft", () => {
    expect(extractVehicleStatusUpdate("publish the Model 3")?.status).toBe("live");
    expect(extractVehicleStatusUpdate("unarchive the F-150")?.status).toBe("live");
    expect(extractVehicleStatusUpdate("unpublish the Civic")?.status).toBe("draft");
  });

  it("strips filler nouns and trailing punctuation from the query", () => {
    expect(extractVehicleStatusUpdate("archive that Civic listing.")).toEqual({
      vehicleQuery: "Civic",
      status: "archived",
    });
  });

  // "list" is a read verb elsewhere in the compiler. Matching it here would
  // silently turn a read into a staged write, which is the worst possible
  // failure for this capability.
  it("never treats read verbs as a status change", () => {
    expect(extractVehicleStatusUpdate("list my leads")).toBeNull();
    expect(extractVehicleStatusUpdate("list all vehicles without photos")).toBeNull();
    expect(extractVehicleStatusUpdate("show me aging inventory")).toBeNull();
    expect(extractVehicleStatusUpdate("find the 2019 Civic")).toBeNull();
  });

  it("refuses a query too short to resolve one vehicle", () => {
    expect(extractVehicleStatusUpdate("archive it")).not.toBeNull();
    expect(extractVehicleStatusUpdate("archive a")).toBeNull();
  });

  // 'sold' carries revenue meaning and needs sold_at + sold_price, so it must
  // never be reachable from one sentence.
  it("cannot produce the sold status", () => {
    for (const message of [
      "mark the Civic as sold",
      "sold the Model 3",
      "set the Tacoma to sold",
    ]) {
      expect(extractVehicleStatusUpdate(message)?.status).not.toBe("sold");
    }
  });
});

describe("conversionWindowFromMessage", () => {
  it("defaults to 30 days", () => {
    expect(conversionWindowFromMessage("how are we doing")).toBe(30);
  });

  it("reads explicit windows and normalizes units to days", () => {
    expect(conversionWindowFromMessage("last 7 days")).toBe(7);
    expect(conversionWindowFromMessage("past 2 weeks")).toBe(14);
    expect(conversionWindowFromMessage("last 3 months")).toBe(90);
    expect(conversionWindowFromMessage("last week")).toBe(7);
    expect(conversionWindowFromMessage("last quarter")).toBe(90);
  });

  it("clamps absurd windows instead of trusting the number", () => {
    expect(conversionWindowFromMessage("last 9999 days")).toBe(365);
    expect(conversionWindowFromMessage("last 0 days")).toBe(30);
  });
});

describe("conversion summary intent", () => {
  it("compiles conversion questions to the summary intent", () => {
    for (const message of [
      "how are we doing",
      "what is our conversion rate",
      "show me the funnel",
      "how many views did we get last week",
    ]) {
      expect(compileDeterministicAdminIntent(message).kind).toBe("summarize_conversion");
    }
  });

  // The parser sits ahead of the generic find-fallbacks, so it must not
  // swallow ordinary inventory or lead searches.
  it("does not swallow unrelated searches", () => {
    expect(compileDeterministicAdminIntent("find me a car").kind).toBe("search_vehicles");
    expect(compileDeterministicAdminIntent("show me my new leads").kind).toBe("search_leads");
  });

  it("is a read, so it needs only viewer access", () => {
    expect(adminIntentMinimumRole({ kind: "summarize_conversion", days: 30 })).toBe("viewer");
  });
});
