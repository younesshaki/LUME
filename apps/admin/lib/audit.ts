/**
 * Admin-side audit helper (SCRUM-197, D-NEW-9).
 *
 * The audit_log table has no client write policy (migration 026), so every
 * write goes through the service-role client here. Route handlers and server
 * actions call `auditWrite(...)` after a security-relevant mutation; it never
 * throws, so auditing can't break the operation being recorded.
 */
import { recordAuditEvent, type AuditEvent } from "@lume/db";
import { createServiceClient } from "@lume/db/server";

/** Best-effort originating IP from the standard proxy headers. */
export function requestIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    null
  );
}

/** Append one audit event via the service-role client. Fire-and-forget safe. */
export async function auditWrite(event: AuditEvent): Promise<void> {
  await recordAuditEvent(createServiceClient(), event);
}
