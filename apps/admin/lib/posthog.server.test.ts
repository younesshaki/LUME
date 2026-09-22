import { afterEach, describe, expect, it, vi } from "vitest";
import {
  conciergeTrainingProperties,
  posthogServerMode,
} from "./posthog.server";

afterEach(() => vi.unstubAllEnvs());

describe("PostHog server readiness", () => {
  it("reports off when either server-only configuration value is absent", () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("POSTHOG_HOST", "");
    expect(posthogServerMode()).toBe("off");
  });

  it("reports configured only when both values are present", () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("POSTHOG_HOST", "https://us.i.posthog.com");
    expect(posthogServerMode()).toBe("configured");
  });

  it("preserves the full training record rather than reducing it to operational scalars", () => {
    expect(
      conciergeTrainingProperties({
        requestId: "request-1",
        turn: 2,
        source: "tool",
        status: "completed",
        userMessage: "find a BMW under 70k",
        assistantResponse: "I found two.",
        stateBefore: { activeFilters: { make: "BMW" } },
        stateAfter: { activeFilters: { make: "BMW", priceMax: 70000 } },
        actions: [{ type: "filter_inventory", filters: { make: "BMW" } }],
        toolSummary: [{ name: "search_inventory", result: [{ id: "vehicle-1" }] }],
        retrieval: { totalMatched: 2 },
        model: { provider: "moonshot", modelId: "kimi-k3" },
      }),
    ).toEqual({
      request_id: "request-1",
      turn: 2,
      source: "tool",
      status: "completed",
      user_message: "find a BMW under 70k",
      assistant_response: "I found two.",
      state_before: { activeFilters: { make: "BMW" } },
      state_after: { activeFilters: { make: "BMW", priceMax: 70000 } },
      actions: [{ type: "filter_inventory", filters: { make: "BMW" } }],
      tool_summary: [{ name: "search_inventory", result: [{ id: "vehicle-1" }] }],
      retrieval: { totalMatched: 2 },
      model: { provider: "moonshot", modelId: "kimi-k3" },
    });
  });
});
