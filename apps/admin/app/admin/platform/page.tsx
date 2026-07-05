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
import { ArrowRight } from "lucide-react";
import { createServiceClient } from "@lume/db/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
      <PageHeader
        title="Platform"
        description={`${rows.length} tenant${rows.length === 1 ? "" : "s"} on the platform. Entering a tenant gives you full owner-level access to its admin.`}
      />

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Members</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                      {tenant.name.charAt(0).toUpperCase()}
                    </span>
                    {tenant.name}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{tenant.slug}</TableCell>
                <TableCell className="text-muted-foreground">{tenant.ownerEmail}</TableCell>
                <TableCell>
                  <StatusBadge status={tenant.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{tenant.memberCount}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(tenant.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" asChild>
                    <Link href={`/admin/${tenant.slug}`}>
                      Enter
                      <ArrowRight />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
