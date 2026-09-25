/**
 * Route-level tests: the REAL /api/chat handler, in-process.
 *
 * Only I/O is replaced — tenant resolution, quota, the Supabase client, the
 * vehicle reads, plan resolution, retrieval and the model provider (a stubbed
 * fetch). Everything that decides what the visitor sees — the deterministic
 * pipeline, conversation memory, the back-navigation rule, every action gate
 * and the truthful-reply guard — runs for real. Nothing leaves the process.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BotAction, PlanId, Vehicle } from "@lume/types";

const TENANT = { tenantId: "tenant-1", slug: "demo", name: "Demo Motors" };
const PROVIDER_URL = "https://provider.test/v1/chat/completions";

const state = vi.hoisted(() => ({
  plan: "pro" as PlanId,
  providerReply: "" as string,
  providerCalls: 0,
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
  after: () => undefined,
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

vi.mock("@/lib/tenant", () => ({
  getTenantFromRequest: async () => TENANT,
  // The chat route resolves its tenant through the short-lived cache.
  getTenantFromRequestCached: async () => TENANT,
}));
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
      { status: 200, headers: { "Content-Type": "application/json" } },
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
  state.providerCalls = 0;
});

type Turn = { actions: BotAction[]; text: string };

class Conversation {
  private messages: { role: "user" | "assistant"; content: string }[] = [];
  private sessionId = crypto.randomUUID();
  private ip = `198.51.100.${(ipCounter += 1)}`;

  async say(
    content: string,
    context: { pagePath?: string; navigation?: Record<string, unknown> } = {},
  ): Promise<Turn> {
    this.messages.push({ role: "user", content });
    const response = await POST(
      new Request("http://lume.test/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Lume-Tenant": "demo", "x-forwarded-for": this.ip },
        body: JSON.stringify({
          messages: this.messages,
          sessionId: this.sessionId,
          requestId: crypto.randomUUID(),
          pagePath: context.pagePath ?? "/home",
          ...(context.navigation ? { navigation: context.navigation } : {}),
        }),
      }),
    );
    expect(response.status).toBe(200);
    const turn: Turn = { actions: [], text: "" };
    for (const line of (await response.text()).split("\n")) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      const event = JSON.parse(line.slice(6)) as {
        type?: string;
        action?: BotAction;
        choices?: Array<{ delta?: { content?: string } }>;
      };
      if (event.type === "action" && event.action) turn.actions.push(event.action);
      const delta = event.choices?.[0]?.delta?.content;
      if (delta) turn.text += delta;
    }
    this.messages.push({ role: "assistant", content: turn.text });
    return turn;
  }
}

const types = (turn: Turn) => turn.actions.map((action) => action.type);

describe("POST /api/chat — go back", () => {
  it("vehicle opened from filtered results → go back returns to those results", async () => {
    const chat = new Conversation();
    const search = await chat.say("do you have any Porsches?", { pagePath: "/vehicles" });
    expect(search.actions).toContainEqual(expect.objectContaining({ type: "filter_inventory", make: "Porsche" }));
    const open = await chat.say("open the first one", { pagePath: "/vehicles" });
    expect(types(open)).toEqual(["navigate-target"]);

    const back = await chat.say("go back", {
      pagePath: `/vehicles/${PORSCHE_B}`,
      navigation: { hasPrevious: true, hasResults: true },
    });
    expect(back.actions).toEqual([
      {
        type: "navigate-back",
        destination: "previous",
        fallback: expect.objectContaining({ type: "filter_inventory", make: "Porsche" }),
      },
    ]);
    expect(back.text).toBe("Taking you back to the previous page.");
    expect(state.providerCalls).toBe(0);
  });

  it("with no in-app history, falls back to the conversation's verified results", async () => {
    const chat = new Conversation();
    await chat.say("do you have any Porsches?", { pagePath: "/vehicles" });
    const back = await chat.say("take me back", {
      pagePath: `/vehicles/${PORSCHE_A}`,
      navigation: { hasPrevious: false, hasResults: false },
    });
    expect(back.actions).toEqual([
      {
        type: "navigate-back",
        destination: "previous",
        fallback: expect.objectContaining({ type: "filter_inventory", make: "Porsche" }),
      },
    ]);
    expect(back.text).toBe("Taking you back to your results.");
  });

  it("with no history and no results, emits nothing and says so — no false success", async () => {
    const chat = new Conversation();
    const back = await chat.say("go back", {
      pagePath: `/vehicles/${PORSCHE_A}`,
      navigation: { hasPrevious: false, hasResults: false },
    });
    expect(back.actions).toEqual([]);
    expect(back.text).toMatch(/isn’t an earlier page on this site/);
    expect(back.text).not.toMatch(/taking you|sent you|done/i);
    expect(state.providerCalls).toBe(0);
  });

  it("on a Basic plan the action is withheld and the reply is truthful", async () => {
    state.plan = "basic";
    const chat = new Conversation();
    const back = await chat.say("go back", {
      pagePath: "/contact",
      navigation: { hasPrevious: true, hasResults: false },
    });
    expect(back.actions).toEqual([]);
    expect(back.text).toMatch(/can’t move around the site/);
  });

  it("'return to the results' while already on the results page does nothing", async () => {
    const chat = new Conversation();
    await chat.say("do you have any Porsches?", { pagePath: "/vehicles" });
    const back = await chat.say("return to the results", {
      pagePath: "/vehicles",
      navigation: { hasPrevious: true, hasResults: true },
    });
    expect(back.actions).toEqual([]);
    expect(back.text).toBe("You’re already on the results page.");
  });

  it("a history summary can never smuggle a destination in", async () => {
    const chat = new Conversation();
    const back = await chat.say("go back", {
      pagePath: "/contact",
      navigation: { hasPrevious: "true", previousPath: "https://evil.example" },
    });
    // "true" is not true: no history, no results → truthful refusal.
    expect(back.actions).toEqual([]);
    expect(JSON.stringify(back)).not.toContain("evil.example");
  });
});

describe("POST /api/chat — inventory resets are unchanged", () => {
  it("'back to full inventory' clears filters with filter_inventory, never navigate-back", async () => {
    const chat = new Conversation();
    await chat.say("do you have any Porsches?", { pagePath: "/vehicles" });
    const reset = await chat.say("back to full inventory", {
      pagePath: `/vehicles/${PORSCHE_A}`,
      navigation: { hasPrevious: true, hasResults: true },
    });
    expect(types(reset)).not.toContain("navigate-back");
    const filter = reset.actions.find((action) => action.type === "filter_inventory");
    expect(filter).toBeDefined();
    expect(filter).not.toHaveProperty("make");
  });
});

describe("POST /api/chat — truthful model replies", () => {
  it("replaces the confirmed failure: a claimed move with no action emitted", async () => {
    state.providerReply = "Done — I’ve sent you back.";
    const chat = new Conversation();
    const turn = await chat.say("what are your opening hours?");
    expect(state.providerCalls).toBe(1);
    expect(turn.actions).toEqual([]);
    expect(turn.text).not.toMatch(/sent you back|done/i);
    expect(turn.text).toMatch(/wasn’t able to change the page/);
  });

  it("drops a model-authored navigate-back and does not let its prose stand", async () => {
    state.providerReply = [
      "Taking you back now.",
      `{"type":"navigate-back","destination":"previous"}`,
    ].join("\n");
    const chat = new Conversation();
    const turn = await chat.say("what are your opening hours?");
    expect(turn.actions).toEqual([]);
    expect(turn.text).not.toContain("navigate-back");
    expect(turn.text).toMatch(/wasn’t able to change the page/);
  });

  it("drops a retired scroll-to and hides its JSON", async () => {
    state.providerReply = [
      "Our hours are 9 to 6.",
      `{"type":"scroll-to","sectionId":"hours"}`,
    ].join("\n");
    const chat = new Conversation();
    const turn = await chat.say("what are your opening hours?");
    expect(turn.actions).toEqual([]);
    expect(turn.text).toBe("Our hours are 9 to 6.");
  });

  it("leaves ordinary model prose untouched", async () => {
    state.providerReply = "We're open 9 to 6, Monday to Saturday.";
    const chat = new Conversation();
    const turn = await chat.say("what are your opening hours?");
    expect(turn.text).toBe("We're open 9 to 6, Monday to Saturday.");
  });
});
