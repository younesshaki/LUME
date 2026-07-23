#!/usr/bin/env node
/**
 * Reads a human-readable concierge transcript out of the raw admin server
 * log (which also contains Next.js request-log noise and lower-level
 * "level":"debug" filter-state lines — this script filters to just
 * "level":"transcript" lines and renders them as a conversation).
 *
 * Requires the admin server to have been run with LUME_CHAT_DEBUG=1.
 *
 * Usage:
 *   node scripts/read-concierge-transcript.mjs <log-file> [--session <id>] [--json] [--tail <n>]
 *
 * Examples:
 *   node scripts/read-concierge-transcript.mjs logs/concierge-debug.log
 *   node scripts/read-concierge-transcript.mjs logs/concierge-debug.log --session 4f16013b-...
 *   node scripts/read-concierge-transcript.mjs logs/concierge-debug.log --tail 20
 *   node scripts/read-concierge-transcript.mjs logs/concierge-debug.log --json | jq .
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const logPath = args.find((a) => !a.startsWith("--"));
const sessionFlagIndex = args.indexOf("--session");
const sessionFilter = sessionFlagIndex >= 0 ? args[sessionFlagIndex + 1] : null;
const tailFlagIndex = args.indexOf("--tail");
const tailCount = tailFlagIndex >= 0 ? Number(args[tailFlagIndex + 1]) : null;
const asJson = args.includes("--json");

if (!logPath) {
  console.error("Usage: node scripts/read-concierge-transcript.mjs <log-file> [--session <id>] [--json] [--tail <n>]");
  process.exit(1);
}

const raw = readFileSync(logPath, "utf8");
const turns = [];
for (const line of raw.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) continue;
  let obj;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    continue;
  }
  if (obj.level !== "transcript") continue;
  if (sessionFilter && obj.sessionId !== sessionFilter) continue;
  turns.push(obj);
}

const selected = tailCount ? turns.slice(-tailCount) : turns;

if (asJson) {
  for (const turn of selected) console.log(JSON.stringify(turn));
  process.exit(0);
}

if (selected.length === 0) {
  console.error(
    sessionFilter
      ? `No transcript turns found for session ${sessionFilter}. Sessions present: ${[...new Set(turns.map((t) => t.sessionId))].join(", ") || "(none)"}`
      : "No transcript turns found. Was the server run with LUME_CHAT_DEBUG=1?",
  );
  process.exit(sessionFilter ? 1 : 0);
}

let lastSession = null;
for (const turn of selected) {
  if (turn.sessionId !== lastSession) {
    console.log(`\n${"=".repeat(70)}\nSESSION ${turn.sessionId}\n${"=".repeat(70)}`);
    lastSession = turn.sessionId;
  }
  console.log(`\n[turn ${turn.turn}] ${turn.at} — source: ${turn.source}`);
  console.log(`> ${turn.userText}`);
  console.log(`  BOT: ${turn.assistantText}`);
  if (Array.isArray(turn.actions) && turn.actions.length > 0) {
    console.log(`  actions: ${JSON.stringify(turn.actions)}`);
  }
  if (Array.isArray(turn.toolCalls) && turn.toolCalls.length > 0) {
    for (const call of turn.toolCalls) {
      console.log(`  tool: ${call.name} -> ${JSON.stringify(call.result).slice(0, 300)}`);
    }
  }
}
console.log();
