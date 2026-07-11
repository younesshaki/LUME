/**
 * Audit trail helper (SCRUM-197, D-NEW-9).
 *
 * `recordAuditEvent` appends one row to `public.audit_log`. It must be called
 * with a client that can write the table — in practice the service-role client
 * from a trusted route handler, since the table has no client-side write policy
 * (see migration 026). Every event is tenant-scoped.
 *
 * Auditing must never break the operation it records: a failed write is logged
 * and swallowed, returning `false`, rather than thrown. Callers that genuinely
 * need to know can inspect the boolean.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

type DbClient = SupabaseClient<Database, "public">;

/** A security-relevant write worth remembering. Extend as new areas add audits. */
export type AuditEvent = {
  tenantId: string;
  /** Dotted action name, e.g. "lead.export", "gdpr.delete", "member.role_change". */
  action: string;
  /** The kind of thing acted on, e.g. "lead", "visitor", "vehicle". */
  resourceType: string;
  /** The signed-in user who acted, or null for public/system actions. */
  actorUserId?: string | null;
  /** Identifier of the affected resource, when there is a single one. */
  resourceId?: string | null;
  /** Any extra structured context (counts, filters, before/after). */
  metadata?: Record<string, unknown>;
  /** Originating IP, when known. */
  ipAddr?: string | null;
};

export async function recordAuditEvent(
  client: DbClient,
  event: AuditEvent,
): Promise<boolean> {
  const insert: Database["public"]["Tables"]["audit_log"]["Insert"] = {
    tenant_id: event.tenantId,
    actor_user_id: event.actorUserId ?? null,
    action: event.action,
    resource_type: event.resourceType,
    resource_id: event.resourceId ?? null,
    metadata: event.metadata ?? {},
    ip_addr: event.ipAddr ?? null,
  };

  const { error } = await client.from("audit_log").insert(insert);
  if (error) {
    console.error(`[audit] failed to record ${event.action}:`, error.message);
    return false;
  }
  return true;
}
