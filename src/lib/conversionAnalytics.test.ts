import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_CONSENT_STORAGE_KEY } from "@/components/CookieBanner/CookieBanner";
import { trackConversion } from "./conversionAnalytics";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";

describe("trackConversion", () => {
  const originalFetch = globalThis.fetch;
  const originalCrypto = globalThis.crypto;
  const originalLocalStorage = window.localStorage;
  const originalSessionStorage = window.sessionStorage;

  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage() });
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: storage() });
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: vi.fn(() => EVENT_ID) },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch });
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
    Object.defineProperty(window, "localStorage", { configurable: true, value: originalLocalStorage });
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: originalSessionStorage });
  });

  it("does not send analytics when consent is rejected", () => {
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetcher });
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "rejected");

    trackConversion("inventory_view");

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends only the allowlisted consented event envelope", async () => {
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () => Promise.resolve(new Response(null, { status: 202 })),
    );
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetcher });
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "accepted");

    trackConversion("vehicle_view", { vehicleId: EVENT_ID, metadata: { placement: "detail" } });

    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledOnce();
    const url = fetcher.mock.calls[0]?.[0];
    const init = fetcher.mock.calls[0]?.[1];
    expect(url).toBe("/api/events");
    expect(init?.keepalive).toBe(true);
    const body = JSON.parse(String(init?.body)) as { anonymousSessionId: string; events: Array<{ eventId: string; name: string; vehicleId: string }> };
    expect(body.anonymousSessionId).toBe(EVENT_ID);
    expect(body.events).toEqual([{ eventId: EVENT_ID, name: "vehicle_view", vehicleId: EVENT_ID, metadata: { placement: "detail" } }]);
  });
});

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } as Storage;
}
