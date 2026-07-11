/**
 * GET /api/visitor/loyalty — the signed-in visitor's loyalty view (SCRUM-135
 * backend): points balance, derived tier, and recent transactions. 401 if not
 * signed in.
 */
import { assembleVisitorLoyalty } from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { isAllowedOrigin } from "@/lib/origin";
import { resolveVisitor, visitorCorsHeaders } from "@/lib/visitorSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TRANSACTIONS = 25;

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: visitorCorsHeaders(request) });
}

export async function GET(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return json(request, { error: "Forbidden origin" }, 403);

  const tenant = await getTenantFromRequest(request);
  if (!tenant) return json(request, { error: "Unknown or inactive tenant" }, 404);

  const visitor = await resolveVisitor(request, tenant.tenantId);
  if (!visitor) return json(request, { error: "Not authenticated" }, 401);

  const supabase = createServiceClient();

  // Match the account by visitor link first, falling back to email.
  const { data: account } = await supabase
    .from("loyalty_accounts")
    .select("id, points_balance")
    .eq("tenant_id", tenant.tenantId)
    .or(`visitor_id.eq.${visitor.id},email.eq.${visitor.email}`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [transactionsRes, tiersRes] = await Promise.all([
    account
      ? supabase
          .from("loyalty_transactions")
          .select("id, points_delta, description, occurred_at")
          .eq("tenant_id", tenant.tenantId)
          .eq("account_id", account.id)
          .order("occurred_at", { ascending: false })
          .limit(MAX_TRANSACTIONS)
      : Promise.resolve({ data: [] }),
    supabase
      .from("loyalty_tiers")
      .select("name, threshold")
      .eq("tenant_id", tenant.tenantId),
  ]);

  const view = assembleVisitorLoyalty(
    account,
    transactionsRes.data ?? [],
    tiersRes.data ?? [],
  );
  return json(request, view, 200);
}

function json(request: Request, payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...visitorCorsHeaders(request) },
  });
}
