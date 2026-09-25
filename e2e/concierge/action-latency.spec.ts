import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Browser-side action latency: from the moment the chat response carrying an
 * action reaches the page, to the moment the destination page is mounted and
 * asking for its data.
 *
 * "Asking for its data" is the readiness point on purpose. It is the first
 * thing a mounted inventory or detail page does, it happens after the route's
 * lazy chunk has loaded and rendered, and it excludes the inventory API's own
 * server time — which is measured separately by apps/admin/bench.
 *
 * The chat and every backend call are fulfilled by `page.route`: nothing here
 * reaches Supabase, a model, or tenant data.
 *
 * Each case also asserts the behaviour (the URL the action must produce), so
 * the timing can never pass on a page that did the wrong thing. The time
 * budget is deliberately generous; the measured figures are printed and are
 * the point, not the threshold.
 */

const VEHICLE_ID = "2ae764bd-8de1-4866-86d7-e48fa3cb2b93";
const BUDGET_MS = 2_000;

function sse(events: unknown[]): string {
  return `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
}

/** Any /api request no stub below answers. Asserted empty after each test. */
let escapedRequests: string[] = [];

async function stubBackend(page: Page): Promise<void> {
  // Registered first so every specific stub below takes precedence (the most
  // recently registered matching route wins). Anything reaching this handler
  // was about to leave the page for a real backend.
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    escapedRequests.push(`${route.request().method()} ${url.pathname}`);
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
  // The detail page asks for the price-drop badge alongside the vehicle. A
  // tenant with the signal switched off is the shape normalizeVehiclePrice-
  // SignalPayload accepts as "show nothing".
  await page.route("**/api/vehicles/*/price-signal*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ enabled: false }),
    }),
  );
  await page.route("**/api/events*", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/consent*", (route) => route.fulfill({ status: 204, body: "" }));
}

/**
 * Records, in the page's own clock, when the chat response arrived and when
 * the first inventory/detail request after it was issued.
 */
async function instrumentFetch(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const marks = { chatResponseAt: 0, destinationRequestAt: 0 };
    (window as unknown as { __conciergeMarks: typeof marks }).__conciergeMarks = marks;
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (
        marks.chatResponseAt > 0 &&
        marks.destinationRequestAt === 0 &&
        /\/api\/vehicles(\/|\?|$)/.test(url) &&
        !url.includes("/facets")
      ) {
        marks.destinationRequestAt = performance.now();
      }
      const response = await realFetch(input, init);
      if (url.includes("/api/chat")) marks.chatResponseAt = performance.now();
      return response;
    };
  });
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
  await page.getByRole("textbox", { name: "Message LUME assistant" }).fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
}

async function measure(page: Page): Promise<number> {
  await page.waitForFunction(
    () =>
      (window as unknown as { __conciergeMarks: { destinationRequestAt: number } })
        .__conciergeMarks.destinationRequestAt > 0,
    undefined,
    { timeout: 10_000 },
  );
  return page.evaluate(() => {
    const marks = (window as unknown as {
      __conciergeMarks: { chatResponseAt: number; destinationRequestAt: number };
    }).__conciergeMarks;
    return Math.round(marks.destinationRequestAt - marks.chatResponseAt);
  });
}

test.beforeEach(async ({ page }) => {
  // Optional mobile-like network (CONCIERGE_NETWORK=4g): route chunks are
  // served from localhost here, which hides exactly the cost a visitor pays.
  if (process.env.CONCIERGE_NETWORK === "4g") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 100,
      downloadThroughput: (9 * 1024 * 1024) / 8,
      uploadThroughput: (1.5 * 1024 * 1024) / 8,
    });
  }
  escapedRequests = [];
  await stubBackend(page);
  await instrumentFetch(page);
});

test.afterEach(() => {
  // "Every backend call is stubbed" is a claim this suite makes, so it checks it.
  expect(escapedRequests, "unstubbed /api requests").toEqual([]);
});

test("a filter action reaches a mounted inventory page promptly", async ({ page }, info) => {
  await page.route("**/api/chat", (route: Route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse([
        { type: "meta", sourceCategories: [], sessionId: "s1", requestId: "r1" },
        { type: "action", action: { type: "filter_inventory", sort: "price_desc", limit: 10 } },
        { choices: [{ delta: { content: "Here are the ten most expensive." } }] },
      ]),
    }),
  );
  await openChat(page);
  await send(page, "10 most expensive cars");

  await expect(page).toHaveURL(/\/vehicles/);
  const elapsed = await measure(page);
  info.annotations.push({ type: "action-to-inventory-ms", description: String(elapsed) });
  console.log(`[concierge-latency] filter_inventory -> inventory mounted: ${elapsed}ms`);
  expect(elapsed).toBeLessThan(BUDGET_MS);
});

test("a vehicle-detail action reaches a mounted detail page promptly", async ({ page }, info) => {
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
        { choices: [{ delta: { content: "Opening it now." } }] },
      ]),
    }),
  );
  await openChat(page);
  await send(page, "open the second one");

  await expect(page).toHaveURL(new RegExp(`/vehicles/${VEHICLE_ID}`));
  const elapsed = await measure(page);
  info.annotations.push({ type: "action-to-detail-ms", description: String(elapsed) });
  console.log(`[concierge-latency] navigate-target -> detail mounted: ${elapsed}ms`);
  expect(elapsed).toBeLessThan(BUDGET_MS);
});
