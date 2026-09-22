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

  it("initializes with autocapture and replay enabled, while masking replay text", async () => {
    vi.stubEnv("VITE_POSTHOG_ENABLED", "1");
    vi.stubEnv("VITE_POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://posthog.test");
    vi.stubEnv("VITE_POSTHOG_SESSION_REPLAY", "1");
    const { captureLumeEvent, initializeLumePostHog } = await import("./posthog");

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
          maskAllInputs: true,
          maskTextSelector: "*",
        }),
      }),
    );
    expect(capture).toHaveBeenCalledWith("lume_concierge_turn_completed", {
      duration_ms: 42,
      response_started: true,
    });
  });
});
