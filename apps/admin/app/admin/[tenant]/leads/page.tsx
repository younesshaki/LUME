import { notFound } from "next/navigation";
import Link from "next/link";
import { Download, Inbox, Search } from "lucide-react";
import { rowToLead } from "@lume/db";
import type { LeadSource, LeadStatus } from "@lume/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadsTable, type LeadCard } from "./LeadsTable";

type PageProps = {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ q?: string; status?: string; source?: string; page?: string }>;
};

const PAGE_SIZE = 25;
const STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];
const SOURCES: LeadSource[] = ["chat", "contact-form", "test-drive", "csv-import", "api"];

export default async function LeadsPage({ params, searchParams }: PageProps) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = STATUSES.includes(sp.status as LeadStatus) ? (sp.status as LeadStatus) : null;
  const source = SOURCES.includes(sp.source as LeadSource) ? (sp.source as LeadSource) : null;
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
  if (status) query = query.eq("status", status);
  if (source) query = query.eq("source", source);

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1);

  if (error) throw new Error(`Unable to load leads: ${error.message}`);

  const cards: LeadCard[] = (data ?? []).map(rowToLead).map((lead) => ({
    id: lead.id,
    name: `${lead.firstName} ${lead.lastName}`.trim() || "Anonymous lead",
    email: lead.email,
    phone: lead.phone,
    message: lead.message,
    source: lead.source,
    status: lead.status,
    createdAt: lead.createdAt,
  }));
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const href = (overrides: Record<string, string | number | undefined>) => {
    const merged = { q, status: status ?? undefined, source: source ?? undefined, page, ...overrides };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", String(merged.q));
    if (merged.status) params.set("status", String(merged.status));
    if (merged.source) params.set("source", String(merged.source));
    if (merged.page && Number(merged.page) > 1) params.set("page", String(merged.page));
    const qs = params.toString();
    return `/admin/${slug}/leads${qs ? `?${qs}` : ""}`;
  };

  const hasFilters = Boolean(q || status || source);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description={`${totalCount.toLocaleString()} lead${totalCount === 1 ? "" : "s"} for ${tenant.name}${hasFilters ? " (filtered)" : ""}`}
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
          {status && <input type="hidden" name="status" value={status} />}
          {source && <input type="hidden" name="source" value={source} />}
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

      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip label="All statuses" href={href({ status: undefined, page: 1 })} active={!status} />
        {STATUSES.map((s) => (
          <FilterChip
            key={s}
            label={s}
            href={href({ status: s, page: 1 })}
            active={status === s}
          />
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <FilterChip label="All sources" href={href({ source: undefined, page: 1 })} active={!source} />
        {SOURCES.map((s) => (
          <FilterChip
            key={s}
            label={s}
            href={href({ source: s, page: 1 })}
            active={source === s}
          />
        ))}
      </div>

      {totalCount === 0 && !hasFilters ? (
        <EmptyState
          icon={Inbox}
          title="No leads yet"
          description="Leads captured by your website's contact forms and AI concierge will appear here, ready to work."
        />
      ) : (
        <LeadsTable slug={slug} leads={cards} />
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

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={
        "rounded-full border px-2.5 py-1 text-xs capitalize transition-colors " +
        (active
          ? "border-primary bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted")
      }
    >
      {label}
    </Link>
  );
}
