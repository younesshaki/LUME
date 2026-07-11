import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Inbox, Search } from "lucide-react";
import { rowToLead } from "@lume/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
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

type PageProps = {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ q?: string; sort?: string; dir?: string; page?: string }>;
};

const PAGE_SIZE = 25;

const SORTABLE: Record<string, string> = {
  created: "created_at",
  status: "status",
  source: "source",
};

export default async function LeadsPage({ params, searchParams }: PageProps) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const sort = SORTABLE[sp.sort ?? ""] ? sp.sort! : "created";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);

  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  let query = supabase
    .from("leads")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenant.id);

  if (q) {
    const term = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    query = query.or(
      `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`
    );
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order(SORTABLE[sort], { ascending: dir === "asc", nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    throw new Error(`Unable to load leads: ${error.message}`);
  }

  const leads = (data ?? []).map(rowToLead);
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const href = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { q, sort, dir, page, ...overrides };
    if (merged.q) params.set("q", String(merged.q));
    if (merged.sort && merged.sort !== "created") params.set("sort", String(merged.sort));
    if (merged.dir && merged.dir !== "desc") params.set("dir", String(merged.dir));
    if (merged.page && Number(merged.page) > 1) params.set("page", String(merged.page));
    const qs = params.toString();
    return `/admin/${slug}/leads${qs ? `?${qs}` : ""}`;
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
        title="Leads"
        description={`${totalCount.toLocaleString()} lead${totalCount === 1 ? "" : "s"} for ${tenant.name}${q ? ` matching “${q}”` : ""}`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <form method="get" className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name, email, phone…"
            className="pl-8"
          />
          {sort !== "created" && <input type="hidden" name="sort" value={sort} />}
          {dir !== "desc" && <input type="hidden" name="dir" value={dir} />}
        </form>
        {totalCount > 0 && (
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/api/leads/export?tenant=${encodeURIComponent(slug)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            >
              <Download className="size-4" />
              Export CSV
            </a>
          </Button>
        )}
      </div>

      {totalCount === 0 && !q ? (
        <EmptyState
          icon={Inbox}
          title="No leads yet"
          description="Leads captured by your website's contact forms and AI concierge will appear here, ready to work."
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>
                  <Link href={sortHref("source")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Source
                    <SortIcon column="source" />
                  </Link>
                </TableHead>
                <TableHead>
                  <Link href={sortHref("status")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Status
                    <SortIcon column="status" />
                  </Link>
                </TableHead>
                <TableHead>
                  <Link href={sortHref("created")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Created
                    <SortIcon column="created" />
                  </Link>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No leads match “{q}”.{" "}
                    <Link href={href({ q: undefined, page: 1 })} className="underline underline-offset-2">
                      Clear search
                    </Link>
                  </TableCell>
                </TableRow>
              )}
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <Link
                      href={`/admin/${tenant.slug}/leads/${lead.id}`}
                      className="font-medium hover:underline"
                    >
                      {leadName(lead.firstName, lead.lastName)}
                    </Link>
                    {lead.message && (
                      <p className="mt-1 max-w-md truncate text-xs text-muted-foreground">
                        {lead.message}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.email && <p>{lead.email}</p>}
                    {lead.phone && <p>{lead.phone}</p>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-muted-foreground">
                      {lead.source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={lead.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(lead.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {totalCount.toLocaleString()} leads
          </span>
          <div className="flex gap-2">
            {page <= 1 ? (
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <Link href={href({ page: page - 1 })}>Previous</Link>
              </Button>
            )}
            {page >= totalPages ? (
              <Button variant="outline" size="sm" disabled>
                Next
              </Button>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <Link href={href({ page: page + 1 })}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function leadName(firstName: string, lastName: string): string {
  const name = `${firstName} ${lastName}`.trim();
  return name || "Anonymous lead";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
