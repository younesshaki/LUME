import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/090_website_tour_preferences.sql"),
  "utf8",
);

describe("Website Hub tour preference migration", () => {
  it("extends the existing member preference row without creating a parallel data store", () => {
    expect(migration).toMatch(/alter table public\.tenant_member_preferences/i);
    expect(migration).toMatch(/add column if not exists website_tour_version integer/i);
    expect(migration).toMatch(/add column if not exists website_tour_completed_at timestamptz/i);
    expect(migration).toMatch(/add column if not exists website_tour_skipped_at timestamptz/i);
    expect(migration).not.toMatch(/create table/i);
  });
});
