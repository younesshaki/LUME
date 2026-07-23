#!/usr/bin/env node
/**
 * Drives real multi-turn conversations against the local concierge through
 * the SAME path a visitor's browser uses (the Vite public-site proxy at
 * :5173, which forwards /api/* to local admin :3100) — not a direct admin
 * call, so CORS/proxy/session behavior matches production exactly.
 *
 * Each scenario is an ordered list of visitor messages sent in one session
 * (a shared sessionId is carried turn to turn, exactly like a real chat).
 * Optional per-turn `expect`/`reject` substrings do a light pass/fail check
 * on the visible bot text. `expectAction`/`rejectAction` check emitted action
 * types so a correct-sounding answer cannot hide a UI no-op.
 *
 * Usage:
 *   node scripts/run-concierge-scenarios.mjs [scenarios-file.mjs]
 *   (defaults to scripts/concierge-scenarios.mjs if no file given)
 *
 * Requires the local dev stack running (see
 * docs/handoff/concierge-autonomous-testing.md) with LUME_CHAT_DEBUG=1 on
 * the admin server so the transcript logger captures full detail alongside
 * this script's own pass/fail summary.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const BASE = process.env.CONCIERGE_TEST_BASE_URL ?? "http://localhost:5173/api/chat";
const TENANT = process.env.CONCIERGE_TEST_TENANT ?? "demo";
// The chat route rate-limits per IP; local scenario runs are all "the same
// visitor" as far as it's concerned, so turns need real spacing or later
// turns 429 and the scenario looks broken when it isn't.
const TURN_DELAY_MS = Number(process.env.CONCIERGE_TEST_TURN_DELAY_MS ?? 3500);
const MAX_RETRIES_ON_429 = 4;
const RETRY_BACKOFF_MS = 12_000;

async function sendTurn(messages, sessionId) {
  const body = { messages };
  if (sessionId) body.sessionId = sessionId;

  for (let attempt = 0; attempt <= MAX_RETRIES_ON_429; attempt += 1) {
    const res = await fetch(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Lume-Tenant": TENANT,
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify(body),
    });
    if (res.status === 429 && attempt < MAX_RETRIES_ON_429) {
      await sleep(RETRY_BACKOFF_MS);
      continue;
    }
    if (!res.ok) {
      return { content: `[HTTP ${res.status}]`, actions: [], sessionId };
    }
    return parseSse(await res.text(), sessionId);
  }
  return { content: "[rate-limited after retries]", actions: [], sessionId };
}

function parseSse(text, fallbackSessionId) {
  let content = "";
  let nextSessionId = fallbackSessionId;
  const actions = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]" || !payload) continue;
    let obj;
    try {
      obj = JSON.parse(payload);
    } catch {
      continue;
    }
    if (obj.type === "meta" && obj.sessionId) nextSessionId = obj.sessionId;
    else if (obj.type === "action") actions.push(obj.action);
    else if (obj.choices?.[0]?.delta?.content) content += obj.choices[0].delta.content;
  }
  return { content, actions, sessionId: nextSessionId };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runScenario(scenario) {
  console.log(`\n${"=".repeat(70)}\nSCENARIO: ${scenario.name}\n${"=".repeat(70)}`);
  const messages = [];
  let sessionId;
  let failures = 0;

  for (const step of scenario.turns) {
    const userText = typeof step === "string" ? step : step.text;
    messages.push({ role: "user", content: userText });
    const { content, actions, sessionId: nextSessionId } = await sendTurn(messages, sessionId);
    sessionId = nextSessionId;
    messages.push({ role: "assistant", content });

    console.log(`\n> ${userText}`);
    console.log(`  BOT: ${content.slice(0, 400)}`);
    if (actions.length > 0) console.log(`  actions: ${JSON.stringify(actions)}`);

    if (typeof step === "object") {
      if (step.expect && !content.toLowerCase().includes(step.expect.toLowerCase())) {
        failures += 1;
        console.log(`  ✗ FAIL: expected content to include "${step.expect}"`);
      }
      if (step.reject && content.toLowerCase().includes(step.reject.toLowerCase())) {
        failures += 1;
        console.log(`  ✗ FAIL: content unexpectedly included "${step.reject}"`);
      }
      const actionTypes = actions.map((action) => action?.type);
      if (step.expectAction && !actionTypes.includes(step.expectAction)) {
        failures += 1;
        console.log(`  ✗ FAIL: expected action type "${step.expectAction}"`);
      }
      if (step.rejectAction && actionTypes.includes(step.rejectAction)) {
        failures += 1;
        console.log(`  ✗ FAIL: action type "${step.rejectAction}" was unexpectedly emitted`);
      }
      if (step.expectActionFields) {
        const matchingAction = actions.find((action) =>
          Object.entries(step.expectActionFields).every(
            ([key, value]) => action?.[key] === value,
          )
        );
        if (!matchingAction) {
          failures += 1;
          console.log(`  ✗ FAIL: no action matched fields ${JSON.stringify(step.expectActionFields)}`);
        }
      }
      if (step.rejectActionFields) {
        const rejectedAction = actions.find((action) =>
          Object.entries(step.rejectActionFields).every(
            ([key, value]) => action?.[key] === value,
          )
        );
        if (rejectedAction) {
          failures += 1;
          console.log(`  ✗ FAIL: an action unexpectedly matched fields ${JSON.stringify(step.rejectActionFields)}`);
        }
      }
    }

    await sleep(TURN_DELAY_MS);
  }

  console.log(`\nsession: ${sessionId}`);
  return { name: scenario.name, failures };
}

async function main() {
  const scenariosPath = process.argv[2]
    ? resolve(process.argv[2])
    : resolve(import.meta.dirname, "concierge-scenarios.mjs");
  const { scenarios } = await import(pathToFileURL(scenariosPath).href);
  const scenarioIndexValue = process.env.CONCIERGE_TEST_SCENARIO_INDEX;
  const scenarioIndex = scenarioIndexValue === undefined
    ? null
    : Number(scenarioIndexValue);
  const scenarioPattern = process.env.CONCIERGE_TEST_SCENARIO_PATTERN;
  const selectedScenarios = scenarioIndex !== null
    ? Number.isSafeInteger(scenarioIndex) && scenarioIndex >= 0 && scenarioIndex < scenarios.length
      ? [scenarios[scenarioIndex]]
      : []
    : scenarioPattern
    ? scenarios.filter((scenario) =>
        scenario.name.toLowerCase().includes(scenarioPattern.toLowerCase())
      )
    : scenarios;
  if (selectedScenarios.length === 0) {
    throw new Error(
      scenarioIndex !== null
        ? `No scenario exists at CONCIERGE_TEST_SCENARIO_INDEX="${scenarioIndexValue}"`
        : `No scenarios matched CONCIERGE_TEST_SCENARIO_PATTERN="${scenarioPattern}"`,
    );
  }

  const results = [];
  for (const scenario of selectedScenarios) {
    results.push(await runScenario(scenario));
  }

  console.log(`\n${"=".repeat(70)}\nSUMMARY\n${"=".repeat(70)}`);
  let totalFailures = 0;
  for (const result of results) {
    totalFailures += result.failures;
    console.log(`${result.failures === 0 ? "✓" : "✗"} ${result.name}${result.failures ? ` (${result.failures} failing check(s))` : ""}`);
  }
  console.log(`\n${results.length} scenarios, ${totalFailures} failing checks total.`);
  process.exit(totalFailures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
