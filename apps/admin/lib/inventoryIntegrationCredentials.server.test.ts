import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptInventoryIntegrationCredential,
  encryptInventoryIntegrationCredential,
  inventoryIntegrationCredentialHeaders,
  inventoryIntegrationEncryptionConfigured,
  parseInventoryIntegrationCredential,
} from "./inventoryIntegrationCredentials.server";

describe("inventory integration credentials", () => {
  const key = randomBytes(32).toString("base64");

  it("validates, encrypts, and decrypts credentials without exposing plaintext", () => {
    const input = parseInventoryIntegrationCredential({ authType: "bearer", bearerToken: "supplier-token" });
    expect(input).toEqual({ ok: true, value: { kind: "bearer", token: "supplier-token" } });
    if (!input.ok || !input.value) throw new Error("expected credential");
    const encrypted = encryptInventoryIntegrationCredential(input.value, key);
    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain("supplier-token");
    expect(decryptInventoryIntegrationCredential(encrypted, key)).toEqual(input.value);
    expect(inventoryIntegrationCredentialHeaders(input.value)).toEqual({ Authorization: "Bearer supplier-token" });
  });

  it("accepts public endpoints without a secret and rejects unsafe header configuration", () => {
    expect(parseInventoryIntegrationCredential({ authType: "none" })).toEqual({ ok: true, value: null });
    expect(parseInventoryIntegrationCredential({ authType: "header", headerName: "Host", headerValue: "bad" }))
      .toEqual({ ok: false, error: "This custom header is controlled by LUME's secure transport." });
    expect(parseInventoryIntegrationCredential({ authType: "header", headerName: "Content-Type", headerValue: "text/plain" }))
      .toEqual({ ok: false, error: "This custom header is controlled by LUME's secure transport." });
    expect(inventoryIntegrationEncryptionConfigured(key)).toBe(true);
    expect(inventoryIntegrationEncryptionConfigured("not-a-key")).toBe(false);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptInventoryIntegrationCredential({ kind: "basic", username: "dealer", password: "secret" }, key);
    expect(() => decryptInventoryIntegrationCredential(`${encrypted}x`, key)).toThrow(/could not be decrypted/);
  });
});
