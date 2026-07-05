/**
 * Platform overview — visible ONLY to platform_admins (migration 024).
 *
 * Thanks to the extended tenant-scope functions, a platform admin's normal
 * RLS-backed client already sees every tenant; the service client is used
 * solely to resolve owner emails from auth.users. "Enter" simply navigates
 * into the tenant's admin — platform admins pass every membership check.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@lume/db/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const supabase = await createSupabaseServerClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) notFound();

  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, slug, name, status, created_at")
    .order("created_at", { ascending: false });

  const { data: members } = await supabase
    .from("tenant_members")
    .select("tenant_id, user_id, role");

  // Owner emails come from auth.users — service client, trusted server-only
  // page, gated by the is_platform_admin check above.
  const ownerIds = new Set(
    (members ?? []).filter((m) => m.role === "owner").map((m) => m.user_id)
  );
  const emailsById = new Map<string, string>();
  if (ownerIds.size > 0) {
    const service = createServiceClient();
    let page = 1;
    // listUsers pages at 200; fine for the current scale, revisit at ~1k users.
    for (;;) {
      const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      for (const user of data.users) {
        if (user.email) emailsById.set(user.id, user.email);
      }
      if (data.users.length < 200) break;
      page++;
    }
  }

  const rows = (tenants ?? []).map((tenant) => {
    const tenantMembers = (members ?? []).filter((m) => m.tenant_id === tenant.id);
    const owner = tenantMembers.find((m) => m.role === "owner");
    return {
      ...tenant,
      memberCount: tenantMembers.length,
      ownerEmail: owner ? emailsById.get(owner.user_id) ?? "—" : "—",
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Platform</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {rows.length} tenant{rows.length === 1 ? "" : "s"} on the platform.
          Entering a tenant gives you full owner-level access to its admin.
        </p>
      </header>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
              <th className="text-left px-4 py-3 font-medium text-neutral-500">Tenant</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-500">Slug</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-500">Owner</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-500">Status</th>
              <th className="text-right px-4 py-3 font-medium text-neutral-500">Members</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-500">Created</th>
              <th className="text-right px-4 py-3 font-medium text-neutral-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tenant) => (
              <tr
                key={tenant.id}
                className="border-b border-neutral-100 last:border-0 dark:border-neutral-800"
              >
                <td className="px-4 py-3 font-medium">{tenant.name}</td>
                <td className="px-4 py-3 text-neutral-500 font-mono text-xs">{tenant.slug}</td>
                <td className="px-4 py-3 text-neutral-500">{tenant.ownerEmail}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    {tenant.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{tenant.memberCount}</td>
                <td className="px-4 py-3 text-neutral-500">
                  {new Date(tenant.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/${tenant.slug}`}
                    className="rounded-md bg-neutral-900 text-white px-3 py-1.5 text-xs font-medium hover:bg-neutral-700 transition-colors"
                  >
                    Enter →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
