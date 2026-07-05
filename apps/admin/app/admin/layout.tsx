import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminShell, type ShellTenant } from "@/components/admin-shell";

/**
 * Admin layout. Middleware already redirects unauthenticated users to /login
 * for any /admin/* route — this layout fetches the user's tenant memberships
 * and hands everything to the client shell (sidebar, breadcrumbs, Cmd+K).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/admin");

  async function signOut() {
    "use server";
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  // Memberships are RLS-protected: this returns only the rows the user can see.
  const [{ data: memberships }, { data: isPlatformAdmin }] = await Promise.all([
    supabase.from("tenant_members").select("tenant_id, role").eq("user_id", user.id),
    supabase.rpc("is_platform_admin"),
  ]);

  const tenantIds = memberships?.map((membership) => membership.tenant_id) ?? [];
  const { data: tenants } = tenantIds.length
    ? await supabase
        .from("tenants")
        .select("id, slug, name, status")
        .in("id", tenantIds)
    : { data: [] };
  const tenantsById = new Map((tenants ?? []).map((tenant) => [tenant.id, tenant]));

  const publicSiteUrl =
    process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ?? "https://lume-jade-three.vercel.app";
  // The public deployment renders one tenant by default; other tenants are
  // viewed via the runtime ?tenant= override (+ preview mode for DB pages).
  const tenantSiteUrl = (slug: string) =>
    slug === "default"
      ? publicSiteUrl
      : `${publicSiteUrl}/home?tenant=${encodeURIComponent(slug)}&preview=lume`;

  const shellTenants: ShellTenant[] = [];
  for (const membership of memberships ?? []) {
    const tenant = tenantsById.get(membership.tenant_id);
    if (!tenant) continue;
    shellTenants.push({
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      role: membership.role,
      siteUrl: tenantSiteUrl(tenant.slug),
    });
  }
  shellTenants.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <AdminShell
      email={user.email ?? "account"}
      tenants={shellTenants}
      isPlatformAdmin={Boolean(isPlatformAdmin)}
      flagshipUrl={publicSiteUrl}
      signOutAction={signOut}
    >
      {children}
    </AdminShell>
  );
}
