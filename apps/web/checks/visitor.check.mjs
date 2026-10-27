import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { previewEnvironment } from "../config/environment.ts";
import { visitorProxy } from "../server/concierge/visitor-proxy.ts";

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

function stub(upstream) {
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
    return upstream(input, options);
  };
  return calls;
}

function request(path, method = "GET", { body, headers = {} } = {}) {
  return new Request(`http://localhost:3200/api/visitor/${path}?tenant=demo`, {
    method,
    headers: {
      host: "localhost:3200",
      origin: "http://localhost:3200",
      "X-Lume-Tenant": "demo",
      ...headers,
    },
    ...(body !== undefined ? { body } : {}),
  });
}

function segments(path) {
  return path.split("/");
}

test("login relays back ONLY the signed visitor-session Set-Cookie and forwards it upstream next time", async () => {
  const calls = stub(() => {
    const h = new Headers({ "Content-Type": "application/json" });
    h.append(
      "set-cookie",
      "lume_visitor_session=signed-fixture; Path=/; HttpOnly; Secure; SameSite=None",
    );
    h.append("set-cookie", "admin=must-not-pass; Path=/");
    return new Response('{"visitor":{"id":"v1"}}', { status: 200, headers: h });
  });
  const response = await visitorProxy(
    request("login", "POST", {
      body: '{"email":"v@example.invalid"}',
      headers: { "Content-Type": "application/json" },
    }),
    segments("login"),
  );
  assert.equal(response.status, 200);
  const relayed = response.headers.getSetCookie();
  assert.equal(relayed.length, 1);
  assert.match(relayed[0], /^lume_visitor_session=signed-fixture/);
  assert.equal(calls[0].u.pathname, "/api/visitor/login");
  assert.equal(calls[0].u.searchParams.get("tenant"), "demo");
});

test("an existing session cookie is the only cookie forwarded upstream; admin/auth cookies are stripped", async () => {
  const calls = stub(() => new Response('{"visitor":{"id":"v1"}}', { status: 200 }));
  await visitorProxy(
    request("me", "GET", {
      headers: {
        cookie: "admin=private; lume_visitor_session=signed-fixture; sb-auth=x",
      },
    }),
    segments("me"),
  );
  assert.equal(
    calls[0].options.headers.get("Cookie"),
    "lume_visitor_session=signed-fixture",
  );
});

test("path allowlist: unknown endpoints, traversal and bad saved-vehicle ids are 404 before any upstream call", async () => {
  const calls = stub(() => new Response("{}"));
  for (const path of ["secret", "me/extra", "saved-vehicles/..", "saved-vehicles/a/b"]) {
    const r = await visitorProxy(request(path), segments(path));
    assert.equal(r.status, 404, `expected 404 for ${path}`);
  }
  // A valid saved-vehicles/<id> DELETE is allowed through.
  const ok = await visitorProxy(
    request("saved-vehicles/veh-123", "DELETE"),
    segments("saved-vehicles/veh-123"),
  );
  assert.equal(ok.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].u.pathname, "/api/visitor/saved-vehicles/veh-123");
});

test("visitor proxy rejects cross-origin, absent Origin, unknown tenant and unsupported methods", async () => {
  const calls = stub(() => new Response("{}"));
  assert.equal(
    (await visitorProxy(request("me", "GET", { headers: { origin: "https://forged.test" } }), ["me"]))
      .status,
    403,
  );
  const absent = request("me");
  absent.headers.delete("origin");
  assert.equal((await visitorProxy(absent, ["me"])).status, 403);
  assert.equal(
    (await visitorProxy(request("me", "GET", { headers: { "x-lume-tenant": "foreign" } }), ["me"]))
      .status,
    404,
  );
  const put = request("me", "PUT");
  assert.equal((await visitorProxy(put, ["me"])).status, 405);
  assert.equal(calls.length, 0);
});

test("OPTIONS preflight returns 204 credentialed CORS with no upstream call", async () => {
  const calls = stub(() => new Response("{}"));
  const r = await visitorProxy(request("me", "OPTIONS"), ["me"]);
  assert.equal(r.status, 204);
  assert.equal(
    r.headers.get("access-control-allow-credentials"),
    "true",
  );
  assert.equal(calls.length, 0);
});
