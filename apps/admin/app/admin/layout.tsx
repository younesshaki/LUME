import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Admin layout. Middleware already redirects unauthenticated users to /login
 * for any /admin/* route — this layout fetches the user's tenant memberships
 * and renders the chrome.
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

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 shrink-0 border-r border-neutral-200 dark:border-neutral-800 p-4 space-y-4">
        <div>
          <Link href="/admin" className="font-semibold text-base">LUME Admin</Link>
          <p className="text-xs text-neutral-500 mt-1 truncate">{user.email}</p>
        </div>
        <nav className="space-y-1 text-sm">
          {isPlatformAdmin && (
            <Link
              href="/admin/platform"
              className="block rounded-md px-2 py-1.5 mb-2 font-medium bg-neutral-100 dark:bg-neutral-900 hover:bg-neutral-200 dark:hover:bg-neutral-800"
            >
              ⚙ Platform
            </Link>
          )}
          <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
            Tenants
          </p>
          {memberships?.length === 0 && (
            <Link
              href="/admin/onboarding"
              className="block rounded-md px-2 py-1.5 text-xs text-neutral-500 underline underline-offset-2 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            >
              Create your site →
            </Link>
          )}
          {memberships?.map((m) => {
            const tenant = tenantsById.get(m.tenant_id);
            if (!tenant) return null;
            return (
              <div key={tenant.id} className="space-y-0.5">
                <Link
                  href={`/admin/${tenant.slug}`}
                  className="block rounded-md px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  {tenant.name}
                  <span className="ml-2 text-xs text-neutral-500">{m.role}</span>
                </Link>
                <Link
                  href={`/admin/${tenant.slug}/vehicles`}
                  className="block rounded-md px-2 py-1 pl-6 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  Vehicles
                </Link>
                <Link
                  href={`/admin/${tenant.slug}/leads`}
                  className="block rounded-md px-2 py-1 pl-6 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  Leads
                </Link>
                <Link
                  href={`/admin/${tenant.slug}/analytics`}
                  className="block rounded-md px-2 py-1 pl-6 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  Analytics
                </Link>
                <Link
                  href={`/admin/${tenant.slug}/assets`}
                  className="block rounded-md px-2 py-1 pl-6 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  Assets
                </Link>
                <Link
                  href={`/admin/${tenant.slug}/pages`}
                  className="block rounded-md px-2 py-1 pl-6 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  Pages
                </Link>
                <Link
                  href={`/admin/${tenant.slug}/branding`}
                  className="block rounded-md px-2 py-1 pl-6 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  Branding
                </Link>
                <Link
                  href={`/admin/${tenant.slug}/domains`}
                  className="block rounded-md px-2 py-1 pl-6 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  Domains
                </Link>
                <Link
                  href={`/admin/${tenant.slug}/team`}
                  className="block rounded-md px-2 py-1 pl-6 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  Team
                </Link>
                <Link
                  href={`/admin/${tenant.slug}/persona`}
                  className="block rounded-md px-2 py-1 pl-6 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  Bot Persona
                </Link>
                <Link
                  href={`/admin/${tenant.slug}/knowledge`}
                  className="block rounded-md px-2 py-1 pl-6 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  Knowledge
                </Link>
                <a
                  href={tenantSiteUrl(tenant.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-md px-2 py-1 pl-6 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  View website ↗
                </a>
              </div>
            );
          })}
        </nav>
        <div className="pt-4 mt-auto border-t border-neutral-200 dark:border-neutral-800">
          <a
            href={process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ?? "https://lume-jade-three.vercel.app"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            View live site
          </a>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
