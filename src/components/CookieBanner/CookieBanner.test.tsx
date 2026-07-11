import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DualModeProvider } from "@/lib/DualModeContext";
import {
  COOKIE_CONSENT_STORAGE_KEY,
  CookieBanner,
  readCookieConsent,
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

    expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBe("accepted");
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
});
