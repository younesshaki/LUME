import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const id = "11111111-1111-4111-8111-111111111111";
const tenants = {
  alpha: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    slug: "alpha",
    name: "Alpha Motors",
    status: "active",
  },
  beta: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    slug: "beta",
    name: "Beta Cars",
    status: "active",
  },
};
const row = {
  id,
  tenant_id: tenants.alpha.id,
  status: "live",
  year: 2024,
  make: "Fixture",
  model: "Alpha-only vehicle",
  price: 50000,
  mileage: null,
  image_src: "",
  feed_image_urls: [],
};
let galleryReads = 0;
const fixture = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://fixture");
  let body = "";
  for await (const c of req) body += c;
  assert.equal(req.headers.apikey, "fixture-anon");
  let rows = [];
  if (url.pathname.endsWith("/tenant_by_slug"))
    rows = tenants[JSON.parse(body).p_slug]
      ? [tenants[JSON.parse(body).p_slug]]
      : [];
  else if (url.pathname.endsWith("/vehicles")) {
    assert.equal(url.searchParams.get("status"), "eq.live");
    assert.equal(url.searchParams.get("id"), `eq.${id}`);
    rows =
      url.searchParams.get("tenant_id") === `eq.${tenants.alpha.id}`
        ? [row]
        : [];
  } else if (url.pathname.endsWith("/vehicle_images")) {
    assert.equal(url.searchParams.get("tenant_id"), `eq.${tenants.alpha.id}`);
    galleryReads++;
  } else if (!url.pathname.endsWith("/get_public_vehicle_price_signal")) {
    res.writeHead(405).end();
    return;
  }
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(rows));
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const reservation = http.createServer();
await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
const child = spawn(process.execPath, ["scripts/run.mjs", "start"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    WEB_PREVIEW_TEST_MODE: "1",
    WEB_PREVIEW_SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`,
    WEB_PREVIEW_SUPABASE_ANON_KEY: "fixture-anon",
    WEB_PREVIEW_PROJECT_REF: "local-contract",
    WEB_PREVIEW_ROOT_DOMAIN: "vehicles.fixture.test",
    WEB_PREVIEW_DEFAULT_TENANT: "alpha",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (c) => (logs += c));
child.stderr.on("data", (c) => (logs += c));
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      await fetch(`http://127.0.0.1:${port}/robots.txt`);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert.ok(ready, "Next production server starts");
  const evidence = [];
  async function request(tenant, api = false, flight = false) {
    const path = `${api ? "/api" : ""}/vehicles/${id}`;
    const r = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          headers: {
            Host: `${tenant}.vehicles.fixture.test`,
            ...(flight ? { RSC: "1" } : {}),
          },
        },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () =>
            resolve({ status: res.statusCode, headers: res.headers, body }),
          );
        },
      );
      req.on("error", reject);
      req.setTimeout(15000, () =>
        req.destroy(new Error("Fixture request timeout")),
      );
      req.end();
    });
    const text = r.body;
    // Next's Flight protocol streams a 404 error digest with HTTP 200.
    // Document/JSON requests must be real HTTP 404s; all three must omit foreign data.
    const expected = tenant === "alpha" || flight ? 200 : 404;
    assert.equal(r.status, expected);
    if (tenant === "beta" && flight)
      assert.match(text, /NEXT_HTTP_ERROR_FALLBACK;404/);
    assert.match(r.headers["cache-control"], /no-store/);
    assert.equal(text.includes("Alpha-only vehicle"), tenant === "alpha");
    if (tenant !== "alpha") assert.ok(!text.includes('"price":50000'));
    evidence.push({
      tenant,
      transport: api ? "JSON" : flight ? "Flight" : "HTML",
      status: r.status,
      containsAlphaVehicle: text.includes("Alpha-only vehicle"),
    });
  }
  for (const t of ["alpha", "beta", "alpha", "beta"]) {
    await request(t);
    await request(t, true);
    await request(t, false, true);
  }
  await Promise.all(
    Array.from({ length: 24 }, (_, i) =>
      request(i % 2 ? "beta" : "alpha", i % 3 === 0, i % 3 === 1),
    ),
  );
  assert.equal(
    galleryReads,
    evidence.filter((e) => e.tenant === "alpha").length,
  );
  await mkdir(`${root}/artifacts`, { recursive: true });
  await writeFile(
    `${root}/artifacts/vehicle-isolation.json`,
    JSON.stringify(
      { fixtureOnly: true, stagingRowsWritten: 0, evidence, galleryReads },
      null,
      2,
    ),
  );
  console.log(
    `PASS ${evidence.length} alternating/concurrent HTML, Flight and JSON requests: alpha 200, active beta document/JSON 404 (Flight 200 with 404 digest); no foreign vehicle content; gallery queried only after visibility (${galleryReads} reads).`,
  );
  console.log(
    "Two active tenants are LOCAL deterministic fixtures. Staging remains demo only; no remote tenant was created.",
  );
} catch (e) {
  console.error(logs.slice(-3000));
  throw e;
} finally {
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
  await new Promise((r) => fixture.close(r));
}
