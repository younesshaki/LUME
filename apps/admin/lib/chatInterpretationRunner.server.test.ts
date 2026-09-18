import { afterEach, describe, expect, it, vi } from "vitest";
import { runShadowInterpretation } from "./chatInterpretationRunner.server";
import type { ResolvedChatProvider } from "./chatProviderResolution";
import { getConciergeModelProfile } from "./conciergeModels";

const provider: ResolvedChatProvider = {
  requestedModelId: "deepseek-v4-flash",
  profile: getConciergeModelProfile("deepseek-v4-flash"),
  apiKey: "test-key",
  apiUrl: "https://provider.invalid/chat",
  fellBack: false,
};

const base = {
  provider,
  userMessage: "BMWs under 50k",
  context: {
    surface: "public" as const,
    activeFilters: {},
    resultSetSize: 0,
    resultSetTotal: null,
    hasSelection: false,
    deterministicFilters: {},
    pendingClarification: null,
  },
  deterministic: {
    kind: "search" as const,
    filters: {},
    hasReference: false,
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("shadow interpretation provider accounting", () => {
  it("returns the validated candidate and provider usage for evaluation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    kind: "search",
                    setFilters: { make: "BMW", priceMax: 50000 },
                    clearFilters: [],
                    reference: null,
                    clarifyReason: null,
                    unsupportedClauses: [],
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 40, completion_tokens: 20 },
          }),
          { status: 200 },
        ),
      ),
    );
    const result = await runShadowInterpretation(base);
    expect(result.outcome).toBe("accepted");
    expect(result.candidate?.setFilters).toEqual({
      make: "BMW",
      priceMax: 50000,
    });
    expect(result.usage).toEqual({ inputTokens: 40, outputTokens: 20 });
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as {
      max_tokens?: number;
      temperature?: number;
    };
    expect(body.max_tokens).toBe(350);
    expect(body.temperature).toBe(0);
  });

  it("counts non-2xx and malformed responses as attempted calls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("no", { status: 429 })),
    );
    await expect(runShadowInterpretation(base)).resolves.toMatchObject({
      outcome: "provider_error",
      modelCalls: 1,
      candidate: null,
    });

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
          ),
        ),
    );
    await expect(runShadowInterpretation(base)).resolves.toMatchObject({
      outcome: "malformed",
      modelCalls: 1,
      candidate: null,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })),
    );
    await expect(runShadowInterpretation(base)).resolves.toMatchObject({
      outcome: "malformed",
      modelCalls: 1,
    });
  });

  it("distinguishes an aborted provider call as a timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")),
    );
    await expect(runShadowInterpretation(base)).resolves.toMatchObject({
      outcome: "timeout",
      modelCalls: 1,
      candidate: null,
    });
  });
});
