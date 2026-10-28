import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { JSDOM } from "jsdom";
import { DEFAULT_PAGES } from "@lume/blocks";
import { getSiteTemplate, normalizeSiteDesign } from "@lume/types";

// LOCAL deterministic integration proof, never a provider/funded-staging claim.
const web = fileURLToPath(new URL("..", import.meta.url));
assert.ok(
  fs.existsSync(path.join(web, ".next/BUILD_ID")),
  "Complete the web build before browser verification",
);
const out =
  process.env.CONCIERGE_EVIDENCE_DIR ?? path.join(web, "artifacts/concierge");
fs.mkdirSync(out, { recursive: true });
const alpha = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const beta = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];
const rows = ids.map((id, i) => ({
  id,
  tenant_id: i === 3 ? beta : alpha,
  status: "live",
  year: 2024,
  make: i < 2 ? "BMW" : "Audi",
  model: ["X5", "i4", "A4", "Foreign private fixture"][i],
  price: [50000, 40000, 25000, 1][i],
  mileage: 1000 + i,
  body_style: "Sedan",
  stock_type: "Used",
  fuel_type: "Gasoline",
  drivetrain: "AWD",
  image_src: "",
  catalog_version: 1,
}));
const databaseReads = [];
const fixture = http.createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const u = new URL(req.url, "http://fixture");
  const body = raw ? JSON.parse(raw) : {};
  assert.equal(req.headers.apikey, "fixture-anon");
  databaseReads.push({ path: u.pathname, query: u.search });
  let data = [];
  if (u.pathname.endsWith("/tenant_by_slug"))
    data = ["alpha", "beta"].includes(body.p_slug)
      ? [
          {
            id: body.p_slug === "alpha" ? alpha : beta,
            slug: body.p_slug,
            name: `${body.p_slug} Motors`,
            status: "active",
          },
        ]
      : [];
  else if (u.pathname.endsWith("/get_tenant_theme"))
    data = [{ theme: normalizeSiteDesign({}, getSiteTemplate("luxury")) }];
  else if (u.pathname.endsWith("/get_published_page")) {
    const page = DEFAULT_PAGES.find((p) => p.slug === body.p_slug);
    data = page
      ? [
          {
            id: `fixture-${page.slug}`,
            slug: page.slug,
            title: page.title,
            seo_meta: page.seoMeta,
            blocks: page.blocks,
            published_revision_id: "fixture-published",
          },
        ]
      : [];
  } else if (
    u.pathname.endsWith("/vehicles") ||
    u.pathname.endsWith("/public_vehicle_inventory")
  ) {
    const tenant =
      u.searchParams.get("tenant_id")?.slice(3) ??
      u.searchParams.get("p_tenant_id");
    data = rows.filter((r) => r.tenant_id === tenant);
    const id = u.searchParams.get("id")?.slice(3),
      make = u.searchParams.get("make")?.slice(3);
    if (id) data = data.filter((r) => r.id === id);
    if (make) data = data.filter((r) => r.make === make);
    const max = u.searchParams
      .getAll("price")
      .find((v) => v.startsWith("lte."));
    if (max) data = data.filter((r) => r.price <= Number(max.slice(4)));
    if (u.searchParams.get("order")?.startsWith("price.asc"))
      data.sort((a, b) => a.price - b.price);
    res.setHeader(
      "Content-Range",
      `0-${Math.max(0, data.length - 1)}/${data.length}`,
    );
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const reservation = net.createServer();
await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["scripts/run.mjs", "start"], {
  cwd: web,
  env: {
    ...process.env,
    PORT: String(port),
    WEB_PREVIEW_TEST_MODE: "1",
    WEB_PREVIEW_PROJECT_REF: "local-concierge-fixture",
    WEB_PREVIEW_SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`,
    WEB_PREVIEW_SUPABASE_ANON_KEY: "fixture-anon",
    WEB_PREVIEW_SUPABASE_SERVICE_ROLE_KEY: "",
    WEB_PREVIEW_DEFAULT_TENANT: "alpha",
    WEB_PREVIEW_UPSTREAM_ORIGIN: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (c) => (logs += c));
child.stderr.on("data", (c) => (logs += c));
let browser;
const report = {
  source:
    "Local synthetic tenant/vehicle/RPC fixtures and browser-intercepted SSE/lead receipts. NO real provider, remote data or staging writes.",
  remoteProviderProven: false,
  checks: [],
  turns: [],
  leads: [],
  databaseReads,
};
try {
  for (let n = 0; n < 150; n++) {
    try {
      if ((await fetch(origin + "/robots.txt")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(logs.includes("Ready"), "Next failed to start: " + logs);
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(() =>
    localStorage.setItem("lume-cookie-consent", "rejected"),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Nothing may escape the local app/data server during this proof.
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.fallback()
      : route.abort(),
  );
  let nextAction = null,
    failTurn = false,
    truncatedTurn = false,
    duplicateTurn = false,
    failLead = false;
  await page.route("**/api/chat", async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    assert.equal(request.headers()["x-lume-tenant"], "alpha");
    const events = [
      {
        type: "meta",
        sourceCategories: ["inventory"],
        botName: "Local fixture",
        sessionId: "local-session",
        capabilities: { actions: true },
      },
      { choices: [{ delta: { content: "Local fixture response complete." } }] },
      { type: "action", action: nextAction },
    ];
    if (duplicateTurn) events.push({ type: "duplicate" });
    if (failTurn)
      events.push({ type: "error", message: "Fixture interrupted turn" });
    const sse =
      events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
      (failTurn || truncatedTurn ? "" : "data: [DONE]\n\n");
    report.turns.push({
      request: body,
      action: nextAction,
      streamEvents: events
        .map((e) => e.type ?? "delta")
        .concat(failTurn || truncatedTurn ? [] : ["[DONE]"]),
    });
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sse,
    });
  });
  await page.route("**/api/leads?*", async (route) => {
    const body = route.request().postDataJSON();
    assert.equal(route.request().headers()["x-lume-tenant"], "alpha");
    report.leads.push({
      body,
      status: failLead ? 400 : 201,
      fixtureReceipt: true,
    });
    await route.fulfill({
      status: failLead ? 400 : 201,
      contentType: "application/json",
      body: JSON.stringify(
        failLead
          ? { error: "Fixture verification required" }
          : { leadId: "local-lead-fixture" },
      ),
    });
  });
  async function ask(action, text = "Local action fixture") {
    nextAction = action;
    await page
      .getByRole("button", { name: "Ask the concierge", exact: true })
      .click();
    await page.getByLabel("Message the concierge").fill(text);
    await page.getByRole("button", { name: "Send", exact: true }).click();
  }
  async function landed(pathname) {
    await page.waitForURL((u) => u.pathname === pathname);
    await page.waitForFunction(
      () =>
        JSON.parse(sessionStorage.getItem("lume.in-app-history.v1") ?? "[]").at(
          -1,
        ) ===
        location.pathname + location.search,
    );
    assert.equal(new URL(page.url()).searchParams.get("tenant"), "alpha");
  }
  await page.goto(origin + `/vehicles/${ids[0]}?tenant=alpha`);
  await ask({
    type: "filter_inventory",
    make: "BMW",
    priceMax: 50000,
    sort: "price_asc",
  });
  await landed("/vehicles");
  assert.equal(
    await page.getByLabel("Make", { exact: true }).inputValue(),
    "BMW",
  );
  await ask({ type: "filter_inventory", make: "Audi", priceMax: 30000 });
  await page.waitForURL(
    (u) => u.pathname === "/vehicles" && u.searchParams.get("make") === "Audi",
  );
  await landed("/vehicles");
  await page.reload();
  await landed("/vehicles");
  assert.equal(
    await page.getByLabel("Make", { exact: true }).inputValue(),
    "Audi",
  );
  assert.equal(
    await page.getByRole("link", { name: /2024 Audi A4/ }).count(),
    1,
  );
  assert.equal(await page.getByRole("link", { name: /BMW X5/ }).count(), 0);
  const filtered = new URL(page.url());
  const filteredResponse = await fetch(filtered);
  const filteredHtml = await filteredResponse.text();
  assert.equal(filteredResponse.status, 200);
  assert.equal(
    new JSDOM(filteredHtml).window.document.querySelector('input[name="make"]')
      .value,
    "Audi",
  );
  fs.writeFileSync(path.join(out, "filtered-refresh.html"), filteredHtml);
  report.checks.push(
    "Query-only BMW→Audi transitions recorded; refresh retains Audi/price URL, form state and tenant-scoped SSR results.",
  );
  await page.getByRole("link", { name: /2024 Audi A4/ }).click();
  await ask({ type: "navigate-back", destination: "results" });
  await landed("/vehicles");
  assert.equal(new URL(page.url()).searchParams.get("make"), "Audi");
  await ask({ type: "navigate-back", destination: "previous" });
  await landed("/vehicles");
  assert.equal(new URL(page.url()).searchParams.get("make"), "BMW");
  await ask({ type: "navigate", route: "products" });
  await landed("/products");
  await ask({ type: "navigate-back", destination: "results" });
  await landed("/vehicles");
  assert.equal(new URL(page.url()).searchParams.get("make"), "BMW");
  report.checks.push(
    "VDP→results, repeated previous, products→last results; tenant and original filters retained without history.back().",
  );
  await ask({ type: "compare_vehicles", vehicleIds: ids.slice(0, 2) });
  await landed("/vehicles/compare");
  await page
    .getByRole("heading", { name: "Compare vehicles", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("table").getByRole("link").count(), 2);
  const comparisonHtml = await (await fetch(page.url())).text();
  const doc = new JSDOM(comparisonHtml).window.document;
  assert.equal(doc.querySelectorAll("h1").length, 1);
  assert.ok(doc.querySelector("table").textContent.includes("BMW i4"));
  fs.writeFileSync(path.join(out, "comparison.html"), comparisonHtml);
  await page.screenshot({
    path: path.join(out, "comparison-mobile.jpg"),
    fullPage: true,
  });
  for (const query of [
    `ids=${ids[0]},${ids[3]}&tenant=alpha`,
    `ids=${ids[0]},${ids[1]}&tenant=beta`,
    `ids=${ids[0]}&tenant=alpha`,
    `ids=${ids[0]},${ids[1]}&tenant=unknown`,
  ]) {
    const r = await fetch(origin + "/vehicles/compare?" + query);
    assert.equal(r.status, 404, query);
    assert.ok(!(await r.text()).includes("Foreign private fixture"));
  }
  report.checks.push(
    "Comparison server HTML contains two scoped vehicles/specs and one h1; foreign tenant/UUID, unknown tenant and malformed selection return 404.",
  );
  await ask({
    type: "open-lead-form",
    prefill: {
      firstName: "Local",
      email: "local@example.invalid",
      unexpected: "discard",
    },
    vehicleId: ids[0],
    attribution: {
      sessionId: "local-session",
      targetKey: "contact-lead-form",
      conversationContext: "Local test only",
    },
  });
  await landed("/contact");
  await page.waitForFunction(
    () =>
      document.querySelector('input[autocomplete="given-name"]').value ===
      "Local",
  );
  await page.getByLabel("Phone", { exact: true }).fill("555-0100");
  await page
    .getByRole("button", { name: "Submit request", exact: true })
    .click();
  await page
    .getByText("Request received. The dealership will follow up with you.", {
      exact: true,
    })
    .waitFor();
  const submitted = report.leads.at(-1).body;
  assert.equal(submitted.email, "local@example.invalid");
  assert.equal(submitted.phone, "555-0100");
  assert.equal(submitted.vehicleId, ids[0]);
  assert.equal(submitted.source, "chat");
  assert.equal(submitted.sourceContext.chatSessionId, "local-session");
  assert.equal(submitted.unexpected, undefined);
  assert.ok(!page.url().includes("example.invalid"));
  assert.equal(
    await page.evaluate(() =>
      sessionStorage.getItem("lume.web.pending-lead.v1.alpha"),
    ),
    null,
  );
  report.checks.push(
    "Open-lead-form crosses routes, consumes tenant-scoped prefill once, accepts visitor edits and posts existing attribution contract; no PII in URL.",
  );
  await ask({
    type: "capture_lead",
    contact: { email: "capture@example.invalid" },
    vehicleId: ids[0],
    attribution: { sessionId: "local-session" },
  });
  await page
    .getByText("Your details were sent to the dealership.", { exact: true })
    .waitFor();
  assert.equal(
    report.leads.at(-1).body.sourceContext.actionType,
    "capture_lead",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const target = {
    type: "navigate-target",
    targetKey: "contact-lead-form",
    target: {
      key: "contact-lead-form",
      label: "Contact",
      kind: "form",
      destination: "/contact#concierge-lead-form",
      isConversion: true,
    },
    params: { firstName: "Target", email: "target@example.invalid" },
  };
  await ask(target);
  await page.waitForFunction(
    () =>
      document.querySelector('input[autocomplete="given-name"]').value ===
      "Target",
  );
  const modal = {
    ...target,
    targetKey: "vehicle-inquiry",
    target: {
      ...target.target,
      key: "vehicle-inquiry",
      kind: "modal",
      destination: "/vehicles/:vehicleId#vehicle-inquiry",
    },
    params: {
      vehicleId: ids[1],
      firstName: "Modal",
      email: "modal@example.invalid",
    },
  };
  await ask(modal);
  await landed(`/vehicles/${ids[1]}`);
  const inquiry = page.getByRole("dialog", { name: /Inquiry for 2024 BMW i4/ });
  await inquiry.waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector(
        '#vehicle-inquiry input[autocomplete="given-name"]',
      ).value === "Modal",
  );
  await inquiry
    .getByRole("button", { name: "Submit request", exact: true })
    .click();
  await inquiry
    .getByText("Request received. The dealership will follow up with you.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    report.leads.at(-1).body.sourceContext.targetKey,
    "vehicle-inquiry",
  );
  assert.equal(report.leads.at(-1).body.vehicleId, ids[1]);
  await page.screenshot({
    path: path.join(out, "vehicle-inquiry-mobile.jpg"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Close inquiry", exact: true })
    .click();
  report.checks.push(
    "capture_lead gets a visible fixture receipt; navigate-target form activates on the same route, and modal navigates first then opens/prefills the vehicle inquiry.",
  );
  await page.evaluate(() => {
    const form = document.createElement("form");
    form.id = "custom-form";
    form.innerHTML = '<label>Custom fixture<input name="fixture"></label>';
    document.body.append(form);
    const dialog = document.createElement("dialog");
    dialog.id = "custom-modal";
    dialog.innerHTML =
      '<label>Custom modal fixture<input name="fixture"></label>';
    document.body.append(dialog);
  });
  const nativeTarget = {
    ...target,
    targetKey: "custom",
    params: {},
    target: {
      key: "custom",
      label: "Custom",
      kind: "form",
      destination: `/vehicles/${ids[1]}#custom-form`,
      isConversion: true,
    },
  };
  await ask(nativeTarget);
  await page.waitForFunction(
    () => document.activeElement?.closest("#custom-form") !== null,
  );
  await ask({
    ...nativeTarget,
    target: {
      ...nativeTarget.target,
      kind: "modal",
      destination: `/vehicles/${ids[1]}#custom-modal`,
    },
  });
  await page.waitForFunction(
    () => document.querySelector("#custom-modal")?.open === true,
  );
  await page.evaluate(() => document.querySelector("#custom-modal").close());
  report.checks.push(
    "Custom registered native form/modal IDs activate after navigation; no arbitrary selector execution.",
  );
  failLead = true;
  await ask({ type: "capture_lead", contact: { phone: "555-0199" } });
  await page
    .getByRole("alert")
    .getByText("Fixture verification required", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  failLead = false;
  failTurn = true;
  const before = { url: page.url(), leads: report.leads.length };
  await ask({ type: "navigate", route: "products" });
  await page
    .getByRole("alert")
    .getByText("Fixture interrupted turn", { exact: true })
    .waitFor();
  assert.equal(page.url(), before.url);
  assert.equal(report.leads.length, before.leads);
  report.checks.push(
    "Upstream lead validation is visible; interrupted SSE turn does not apply buffered navigation or mutations.",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  failTurn = false;
  truncatedTurn = true;
  const beforeTruncated = report.leads.length;
  await ask({
    type: "capture_lead",
    contact: { email: "truncated@example.invalid" },
  });
  await page
    .getByRole("alert")
    .getByText("Chat stream ended before completion", { exact: true })
    .waitFor();
  assert.equal(report.leads.length, beforeTruncated);
  report.checks.push(
    "Truncated SSE without [DONE] cannot submit a lead, even after a valid action frame.",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  truncatedTurn = false;
  duplicateTurn = true;
  const beforeDuplicate = report.leads.length;
  await ask({
    type: "capture_lead",
    contact: { email: "duplicate@example.invalid" },
  });
  await page.waitForFunction(
    () => document.querySelector(".concierge__send")?.textContent === "Send",
  );
  assert.equal(report.leads.length, beforeDuplicate);
  report.checks.push(
    "A duplicate SSE turn clears buffered conversion actions and cannot create another lead.",
  );
  assert.deepEqual(errors, []);
  report.browserErrors = errors;
  fs.writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `PASS ${report.checks.length} browser journeys; ${report.turns.length} local SSE turns; no provider requests or staging writes. Evidence: ${out}`,
  );
} catch (error) {
  fs.writeFileSync(
    path.join(out, "partial-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  throw error;
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  fixture.closeAllConnections();
  await new Promise((r) => fixture.close(r));
}
