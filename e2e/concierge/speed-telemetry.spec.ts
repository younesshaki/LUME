import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Browser verification of the concierge speed telemetry.
 *
 * The test pre-installs `window.__lumeSpeedProbe`; every speed event the
 * page captures is also appended there (production never defines it). The
 * chat stream and every /api call are stubbed — a catch-all fails the test if
 * any request escapes — so this checks what the PAGE measures, end to end,
 * without a model, Supabase or PostHog.
 */

type ProbeEvent = { name: string; properties: Record<string, unknown> };

const VEHICLE_ID = "2ae764bd-8de1-4866-86d7-e48fa3cb2b93";
let escapedRequests: string[] = [];

function sse(events: unknown[]): string {
  return `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
}

const SERVER_TIMING = {
  type: "timing",
  timing: {
    request_id: "r1",
    route: "deterministic",
    server_total_ms: 41,
    server_state_ms: 30,
    server_first_byte_ms: 38,
    server_done_ms: 41,
  },
};

async function stubBackend(page: Page): Promise<void> {
  await page.route("**/api/**", (route) => {
    escapedRequests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return route.fulfill({ status: 599, contentType: "application/json", body: "{}" });
  });
  await page.route("**/api/visitor/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/vehicles/facets*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ makes: [], models: [], states: [], cities: [] }),
    }),
  );
  await page.route("**/api/vehicles*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ vehicles: [], totalCount: 0, hasMore: false }),
    }),
  );
  await page.route("**/api/vehicles/*", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/vehicles/*/price-signal*", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: false }) }),
  );
  await page.route("**/api/events*", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/consent*", (route) => route.fulfill({ status: 204, body: "" }));
}

async function openChat(page: Page): Promise<void> {
  await page.goto("/home");
  await page.addStyleTag({
    content: `*, *::before, *::after { animation: none !important; transition: none !important; }`,
  });
  const consent = page.getByRole("button", { name: "Accept analytics" });
  if (await consent.isVisible().catch(() => false)) await consent.click();
  const launcher = page.getByRole("button", { name: "Open LUME assistant" });
  await expect(launcher).toBeVisible();
  await launcher.click();
  await expect(page.getByRole("textbox", { name: "Message LUME assistant" })).toBeVisible();
}

async function send(page: Page, text: string): Promise<void> {
  const box = page.getByRole("textbox", { name: "Message LUME assistant" });
  await expect(box).toBeEnabled();
  await box.fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
}

async function probeEvent(page: Page, name: string, predicate = "true"): Promise<ProbeEvent> {
  const handle = await page.waitForFunction(
    ([eventName, filter]) => {
      const probe = (window as unknown as { __lumeSpeedProbe: ProbeEvent[] }).__lumeSpeedProbe;
      const match = probe.find(
        (event) =>
          event.name === eventName &&
          // eslint-disable-next-line no-new-func
          new Function("p", `return ${filter};`)(event.properties),
      );
      return match ?? null;
    },
    [name, predicate] as const,
    { timeout: 15_000 },
  );
  return (await handle.jsonValue()) as ProbeEvent;
}

test.beforeEach(async ({ page }) => {
  escapedRequests = [];
  await page.addInitScript(() => {
    (window as unknown as { __lumeSpeedProbe: unknown[] }).__lumeSpeedProbe = [];
  });
  await stubBackend(page);
});

test.afterEach(() => {
  expect(escapedRequests, "unstubbed /api requests").toEqual([]);
});

test("a turn records every visitor milestone plus the server stages in one event", async ({ page }) => {
  await page.route("**/api/chat", (route: Route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse([
        { type: "meta", sourceCategories: [], sessionId: "s1", requestId: "r1" },
        { type: "action", action: { type: "filter_inventory", make: "Porsche" } },
        { choices: [{ delta: { content: "Here are the Porsches." } }] },
        SERVER_TIMING,
      ]),
    }),
  );
  await openChat(page);
  await send(page, "any Porsches?");

  const turn = await probeEvent(page, "lume_concierge_turn_completed");
  const p = turn.properties;
  // Visitor milestones, in the order they happen.
  const order = [
    "client_request_sent_ms",
    "client_response_headers_ms",
    "client_first_event_ms",
    "client_first_action_received_ms",
    "client_first_action_dispatched_ms",
    "client_first_text_received_ms",
    "client_first_text_painted_ms",
  ];
  let previous = -1;
  for (const key of order) {
    expect(typeof p[key], key).toBe("number");
    expect(p[key] as number, key).toBeGreaterThanOrEqual(previous);
    previous = p[key] as number;
  }
  expect(typeof p.client_submit_painted_ms).toBe("number");
  expect(p.duration_ms).toBeGreaterThanOrEqual(p.client_first_text_received_ms as number);
  // Server stages merged into the same event, and the split derived.
  expect(p).toMatchObject({
    server_route: "deterministic",
    server_first_byte_ms: 38,
    server_total_ms: 41,
    conversation_turn: 1,
    action_types: "filter_inventory",
    action_count: 1,
    client_was_hidden: false,
  });
  expect(typeof p.client_network_overhead_ms).toBe("number");
  expect(p.client_release).toEqual(expect.any(String));
  // Content-free: the visitor's words and the reply never appear.
  expect(JSON.stringify(p)).not.toContain("Porsches?");
  expect(JSON.stringify(p)).not.toContain("Here are the");
});

test("a filter action is timed until the inventory results are on screen", async ({ page }) => {
  await page.route("**/api/chat", (route: Route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse([
        { type: "meta", sourceCategories: [], sessionId: "s1", requestId: "r1" },
        { type: "action", action: { type: "filter_inventory", make: "Porsche" } },
        SERVER_TIMING,
      ]),
    }),
  );
  await openChat(page);
  await send(page, "any Porsches?");
  await expect(page).toHaveURL(/\/vehicles/);

  const applied = await probeEvent(page, "lume_concierge_action_applied");
  expect(applied.properties).toMatchObject({
    action_type: "filter_inventory",
    outcome: "ready",
    route_changed: true,
  });
  const routeMs = applied.properties.action_route_ms as number;
  const readyMs = applied.properties.action_ready_ms as number;
  expect(routeMs).toBeGreaterThanOrEqual(0);
  expect(readyMs).toBeGreaterThanOrEqual(routeMs);
});

test("a vehicle-detail action is timed until the vehicle page has loaded", async ({ page }) => {
  await page.route("**/api/chat", (route: Route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse([
        { type: "meta", sourceCategories: [], sessionId: "s1", requestId: "r1" },
        {
          type: "action",
          action: {
            type: "navigate-target",
            targetKey: "vehicle-detail",
            params: { vehicleId: VEHICLE_ID },
            target: {
              key: "vehicle-detail",
              label: "Vehicle detail",
              kind: "route",
              destination: "/vehicles/:vehicleId",
              isConversion: false,
            },
          },
        },
        SERVER_TIMING,
      ]),
    }),
  );
  await openChat(page);
  await send(page, "open the first one");
  await expect(page).toHaveURL(new RegExp(`/vehicles/${VEHICLE_ID}`));

  const applied = await probeEvent(page, "lume_concierge_action_applied");
  expect(applied.properties).toMatchObject({
    action_type: "navigate-target",
    outcome: "ready",
    route_changed: true,
  });
});

test("a stale turn's suppressed action is never timed as applied", async ({ page }) => {
  let releaseFirst: (() => void) | undefined;
  const firstHeld = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let call = 0;
  await page.route("**/api/chat", async (route: Route) => {
    call += 1;
    if (call === 1) {
      await firstHeld;
      await route.fulfill({
        contentType: "text/event-stream",
        body: sse([
          { type: "meta", sourceCategories: [], sessionId: "s1", requestId: "r1" },
          { type: "action", action: { type: "filter_inventory", make: "BMW" } },
        ]),
      });
      return;
    }
    await route.fulfill({
      contentType: "text/event-stream",
      body: sse([
        { type: "meta", sourceCategories: [], sessionId: "s1", requestId: "r2" },
        { choices: [{ delta: { content: "Current answer." } }] },
        SERVER_TIMING,
      ]),
    });
  });
  await openChat(page);
  await send(page, "any BMWs?");
  await page.getByRole("button", { name: "Reset chat" }).click();
  await send(page, "what are your hours?");
  await probeEvent(page, "lume_concierge_turn_completed");
  releaseFirst?.();
  await page.waitForTimeout(750);

  const applied = await page.evaluate(() =>
    (window as unknown as { __lumeSpeedProbe: ProbeEvent[] }).__lumeSpeedProbe.filter(
      (event) => event.name === "lume_concierge_action_applied",
    ),
  );
  expect(applied).toEqual([]);
});
