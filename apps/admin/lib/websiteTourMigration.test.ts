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

describe("Website Hub tour dismissal migration", () => {
  const dismissal = readFileSync(
    resolve(process.cwd(), "supabase/migrations/091_website_tour_dismissed.sql"),
    "utf8",
  );
  it("adds only the nullable opt-out column to the member preference row", () => {
    expect(dismissal).toMatch(/alter table public\.tenant_member_preferences/i);
    expect(dismissal).toMatch(/add column if not exists website_tour_dismissed_at timestamptz/i);
    expect(dismissal).not.toMatch(/create table|drop |delete |update /i);
  });
});

describe("Website section tour dismissal migration", () => {
  const dismissal = readFileSync(
    resolve(process.cwd(), "supabase/migrations/092_website_section_tour_dismissals.sql"),
    "utf8",
  );

  it("uses the existing member preference row with a defaulted keyed object", () => {
    expect(dismissal).toMatch(/alter table public\.tenant_member_preferences/i);
    expect(dismissal).toMatch(/add column if not exists website_section_tour_dismissals jsonb not null default '\{\}'::jsonb/i);
    expect(dismissal).toMatch(/jsonb_typeof\(website_section_tour_dismissals\) = 'object'/i);
    expect(dismissal).not.toMatch(/create table|drop |delete |update /i);
  });
});
