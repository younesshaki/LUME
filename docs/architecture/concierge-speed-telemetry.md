# Concierge Speed Telemetry

What every public concierge interaction records about its speed, where it is
measured, and how to read it in PostHog. The goal is the fastest concierge in
the market with near-instant browser execution. You can't improve what you
don't measure per turn, per stage, per release.

**Every field is content-free.** Only durations, counts, enums, ids, device
class and release tags are recorded. No visitor text, reply text, contact
detail or vehicle id is ever in a speed event. Tests enforce this.

## The four events

| Event | Sent from | When | Exists for |
|---|---|---|---|
| `lume_concierge_turn_completed` | browser | after the reply's final frame is painted | turns in browsers with analytics consent |
| `lume_concierge_turn_aborted` / `_failed` / `_duplicate` | browser | the turn ended another way | same |
| `lume_concierge_turn_timing` | server (`after()`) | after the response | **every** turn, including errors and duplicates, whatever the browser allows |
| `lume_concierge_action_applied` | browser | the action's destination is on screen, or it gave up | every page-changing action from the current turn |

The server's stage timings are also sent to the browser as one `timing` SSE
event just before `[DONE]`. The browser merges them into
`lume_concierge_turn_completed`, so **one row explains a slow turn end to end**
without a cross-event join. `request_id` (server) equals `turn_id` (browser)
whenever you need the join anyway, for example for turns without consent.

## Turn: what the visitor experiences (browser)

Every `client_*_ms` is milliseconds from the moment the visitor pressed send.
It is measured with `performance.now()` in `src/lib/conciergeSpeed.ts`.
"Painted" means measured after the next frame was produced (two animation
frames), not when React state was set.

| Field | Meaning |
|---|---|
| `client_submit_painted_ms` | The visitor's own bubble on screen. Input responsiveness. |
| `client_request_sent_ms` | `fetch` called. |
| `client_response_headers_ms` | Headers back through the public site's `/api/chat` proxy. |
| `client_first_event_ms` | First stream event parsed. |
| `client_first_action_received_ms` / `_dispatched_ms` | First action received / handed to the site (stale actions are never dispatched). |
| `client_first_thinking_ms` | First tool "thinking" step (model turns with tools). |
| `client_first_text_received_ms` | First words received. |
| **`client_first_text_painted_ms`** | **First words on screen: the headline "how fast did it feel" number.** |
| `client_done_ms`, `duration_ms` | Stream finished. `duration_ms` keeps the existing dashboards working. |
| `client_network_overhead_ms` | `first_event − request_sent − server_first_byte`. The time spent in neither LUME's browser code nor its chat function: network, TLS, the proxy hop, cold starts. |
| `client_was_hidden` | The tab was hidden during the turn. Browsers throttle hidden tabs, so exclude these from percentiles. |
| `client_net_type`, `client_net_rtt_ms`, `client_net_downlink_mbps`, `client_save_data` | Connection class (Chromium only; null elsewhere). |
| `client_viewport`, `client_cpu_cores`, `client_device_memory_gb` | Coarse device class. |
| `client_release` (+ `lume_release` on every event) | Deployed commit, to compare iterations. |
| `conversation_id`, `conversation_turn` | Conversation-level analysis. |
| `server_route` + all `server_*_ms` | Merged from the server's `timing` event (below). |

## Turn: where the server spends it

Server fields come from `apps/admin/lib/conciergeTurnTiming.ts`. Marks are
cumulative from request entry; spans are the duration of work inside a stage.

| Mark (`server_<mark>_ms`) | Reached when |
|---|---|
| `tenant` | tenant resolved |
| `quota` | quota decided |
| `config` | persona, runtime config, visitor, targets and plan loaded |
| `memory` | conversation memory read |
| `state` | deterministic state resolved (vocabulary, references, inventory query) |
| `context` | model-only context loaded (model turns) |
| `model_response` | first model call returned |
| `model_first_token` | first token of the streamed follow-up (tool turns) |
| `first_byte`, `first_action`, `first_text` | the stream's first byte, action and words were enqueued |
| `done` | just before `[DONE]` |

| Span (`server_<span>_ms`) | Work |
|---|---|
| `inventory_query` | the tenant inventory query |
| `interpretation` | the provider-backed semantic interpreter (a model call on the deterministic path) |
| `model_phase1` | the first model call |
| `tools` | tool execution |
| `model_stream` | the streamed follow-up model call |
| `memory_commit` | the conversation-memory write |

The server event also carries:

- **Turn details:** `route` (`deterministic`, `interpreted`, `model`, `tool`,
  `duplicate` or `error`), `status`, `error_stage`, the model's provider, id,
  fallback flag and call count, `query_status`, `result_count`,
  `action_types`, `rule_codes`, `memory_mode`.
- **Environment:** `cold_start` and `instance_turn`, `region`
  (`VERCEL_REGION`), `release` (the commit) and `deployment_env`.

Error turns are timed too. For example, a provider failure is reported as
`route: "error", error_stage: "provider_phase_1"` with the time spent before it.

## Action: from dispatch to page on screen

`lume_concierge_action_applied`, one per page-changing action:

| Field | Meaning |
|---|---|
| `action_route_ms` | Action handed to the site → new route painted. |
| **`action_ready_ms`** | **Action → destination painted with its data**: inventory results, or the vehicle detail. |
| `outcome` | `ready`, `route_only` (a page with no data load, e.g. contact), `timeout` (nothing within 10 s), `error` (the destination's data failed), or `superseded` (a newer action replaced it). |
| `action_type`, `turn_id`, `route_changed` | — |

Only the expected destination's data counts: inventory for filters, the
vehicle page for vehicle navigation. A page being left that finishes its own
load after the action is ignored.

## Dashboard

```bash
POSTHOG_PERSONAL_API_KEY=phx_… npm run posthog:speed-dashboard            # dry run
POSTHOG_PERSONAL_API_KEY=phx_… npm run posthog:speed-dashboard -- --apply
```

This creates or updates **"LUME Concierge — Speed"** in project 621062. It is
idempotent: insights are matched by name. The dashboard has 12 insights:

- time to first words (median and p95) by answer type;
- full reply;
- server first byte by route;
- network and proxy overhead by connection;
- action → destination ready by action;
- action → route painted;
- first words by release;
- a server stage breakdown table;
- the slowest 50 turns this week (with `$session_id` for the replay);
- conversation-level waits;
- cold starts and failures;
- action outcomes.

A test fails if an insight reads a property the code doesn't emit.

## How to use it each iteration

1. **The target is the visible-turn median and p95 of
   `client_first_text_painted_ms`, split by `server_route`.** Rules-based turns
   should be near-instant; model turns are judged separately.
2. **If first words are slow, check `client_network_overhead_ms` against
   `server_first_byte_ms`.**
   - If overhead dominates, it's infrastructure: region, the proxy hop, cold
     starts (`cold_start`).
   - If the server dominates, read the stage table: the largest gap between
     consecutive marks, or the largest span, is the next thing to fix.
3. **If an action feels slow, compare `action_route_ms` with
   `action_ready_ms`.**
   - A large route time means code loading: warm the route chunk.
   - A large gap between route and ready means the destination's data fetch.
4. **Compare every deploy with the previous one** using "first words by
   release". Exclude `client_was_hidden = true` from all percentiles (the
   insights already do).

## Guarantees and limits

- **No effect on speed.** Marks are single clock reads. The server event is
  sent in `after()`. The browser event is sent after the final paint through
  PostHog's async queue. Every helper swallows its own errors (tests cover a
  throwing sink and a throwing observer).
- **Coverage.**
  - **Server event:** covers every turn.
  - **Browser events:** only turns where the visitor gave analytics consent
    and PostHog isn't blocked.
  - **Turns rejected before tenant resolution:** bad origin, per-IP rate limit
    and invalid JSON have no tenant, so they aren't recorded.
- **Clocks.** Each side measures with its own monotonic clock. Only
  differences within one side are used; the network overhead is the only
  derived cross-side number.
- **Device variance.** Browser timings include the visitor's device and
  network. That is real experience, but compare medians rather than single
  turns.
