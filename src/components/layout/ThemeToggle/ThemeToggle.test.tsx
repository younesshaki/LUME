import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/lib/theme/ThemeContext";
import { THEME_STORAGE_KEY } from "@/lib/theme/theme";
import { ThemeToggle } from "./ThemeToggle";

let originalSrcdoc: PropertyDescriptor | undefined;
let originalAnimate: PropertyDescriptor | undefined;

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

function mockSnapshotAnimation(): ReturnType<typeof vi.fn> {
  let srcdocValue = "";
  Object.defineProperty(HTMLIFrameElement.prototype, "srcdoc", {
    configurable: true,
    get() {
      return srcdocValue;
    },
    set(value: string) {
      srcdocValue = value;
      const snapshotTheme = value.match(/data-theme-reveal-snapshot="(light|dark)"/)?.[1];
      if (snapshotTheme && this.contentDocument) {
        this.contentDocument.documentElement.dataset.themeRevealSnapshot = snapshotTheme;
      }
      queueMicrotask(() => this.dispatchEvent(new Event("load")));
    },
  });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => (
    window.setTimeout(() => callback(performance.now()), 0)
  ));
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => window.clearTimeout(id));
  const animate = vi.fn(() => ({
    finished: Promise.resolve(),
    cancel: vi.fn(),
    finish: vi.fn(),
  }) as unknown as Animation);
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: animate,
  });
  return animate;
}

beforeEach(() => {
  installMemoryLocalStorage();
  originalSrcdoc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "srcdoc");
  originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
});

afterEach(() => {
  document.querySelectorAll("[data-theme-reveal-overlay], [data-theme-solid-cover]")
    .forEach((node) => node.remove());
  document.documentElement.removeAttribute("data-theme");
  if (originalSrcdoc) {
    Object.defineProperty(HTMLIFrameElement.prototype, "srcdoc", originalSrcdoc);
  }
  if (originalAnimate) {
    Object.defineProperty(HTMLElement.prototype, "animate", originalAnimate);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
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

  it("uses one iframe clip reveal and serializes rapid clicks", async () => {
    mockMotionPreference(false);
    const animate = mockSnapshotAnimation();
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
    for (let index = 0; index < 20; index += 1) fireEvent.click(toggle);

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    await waitFor(() => {
      expect(document.querySelector("[data-theme-reveal-overlay]")).toBeNull();
    });
    expect(createElement).toHaveBeenCalledWith("iframe");
    expect(document.querySelector("[data-theme-solid-cover]")).toBeNull();
    expect(animate).toHaveBeenCalledWith(
      { clipPath: expect.any(Array) },
      expect.objectContaining({ duration: 350, fill: "forwards" })
    );
  });
});
