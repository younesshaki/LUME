import { presignR2Request } from "./r2Signing";
import type { R2StorageConfig } from "./r2Config";

export type R2StorageMeasurement = {
  bytes: number;
  objectCount: number;
};

export type R2StoragePage = R2StorageMeasurement & {
  nextContinuationToken: string | null;
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_MAX_PAGES = 1_000;
const MAX_CONTINUATION_TOKEN_LENGTH = 4_096;
const MAX_XML_BYTES = 4 * 1_024 * 1_024;
const DEFAULT_OPERATION_TIMEOUT_MS = 60_000;

export function r2TenantPrefix(slug: string): string | null {
  const normalized = slug.trim();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(normalized)) return null;
  return `${normalized}/`;
}

export function parseR2StoragePage(
  xml: string,
  expectedPrefix?: string,
): R2StoragePage | null {
  if (
    !/<ListBucketResult(?:\s|>)/i.test(xml) ||
    !/<\/ListBucketResult>/i.test(xml)
  ) {
    return null;
  }

  const truncatedText = tagText(xml, "IsTruncated")?.toLowerCase();
  if (truncatedText !== "true" && truncatedText !== "false") return null;

  let bytes = 0;
  let objectCount = 0;
  const declaredContents = [...xml.matchAll(/<Contents(?:\s|>)/gi)].length;
  for (const match of xml.matchAll(/<Contents(?:\s[^>]*)?>([\s\S]*?)<\/Contents>/gi)) {
    const contents = match[1];
    if (expectedPrefix) {
      const encodedKey = tagText(contents, "Key");
      if (!encodedKey) return null;
      let key: string;
      try {
        key = decodeURIComponent(decodeXml(encodedKey));
      } catch {
        return null;
      }
      if (!key.startsWith(expectedPrefix)) return null;
    }
    const sizeText = tagText(contents, "Size");
    if (!sizeText || !/^\d+$/.test(sizeText)) return null;
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size) || size < 0) return null;
    bytes += size;
    objectCount += 1;
    if (!Number.isSafeInteger(bytes) || !Number.isSafeInteger(objectCount)) return null;
  }
  if (objectCount !== declaredContents) return null;

  const nextContinuationToken = truncatedText === "true"
    ? decodeXml(tagText(xml, "NextContinuationToken") ?? "")
    : null;
  if (
    truncatedText === "true" &&
    (!nextContinuationToken || nextContinuationToken.length > MAX_CONTINUATION_TOKEN_LENGTH)
  ) {
    return null;
  }

  return { bytes, objectCount, nextContinuationToken };
}

export async function measureTenantR2Storage(
  config: R2StorageConfig,
  tenantSlug: string,
  options: {
    fetcher?: Fetcher;
    maxPages?: number;
    timeoutMs?: number;
    deadlineAt?: number;
  } = {},
): Promise<R2StorageMeasurement | null> {
  const prefix = r2TenantPrefix(tenantSlug);
  if (!prefix) return null;
  const fetcher = options.fetcher ?? fetch;
  const maxPages = normalizeMaxPages(options.maxPages);
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const deadlineAt = normalizeDeadline(options.deadlineAt);
  const seenTokens = new Set<string>();
  let continuationToken: string | null = null;
  let bytes = 0;
  let objectCount = 0;

  try {
    for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs < 1) return null;
      const queryParameters: Array<readonly [string, string]> = [
        ["encoding-type", "url"],
        ["list-type", "2"],
        ["max-keys", "1000"],
        ["prefix", prefix],
      ];
      if (continuationToken) {
        queryParameters.push(["continuation-token", continuationToken]);
      }
      const request = presignR2Request({
        ...config,
        method: "GET",
        key: "",
        expiresInSeconds: 60,
        queryParameters,
      });
      const response = await fetcher(request.url, {
        method: "GET",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(Math.min(timeoutMs, remainingMs)),
      });
      if (!response.ok) return null;
      const xml = await readBoundedBody(response, MAX_XML_BYTES);
      if (xml === null) return null;
      const page = parseR2StoragePage(xml, prefix);
      if (!page) return null;

      bytes += page.bytes;
      objectCount += page.objectCount;
      if (!Number.isSafeInteger(bytes) || !Number.isSafeInteger(objectCount)) return null;
      if (!page.nextContinuationToken) return { bytes, objectCount };
      if (seenTokens.has(page.nextContinuationToken)) return null;
      seenTokens.add(page.nextContinuationToken);
      continuationToken = page.nextContinuationToken;
    }
    return null;
  } catch {
    return null;
  }
}

function tagText(xml: string, tagName: string): string | null {
  const match = new RegExp(
    `<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`,
    "i",
  ).exec(xml);
  return match?.[1]?.trim() ?? null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizeMaxPages(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_PAGES;
  if (!Number.isSafeInteger(value) || value < 1) return 1;
  return Math.min(DEFAULT_MAX_PAGES, value);
}

function normalizeTimeout(value: number | undefined): number {
  return Number.isSafeInteger(value) && value !== undefined && value >= 100 && value <= 30_000
    ? value
    : 8_000;
}

function normalizeDeadline(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.floor(value)
    : Date.now() + DEFAULT_OPERATION_TIMEOUT_MS;
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string | null> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let output = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return output;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
