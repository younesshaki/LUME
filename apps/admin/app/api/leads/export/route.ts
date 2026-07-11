/**
 * GET /api/leads/export?tenant=<slug>&q=<search>
 *
 * Streams the tenant's leads as a CSV download (SCRUM-175, K-9 — GDPR data
 * portability). Authenticated admin route: it uses the caller's session
 * (cookies) through the RLS-scoped server client, so only tenant members can
 * export, and only their own tenant's rows. The optional `q` mirrors the leads
 * inbox search so "export what you're looking at" works.
 */
import { leadsToCsv } from "@lume/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { auditWrite, requestIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EXPORT_ROWS = 50_000;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const slug = url.searchParams.get("tenant")?.trim();
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!slug) return json({ error: "Missing tenant" }, 400);

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  // RLS on `tenants` already restricts this to tenants the user belongs to.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) return json({ error: "Unknown tenant" }, 404);

  let query = supabase
    .from("leads")
    .select("*")
    .eq("tenant_id", tenant.id) // defense in depth on top of RLS
    .order("created_at", { ascending: false })
    .limit(MAX_EXPORT_ROWS);

  if (q) {
    const term = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    query = query.or(
      `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("[/api/leads/export] query failed:", error.message);
    return json({ error: "Unable to export leads" }, 500);
  }

  const rows = data ?? [];
  const csv = leadsToCsv(rows);
  const filename = `leads-${tenant.slug}-${new Date().toISOString().slice(0, 10)}.csv`;

  // Bulk PII leaving the system — record who exported what.
  await auditWrite({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "lead.export",
    resourceType: "lead",
    metadata: { count: rows.length, ...(q ? { query: q } : {}) },
    ipAddr: requestIp(request),
  });

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
