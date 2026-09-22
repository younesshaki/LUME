import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isInternalConciergeTraceEnabled,
  writeInternalConciergeTrace,
} from "./conciergeTrace.server";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("internal concierge traces", () => {
  it("fails closed unless every explicit internal-testing gate is present", () => {
    const enabled = {
      LUME_INTERNAL_TESTING: "1",
      LUME_CONCIERGE_TRACE_MODE: "internal_full",
      LUME_INTERNAL_TRACE_TENANT_IDS: TENANT_ID,
    };
    expect(isInternalConciergeTraceEnabled(TENANT_ID, enabled)).toBe(true);
    expect(
      isInternalConciergeTraceEnabled(TENANT_ID, {
        ...enabled,
        LUME_INTERNAL_TESTING: "0",
      }),
    ).toBe(false);
    expect(
      isInternalConciergeTraceEnabled(TENANT_ID, {
        ...enabled,
        LUME_INTERNAL_TRACE_TENANT_IDS: "22222222-2222-4222-8222-222222222222",
      }),
    ).toBe(false);
    expect(isInternalConciergeTraceEnabled("not-a-tenant-id", enabled)).toBe(false);
  });

  it("writes only bounded internal trace fields through the service client", async () => {
    vi.stubEnv("LUME_INTERNAL_TESTING", "1");
    vi.stubEnv("LUME_CONCIERGE_TRACE_MODE", "internal_full");
    vi.stubEnv("LUME_INTERNAL_TRACE_TENANT_IDS", TENANT_ID);
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn(() => ({ insert })),
    };

    const written = await writeInternalConciergeTrace(client as never, {
      tenantId: TENANT_ID,
      requestId: "33333333-3333-4333-8333-333333333333",
      conversationId: "conversation-1",
      turn: 4,
      source: "deterministic",
      userMessage: "show me BMWs",
      assistantResponse: "Here are BMWs.",
      actions: [{ type: "filter_inventory" }],
    });

    expect(written).toBe(true);
    expect(client.from).toHaveBeenCalledWith("concierge_traces");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        trace_mode: "internal_full",
        source: "deterministic",
        user_message: "show me BMWs",
        assistant_response: "Here are BMWs.",
      }),
    );
  });

  it("does not touch Supabase when trace collection is disabled", async () => {
    const client = { from: vi.fn() };
    const written = await writeInternalConciergeTrace(client as never, {
      tenantId: TENANT_ID,
      requestId: "33333333-3333-4333-8333-333333333333",
      conversationId: "conversation-1",
      turn: 1,
      source: "model",
      userMessage: "hello",
    });
    expect(written).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });
});
