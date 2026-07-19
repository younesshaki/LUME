import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedThemeToggler } from "./animated-theme-toggler";

let originalSrcdoc: PropertyDescriptor | undefined;
let originalAnimate: PropertyDescriptor | undefined;
let originalUserAgentData: PropertyDescriptor | undefined;

beforeEach(() => {
  document.documentElement.classList.remove("dark");
  originalSrcdoc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "srcdoc");
  originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
  originalUserAgentData = Object.getOwnPropertyDescriptor(window.navigator, "userAgentData");
});

afterEach(() => {
  document.querySelectorAll("[data-theme-reveal-overlay], [data-theme-solid-cover]")
    .forEach((node) => node.remove());
  document.documentElement.classList.remove("dark");
  Reflect.deleteProperty(document, "startViewTransition");
  if (originalSrcdoc) {
    Object.defineProperty(HTMLIFrameElement.prototype, "srcdoc", originalSrcdoc);
  }
  if (originalAnimate) {
    Object.defineProperty(HTMLElement.prototype, "animate", originalAnimate);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  }
  if (originalUserAgentData) {
    Object.defineProperty(window.navigator, "userAgentData", originalUserAgentData);
  } else {
    Reflect.deleteProperty(window.navigator, "userAgentData");
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockMotionPreference(reduced: boolean): void {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: reduced,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
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

function mockSnapshotAnimation(finished: Promise<unknown> = Promise.resolve()): {
  cancel: ReturnType<typeof vi.fn>;
  animate: ReturnType<typeof vi.fn>;
} {
  let srcdocValue = "";
  Object.defineProperty(HTMLIFrameElement.prototype, "srcdoc", {
    configurable: true,
    get() { return srcdocValue; },
    set(value: string) {
      srcdocValue = value;
      if (this.contentWindow) {
        Object.defineProperty(this.contentWindow, "scrollTo", {
          configurable: true,
          value: vi.fn(),
        });
      }
      if (this.contentDocument) {
        const snapshotTheme = value.match(/data-theme-reveal-snapshot="(light|dark)"/)?.[1];
        if (snapshotTheme) {
          this.contentDocument.documentElement.dataset.themeRevealSnapshot = snapshotTheme;
        }
      }
      queueMicrotask(() => this.dispatchEvent(new Event("load")));
    },
  });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => (
    window.setTimeout(() => callback(performance.now()), 0)
  ));
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => window.clearTimeout(id));
  const cancel = vi.fn();
  const animate = vi.fn(() => ({
    finished,
    cancel,
    finish: vi.fn(),
  }) as unknown as Animation);
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: animate,
  });
  return { cancel, animate };
}

describe("AnimatedThemeToggler", () => {
  it("switches immediately without an overlay for reduced motion", () => {
    mockMotionPreference(true);
    const onThemeChange = vi.fn();
    render(<AnimatedThemeToggler theme="light" onThemeChange={onThemeChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));

    expect(onThemeChange).toHaveBeenCalledWith("dark");
    expect(document.querySelector("[data-theme-reveal-overlay]")).toBeNull();
  });

  it("serializes rapid clicks and removes the destination snapshot after commit", async () => {
    mockMotionPreference(false);
    mockSnapshotAnimation();
    const startViewTransition = vi.fn();
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    });
    const onThemeChange = vi.fn(() => document.documentElement.classList.add("dark"));
    render(
      <AnimatedThemeToggler
        theme="light"
        onThemeChange={onThemeChange}
        duration={50}
      />,
    );
    const button = screen.getByRole("button", { name: "Toggle theme" });

    for (let index = 0; index < 25; index += 1) fireEvent.click(button);

    await waitFor(() => expect(onThemeChange).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(document.querySelector("[data-theme-reveal-overlay]")).toBeNull();
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(startViewTransition).not.toHaveBeenCalled();
  });

  it("uses the same iframe clip reveal when the browser identifies as Chrome on macOS", async () => {
    mockMotionPreference(false);
    mockChromeOnMacOS();
    const { animate } = mockSnapshotAnimation();
    const createElement = vi.spyOn(document, "createElement");
    const onThemeChange = vi.fn(() => document.documentElement.classList.add("dark"));

    render(
      <AnimatedThemeToggler
        theme="light"
        onThemeChange={onThemeChange}
        duration={50}
      />,
    );
    createElement.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));

    await waitFor(() => expect(onThemeChange).toHaveBeenCalledWith("dark"));
    await waitFor(() => {
      expect(document.querySelector("[data-theme-reveal-overlay]")).toBeNull();
    });
    expect(createElement).toHaveBeenCalledWith("iframe");
    expect(document.querySelector("[data-theme-solid-cover]")).toBeNull();
    expect(animate).toHaveBeenCalledWith(
      { clipPath: expect.any(Array) },
      expect.objectContaining({ fill: "forwards" }),
    );
  });

  it("cancels an in-flight reveal and removes its overlay on unmount", async () => {
    mockMotionPreference(false);
    const { animate, cancel } = mockSnapshotAnimation(new Promise(() => undefined));
    const { unmount } = render(
      <AnimatedThemeToggler theme="light" onThemeChange={vi.fn()} duration={50} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    await waitFor(() => expect(animate).toHaveBeenCalledTimes(1));
    expect(document.querySelector("[data-theme-reveal-overlay]")).not.toBeNull();

    unmount();

    expect(cancel).toHaveBeenCalled();
    expect(document.querySelector("[data-theme-reveal-overlay]")).toBeNull();
  });
});
