import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Local contract double only. Never connects this test to a production database.
const tenants = {
  alpha: {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "alpha",
    name: "Foundation Alpha Motors",
    status: "active",
  },
  beta: {
    id: "00000000-0000-4000-8000-000000000002",
    slug: "beta",
    name: "Foundation Beta Autos",
    status: "active",
  },
  suspended: {
    id: "00000000-0000-4000-8000-000000000003",
    slug: "suspended",
    name: "Suspended Dealer",
    status: "suspended",
  },
};
const calls = [];
const fixture = http.createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  assert.ok(["fixture-anon", "fixture-domain"].includes(req.headers.apikey));
  const url = new URL(req.url, "http://fixture");
  let rows = [];
  if (req.method === "POST" && url.pathname === "/rest/v1/rpc/tenant_by_slug") {
    const slug = JSON.parse(raw).p_slug;
    calls.push(slug);
    rows = tenants[slug] ? [tenants[slug]] : [];
  } else if (
    req.method === "GET" &&
    url.pathname === "/rest/v1/tenant_domains"
  ) {
    assert.equal(req.headers.apikey, "fixture-domain");
    assert.equal(url.searchParams.get("select"), "tenant_id,domain");
    assert.equal(url.searchParams.get("verified"), "eq.true");
    assert.equal(url.searchParams.get("verification_status"), "eq.verified");
    if (url.searchParams.get("domain") === "eq.dealer.fixture.test")
      rows = [{ tenant_id: tenants.beta.id, domain: "dealer.fixture.test" }];
  } else {
    res.writeHead(405).end();
    return;
  }
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(rows));
});
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const fixturePort = fixture.address().port;
const reservation = net.createServer();
await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const root = fileURLToPath(new URL("..", import.meta.url));
const child = spawn(process.execPath, ["scripts/run.mjs", "start"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    WEB_PREVIEW_TEST_MODE: "1",
    WEB_PREVIEW_SUPABASE_URL: `http://127.0.0.1:${fixturePort}`,
    WEB_PREVIEW_SUPABASE_ANON_KEY: "fixture-anon",
    WEB_PREVIEW_SUPABASE_SERVICE_ROLE_KEY: "fixture-domain",
    WEB_PREVIEW_PROJECT_REF: "local-contract-test",
    WEB_PREVIEW_ROOT_DOMAIN: "foundation.test",
    WEB_PREVIEW_DEFAULT_TENANT: "alpha",
    WEB_PREVIEW_CUSTOM_HOSTS: JSON.stringify({
      "dealer.fixture.test": "beta",
      "unverified.fixture.test": "alpha",
    }),
    SUPABASE_SERVICE_ROLE_KEY: "forbidden-production-sentinel",
    R2_SECRET_ACCESS_KEY: "forbidden-r2-sentinel",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (c) => {
  logs += c;
});
child.stderr.on("data", (c) => {
  logs += c;
});
function request(
  path = "/preview",
  host = "127.0.0.1",
  headers = {},
  method = "GET",
) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: { host, ...headers },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body }),
        );
      },
    );
    req.setTimeout(15000, () =>
      req.destroy(new Error("Preview request timed out")),
    );
    req.on("error", reject);
    req.end();
  });
}
const evidence = [];
try {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw new Error("Preview process exited before readiness");
    try {
      const r = await request("/");
      if (r.status === 200) break;
    } catch {}
    if (i === 99) throw new Error("Preview did not become ready");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.match(
    logs,
    /WEB_PREVIEW_ENV_AUDIT:\{"genericProductionBindingCount":0,"testMode":true\}/,
  );
  console.log(
    "PASS actual Next process contains zero generic production/application/token bindings",
  );
  for (const rsc of [false, true]) {
    for (const slug of ["alpha", "beta", "alpha", "beta"]) {
      const before = calls.length;
      const r = await request(
        "/preview",
        `${slug}.foundation.test`,
        rsc ? { RSC: "1" } : {},
      );
      assert.equal(r.status, 200);
      assert.match(r.headers["cache-control"], /no-store/);
      assert.match(r.headers["x-robots-tag"], /noindex/);
      assert.ok(r.body.includes(tenants[slug].name));
      const other = slug === "alpha" ? "beta" : "alpha";
      assert.ok(!r.body.includes(tenants[other].name));
      assert.equal(
        calls.length - before,
        1,
        "metadata and page reuse only their request-local identity load",
      );
      if (rsc) {
        assert.match(r.headers["content-type"], /text\/x-component/);
        assert.ok(r.body.includes('"slug":' + JSON.stringify(slug)));
      } else {
        assert.ok(r.body.includes(`https://${slug}.foundation.test/preview`));
        assert.match(r.body, /<meta name="robots" content="noindex/);
        assert.ok(r.body.includes(`data-testid="tenant-slug">${slug}</dd>`));
      }
      evidence.push({
        kind: rsc ? "Flight" : "HTML",
        tenant: slug,
        status: r.status,
        isolated: true,
        lookups: 1,
      });
      console.log(
        `${rsc ? "Flight" : "HTML"} ${slug}: HTTP ${r.status}; ${tenants[slug].name}; other tenant absent; identity lookups=1`,
      );
    }
  }
  await Promise.all(
    Array.from({ length: 20 }, async (_, i) => {
      const slug = i % 2 ? "alpha" : "beta";
      const r = await request(`/preview?tenant=${slug}`);
      assert.equal(r.status, 200);
      assert.ok(r.body.includes(tenants[slug].name));
      assert.ok(
        !r.body.includes(tenants[slug === "alpha" ? "beta" : "alpha"].name),
      );
    }),
  );
  console.log(
    "PASS alternating HTML and React Flight alpha → beta → alpha → beta; 20 concurrent requests remain isolated",
  );
  const domain = await request("/preview", "dealer.fixture.test");
  assert.equal(domain.status, 200);
  assert.ok(domain.body.includes(tenants.beta.name));
  assert.ok(domain.body.includes("https://dealer.fixture.test/preview"));
  const negatives = [
    ["/preview?tenant=alpha", "attacker.example", {}],
    ["/preview", "missing.foundation.test", {}],
    ["/preview", "nested.alpha.foundation.test", {}],
    ["/preview", "www.foundation.test", {}],
    ["/preview", "unverified.fixture.test", {}],
    ["/preview", "suspended.foundation.test", {}],
    ["/preview?tenant=beta", "alpha.foundation.test", {}],
    ["/preview?tenant=alpha&tenant=beta", "127.0.0.1", {}],
    ["/preview?tenant=alpha", "127.0.0.1", { "x-lume-tenant": "alpha" }],
    [
      "/preview?tenant=alpha",
      "127.0.0.1",
      { "x-forwarded-host": "beta.foundation.test" },
    ],
    ["/preview?tenant=alpha", "forged.vercel.app", {}],
    ["/", "attacker.example", {}],
  ];
  for (const [path, host, h] of negatives) {
    const r = await request(path, host, h);
    assert.equal(r.status, 404);
    assert.match(r.headers["cache-control"], /no-store/);
    assert.ok(
      !r.body.includes(tenants.alpha.name) &&
        !r.body.includes(tenants.beta.name),
    );
  }
  assert.equal(
    (await request("/preview?tenant=alpha", "127.0.0.1", {}, "POST")).status,
    405,
    "no mutating HTTP methods",
  );
  const robots = await request("/robots.txt");
  assert.match(robots.body, /Disallow: \//);
  assert.ok(!logs.includes("forbidden-production-sentinel"));
  const artifacts = new URL("../artifacts/", import.meta.url);
  await mkdir(artifacts, { recursive: true });
  await writeFile(
    new URL("isolation.json", artifacts),
    JSON.stringify(
      {
        source: "LOCAL CONTRACT DOUBLE, not hosted staging",
        evidence,
        concurrentRequests: 20,
        negativeRequests: negatives.length,
        processIsolation: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `PASS verified custom-domain contract; ${negatives.length} forged/unknown selector cases return 404; noindex robots and responses`,
  );
  console.log(
    "Evidence: artifacts/isolation.json (local contract double; real staging validation still requires dedicated bindings)",
  );
} catch (error) {
  console.error("Foundation proof failed:", error.message);
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
}
