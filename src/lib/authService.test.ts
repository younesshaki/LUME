import { describe, expect, it } from "vitest";
import { sanitizeUsername } from "./authService";

describe("sanitizeUsername", () => {
  it("normalizes valid usernames", () => {
    expect(sanitizeUsername("  Youness_01 ")).toBe("youness_01");
  });

  it("rejects invalid usernames", () => {
    expect(sanitizeUsername("a")).toBeNull();
    expect(sanitizeUsername("has space")).toBeNull();
    expect(sanitizeUsername("symbols!")).toBeNull();
  });
});
