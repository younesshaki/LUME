// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readR2PublicBaseUrl, readR2VehicleImageConfig } from "./r2Config";

describe("R2 vehicle image configuration", () => {
  it("returns a complete validated server-only configuration", () => {
    expect(readR2VehicleImageConfig({
      NODE_ENV: "test",
      R2_ENDPOINT: "https://account.r2.cloudflarestorage.com/",
      R2_BUCKET_NAME: "lume-media",
      R2_PUBLIC_BASE_URL: "https://cdn.example.com/",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
    })).toEqual({
      endpoint: "https://account.r2.cloudflarestorage.com",
      bucket: "lume-media",
      publicBaseUrl: "https://cdn.example.com",
      accessKeyId: "access",
      secretAccessKey: "secret",
    });
  });

  it("allows public image URL resolution without server credentials", () => {
    expect(readR2PublicBaseUrl({
      NODE_ENV: "production",
      R2_PUBLIC_BASE_URL: "https://cdn.example.com/vehicles/",
    })).toBe("https://cdn.example.com/vehicles");
    expect(readR2PublicBaseUrl({
      NODE_ENV: "production",
      R2_PUBLIC_BASE_URL: "http://cdn.example.com",
    })).toBeNull();
  });

  it("fails closed when credentials or URLs are incomplete", () => {
    expect(readR2VehicleImageConfig({ R2_ENDPOINT: "https://example.com" })).toBeNull();
    expect(readR2VehicleImageConfig({
      NODE_ENV: "production",
      R2_ENDPOINT: "file:///tmp/r2",
      R2_BUCKET_NAME: "bucket",
      R2_PUBLIC_BASE_URL: "https://cdn.example.com",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
    })).toBeNull();
    expect(readR2VehicleImageConfig({
      NODE_ENV: "production",
      R2_ENDPOINT: "https://example.com/path",
      R2_BUCKET_NAME: "bucket",
      R2_PUBLIC_BASE_URL: "https://cdn.example.com",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
    })).toBeNull();
  });
});
