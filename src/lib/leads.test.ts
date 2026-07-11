import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitLead } from "./leads";

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/?utm_source=google&utm_campaign=launch");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("submitLead", () => {
  it("sends credentialed first-touch attribution with caller values taking precedence", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ leadId: "lead-1" }, { status: 201 }));
    vi.stubGlobal("fetch", fetcher);

    await expect(submitLead({
      email: "visitor@example.com",
      source: "contact-form",
      utmSource: "partner",
    })).resolves.toEqual({ leadId: "lead-1" });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/leads?tenant=");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toMatchObject({
      email: "visitor@example.com",
      source: "contact-form",
      utmSource: "partner",
      utmCampaign: "launch",
    });
  });
});
