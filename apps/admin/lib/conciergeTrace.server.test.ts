import { describe, expect, it, vi } from "vitest";
import { writeInternalConciergeTrace } from "./conciergeTrace.server";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";

describe("concierge training traces", () => {
  it("writes the full trace through the service client without tenant gates", async () => {
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
});
