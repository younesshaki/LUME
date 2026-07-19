import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/lib/theme/ThemeContext";
import { THEME_STORAGE_KEY } from "@/lib/theme/theme";
import { ThemeToggle } from "./ThemeToggle";

function installMemoryLocalStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, String(value)),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  });
}

function mockMotionPreference(reduced: boolean): void {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: reduced,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

beforeEach(() => {
  installMemoryLocalStorage();
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ThemeToggle", () => {
  it("only exposes a binary light/dark control and persists the selected mode", () => {
    mockMotionPreference(true);
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    const toggle = screen.getByRole("button", {
      name: "Switch website color theme to light",
    });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/auto/i)).toBeNull();

    fireEvent.click(toggle);

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(screen.getByRole("button", {
      name: "Switch website color theme to dark",
    })).toHaveAttribute("aria-pressed", "false");
  });

  it("commits the theme without cloning the page into an iframe", () => {
    // jsdom has no View Transitions API, so the toggle uses the instant path.
    // Either way, the reveal must never create an iframe snapshot.
    mockMotionPreference(false);
    const createElement = vi.spyOn(document, "createElement");
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    const toggle = screen.getByRole("button", {
      name: "Switch website color theme to light",
    });
    createElement.mockClear();
    fireEvent.click(toggle);

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(createElement).not.toHaveBeenCalledWith("iframe");
  });
});
