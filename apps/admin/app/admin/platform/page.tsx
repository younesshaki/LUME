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
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { createServiceClient } from "@lume/db/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ q?: string; sort?: string; dir?: string; page?: string }>;
};

const PAGE_SIZE = 25;

const SORTABLE: Record<string, string> = {
  name: "name",
  slug: "slug",
  status: "status",
  created: "created_at",
};

export default async function PlatformPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const sort = SORTABLE[sp.sort ?? ""] ? sp.sort! : "created";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);

  const supabase = await createSupabaseServerClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) notFound();

  let query = supabase
    .from("tenants")
    .select("id, slug, name, status, created_at", { count: "exact" });

  if (q) {
    const term = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    query = query.or(`name.ilike.${term},slug.ilike.${term}`);
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data: tenants, count, error } = await query
    .order(SORTABLE[sort], { ascending: dir === "asc" })
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(`Unable to load tenants: ${error.message}`);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageTenantIds = (tenants ?? []).map((tenant) => tenant.id);

  // Members only for the tenants on this page.
  const { data: members } = pageTenantIds.length
    ? await supabase
        .from("tenant_members")
        .select("tenant_id, user_id, role")
        .in("tenant_id", pageTenantIds)
    : { data: [] };

  // Owner emails come from auth.users — service client, trusted server-only
  // page, gated by the is_platform_admin check above.
  const ownerIds = new Set(
    (members ?? []).filter((m) => m.role === "owner").map((m) => m.user_id)
  );
  const emailsById = new Map<string, string>();
  if (ownerIds.size > 0) {
    const service = createServiceClient();
    let userPage = 1;
    // listUsers pages at 200; fine for the current scale, revisit at ~1k users.
    for (;;) {
      const { data, error } = await service.auth.admin.listUsers({
        page: userPage,
        perPage: 200,
      });
      if (error) break;
      for (const user of data.users) {
        if (user.email) emailsById.set(user.id, user.email);
      }
      if (data.users.length < 200) break;
      userPage++;
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

  const href = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { q, sort, dir, page, ...overrides };
    if (merged.q) params.set("q", String(merged.q));
    if (merged.sort && merged.sort !== "created") params.set("sort", String(merged.sort));
    if (merged.dir && merged.dir !== "desc") params.set("dir", String(merged.dir));
    if (merged.page && Number(merged.page) > 1) params.set("page", String(merged.page));
    const qs = params.toString();
    return `/admin/platform${qs ? `?${qs}` : ""}`;
  };

  const sortHref = (column: string) =>
    href({ sort: column, dir: sort === column && dir === "desc" ? "asc" : "desc", page: 1 });

  const SortIcon = ({ column }: { column: string }) =>
    sort !== column ? (
      <ArrowUpDown className="size-3.5 text-muted-foreground/50" />
    ) : dir === "asc" ? (
      <ArrowUp className="size-3.5 text-primary" />
    ) : (
      <ArrowDown className="size-3.5 text-primary" />
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform"
        description={`${totalCount.toLocaleString()} tenant${totalCount === 1 ? "" : "s"} on the platform${q ? ` matching “${q}”` : ""}. Entering a tenant gives you full owner-level access to its admin.`}
      />

      <form method="get" className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search name or slug…"
          className="pl-8"
        />
        {sort !== "created" && <input type="hidden" name="sort" value={sort} />}
        {dir !== "desc" && <input type="hidden" name="dir" value={dir} />}
      </form>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Link href={sortHref("name")} className="inline-flex items-center gap-1 hover:text-foreground">
                  Tenant
                  <SortIcon column="name" />
                </Link>
              </TableHead>
              <TableHead>
                <Link href={sortHref("slug")} className="inline-flex items-center gap-1 hover:text-foreground">
                  Slug
                  <SortIcon column="slug" />
                </Link>
              </TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>
                <Link href={sortHref("status")} className="inline-flex items-center gap-1 hover:text-foreground">
                  Status
                  <SortIcon column="status" />
                </Link>
              </TableHead>
              <TableHead className="text-right">Members</TableHead>
              <TableHead>
                <Link href={sortHref("created")} className="inline-flex items-center gap-1 hover:text-foreground">
                  Created
                  <SortIcon column="created" />
                </Link>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {q ? (
                    <>
                      No tenants match “{q}”.{" "}
                      <Link href={href({ q: undefined, page: 1 })} className="underline underline-offset-2">
                        Clear search
                      </Link>
                    </>
                  ) : (
                    "No tenants yet."
                  )}
                </TableCell>
              </TableRow>
            )}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {totalCount.toLocaleString()} tenants
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild disabled={page <= 1}>
              <Link href={href({ page: page - 1 })} aria-disabled={page <= 1}>
                Previous
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild disabled={page >= totalPages}>
              <Link href={href({ page: page + 1 })} aria-disabled={page >= totalPages}>
                Next
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
