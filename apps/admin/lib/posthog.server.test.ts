import { afterEach, describe, expect, it, vi } from "vitest";
import { posthogServerMode } from "./posthog.server";

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
});
