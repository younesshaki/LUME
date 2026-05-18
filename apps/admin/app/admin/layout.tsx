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
  const { data: memberships } = await supabase
    .from("tenant_members")
    .select("tenant_id, role, tenants:tenant_id(id, slug, name, status)")
    .eq("user_id", user.id);

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 shrink-0 border-r border-neutral-200 dark:border-neutral-800 p-4 space-y-4">
        <div>
          <Link href="/admin" className="font-semibold text-base">LUME Admin</Link>
          <p className="text-xs text-neutral-500 mt-1 truncate">{user.email}</p>
        </div>
        <nav className="space-y-1 text-sm">
          <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
            Tenants
          </p>
          {memberships?.length === 0 && (
            <p className="text-xs text-neutral-500 italic">
              You don&apos;t belong to any tenant yet.
            </p>
          )}
          {memberships?.map((m) => {
            const tenant = Array.isArray(m.tenants) ? m.tenants[0] : m.tenants;
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
