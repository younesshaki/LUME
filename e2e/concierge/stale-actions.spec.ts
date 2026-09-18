import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Browser verification of the concierge's action guarantees.
 *
 * These assert what the PAGE does, which is the part no unit test can reach:
 * the unit suite proves the turn sequencer's decisions, this proves those
 * decisions actually reach — or fail to reach — the router and the URL.
 *
 * The chat endpoint is fulfilled by `page.route` throughout. That is not a
 * convenience: verifying that a superseded stream cannot navigate must not
 * depend on a model provider agreeing to be slow, and must not spend money or
 * touch a production-backed Supabase to find out.
 */

const FILTER_ACTION = {
  type: "filter_inventory",
  filters: { make: "BMW" },
};

function sse(events: unknown[]): string {
  return `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
}

/** Stub every backend the public shell touches, so only chat is under test. */
async function stubBackend(page: Page): Promise<void> {
  await page.route("**/api/visitor/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unauthorized" }),
    }),
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
  await page.route("**/api/events*", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/consent*", (route) => route.fulfill({ status: 204, body: "" }));
}

async function openChat(page: Page): Promise<void> {
  await page.goto("/home");
  // The launcher pulses forever, which Playwright reads as "never stable" and
  // refuses to click. Killing animation is about determinism here, not about
  // avoiding the animation itself.
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation: none !important;
      transition: none !important;
    }`,
  });
  // The cookie banner sits over the launcher until it is answered, so a
  // first-visit page cannot reach the chat at all without dismissing it.
  const consent = page.getByRole("button", { name: "Accept analytics" });
  if (await consent.isVisible().catch(() => false)) await consent.click();

  // The chat is a lazy chunk; wait for the launcher to be real before
  // clicking, or the click lands before React has wired it.
  const launcher = page.getByRole("button", { name: "Open LUME assistant" });
  await expect(launcher).toBeVisible();
  await launcher.click();
  await expect(
    page.getByRole("textbox", { name: "Message LUME assistant" }),
  ).toBeVisible();
}

async function send(page: Page, text: string): Promise<void> {
  await page.getByRole("textbox", { name: "Message LUME assistant" }).fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
}

const assistantBubbles = (page: Page) =>
  page.locator(".ollamaChat__message--assistant");

test.beforeEach(async ({ page }) => {
  await stubBackend(page);
});

test("a current turn's filter action reaches the router and changes the URL", async ({
  page,
}) => {
  // The positive control. Everything below asserts an action does NOT apply,
  // which is worthless unless this proves one normally does.
  await page.route("**/api/chat", (route: Route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse([
        { type: "meta", sourceCategories: [], sessionId: "s1", requestId: "r1" },
        { type: "action", action: FILTER_ACTION },
        { choices: [{ delta: { content: "Here are the BMWs." } }] },
      ]),
    }),
  );

  await openChat(page);
  await send(page, "any BMWs?");

  await expect(page).toHaveURL(/\/vehicles/);
  await expect(assistantBubbles(page).last()).toContainText("Here are the BMWs.");
});

test("an action from a superseded turn cannot refilter or navigate", async ({
  page,
}) => {
  // The first turn's stream is held open past the second turn's start, then
  // releases its action. The browser must ignore it: it answers a question
  // the visitor has already moved on from.
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
          { type: "action", action: FILTER_ACTION },
          { choices: [{ delta: { content: "Late answer." } }] },
        ]),
      });
      return;
    }
    await route.fulfill({
      contentType: "text/event-stream",
      body: sse([
        { type: "meta", sourceCategories: [], sessionId: "s1", requestId: "r2" },
        { choices: [{ delta: { content: "Current answer." } }] },
      ]),
    });
  });

  await openChat(page);
  await send(page, "any BMWs?");
  // Reset supersedes the in-flight turn, which is the abort path a visitor can
  // actually reach from the UI.
  await page.getByRole("button", { name: "Reset chat" }).click();
  await send(page, "tell me about financing");
  await expect(assistantBubbles(page).last()).toContainText("Current answer.");

  releaseFirst?.();
  // Give the superseded stream time to deliver its action before asserting.
  await page.waitForTimeout(750);
  await expect(page).not.toHaveURL(/\/vehicles/);
});

test("an aborted stream cannot execute a buffered action after reset", async ({
  page,
}) => {
  let releaseAborted: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    releaseAborted = resolve;
  });

  await page.route("**/api/chat", async (route: Route) => {
    await held;
    await route.fulfill({
      contentType: "text/event-stream",
      body: sse([
        { type: "meta", sourceCategories: [], sessionId: "s1", requestId: "r1" },
        { type: "action", action: FILTER_ACTION },
      ]),
    });
  });

  await openChat(page);
  await send(page, "any BMWs?");
  await page.getByRole("button", { name: "Reset chat" }).click();

  releaseAborted?.();
  await page.waitForTimeout(750);
  // Aborting the fetch does not stop a buffered action from surfacing, so the
  // turn's revoked authority is what has to stop it.
  await expect(page).not.toHaveURL(/\/vehicles/);
});

test("a duplicate turn shows no second bubble and no error", async ({ page }) => {
  await page.route("**/api/chat", (route: Route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse([{ type: "duplicate" }]),
    }),
  );

  await openChat(page);
  const before = await assistantBubbles(page).count();
  await send(page, "any BMWs?");
  await page.waitForTimeout(750);

  // The delivery holding the lease is producing the answer; this one ends
  // quietly rather than rendering a second reply or a failure.
  expect(await assistantBubbles(page).count()).toBe(before);
  await expect(page.locator(".ollamaChat__error")).toHaveCount(0);
  await expect(page).not.toHaveURL(/\/vehicles/);
});

test("a duplicate turn leaves the composer usable", async ({ page }) => {
  // A turn that ends quietly must not leave the UI stuck in a sending state.
  await page.route("**/api/chat", (route: Route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse([{ type: "duplicate" }]),
    }),
  );

  await openChat(page);
  await send(page, "any BMWs?");
  await expect(
    page.getByRole("textbox", { name: "Message LUME assistant" }),
  ).toBeEnabled({ timeout: 10_000 });
});

test("an informational turn with no actions never navigates", async ({ page }) => {
  // The Basic-plan shape: prose only, capabilities.actions false.
  await page.route("**/api/chat", (route: Route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse([
        {
          type: "meta",
          sourceCategories: [],
          sessionId: "s1",
          requestId: "r1",
          capabilities: { actions: false },
        },
        { choices: [{ delta: { content: "We are open until six." } }] },
      ]),
    }),
  );

  await openChat(page);
  await send(page, "what are your hours?");
  await expect(assistantBubbles(page).last()).toContainText("We are open until six.");
  await expect(page).not.toHaveURL(/\/vehicles/);
});

test("a truthful refusal is shown when a reference cannot be resolved", async ({
  page,
}) => {
  // The degraded-memory path: the server refuses to resolve "the second one"
  // and says so. The visitor must see the explanation, not a blank turn.
  const refusal =
    "I’ve lost the thread of which results I showed you, so I can’t safely open one by position right now.";
  await page.route("**/api/chat", (route: Route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: sse([
        { type: "meta", sourceCategories: [], sessionId: "s1", requestId: "r1" },
        { choices: [{ delta: { content: refusal } }] },
      ]),
    }),
  );

  await openChat(page);
  await send(page, "open the second one");
  await expect(assistantBubbles(page).last()).toContainText("lost the thread");
  await expect(page).not.toHaveURL(/\/vehicles/);
});
