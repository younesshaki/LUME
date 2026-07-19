import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedThemeToggler } from "./animated-theme-toggler";

let originalAnimate: PropertyDescriptor | undefined;
let originalUserAgentData: PropertyDescriptor | undefined;

beforeEach(() => {
  document.documentElement.classList.remove("dark");
  originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
  originalUserAgentData = Object.getOwnPropertyDescriptor(window.navigator, "userAgentData");
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
  Reflect.deleteProperty(document, "startViewTransition");
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
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
}

function mockAnimate(): ReturnType<typeof vi.fn> {
  const animate = vi.fn(() => ({
    finished: Promise.resolve(),
    cancel: vi.fn(),
    finish: vi.fn(),
  }) as unknown as Animation);
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
  return animate;
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

/** Install a View Transitions API that runs the callback and reports the given finished promise. */
function mockViewTransitions(finished: Promise<unknown> = Promise.resolve()): ReturnType<typeof vi.fn> {
  const startViewTransition = vi.fn((callback: () => void) => {
    callback();
    return { ready: Promise.resolve(), finished };
  });
  Object.defineProperty(document, "startViewTransition", { configurable: true, value: startViewTransition });
  return startViewTransition;
}

describe("AnimatedThemeToggler", () => {
  it("switches immediately without a reveal for reduced motion", () => {
    mockMotionPreference(true);
    const onThemeChange = vi.fn();
    render(<AnimatedThemeToggler theme="light" onThemeChange={onThemeChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));

    expect(onThemeChange).toHaveBeenCalledWith("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("commits the theme without an iframe when View Transitions is unavailable", () => {
    mockMotionPreference(false);
    mockAnimate();
    const createElement = vi.spyOn(document, "createElement");
    const onThemeChange = vi.fn();
    render(<AnimatedThemeToggler theme="light" onThemeChange={onThemeChange} duration={50} />);
    createElement.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));

    expect(onThemeChange).toHaveBeenCalledWith("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(createElement).not.toHaveBeenCalledWith("iframe");
  });

  it("uses the standard root reveal on Chrome for macOS too", async () => {
    mockMotionPreference(false);
    mockChromeOnMacOS();
    const animate = mockAnimate();
    const startViewTransition = mockViewTransitions();
    const onThemeChange = vi.fn();
    render(
      <AnimatedThemeToggler
        theme="light"
        onThemeChange={onThemeChange}
        duration={350}
        variant="circle"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(onThemeChange).toHaveBeenCalledWith("dark");
    await waitFor(() =>
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
        },
      ),
    );
  });

  it("serializes rapid clicks while a transition is in flight", () => {
    mockMotionPreference(false);
    mockAnimate();
    // A never-resolving finished promise keeps the toggle in-flight.
    const startViewTransition = mockViewTransitions(new Promise(() => undefined));
    render(<AnimatedThemeToggler theme="light" onThemeChange={vi.fn()} duration={50} />);
    const button = screen.getByRole("button", { name: "Toggle theme" });

    for (let index = 0; index < 12; index += 1) fireEvent.click(button);

    expect(startViewTransition).toHaveBeenCalledTimes(1);
  });
});
