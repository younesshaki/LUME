#!/usr/bin/env node
/**
 * Live privacy/correctness probe for anonymous concierge memory isolation.
 *
 * It deliberately uses two independent fetch clients: no cookies, no
 * sessionId on either first request, and startNewSession:true. Client A seeds
 * a BMW/$70k state; client B must receive a different server session and its
 * first Camry filter action must not contain BMW or priceMax. When
 * LUME_CHAT_DEBUG=1 is enabled, the printed session IDs can be grepped in
 * logs/concierge-debug.log to confirm client B's activeFiltersBefore is {}.
 */

const base =
  process.env.CONCIERGE_TEST_BASE_URL ?? "http://localhost:5173/api/chat";
const tenant = process.env.CONCIERGE_TEST_TENANT ?? "demo";

async function sendFirstTurn(text) {
  const response = await fetch(base, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Lume-Tenant": tenant,
      Origin: "http://localhost:5173",
    },
    body: JSON.stringify({
      startNewSession: true,
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!response.ok)
    throw new Error(`chat request failed: HTTP ${response.status}`);
  return parseSse(await response.text());
}

function parseSse(text) {
  let content = "";
  let sessionId;
  const actions = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    const event = JSON.parse(payload);
    if (event.type === "meta") sessionId = event.sessionId;
    else if (event.type === "action") actions.push(event.action);
    else if (event.choices?.[0]?.delta?.content)
      content += event.choices[0].delta.content;
  }
  return { content, sessionId, actions };
}

const first = await sendFirstTurn("show me BMWs under 70k");
const second = await sendFirstTurn("do you have a 2026 Camry?");
const secondFilter = second.actions.find(
  (action) => action?.type === "filter_inventory",
);

if (!first.sessionId || !second.sessionId) {
  throw new Error(
    "one or both anonymous first turns did not receive a server session ID",
  );
}
if (first.sessionId === second.sessionId) {
  throw new Error(
    "independent anonymous clients received the same conversation session ID",
  );
}
if (
  !secondFilter ||
  secondFilter.make === "BMW" ||
  secondFilter.priceMax !== undefined
) {
  throw new Error(
    `second client inherited state: ${JSON.stringify(secondFilter)}`,
  );
}

console.log("✓ anonymous conversation sessions are isolated");
console.log(`  seeded session: ${first.sessionId}`);
console.log(`  fresh session:  ${second.sessionId}`);
console.log(`  fresh action:   ${JSON.stringify(secondFilter)}`);
