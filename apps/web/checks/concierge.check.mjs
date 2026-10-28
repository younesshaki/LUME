import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { previewEnvironment } from "../config/environment.ts";
import { conciergeChat } from "../server/concierge/chat-proxy.ts";

const env = previewEnvironment({
  ...process.env,
  WEB_PREVIEW_TEST_MODE: "1",
  WEB_PREVIEW_SUPABASE_URL: "http://127.0.0.1:3999",
  WEB_PREVIEW_PROJECT_REF: "local-test",
  WEB_PREVIEW_SUPABASE_ANON_KEY: "fixture-anon",
  WEB_PREVIEW_DEFAULT_TENANT: "demo",
  WEB_PREVIEW_UPSTREAM_ORIGIN: "https://staging-api.fixture.vercel.app",
});
for (const key of Object.keys(process.env))
  if (!(key in env) && key !== "NODE_TEST_CONTEXT") delete process.env[key];
Object.assign(process.env, env);

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const tenantId = "2de52a45-bc2b-451c-994c-02208b994e26";
const SSE_BODY =
  'data: {"type":"meta","sourceCategories":["inventory"],"capabilities":{"actions":true}}\n\n' +
  'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
  'data: {"type":"action","action":{"type":"navigate","route":"vehicles"}}\n\n' +
  "data: [DONE]\n\n";

const sseResponse = () =>
  new Response(SSE_BODY, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Source-Categories": "inventory",
      "Set-Cookie": "admin=must-not-pass",
    },
  });

/** Mock fetch: answer the tenant_by_slug RPC, record + answer the upstream. */
function stub(upstream = sseResponse) {
  const calls = [];
  globalThis.fetch = async (input, options) => {
    const u = new URL(input);
    if (u.pathname === "/rest/v1/rpc/tenant_by_slug") {
      const slug = JSON.parse(options.body).p_slug;
      return new Response(
        JSON.stringify(
          slug === "demo"
            ? [{ id: tenantId, slug, name: "Demo", status: "active" }]
            : [],
        ),
        { headers: { "Content-Type": "application/json" } },
      );
    }
    calls.push({ u, options });
    if (options.signal?.aborted)
      throw new DOMException("aborted", "AbortError");
    return upstream(input, options);
  };
  return calls;
}

function request(body = "{}", headers = {}, init = {}) {
  return new Request("http://localhost:3200/api/chat?tenant=demo", {
    method: "POST",
    headers: {
      host: "localhost:3200",
      origin: "http://localhost:3200",
      "Content-Type": "application/json",
      "X-Lume-Tenant": "demo",
      ...headers,
    },
    body,
    ...init,
  });
}

test("chat proxy streams SSE through, forwards Origin/tenant and only the signed visitor cookie, and never leaks Set-Cookie", async () => {
  const calls = stub();
  const response = await conciergeChat(
    request('{"messages":[{"role":"user","content":"hi"}],"stream":true}', {
      cookie:
        "admin=private; lume_visitor_session=signed-fixture; sb-auth=private",
      authorization: "Bearer private",
    }),
  );
  assert.equal(response.status, 200);
  // SSE body is piped through untouched.
  assert.equal(await response.text(), SSE_BODY);
  // Upstream SSE headers surface; admin Set-Cookie does not.
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  assert.equal(response.headers.get("x-source-categories"), "inventory");
  assert.equal(response.headers.get("cache-control"), "no-cache, no-transform");
  assert.equal(response.headers.get("set-cookie"), null);
  // Exactly one upstream call, correctly scoped.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].u.pathname, "/api/chat");
  assert.equal(calls[0].u.searchParams.get("tenant"), "demo");
  const forwarded = calls[0].options.headers;
  assert.equal(forwarded.get("Origin"), "http://localhost:3200");
  assert.equal(forwarded.get("X-Lume-Tenant"), "demo");
  assert.equal(forwarded.get("Cookie"), "lume_visitor_session=signed-fixture");
  assert.equal(forwarded.get("Authorization"), null);
});

test("chat proxy rejects cross-origin, absent Origin, unknown tenant, conflicting selectors and non-POST before any upstream call", async () => {
  const calls = stub();
  assert.equal(
    (await conciergeChat(request("{}", { origin: "https://forged.test" })))
      .status,
    403,
  );
  const absent = request();
  absent.headers.delete("origin");
  assert.equal((await conciergeChat(absent)).status, 403);
  assert.equal(
    (await conciergeChat(request("{}", { "x-lume-tenant": "foreign" }))).status,
    404,
  );
  const conflicting = new Request(
    "http://localhost:3200/api/chat?tenant=foreign",
    {
      method: "POST",
      headers: {
        host: "localhost:3200",
        origin: "http://localhost:3200",
        "X-Lume-Tenant": "demo",
      },
      body: "{}",
    },
  );
  assert.equal((await conciergeChat(conflicting)).status, 404);
  const get = new Request("http://localhost:3200/api/chat?tenant=demo", {
    method: "GET",
    headers: { host: "localhost:3200", origin: "http://localhost:3200" },
  });
  assert.equal((await conciergeChat(get)).status, 405);
  assert.equal(calls.length, 0);
});

test("OPTIONS preflight returns 204 with credentialed CORS and no upstream call", async () => {
  const calls = stub();
  const preflight = new Request("http://localhost:3200/api/chat?tenant=demo", {
    method: "OPTIONS",
    headers: { host: "localhost:3200", origin: "http://localhost:3200" },
  });
  const response = await conciergeChat(preflight);
  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "http://localhost:3200",
  );
  assert.equal(
    response.headers.get("access-control-allow-credentials"),
    "true",
  );
  assert.equal(calls.length, 0);
});

test("oversized chat body is rejected before any upstream call", async () => {
  const calls = stub();
  const response = await conciergeChat(request("x".repeat(262145)));
  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
});

test("a client that has already disconnected cancels the upstream turn (SSE cancellation)", async () => {
  const calls = stub();
  const aborted = new AbortController();
  aborted.abort();
  const response = await conciergeChat(
    request('{"messages":[]}', {}, { signal: aborted.signal }),
  );
  assert.equal(response.status, 499);
  // The upstream was reached with an already-aborted signal and threw.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.signal?.aborted, true);
});

// --- Phase 4b: bot-action → Next navigation translation ---
import { resolveActionOutcome } from "../components/concierge/conciergeActions.ts";
import { streamChat } from "@lume/blocks/chat-transport";

const noHistory = { previous: () => null, lastResults: () => null };

test("side-effect consumers require the SSE terminator, including chunk-split streams", async () => {
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          const bytes = new TextEncoder().encode(SSE_BODY);
          for (let i = 0; i < bytes.length; i += 7)
            controller.enqueue(bytes.slice(i, i + 7));
          controller.close();
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
  const events = [];
  for await (const event of streamChat({ tenantSlug: "demo" }, [], {
    requireCompletion: true,
  }))
    events.push(event.kind);
  assert.deepEqual(events, ["meta", "delta", "action"]);
  globalThis.fetch = async () =>
    new Response(SSE_BODY.replace("data: [DONE]\n\n", ""));
  await assert.rejects(async () => {
    for await (const _ of streamChat({ tenantSlug: "demo" }, [], {
      requireCompletion: true,
    })) {
    }
  }, /ended before completion/);
});

test("navigate actions map free-form routes to public Next hrefs and drop non-public ones", () => {
  const nav = (route) =>
    resolveActionOutcome({ type: "navigate", route }, noHistory);
  assert.deepEqual(nav("home"), { kind: "navigate", href: "/" });
  assert.deepEqual(nav("inventory"), { kind: "navigate", href: "/vehicles" });
  assert.deepEqual(nav("/vehicles/abc-123"), {
    kind: "navigate",
    href: "/vehicles/abc-123",
  });
  assert.deepEqual(nav("/products/sku9"), {
    kind: "navigate",
    href: "/products/sku9",
  });
  assert.deepEqual(nav("/admin/secrets"), { kind: "ignored" });
  assert.deepEqual(nav("https://evil.test"), { kind: "ignored" });
});

test("filter_inventory becomes real ?search params on /vehicles, not a hash", () => {
  const outcome = resolveActionOutcome(
    {
      type: "filter_inventory",
      make: "BMW",
      priceMax: 50000,
      sort: "price_asc",
    },
    noHistory,
  );
  assert.equal(outcome.kind, "navigate");
  assert.equal(
    outcome.href,
    "/vehicles?make=BMW&priceMax=50000&sort=price_asc",
  );
  assert.equal(
    resolveActionOutcome({ type: "filter_inventory" }, noHistory).href,
    "/vehicles",
  );
});

test("highlight-vehicle and navigate-target route/anchor resolve to internal paths", () => {
  assert.deepEqual(
    resolveActionOutcome(
      { type: "highlight-vehicle", vehicleId: "v-9" },
      noHistory,
    ),
    { kind: "navigate", href: "/vehicles/v-9" },
  );
  const routeTarget = {
    type: "navigate-target",
    targetKey: "book",
    target: {
      key: "book",
      label: "Book",
      destination: "/contact",
      isConversion: true,
      kind: "route",
    },
  };
  assert.deepEqual(resolveActionOutcome(routeTarget, noHistory), {
    kind: "navigate",
    href: "/contact",
  });
  const anchor = {
    ...routeTarget,
    target: {
      ...routeTarget.target,
      destination: "/products#gallery",
      kind: "section-anchor",
    },
  };
  assert.deepEqual(resolveActionOutcome(anchor, noHistory), {
    kind: "navigate",
    href: "/products#gallery",
  });
  const modal = {
    ...routeTarget,
    target: { ...routeTarget.target, kind: "modal" },
  };
  assert.equal(resolveActionOutcome(modal, noHistory).kind, "ignored");
});

test("navigate-back resolves locally (never history.back): previous, results, fallback, inventory", () => {
  const withPrev = {
    previous: () => "/products",
    lastResults: () => "/vehicles?make=Audi",
  };
  assert.deepEqual(
    resolveActionOutcome(
      { type: "navigate-back", destination: "previous" },
      withPrev,
    ),
    { kind: "navigate", href: "/products", replace: true },
  );
  assert.deepEqual(
    resolveActionOutcome(
      { type: "navigate-back", destination: "results" },
      withPrev,
    ),
    { kind: "navigate", href: "/vehicles?make=Audi", replace: true },
  );
  // No history → grounded filter fallback.
  assert.deepEqual(
    resolveActionOutcome(
      {
        type: "navigate-back",
        destination: "previous",
        fallback: { type: "filter_inventory", make: "Ford" },
      },
      noHistory,
    ),
    { kind: "navigate", href: "/vehicles?make=Ford", replace: true },
  );
  // No history, no fallback → inventory.
  assert.deepEqual(
    resolveActionOutcome(
      { type: "navigate-back", destination: "previous" },
      noHistory,
    ),
    { kind: "navigate", href: "/vehicles", replace: true },
  );
});

test("comparison and lead actions resolve to implemented consumers", () => {
  const ids = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ];
  assert.deepEqual(
    resolveActionOutcome(
      { type: "compare_vehicles", vehicleIds: ids },
      noHistory,
    ),
    { kind: "navigate", href: `/vehicles/compare?ids=${ids.join(",")}` },
  );
  for (const vehicleIds of [
    [ids[0]],
    [ids[0], ids[0]],
    ["foreign", ids[0]],
    [...ids, ...ids],
  ])
    assert.equal(
      resolveActionOutcome({ type: "compare_vehicles", vehicleIds }, noHistory)
        .kind,
      "ignored",
    );
  const outcome = resolveActionOutcome(
    {
      type: "open-lead-form",
      prefill: {
        firstName: " Sam ",
        email: "sam@example.invalid",
        secret: "must-not-pass",
      },
      vehicleId: ids[0],
      attribution: { sessionId: "chat-fixture" },
    },
    noHistory,
  );
  assert.equal(outcome.href, "/contact#concierge-lead-form");
  assert.equal(outcome.leadForm.input.firstName, "Sam");
  assert.equal(outcome.leadForm.input.secret, undefined);
  assert.equal(
    outcome.leadForm.input.sourceContext.chatSessionId,
    "chat-fixture",
  );
  const capture = resolveActionOutcome(
    {
      type: "capture_lead",
      contact: { email: "sam@example.invalid" },
      vehicleId: ids[0],
    },
    noHistory,
  );
  assert.equal(capture.kind, "capture-lead");
  assert.equal(capture.input.source, "chat");
  assert.equal(capture.input.sourceContext.actionType, "capture_lead");
});

test("registered form/modal destinations substitute safe parameters and carry attribution", () => {
  const form = {
    type: "navigate-target",
    targetKey: "contact-lead-form",
    target: {
      key: "contact-lead-form",
      label: "Contact",
      kind: "form",
      destination: "/contact#concierge-lead-form",
      isConversion: true,
    },
    params: { firstName: "Ada" },
    attribution: { sessionId: "session-fixture" },
  };
  assert.equal(
    resolveActionOutcome(form, noHistory).leadForm.input.firstName,
    "Ada",
  );
  const modal = {
    ...form,
    targetKey: "vehicle-inquiry",
    target: {
      ...form.target,
      key: "vehicle-inquiry",
      kind: "modal",
      destination: "/vehicles/:vehicleId#vehicle-inquiry",
    },
    params: { vehicleId: "11111111-1111-4111-8111-111111111111" },
  };
  const resolved = resolveActionOutcome(modal, noHistory);
  assert.equal(
    resolved.href,
    "/vehicles/11111111-1111-4111-8111-111111111111#vehicle-inquiry",
  );
  assert.equal(resolved.leadForm.input.vehicleId, modal.params.vehicleId);
  assert.equal(
    resolved.leadForm.input.sourceContext.targetKey,
    "vehicle-inquiry",
  );
  assert.equal(
    resolveActionOutcome(
      {
        ...form,
        target: { ...form.target, destination: "/contact#custom-form" },
      },
      noHistory,
    ).target.handlerId,
    "custom-form",
  );
  for (const bad of [
    { ...modal, params: {} },
    { ...modal, params: { vehicleId: ".." } },
    { ...form, targetKey: "forged" },
    {
      ...form,
      target: {
        ...form.target,
        destination: "//evil.test#concierge-lead-form",
      },
    },
  ])
    assert.equal(resolveActionOutcome(bad, noHistory).kind, "ignored");
});
