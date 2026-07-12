import { createServiceClient } from "@lume/db/server";
import { checkTenantDomainVerification } from "@/lib/domainVerification.server";
import { rowToTenantDomain } from "@/lib/domains";
import { captureError } from "@/lib/observability";
import { checkPublicRouteRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }
  const rateLimit = checkPublicRouteRateLimit("domain-verify", request);
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);

  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  const userResult = await supabase.auth.getUser();
  if (!userResult.data.user) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const { data: visibleDomain, error: readError } = await supabase
    .from("tenant_domains")
    .select("tenant_id")
    .eq("id", id)
    .maybeSingle();
  if (readError || !visibleDomain) return Response.json({ error: "Domain not found." }, { status: 404 });
  const { data: allowed, error: roleError } = await supabase.rpc("user_has_tenant_role", {
    p_tenant_id: visibleDomain.tenant_id,
    p_roles: ["owner", "admin", "editor"],
  });
  if (roleError || !allowed) return Response.json({ error: "Forbidden." }, { status: 403 });

  const service = createServiceClient();
  const { data: row, error } = await service.from("tenant_domains").select("*").eq("id", id).maybeSingle();
  if (error || !row) return Response.json({ error: "Domain not found." }, { status: 404 });
  try {
    const outcome = await checkTenantDomainVerification(service, row, new URL(request.url).origin);
    if (outcome.status === "not_configured") {
      return Response.json({ error: "Domain verification is not configured." }, { status: 503 });
    }
    return Response.json({ domain: rowToTenantDomain(outcome.domain) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (verificationError) {
    captureError("api/domains/verify", verificationError, {
      tenantId: row.tenant_id,
      domainId: row.id,
    });
    return Response.json({ error: "Unable to verify domain." }, { status: 502 });
  }
}
