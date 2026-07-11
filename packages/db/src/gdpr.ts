/**
 * GDPR data-subject helpers (export + erasure), tenant-scoped.
 *
 * These operate on the CRM tables a visitor's personal data lands in today —
 * `leads` and `lead_activities` — keyed by the contact identifier (email,
 * optionally phone). They are deliberately identifier-driven rather than
 * account-driven because visitor accounts (Epic G) do not exist yet; when they
 * do, extend `PERSONAL_DATA_SOURCES` and both functions pick them up.
 *
 * Callers must pass a client that can legitimately see cross-user rows for the
 * tenant (service-role in the trusted route handlers). Every query is still
 * pinned with `.eq("tenant_id", …)` for defense in depth.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

type DbClient = SupabaseClient<Database, "public">;

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type LeadActivityRow = Database["public"]["Tables"]["lead_activities"]["Row"];

/** Contact identifiers that scope a data-subject request. */
export type VisitorIdentifier = {
  email?: string | null;
  phone?: string | null;
};

export type VisitorDataExport = {
  tenantId: string;
  identifier: { email: string | null; phone: string | null };
  exportedAt: string;
  leads: LeadRow[];
  leadActivities: LeadActivityRow[];
};

export type VisitorDeletionResult = {
  tenantId: string;
  identifier: { email: string | null; phone: string | null };
  deletedAt: string;
  deletedLeads: number;
  deletedLeadActivities: number;
};

class GdprIdentifierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GdprIdentifierError";
  }
}

function normalizeIdentifier(identifier: VisitorIdentifier): {
  email: string | null;
  phone: string | null;
} {
  const email = identifier.email?.trim().toLowerCase() || null;
  const phone = identifier.phone?.trim() || null;
  if (!email && !phone) {
    throw new GdprIdentifierError(
      "A GDPR request requires at least an email or a phone number.",
    );
  }
  return { email, phone };
}

/** Build the `email.eq.…,phone.eq.…` OR filter for the supplied identifiers. */
function matchClause(email: string | null, phone: string | null): string {
  const clauses: string[] = [];
  if (email) clauses.push(`email.eq.${email}`);
  if (phone) clauses.push(`phone.eq.${phone}`);
  return clauses.join(",");
}

/**
 * Collect every personal record held for a visitor within one tenant.
 * Returns a plain, serializable bundle suitable for a JSON download.
 */
export async function collectVisitorData(
  client: DbClient,
  tenantId: string,
  identifier: VisitorIdentifier,
): Promise<VisitorDataExport> {
  const { email, phone } = normalizeIdentifier(identifier);

  const { data: leads, error: leadsError } = await client
    .from("leads")
    .select("*")
    .eq("tenant_id", tenantId)
    .or(matchClause(email, phone))
    .order("created_at", { ascending: false });
  if (leadsError) throw leadsError;

  const leadIds = (leads ?? []).map((lead) => lead.id);
  let leadActivities: LeadActivityRow[] = [];
  if (leadIds.length > 0) {
    const { data: activities, error: activitiesError } = await client
      .from("lead_activities")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false });
    if (activitiesError) throw activitiesError;
    leadActivities = activities ?? [];
  }

  return {
    tenantId,
    identifier: { email, phone },
    exportedAt: new Date().toISOString(),
    leads: leads ?? [],
    leadActivities,
  };
}

/**
 * Erase every personal record held for a visitor within one tenant.
 * `lead_activities` is removed explicitly first so the count is accurate even
 * though the FK also cascades on lead deletion.
 */
export async function deleteVisitorData(
  client: DbClient,
  tenantId: string,
  identifier: VisitorIdentifier,
): Promise<VisitorDeletionResult> {
  const { email, phone } = normalizeIdentifier(identifier);

  const { data: leads, error: leadsError } = await client
    .from("leads")
    .select("id")
    .eq("tenant_id", tenantId)
    .or(matchClause(email, phone));
  if (leadsError) throw leadsError;

  const leadIds = (leads ?? []).map((lead) => lead.id);
  let deletedLeadActivities = 0;

  if (leadIds.length > 0) {
    const { data: removedActivities, error: activitiesError } = await client
      .from("lead_activities")
      .delete()
      .eq("tenant_id", tenantId)
      .in("lead_id", leadIds)
      .select("id");
    if (activitiesError) throw activitiesError;
    deletedLeadActivities = removedActivities?.length ?? 0;

    const { error: deleteLeadsError } = await client
      .from("leads")
      .delete()
      .eq("tenant_id", tenantId)
      .in("id", leadIds);
    if (deleteLeadsError) throw deleteLeadsError;
  }

  return {
    tenantId,
    identifier: { email, phone },
    deletedAt: new Date().toISOString(),
    deletedLeads: leadIds.length,
    deletedLeadActivities,
  };
}

export { GdprIdentifierError };
