import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/080_admin_concierge_commands.sql"),
  "utf8",
);

describe("admin concierge command migration contract", () => {
  it("keeps reviewed commands durable, bounded, and inaccessible to browser roles", () => {
    expect(migration).toContain("create table if not exists public.admin_concierge_commands");
    expect(migration).toContain("unique (tenant_id, idempotency_key)");
    expect(migration).toContain("alter table public.admin_concierge_commands enable row level security");
    expect(migration).toContain("revoke all on table public.admin_concierge_commands from anon, authenticated");
  });

  it("executes a lead change under one locked, service-only database function", () => {
    expect(migration).toContain("for update;");
    expect(migration).toContain("execute_admin_concierge_lead_status_command");
    expect(migration).toContain("revoke all on function public.execute_admin_concierge_lead_status_command");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("alreadyExecuted");
    expect(migration).toContain("insert into public.lead_activities");
  });

  it("treats the reviewed status as a compare-and-swap precondition", () => {
    expect(migration).toContain("v_expected_status := v_command.preview #>> '{lead,currentStatus}'");
    expect(migration).toContain("if v_lead.status is distinct from v_expected_status then");
    expect(migration).toContain("'status', 'stale'");
  });

  it("rechecks and locks the actor's editor role inside the write transaction", () => {
    expect(migration).toContain("from public.tenant_members member");
    expect(migration).toContain("member.role in ('owner', 'admin', 'editor')");
    expect(migration).toContain("for update;");
    expect(migration).toContain("The operator no longer has edit access for this tenant.");
  });

  it("reuses the durable inventory queue only after owner/admin confirmation and config-version grounding", () => {
    expect(migration).toContain("'feed.run.enqueue'");
    expect(migration).toContain("execute_admin_concierge_feed_run_command");
    expect(migration).toContain("member.role in ('owner', 'admin')");
    expect(migration).toContain("v_source.config_version <> v_config_version");
    expect(migration).toContain("public.enqueue_inventory_feed_run(v_source.id, p_tenant_id, 'manual')");
    expect(migration).toContain("'status', 'queued'");
  });
});
