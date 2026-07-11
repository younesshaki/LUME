import { afterEach, describe, expect, it, vi } from "vitest";
import { getLeadAttribution, type LeadAttributionEnvironment } from "./leadAttribution";

const STORAGE_KEY = "lume-lead-attribution";

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("getLeadAttribution", () => {
  it("captures UTM parameters and referrer on the first touch", () => {
    const storage = createMemoryStorage();

    expect(
      getLeadAttribution(
        {},
        {
          search:
            "?utm_source=google&utm_medium=cpc&utm_campaign=summer&utm_content=hero%20cta",
          referrer: "https://search.example/results",
          storage,
        },
      ),
    ).toEqual({
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "summer",
      utmContent: "hero cta",
      referrer: "https://search.example/results",
    });

    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? "null")).toEqual({
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "summer",
      utmContent: "hero cta",
      referrer: "https://search.example/results",
    });
  });

  it("preserves first-touch values across SPA navigation", () => {
    const storage = createMemoryStorage();

    getLeadAttribution({}, { search: "?utm_source=first", storage });

    expect(
      getLeadAttribution(
        {},
        {
          search: "?utm_source=second&utm_campaign=later",
          referrer: "https://later.example",
          storage,
        },
      ),
    ).toEqual({ utmSource: "first" });
  });

  it("lets explicit submission values override first-touch attribution without rewriting it", () => {
    const storage = createMemoryStorage();
    getLeadAttribution({}, { search: "?utm_source=google&utm_campaign=launch", storage });

    expect(
      getLeadAttribution(
        { utmSource: "partner", utmContent: "chat", utmCampaign: null },
        { search: "", storage },
      ),
    ).toEqual({ utmSource: "partner", utmContent: "chat" });

    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? "null")).toEqual({
      utmSource: "google",
      utmCampaign: "launch",
    });
  });

  it("bounds captured, restored, and caller-provided values", () => {
    const storage = createMemoryStorage();
    const result = getLeadAttribution(
      { utmMedium: ` ${"m".repeat(300)} ` },
      {
        search: `?utm_source=${"s".repeat(300)}`,
        referrer: ` ${"r".repeat(2_100)} `,
        storage,
      },
    );

    expect(result.utmSource).toHaveLength(120);
    expect(result.utmMedium).toHaveLength(120);
    expect(result.referrer).toHaveLength(2_048);

    const persisted = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null") as Record<
      string,
      string
    >;
    expect(persisted.utmSource).toHaveLength(120);
    expect(persisted.referrer).toHaveLength(2_048);
  });

  it("recovers from malformed stored data", () => {
    const storage = createMemoryStorage({ [STORAGE_KEY]: "{not-json" });

    expect(getLeadAttribution({}, { search: "?utm_source=fresh", storage })).toEqual({
      utmSource: "fresh",
    });
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? "null")).toEqual({
      utmSource: "fresh",
    });

    storage.setItem(STORAGE_KEY, JSON.stringify({ utmSource: 42 }));
    expect(getLeadAttribution({}, { search: "?utm_source=valid", storage })).toEqual({
      utmSource: "valid",
    });
  });

  it("degrades safely when session storage is unavailable", () => {
    const storage = {
      getItem(): string | null {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem(): void {
        throw new DOMException("blocked", "SecurityError");
      },
    };

    expect(
      getLeadAttribution({}, { search: "?utm_campaign=safe", referrer: "https://ref.example", storage }),
    ).toEqual({ utmCampaign: "safe", referrer: "https://ref.example" });
  });

  it("uses browser state by default", () => {
    window.history.replaceState({}, "", "/?utm_source=browser");

    expect(getLeadAttribution()).toEqual({ utmSource: "browser" });
    expect(getLeadAttribution({}, { search: "?utm_source=later", storage: window.sessionStorage })).toEqual({
      utmSource: "browser",
    });
  });

  it("is safe when no browser globals are available", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);

    expect(getLeadAttribution()).toEqual({});
  });
});

function createMemoryStorage(initial: Record<string, string> = {}): NonNullable<
  LeadAttributionEnvironment["storage"]
> {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}
