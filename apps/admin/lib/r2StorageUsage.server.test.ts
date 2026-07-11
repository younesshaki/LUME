// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  measureTenantR2Storage,
  parseR2StoragePage,
  r2TenantPrefix,
} from "./r2StorageUsage.server";

const config = {
  endpoint: "https://account.r2.cloudflarestorage.com",
  bucket: "tenant-assets",
  accessKeyId: "access",
  secretAccessKey: "secret",
};

describe("R2 storage page parsing", () => {
  it("sums object sizes without returning keys", () => {
    expect(parseR2StoragePage(listXml({ sizes: [0, 12, 30] }))).toEqual({
      bytes: 42,
      objectCount: 3,
      nextContinuationToken: null,
    });
  });

  it("decodes a bounded continuation token", () => {
    expect(parseR2StoragePage(listXml({
      sizes: [5],
      truncated: true,
      token: "next+page&amp;more=1",
    }))?.nextContinuationToken).toBe("next+page&more=1");
  });

  it("rejects partial, malformed, and overflowing pages", () => {
    expect(parseR2StoragePage("<ListBucketResult><IsTruncated>false</IsTruncated>"))
      .toBeNull();
    expect(parseR2StoragePage(listXml({ sizes: [Number.MAX_SAFE_INTEGER, 1] })))
      .toBeNull();
    expect(parseR2StoragePage(
      "<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>",
    )).toBeNull();
    expect(parseR2StoragePage(
      "<ListBucketResult><IsTruncated>false</IsTruncated>" +
      "<Contents><Size>12</Size></ListBucketResult>",
    )).toBeNull();
  });
});

describe("R2 tenant metering", () => {
  it("validates the canonical slug prefix", () => {
    expect(r2TenantPrefix(" acme-motors ")).toBe("acme-motors/");
    expect(r2TenantPrefix("../other")).toBeNull();
    expect(r2TenantPrefix("tenant/path")).toBeNull();
  });

  it("paginates ListObjectsV2 and encodes continuation tokens", async () => {
    const fetcher = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(listXml({
        sizes: [10, 20],
        truncated: true,
        token: "next+page&amp;more=1",
      })))
      .mockResolvedValueOnce(new Response(listXml({ sizes: [30] })));

    await expect(measureTenantR2Storage(config, "acme", { fetcher }))
      .resolves.toEqual({ bytes: 60, objectCount: 3 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(String(fetcher.mock.calls[0][0]));
    const secondUrl = new URL(String(fetcher.mock.calls[1][0]));
    expect(firstUrl.searchParams.get("prefix")).toBe("acme/");
    expect(firstUrl.searchParams.get("encoding-type")).toBe("url");
    expect(firstUrl.searchParams.has("continuation-token")).toBe(false);
    expect(secondUrl.searchParams.get("continuation-token")).toBe("next+page&more=1");
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: "GET",
      cache: "no-store",
      redirect: "error",
    });
  });

  it("returns zero for a complete empty listing", async () => {
    const fetcher = vi.fn(async () => new Response(listXml({ sizes: [] })));
    await expect(measureTenantR2Storage(config, "acme", { fetcher }))
      .resolves.toEqual({ bytes: 0, objectCount: 0 });
  });

  it("never returns a partial measurement after HTTP, XML, or pagination failure", async () => {
    const httpFailure = vi.fn(async () => new Response("unavailable", { status: 503 }));
    await expect(measureTenantR2Storage(config, "acme", { fetcher: httpFailure }))
      .resolves.toBeNull();

    const malformed = vi.fn(async () => new Response("not xml"));
    await expect(measureTenantR2Storage(config, "acme", { fetcher: malformed }))
      .resolves.toBeNull();

    const truncated = vi.fn(async () => new Response(listXml({
      sizes: [10],
      truncated: true,
      token: "another-page",
    })));
    await expect(measureTenantR2Storage(config, "acme", {
      fetcher: truncated,
      maxPages: 1,
    })).resolves.toBeNull();
  });

  it("rejects repeated cursors, cross-prefix keys, oversized XML, and expired work", async () => {
    const repeated = vi.fn(async () => new Response(listXml({
      sizes: [1],
      truncated: true,
      token: "same-token",
    })));
    await expect(measureTenantR2Storage(config, "acme", { fetcher: repeated }))
      .resolves.toBeNull();
    expect(repeated).toHaveBeenCalledTimes(2);

    const crossPrefix = vi.fn(async () => new Response(listXml({
      sizes: [50],
      keyPrefix: "another-tenant/",
    })));
    await expect(measureTenantR2Storage(config, "acme", { fetcher: crossPrefix }))
      .resolves.toBeNull();

    const oversized = vi.fn(async () => new Response("too large", {
      headers: { "Content-Length": String(4 * 1_024 * 1_024 + 1) },
    }));
    await expect(measureTenantR2Storage(config, "acme", { fetcher: oversized }))
      .resolves.toBeNull();

    const neverCalled = vi.fn(async () => new Response(listXml({ sizes: [] })));
    await expect(measureTenantR2Storage(config, "acme", {
      fetcher: neverCalled,
      deadlineAt: Date.now() - 1,
    })).resolves.toBeNull();
    expect(neverCalled).not.toHaveBeenCalled();
  });

  it("fails closed when the fetcher throws", async () => {
    const fetcher = vi.fn(async (): Promise<Response> => {
      throw new Error("network unavailable");
    });
    await expect(measureTenantR2Storage(config, "acme", { fetcher }))
      .resolves.toBeNull();
  });
});

function listXml({
  sizes,
  truncated = false,
  token,
  keyPrefix = "acme/",
}: {
  sizes: number[];
  truncated?: boolean;
  token?: string;
  keyPrefix?: string;
}): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<ListBucketResult>",
    `<IsTruncated>${truncated}</IsTruncated>`,
    ...sizes.map((size, index) => (
      `<Contents><Key>${keyPrefix}private-${index}</Key><Size>${size}</Size></Contents>`
    )),
    ...(token ? [`<NextContinuationToken>${token}</NextContinuationToken>`] : []),
    "</ListBucketResult>",
  ].join("");
}
