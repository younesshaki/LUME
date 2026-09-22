import { afterEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();
const capture = vi.fn();

vi.mock("posthog-js", () => ({
  default: { init, capture },
}));

afterEach(() => {
  init.mockReset();
  capture.mockReset();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("LUME PostHog browser telemetry", () => {
  it("is disabled without the explicit browser configuration", async () => {
    vi.stubEnv("VITE_POSTHOG_ENABLED", "0");
    const { captureLumeEvent, initializeLumePostHog } = await import("./posthog");
    initializeLumePostHog();
    captureLumeEvent("lume_concierge_opened");
    expect(init).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it("initializes with autocapture and unmasked replay, then records the full training transcript", async () => {
    vi.stubEnv("VITE_POSTHOG_ENABLED", "1");
    vi.stubEnv("VITE_POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://posthog.test");
    vi.stubEnv("VITE_POSTHOG_SESSION_REPLAY", "1");
    const {
      captureLumeConciergeTranscript,
      captureLumeEvent,
      initializeLumePostHog,
    } = await import("./posthog");

    initializeLumePostHog();
    captureLumeEvent("lume_concierge_turn_completed", {
      duration_ms: 42,
      response_started: true,
    });

    expect(init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        api_host: "https://posthog.test",
        autocapture: true,
        capture_pageview: true,
        capture_pageleave: true,
        disable_session_recording: false,
        session_recording: expect.objectContaining({
          maskAllInputs: false,
        }),
      }),
    );
    expect(capture).toHaveBeenCalledWith("lume_concierge_turn_completed", {
      duration_ms: 42,
      response_started: true,
    });
    captureLumeConciergeTranscript({
      turnId: "turn-1",
      conversationId: "conversation-1",
      userMessage: "show me BMWs",
      assistantResponse: "Here are BMWs.",
      history: [
        { role: "user", content: "show me BMWs" },
        { role: "assistant", content: "Here are BMWs." },
      ],
      sourceCategories: ["vehicles"],
      actionTypes: ["filter_inventory"],
    });
    expect(capture).toHaveBeenLastCalledWith("lume_concierge_transcript", {
      turn_id: "turn-1",
      conversation_id: "conversation-1",
      user_message: "show me BMWs",
      assistant_response: "Here are BMWs.",
      conversation_history_json: JSON.stringify([
        { role: "user", content: "show me BMWs" },
        { role: "assistant", content: "Here are BMWs." },
      ]),
      source_categories_json: JSON.stringify(["vehicles"]),
      action_types_json: JSON.stringify(["filter_inventory"]),
    });
  });
});
