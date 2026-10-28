import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Explicit owner provisioning/approval is required BEFORE the first network call.
assert.equal(
  process.env.WEB_PREVIEW_HOSTED_SMOKE_APPROVED,
  "1",
  "Pause for Josh: funded staging Preview, admin key and origin allowlist must be confirmed first",
);
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
  "Set CONCIERGE_EVIDENCE_DIR outside the repository for raw review first",
);
const health = await fetch(new URL(`/vehicles?tenant=${tenant}`, origin), {
  signal: AbortSignal.timeout(20000),
});
assert.equal(health.status, 200);
assert.match(health.headers.get("x-robots-tag"), /noindex/);
const response = await fetch(new URL(`/api/chat?tenant=${tenant}`, origin), {
  method: "POST",
  headers: {
    Origin: origin.origin,
    "X-Lume-Tenant": tenant,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    stream: true,
    startNewSession: true,
    requestId: randomUUID(),
    pagePath: "/vehicles",
    navigation: { hasPrevious: false, hasResults: false },
    messages: [
      {
        role: "user",
        content:
          "Show me your BMW inventory under $50,000. Open the filtered results. Do not submit an inquiry or save anything.",
      },
    ],
  }),
  signal: AbortSignal.timeout(120000),
});
assert.equal(
  response.status,
  200,
  `Chat HTTP ${response.status}; check staging allowlist/provider funding. No success is inferred from a local fixture.`,
);
assert.match(response.headers.get("content-type"), /text\/event-stream/);
let raw = "";
const decoder = new TextDecoder();
for await (const bytes of response.body) {
  raw += decoder.decode(bytes, { stream: true });
  assert.ok(Buffer.byteLength(raw) < 262144, "Unexpectedly large SSE evidence");
}
raw += decoder.decode();
const events = [];
for (const line of raw.split("\n")) {
  if (!line.startsWith("data: ")) continue;
  const data = line.slice(6).trim();
  if (data === "[DONE]") {
    events.push("[DONE]");
    continue;
  }
  const parsed = JSON.parse(data);
  events.push(
    parsed.type ?? (parsed.choices?.[0]?.delta?.content ? "delta" : "other"),
  );
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "provider-turn.sse"), raw);
fs.writeFileSync(
  path.join(out, "provider-report.json"),
  JSON.stringify(
    {
      origin: origin.origin,
      tenant,
      status: response.status,
      fixture: false,
      events,
      headers: Object.fromEntries(
        [
          "content-type",
          "cache-control",
          "x-robots-tag",
          "x-source-categories",
        ].map((k) => [k, response.headers.get(k)]),
      ),
      note: "Actual wire order retained; actions can precede prose. Browser effects wait until the turn finishes. This request only chats; normal staging conversation/usage writes may occur. No lead/save/admin mutation is requested.",
    },
    null,
    2,
  ) + "\n",
);
assert.equal(events[0], "meta");
assert.ok(events.includes("delta"), "No real-provider prose delta");
assert.ok(
  events.includes("action"),
  "No real-provider action: exit gate stays open",
);
assert.ok(!events.includes("error"), "Provider emitted an SSE error");
assert.equal(events.at(-1), "[DONE]");
console.log(
  "PASS real hosted SSE metadata, prose, action and [DONE]; raw evidence recorded without credentials",
);
