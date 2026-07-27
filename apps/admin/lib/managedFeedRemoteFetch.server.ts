/**
 * Hardened pull transport for managed inventory feeds and outbound snapshots.
 *
 * It deliberately reuses the image-importer's pinned DNS transport rather
 * than `fetch()`: supplier endpoints are configured by tenants, so redirect
 * following or a resolve-then-fetch gap would make this an SSRF primitive.
 */
import {
  fetchPinnedRemote,
  resolvePublicRemoteTargets,
} from "./remoteImageFetch";
import { isSensitiveManagedIntegrationQueryKey } from "./managedIntegrationUrl";

export const MAX_MANAGED_FEED_BYTES = 25 * 1024 * 1024;
export const MANAGED_FEED_TIMEOUT_MS = 20_000;
export const MAX_MANAGED_EXPORT_RESPONSE_BYTES = 64 * 1024;

export type ManagedRemoteBody = {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
};

/** Validate a configuration-time endpoint without making a network request. */
export function validateManagedHttpsEndpoint(value: string): { ok: true; url: string } | { ok: false; error: string } {
  if (value.length > 2_000) return { ok: false, error: "Endpoint URL is too long." };
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { ok: false, error: "Enter a valid HTTPS endpoint URL." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Managed feeds and exports require HTTPS." };
  if (url.username || url.password) {
    return { ok: false, error: "Put supplier credentials in the secure credential fields, not in the URL." };
  }
  if (Array.from(url.searchParams.keys()).some(isSensitiveManagedIntegrationQueryKey)) {
    return { ok: false, error: "Put supplier credentials in the secure credential fields, not in URL query parameters." };
  }
  if (!url.hostname || url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local")) {
    return { ok: false, error: "Endpoint must use a public HTTPS hostname." };
  }
  url.hash = "";
  return { ok: true, url: url.toString() };
}

/**
 * GET a supplier feed using a validated public DNS target and a socket pinned
 * to the resolved address. All resolved records must be public; redirects are
 * rejected; the response body is streamed under a hard cap.
 */
export async function fetchManagedFeed(
  endpointUrl: string,
  headers: Record<string, string> = {},
  maxBytes = MAX_MANAGED_FEED_BYTES,
): Promise<ManagedRemoteBody> {
  const endpoint = validateManagedHttpsEndpoint(endpointUrl);
  if (!endpoint.ok) throw new Error(endpoint.error);
  const targets = await resolvePublicRemoteTargets(endpoint.url);
  let lastError: unknown;
  // Dual-stack supplier hosts sometimes advertise an unreachable address. It
  // is safe to try each prevalidated address without ever resolving again.
  for (const target of targets) {
    try {
      const response = await fetchPinnedRemote(target, {
        maxBytes,
        timeoutMs: MANAGED_FEED_TIMEOUT_MS,
        headers,
        accept: "text/csv, text/tab-separated-values, application/json, application/xml, text/xml, */*;q=0.1",
      });
      return {
        bytes: response.bytes,
        contentType: headerValue(response.headers, "content-type"),
        etag: headerValue(response.headers, "etag"),
        lastModified: headerValue(response.headers, "last-modified"),
      };
    } catch (error) {
      lastError = error;
    }
  }
  // Never include an endpoint URL or auth header in the error. The run record
  // is tenant-visible and supplier URLs can themselves contain sensitive IDs.
  throw new Error(lastError instanceof Error ? lastError.message : "Supplier feed request failed.");
}

/**
 * Send a bounded, serialized inventory snapshot to a supplier endpoint using
 * the same pinned HTTPS connection. A non-2xx response or redirect throws;
 * callers turn that into a retry/dead-letter run outcome.
 */
export async function deliverManagedInventoryExport(input: {
  endpointUrl: string;
  method: "POST" | "PUT";
  content: Uint8Array;
  contentType: "text/csv; charset=utf-8" | "application/json; charset=utf-8" | "application/xml; charset=utf-8";
  headers?: Record<string, string>;
}): Promise<{ responseStatus: number }> {
  const endpoint = validateManagedHttpsEndpoint(input.endpointUrl);
  if (!endpoint.ok) throw new Error(endpoint.error);
  if (input.content.byteLength > MAX_MANAGED_FEED_BYTES) {
    throw new Error("Inventory export is larger than the managed export limit.");
  }
  const targets = await resolvePublicRemoteTargets(endpoint.url);
  let lastError: unknown;
  for (const target of targets) {
    try {
      const response = await fetchPinnedRemote(target, {
        method: input.method,
        body: input.content,
        maxBytes: MAX_MANAGED_EXPORT_RESPONSE_BYTES,
        timeoutMs: MANAGED_FEED_TIMEOUT_MS,
        headers: { "Content-Type": input.contentType, ...(input.headers ?? {}) },
        accept: "application/json, text/plain;q=0.9, */*;q=0.1",
      });
      return { responseStatus: response.statusCode };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : "Inventory export request failed.");
}

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
