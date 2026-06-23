import type { Database } from "@lume/db";
import type { LeadActivity } from "@lume/types";

export type LeadActivityRow = Database["public"]["Tables"]["lead_activities"]["Row"];

export function rowToLeadActivity(row: LeadActivityRow): LeadActivity {
  return {
    id: row.id,
    leadId: row.lead_id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    type: row.type,
    body: row.body,
    createdAt: row.created_at,
  };
}
