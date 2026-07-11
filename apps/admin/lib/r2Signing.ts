import { createHash, createHmac } from "node:crypto";

export type R2PresignMethod = "GET" | "PUT" | "HEAD" | "DELETE";

export type R2SignedUploadHeaders = {
  contentType: string;
  contentLength: number;
};

export type R2PresignOptions = {
  endpoint: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  method: R2PresignMethod;
  uploadHeaders?: R2SignedUploadHeaders;
  queryParameters?: ReadonlyArray<readonly [string, string]>;
  expiresInSeconds?: number;
  now?: Date;
};

export type R2PresignedRequest = {
  url: string;
  method: R2PresignMethod;
  expiresAt: Date;
};

const DEFAULT_EXPIRY_SECONDS = 15 * 60;
const MAX_EXPIRY_SECONDS = 7 * 24 * 60 * 60;
const R2_REGION = "auto";
const S3_SERVICE = "s3";
const SIGNING_ALGORITHM = "AWS4-HMAC-SHA256";

/**
 * Creates an AWS Signature Version 4 query-authenticated request for R2.
 *
 * PUT callers can bind content type and length into the signature so a URL
 * issued for a bounded image cannot be reused for a different payload shape.
 */
export function presignR2Request(options: R2PresignOptions): R2PresignedRequest {
  const endpoint = parseEndpoint(options.endpoint);
  const bucket = requireNonEmpty(options.bucket, "bucket");
  const key = options.key;
  const accessKeyId = requireNonEmpty(options.accessKeyId, "accessKeyId");
  const secretAccessKey = requireNonEmpty(options.secretAccessKey, "secretAccessKey");
  const expiresInSeconds = options.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS;
  const now = options.now ? new Date(options.now.getTime()) : new Date();

  if (
    options.method !== "GET" &&
    options.method !== "PUT" &&
    options.method !== "HEAD" &&
    options.method !== "DELETE"
  ) {
    throw new TypeError("method must be GET, PUT, HEAD, or DELETE");
  }
  if (!key && options.method !== "GET") throw new TypeError("key must not be empty");
  if (bucket.includes("/")) {
    throw new TypeError("bucket must not contain a slash");
  }
  if (key.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new TypeError("key must not contain dot path segments");
  }
  if (!Number.isInteger(expiresInSeconds)
    || expiresInSeconds < 1
    || expiresInSeconds > MAX_EXPIRY_SECONDS) {
    throw new RangeError(`expiresInSeconds must be an integer from 1 to ${MAX_EXPIRY_SECONDS}`);
  }
  if (Number.isNaN(now.getTime())) {
    throw new TypeError("now must be a valid Date");
  }

  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${R2_REGION}/${S3_SERVICE}/aws4_request`;
  const canonicalHeaderEntries: Array<readonly [string, string]> = [["host", endpoint.host]];
  if (options.uploadHeaders) {
    if (options.method !== "PUT") {
      throw new TypeError("uploadHeaders are only valid for PUT requests");
    }
    const contentType = normalizeHeaderValue(options.uploadHeaders.contentType);
    const contentLength = options.uploadHeaders.contentLength;
    if (!contentType) throw new TypeError("contentType must not be empty");
    if (!Number.isInteger(contentLength) || contentLength < 1) {
      throw new RangeError("contentLength must be a positive integer");
    }
    canonicalHeaderEntries.push(
      ["content-length", String(contentLength)],
      ["content-type", contentType],
    );
  }
  canonicalHeaderEntries.sort(([left], [right]) => compareEncoded(left, right));
  const signedHeaders = canonicalHeaderEntries.map(([name]) => name).join(";");
  const canonicalUri = key
    ? `/${awsEncode(bucket)}/${encodeObjectKey(key)}`
    : `/${awsEncode(bucket)}`;
  const requestQuery = validateQueryParameters(options.queryParameters ?? []);
  const canonicalQuery = canonicalQueryString([
    ...requestQuery,
    ["X-Amz-Algorithm", SIGNING_ALGORITHM],
    ["X-Amz-Credential", `${accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresInSeconds)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ]);
  const canonicalHeaders = canonicalHeaderEntries
    .map(([name, value]) => `${name}:${value}\n`)
    .join("");
  const canonicalRequest = [
    options.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    SIGNING_ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = signatureFor(secretAccessKey, dateStamp, stringToSign);

  return {
    method: options.method,
    url: `${endpoint.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    expiresAt: new Date(now.getTime() + expiresInSeconds * 1_000),
  };
}

function parseEndpoint(value: string): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new TypeError("endpoint must be a valid HTTPS URL");
  }

  if (endpoint.protocol !== "https:") {
    throw new TypeError("endpoint must use HTTPS");
  }
  if (endpoint.username || endpoint.password) {
    throw new TypeError("endpoint must not contain credentials");
  }
  if (endpoint.search || endpoint.hash) {
    throw new TypeError("endpoint must not contain a query or fragment");
  }
  if (endpoint.pathname !== "/") {
    throw new TypeError("endpoint must not contain a path");
  }
  return endpoint;
}

function requireNonEmpty(value: string, name: string): string {
  if (!value) throw new TypeError(`${name} must not be empty`);
  return value;
}

function normalizeHeaderValue(value: string): string {
  if (/[\r\n]/.test(value)) throw new TypeError("header values must not contain newlines");
  return value.trim().replace(/\s+/g, " ");
}

function validateQueryParameters(
  values: ReadonlyArray<readonly [string, string]>,
): Array<readonly [string, string]> {
  const output: Array<readonly [string, string]> = [];
  const seen = new Set<string>();
  for (const [rawName, rawValue] of values) {
    const name = rawName.trim();
    if (!name || /[\r\n]/.test(name) || /[\r\n]/.test(rawValue)) {
      throw new TypeError("query parameters must have safe names and values");
    }
    const normalizedName = name.toLocaleLowerCase("en");
    if (normalizedName.startsWith("x-amz-") || seen.has(normalizedName)) {
      throw new TypeError("query parameters must not override signing fields or repeat");
    }
    seen.add(normalizedName);
    output.push([name, rawValue]);
  }
  return output;
}

function formatAmzDate(value: Date): string {
  return value.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function encodeObjectKey(key: string): string {
  return key.split("/").map(awsEncode).join("/");
}

function awsEncode(value: string): string {
  try {
    return encodeURIComponent(value).replace(/[!'()*]/g, (character) => (
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    ));
  } catch {
    throw new TypeError("request values must contain valid Unicode");
  }
}

function canonicalQueryString(values: ReadonlyArray<readonly [string, string]>): string {
  return values
    .map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      compareEncoded(leftKey, rightKey) || compareEncoded(leftValue, rightValue)
    ))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function compareEncoded(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function signatureFor(secretAccessKey: string, dateStamp: string, stringToSign: string): string {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, R2_REGION);
  const serviceKey = hmac(regionKey, S3_SERVICE);
  const signingKey = hmac(serviceKey, "aws4_request");
  return createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
}
