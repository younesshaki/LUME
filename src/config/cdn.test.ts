import { afterEach, describe, expect, it, vi } from "vitest";

describe("cdn helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("builds media URLs from the configured R2 base", async () => {
    vi.stubEnv("VITE_R2_PUBLIC_BASE_URL", "https://cdn.example.com/lume");
    const { mediaUrl } = await import("./cdn");

    expect(mediaUrl("products/red-bull.webp")).toBe(
      "https://cdn.example.com/lume/products/red-bull.webp"
    );
  });

  it("uses Supabase storage as the fallback base when configured", async () => {
    vi.stubEnv("VITE_R2_PUBLIC_BASE_URL", "https://r2.example.com");
    vi.stubEnv("VITE_SUPABASE_STORAGE_URL", "https://storage.example.com");
    const { fallbackMediaUrl, toFallbackUrl } = await import("./cdn");

    expect(fallbackMediaUrl("LUMElogo.png")).toBe(
      "https://storage.example.com/LUMElogo.png"
    );
    expect(toFallbackUrl("https://r2.example.com/LUMElogo.png")).toBe(
      "https://storage.example.com/LUMElogo.png"
    );
  });
});
