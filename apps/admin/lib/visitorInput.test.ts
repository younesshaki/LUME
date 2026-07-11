import { describe, expect, it } from "vitest";
import { parseLoginInput, parseSignupInput } from "./visitorInput";

describe("parseSignupInput", () => {
  it("accepts a valid signup and normalizes email", () => {
    const result = parseSignupInput({
      email: "  ADA@Example.com ",
      password: "longenough",
      firstName: " Ada ",
    });
    expect(result).toEqual({
      ok: true,
      value: { email: "ada@example.com", password: "longenough", firstName: "Ada", lastName: "" },
    });
  });

  it("rejects bad email and short passwords", () => {
    expect(parseSignupInput({ email: "nope", password: "longenough" }).ok).toBe(false);
    expect(parseSignupInput({ email: "a@b.com", password: "short" }).ok).toBe(false);
    expect(parseSignupInput(null).ok).toBe(false);
  });
});

describe("parseLoginInput", () => {
  it("requires both email and password", () => {
    expect(parseLoginInput({ email: "a@b.com", password: "x" }).ok).toBe(true);
    expect(parseLoginInput({ email: "a@b.com" }).ok).toBe(false);
    expect(parseLoginInput({ password: "x" }).ok).toBe(false);
  });
});
