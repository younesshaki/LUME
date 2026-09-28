import { describe, expect, it } from "vitest";
import {
  THEME_CHOICE_STORAGE_KEY,
  THEME_SITE_DEFAULT_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applySiteDefaultMode,
  persistThemeMode,
  readThemeMode,
} from "./theme";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe("template default colour mode", () => {
  it("shows a light-default template in light for a first-time visitor", () => {
    const storage = memoryStorage();
    expect(applySiteDefaultMode("light", storage)).toBe("light");
    expect(storage.values.get(THEME_SITE_DEFAULT_STORAGE_KEY)).toBe("light");
    expect(storage.values.has(THEME_STORAGE_KEY)).toBe(false);
  });

  it("overrides a stored mode the visitor never chose (the old boot script saved dark)", () => {
    const storage = memoryStorage({ [THEME_STORAGE_KEY]: "dark" });
    expect(applySiteDefaultMode("light", storage)).toBe("light");
  });

  it("never overrides the visitor's own choice", () => {
    const storage = memoryStorage();
    persistThemeMode("dark", storage);
    expect(storage.values.get(THEME_CHOICE_STORAGE_KEY)).toBe("1");
    expect(applySiteDefaultMode("light", storage)).toBe("dark");
  });

  it("keeps today's behaviour for a template without a default", () => {
    const storage = memoryStorage({ [THEME_STORAGE_KEY]: "light", [THEME_SITE_DEFAULT_STORAGE_KEY]: "light" });
    expect(applySiteDefaultMode(null, storage)).toBe("light");
    expect(storage.values.has(THEME_SITE_DEFAULT_STORAGE_KEY)).toBe(false);
    expect(applySiteDefaultMode(null, memoryStorage())).toBe("dark");
  });

  it("paints the last site's default before the design loads", () => {
    expect(readThemeMode(memoryStorage({ [THEME_SITE_DEFAULT_STORAGE_KEY]: "light" }))).toBe("light");
  });
});
