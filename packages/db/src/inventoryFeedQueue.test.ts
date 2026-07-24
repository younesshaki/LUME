import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  archiveInventoryExportDestination,
  archiveInventoryFeedSource,
  enqueueInventoryExportRun,
  enqueueInventoryFeedRun,
  nextInventoryRunAttemptAt,
  normalizeInventoryRetryDelays,
  sanitizeInventoryRunDiagnostics,
  setInventoryExportDestinationEnabled,
  setInventoryFeedSourceEnabled,
} from "./inventoryFeedQueue";

describe("managed inventory queue primitives", () => {
  it("keeps export claims serialized with destination configuration changes", () => {
    // This is a migration contract: pause/update/archive lock a destination
    // before cancelling queued work, so an export claim must lock that same
    // destination as well as its run. Without it, an old snapshot could be
    // promoted to `delivering` after the control action had reported success.
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/077_managed_inventory_feeds_and_exports.sql"),
      "utf8",
    );
    const claim = migration.slice(
      migration.indexOf("create or replace function public.claim_inventory_export_runs"),
      migration.indexOf("create or replace function public.complete_inventory_export_run"),
    );
    expect(claim).toContain("for update of run, destination skip locked");
  });

  it("accepts only bounded integer retry schedules and calculates the claimed attempt delay", () => {
    expect(normalizeInventoryRetryDelays([60, 300])).toEqual([60, 300]);
    expect(normalizeInventoryRetryDelays([])).toBeNull();
    expect(normalizeInventoryRetryDelays([0])).toBeNull();
    expect(normalizeInventoryRetryDelays([86_401])).toBeNull();
    expect(nextInventoryRunAttemptAt(2, [60, 300], 1_000)).toBe(new Date(301_000).toISOString());
    expect(nextInventoryRunAttemptAt(3, [60, 300], 1_000)).toBeNull();
  });

  it("bounds and sanitizes tenant-visible run diagnostics", () => {
    const diagnostics = sanitizeInventoryRunDiagnostics(Array.from({ length: 101 }, (_, index) => ({
      stage: "parse" as const,
      message: index === 0 ? "x".repeat(600) : "valid",
      line: index === 0 ? 2 : 0,
    })));
    expect(diagnostics).toHaveLength(100);
    expect(diagnostics[0]).toEqual({ stage: "parse", message: "x".repeat(500), line: 2 });
    expect(diagnostics[1]).toEqual({ stage: "parse", message: "valid" });
  });

  it("always scopes manual enqueues and archival RPCs to the caller tenant", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return { data: name.startsWith("enqueue") ? "run-1" : true, error: null };
      },
    } as never;

    await enqueueInventoryFeedRun(client, "source-a", "tenant-a");
    await enqueueInventoryExportRun(client, "destination-b", "tenant-b");
    await archiveInventoryFeedSource(client, "source-a", "tenant-a");
    await archiveInventoryExportDestination(client, "destination-b", "tenant-b");
    await setInventoryFeedSourceEnabled(client, "source-a", "tenant-a", false);
    await setInventoryExportDestinationEnabled(client, "destination-b", "tenant-b", true);

    expect(calls).toEqual([
      {
        name: "enqueue_inventory_feed_run",
        args: { p_feed_source_id: "source-a", p_tenant_id: "tenant-a", p_run_trigger: "manual" },
      },
      {
        name: "enqueue_inventory_export_run",
        args: { p_export_destination_id: "destination-b", p_tenant_id: "tenant-b", p_run_trigger: "manual" },
      },
      {
        name: "archive_inventory_feed_source",
        args: { p_feed_source_id: "source-a", p_tenant_id: "tenant-a" },
      },
      {
        name: "archive_inventory_export_destination",
        args: { p_export_destination_id: "destination-b", p_tenant_id: "tenant-b" },
      },
      {
        name: "set_inventory_feed_source_enabled",
        args: { p_feed_source_id: "source-a", p_tenant_id: "tenant-a", p_enabled: false },
      },
      {
        name: "set_inventory_export_destination_enabled",
        args: { p_export_destination_id: "destination-b", p_tenant_id: "tenant-b", p_enabled: true },
      },
    ]);
  });
});
