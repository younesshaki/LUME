/**
 * Network security primitives for fetching remote (feed) images server-side.
 * Extracted from the import-feed route so every layer is unit-testable.
 *
 * Three layers, one per security-debt entry:
 * - SD-002: isPublicAddress — IPv4 + IPv6 public-address validation,
 *   including every practical IPv4-mapped IPv6 form (::ffff:a.b.c.d,
 *   ::ffff:hex:hex, expanded and compressed).
 * - SD-003: readBodyBounded — incremental body reading with a hard byte cap;
 *   Content-Length is never trusted.
 * - SD-001: fetchPinnedRemoteImage — the connection is pinned to an address
 *   that was resolved AND validated beforehand (custom lookup), the actual
 *   connected socket address is re-verified, redirects are rejected, and TLS
 *   certificate verification stays on. This closes the DNS-rebinding TOCTOU
 *   window that "resolve, check, then fetch" leaves open.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

export class BodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Remote body is larger than ${maxBytes} bytes.`);
    this.name = "BodyTooLargeError";
  }
}

export class RemoteFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteFetchError";
  }
}

// ── SD-002: public-address validation ───────────────────────────────────────

function isPublicIpv4Octets(a: number, b: number): boolean {
  return a !== 0 && a !== 10 && a !== 127 && a < 224
    && !(a === 100 && b >= 64 && b <= 127)
    && !(a === 169 && b === 254)
    && !(a === 172 && b >= 16 && b <= 31)
    && !(a === 192 && b === 168)
    && !(a === 198 && (b === 18 || b === 19));
}

/**
 * Parse an IPv6 address into its eight 16-bit groups, handling "::"
 * compression and a dotted-quad tail. Returns null for malformed input.
 */
export function parseIpv6Groups(input: string): number[] | null {
  let value = input.toLowerCase().trim();
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);

  let embeddedGroups: number[] = [];
  const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (dotted) {
    const octets = dotted.slice(1, 5).map(Number);
    if (octets.some((octet) => octet > 255)) return null;
    embeddedGroups = [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
    value = value.slice(0, dotted.index);
    if (value.endsWith(":") && !value.endsWith("::")) value = value.slice(0, -1);
  }

  const parsePart = (part: string): number[] | null => {
    if (part === "") return [];
    const groups = part.split(":").map((group) => {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return Number.NaN;
      return parseInt(group, 16);
    });
    return groups.some(Number.isNaN) ? null : groups;
  };

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const head = parsePart(halves[0] ?? "");
  const tail = halves.length === 2 ? parsePart(halves[1] ?? "") : [];
  if (head === null || tail === null) return null;

  let groups: number[];
  if (halves.length === 2) {
    const zeros = 8 - head.length - tail.length - embeddedGroups.length;
    if (zeros < 0) return null;
    groups = [...head, ...new Array(zeros).fill(0), ...tail];
  } else {
    groups = head;
    if (groups.length + embeddedGroups.length !== 8) return null;
  }
  if (groups.length + embeddedGroups.length !== 8) return null;
  return [...groups, ...embeddedGroups];
}

/** The IPv4 octets embedded in an IPv4-mapped IPv6 address, or null. */
export function ipv4MappedOctets(input: string): [number, number, number, number] | null {
  const groups = parseIpv6Groups(input);
  if (!groups) return null;
  const isMapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (!isMapped) return null;
  return [
    (groups[6]! >> 8) & 0xff, groups[6]! & 0xff,
    (groups[7]! >> 8) & 0xff, groups[7]! & 0xff,
  ];
}

/** IPv4-compatible IPv6 (`::127.0.0.1`), which routes to the embedded IPv4. */
function ipv4CompatibleOctets(groups: readonly number[]): [number, number, number, number] | null {
  if (!groups.slice(0, 6).every((group) => group === 0)) return null;
  return [
    (groups[6]! >> 8) & 0xff, groups[6]! & 0xff,
    (groups[7]! >> 8) & 0xff, groups[7]! & 0xff,
  ];
}

export function isPublicAddress(value: string): boolean {
  if (isIP(value) === 4) {
    const [a = 0, b = 0] = value.split(".").map(Number);
    return isPublicIpv4Octets(a, b);
  }
  // IPv4-mapped IPv6 routes to the embedded IPv4 address — validate THAT.
  const mapped = ipv4MappedOctets(value);
  if (mapped) return isPublicIpv4Octets(mapped[0], mapped[1]);
  const groups = parseIpv6Groups(value);
  if (!groups) return false;
  // IPv4-compatible forms are less common than mapped forms but have the
  // same SSRF consequence (for example, ::127.0.0.1 is loopback).
  const compatible = ipv4CompatibleOctets(groups);
  if (compatible) return isPublicIpv4Octets(compatible[0], compatible[1]);
  if (groups.every((group) => group === 0)) return false; // :: unspecified
  if (groups[7] === 1 && groups.slice(0, 7).every((group) => group === 0)) return false; // ::1
  if ((groups[0]! & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((groups[0]! & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((groups[0]! & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  return true;
}

// ── Image sniffing ──────────────────────────────────────────────────────────

export type RemoteImageContentType = "image/jpeg" | "image/png" | "image/webp";

/** JPEG/PNG/WebP magic-byte detection. Anything else returns null. */
export function imageContentType(bytes: Uint8Array): RemoteImageContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  return null;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

// ── SD-003: bounded body reading ────────────────────────────────────────────

/**
 * Read a body incrementally with a hard cap. Throws BodyTooLargeError as soon
 * as the running total exceeds maxBytes — Content-Length is never consulted.
 */
export async function readBodyBounded(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new BodyTooLargeError(maxBytes);
    chunks.push(chunk);
  }
  const result: Uint8Array<ArrayBuffer> = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

// ── SD-001: resolve once, connect to the validated address ──────────────────

export type ValidatedRemoteTarget = {
  url: URL;
  hostname: string;
  address: string;
  family: number;
};

export type ResolveLookup = typeof dnsLookup;

/**
 * Resolve a URL's host and keep ONLY the validated public targets. Any
 * non-public address (or an unresolvable/blocked host) rejects the whole URL.
 */
export async function resolvePublicRemoteTargets(
  value: string,
  lookupFn: ResolveLookup = dnsLookup,
): Promise<ValidatedRemoteTarget[]> {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RemoteFetchError("Feed image URL must be http or https.");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new RemoteFetchError("Feed image host is not publicly reachable.");
  }
  const addresses = await lookupFn(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new RemoteFetchError("Feed image host is not publicly reachable.");
  }
  return addresses.map(({ address, family }) => ({
    url,
    hostname: url.hostname,
    address,
    family,
  }));
}

function addressesEqual(left: string, right: string): boolean {
  if (left === right) return true;
  // Normalize IPv6 spellings (compressed vs expanded) before comparing.
  const leftGroups = parseIpv6Groups(left);
  const rightGroups = parseIpv6Groups(right);
  return Boolean(leftGroups && rightGroups && leftGroups.every((group, index) => group === rightGroups[index]));
}

export type PinnedFetchOptions = {
  maxBytes: number;
  timeoutMs: number;
  /** Bounded request methods used by managed feed pull/push workers. */
  method?: "GET" | "POST" | "PUT";
  /** Request bytes, never streamed from an unbounded caller. */
  body?: Uint8Array;
  /** Extra request headers for authenticated supplier feeds. Host is ignored. */
  headers?: Record<string, string>;
  /** Defaults to the image importer accept header. */
  accept?: string;
};

export type PinnedFetchResult = {
  bytes: Uint8Array<ArrayBuffer>;
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
};

/**
 * Fetch a remote image with the connection PINNED to a previously validated
 * address: the custom lookup supplies only the validated address (DNS is not
 * re-resolved at connect time — the rebinding window is closed), the Host
 * header and TLS SNI/certificate verification still use the real hostname,
 * redirects and non-2xx are rejected, the connected socket address is
 * re-verified, and the body is read with a hard incremental cap.
 */
export function fetchPinnedRemote(
  target: ValidatedRemoteTarget,
  options: PinnedFetchOptions,
): Promise<PinnedFetchResult> {
  const transport = target.url.protocol === "https:" ? https : http;
  return new Promise((resolvePromise, rejectPromise) => {
    const fail = (error: Error) => {
      request.destroy();
      rejectPromise(error);
    };

    const request = transport.request({
      protocol: target.url.protocol,
      hostname: target.hostname,
      port: target.url.port || undefined,
      path: `${target.url.pathname}${target.url.search}`,
      method: options.method ?? "GET",
      // THE PIN: DNS never re-resolves — the socket can only connect to the
      // address we validated. Host/SNI/cert verification still use hostname.
      lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
      headers: {
        ...safeRequestHeaders(options.headers),
        Host: target.url.host,
        Accept: options.accept ?? "image/*,*/*;q=0.8",
        ...(options.body ? { "Content-Length": String(options.body.byteLength) } : {}),
      },
      timeout: options.timeoutMs,
    });

    request.on("timeout", () => {
      fail(new RemoteFetchError("Feed image request timed out."));
    });

    request.on("response", (response) => {
      const remoteAddress = request.socket?.remoteAddress;
      if (!remoteAddress || !addressesEqual(remoteAddress, target.address)) {
        fail(new RemoteFetchError("Connected address does not match the validated address."));
        return;
      }
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        fail(new RemoteFetchError("Feed image redirects are not followed."));
        return;
      }
      if (status < 200 || status >= 300) {
        fail(new RemoteFetchError(`Feed image returned HTTP ${status}.`));
        return;
      }
      const declared = Number(response.headers["content-length"]);
      if (Number.isFinite(declared) && declared > options.maxBytes) {
        fail(new BodyTooLargeError(options.maxBytes));
        return;
      }
      readBodyBounded(response as unknown as AsyncIterable<Uint8Array>, options.maxBytes)
        .then((bytes) => resolvePromise({ bytes, statusCode: status, headers: response.headers }))
        .catch(fail);
    });

    request.on("error", (error) => {
      rejectPromise(error instanceof RemoteFetchError || error instanceof BodyTooLargeError
        ? error
        : new RemoteFetchError(error.message));
    });

    if (options.body) request.write(options.body);
    request.end();
  });
}

/**
 * Backwards-compatible image importer wrapper. Feed workers use
 * `fetchPinnedRemote` directly so the exact same DNS-pinning, redirect, TLS,
 * and bounded-stream guarantees protect supplier CSV/JSON/XML requests.
 */
export async function fetchPinnedRemoteImage(
  target: ValidatedRemoteTarget,
  options: PinnedFetchOptions,
): Promise<Pick<PinnedFetchResult, "bytes" | "statusCode">> {
  const result = await fetchPinnedRemote(target, options);
  return { bytes: result.bytes, statusCode: result.statusCode };
}

function safeRequestHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) return {};
  const safe: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    // Host must be supplied by the real hostname/SNI target. Other connection
    // framing headers are not valid for our bounded GET-only transport.
    if (/^(host|content-length|connection|transfer-encoding)$/i.test(name)) continue;
    safe[name] = value;
  }
  return safe;
}
