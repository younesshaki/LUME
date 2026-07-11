/**
 * Per-bucket upload policy: MIME + size whitelist with magic-byte sniffing
 * (SCRUM-164, J-8).
 *
 * One table drives every upload path: each tenant bucket declares the MIME
 * types it accepts and a size ceiling. `validateUploadCandidate` checks the
 * declared type + size against the policy; `sniffContentType` inspects the
 * leading bytes so a renamed executable can't pass as an image. Callers that
 * hold the file bytes should run both — declared-only validation is exactly
 * the gap this ticket closes.
 *
 * Pure and dependency-free so browser upload clients and server routes share
 * the identical policy.
 */

export type UploadBucketPolicy = {
  /** Declared MIME types accepted for this bucket. */
  allowedTypes: readonly string[];
  /** Hard size ceiling in bytes. */
  maxBytes: number;
};

export const BUCKET_UPLOAD_POLICIES: Record<string, UploadBucketPolicy> = {
  "tenant-logos": {
    allowedTypes: ["image/svg+xml", "image/png", "image/webp"],
    maxBytes: 2 * 1024 * 1024,
  },
  "tenant-media": {
    allowedTypes: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"],
    maxBytes: 10 * 1024 * 1024,
  },
  "tenant-csvs": {
    allowedTypes: ["text/csv", "application/vnd.ms-excel", "text/plain"],
    maxBytes: 20 * 1024 * 1024,
  },
  "tenant-3d-models": {
    allowedTypes: ["model/gltf-binary", "application/octet-stream"],
    maxBytes: 100 * 1024 * 1024,
  },
};

export type UploadValidation =
  | { ok: true }
  | { ok: false; error: string };

/** Declared-metadata check: MIME in the bucket whitelist and size in bounds. */
export function validateUploadCandidate(
  bucket: string,
  candidate: { type: string; size: number },
): UploadValidation {
  const policy = BUCKET_UPLOAD_POLICIES[bucket];
  if (!policy) return { ok: false, error: `Uploads to "${bucket}" are not allowed.` };

  const declared = candidate.type.trim().toLowerCase().split(";")[0];
  if (!policy.allowedTypes.includes(declared)) {
    return {
      ok: false,
      error: `File type "${declared || "unknown"}" is not allowed here. Allowed: ${policy.allowedTypes.join(", ")}.`,
    };
  }
  if (candidate.size <= 0) return { ok: false, error: "File is empty." };
  if (candidate.size > policy.maxBytes) {
    return {
      ok: false,
      error: `File is too large (max ${formatBytes(policy.maxBytes)}).`,
    };
  }
  return { ok: true };
}

/**
 * Identify well-known formats from leading bytes. Returns null when the
 * signature is not recognized — callers decide whether unknown is fatal
 * (it is for image buckets, not for e.g. CSV text).
 */
export function sniffContentType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8) {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
    ) {
      return "image/png";
    }
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 6) {
    const header = ascii(bytes, 0, 6);
    if (header === "GIF87a" || header === "GIF89a") return "image/gif";
  }
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === "glTF") {
    return "model/gltf-binary";
  }
  // SVG/XML: text documents opening with an XML prolog or an <svg root.
  const textHead = ascii(bytes, 0, Math.min(bytes.length, 256))
    .replace(/^﻿/, "")
    .trimStart()
    .toLowerCase();
  if (textHead.startsWith("<svg") || (textHead.startsWith("<?xml") && textHead.includes("<svg"))) {
    return "image/svg+xml";
  }
  return null;
}

/**
 * Full check for callers holding the file bytes: declared policy first, then
 * the sniffed signature must agree with the declared type for sniffable
 * formats. Text formats (CSV) have no reliable signature, so they only get a
 * negative check — bytes must not look like a known binary format.
 */
export function validateUploadWithBytes(
  bucket: string,
  candidate: { type: string; size: number },
  leadingBytes: Uint8Array,
): UploadValidation {
  const declaredCheck = validateUploadCandidate(bucket, candidate);
  if (!declaredCheck.ok) return declaredCheck;

  const declared = candidate.type.trim().toLowerCase().split(";")[0];
  const sniffed = sniffContentType(leadingBytes);

  const SNIFFABLE = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/svg+xml",
    "model/gltf-binary",
  ]);

  if (SNIFFABLE.has(declared)) {
    if (sniffed !== declared) {
      return {
        ok: false,
        error: `File content does not match its declared type ("${declared}").`,
      };
    }
    return { ok: true };
  }

  // Non-sniffable declared type (CSV/plain/octet-stream): reject if the bytes
  // are recognizably a different binary format smuggled under a text label —
  // except 3-D models, where octet-stream + glTF bytes is the legitimate pair.
  if (sniffed !== null && !(bucket === "tenant-3d-models" && sniffed === "model/gltf-binary")) {
    return {
      ok: false,
      error: `File content looks like ${sniffed}, which does not match "${declared}".`,
    };
  }
  return { ok: true };
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let i = start; i < Math.min(end, bytes.length); i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
