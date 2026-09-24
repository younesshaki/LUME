import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Browser verification of the concierge's in-site "go back".
 *
 * The chat endpoint is fulfilled by `page.route`, as in stale-actions.spec:
 * this suite checks what the PAGE does with a server-authored `navigate-back`
 * — that it returns to a same-origin page from the tab's in-app history,
 * falls back to the server-grounded results, and otherwise stays put, never
 * following browser history off the site. Every /api request is stubbed; a
 * catch-all fails the test if one escapes.
 */

const VEHICLE_ID = "2ae764bd-8de1-4866-86d7-e48fa3cb2b93";
const VDP = `/vehicles/${VEHICLE_ID}`;
const FALLBACK = { type: "filter_inventory", make: "Porsche", sort: "price_desc", limit: 10 };

let escapedRequests: string[] = [];
let chatBodies: Array<{ navigation?: Record<string, unknown> }> = [];

function sse(events: unknown[]): string {
  return `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
}

function meta(requestId: string) {
  return { type: "meta", sourceCategories: [], sessionId: "s1", requestId };
}

const vehicleDetailAction = {
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

/** Answer successive chat turns with the given streams, recording each request body. */
async function stubChatTurns(page: Page, turns: unknown[][]): Promise<void> {
  let call = 0;
  await page.route("**/api/chat", (route: Route) => {
    chatBodies.push(JSON.parse(route.request().postData() ?? "{}"));
    const events = turns[Math.min(call, turns.length - 1)]!;
    call += 1;
    return route.fulfill({ contentType: "text/event-stream", body: sse(events) });
  });
}

async function openChatOn(page: Page, path: string): Promise<void> {
  await page.goto(path);
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

const lastAssistant = (page: Page) => page.locator(".ollamaChat__message--assistant").last();

test.beforeEach(async ({ page }) => {
  escapedRequests = [];
  chatBodies = [];
  await stubBackend(page);
});

test.afterEach(() => {
  expect(escapedRequests, "unstubbed /api requests").toEqual([]);
});

test("vehicle opened from filtered results → go back returns to those results", async ({ page }) => {
  await stubChatTurns(page, [
    [meta("r1"), { type: "action", action: vehicleDetailAction }, { choices: [{ delta: { content: "Opening it." } }] }],
    [
      meta("r2"),
      { type: "action", action: { type: "navigate-back", destination: "previous", fallback: FALLBACK } },
      { choices: [{ delta: { content: "Taking you back to the previous page." } }] },
    ],
  ]);
  await openChatOn(page, "/vehicles#vehicles?make=Porsche&sort=price_desc");
  // Whatever URL the results page settled on is exactly where "back" must land.
  const resultsUrl = page.url();
  expect(resultsUrl).toContain("make=Porsche");

  await send(page, "open the second one");
  await expect(page).toHaveURL(new RegExp(`${VDP}$`));

  await send(page, "go back");
  await expect(page).toHaveURL(resultsUrl);
  await expect(lastAssistant(page)).toContainText("Taking you back");
  // The concierge return replaces the vehicle-detail entry. Native browser
  // Back must not resurrect the detail page it just left.
  await page.goBack();
  await expect(page).toHaveURL(resultsUrl);
  // The second turn told the server, with booleans only, that a way back existed.
  expect(chatBodies[1]?.navigation).toEqual({ hasPrevious: true, hasResults: true });
});

test("go back after a normal in-app page transition", async ({ page }) => {
  await stubChatTurns(page, [
    [meta("r1"), { type: "action", action: { type: "navigate", route: "/contact" } }],
    [meta("r2"), { type: "action", action: { type: "navigate-back", destination: "previous" } }],
  ]);
  await openChatOn(page, "/home");
  await send(page, "take me to the contact page");
  await expect(page).toHaveURL(/\/contact$/);

  await send(page, "go back");
  await expect(page).toHaveURL(/\/home$/);
});

test("direct landing with no LUME history uses the server's grounded results", async ({ page }) => {
  await stubChatTurns(page, [
    [
      meta("r1"),
      { type: "action", action: { type: "navigate-back", destination: "previous", fallback: FALLBACK } },
    ],
  ]);
  await openChatOn(page, VDP);
  await send(page, "go back");

  await expect(page).toHaveURL((url) => url.pathname === "/vehicles");
  // Inventory state is carried in the hash (#vehicles?…), exactly as a
  // concierge filter action encodes it.
  const state = new URLSearchParams(new URL(page.url()).hash.split("?")[1] ?? "");
  expect(state.get("make")).toBe("Porsche");
  expect(state.get("sort")).toBe("price_desc");
  expect(state.get("resultLimit")).toBe("10");
  expect(chatBodies[0]?.navigation).toEqual({ hasPrevious: false, hasResults: false });
});

test("with no LUME history and no fallback, the visitor never leaves the site", async ({ page }) => {
  await stubChatTurns(page, [
    [meta("r1"), { type: "action", action: { type: "navigate-back", destination: "previous" } }],
  ]);
  // A real previous browser entry that is NOT LUME: history.back() would go here.
  await page.goto("data:text/html,<title>another site</title>");
  await openChatOn(page, VDP);
  const origin = new URL(page.url()).origin;

  await send(page, "go back");
  await page.waitForTimeout(750);
  expect(new URL(page.url()).origin).toBe(origin);
  await expect(page).toHaveURL(new RegExp(`${VDP}$`));
});

test("a superseded turn's navigate-back cannot move the page", async ({ page }) => {
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
          meta("r1"),
          { type: "action", action: { type: "navigate-back", destination: "previous", fallback: FALLBACK } },
        ]),
      });
      return;
    }
    await route.fulfill({
      contentType: "text/event-stream",
      body: sse([meta("r2"), { choices: [{ delta: { content: "Current answer." } }] }]),
    });
  });

  await openChatOn(page, VDP);
  await send(page, "go back");
  await page.getByRole("button", { name: "Reset chat" }).click();
  await send(page, "what are your hours?");
  await expect(lastAssistant(page)).toContainText("Current answer.");

  releaseFirst?.();
  await page.waitForTimeout(750);
  await expect(page).toHaveURL(new RegExp(`${VDP}$`));
});

test("forged back payloads are dropped before they reach the page", async ({ page }) => {
  await stubChatTurns(page, [
    [
      meta("r1"),
      { type: "action", action: { type: "navigate-back", destination: "https://evil.example" } },
      {
        type: "action",
        action: {
          type: "navigate-back",
          destination: "previous",
          fallback: { type: "navigate", route: "https://evil.example" },
        },
      },
      { type: "action", action: { type: "scroll-to", sectionId: "finance" } },
    ],
  ]);
  await openChatOn(page, VDP);
  await send(page, "go back");
  await page.waitForTimeout(750);
  await expect(page).toHaveURL(new RegExp(`${VDP}$`));
});
