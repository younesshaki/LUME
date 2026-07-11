import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "./visitorAuth";

describe("password hashing", () => {
  it("round-trips a correct password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(await verifyPassword("wrong password", stored)).toBe(false);
  });

  it("produces a unique salt per hash", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
  });

  it("rejects malformed stored values", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "scrypt$abc")).toBe(false);
  });
});

describe("session tokens", () => {
  it("hashes deterministically and issues a future expiry", () => {
    const session = createSessionToken();
    expect(session.tokenHash).toBe(hashSessionToken(session.token));
    expect(session.token).not.toBe(session.tokenHash);
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
