// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateMigrationNames } from "./check-migrations.mjs";

describe("migration filename validation", () => {
  it("accepts a continuous ordered migration set", () => {
    expect(validateMigrationNames(["002_second.sql", "001_first.sql"])).toEqual([]);
  });

  it("reports gaps and invalid names", () => {
    const errors = validateMigrationNames(["001_first.sql", "003_third.sql", "notes.sql"]);
    expect(errors).toContain("Invalid migration filename: notes.sql");
    expect(errors).toContain("Expected migration 002, found 003_third.sql");
  });
});
