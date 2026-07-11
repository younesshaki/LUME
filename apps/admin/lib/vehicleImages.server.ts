import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  extractTenantSlugFromRequest,
  hasConflictingTenantSelectors,
} from "@/lib/tenant";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AuthorizedVehicleImageRequest = {
  ok: true;
  tenant: { tenantId: string; slug: string };
  userId: string;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
};

export type RejectedVehicleImageRequest = {
  ok: false;
  status: number;
  error: string;
};

export async function authorizeVehicleImageRequest(
  request: Request,
  vehicleId: string,
): Promise<AuthorizedVehicleImageRequest | RejectedVehicleImageRequest> {
  if (!UUID_PATTERN.test(vehicleId)) return { ok: false, status: 404, error: "Vehicle not found." };
  if (hasConflictingTenantSelectors(request)) {
    return { ok: false, status: 400, error: "Tenant selector mismatch." };
  }

  const tenantSlug = extractTenantSlugFromRequest(request);
  if (!tenantSlug) return { ok: false, status: 400, error: "Tenant is required." };
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Sign in to manage vehicle images." };

  // Resolve through the authenticated RLS client so members can manage trial
  // or suspended tenants even though public tenant resolution is active-only.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug")
    .eq("slug", tenantSlug)
    .maybeSingle();
  if (!tenant) return { ok: false, status: 404, error: "Tenant not found." };

  const [vehicleResult, roleResult] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    supabase.rpc("user_has_tenant_role", {
      p_tenant_id: tenant.id,
      p_roles: ["owner", "admin", "editor"],
    }),
  ]);
  if (!vehicleResult.data) return { ok: false, status: 404, error: "Vehicle not found." };
  if (roleResult.error || roleResult.data !== true) {
    return { ok: false, status: 403, error: "Editor access is required." };
  }

  return {
    ok: true,
    tenant: { tenantId: tenant.id, slug: tenant.slug },
    userId: user.id,
    supabase,
  };
}
