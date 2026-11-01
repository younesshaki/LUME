import test from "node:test";
import assert from "node:assert/strict";
import { inspectHostedChat } from "../scripts/hosted-concierge-outcome.mjs";
const json = (status, error, expectUnfunded = true) =>
  inspectHostedChat({
    status,
    contentType: "application/json",
    body: JSON.stringify({ error }),
    expectUnfunded,
  });

test("owner-confirmed unfunded runs accept explicit balance rejection, not a funded answer", () => {
  const result = json(402, "Insufficient Balance");
  assert.equal(result.classification, "expected-unfunded-provider-error");
  assert.equal(result.balanceReasonExplicit, true);
  assert.equal(result.completeSse, false);
  assert.equal(result.fundedAnswer, "pending funding");
});
test("the existing sanitized admin 502 is accepted with its evidence limit stated", () => {
  const result = json(502, "AI provider request failed");
  assert.equal(result.accepted, true);
  assert.equal(result.providerReasonSanitized, true);
  assert.equal(result.balanceReasonExplicit, false);
  assert.equal(json(502, "AI provider request failed", false).accepted, false);
});
test("origin, stale route, transport, configuration and quota failures never masquerade as balance", () => {
  for (const [status, error] of [
    [403, "Forbidden origin"],
    [403, "Insufficient balance"],
    [402, "Tenant quota exceeded"],
    [402, "Insufficient quota"],
    [404, "Not found"],
    [502, "Chat service unreachable"],
    [503, "AI provider is not configured"],
    [429, "Rate limited"],
  ])
    assert.equal(json(status, error).accepted, false);
});
test("complete deterministic SSE proves streaming/action frames but cannot prove a funded provider", () => {
  const body =
    'data: {"type":"meta"}\n\ndata: {"type":"action","action":{"type":"navigate","route":"products"}}\n\ndata: {"choices":[{"delta":{"content":"Opening products"}}]}\n\ndata: [DONE]\n\n';
  const result = inspectHostedChat({
    status: 200,
    contentType: "text/event-stream",
    body,
    expectUnfunded: true,
  });
  assert.equal(result.completeSse, true);
  assert.equal(result.actionFrameObserved, true);
  assert.deepEqual(result.events, ["meta", "action", "delta", "[DONE]"]);
  assert.equal(result.fundedAnswer, "pending funding");
  assert.match(
    inspectHostedChat({ status: 200, contentType: "text/event-stream", body })
      .fundedAnswer,
    /not proven/,
  );
  const modelBody = body.replace(
    "data: [DONE]",
    'data: {"type":"timing","timing":{"route":"model"}}\n\ndata: [DONE]',
  );
  assert.equal(
    inspectHostedChat({
      status: 200,
      contentType: "text/event-stream",
      body: modelBody,
    }).fundedAnswer,
    "proven",
  );
  assert.equal(
    inspectHostedChat({
      status: 200,
      contentType: "text/event-stream",
      body: body.replace("data: [DONE]\n\n", ""),
      expectUnfunded: true,
    }).accepted,
    false,
  );
});
