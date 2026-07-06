import { describe, expect, it } from "vitest";
import { isValidInviteToken, signupNextPath } from "./signupDestination";

const HEX_TOKEN = "a".repeat(48); // shape of encode(gen_random_bytes(24), 'hex')

describe("signupNextPath", () => {
  it("returns onboarding when there is no invite", () => {
    expect(signupNextPath(null)).toBe("/admin/onboarding");
    expect(signupNextPath(undefined)).toBe("/admin/onboarding");
    expect(signupNextPath("")).toBe("/admin/onboarding");
  });

  it("returns the invite path for a well-formed token", () => {
    expect(signupNextPath(HEX_TOKEN)).toBe(`/invite/${HEX_TOKEN}`);
    expect(signupNextPath("Ab1_-Ab1")).toBe("/invite/Ab1_-Ab1");
  });

  it("falls back to onboarding for malformed tokens", () => {
    for (const junk of [
      "../evil",
      "a/b",
      "has space",
      "short",
      "x".repeat(129),
      "%2e%2e",
      "token?x=1",
    ]) {
      expect(signupNextPath(junk)).toBe("/admin/onboarding");
    }
  });
});

describe("isValidInviteToken", () => {
  it("accepts url-safe tokens and rejects everything else", () => {
    expect(isValidInviteToken(HEX_TOKEN)).toBe(true);
    expect(isValidInviteToken("../../etc")).toBe(false);
    expect(isValidInviteToken(null)).toBe(false);
  });
});
