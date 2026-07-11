import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DualModeProvider } from "@/lib/DualModeContext";
import {
  COOKIE_CONSENT_STORAGE_KEY,
  COOKIE_CONSENT_VERSION,
  CookieBanner,
  openCookiePreferences,
  persistCookieConsent,
  readCookieConsent,
  resetCookieConsent,
} from "./CookieBanner";

function renderBanner() {
  return render(
    <DualModeProvider>
      <CookieBanner />
    </DualModeProvider>
  );
}

describe("CookieBanner", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, String(value));
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => store.clear(),
      },
    });
  });

  it("persists acceptance and stays hidden on the next mount", async () => {
    const first = renderBanner();
    const dialog = await screen.findByRole("dialog", { name: "Cookie consent" });

    fireEvent.click(screen.getByRole("button", { name: "Accept analytics" }));

    const stored = JSON.parse(
      window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY) ?? "{}",
    ) as { choice?: string; version?: number };
    expect(stored.choice).toBe("accepted");
    expect(stored.version).toBe(COOKIE_CONSENT_VERSION);
    await waitFor(() => expect(dialog).not.toBeInTheDocument());

    first.unmount();
    renderBanner();
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Cookie consent" })).not.toBeInTheDocument();
    });
  });

  it("treats dismiss as rejection and ignores invalid stored values", async () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "maybe");
    renderBanner();

    await screen.findByRole("dialog", { name: "Cookie consent" });
    fireEvent.click(screen.getByRole("button", { name: "Reject optional cookies and close" }));

    expect(readCookieConsent()).toBe("rejected");
  });

  it("still honors a legacy bare-string choice (pre-versioning)", () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "accepted");
    expect(readCookieConsent()).toBe("accepted");
  });

  it("re-prompts when the stored choice is from an older policy version", () => {
    window.localStorage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify({ choice: "accepted", version: COOKIE_CONSENT_VERSION - 1, at: "x" }),
    );
    expect(readCookieConsent()).toBeNull();
  });

  it("resetCookieConsent forgets the stored choice", () => {
    persistCookieConsent("accepted");
    expect(readCookieConsent()).toBe("accepted");
    resetCookieConsent();
    expect(readCookieConsent()).toBeNull();
  });

  it("openCookiePreferences re-opens the banner after a persisted choice", async () => {
    persistCookieConsent("accepted");
    renderBanner();
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Cookie consent" })).not.toBeInTheDocument();
    });

    openCookiePreferences();
    await screen.findByRole("dialog", { name: "Cookie consent" });
  });
});
