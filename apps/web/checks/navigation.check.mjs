import test from "node:test";
import assert from "node:assert/strict";
import {
  recordInAppPath,
  inAppHistoryFor,
  rewindInAppPath,
} from "../components/concierge/inAppHistory.ts";
import { resolveActionOutcome } from "../components/concierge/conciergeActions.ts";
import { tenantHref, publicPath } from "../components/concierge/publicPath.ts";
import {
  queueLeadForm,
  pendingLeadForm,
} from "../components/concierge/pendingLeadForm.ts";
import { submitPublicLead } from "../components/concierge/submitLead.ts";

function tab(t, blocked = false) {
  const original = globalThis.window;
  const data = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem(k) {
        if (blocked) throw Error("blocked");
        return data.get(k) ?? null;
      },
      setItem(k, v) {
        if (blocked) throw Error("blocked");
        data.set(k, v);
      },
      removeItem(k) {
        data.delete(k);
      },
    },
    dispatchEvent() {},
  };
  t.after(() => {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  });
  return data;
}

test("filter transitions, refresh deduplication and repeated back operations retain real search state", (t) => {
  tab(t);
  const history = inAppHistoryFor("alpha");
  const results = [
    "/vehicles?make=BMW&priceMax=50000&tenant=alpha",
    "/vehicles?make=Audi&tenant=alpha",
  ];
  recordInAppPath("/products?tenant=alpha");
  for (const path of results) recordInAppPath(path);
  recordInAppPath(results[1]); // reload must not add a second entry
  assert.equal(history.previous(), results[0]);
  recordInAppPath(
    "/vehicles/11111111-1111-4111-8111-111111111111?tenant=alpha",
  );
  const back = resolveActionOutcome(
    { type: "navigate-back", destination: "results" },
    history,
  );
  assert.equal(back.href, results[1]);
  rewindInAppPath(back.href);
  recordInAppPath(back.href);
  assert.equal(history.previous(), results[0]);
  rewindInAppPath(history.previous());
  assert.equal(history.previous(), "/products?tenant=alpha");
});

test("history ignores forged stored paths, other tenant selectors, and non-results prefixes", (t) => {
  const storage = tab(t);
  storage.set(
    "lume.in-app-history.v1",
    JSON.stringify([
      "//evil.test",
      "/%61dmin",
      "/vehicles?tenant=beta",
      "/vehicles-extra",
      "/products?tenant=alpha",
    ]),
  );
  assert.equal(inAppHistoryFor("alpha").lastResults(), null);
  assert.equal(inAppHistoryFor("alpha").previous(), "/vehicles-extra");
  assert.equal(
    tenantHref("/vehicles?make=BMW&tenant=beta", "alpha"),
    "/vehicles?make=BMW&tenant=alpha",
  );
  for (const path of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/api/leads",
    "/%61dmin",
    "/vehicles/%2fprivate",
  ])
    assert.equal(publicPath(path), null);
});

test("blocked storage falls back to safe inventory rather than browser history", (t) => {
  tab(t, true);
  recordInAppPath("/contact");
  assert.deepEqual(
    resolveActionOutcome(
      { type: "navigate-back", destination: "previous" },
      inAppHistoryFor("alpha"),
    ),
    { kind: "navigate", href: "/vehicles", replace: true },
  );
});

test("prefill is one-shot, tenant/path/handler scoped, survives a remount and expires", (t) => {
  const data = tab(t);
  const request = {
    path: "/contact",
    handlerId: "concierge-lead-form",
    input: { firstName: "Fixture", email: "fixture@example.invalid" },
  };
  queueLeadForm("alpha", request);
  assert.equal(pendingLeadForm("beta", "/contact", request.handlerId), null);
  assert.equal(pendingLeadForm("alpha", "/products", request.handlerId), null);
  assert.equal(pendingLeadForm("alpha", "/contact", "vehicle-inquiry"), null);
  assert.deepEqual(
    pendingLeadForm("alpha", "/contact", request.handlerId, true),
    request,
  );
  assert.equal(pendingLeadForm("alpha", "/contact", request.handlerId), null);
  queueLeadForm("alpha", request);
  data.set(
    "lume.web.pending-lead.v1.alpha",
    JSON.stringify({ request, expires: 1 }),
  );
  assert.equal(pendingLeadForm("alpha", "/contact", request.handlerId), null);
  assert.equal(data.has("lume.web.pending-lead.v1.alpha"), false);
});

test("prefill still works once when tab storage is blocked", (t) => {
  tab(t, true);
  const request = {
    path: "/contact",
    handlerId: "concierge-lead-form",
    input: { firstName: "Fixture" },
  };
  queueLeadForm("alpha", request);
  assert.deepEqual(
    pendingLeadForm("alpha", "/contact", request.handlerId, true),
    request,
  );
  assert.equal(pendingLeadForm("alpha", "/contact", request.handlerId), null);
});

test("lead transport preserves cookies/tenant/attribution, duplicate success and visible validation failure", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ leadId: "fixture-duplicate" }, { status: 200 });
  };
  const input = {
    email: "fixture@example.invalid",
    source: "chat",
    sourceContext: {
      trigger: "bot-action",
      actionType: "capture_lead",
      chatSessionId: "local-session",
    },
  };
  assert.equal(
    (await submitPublicLead("alpha", input)).leadId,
    "fixture-duplicate",
  );
  assert.equal(calls[0].url, "/api/leads?tenant=alpha");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.headers["X-Lume-Tenant"], "alpha");
  assert.deepEqual(
    JSON.parse(calls[0].options.body).sourceContext,
    input.sourceContext,
  );
  globalThis.fetch = async () =>
    Response.json({ error: "Verification required" }, { status: 400 });
  await assert.rejects(
    submitPublicLead("alpha", input),
    /Verification required/,
  );
});
