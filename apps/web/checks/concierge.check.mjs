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
