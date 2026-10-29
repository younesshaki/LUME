import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { inspectHostedChat } from "./hosted-concierge-outcome.mjs";

// Verification flags are for this operator process, never web runtime bindings.
assert.equal(
  process.env.WEB_PREVIEW_HOSTED_SMOKE_APPROVED,
  "1",
  "Pause for Josh: confirm staging Preview/admin/allowlist before any hosted request",
);
const expectUnfunded = process.env.WEB_PREVIEW_SMOKE_EXPECT_UNFUNDED === "1";
const origin = new URL(process.env.WEB_PREVIEW_SMOKE_ORIGIN ?? "");
assert.ok(
  origin.protocol === "https:" &&
    origin.hostname.startsWith("lume-web") &&
    origin.hostname.endsWith(".vercel.app"),
);
assert.equal(origin.pathname, "/");
assert.ok(
  !origin.search && !origin.hash && !origin.username && !origin.password,
);
const tenant = process.env.WEB_PREVIEW_DEFAULT_TENANT;
assert.ok(tenant && /^[a-z0-9][a-z0-9-]*$/.test(tenant));
const out = process.env.CONCIERGE_EVIDENCE_DIR;
assert.ok(
  out,
  "Set CONCIERGE_EVIDENCE_DIR outside the repository for review first",
);
fs.mkdirSync(out, { recursive: true });
// A unique URL avoids stale intermediary responses immediately after alias
// reassignment. This is an operator diagnostic, never a production cache rule.
const observedAt = new Date().toISOString();
const probeNonce = randomUUID();
const requestUrl = (pathname) => {
  const url = new URL(pathname, origin);
  url.searchParams.set("evidence", probeNonce);
  return url;
};
const report = {
  observedAt,
  probeNonce,
  origin: origin.origin,
  tenant,
  fixture: false,
  expectation: expectUnfunded ? "unfunded" : "funded",
  fundedAnswer: expectUnfunded ? "pending funding" : "not proven",
  cases: [],
  visitor: {},
  browserActionDispatch: "not exercised by this HTTP runner",
  authenticatedVisitorSession:
    "not proven; requires an approved existing visitor session",
};
const save = () =>
  fs.writeFileSync(
    path.join(out, "hosted-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
const headers = {
  Origin: origin.origin,
  "X-Lume-Tenant": tenant,
  "Content-Type": "application/json",
};
const safeHeaders = (h) =>
  Object.fromEntries(
    [
      "content-type",
      "cache-control",
      "x-robots-tag",
      "x-source-categories",
    ].map((k) => [k, h.get(k)]),
  );
const health = await fetch(requestUrl(`/vehicles?tenant=${tenant}`), {
  signal: AbortSignal.timeout(20000),
});
report.health = {
  status: health.status,
  robots: health.headers.get("x-robots-tag"),
};
save();
assert.equal(health.status, 200);
assert.match(health.headers.get("x-robots-tag"), /noindex/);
const readiness = await fetch(requestUrl(`/api/chat?tenant=${tenant}`), {
  headers,
  signal: AbortSignal.timeout(20000),
});
report.chatRoute = { status: readiness.status, expected: 405 };
save();
assert.equal(
  readiness.status,
  405,
  "Chat route is absent or misconfigured; a stale deployment is not an insufficient-balance response",
);
for (const [name, content] of [
  ["server-navigation", "Take me to the products page."],
  [
    "provider-answer",
    "Write one original sentence describing how a pleasant dealership visit feels. Do not navigate, submit an inquiry or save anything.",
  ],
]) {
  const response = await fetch(requestUrl(`/api/chat?tenant=${tenant}`), {
    method: "POST",
    headers,
    body: JSON.stringify({
      stream: true,
      startNewSession: true,
      requestId: randomUUID(),
      pagePath: "/vehicles",
      navigation: { hasPrevious: false, hasResults: false },
      messages: [{ role: "user", content }],
    }),
    signal: AbortSignal.timeout(120000),
  });
  const raw = await response.text();
  assert.ok(Buffer.byteLength(raw) < 262144, "Unexpectedly large response");
  const contentType = response.headers.get("content-type") ?? "";
  const observed = inspectHostedChat({
    status: response.status,
    contentType,
    body: raw,
    expectUnfunded,
  });
  fs.writeFileSync(
    path.join(
      out,
      `${name}.${contentType.includes("text/event-stream") ? "sse" : "response.txt"}`,
    ),
    raw,
  );
  report.cases.push({
    name,
    status: response.status,
    headers: safeHeaders(response.headers),
    ...observed,
  });
  if (name === "provider-answer") report.fundedAnswer = observed.fundedAnswer;
  save();
  assert.ok(
    observed.accepted,
    `Unexpected ${name} response (HTTP ${response.status}); captured separately from expected unfunded failure`,
  );
}
// Anonymous checks need no test visitor, forged token, login, signup, or DB write.
const me = await fetch(requestUrl(`/api/visitor/me?tenant=${tenant}`), {
  headers,
  signal: AbortSignal.timeout(20000),
});
report.visitor.anonymousMeStatus = me.status;
save();
assert.equal(
  me.status,
  401,
  "Anonymous visitor bridge should reach the admin and reject authentication",
);
const logout = await fetch(requestUrl(`/api/visitor/logout?tenant=${tenant}`), {
  method: "POST",
  headers,
  body: "{}",
  signal: AbortSignal.timeout(20000),
});
const cookies = logout.headers.getSetCookie();
report.visitor.logoutStatus = logout.status;
report.visitor.relayedCookieNames = cookies.map((c) => c.split("=", 1)[0]);
report.visitor.onlySessionClearCookie =
  cookies.length === 1 &&
  cookies[0].startsWith("lume_visitor_session=;") &&
  /Max-Age=0/i.test(cookies[0]);
save();
assert.equal(logout.status, 204);
assert.equal(report.visitor.onlySessionClearCookie, true);
if (!expectUnfunded)
  assert.equal(
    report.fundedAnswer,
    "proven",
    "Paid provider completion not proven; deterministic SSE is insufficient",
  );
console.log(
  JSON.stringify({
    expectation: report.expectation,
    fundedAnswer: report.fundedAnswer,
    cases: report.cases.map((c) => ({
      name: c.name,
      status: c.status,
      classification: c.classification,
      events: c.events,
      exactBalanceReasonVisible: c.balanceReasonExplicit,
    })),
    visitor: report.visitor,
    browserActionDispatch: report.browserActionDispatch,
  }),
);
