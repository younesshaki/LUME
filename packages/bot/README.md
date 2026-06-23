# @lume/bot

Server-side bot tool-calling for LUME: a registry of tools the chat model can
invoke, the value-scoring heuristic behind "best deal" answers, a multi-step
runner, and the thin adapter between the DeepSeek/OpenAI tool-calling API and
the runner.

Depends only on `@lume/types` + `zod`. **Data access is injected** via
`BotToolContext`, so the package is fully unit-testable without a database and
carries no Supabase dependency.

> Status: **dormant** — nothing imports this at runtime yet. Wiring it into
> `apps/admin/app/api/chat/route.ts` is SCRUM-144 (I-1).

## Tools

| Tool | Purpose |
|---|---|
| `find_vehicles` | Search inventory by make/model/price/year/etc.; emits `filter_inventory` |
| `find_best_deal` | Rank candidates by `dealScore`; highlights the top value |
| `get_vehicle_details` | Fetch one vehicle by id; highlights it |
| `compare_vehicles` | Score 2–4 vehicles against each other; highlights the best value |

## Surface

- `toToolSpecs()` → DeepSeek/OpenAI `tools` array (via a hand-rolled
  `zodToJsonSchema`).
- `parseToolCalls(raw)` → normalise the model's `tool_calls` into `ToolCall[]`.
- `runToolCalls(calls, ctx, opts?)` → execute a turn; returns steps, aggregated
  UI `actions`, summaries, `ok`, `truncated`. Capped at `DEFAULT_MAX_STEPS`.
- `runBotTool(name, rawArgs, ctx)` → validate + execute a single tool; never
  throws (schema/runtime failures become structured `BotToolResult` errors).
- `toToolResultMessages(steps)` → `role: "tool"` messages to feed back to the model.
- `dealScore` / `buildMarketContext` / `rankByDealScore` → pure value scoring.

## Wiring contract for `/api/chat` (SCRUM-144 / I-1)

```ts
import {
  toToolSpecs, parseToolCalls, runToolCalls, toToolResultMessages,
  type BotToolContext,
} from "@lume/bot";

// 1. Build a tenant-scoped context from the existing @lume/db vehicle query
//    (the same one /api/vehicles uses). getVehicleById is optional.
const ctx: BotToolContext = {
  tenantId: tenant.tenantId,
  queryVehicles: (q) => queryTenantVehicles(supabase, tenant.tenantId, q),
  getVehicleById: (id) => getTenantVehicle(supabase, tenant.tenantId, id),
};

// 2. Send tools with the chat-completion request.
//    body.tools = toToolSpecs();

// 3. If the model responds with tool_calls, execute and feed back.
const calls = parseToolCalls(message.tool_calls);
const turn = await runToolCalls(calls, ctx);
const toolMessages = toToolResultMessages(turn.steps);
// → append assistant(tool_calls) + toolMessages, re-call the model for prose.

// 4. Emit turn.actions to the public BotAction bus via the existing SSE
//    `meta` event (see app/api/chat/route.ts streaming pattern).
```

All steps except the `queryTenantVehicles`/`getTenantVehicle` data functions
and the SSE emission are already implemented and tested here.
