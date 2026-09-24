/**
 * Route-level speed telemetry: the REAL /api/chat handler, in-process, with
 * only I/O replaced (tenant, quota, Supabase, vehicle reads, plan, retrieval,
 * provider fetch, PostHog). Asserts that every turn — deterministic, model,
 * duplicate and error — produces a complete, ordered, content-free timing
 * record, both in the stream and as the server PostHog event.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BotAction, PlanId, Vehicle } from "@lume/types";

const TENANT = { tenantId: "tenant-1", slug: "demo", name: "Demo Motors" };
const PROVIDER_URL = "https://provider.test/v1/chat/completions";

const state = vi.hoisted(() => ({
  plan: "pro" as PlanId,
  providerReply: "" as string,
  providerStatus: 200,
  providerCalls: 0,
  afterTasks: [] as Array<() => unknown>,
  posthog: [] as Array<{ event: string; properties: Record<string, unknown> }>,
}));

function vehicle(id: string, make: string, model: string, price: number): Vehicle {
  return {
    id,
    tenantId: "tenant-1",
    stockType: "used",
    year: 2022,
    make,
    model,
    trim: "",
    price,
    mileage: 12_000,
    bodyStyle: "SUV",
    exteriorColor: "Grey",
    interiorColor: "Black",
    drivetrain: "AWD",
    fuelType: "Gasoline",
    imageSrc: "",
    sellerCity: "Austin",
    sellerState: "TX",
    isSpecial: false,
    status: "live",
    soldAt: null,
    soldPrice: null,
  } as Vehicle;
}

const INVENTORY = vi.hoisted(() => [] as Vehicle[]);

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  // Collected, then run by the test — exactly what Next does after the response.
  after: (task: () => unknown) => {
    state.afterTasks.push(task);
  },
}));
vi.mock("@/lib/posthog.server", () => ({
  captureConciergeOperationalEvent: async (input: {
    event: string;
    properties?: Record<string, unknown>;
  }) => {
    state.posthog.push({ event: input.event, properties: input.properties ?? {} });
  },
  captureConciergeTrainingTrace: async () => undefined,
  conciergeTrainingProperties: () => ({}),
  posthogServerMode: () => "configured",
}));

vi.mock("@lume/db/server", () => {
  // A chainable stand-in: every builder method returns itself and awaiting it
  // yields an empty result. The facet RPC returns the tenant vocabulary.
  const query = (result: unknown) => {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
          }
          return () => proxy;
        },
      },
    );
    return proxy;
  };
  const client = {
    rpc: (name: string) =>
      query(
        name === "vehicle_facets_v2"
          ? {
              data: [{ makes: ["Porsche", "BMW"], models: ["Cayenne", "911", "X5"], states: [], cities: [] }],
              error: null,
            }
          : { data: [], error: null },
      ),
    from: () => query({ data: [], error: null, count: 0 }),
  };
  return { createServiceClient: () => client, createAnonServerClient: () => client };
});

vi.mock("@lume/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lume/db")>();
  const { planEntitlements } = await import("@lume/types");
  return {
    ...actual,
    resolveTenantPlan: async () => ({
      planId: state.plan,
      entitlements: planEntitlements(state.plan),
      source: "subscription",
    }),
    getTenantVehicle: async (_client: unknown, _tenantId: string, id: string) =>
      INVENTORY.find((candidate) => candidate.id === id) ?? null,
    queryTenantVehicles: async (
      _client: unknown,
      _tenantId: string,
      q: { make?: string; priceMin?: number; sort?: string; limit?: number },
    ) => {
      let rows = INVENTORY.filter(
        (candidate) =>
          (!q.make || candidate.make.toLowerCase() === q.make.toLowerCase()) &&
          (q.priceMin === undefined || candidate.price >= q.priceMin),
      );
      if (q.sort === "price_desc") rows = [...rows].sort((a, b) => b.price - a.price);
      const limited = rows.slice(0, q.limit ?? 12);
      return { vehicles: limited, totalCount: rows.length, hasMore: limited.length < rows.length };
    },
  };
});

vi.mock("@/lib/tenant", () => ({ getTenantFromRequest: async () => TENANT }));
vi.mock("@/lib/quota.server", async () => {
  const { failOpenQuotaDecision } = await import("@lume/db");
  return { checkPublicApiQuota: async () => failOpenQuotaDecision("chat_requests") };
});
vi.mock("@/lib/visitorSession", () => ({ resolveVisitor: async () => null }));
vi.mock("@/lib/chatPersona", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chatPersona")>();
  const { defaultPersona } = await import("./persona");
  return { ...actual, loadActivePersona: async () => defaultPersona("tenant-1") };
});
vi.mock("@/lib/chatTools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chatTools")>();
  const { DEFAULT_CONCIERGE_MODEL_ID } = await import("./conciergeModels");
  // No tools: model turns take the single-call prose path.
  return {
    ...actual,
    loadTenantBotRuntimeConfig: async () => ({ allowedTools: [], modelId: DEFAULT_CONCIERGE_MODEL_ID }),
  };
});
vi.mock("@/lib/conciergeTargets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./conciergeTargets")>();
  const { mergeConciergeTargets } = await import("@lume/types");
  return { ...actual, loadConciergeTargets: async () => ({ targets: mergeConciergeTargets([]) }) };
});
vi.mock("@lume/rag/server", () => ({
  createOllamaEmbedder: () => null,
  retrieveHybridContext: async () => [],
}));

const PORSCHE_A = "2ae764bd-8de1-4866-86d7-e48fa3cb2b93";
const PORSCHE_B = "3c8e1a55-7f0b-4d2e-9a61-5b3d2f9c8e10";
const BMW = "4d9f2b66-8a1c-4e3f-8b72-6c4e3a0d9f21";

let POST: (request: Request) => Promise<Response>;
let ipCounter = 0;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  INVENTORY.push(
    vehicle(PORSCHE_A, "Porsche", "Cayenne", 98_000),
    vehicle(PORSCHE_B, "Porsche", "911", 132_000),
    vehicle(BMW, "BMW", "X5", 64_000),
  );
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DEEPSEEK_API_URL = PROVIDER_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.ALLOWED_CHAT_ORIGINS;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url !== PROVIDER_URL) throw new Error(`unexpected network call: ${url}`);
    state.providerCalls += 1;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: state.providerReply } }] }),
      { status: state.providerStatus, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  ({ POST } = await import("../app/api/chat/route"));
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  state.plan = "pro";
  state.providerReply = "";
  state.providerStatus = 200;
  state.providerCalls = 0;
  state.afterTasks.length = 0;
  state.posthog.length = 0;
});

type StreamEvent = Record<string, unknown> & { type?: string };

async function runAfterTasks(): Promise<void> {
  const tasks = state.afterTasks.splice(0);
  for (const task of tasks) await task();
}

function timingEvents() {
  return state.posthog.filter((entry) => entry.event === "lume_concierge_turn_timing");
}

class Conversation {
  private messages: { role: "user" | "assistant"; content: string }[] = [];
  private sessionId = crypto.randomUUID();
  private ip = `198.51.100.${(ipCounter += 1)}`;

  async say(
    content: string,
    options: { requestId?: string; pagePath?: string } = {},
  ): Promise<{ status: number; events: StreamEvent[]; text: string }> {
    this.messages.push({ role: "user", content });
    const response = await POST(
      new Request("http://lume.test/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Lume-Tenant": "demo", "x-forwarded-for": this.ip },
        body: JSON.stringify({
          messages: this.messages,
          sessionId: this.sessionId,
          requestId: options.requestId ?? crypto.randomUUID(),
          pagePath: options.pagePath ?? "/home",
        }),
      }),
    );
    const raw = await response.text();
    const events: StreamEvent[] = [];
    let text = "";
    for (const line of raw.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      if (line === "data: [DONE]") {
        events.push({ type: "[DONE]" });
        continue;
      }
      const event = JSON.parse(line.slice(6)) as StreamEvent & {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      events.push(event);
      text += event.choices?.[0]?.delta?.content ?? "";
    }
    this.messages.push({ role: "assistant", content: text });
    await runAfterTasks();
    return { status: response.status, events, text };
  }
}

const serverTiming = (events: StreamEvent[]) =>
  events.find((event) => event.type === "timing")?.timing as Record<string, unknown> | undefined;

function expectOrdered(timing: Record<string, unknown>, stages: string[]) {
  let previous = -1;
  for (const stage of stages) {
    const value = timing[`server_${stage}_ms`];
    expect(typeof value, stage).toBe("number");
    expect(value as number, stage).toBeGreaterThanOrEqual(previous);
    previous = value as number;
  }
}

describe("speed telemetry — deterministic turn", () => {
  it("streams one timing event, just before [DONE], with ordered stages", async () => {
    const chat = new Conversation();
    const turn = await chat.say("do you have any Porsches?", { pagePath: "/vehicles" });
    const types = turn.events.map((event) => event.type ?? "delta");
    const timingIndex = types.indexOf("timing");
    expect(timingIndex).toBeGreaterThan(-1);
    expect(types[timingIndex + 1]).toBe("[DONE]");
    expect(types.filter((type) => type === "timing")).toHaveLength(1);

    const timing = serverTiming(turn.events)!;
    expect(timing.route).toBe("deterministic");
    expectOrdered(timing, ["tenant", "quota", "config", "memory", "state", "first_byte", "first_action", "first_text", "done"]);
    expect(typeof timing.server_inventory_query_ms).toBe("number");
    expect(typeof timing.server_memory_commit_ms).toBe("number");
    expect(timing.server_total_ms).toBeGreaterThanOrEqual(timing.server_done_ms as number);
    expect(state.providerCalls).toBe(0);
  });

  it("sends the matching server event to PostHog after the response", async () => {
    const chat = new Conversation();
    const requestId = crypto.randomUUID();
    const turn = await chat.say("do you have any Porsches?", { requestId, pagePath: "/vehicles" });
    const [event] = timingEvents();
    expect(event).toBeDefined();
    expect(event!.properties).toMatchObject({
      request_id: requestId,
      route: "deterministic",
      status: 200,
      query_status: "success",
      action_types: "filter_inventory",
      model_calls: 0,
    });
    // The browser and the server report the same stage numbers.
    const timing = serverTiming(turn.events)!;
    expect(event!.properties.server_first_byte_ms).toBe(timing.server_first_byte_ms);
    expect(event!.properties.server_done_ms).toBe(timing.server_done_ms);
  });

  it("carries no visitor or reply text anywhere", async () => {
    const chat = new Conversation();
    const secret = "my phone is 555 0199 and I want a Porsche";
    const turn = await chat.say(secret, { pagePath: "/vehicles" });
    const serialized = JSON.stringify([serverTiming(turn.events), timingEvents()]);
    expect(serialized).not.toContain("555");
    expect(serialized).not.toContain("phone");
    expect(serialized).not.toContain(turn.text.slice(0, 20));
  });
});

describe("speed telemetry — model turn", () => {
  it("times the model call and reports route model", async () => {
    state.providerReply = "We are open 9 to 6, Monday to Saturday.";
    const chat = new Conversation();
    const turn = await chat.say("what are your opening hours?");
    expect(state.providerCalls).toBe(1);
    const timing = serverTiming(turn.events)!;
    expect(timing.route).toBe("model");
    expectOrdered(timing, ["tenant", "state", "context", "model_response", "first_byte", "first_text", "done"]);
    expect(typeof timing.server_model_phase1_ms).toBe("number");
    const [event] = timingEvents();
    expect(event!.properties).toMatchObject({ route: "model", model_calls: 1 });
    expect(event!.properties.model_id).toEqual(expect.any(String));
  });
});

describe("speed telemetry — turns that do not answer", () => {
  it("a provider failure is still one timed turn, reported as an error", async () => {
    state.providerStatus = 500;
    const chat = new Conversation();
    const turn = await chat.say("what are your opening hours?");
    expect(turn.status).toBe(502);
    const [event] = timingEvents();
    expect(event!.properties).toMatchObject({
      route: "error",
      status: 502,
      error_stage: "provider_phase_1",
    });
    expect(typeof event!.properties.server_model_phase1_ms).toBe("number");
  });

  it("a duplicate delivery is timed as a duplicate, not a second answer", async () => {
    const chat = new Conversation();
    const requestId = crypto.randomUUID();
    const first = await chat.say("do you have any Porsches?", { requestId, pagePath: "/vehicles" });
    expect(first.status).toBe(200);
    state.posthog.length = 0;
    // A retry of the same turn carries the same request id; the lease is held.
    const duplicate = await chat.say("do you have any Porsches?", { requestId, pagePath: "/vehicles" });
    expect(duplicate.events.some((event) => event.type === "duplicate")).toBe(true);
    const [event] = timingEvents();
    expect(event!.properties).toMatchObject({ route: "duplicate", request_id: requestId });
  });

  it("cold start is flagged only on an instance's first turn", async () => {
    const chat = new Conversation();
    await chat.say("do you have any Porsches?", { pagePath: "/vehicles" });
    const [event] = timingEvents();
    expect(event!.properties.cold_start).toBe(false);
    expect(event!.properties.instance_turn).toEqual(expect.any(Number));
  });
});
