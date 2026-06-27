import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * featureFlag computes preview mode once at module load, so each case resets
 * modules and re-imports after setting the URL / localStorage / env.
 */
async function loadFlag(opts: {
  search?: string;
  env?: string;
  token?: string;
}) {
  vi.resetModules();
  window.history.replaceState(null, "", opts.search ?? "/");
  if (opts.env !== undefined) vi.stubEnv("VITE_PAGE_RENDERER", opts.env);
  if (opts.token !== undefined) vi.stubEnv("VITE_PREVIEW_TOKEN", opts.token);
  return import("./featureFlag");
}

const STORAGE_KEY = "lume.preview-mode.v1";

// The test runtime's window.localStorage is non-functional, so install a
// working in-memory store (fresh per test for isolation).
function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
}

describe("page renderer feature flag + preview mode", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.replaceState(null, "", "/");
  });

  it("is off by default (no env, no preview param)", async () => {
    const flag = await loadFlag({ search: "/" });
    expect(flag.isPreviewModeActive).toBe(false);
    expect(flag.isPageRendererEnabled).toBe(false);
  });

  it("is on for everyone when the build env flag is true", async () => {
    const flag = await loadFlag({ search: "/", env: "true" });
    expect(flag.isPageRendererEnabled).toBe(true);
  });

  it("turns on for a viewer with ?preview=<token> and persists it", async () => {
    const flag = await loadFlag({ search: "/?preview=lume" });
    expect(flag.isPreviewModeActive).toBe(true);
    expect(flag.isPageRendererEnabled).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("on");
  });

  it("stays on across navigation via persisted storage (no param)", async () => {
    window.localStorage.setItem(STORAGE_KEY, "on");
    const flag = await loadFlag({ search: "/products" });
    expect(flag.isPreviewModeActive).toBe(true);
  });

  it("ignores a wrong token", async () => {
    const flag = await loadFlag({ search: "/?preview=nope" });
    expect(flag.isPreviewModeActive).toBe(false);
  });

  it("respects a custom VITE_PREVIEW_TOKEN", async () => {
    const flag = await loadFlag({ search: "/?preview=s3cret", token: "s3cret" });
    expect(flag.isPreviewModeActive).toBe(true);
  });

  it("?preview=off clears persisted preview mode", async () => {
    window.localStorage.setItem(STORAGE_KEY, "on");
    const flag = await loadFlag({ search: "/?preview=off" });
    expect(flag.isPreviewModeActive).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
