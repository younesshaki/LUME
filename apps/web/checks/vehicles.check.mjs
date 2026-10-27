import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { previewEnvironment } from "../config/environment.ts";
import {
  vehicleRepository,
  feedGallery,
  inventoryParams,
} from "../server/vehicles/data.ts";
import { priceLabel } from "../server/vehicles/presentation.ts";
import { vehicleApi } from "../server/vehicles/api.ts";

const env = previewEnvironment({
  ...process.env,
  WEB_PREVIEW_TEST_MODE: "1",
  WEB_PREVIEW_SUPABASE_URL: "http://127.0.0.1:3999",
  WEB_PREVIEW_SUPABASE_ANON_KEY: "fixture-anon",
  WEB_PREVIEW_PROJECT_REF: "local-test",
  WEB_PREVIEW_R2_PUBLIC_BASE_URL: "https://media.fixture.test",
  WEB_PREVIEW_DEFAULT_TENANT: "alpha",
});
for (const name of Object.keys(process.env))
  if (!(name in env) && name !== "NODE_TEST_CONTEXT") delete process.env[name];
Object.assign(process.env, env);
const id = "11111111-1111-4111-8111-111111111111";
const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const row = {
  id,
  tenant_id: tenantId,
  status: "live",
  year: 2024,
  make: "BMW",
  model: "X5",
  trim: "xDrive",
  price: 50000,
  mileage: null,
  image_src: "https://feed.fixture.test/front.jpg",
  feed_image_urls: ["https://feed.fixture.test/rear.jpg"],
  catalog_version: 9,
};
const calls = [];
let mode = "normal";
async function transport(input, options = {}) {
  const u = new URL(input);
  calls.push({ u, options });
  assert.equal(options.headers.apikey, "fixture-anon");
  const ok = (data, headers) =>
    new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", ...headers },
    });
  if (u.pathname.endsWith("/tenant_by_slug"))
    return ok(
      JSON.parse(options.body).p_slug === "alpha"
        ? [
            {
              id: tenantId,
              slug: "alpha",
              name: "Alpha Motors",
              status: "active",
            },
          ]
        : [],
    );
  if (u.pathname.endsWith("/vehicles")) {
    assert.equal(u.searchParams.get("tenant_id"), `eq.${tenantId}`);
    assert.equal(u.searchParams.get("status"), "eq.live");
    if (
      mode === "old-schema" &&
      u.searchParams.get("select").includes("feed_image_urls")
    )
      return new Response(
        '{"message":"column feed_image_urls does not exist"}',
        { status: 400 },
      );
    return ok(
      mode === "missing"
        ? []
        : [
            {
              ...row,
              ...(mode === "foreign" ? { tenant_id: "other-tenant" } : {}),
              ...(mode === "sold" ? { status: "sold" } : {}),
            },
          ],
    );
  }
  if (u.pathname.endsWith("/vehicle_images")) {
    assert.equal(u.searchParams.get("vehicle_id"), `eq.${id}`);
    assert.equal(u.searchParams.get("tenant_id"), `eq.${tenantId}`);
    assert.equal(
      u.searchParams.get("order"),
      "is_primary.desc,sort_order.asc,created_at.asc",
    );
    if (["gallery-failure", "old-schema"].includes(mode))
      return new Response("unavailable", { status: 403 });
    return ok([
      {
        r2_key: "alpha/front image.webp",
        is_primary: true,
        sort_order: 0,
        ai_description: "Front view",
      },
    ]);
  }
  if (u.pathname.endsWith("/get_public_vehicle_price_signal"))
    return mode === "signal-failure"
      ? new Response("unavailable", { status: 503 })
      : ok([{ enabled: true, reductions: 2.9 }]);
  if (u.pathname.endsWith("/public_vehicle_inventory")) {
    if (mode === "search-fallback" && u.searchParams.has("search_vector"))
      return new Response('{"message":"column search_vector does not exist"}', {
        status: 400,
      });
    return ok([row, { ...row, id: "22222222-2222-4222-8222-222222222222" }], {
      "content-range": "0-1/21",
    });
  }
  if (u.pathname.endsWith("/vehicle_facets_v2"))
    return ok([
      {
        makes: ["BMW"],
        models: ["X5"],
        states: ["CO"],
        cities: ["Denver"],
        year_min: 2024,
        year_max: 2024,
        price_min: 50000,
        price_max: 50000,
        mileage_min: null,
        mileage_max: null,
        catalog_version: 9,
      },
    ]);
  throw new Error(`Unexpected test transport ${u.pathname}`);
}
afterEach(() => {
  calls.length = 0;
  mode = "normal";
});

test("visible vehicle precedes exact scoped ordered gallery; price signal normalized", async () => {
  const r = await vehicleRepository(env, transport).detail(tenantId, id);
  assert.equal(r.vehicle.tenantId, tenantId);
  assert.equal(
    r.images[0].src,
    "https://media.fixture.test/alpha/front%20image.webp",
  );
  assert.deepEqual(r.priceSignal, { enabled: true, reductions: 2 });
  assert.ok(calls[0].u.pathname.endsWith("/vehicles"));
});
test("cross-tenant, sold, missing and invalid UUID never expose gallery or signal", async () => {
  for (const m of ["foreign", "sold", "missing"]) {
    mode = m;
    calls.length = 0;
    assert.equal(
      await vehicleRepository(env, transport).detail(tenantId, id),
      null,
    );
    assert.equal(calls.length, 1);
  }
  calls.length = 0;
  assert.equal(
    await vehicleRepository(env, transport).detail(tenantId, "bad"),
    null,
  );
  assert.equal(calls.length, 0);
});
test("managed-gallery failure and old-schema feed projection preserve HTTPS feed fallback", async () => {
  mode = "gallery-failure";
  let r = await vehicleRepository(env, transport).detail(tenantId, id);
  assert.equal(r.images.length, 2);
  assert.equal(r.images[0].src, row.image_src);
  mode = "old-schema";
  r = await vehicleRepository(env, transport).detail(tenantId, id);
  assert.equal(r.images[0].src, row.image_src);
  assert.equal(
    calls.filter((c) => c.u.pathname.endsWith("/vehicles")).length,
    3,
  );
  assert.deepEqual(
    feedGallery({
      image_src: "javascript:alert(1)",
      feed_image_urls: [
        row.image_src,
        row.image_src,
        "http://unsafe.test/a",
        "https://user:pass@unsafe.test/a",
      ],
    }).map((i) => i.src),
    [row.image_src],
  );
});
test("price-signal failure hides signal without hiding vehicle; unavailable price is never $0/NaN", async () => {
  mode = "signal-failure";
  assert.deepEqual(
    (await vehicleRepository(env, transport).detail(tenantId, id)).priceSignal,
    { enabled: false, reductions: 0 },
  );
  for (const p of [0, -1, NaN, Infinity])
    assert.equal(priceLabel(p), "Contact for price");
  assert.equal(priceLabel(50000), "Est. $50,000");
});
test("inventory preserves count, hasMore, deterministic sort, all filter keys and mileage-null semantics", async () => {
  const sp = new URLSearchParams(
    "limit=1&includeCount=true&make=BMW&yearMin=2020&yearMax=2025&priceMax=60000&mileageMax=30000&sort=mileage_asc&query=X5",
  );
  const r = await vehicleRepository(env, transport).inventory(tenantId, sp);
  assert.equal(r.vehicles.length, 1);
  assert.equal(r.hasMore, true);
  assert.equal(r.totalCount, 21);
  assert.equal(r.etag, `W/"inventory-${tenantId}-9"`);
  const p = calls[0].u.searchParams;
  assert.deepEqual(p.getAll("year"), ["gte.2020", "lte.2025"]);
  assert.equal(p.get("or"), "(mileage.lte.30000,mileage.is.null)");
  assert.equal(p.get("order"), "mileage.asc.nullslast,id.asc");
  assert.equal(
    inventoryParams(tenantId, new URLSearchParams(), 200, 4).get("limit"),
    "201",
  );
});
test("search-vector fallback retains mileage filter and all constraints", async () => {
  mode = "search-fallback";
  await vehicleRepository(env, transport).inventory(
    tenantId,
    new URLSearchParams("query=BMW&mileageMax=20000"),
  );
  const p = calls[1].u.searchParams;
  assert.equal(p.getAll("or").length, 2);
  assert.ok(p.getAll("or")[1].includes("make.ilike.%BMW%"));
  assert.equal(p.has("search_vector"), false);
});
test("Next API preserves response shapes, CORS, OPTIONS, ETag, no cookie mutation, header selector and 404s", async (t) => {
  t.mock.method(globalThis, "fetch", transport);
  const get = (path, headers = {}, method = "GET") =>
    vehicleApi(
      new Request(`http://localhost${path}`, {
        method,
        headers: { host: "localhost", ...headers },
      }),
      path.includes("facets")
        ? "facets"
        : path.includes(id) || path.includes("bad-id")
          ? "detail"
          : "inventory",
      path.includes("bad-id") ? "bad-id" : id,
    );
  let r = await get("/api/vehicles?tenant=alpha&limit=1&includeCount=true", {
    cookie: "lume_visitor_session=sentinel",
  });
  let data = await r.json();
  assert.equal(r.status, 200);
  assert.equal(data.totalCount, 21);
  assert.equal(data.hasMore, true);
  assert.equal(data.vehicles[0].tenantId, tenantId);
  assert.equal(r.headers.get("set-cookie"), null);
  assert.match(r.headers.get("cache-control"), /no-store/);
  r = await get("/api/vehicles?tenant=alpha", {
    "if-none-match": r.headers.get("etag"),
  });
  assert.equal(r.status, 304);
  r = await get(`/api/vehicles/${id}`, { "x-lume-tenant": "alpha" });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).priceSignal.reductions, 2);
  r = await get("/api/vehicles/facets?tenant=alpha");
  assert.deepEqual((await r.json()).makes, ["BMW"]);
  r = await get(
    "/api/vehicles?tenant=alpha",
    { origin: "http://localhost" },
    "OPTIONS",
  );
  assert.equal(r.status, 204);
  assert.match(r.headers.get("access-control-allow-headers"), /X-Lume-Tenant/);
  assert.equal(
    (
      await get("/api/vehicles?tenant=alpha", {
        origin: "https://attacker.invalid",
      })
    ).status,
    403,
  );
  assert.equal(
    (await get("/api/vehicles?tenant=alpha", { "x-lume-tenant": "beta" }))
      .status,
    404,
  );
  assert.equal((await get("/api/vehicles?tenant=beta")).status, 404);
  assert.equal(
    (await get(`/api/vehicles/${id}?tenant=alpha`, { host: "forged.invalid" }))
      .status,
    404,
  );
  assert.equal((await get("/api/vehicles/bad-id?tenant=alpha")).status, 400);
});

test("hosted OPTIONS compares the verified public HTTPS host, not Vercel's internal HTTP URL", async () => {
  process.env.VERCEL = "1";
  try {
    const r = await vehicleApi(
      new Request("http://internal.vercel.test/api/vehicles", {
        method: "OPTIONS",
        headers: {
          host: "web-preview.vercel.app",
          origin: "https://web-preview.vercel.app",
        },
      }),
      "inventory",
    );
    assert.equal(r.status, 204);
    assert.equal(
      r.headers.get("access-control-allow-origin"),
      "https://web-preview.vercel.app",
    );
  } finally {
    delete process.env.VERCEL;
  }
});
