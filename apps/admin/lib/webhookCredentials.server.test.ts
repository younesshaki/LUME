import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  webhookEncryptionConfigured,
} from "./webhookCredentials.server";

describe("webhook credential encryption", () => {
  const key = randomBytes(32).toString("base64");

  it("round-trips AES-256-GCM ciphertext without embedding plaintext", () => {
    const encrypted = encryptWebhookSecret("test-signing-secret", key);
    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain("test-signing-secret");
    expect(decryptWebhookSecret(encrypted, key)).toBe("test-signing-secret");
  });

  it("rejects bad keys, short secrets, and tampered ciphertext", () => {
    expect(webhookEncryptionConfigured(key)).toBe(true);
    expect(webhookEncryptionConfigured("bad")).toBe(false);
    expect(() => encryptWebhookSecret("short", key)).toThrow(/between 16 and 500/);
    const encrypted = encryptWebhookSecret("test-signing-secret", key);
    expect(() => decryptWebhookSecret(`${encrypted}x`, key)).toThrow(/could not be decrypted/);
  });
});
