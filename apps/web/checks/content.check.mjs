import { listBlockDescriptors } from "@lume/blocks";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { previewEnvironment } from "../config/environment.ts";
import {
  publishedRepository,
  ContentUnavailable,
} from "../server/content/repository.ts";
import { publicMutation } from "../server/content/public-proxy.ts";
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
const document = {
  version: 1,
  blocks: [
    { id: "published-hero", type: "hero", props: { title: "Published only" } },
  ],
};
const row = {
  id: "page-id",
  slug: "contact",
  title: "Contact",
  seo_meta: { title: "Published contact" },
  blocks: document,
  published_revision_id: "published-revision",
};
const ok = (value) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
test("published loader uses only scoped anonymous public RPCs; no draft tables or caller revision selection", async () => {
  const calls = [];
  const repo = publishedRepository(env, async (input, options) => {
    calls.push({ url: new URL(input), options });
    return ok([row]);
  });
  const p = await repo.page(tenantId, "contact");
  assert.equal(p.publishedRevisionId, "published-revision");
  assert.equal(p.blocks.blocks[0].props.title, "Published only");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, "/rest/v1/rpc/get_published_page");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_tenant_id: tenantId,
    p_slug: "contact",
  });
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.headers.apikey, "fixture-anon");
});
test("missing, empty, invalid, mismatched and unavailable published documents remain distinguishable", async () => {
  const load = (rows) =>
    publishedRepository(env, async () => ok(rows)).page(tenantId, "contact");
  assert.equal(await load([]), null);
  assert.deepEqual(
    (await load([{ ...row, blocks: { version: 1, blocks: [] } }])).blocks
      .blocks,
    [],
  );
  for (const r of [
    { ...row, published_revision_id: null },
    { ...row, slug: "foreign" },
    {
      ...row,
      blocks: {
        version: 1,
        blocks: [{ id: "bad", type: "does-not-exist", props: {} }],
      },
    },
  ])
    await assert.rejects(load([r]), ContentUnavailable);
  await assert.rejects(load([row, row]), ContentUnavailable);
  await assert.rejects(
    publishedRepository(
      env,
      async () => new Response("private backend details", { status: 503 }),
    ).page(tenantId, "contact"),
    /temporarily unavailable/,
  );
});
function request(body = "{}", headers = {}) {
  return new Request("http://localhost:3200/api/leads?tenant=demo", {
    method: "POST",
    headers: {
      host: "localhost:3200",
      origin: "http://localhost:3200",
      "Content-Type": "application/json",
      "X-Lume-Tenant": "demo",
      ...headers,
    },
    body,
  });
}
function stub(upstream = () => ok({ id: "fixture-lead" })) {
  const calls = [];
  globalThis.fetch = async (input, options) => {
    const u = new URL(input);
    if (u.pathname === "/rest/v1/rpc/tenant_by_slug") {
      const slug = JSON.parse(options.body).p_slug;
      return ok(
        slug === "demo"
          ? [{ id: tenantId, slug, name: "Demo", status: "active" }]
          : [],
      );
    }
    calls.push({ u, options });
    return upstream(input, options);
  };
  return calls;
}
test("lead proxy preserves Origin, tenant, contract and only the signed visitor cookie; never forwards admin/auth cookies or Set-Cookie", async () => {
  const calls = stub(
    () =>
      new Response('{"id":"fixture-lead"}', {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "admin=must-not-pass",
          "X-Lume-Quota-Warning": "near-limit",
        },
      }),
  );
  const payload = {
    firstName: "Contract",
    lastName: "Fixture",
    email: "fixture@example.invalid",
    source: "contact-form",
  };
  const response = await publicMutation(
    request(JSON.stringify(payload), {
      cookie:
        "admin=private; lume_visitor_session=signed-fixture; sb-auth=private",
      authorization: "Bearer private",
    }),
    "leads",
  );
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("X-Lume-Quota-Warning"), "near-limit");
  const forwarded = calls[0].options.headers;
  assert.equal(forwarded.get("Origin"), "http://localhost:3200");
  assert.equal(forwarded.get("Cookie"), "lume_visitor_session=signed-fixture");
  assert.equal(forwarded.get("Authorization"), null);
  assert.deepEqual(JSON.parse(calls[0].options.body), payload);
  assert.equal(calls[0].u.searchParams.get("tenant"), "demo");
});
test("mutations reject cross-origin, absent Origin, unknown tenant and conflicting selectors before upstream writes", async () => {
  const calls = stub();
  assert.equal(
    (
      await publicMutation(
        request("{}", { origin: "https://forged.test" }),
        "leads",
      )
    ).status,
    403,
  );
  const absent = request();
  absent.headers.delete("origin");
  assert.equal((await publicMutation(absent, "leads")).status, 403);
  assert.equal(
    (
      await publicMutation(
        request("{}", { "x-lume-tenant": "foreign" }),
        "leads",
      )
    ).status,
    404,
  );
  const unknown = new Request(
    "http://localhost:3200/api/leads?tenant=foreign",
    {
      method: "POST",
      headers: { host: "localhost:3200", origin: "http://localhost:3200" },
      body: "{}",
    },
  );
  assert.equal((await publicMutation(unknown, "leads")).status, 404);
  assert.equal(calls.length, 0);
});
test("consent forwarding contains no visitor identity; upstream validation/failures are visible and safe", async () => {
  const calls = stub(() => new Response('{"recorded":true}', { status: 201 }));
  assert.equal(
    (
      await publicMutation(
        request('{"choice":"accepted","version":1}', {
          cookie: "lume_visitor_session=private",
          "user-agent": "private",
          referer: "https://private.test",
        }),
        "consent",
      )
    ).status,
    201,
  );
  assert.equal(calls[0].options.headers.get("cookie"), null);
  assert.equal(calls[0].options.headers.get("user-agent"), null);
  assert.equal(calls[0].options.headers.get("referer"), null);
  assert.equal(calls[0].u.pathname, "/api/consent");
  stub(() => new Response('{"error":"validation failed"}', { status: 400 }));
  assert.equal((await publicMutation(request(), "leads")).status, 400);
  stub(() => {
    throw new Error("sensitive transport failure");
  });
  const failed = await publicMutation(request(), "leads");
  assert.equal(failed.status, 502);
  assert.ok(!(await failed.text()).includes("sensitive"));
});
test("oversized body fails without an upstream mutation", async () => {
  const calls = stub();
  assert.equal(
    (await publicMutation(request("x".repeat(65537)), "leads")).status,
    413,
  );
  assert.equal(calls.length, 0);
});

test("every standard-mode shared descriptor has an explicit server adapter", () => {
  const source = readFileSync(
    new URL("../components/content/ServerBlocks.tsx", import.meta.url),
    "utf8",
  );
  const adapters = [...source.matchAll(/case "([^"]+)"/g)].map((m) => m[1]);
  const missing = listBlockDescriptors()
    .filter(
      (d) =>
        d.modes.includes("standard") &&
        !d.experienceOnly &&
        !adapters.includes(d.type),
    )
    .map((d) => d.type);
  assert.deepEqual(missing, []);
});

test("outage HTML escapes tenant content, has one heading and cannot redirect to an external path", async () => {
  const { unavailableResponse } =
    await import("../server/content/unavailable.ts");
  globalThis.fetch = async () =>
    ok([
      {
        id: tenantId,
        slug: "demo",
        name: "Demo <script>alert(1)</script>",
        status: "active",
      },
    ]);
  const request = new Request(
    "http://localhost:3200/preview/unavailable?tenant=demo&path=%2Fcontact",
    { headers: { host: "localhost:3200" } },
  );
  const response = await unavailableResponse(request);
  const html = await response.text();
  assert.equal(response.status, 503);
  assert.equal((html.match(/<h1>/g) ?? []).length, 1);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.match(html, /href="\/contact\?tenant=demo"/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const bad = await unavailableResponse(
    new Request(
      "http://localhost:3200/preview/unavailable?tenant=demo&path=%2F%2Fevil.test",
      { headers: { host: "localhost:3200" } },
    ),
  );
  assert.equal(bad.status, 404);
  assert.ok(!(await bad.text()).includes("href="));
});
