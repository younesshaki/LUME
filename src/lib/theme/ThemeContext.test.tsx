import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeContext";
import {
  persistThemeMode,
  readThemeMode,
  resolveTheme,
  THEME_MEDIA_QUERY,
  THEME_STORAGE_KEY,
} from "./theme";

function ThemeProbe() {
  const { mode, resolvedTheme, setMode } = useTheme();

  return (
    <button type="button" onClick={() => setMode("light")}>
      {mode}:{resolvedTheme}
    </button>
  );
}

function installMemoryLocalStorage() {
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
}

function installSystemTheme(initiallyDark: boolean) {
  let matches = initiallyDark;
  let listener: ((event: MediaQueryListEvent) => void) | null = null;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      expect(query).toBe(THEME_MEDIA_QUERY);
      return {
        get matches() {
          return matches;
        },
        media: query,
        onchange: null,
        addEventListener: (
          eventName: string,
          nextListener: (event: MediaQueryListEvent) => void
        ) => {
          if (eventName === "change") listener = nextListener;
        },
        removeEventListener: (
          eventName: string,
          currentListener: (event: MediaQueryListEvent) => void
        ) => {
          if (eventName === "change" && listener === currentListener) listener = null;
        },
      };
    },
  });

  return {
    setDark(nextMatches: boolean) {
      matches = nextMatches;
      act(() => {
        listener?.({ matches: nextMatches } as MediaQueryListEvent);
      });
    },
  };
}

describe("theme resolution", () => {
  it("resolves explicit modes and the current system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
    expect(resolveTheme("auto", true)).toBe("dark");
  });

  it("defaults to auto and persists valid selections", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };

    expect(readThemeMode(storage)).toBe("auto");
    persistThemeMode("dark", storage);
    expect(values.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(readThemeMode(storage)).toBe("dark");

    values.set(THEME_STORAGE_KEY, "sepia");
    expect(readThemeMode(storage)).toBe("auto");
  });
});

describe("ThemeProvider", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it("updates auto mode live when the OS preference changes", () => {
    const systemTheme = installSystemTheme(false);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveTextContent("auto:light");
    expect(document.documentElement.dataset.theme).toBe("light");

    systemTheme.setDark(true);

    expect(screen.getByRole("button")).toHaveTextContent("auto:dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("loads and persists an explicit choice", () => {
    installSystemTheme(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveTextContent("dark:dark");
    fireEvent.click(screen.getByRole("button"));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
