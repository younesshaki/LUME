import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { X509Certificate, createHash } from "node:crypto";
const origin = new URL(
  process.env.WEB_PREVIEW_FORM_TEST_ORIGIN ?? "http://localhost:5173",
);
const local = ["localhost", "127.0.0.1"].includes(origin.hostname);
assert.ok(
  local ||
    (origin.protocol === "https:" && origin.hostname.endsWith(".vercel.app")),
  "Explicit local/isolated Preview origin required",
);
assert.equal(origin.pathname, "/");
assert.ok(
  !origin.search && !origin.hash && !origin.username && !origin.password,
);
if (process.env.WEB_PREVIEW_WRITE_CONSENT_EVIDENCE !== "1")
  throw new Error(
    "This verifier writes two anonymous staging consent events; set WEB_PREVIEW_WRITE_CONSENT_EVIDENCE=1 explicitly. A lead is created only when WEB_PREVIEW_WRITE_LEAD_EVIDENCE=1 is also set.",
  );
const realLead = process.env.WEB_PREVIEW_WRITE_LEAD_EVIDENCE === "1";
const check = await fetch(new URL("/contact?tenant=demo", origin), {
  signal: AbortSignal.timeout(20000),
});
assert.equal(check.status, 200);
assert.match(check.headers.get("x-robots-tag"), /noindex/);
const args = ["--no-sandbox"];
const caPath = "/usr/local/share/ca-certificates/environment-proxy-ca.crt";
if (!local && process.env.HTTPS_PROXY && fs.existsSync(caPath)) {
  const ca = new X509Certificate(fs.readFileSync(caPath));
  args.push(
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256")
        .update(ca.publicKey.export({ type: "spki", format: "der" }))
        .digest("base64"),
  );
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args,
  proxy:
    !local && process.env.HTTPS_PROXY
      ? { server: process.env.HTTPS_PROXY }
      : undefined,
});
const out =
  process.env.CONTENT_FORM_EVIDENCE_DIR ??
  fileURLToPath(new URL("../artifacts/forms", import.meta.url));
fs.mkdirSync(out, { recursive: true });
const evidence = { origin: origin.origin, consent: [], lead: {} };
try {
  const c = await browser.newContext({
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: true,
    reducedMotion: "reduce",
  });
  const p = await c.newPage();
  p.setDefaultTimeout(15000);
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(
    origin +
      "contact?tenant=demo&template=glo3d&theme=light&utm_source=phase3-browser-check",
    { waitUntil: "load", timeout: 45000 },
  );
  await p
    .getByRole("dialog", { name: "Cookie consent", exact: true })
    .waitFor();
  for (const choice of ["rejected", "accepted"]) {
    if (choice === "accepted") {
      await p.reload({ waitUntil: "load" });
      assert.equal(
        await p.getByRole("dialog", { name: "Cookie consent" }).count(),
        0,
      );
      await p
        .getByRole("button", { name: "Cookie preferences", exact: true })
        .click();
    }
    const pending = p.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/consent" &&
        r.request().method() === "POST",
    );
    await p
      .getByRole("button", {
        name: choice === "rejected" ? "Essential only" : "Accept analytics",
        exact: true,
      })
      .click();
    const r = await pending;
    const body = await r.json();
    evidence.consent.push({ choice, status: r.status(), body });
    assert.equal(r.status(), 201, JSON.stringify(body));
    const storage = JSON.parse(
      await p.evaluate(() => localStorage.getItem("lume-cookie-consent")),
    );
    assert.equal(storage.choice, choice);
    assert.equal(storage.version, 1);
  }
  evidence.consentStorage = JSON.parse(
    await p.evaluate(() => localStorage.getItem("lume-cookie-consent")),
  );
  let submitted, tenantHeader;
  if (!realLead)
    await p.route("**/api/leads?*", async (route) => {
      submitted = route.request().postDataJSON();
      tenantHeader = route.request().headers()["x-lume-tenant"];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: '{"leadId":"local-contract-fixture"}',
      });
    });
  await p.getByLabel("First name", { exact: true }).fill("Phase3");
  await p.getByLabel("Last name", { exact: true }).fill("Contract");
  await p
    .getByLabel("Email", { exact: true })
    .fill("phase3-contract@example.invalid");
  await p
    .getByLabel("How can we help?", { exact: true })
    .fill(
      realLead
        ? "Automated Phase 3 STAGING verification. No real inquiry; no follow-up needed."
        : "Browser contract fixture; no remote lead or notification is created.",
    );
  const pendingLead = p.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/leads" &&
      r.request().method() === "POST",
  );
  await p.getByRole("button", { name: "Submit request", exact: true }).click();
  const receipt = await pendingLead;
  const receiptBody = await receipt.json();
  assert.equal(receipt.status(), 201, JSON.stringify(receiptBody));
  submitted = receipt.request().postDataJSON();
  tenantHeader = receipt.request().headers()["x-lume-tenant"];
  await p
    .getByText("Request received. The dealership will follow up with you.", {
      exact: true,
    })
    .waitFor();
  assert.equal(submitted.source, "contact-form");
  assert.equal(submitted.utmSource, "phase3-browser-check");
  assert.equal(tenantHeader, "demo");
  await p.screenshot({
    path: path.join(
      out,
      realLead
        ? "form-success-hosted-staging.jpg"
        : "form-success-contract-fixture.jpg",
    ),
    type: "jpeg",
    quality: 78,
    fullPage: true,
  });
  await p.unroute("**/api/leads?*");
  const validation = await p.evaluate(async () => {
    const r = await fetch("/api/leads?tenant=demo", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Lume-Tenant": "demo" },
      body: "{}",
    });
    return { status: r.status, body: await r.json() };
  });
  assert.equal(validation.status, 400, JSON.stringify(validation));
  evidence.lead = {
    browserSuccessContractFixture: !realLead,
    remoteLeadCreated: realLead,
    receipt: { status: receipt.status(), body: receiptBody },
    tenantHeader,
    source: submitted.source,
    utmSource: submitted.utmSource,
    actualStagingValidation: validation,
  };
  assert.deepEqual(errors, []);
  evidence.browserErrors = errors;
  fs.writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(
    `PASS consent reject/accept/reopen/refresh with staging 201 receipts; lead ${realLead ? "actually created on staging" : "fixture"} with 201 receipt; invalid lead 400.`,
  );
} catch (error) {
  fs.writeFileSync(
    path.join(out, "partial-report.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.error(error);
  throw error;
} finally {
  const timer = setTimeout(() => process.exit(1), 10000);
  await browser.close();
  clearTimeout(timer);
}
