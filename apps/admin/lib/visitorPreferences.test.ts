import { afterEach, describe, expect, it } from "vitest";
import {
  completeVisitorPreferenceTurn,
  isVisitorPreferenceLearningEnabled,
  loadVisitorPreferenceContext,
  openVisitorPreferenceTurn,
  recomputeVisitorPreferences,
  visitorPreferenceSystemPrompt,
} from "./visitorPreferences";

type FakeResult = { data: unknown; error: unknown };
type FakeFilter = { kind: "eq" | "in"; column: string; value: unknown };
type FakeCall = {
  table: string;
  operation: "select" | "insert" | "update" | "upsert";
  payload?: unknown;
  options?: unknown;
  filters: FakeFilter[];
  selection?: string;
  limit?: number;
  orders?: Array<{ column: string; ascending: boolean | undefined }>;
};

class FakeClient {
  readonly calls: FakeCall[] = [];
  constructor(private readonly responses: FakeResult[]) {}

  from(table: string): FakeBuilder {
    const call: FakeCall = { table, operation: "select", filters: [] };
    this.calls.push(call);
    return new FakeBuilder(call, () => this.responses.shift() ?? ok(null));
  }
}

class FakeBuilder {
  private resolved: Promise<FakeResult> | null = null;

  constructor(
    private readonly call: FakeCall,
    private readonly nextResult: () => FakeResult,
  ) {}

  select(selection: string): this {
    this.call.selection = selection;
    return this;
  }

  insert(payload: unknown): this {
    this.call.operation = "insert";
    this.call.payload = payload;
    return this;
  }

  update(payload: unknown): this {
    this.call.operation = "update";
    this.call.payload = payload;
    return this;
  }

  upsert(payload: unknown, options?: unknown): this {
    this.call.operation = "upsert";
    this.call.payload = payload;
    this.call.options = options;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.call.filters.push({ kind: "eq", column, value });
    return this;
  }

  in(column: string, value: readonly unknown[]): this {
    this.call.filters.push({ kind: "in", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.call.orders ??= [];
    this.call.orders.push({ column, ascending: options?.ascending });
    return this;
  }

  limit(value: number): this {
    this.call.limit = value;
    return this;
  }

  maybeSingle(): Promise<FakeResult> {
    return this.resolve();
  }

  single(): Promise<FakeResult> {
    return this.resolve();
  }

  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.resolve().then(onfulfilled, onrejected);
  }

  private resolve(): Promise<FakeResult> {
    this.resolved ??= Promise.resolve(this.nextResult());
    return this.resolved;
  }
}

const savedFlag = process.env.VISITOR_PREFERENCE_LEARNING_ENABLED;
const SESSION_ONE = "00000000-0000-4000-8000-000000000001";
const SAFE_SESSION = "00000000-0000-4000-8000-000000000002";
const FOREIGN_SESSION = "00000000-0000-4000-8000-000000000003";

afterEach(() => {
  if (savedFlag === undefined) delete process.env.VISITOR_PREFERENCE_LEARNING_ENABLED;
  else process.env.VISITOR_PREFERENCE_LEARNING_ENABLED = savedFlag;
});

describe("visitor preference feature flag", () => {
  it("is default-off and accepts only an explicit true value", () => {
    expect(isVisitorPreferenceLearningEnabled(undefined)).toBe(false);
    expect(isVisitorPreferenceLearningEnabled("false")).toBe(false);
    expect(isVisitorPreferenceLearningEnabled("1")).toBe(false);
    expect(isVisitorPreferenceLearningEnabled(" TRUE ")).toBe(true);
  });

  it("keeps both profile reads and prompt rendering off", async () => {
    const client = new FakeClient([]);
    await expect(loadVisitorPreferenceContext(client as never, identity(false))).resolves.toBeNull();
    expect(client.calls).toHaveLength(0);
    expect(visitorPreferenceSystemPrompt(
      { preferredMakes: ["Porsche"], bodyStyles: [], budget: null },
      false,
    )).toBe("");
  });
});

describe("canonical visitor chat persistence", () => {
  it("validates tenant and visitor ownership before appending a trusted user turn", async () => {
    const client = new FakeClient([
      ok({ id: SESSION_ONE }),
      ok(null),
      ok(null),
    ]);

    await expect(openVisitorPreferenceTurn(client as never, {
      tenantId: "tenant-1",
      visitorId: "visitor-1",
      requestedSessionId: SESSION_ONE,
      userContent: "  I prefer Porsche  ",
    })).resolves.toEqual({ sessionId: SESSION_ONE });

    expectFilters(client.calls[0], {
      tenant_id: "tenant-1",
      visitor_id: "visitor-1",
      id: SESSION_ONE,
    });
    expect(client.calls.at(-1)).toMatchObject({
      table: "chat_messages",
      operation: "insert",
      payload: {
        tenant_id: "tenant-1",
        session_id: SESSION_ONE,
        role: "user",
        content: "I prefer Porsche",
        is_server_observed: true,
      },
    });
  });

  it("creates a tenant-owned session when a supplied session is not owned", async () => {
    const client = new FakeClient([
      ok(null),
      ok({ id: SAFE_SESSION }),
      ok(null),
      ok(null),
    ]);
    await expect(openVisitorPreferenceTurn(client as never, {
      tenantId: "tenant-1",
      visitorId: "visitor-1",
      requestedSessionId: FOREIGN_SESSION,
      userContent: "SUV please",
    })).resolves.toEqual({ sessionId: SAFE_SESSION });

    expect(client.calls.find((call) => call.table === "chat_sessions" && call.operation === "insert"))
      .toMatchObject({ payload: { tenant_id: "tenant-1", visitor_id: "visitor-1" } });
  });

  it("uses a client reset UUID once and reuses it safely on retry", async () => {
    const client = new FakeClient([
      ok(null),
      ok({ id: SAFE_SESSION }),
      ok(null),
      ok(null),
    ]);
    await expect(openVisitorPreferenceTurn(client as never, {
      tenantId: "tenant-1",
      visitorId: "visitor-1",
      requestedSessionId: SAFE_SESSION,
      startNewSession: true,
      userContent: "new conversation",
    })).resolves.toEqual({ sessionId: SAFE_SESSION });

    expect(client.calls[1]).toMatchObject({
      table: "chat_sessions",
      operation: "insert",
      payload: {
        id: SAFE_SESSION,
        tenant_id: "tenant-1",
        visitor_id: "visitor-1",
      },
    });
  });

  it("self-heals a malformed stored session ID without querying it", async () => {
    const client = new FakeClient([
      ok(null),
      ok({ id: SAFE_SESSION }),
      ok(null),
      ok(null),
    ]);
    await expect(openVisitorPreferenceTurn(client as never, {
      tenantId: "tenant-1",
      visitorId: "visitor-1",
      requestedSessionId: "corrupt-browser-value",
      userContent: "SUV please",
    })).resolves.toEqual({ sessionId: SAFE_SESSION });

    expectFilters(client.calls[0], { tenant_id: "tenant-1", visitor_id: "visitor-1" });
    expect(client.calls[0].filters.some((filter) => filter.column === "id")).toBe(false);
    expect(client.calls[1]).toMatchObject({ table: "chat_sessions", operation: "insert" });
  });

  it("reuses and reconciles an unfinished session after a failed request", async () => {
    const client = new FakeClient([
      ok({ id: "unfinished" }),
      ok({ id: "user-message", role: "user", content: "old request" }),
      ok({ id: "user-message", role: "user", content: "old request" }),
      ok(null),
    ]);
    await expect(openVisitorPreferenceTurn(client as never, {
      tenantId: "tenant-1",
      visitorId: "visitor-1",
      userContent: "new request",
    })).resolves.toEqual({ sessionId: "unfinished" });

    expect(client.calls.some((call) => call.table === "chat_sessions" && call.operation === "insert"))
      .toBe(false);
    const update = client.calls.find((call) => call.table === "chat_messages" && call.operation === "update");
    expect(update?.payload).toEqual({ content: "new request" });
    expectFilters(update, { tenant_id: "tenant-1", session_id: "unfinished", id: "user-message" });
  });

  it("creates a fresh session after the newest anonymous-start session completed", async () => {
    const client = new FakeClient([
      ok({ id: "completed" }),
      ok({ id: "answer", role: "assistant", content: "done" }),
      ok({ id: "fresh" }),
      ok(null),
      ok(null),
    ]);
    await expect(openVisitorPreferenceTurn(client as never, {
      tenantId: "tenant-1",
      visitorId: "visitor-1",
      userContent: "start over",
    })).resolves.toEqual({ sessionId: "fresh" });
  });

  it("stores the actual assistant output and touches only the owned session", async () => {
    const client = new FakeClient([
      ok({ id: SESSION_ONE }),
      ok({ id: "user-1", role: "user", content: "question" }),
      ok(null),
      ok(null),
    ]);
    await expect(completeVisitorPreferenceTurn(client as never, {
      tenantId: "tenant-1",
      visitorId: "visitor-1",
      sessionId: SESSION_ONE,
      assistantContent: "  The actual response.  ",
    })).resolves.toBe(true);

    expect(client.calls.find((call) => call.table === "chat_messages" && call.operation === "insert"))
      .toMatchObject({ payload: { role: "assistant", content: "The actual response.", is_server_observed: true } });
    const touch = client.calls.find((call) => call.table === "chat_sessions" && call.operation === "update");
    expectFilters(touch, { tenant_id: "tenant-1", visitor_id: "visitor-1", id: SESSION_ONE });
  });

  it("degrades safely when ownership storage is unavailable", async () => {
    const client = new FakeClient([failed()]);
    await expect(openVisitorPreferenceTurn(client as never, {
      tenantId: "tenant-1",
      visitorId: "visitor-1",
      requestedSessionId: SESSION_ONE,
      userContent: "hello",
    })).resolves.toBeNull();
    expect(client.calls).toHaveLength(1);
  });
});

describe("visitor preference profile", () => {
  it("rejects malformed stored profiles and storage failures", async () => {
    const malformed = new FakeClient([ok({ preferences: { preferredMakes: "Porsche" } })]);
    await expect(loadVisitorPreferenceContext(malformed as never, identity(true))).resolves.toBeNull();

    const unavailable = new FakeClient([failed()]);
    await expect(loadVisitorPreferenceContext(unavailable as never, identity(true))).resolves.toBeNull();
    expectFilters(unavailable.calls[0], { tenant_id: "tenant-1", visitor_id: "visitor-1" });
  });

  it("does not learn until three distinct sessions contain completed trusted turns", async () => {
    const client = new FakeClient([
      ok([{ id: "s3" }, { id: "s2" }, { id: "s1" }]),
      ok([
        { session_id: "s1", role: "user", content: "Porsche" },
        { session_id: "s2", role: "user", content: "BMW" },
        { session_id: "s3", role: "user", content: "Audi" },
        { session_id: "s1", role: "assistant", content: "response" },
        { session_id: "s2", role: "assistant", content: "response" },
      ]),
    ]);
    await expect(recomputeVisitorPreferences(client as never, identity(true))).resolves.toBeNull();
    expect(client.calls.some((call) => call.operation === "upsert")).toBe(false);

    const messages = client.calls[1];
    expectFilters(messages, {
      tenant_id: "tenant-1",
      is_server_observed: true,
      session_id: ["s1", "s2", "s3"],
      role: ["user", "assistant"],
    });
    expect(messages.limit).toBe(200);
    expect(messages.orders).toEqual([{ column: "created_at", ascending: false }]);
  });

  it("extracts from bounded trusted turns and upserts a tenant-owned profile", async () => {
    const client = new FakeClient([
      ok([{ id: "s3" }, { id: "s2" }, { id: "s1" }]),
      ok([
        { session_id: "s1", role: "user", content: "I want a Porsche SUV under $80,000" },
        { session_id: "s1", role: "assistant", content: "response" },
        { session_id: "s2", role: "user", content: "Show me Porsche coupes around $70,000" },
        { session_id: "s2", role: "assistant", content: "response" },
        { session_id: "s3", role: "user", content: "A BMW SUV below $60,000" },
        { session_id: "s3", role: "assistant", content: "response" },
      ]),
      ok([{ make: "Porsche" }, { make: "BMW" }]),
      ok(null),
    ]);

    const preferences = await recomputeVisitorPreferences(client as never, identity(true));
    expect(preferences).not.toBeNull();
    expect(preferences?.budget).toEqual({ min: null, max: 60_000, currency: "USD" });

    expectFilters(client.calls[0], { tenant_id: "tenant-1", visitor_id: "visitor-1" });
    expect(client.calls[0].limit).toBe(20);
    expectFilters(client.calls[2], { tenant_id: "tenant-1", status: "live" });
    const upsert = client.calls[3];
    expect(upsert).toMatchObject({
      table: "visitor_profiles",
      operation: "upsert",
      options: { onConflict: "tenant_id,visitor_id" },
    });
    expect(upsert.payload).toMatchObject({
      tenant_id: "tenant-1",
      visitor_id: "visitor-1",
      learned_session_count: 3,
    });
  });

  it("returns no learned context when the profile upsert fails", async () => {
    const client = new FakeClient([
      ok([{ id: "s3" }, { id: "s2" }, { id: "s1" }]),
      ok([
        { session_id: "s1", role: "user", content: "Porsche SUV" },
        { session_id: "s1", role: "assistant", content: "response" },
        { session_id: "s2", role: "user", content: "Porsche SUV" },
        { session_id: "s2", role: "assistant", content: "response" },
        { session_id: "s3", role: "user", content: "Porsche SUV" },
        { session_id: "s3", role: "assistant", content: "response" },
      ]),
      ok([{ make: "Porsche" }]),
      failed(),
    ]);
    await expect(recomputeVisitorPreferences(client as never, identity(true))).resolves.toBeNull();
  });
});

function identity(enabled: boolean) {
  return { tenantId: "tenant-1", visitorId: "visitor-1", enabled };
}

function ok(data: unknown): FakeResult {
  return { data, error: null };
}

function failed(): FakeResult {
  return { data: null, error: { message: "storage unavailable" } };
}

function expectFilters(call: FakeCall | undefined, expected: Record<string, unknown>): void {
  expect(call).toBeDefined();
  for (const [column, value] of Object.entries(expected)) {
    const filter = call?.filters.find((candidate) => candidate.column === column);
    expect(filter?.value).toEqual(value);
  }
}
