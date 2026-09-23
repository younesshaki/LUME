/**
 * Public concierge latency benchmark.
 *
 * Drives the REAL `/api/chat` route handler in-process, against a real
 * Supabase project, and records a per-turn timeline of every upstream call:
 * when it started, when its headers arrived, when its body finished. From
 * that timeline it reports the stages the performance work is judged on.
 *
 * It is read-only by construction, because the only credentials that exist
 * locally point at the production-backed project:
 *
 *   - A fetch guard rejects every upstream request that is not a read:
 *     PostgREST GET/HEAD, or a POST to one of the STABLE read-only RPCs
 *     below. Anything else (inserts, updates, the usage-counter RPCs, auth,
 *     storage) throws before it leaves the process and is reported as a
 *     violation, which fails the run.
 *   - The per-turn quota reservation is the one write the route performs
 *     before answering, so `checkPublicApiQuota` is replaced with the route's
 *     own fail-open decision. The route's handling of that decision is
 *     unchanged.
 *   - `after()` tasks (internal trace writes, PostHog) are dropped.
 *   - Conversation memory is the in-process store: no Upstash variables are
 *     passed through.
 *   - The model provider is reachable only while the opt-in model scenario
 *     runs (LUME_BENCH_MODEL_ITERATIONS > 0), and only its configured URL.
 *
 * Nothing is logged except timings, action payload shapes and counts. The
 * canned visitor messages are the benchmark's own; no real visitor text is
 * read or written.
 *
 * Usage (never part of `npm test`):
 *   LUME_BENCH_ENV_FILE=/abs/path/apps/admin/.env.local \
 *   LUME_BENCH_OUT=/abs/path/results.json \
 *   npx vitest run --config scripts/bench/vitest.config.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ENV_FILE = process.env.LUME_BENCH_ENV_FILE;
const TENANT = process.env.LUME_BENCH_TENANT ?? "default";
const ITERATIONS = Number(process.env.LUME_BENCH_ITERATIONS ?? 10);
const MODEL_ITERATIONS = Number(process.env.LUME_BENCH_MODEL_ITERATIONS ?? 0);
const OUT = process.env.LUME_BENCH_OUT;
const LABEL = process.env.LUME_BENCH_LABEL ?? "run";

// Next.js resolves this marker package itself; plain Node cannot.
vi.mock("server-only", () => ({}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  // Background work never runs here: it is where the trace/PostHog writes live.
  after: () => undefined,
}));

vi.mock("@/lib/quota.server", async () => {
  const { failOpenQuotaDecision } = await import("@lume/db");
  return {
    // The real function reserves usage (a write), so it cannot run here. Its
    // latency can: in production it is two dependent round trips — the
    // operational-subscription read (uncached) and the reservation RPC (plan
    // limits are cached). The first is performed for real, read-only; the
    // second is modelled by one read-only RPC round trip of similar weight.
    // The route receives the fail-open decision, which it treats as allowed.
    checkPublicApiQuota: async (
      tenantId: string,
      _eventType: unknown,
      client: {
        from: (table: string) => any;
        rpc: (name: string, args: Record<string, unknown>) => PromiseLike<unknown>;
      },
    ) => {
      await client
        .from("subscriptions")
        .select("plan_id, current_period_start, current_period_end")
        .eq("tenant_id", tenantId)
        .in("status", ["active", "trialing", "past_due", "incomplete"])
        .limit(1)
        .maybeSingle();
      await client.rpc("tenant_by_slug", { p_slug: "__quota_reservation_stand_in__" });
      return failOpenQuotaDecision("chat_requests");
    },
  };
});

const PASSED_THROUGH_ENV = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;
const MODEL_ENV = ["DEEPSEEK_API_KEY", "DEEPSEEK_API_URL"] as const;

const READ_ONLY_RPCS = new Set([
  "tenant_by_slug",
  "vehicle_facets_v2",
  "hybrid_rag_chunks_for_tenant",
]);

type CallRecord = {
  label: string;
  startMs: number;
  headersMs: number;
  bodyMs: number;
  status: number;
  /** Ids of vehicle rows, only for inventory list reads. */
  vehicleIds?: string[];
};

type TurnSample = {
  scenario: string;
  step: string;
  iteration: number;
  route: string | null;
  status: number;
  handlerReturnedMs: number;
  /** When the model request left the process; null when no model was called. */
  modelDispatchMs: number | null;
  firstByteMs: number | null;
  firstActionMs: number | null;
  firstTextMs: number | null;
  doneMs: number | null;
  stateMs: number | null;
  calls: CallRecord[];
  serialWaves: number;
  actions: unknown[];
  text: string;
};

const violations: string[] = [];
let turnOrigin = 0;
let calls: CallRecord[] = [];
let allowModel = false;
let supabaseHost = "";
let modelHost = "";

function loadEnvFile(path: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    values[match[1]!] = match[2]!.replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function classify(url: URL, method: string): string {
  if (url.host === supabaseHost) {
    const rpc = /^\/rest\/v1\/rpc\/([a-z0-9_]+)$/.exec(url.pathname);
    if (rpc) {
      if (method === "POST" && READ_ONLY_RPCS.has(rpc[1]!)) return `rpc:${rpc[1]}`;
      throw new Error(`blocked rpc ${method} ${rpc[1]}`);
    }
    const table = /^\/rest\/v1\/([a-z0-9_]+)$/.exec(url.pathname);
    if (table && (method === "GET" || method === "HEAD")) {
      // Distinguish the inventory list query from single-row reads without
      // recording any filter values.
      const isList = url.searchParams.has("limit") || url.searchParams.has("order");
      const isHead = method === "HEAD";
      return `${table[1]}${isHead ? ":count" : isList ? ":list" : ":read"}`;
    }
    throw new Error(`blocked ${method} ${url.pathname}`);
  }
  if (allowModel && modelHost && url.host === modelHost && method === "POST") {
    return "model";
  }
  throw new Error(`blocked host ${url.host}`);
}

function installFetchGuard(): void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    let label: string;
    try {
      label = classify(url, method);
    } catch (error) {
      violations.push(error instanceof Error ? error.message : String(error));
      throw error;
    }
    const record: CallRecord = {
      label,
      startMs: performance.now() - turnOrigin,
      headersMs: 0,
      bodyMs: 0,
      status: 0,
    };
    calls.push(record);
    const response = await realFetch(input, init);
    record.headersMs = performance.now() - turnOrigin;
    record.status = response.status;
    if (label === "model") {
      // Streaming body: its end is the model's end, not a DB round trip.
      record.bodyMs = record.headersMs;
      return response;
    }
    const body = await response.arrayBuffer();
    record.bodyMs = performance.now() - turnOrigin;
    if (label === "vehicles:list") {
      try {
        const rows = JSON.parse(new TextDecoder().decode(body)) as Array<{ id?: string }>;
        record.vehicleIds = rows.flatMap((row) => (row.id ? [row.id] : []));
      } catch {
        // Not a list body; nothing to record.
      }
    }
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

/** Number of dependent round-trip waves on the critical path. */
function serialWaves(records: readonly CallRecord[]): number {
  const db = records
    .filter((record) => record.label !== "model")
    .sort((a, b) => a.startMs - b.startMs);
  let waves = 0;
  let waveEnd = -Infinity;
  for (const record of db) {
    if (record.startMs >= waveEnd) {
      waves += 1;
      waveEnd = record.bodyMs;
    } else {
      waveEnd = Math.max(waveEnd, record.bodyMs);
    }
  }
  return waves;
}

type Conversation = {
  messages: { role: "user" | "assistant"; content: string }[];
  sessionId?: string;
  pagePath: string;
  ip: string;
};

let POST: (request: Request) => Promise<Response>;
const turnRecords: Array<Record<string, unknown>> = [];

async function runTurn(
  conversation: Conversation,
  text: string,
  scenario: string,
  step: string,
  iteration: number,
): Promise<TurnSample> {
  conversation.messages.push({ role: "user", content: text });
  const request = new Request("http://bench.local/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Lume-Tenant": TENANT,
      "x-forwarded-for": conversation.ip,
    },
    body: JSON.stringify({
      messages: conversation.messages.slice(-30),
      stream: true,
      pagePath: conversation.pagePath,
      requestId: crypto.randomUUID(),
      ...(conversation.sessionId ? { sessionId: conversation.sessionId } : {}),
    }),
  });

  calls = [];
  turnRecords.length = 0;
  turnOrigin = performance.now();
  const response = await POST(request);
  const handlerReturnedMs = performance.now() - turnOrigin;
  const modelDispatchMs =
    calls.find((call) => call.label === "model")?.startMs ?? null;
  if (response.status !== 200) {
    // Only the model scenario may end here: the provider's own failure (for
    // example an exhausted balance) still lets the pre-model stages be timed.
    expect(scenario, `${scenario}/${step} status ${response.status}`).toBe("model");
    conversation.messages.pop();
    return {
      scenario,
      step,
      iteration,
      route: null,
      status: response.status,
      handlerReturnedMs,
      modelDispatchMs,
      firstByteMs: null,
      firstActionMs: null,
      firstTextMs: null,
      doneMs: null,
      stateMs: null,
      calls: calls.map((call) => ({ ...call })),
      serialWaves: serialWaves(calls),
      actions: [],
      text: "",
    };
  }

  let firstByteMs: number | null = null;
  let firstActionMs: number | null = null;
  let firstTextMs: number | null = null;
  let doneMs: number | null = null;
  const actions: unknown[] = [];
  let assistantText = "";
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const now = performance.now() - turnOrigin;
    firstByteMs ??= now;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      if (trimmed === "data: [DONE]") {
        doneMs ??= now;
        continue;
      }
      const event = JSON.parse(trimmed.slice(6)) as {
        type?: string;
        sessionId?: string;
        action?: unknown;
        choices?: Array<{ delta?: { content?: string } }>;
      };
      if (event.type === "meta" && event.sessionId) {
        conversation.sessionId = event.sessionId;
      } else if (event.type === "action") {
        firstActionMs ??= now;
        actions.push(event.action);
      } else {
        const delta = event.choices?.[0]?.delta?.content;
        if (delta) {
          firstTextMs ??= now;
          assistantText += delta;
        }
      }
    }
  }

  conversation.messages.push({ role: "assistant", content: assistantText });
  // Mirror what the browser does after applying the turn's actions.
  for (const action of actions as Array<Record<string, unknown>>) {
    if (action.type === "filter_inventory") conversation.pagePath = "/vehicles";
    const params = action.params as Record<string, string> | undefined;
    if (action.type === "navigate-target" && params?.vehicleId) {
      conversation.pagePath = `/vehicles/${params.vehicleId}`;
    }
  }

  const record = turnRecords.find((entry) => entry.scope === "concierge.turn");
  const timings = (record?.timingsMs ?? {}) as { state?: number | null };
  return {
    scenario,
    step,
    iteration,
    route: typeof record?.route === "string" ? record.route : null,
    status: response.status,
    handlerReturnedMs,
    modelDispatchMs,
    firstByteMs,
    firstActionMs,
    firstTextMs,
    doneMs,
    stateMs: timings.state ?? null,
    calls: calls.map((call) => ({ ...call })),
    serialWaves: serialWaves(calls),
    actions,
    text: assistantText,
  };
}

function percentile(values: number[], p: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, index)]!);
}

const CANONICAL = [
  ["ferraris", "Do you have any Ferraris?"],
  ["over-100k", "cars for more than 100k"],
  ["top-10-expensive", "10 most expensive cars"],
  ["open-second", "open the second one"],
] as const;

const samples: TurnSample[] = [];

describe.skipIf(!ENV_FILE)("public concierge latency (read-only)", () => {
  beforeAll(async () => {
    const env = loadEnvFile(ENV_FILE!);
    for (const key of Object.keys(process.env)) {
      if (/^(UPSTASH_|POSTHOG_|NEXT_PUBLIC_POSTHOG_|LUME_CHAT_DEBUG|AI_GATEWAY)/.test(key)) {
        delete process.env[key];
      }
    }
    delete process.env.ALLOWED_CHAT_ORIGINS;
    for (const key of PASSED_THROUGH_ENV) {
      if (env[key]) process.env[key] = env[key];
    }
    if (MODEL_ITERATIONS > 0) {
      for (const key of MODEL_ENV) if (env[key]) process.env[key] = env[key];
    }
    supabaseHost = new URL(process.env.SUPABASE_URL!).host;
    modelHost = process.env.DEEPSEEK_API_URL
      ? new URL(process.env.DEEPSEEK_API_URL).host
      : "api.deepseek.com";

    installFetchGuard();
    vi.spyOn(console, "info").mockImplementation((line: unknown) => {
      if (typeof line !== "string") return;
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (parsed.scope === "concierge.turn") turnRecords.push(parsed);
      } catch {
        // Not a structured record.
      }
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    ({ POST } = await import("../../apps/admin/app/api/chat/route"));
  });

  afterAll(() => {
    if (!OUT) return;
    writeFileSync(OUT, JSON.stringify({ label: LABEL, tenant: TENANT, samples, violations }, null, 2));
  });

  it("runs the canonical buyer journey and keeps its meaning", async () => {
    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
      const conversation: Conversation = {
        messages: [],
        pagePath: "/home",
        ip: `198.51.100.${(iteration % 250) + 1}`,
      };
      const journey: TurnSample[] = [];
      for (const [step, text] of CANONICAL) {
        const sample = await runTurn(conversation, text, "canonical", step, iteration);
        journey.push(sample);
        samples.push(sample);
      }

      const [ferraris, over100k, top10, openSecond] = journey as [
        TurnSample,
        TurnSample,
        TurnSample,
        TurnSample,
      ];
      const filterOf = (sample: TurnSample) =>
        sample.actions.find(
          (action) => (action as { type?: string }).type === "filter_inventory",
        ) as Record<string, unknown> | undefined;

      // Ferrari is a make, never also a model.
      const f1 = filterOf(ferraris);
      expect(String(f1?.make ?? "")).toMatch(/ferrari/i);
      expect(f1?.model).toBeUndefined();
      // The broad price request clears the Ferrari constraint.
      const f2 = filterOf(over100k);
      expect(f2?.make).toBeUndefined();
      expect(f2?.priceMin).toBe(100_000);
      // Ranked request is exactly a price_desc top 10.
      const f3 = filterOf(top10);
      expect(f3?.sort).toBe("price_desc");
      expect(f3?.limit).toBe(10);
      // "Open the second one" targets the second id of the stored top 10.
      const top10Ids =
        top10.calls.find((call) => call.label === "vehicles:list")?.vehicleIds ?? [];
      expect(top10Ids.length).toBe(10);
      const navigate = openSecond.actions.find(
        (action) => (action as { type?: string }).type === "navigate-target",
      ) as { params?: { vehicleId?: string } } | undefined;
      expect(navigate?.params?.vehicleId).toBe(top10Ids[1]);
    }
    expect(violations).toEqual([]);
  });

  it.skipIf(MODEL_ITERATIONS <= 0)(
    "streams a model-backed informational answer",
    async () => {
      allowModel = true;
      try {
        for (let iteration = 0; iteration < MODEL_ITERATIONS; iteration += 1) {
          const conversation: Conversation = {
            messages: [],
            pagePath: "/home",
            ip: `203.0.113.${(iteration % 250) + 1}`,
          };
          const sample = await runTurn(
            conversation,
            "What are your opening hours and where is the dealership located?",
            "model",
            "info-question",
            iteration,
          );
          samples.push(sample);
          // The turn must reach the model, whatever the provider then says.
          expect(sample.modelDispatchMs).not.toBeNull();
          if (sample.status === 200) {
            expect(sample.route === "model" || sample.route === "tool").toBe(true);
            expect(sample.text.trim().length).toBeGreaterThan(0);
          }
        }
      } finally {
        allowModel = false;
      }
      expect(violations).toEqual([]);
    },
  );

  it("summarises", () => {
    const groups = new Map<string, TurnSample[]>();
    for (const sample of samples) {
      const key = `${sample.scenario}/${sample.step}`;
      groups.set(key, [...(groups.get(key) ?? []), sample]);
    }
    const rows = [...groups.entries()].map(([key, group]) => {
      // The first journey pays module initialisation and cold connections; it
      // is reported separately rather than folded into the percentiles.
      const warm = group.length > 1 ? group.slice(1) : group;
      const stat = (pick: (sample: TurnSample) => number | null) => {
        const values = warm.map(pick).filter((v): v is number => v !== null);
        return `${percentile(values, 50)}/${percentile(values, 95)}`;
      };
      return {
        stage: key,
        n: warm.length,
        route: warm[0]?.route,
        "facets ready p50/p95": stat(
          (s) => s.calls.find((c) => c.label === "rpc:vehicle_facets_v2")?.bodyMs ?? null,
        ),
        "inventory query p50/p95": stat((s) => {
          const q = s.calls.find((c) => c.label === "vehicles:list");
          return q ? q.bodyMs - q.startMs : null;
        }),
        "model dispatch p50/p95": stat((s) => s.modelDispatchMs),
        "first byte p50/p95": stat((s) => s.firstByteMs),
        "first action p50/p95": stat((s) => s.firstActionMs),
        "first text p50/p95": stat((s) => s.firstTextMs),
        "done p50/p95": stat((s) => s.doneMs),
        "db waves p50": percentile(warm.map((s) => s.serialWaves), 50),
        "db calls p50": percentile(warm.map((s) => s.calls.filter((c) => c.label !== "model").length), 50),
        "cold first byte": Math.round(group[0]!.firstByteMs ?? -1),
      };
    });
    console.log(`\n[${LABEL}] tenant=${TENANT}`);
    console.table(rows);
    const example = samples.find((s) => s.iteration === 1 && s.step === "top-10-expensive");
    if (example) {
      console.log("example timeline (top-10-expensive, iteration 1):");
      console.table(
        example.calls.map((c) => ({
          call: c.label,
          start: Math.round(c.startMs),
          headers: Math.round(c.headersMs),
          end: Math.round(c.bodyMs),
        })),
      );
    }
    expect(rows.length).toBeGreaterThan(0);
  });
});
