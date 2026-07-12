import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

export function encryptWebhookSecret(secret: string, encodedKey?: string): string {
  const normalized = secret.trim();
  if (normalized.length < 16 || normalized.length > 500) {
    throw new Error("Webhook signing secret must be between 16 and 500 characters.");
  }
  const key = decodeEncryptionKey(encodedKey ?? process.env.WEBHOOK_ENCRYPTION_KEY);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map((value) =>
    typeof value === "string" ? value : value.toString("base64url")).join(":");
}

export function decryptWebhookSecret(ciphertext: string, encodedKey?: string): string {
  const [version, ivValue, tagValue, encryptedValue, ...extra] = ciphertext.split(":");
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue || extra.length > 0) {
    throw new Error("Webhook credential is invalid.");
  }
  const key = decodeEncryptionKey(encodedKey ?? process.env.WEBHOOK_ENCRYPTION_KEY);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Webhook credential could not be decrypted.");
  }
}

export function webhookEncryptionConfigured(value = process.env.WEBHOOK_ENCRYPTION_KEY): boolean {
  try {
    decodeEncryptionKey(value);
    return true;
  } catch {
    return false;
  }
}

function decodeEncryptionKey(value: string | undefined): Buffer {
  if (!value) throw new Error("WEBHOOK_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("WEBHOOK_ENCRYPTION_KEY must decode to 32 bytes.");
  return key;
}
