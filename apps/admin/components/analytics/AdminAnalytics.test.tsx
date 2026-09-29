import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  register: vi.fn(),
  capture: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: posthog }));
let pathname = "/admin/demo-sean";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const identity = {
  distinctId: "4f1b2c3d-1111-4222-8333-944455556666",
  account: "demo-sean",
  personProperties: { lume_account: "demo-sean" },
};

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, String(value)),
  };
}

beforeEach(() => {
  vi.resetModules();
  Object.values(posthog).forEach((fn) => fn.mockClear());
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function mount(path = "/admin/demo-sean") {
  pathname = path;
  const { AdminAnalytics } = await import("./AdminAnalytics");
  return render(<AdminAnalytics token="phc_test" host="https://us.i.posthog.com" identity={identity} release="abc" />);
}

describe("AdminAnalytics", () => {
  it("records the session under the dealer's user id and names the section", async () => {
    await mount("/admin/demo-sean/website");
    expect(posthog.init).toHaveBeenCalledWith("phc_test", expect.objectContaining({
      autocapture: true,
      capture_pageview: "history_change",
      disable_session_recording: false,
    }));
    expect(posthog.identify).toHaveBeenCalledWith(identity.distinctId, identity.personProperties, expect.objectContaining({
      first_dashboard_visit_at: expect.any(String),
    }));
    expect(posthog.register).toHaveBeenCalledWith({ lume_surface: "admin", lume_account: "demo-sean", lume_release: "abc" });
    expect(posthog.capture).toHaveBeenCalledWith("admin_session_started", expect.objectContaining({ account: "demo-sean" }));
    expect(posthog.capture).toHaveBeenCalledWith("admin_section_viewed", expect.objectContaining({
      tenant_slug: "demo-sean",
      section: "website",
    }));
    expect(posthog.reset).not.toHaveBeenCalled();
  });

  it("starts a fresh identity when a different person signs in on the same browser", async () => {
    window.localStorage.setItem("lume.admin.analytics.distinct-id.v1", "someone-else");
    await mount();
    expect(posthog.reset).toHaveBeenCalledTimes(1);
    expect(posthog.identify).toHaveBeenCalledWith(identity.distinctId, expect.anything(), expect.anything());
  });

  it("reports the session start only once per browser session", async () => {
    window.sessionStorage.setItem("lume.admin.analytics.session-started.v1", "1");
    await mount();
    expect(posthog.capture).not.toHaveBeenCalledWith("admin_session_started", expect.anything());
  });
});
