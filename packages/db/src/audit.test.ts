import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";
import { recordAuditEvent } from "./audit";

/** Minimal fake: captures the table + inserted row, resolves with `error`. */
function fakeClient(error: { message: string } | null = null) {
  const insert = vi.fn().mockResolvedValue({ error });
  const from = vi.fn().mockReturnValue({ insert });
  return {
    client: { from } as unknown as SupabaseClient<Database, "public">,
    from,
    insert,
  };
}

describe("recordAuditEvent", () => {
  it("inserts a tenant-scoped row and defaults metadata to {}", async () => {
    const { client, from, insert } = fakeClient();
    const ok = await recordAuditEvent(client, {
      tenantId: "tenant-1",
      action: "lead.export",
      resourceType: "lead",
      actorUserId: "user-1",
    });

    expect(ok).toBe(true);
    expect(from).toHaveBeenCalledWith("audit_log");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        actor_user_id: "user-1",
        action: "lead.export",
        resource_type: "lead",
        resource_id: null,
        metadata: {},
        ip_addr: null,
      }),
    );
  });

  it("returns false and swallows errors so auditing never breaks the operation", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient({ message: "boom" });
    const ok = await recordAuditEvent(client, {
      tenantId: "tenant-1",
      action: "gdpr.delete",
      resourceType: "visitor",
    });
    expect(ok).toBe(false);
    errorSpy.mockRestore();
  });
});
