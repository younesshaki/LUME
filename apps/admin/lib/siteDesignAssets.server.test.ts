// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { validateStoredSiteBackground } from "./siteDesignAssets.server";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

describe("stored website background verification", () => {
  it("accepts stored bytes that match allowlisted response metadata", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => init.method === "HEAD"
      ? new Response(null, { status: 200, headers: { "content-type": "image/png", "content-length": "2048" } })
      : new Response(PNG, { status: 206, headers: { "content-type": "image/png" } }));
    await expect(validateStoredSiteBackground("https://storage.example/x", fetcher)).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledWith("https://storage.example/x", expect.objectContaining({
      headers: { Range: "bytes=0-511" },
    }));
  });

  it("rejects mismatched bytes and unavailable objects", async () => {
    const wrongBytes = vi.fn(async (_url: string, init: RequestInit) => init.method === "HEAD"
      ? new Response(null, { status: 200, headers: { "content-type": "image/png", "content-length": "500" } })
      : new Response(new Uint8Array([1, 2, 3, 4]), { status: 206 }));
    await expect(validateStoredSiteBackground("https://storage.example/x", wrongBytes)).resolves.toMatch(/does not match/);
    await expect(validateStoredSiteBackground("https://storage.example/x", vi.fn(async () => new Response(null, { status: 404 })))).resolves.toMatch(/unavailable/);
  });
});
