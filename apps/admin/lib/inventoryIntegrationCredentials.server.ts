/**
 * Encrypted credentials for managed inventory feeds and export destinations.
 *
 * Credentials never reach a browser after they are saved. The database stores
 * only an authenticated ciphertext and the cron workers turn that ciphertext
 * into request headers immediately before their pinned HTTPS request.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const MAX_CREDENTIAL_VALUE_LENGTH = 2_000;

export type InventoryIntegrationCredential =
  | { kind: "bearer"; token: string }
  | { kind: "basic"; username: string; password: string }
  | { kind: "header"; name: string; value: string }
  /** SFTP-only password authentication; it can never become an HTTP header. */
  | { kind: "sftp_password"; username: string; password: string };

export type InventoryIntegrationCredentialInput = {
  authType?: unknown;
  bearerToken?: unknown;
  username?: unknown;
  password?: unknown;
  headerName?: unknown;
  headerValue?: unknown;
};

/**
 * Validate a form/API credential shape. `null` deliberately means public,
 * unauthenticated HTTPS: callers do not write a useless secret row for it.
 */
export function parseInventoryIntegrationCredential(
  input: InventoryIntegrationCredentialInput,
): { ok: true; value: InventoryIntegrationCredential | null } | { ok: false; error: string } {
  const authType = stringValue(input.authType).toLowerCase() || "none";
  if (authType === "none") return { ok: true, value: null };

  if (authType === "bearer") {
    const token = stringValue(input.bearerToken);
    if (!isCredentialValue(token)) return { ok: false, error: "Bearer token must be between 1 and 2,000 characters." };
    return { ok: true, value: { kind: "bearer", token } };
  }

  if (authType === "basic") {
    const username = stringValue(input.username);
    const password = stringValue(input.password);
    if (!isCredentialValue(username) || !isCredentialValue(password)) {
      return { ok: false, error: "Basic-auth username and password must each be between 1 and 2,000 characters." };
    }
    return { ok: true, value: { kind: "basic", username, password } };
  }

  if (authType === "sftp_password") {
    const username = stringValue(input.username);
    const password = stringValue(input.password);
    if (!isCredentialValue(username) || !isCredentialValue(password)) {
      return { ok: false, error: "SFTP username and password must each be between 1 and 2,000 characters." };
    }
    return { ok: true, value: { kind: "sftp_password", username, password } };
  }

  if (authType === "header") {
    const name = stringValue(input.headerName);
    const value = stringValue(input.headerValue);
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/.test(name)) {
      return { ok: false, error: "Custom header name is invalid." };
    }
    if (!isCredentialValue(value)) return { ok: false, error: "Custom header value must be between 1 and 2,000 characters." };
    // Transport owns routing/framing/content headers. A credential may only
    // add authentication metadata, never alter the pinned destination or the
    // payload semantics selected by a safe export profile.
    if (/^(host|content-length|connection|transfer-encoding|content-type|accept)$/i.test(name)) {
      return { ok: false, error: "This custom header is controlled by LUME's secure transport." };
    }
    return { ok: true, value: { kind: "header", name, value } };
  }

  return { ok: false, error: "Choose no auth, bearer, basic, SFTP password, or one custom header." };
}

export function encryptInventoryIntegrationCredential(
  credential: InventoryIntegrationCredential,
  encodedKey = process.env.INVENTORY_INTEGRATION_ENCRYPTION_KEY,
): string {
  const key = decodeEncryptionKey(encodedKey);
  const plaintext = JSON.stringify(credential);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map((value) =>
    typeof value === "string" ? value : value.toString("base64url")).join(":");
}

export function decryptInventoryIntegrationCredential(
  ciphertext: string,
  encodedKey = process.env.INVENTORY_INTEGRATION_ENCRYPTION_KEY,
): InventoryIntegrationCredential {
  const [version, ivValue, tagValue, encryptedValue, ...extra] = ciphertext.split(":");
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue || extra.length > 0) {
    throw new Error("Inventory integration credential is invalid.");
  }
  const key = decodeEncryptionKey(encodedKey);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return parseDecryptedCredential(JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8")));
  } catch {
    throw new Error("Inventory integration credential could not be decrypted.");
  }
}

export function inventoryIntegrationEncryptionConfigured(
  value = process.env.INVENTORY_INTEGRATION_ENCRYPTION_KEY,
): boolean {
  try {
    decodeEncryptionKey(value);
    return true;
  } catch {
    return false;
  }
}

/** Convert a validated credential to the exact headers a pinned request needs. */
export function inventoryIntegrationCredentialHeaders(
  credential: InventoryIntegrationCredential | null,
): Record<string, string> {
  if (!credential) return {};
  if (credential.kind === "bearer") return { Authorization: `Bearer ${credential.token}` };
  if (credential.kind === "basic") {
    return { Authorization: `Basic ${Buffer.from(`${credential.username}:${credential.password}`, "utf8").toString("base64")}` };
  }
  if (credential.kind === "sftp_password") {
    throw new Error("SFTP credentials cannot be used for an HTTPS inventory feed.");
  }
  return { [credential.name]: credential.value };
}

function parseDecryptedCredential(value: unknown): InventoryIntegrationCredential {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid credential payload.");
  const record = value as Record<string, unknown>;
  if (record.kind === "bearer" && isCredentialValue(record.token)) {
    return { kind: "bearer", token: stringValue(record.token) };
  }
  if (record.kind === "basic" && isCredentialValue(record.username) && isCredentialValue(record.password)) {
    return { kind: "basic", username: stringValue(record.username), password: stringValue(record.password) };
  }
  if (record.kind === "sftp_password" && isCredentialValue(record.username) && isCredentialValue(record.password)) {
    return { kind: "sftp_password", username: stringValue(record.username), password: stringValue(record.password) };
  }
  if (record.kind === "header" && typeof record.name === "string" &&
    /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/.test(record.name) &&
    !/^(host|content-length|connection|transfer-encoding|content-type|accept)$/i.test(record.name) &&
    isCredentialValue(record.value)) {
    return { kind: "header", name: record.name, value: stringValue(record.value) };
  }
  throw new Error("Invalid credential payload.");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isCredentialValue(value: unknown): boolean {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= MAX_CREDENTIAL_VALUE_LENGTH
    && !/[\u0000\r\n]/.test(value);
}

function decodeEncryptionKey(value: string | undefined): Buffer {
  if (!value) throw new Error("INVENTORY_INTEGRATION_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("INVENTORY_INTEGRATION_ENCRYPTION_KEY must decode to 32 bytes.");
  }
  return key;
}
