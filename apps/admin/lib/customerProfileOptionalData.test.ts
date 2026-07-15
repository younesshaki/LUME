import { describe, expect, it } from "vitest";
import { isMissingOptionalCustomerRelation } from "./customerProfileOptionalData";

describe("optional Customer 360 relation fallback", () => {
  it("recognizes Postgres and PostgREST missing-relation errors", () => {
    expect(isMissingOptionalCustomerRelation({ code: "42P01", message: "relation does not exist" })).toBe(true);
    expect(isMissingOptionalCustomerRelation({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
  });

  it("does not hide unrelated database failures", () => {
    expect(isMissingOptionalCustomerRelation({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingOptionalCustomerRelation(new Error("connection timed out"))).toBe(false);
  });
});
