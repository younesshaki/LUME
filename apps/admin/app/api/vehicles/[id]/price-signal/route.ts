import { createAnonServerClient } from "@lume/db/server";
import { getTenantFromRequest, hasConflictingTenantSelectors } from "@/lib/tenant";
import { corsHeadersFor, isAllowedOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) });
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  if (!isAllowedOrigin(request)) return json({ error: "Forbidden origin" }, 403, request);
  if (hasConflictingTenantSelectors(request)) {
    return json({ error: "Tenant selector mismatch" }, 400, request);
  }

  const tenant = await getTenantFromRequest(request);
  if (!tenant) return json({ error: "Unknown or inactive tenant" }, 404, request);
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return json({ enabled: false, reductions: 0 }, 200, request);

  try {
    const { data, error } = await createAnonServerClient().rpc(
      "get_public_vehicle_price_signal",
      { p_tenant_id: tenant.tenantId, p_vehicle_id: id },
    );
    if (error) {
      // Staggered rollout without migration 042 should hide, never break, the detail page.
      return json({ enabled: false, reductions: 0 }, 200, request);
    }
    const signal = data?.[0];
    return json({
      enabled: signal?.enabled === true,
      reductions: signal?.enabled === true ? Math.max(0, signal.reductions) : 0,
    }, 200, request);
  } catch {
    return json({ enabled: false, reductions: 0 }, 200, request);
  }
}

function json(payload: unknown, status: number, request: Request): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Tenant resolution can use a custom header, so shared URL caches are unsafe.
      "Cache-Control": "private, no-store",
      ...corsHeadersFor(request),
    },
  });
}
