import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/073_concierge_targets.sql"),
  "utf8",
);

describe("migration 073 concierge target security shape", () => {
  it("enables tenant-scoped member reads and omits browser write policies", () => {
    expect(migration).toMatch(
      /alter table public\.concierge_targets enable row level security/i,
    );
    expect(migration).toMatch(/for select\s+to authenticated/i);
    expect(migration).toContain(
      "tenant_id in (select public.tenant_ids_for_current_user())",
    );
    expect(migration).not.toMatch(/for (insert|update|delete)\s+to authenticated/i);
  });

  it("grants authenticated read only and preserves trusted service writes", () => {
    expect(migration).toMatch(
      /revoke all on table public\.concierge_targets from anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant select on table public\.concierge_targets to authenticated/i,
    );
    expect(migration).toMatch(
      /grant all on table public\.concierge_targets to service_role/i,
    );
    expect(migration).toMatch(
      /create index if not exists concierge_targets_tenant_enabled_sort_idx[\s\S]+tenant_id, enabled, sort_order, key/i,
    );
    expect(migration).toMatch(/position\('%' in destination\) = 0/i);
    expect(migration).toContain("destination !~ '(^|/)\\.{1,2}(/|#|$)'");
  });
});
