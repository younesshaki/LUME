import { describe, expect, it } from "vitest";
import { presignR2Request } from "./r2Signing";

const FIXED_DATE = new Date("2026-02-03T04:05:06.000Z");
const BASE_OPTIONS = {
  endpoint: "https://account-id.r2.cloudflarestorage.com/",
  bucket: "tenant-assets",
  accessKeyId: "EXAMPLEACCESSKEY",
  secretAccessKey: "example-secret-access-key",
  now: FIXED_DATE,
} as const;

describe("presignR2Request", () => {
  it("creates a deterministic path-style PUT request", () => {
    const request = presignR2Request({
      ...BASE_OPTIONS,
      method: "PUT",
      key: "tenant-1/vehicles/hero.jpg",
      expiresInSeconds: 900,
    });

    expect(request).toEqual({
      method: "PUT",
      url: "https://account-id.r2.cloudflarestorage.com/tenant-assets/tenant-1/vehicles/hero.jpg"
        + "?X-Amz-Algorithm=AWS4-HMAC-SHA256"
        + "&X-Amz-Credential=EXAMPLEACCESSKEY%2F20260203%2Fauto%2Fs3%2Faws4_request"
        + "&X-Amz-Date=20260203T040506Z"
        + "&X-Amz-Expires=900"
        + "&X-Amz-SignedHeaders=host"
        + "&X-Amz-Signature=179a812c2bd80d424844d0a4650f03d6f1985fa99f1c9bae5eb75da4a60fe638",
      expiresAt: new Date("2026-02-03T04:20:06.000Z"),
    });
  });

  it("signs HEAD and DELETE independently from PUT", () => {
    const put = presignR2Request({
      ...BASE_OPTIONS,
      method: "PUT",
      key: "tenant-1/vehicle.jpg",
    });
    const head = presignR2Request({
      ...BASE_OPTIONS,
      method: "HEAD",
      key: "tenant-1/vehicle.jpg",
    });
    const deletion = presignR2Request({
      ...BASE_OPTIONS,
      method: "DELETE",
      key: "tenant-1/vehicle.jpg",
    });

    expect(head.method).toBe("HEAD");
    expect(head.url).not.toBe(put.url);
    expect(deletion.method).toBe("DELETE");
    expect(deletion.url).not.toBe(head.url);
    expect(new URL(head.url).searchParams.get("X-Amz-Expires")).toBe("900");
  });

  it("binds browser PUT content type and length into the signature", () => {
    const request = presignR2Request({
      ...BASE_OPTIONS,
      method: "PUT",
      key: "tenant-1/vehicle.webp",
      uploadHeaders: { contentType: "image/webp", contentLength: 2048 },
    });
    expect(new URL(request.url).searchParams.get("X-Amz-SignedHeaders"))
      .toBe("content-length;content-type;host");
    expect(request.url).not.toContain("image%2Fwebp");
  });

  it("RFC3986-encodes every key segment without collapsing separators", () => {
    const request = presignR2Request({
      ...BASE_OPTIONS,
      method: "PUT",
      key: "tenant 1/été + 100%/front#1?.jpg",
      expiresInSeconds: 60,
    });

    expect(new URL(request.url).pathname).toBe(
      "/tenant-assets/tenant%201/%C3%A9t%C3%A9%20%2B%20100%25/front%231%3F.jpg",
    );
    expect(request.url).not.toContain("+");
  });

  it("accepts the full seven-day SigV4 expiry and rejects invalid bounds", () => {
    expect(new URL(presignR2Request({
      ...BASE_OPTIONS,
      method: "HEAD",
      key: "vehicle.jpg",
      expiresInSeconds: 604_800,
    }).url).searchParams.get("X-Amz-Expires")).toBe("604800");

    for (const expiresInSeconds of [0, 604_801, 1.5, Number.NaN]) {
      expect(() => presignR2Request({
        ...BASE_OPTIONS,
        method: "HEAD",
        key: "vehicle.jpg",
        expiresInSeconds,
      })).toThrow(RangeError);
    }
  });

  it("rejects endpoint and path inputs that could change the signed target", () => {
    expect(() => presignR2Request({
      ...BASE_OPTIONS,
      endpoint: "http://account-id.r2.cloudflarestorage.com",
      method: "PUT",
      key: "vehicle.jpg",
    })).toThrow("endpoint must use HTTPS");
    expect(() => presignR2Request({
      ...BASE_OPTIONS,
      endpoint: "https://account-id.r2.cloudflarestorage.com/base",
      method: "PUT",
      key: "vehicle.jpg",
    })).toThrow("endpoint must not contain a path");
    expect(() => presignR2Request({
      ...BASE_OPTIONS,
      method: "PUT",
      key: "tenant/../vehicle.jpg",
    })).toThrow("key must not contain dot path segments");
    expect(() => presignR2Request({
      ...BASE_OPTIONS,
      bucket: "assets/private",
      method: "PUT",
      key: "vehicle.jpg",
    })).toThrow("bucket must not contain a slash");
    expect(() => presignR2Request({
      ...BASE_OPTIONS,
        method: "PATCH" as "PUT",
        key: "vehicle.jpg",
    })).toThrow("method must be PUT, HEAD, or DELETE");
  });
});
