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
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
