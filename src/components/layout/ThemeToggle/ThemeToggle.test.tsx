import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/lib/theme/ThemeContext";
import { THEME_STORAGE_KEY } from "@/lib/theme/theme";
import { ThemeToggle } from "./ThemeToggle";

let originalAnimate: PropertyDescriptor | undefined;
let originalStartViewTransition: PropertyDescriptor | undefined;
let originalUserAgentData: PropertyDescriptor | undefined;

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

function mockChromeOnMacOS(): void {
  Object.defineProperty(window.navigator, "userAgentData", {
    configurable: true,
    value: {
      platform: "macOS",
      brands: [
        { brand: "Chromium", version: "148" },
        { brand: "Google Chrome", version: "148" },
      ],
    },
  });
}

function mockThemeReveal(): {
  animate: ReturnType<typeof vi.fn>;
  startViewTransition: ReturnType<typeof vi.fn>;
} {
  const animate = vi.fn(() => ({
    finished: Promise.resolve(),
    cancel: vi.fn(),
    finish: vi.fn(),
  }) as unknown as Animation);
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: animate,
  });

  const startViewTransition = vi.fn((callback: () => void) => {
    callback();
    return {
      ready: Promise.resolve(),
      finished: Promise.resolve(),
    };
  });
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: startViewTransition,
  });

  return { animate, startViewTransition };
}

beforeEach(() => {
  installMemoryLocalStorage();
  originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
  originalStartViewTransition = Object.getOwnPropertyDescriptor(document, "startViewTransition");
  originalUserAgentData = Object.getOwnPropertyDescriptor(window.navigator, "userAgentData");
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  if (originalAnimate) {
    Object.defineProperty(HTMLElement.prototype, "animate", originalAnimate);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  }
  if (originalStartViewTransition) {
    Object.defineProperty(document, "startViewTransition", originalStartViewTransition);
  } else {
    Reflect.deleteProperty(document, "startViewTransition");
  }
  if (originalUserAgentData) {
    Object.defineProperty(window.navigator, "userAgentData", originalUserAgentData);
  } else {
    Reflect.deleteProperty(window.navigator, "userAgentData");
  }
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

  it("uses the same circular reveal as Admin on Chrome for macOS", async () => {
    mockMotionPreference(false);
    mockChromeOnMacOS();
    const { animate, startViewTransition } = mockThemeReveal();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", {
      name: "Switch website color theme to light",
    }));

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(animate).toHaveBeenCalledWith(
        {
          clipPath: [
            expect.stringMatching(/^circle\(0px at /),
            expect.stringMatching(/^circle\(\d+px at /),
          ],
        },
        {
          duration: 350,
          easing: "ease-in-out",
          pseudoElement: "::view-transition-new(root)",
        }
      );
    });
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
