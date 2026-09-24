#!/usr/bin/env node
/**
 * Create (or update) the "LUME Concierge — Speed" PostHog dashboard.
 *
 *   POSTHOG_PERSONAL_API_KEY=phx_… node scripts/posthog/concierge-speed-dashboard.mjs          # dry run
 *   POSTHOG_PERSONAL_API_KEY=phx_… node scripts/posthog/concierge-speed-dashboard.mjs --apply  # write
 *
 * Optional: POSTHOG_API_HOST (default https://us.posthog.com),
 *           POSTHOG_PROJECT_ID (default 621062, "LUMEPOSTHOG").
 *
 * Idempotent: the dashboard is found by name, and each insight is matched by
 * name and updated in place, never duplicated. The key is read from the
 * environment and never printed.
 *
 * Every insight reads the content-free speed events described in
 * docs/architecture/concierge-speed-telemetry.md.
 */

export const DASHBOARD_NAME = "LUME Concierge — Speed";

const TURN = "lume_concierge_turn_completed";
const SERVER = "lume_concierge_turn_timing";
const ACTION = "lume_concierge_action_applied";
const RANGE = { date_from: "-14d" };
/** Hidden tabs throttle timers; they distort percentiles, not experience. */
const VISIBLE = [{ key: "client_was_hidden", value: ["false"], operator: "exact", type: "event" }];

function percentiles(event, property, { breakdown, properties = [] } = {}) {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "TrendsQuery",
      dateRange: RANGE,
      interval: "day",
      series: ["median", "p95"].map((math) => ({
        kind: "EventsNode",
        event,
        name: event,
        math,
        math_property: property,
        properties,
      })),
      ...(breakdown ? { breakdownFilter: { breakdown, breakdown_type: "event" } } : {}),
      trendsFilter: { display: "ActionsLineGraph" },
    },
  };
}

function hogql(query) {
  return {
    kind: "DataTableNode",
    source: { kind: "HogQLQuery", query },
  };
}

export function buildSpeedInsights() {
  return [
    {
      name: "Speed · Time to first words (median / p95) by answer type",
      description:
        "Press send → first reply text painted on screen. The number a visitor feels. Split by rules-based vs model answers.",
      query: percentiles(TURN, "client_first_text_painted_ms", { breakdown: "server_route", properties: VISIBLE }),
    },
    {
      name: "Speed · Full reply (median / p95)",
      description: "Press send → stream finished.",
      query: percentiles(TURN, "duration_ms", { properties: VISIBLE }),
    },
    {
      name: "Speed · Server first byte (median / p95) by route",
      description:
        "Server-side: request received → first byte of the answer. Authoritative for every turn, including visitors without analytics consent.",
      query: percentiles(SERVER, "server_first_byte_ms", { breakdown: "route" }),
    },
    {
      name: "Speed · Network and proxy overhead (median / p95) by connection",
      description:
        "Time neither LUME's browser nor server code spends: network, TLS, the /api/chat proxy hop, cold starts.",
      query: percentiles(TURN, "client_network_overhead_ms", {
        breakdown: "client_net_type",
        properties: VISIBLE,
      }),
    },
    {
      name: "Speed · Action → destination ready (median / p95) by action",
      description:
        "Action handed to the site → destination page painted with its data (inventory results, vehicle detail).",
      query: percentiles(ACTION, "action_ready_ms", { breakdown: "action_type" }),
    },
    {
      name: "Speed · Action → route painted (median / p95)",
      description: "Action handed to the site → new route painted (before its data).",
      query: percentiles(ACTION, "action_route_ms"),
    },
    {
      name: "Speed · Time to first words by release",
      description: "Median first-words time per deployed commit: compare each iteration with the last.",
      query: {
        kind: "InsightVizNode",
        source: {
          kind: "TrendsQuery",
          dateRange: { date_from: "-30d" },
          interval: "day",
          series: [
            {
              kind: "EventsNode",
              event: TURN,
              name: TURN,
              math: "median",
              math_property: "client_first_text_painted_ms",
              properties: VISIBLE,
            },
          ],
          breakdownFilter: { breakdown: "client_release", breakdown_type: "event" },
          trendsFilter: { display: "ActionsBarValue" },
        },
      },
    },
    {
      name: "Speed · Server stage breakdown (median ms, last 7 days)",
      description:
        "Where server time goes, by route. Stage marks are cumulative from request start; spans are durations of work inside a stage.",
      query: hogql(`
SELECT
  properties.route AS route,
  count() AS turns,
  round(quantile(0.5)(toFloat(properties.server_tenant_ms))) AS tenant,
  round(quantile(0.5)(toFloat(properties.server_quota_ms))) AS quota,
  round(quantile(0.5)(toFloat(properties.server_config_ms))) AS config,
  round(quantile(0.5)(toFloat(properties.server_memory_ms))) AS memory,
  round(quantile(0.5)(toFloat(properties.server_state_ms))) AS state,
  round(quantile(0.5)(toFloat(properties.server_inventory_query_ms))) AS inventory_query_span,
  round(quantile(0.5)(toFloat(properties.server_interpretation_ms))) AS interpretation_span,
  round(quantile(0.5)(toFloat(properties.server_context_ms))) AS context,
  round(quantile(0.5)(toFloat(properties.server_model_phase1_ms))) AS model_phase1_span,
  round(quantile(0.5)(toFloat(properties.server_tools_ms))) AS tools_span,
  round(quantile(0.5)(toFloat(properties.server_first_byte_ms))) AS first_byte,
  round(quantile(0.5)(toFloat(properties.server_first_text_ms))) AS first_text,
  round(quantile(0.5)(toFloat(properties.server_total_ms))) AS total
FROM events
WHERE event = '${SERVER}' AND timestamp > now() - INTERVAL 7 DAY
GROUP BY route
ORDER BY turns DESC`),
    },
    {
      name: "Speed · Slowest turns this week",
      description:
        "The 50 slowest visible turns, with their server split. $session_id opens the session replay; turn_id joins the transcript.",
      query: hogql(`
SELECT
  timestamp,
  properties.turn_id AS turn_id,
  properties.conversation_id AS conversation_id,
  properties.server_route AS route,
  toFloat(properties.client_first_text_painted_ms) AS first_words_ms,
  toFloat(properties.duration_ms) AS full_reply_ms,
  toFloat(properties.server_first_byte_ms) AS server_first_byte_ms,
  toFloat(properties.client_network_overhead_ms) AS network_overhead_ms,
  properties.client_net_type AS net,
  properties.client_viewport AS viewport,
  properties.$session_id AS session_id
FROM events
WHERE event = '${TURN}'
  AND timestamp > now() - INTERVAL 7 DAY
  -- Works whether PostHog typed the property as Boolean or String.
  AND coalesce(toString(properties.client_was_hidden), 'false') NOT IN ('true', '1')
ORDER BY toFloat(properties.duration_ms) DESC
LIMIT 50`),
    },
    {
      name: "Speed · Conversations (last 7 days)",
      description:
        "Per conversation: turns, median and worst first-words time, and total time the visitor spent waiting.",
      query: hogql(`
SELECT
  properties.conversation_id AS conversation_id,
  count() AS turns,
  round(quantile(0.5)(toFloat(properties.client_first_text_painted_ms))) AS median_first_words_ms,
  max(toFloat(properties.client_first_text_painted_ms)) AS worst_first_words_ms,
  sum(toFloat(properties.duration_ms)) AS total_wait_ms,
  min(timestamp) AS started
FROM events
WHERE event = '${TURN}'
  AND timestamp > now() - INTERVAL 7 DAY
  AND properties.conversation_id IS NOT NULL
GROUP BY conversation_id
ORDER BY total_wait_ms DESC
LIMIT 100`),
    },
    {
      name: "Speed · Cold starts and failures",
      description: "Server turns by route and outcome: how often a cold instance or an error shapes the experience.",
      query: hogql(`
SELECT
  properties.route AS route,
  properties.error_stage AS error_stage,
  properties.cold_start AS cold_start,
  properties.region AS region,
  count() AS turns,
  round(quantile(0.5)(toFloat(properties.server_first_byte_ms))) AS median_first_byte_ms,
  round(quantile(0.95)(toFloat(properties.server_first_byte_ms))) AS p95_first_byte_ms
FROM events
WHERE event = '${SERVER}' AND timestamp > now() - INTERVAL 7 DAY
GROUP BY route, error_stage, cold_start, region
ORDER BY turns DESC`),
    },
    {
      name: "Speed · Action outcomes",
      description: "How concierge actions ended: ready, route_only, timeout, error, superseded.",
      query: {
        kind: "InsightVizNode",
        source: {
          kind: "TrendsQuery",
          dateRange: RANGE,
          interval: "day",
          series: [{ kind: "EventsNode", event: ACTION, name: ACTION, math: "total" }],
          breakdownFilter: { breakdown: "outcome", breakdown_type: "event" },
          trendsFilter: { display: "ActionsBarValue" },
        },
      },
    },
  ];
}

async function api(host, key, method, path, body) {
  const response = await fetch(`${host}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${method} ${path} → ${response.status} ${text.slice(0, 300)}`);
  }
  return response.status === 204 ? null : response.json();
}

async function main() {
  const apply = process.argv.includes("--apply");
  const key = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
  const host = (process.env.POSTHOG_API_HOST?.trim() || "https://us.posthog.com").replace(/\/+$/, "");
  const project = process.env.POSTHOG_PROJECT_ID?.trim() || "621062";
  const insights = buildSpeedInsights();

  if (!apply) {
    console.log(`Dry run: would create/update "${DASHBOARD_NAME}" in project ${project} with:`);
    for (const insight of insights) console.log(`  - ${insight.name}`);
    console.log("Re-run with --apply to write.");
    return;
  }
  if (!key) throw new Error("POSTHOG_PERSONAL_API_KEY is not set.");

  const base = `/api/projects/${project}`;
  const dashboards = await api(host, key, "GET", `${base}/dashboards/?limit=200`);
  let dashboard = dashboards.results.find((item) => item.name === DASHBOARD_NAME && !item.deleted);
  if (!dashboard) {
    dashboard = await api(host, key, "POST", `${base}/dashboards/`, {
      name: DASHBOARD_NAME,
      description:
        "Concierge speed: visitor-perceived time to first words, server stage split, network overhead, and action → page ready. See docs/architecture/concierge-speed-telemetry.md.",
      pinned: true,
    });
    console.log(`Created dashboard ${dashboard.id}`);
  } else {
    console.log(`Updating dashboard ${dashboard.id}`);
  }

  const existing = await api(host, key, "GET", `${base}/insights/?limit=500&search=${encodeURIComponent("Speed ·")}`);
  for (const insight of insights) {
    const match = existing.results.find((item) => item.name === insight.name && !item.deleted);
    const payload = {
      name: insight.name,
      description: insight.description,
      query: insight.query,
      dashboards: [...new Set([...(match?.dashboards ?? []), dashboard.id])],
    };
    if (match) {
      await api(host, key, "PATCH", `${base}/insights/${match.id}/`, payload);
      console.log(`  updated  ${insight.name}`);
    } else {
      await api(host, key, "POST", `${base}/insights/`, payload);
      console.log(`  created  ${insight.name}`);
    }
  }
  console.log(`Done: ${host}/project/${project}/dashboard/${dashboard.id}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
