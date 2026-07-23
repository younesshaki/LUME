import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  BodyTooLargeError,
  RemoteFetchError,
  fetchPinnedRemoteImage,
  imageContentType,
  ipv4MappedOctets,
  isPublicAddress,
  parseIpv6Groups,
  readBodyBounded,
  resolvePublicRemoteTargets,
  type ValidatedRemoteTarget,
} from "./remoteImageFetch";

// ── SD-002: IPv4-mapped IPv6 and public-address validation ─────────────────

describe("isPublicAddress — IPv4", () => {
  it.each([
    ["127.0.0.1", false], ["127.1.2.3", false],
    ["10.0.0.1", false], ["10.255.255.255", false],
    ["172.16.0.1", false], ["172.31.255.255", false],
    ["192.168.1.1", false],
    ["169.254.169.254", false], // metadata service
    ["100.64.0.1", false], ["100.127.255.255", false], // CGNAT
    ["0.0.0.0", false],
    ["224.0.0.1", false], ["255.255.255.255", false], // multicast/broadcast
    ["198.18.0.1", false], ["198.19.255.1", false], // benchmarking
    ["8.8.8.8", true], ["172.32.0.1", true], ["100.128.0.1", true],
  ])("%s → %s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });
});

describe("isPublicAddress — IPv6", () => {
  it.each([
    ["::1", false], ["0:0:0:0:0:0:0:1", false],
    ["::", false], ["0:0:0:0:0:0:0:0", false],
    ["fe80::1", false], ["fe80::dead:beef", false],
    ["fc00::1", false], ["fd12:3456::1", false],
    ["ff02::1", false], ["ff00::1", false], // multicast
    ["2606:4700:4700::1111", true], ["2001:4860:4860::8888", true],
  ])("%s → %s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });
});

describe("isPublicAddress — IPv4-mapped IPv6 (SD-002)", () => {
  it.each([
    ["::ffff:127.0.0.1", false],
    ["::ffff:10.0.0.1", false],
    ["::ffff:192.168.0.1", false],
    ["::ffff:169.254.169.254", false],
    ["::ffff:7f00:1", false], // hex form of 127.0.0.1
    ["::ffff:0a00:0001", false], // hex form of 10.0.0.1
    ["0:0:0:0:0:ffff:127.0.0.1", false], // expanded + dotted
    ["0000:0000:0000:0000:0000:ffff:7f00:0001", false], // fully expanded hex
    ["0::ffff:172.16.5.4", false], // compressed head
    ["::ffff:8.8.8.8", true], // mapped public is fine
    ["::ffff:0808:0808", true],
  ])("%s → %s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });

  it("extracts embedded octets only from mapped forms", () => {
    expect(ipv4MappedOctets("::ffff:127.0.0.1")).toEqual([127, 0, 0, 1]);
    expect(ipv4MappedOctets("::ffff:0808:0808")).toEqual([8, 8, 8, 8]);
    expect(ipv4MappedOctets("2606:4700:4700::1111")).toBeNull();
    expect(ipv4MappedOctets("8.8.8.8")).toBeNull();
  });

  it("parseIpv6Groups rejects malformed input", () => {
    expect(parseIpv6Groups("not-an-ip")).toBeNull();
    expect(parseIpv6Groups("::ffff:999.1.1.1")).toBeNull();
    expect(parseIpv6Groups("1:2:3:4:5:6:7:8:9")).toBeNull();
    expect(parseIpv6Groups("1:::2")).toBeNull();
  });
});

// ── SD-003: bounded streaming ───────────────────────────────────────────────

async function* streamOf(chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const chunk of chunks) yield chunk;
}

describe("readBodyBounded", () => {
  it("reads a valid small body fully", async () => {
    const bytes = await readBodyBounded(streamOf([new Uint8Array([1, 2, 3])]), 10);
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it("accepts exactly maxBytes", async () => {
    const bytes = await readBodyBounded(streamOf([new Uint8Array(10).fill(7)]), 10);
    expect(bytes.byteLength).toBe(10);
  });

  it("aborts one byte past the cap", async () => {
    await expect(readBodyBounded(streamOf([new Uint8Array(11).fill(7)]), 10))
      .rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("aborts when many small chunks overshoot the cap", async () => {
    const chunks = Array.from({ length: 11 }, () => new Uint8Array(1024 * 1024).fill(1));
    await expect(readBodyBounded(streamOf(chunks), 10 * 1024 * 1024))
      .rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("accepts an empty body", async () => {
    const bytes = await readBodyBounded(streamOf([]), 10);
    expect(bytes.byteLength).toBe(0);
  });
});

// ── SD-001: resolution validation ───────────────────────────────────────────

describe("resolvePublicRemoteTargets", () => {
  const lookupReturning = (addresses: { address: string; family: number }[]) =>
    (async () => addresses) as unknown as typeof import("node:dns/promises").lookup;

  it("rejects localhost-style hosts before any DNS lookup", async () => {
    await expect(resolvePublicRemoteTargets("http://localhost/img.jpg", lookupReturning([])))
      .rejects.toBeInstanceOf(RemoteFetchError);
    await expect(resolvePublicRemoteTargets("http://cdn.local/img.jpg", lookupReturning([])))
      .rejects.toBeInstanceOf(RemoteFetchError);
  });

  it("rejects non-http protocols", async () => {
    await expect(resolvePublicRemoteTargets("ftp://cdn.example.com/img.jpg", lookupReturning([])))
      .rejects.toBeInstanceOf(RemoteFetchError);
  });

  it("rejects when ANY resolved address is non-public", async () => {
    await expect(resolvePublicRemoteTargets(
      "https://cdn.example.com/img.jpg",
      lookupReturning([
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    )).rejects.toBeInstanceOf(RemoteFetchError);
    await expect(resolvePublicRemoteTargets(
      "https://cdn.example.com/img.jpg",
      lookupReturning([{ address: "::ffff:127.0.0.1", family: 6 }]),
    )).rejects.toBeInstanceOf(RemoteFetchError);
  });

  it("returns only validated public targets", async () => {
    const targets = await resolvePublicRemoteTargets(
      "https://cdn.example.com/img.jpg",
      lookupReturning([{ address: "8.8.8.8", family: 4 }]),
    );
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ hostname: "cdn.example.com", address: "8.8.8.8", family: 4 });
  });
});

// ── SD-001/003: pinned fetch against a real local server ────────────────────

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

describe("fetchPinnedRemoteImage (local server)", () => {
  let server: http.Server;
  let port: number;
  let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

  beforeAll(async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": JPEG.byteLength });
      res.end(JPEG);
    };
    server = http.createServer((req, res) => handler(req, res));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const target = (): ValidatedRemoteTarget => ({
    url: new URL(`http://127.0.0.1:${port}/img.jpg`),
    hostname: "127.0.0.1",
    address: "127.0.0.1",
    family: 4,
  });

  it("fetches a valid small image through the pinned address", async () => {
    const result = await fetchPinnedRemoteImage(target(), { maxBytes: 1024, timeoutMs: 5_000 });
    expect([...result.bytes]).toEqual([...JPEG]);
    expect(result.statusCode).toBe(200);
  });

  it("fast-fails when a declared Content-Length exceeds the cap", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": 64 * 1024 * 1024 });
      res.end(JPEG);
    };
    await expect(fetchPinnedRemoteImage(target(), { maxBytes: 1024, timeoutMs: 5_000 }))
      .rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("never trusts Content-Length: an understated declaration still fails", async () => {
    // Declares 4 bytes, actually sends 8 — the HTTP parser itself flags the
    // framing violation, proving the cap does not depend on the header.
    handler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": 4 });
      res.end(JPEG);
    };
    await expect(fetchPinnedRemoteImage(target(), { maxBytes: 1024, timeoutMs: 5_000 }))
      .rejects.toThrow();
  });

  it("enforces the cap across a chunked oversized stream", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      for (let index = 0; index < 8; index += 1) res.write(new Uint8Array(1024).fill(1));
      res.end();
    };
    await expect(fetchPinnedRemoteImage(target(), { maxBytes: 4 * 1024, timeoutMs: 5_000 }))
      .rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("rejects redirects instead of following them", async () => {
    handler = (_req, res) => {
      res.writeHead(302, { Location: "http://127.0.0.1/other" });
      res.end();
    };
    await expect(fetchPinnedRemoteImage(target(), { maxBytes: 1024, timeoutMs: 5_000 }))
      .rejects.toThrow(/redirects/i);
  });

  it("rejects non-2xx statuses", async () => {
    handler = (_req, res) => {
      res.writeHead(404);
      res.end();
    };
    await expect(fetchPinnedRemoteImage(target(), { maxBytes: 1024, timeoutMs: 5_000 }))
      .rejects.toThrow(/HTTP 404/);
  });

  it("times out when the server never responds", async () => {
    handler = () => {
      // never respond — the socket sits idle
    };
    await expect(fetchPinnedRemoteImage(target(), { maxBytes: 1024, timeoutMs: 150 }))
      .rejects.toThrow(/timed out/i);
  });

  it("returns raw bytes unchanged for non-image content (caller rejects)", async () => {
    const notImage = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    handler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(notImage);
    };
    const result = await fetchPinnedRemoteImage(target(), { maxBytes: 1024, timeoutMs: 5_000 });
    expect([...result.bytes]).toEqual([...notImage]);
    expect(imageContentType(result.bytes)).toBeNull();
  });
});

// ── Magic-byte detection ────────────────────────────────────────────────────

describe("imageContentType", () => {
  it("detects jpeg, png, and webp magic bytes", () => {
    expect(imageContentType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(imageContentType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(imageContentType(new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ]))).toBe("image/webp");
    expect(imageContentType(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull(); // GIF
    expect(imageContentType(new Uint8Array([1, 2]))).toBeNull(); // too short
  });
});
