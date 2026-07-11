/**
 * Visitor password + session-token crypto (SCRUM-128). Server-only.
 *
 * Passwords: scrypt with a per-password random salt, stored as
 * `scrypt$<salt-hex>$<hash-hex>`. Verification is constant-time. No external
 * dependency — Node's crypto is enough and keeps the hash format inspectable.
 *
 * Session tokens: a 256-bit random token handed to the browser in a cookie;
 * only its SHA-256 hash is stored, so a leaked DB row can't be replayed.
 */
import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000; // 30 days

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (expected.length !== KEYLEN) return false;
  const derived = await scrypt(password, salt, KEYLEN);
  return timingSafeEqual(derived, expected);
}

export type SessionToken = {
  /** Raw token for the cookie (never stored). */
  token: string;
  /** SHA-256 of the token, stored in visitor_sessions.token_hash. */
  tokenHash: string;
  /** Absolute expiry to persist + set on the cookie. */
  expiresAt: Date;
};

export function createSessionToken(): SessionToken {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
