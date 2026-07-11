import { describe, expect, it } from "vitest";
import {
  BUCKET_UPLOAD_POLICIES,
  sniffContentType,
  validateUploadCandidate,
  validateUploadWithBytes,
} from "./uploadPolicy";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const GIF = new Uint8Array([...("GIF89a".split("").map((c) => c.charCodeAt(0))), 0]);
const WEBP = new Uint8Array([
  ...("RIFF".split("").map((c) => c.charCodeAt(0))),
  0, 0, 0, 0,
  ...("WEBP".split("").map((c) => c.charCodeAt(0))),
]);
const GLB = new Uint8Array([...("glTF".split("").map((c) => c.charCodeAt(0))), 2, 0, 0, 0]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // MZ header — recognized by nothing
const CSV_TEXT = new TextEncoder().encode("make,model,price\nBMW,M3,90000\n");

describe("sniffContentType", () => {
  it("recognizes the supported signatures", () => {
    expect(sniffContentType(PNG)).toBe("image/png");
    expect(sniffContentType(JPEG)).toBe("image/jpeg");
    expect(sniffContentType(GIF)).toBe("image/gif");
    expect(sniffContentType(WEBP)).toBe("image/webp");
    expect(sniffContentType(GLB)).toBe("model/gltf-binary");
    expect(sniffContentType(SVG)).toBe("image/svg+xml");
  });

  it("returns null for unknown content", () => {
    expect(sniffContentType(EXE)).toBeNull();
    expect(sniffContentType(CSV_TEXT)).toBeNull();
    expect(sniffContentType(new Uint8Array())).toBeNull();
  });
});

describe("validateUploadCandidate", () => {
  it("rejects unknown buckets", () => {
    expect(validateUploadCandidate("random-bucket", { type: "image/png", size: 10 }).ok).toBe(
      false,
    );
  });

  it("enforces per-bucket MIME whitelists", () => {
    expect(
      validateUploadCandidate("tenant-media", { type: "image/png", size: 10 }).ok,
    ).toBe(true);
    expect(
      validateUploadCandidate("tenant-media", { type: "application/x-msdownload", size: 10 }).ok,
    ).toBe(false);
    // parameters after ; are ignored
    expect(
      validateUploadCandidate("tenant-csvs", { type: "text/csv; charset=utf-8", size: 10 }).ok,
    ).toBe(true);
  });

  it("enforces size ceilings and rejects empty files", () => {
    const max = BUCKET_UPLOAD_POLICIES["tenant-logos"].maxBytes;
    expect(validateUploadCandidate("tenant-logos", { type: "image/png", size: max }).ok).toBe(true);
    expect(validateUploadCandidate("tenant-logos", { type: "image/png", size: max + 1 }).ok).toBe(
      false,
    );
    expect(validateUploadCandidate("tenant-logos", { type: "image/png", size: 0 }).ok).toBe(false);
  });
});

describe("validateUploadWithBytes", () => {
  it("accepts when declared type matches the sniffed signature", () => {
    expect(
      validateUploadWithBytes("tenant-media", { type: "image/png", size: 10 }, PNG).ok,
    ).toBe(true);
  });

  it("rejects a renamed binary declared as an image", () => {
    const result = validateUploadWithBytes(
      "tenant-media",
      { type: "image/png", size: 10 },
      EXE,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("does not match");
  });

  it("rejects an image smuggled under a CSV label", () => {
    expect(
      validateUploadWithBytes("tenant-csvs", { type: "text/csv", size: 10 }, PNG).ok,
    ).toBe(false);
  });

  it("accepts real CSV text (no signature required)", () => {
    expect(
      validateUploadWithBytes("tenant-csvs", { type: "text/csv", size: 10 }, CSV_TEXT).ok,
    ).toBe(true);
  });

  it("allows glTF bytes under application/octet-stream in the models bucket only", () => {
    expect(
      validateUploadWithBytes(
        "tenant-3d-models",
        { type: "application/octet-stream", size: 10 },
        GLB,
      ).ok,
    ).toBe(true);
    // …but sniffed glTF under a CSV label elsewhere is still a mismatch.
    expect(
      validateUploadWithBytes("tenant-csvs", { type: "text/plain", size: 10 }, GLB).ok,
    ).toBe(false);
  });
});
