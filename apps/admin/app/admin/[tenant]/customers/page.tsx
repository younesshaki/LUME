import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Search, UsersRound } from "lucide-react";
import { createServiceClient } from "@lume/db/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
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
  searchParams: Promise<{ q?: string; page?: string }>;
};

type VisitorRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
  updated_at: string;
};

type LoyaltyRow = {
  id: string;
  visitor_id: string | null;
  email: string | null;
  points_balance: number;
  tier: string;
  updated_at: string;
};

type CustomerRow = {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  pointsBalance: number | null;
  tier: string | null;
  linkedLeads: number;
  chatSessions: number;
  lastActivityAt: string;
};

const PAGE_SIZE = 25;
const SEARCH_MAX_LENGTH = 80;

export default async function CustomersPage({ params, searchParams }: PageProps) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const query = normalizeSearch(sp.q ?? "");
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/admin/${slug}/customers`)}`);

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const [{ data: membership }, { data: isPlatformAdmin }] = await Promise.all([
    supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.rpc("is_platform_admin"),
  ]);
  if (!membership && !isPlatformAdmin) notFound();

  // Visitors are deliberately deny-all under RLS because the table also stores
  // password hashes. Use the server-only service client only after the explicit
  // tenant membership check above, and select safe profile fields by name.
  const service = createServiceClient();
  const from = (page - 1) * PAGE_SIZE;
  let visitorsQuery = service
    .from("visitors")
    .select("id, first_name, last_name, email, created_at, updated_at", {
      count: "exact",
    })
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  if (query) {
    // Escape LIKE wildcards so a user-typed % or _ matches literally rather
    // than acting as a pattern operator.
    const escaped = query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const pattern = `%${escaped}%`;
    visitorsQuery = visitorsQuery.or(
      `email.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`,
    );
  }

  const href = (targetPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (targetPage > 1) params.set("page", String(targetPage));
    const suffix = params.toString();
    return `/admin/${slug}/customers${suffix ? `?${suffix}` : ""}`;
  };

  const { data, count, error } = await visitorsQuery.range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(`Unable to load customers: ${error.message}`);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  // A page past the end (e.g. deep-linked, or a search that narrowed results)
  // otherwise renders an empty table under a valid-looking page number — send
  // the visitor to the last real page instead.
  if (page > totalPages) redirect(href(totalPages));
  const currentPage = page;

  const visitors = (data ?? []) as VisitorRow[];
  const customerRows = await enrichCustomers(service, tenant.id, visitors);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description={`${totalCount.toLocaleString()} registered website account${totalCount === 1 ? "" : "s"} for ${tenant.name}`}
      />

      <form className="flex max-w-xl gap-2" action={`/admin/${slug}/customers`} method="get">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={query}
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Search by name or email"
            className="pl-9"
          />
        </div>
        <Button type="submit">Search</Button>
        {query && (
          <Button variant="outline" asChild>
            <Link href={`/admin/${slug}/customers`}>Clear</Link>
          </Button>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Loyalty</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Chats</TableHead>
              <TableHead>Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customerRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <UsersRound className="size-5" />
                    <span>{query ? "No customers match this search." : "No registered customers yet."}</span>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {customerRows.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>
                  <p className="font-medium">{customer.name}</p>
                  <p className="text-sm text-muted-foreground">{customer.email}</p>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(customer.joinedAt)}
                </TableCell>
                <TableCell>
                  {customer.tier ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {customer.tier}
                      </Badge>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {(customer.pointsBalance ?? 0).toLocaleString()} pts
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Not enrolled</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{customer.linkedLeads}</TableCell>
                <TableCell className="text-right tabular-nums">{customer.chatSessions}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(customer.lastActivityAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {currentPage.toLocaleString()} of {totalPages.toLocaleString()}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild={currentPage > 1} disabled={currentPage <= 1}>
              {currentPage > 1 ? <Link href={href(currentPage - 1)}>Previous</Link> : <span>Previous</span>}
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild={currentPage < totalPages}
              disabled={currentPage >= totalPages}
            >
              {currentPage < totalPages ? <Link href={href(currentPage + 1)}>Next</Link> : <span>Next</span>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

async function enrichCustomers(
  service: ReturnType<typeof createServiceClient>,
  tenantId: string,
  visitors: VisitorRow[],
): Promise<CustomerRow[]> {
  if (visitors.length === 0) return [];

  const visitorIds = visitors.map((visitor) => visitor.id);
  // Match email-only loyalty accounts case-insensitively: `.in` is exact, so
  // send both the stored and lowercased forms (the JS lookup keys on lowercase).
  const emails = Array.from(
    new Set(visitors.flatMap((visitor) => [visitor.email, visitor.email.toLowerCase()])),
  );
  const [linkedLoyalty, emailLoyalty, leads, chats] = await Promise.all([
    service
      .from("loyalty_accounts")
      .select("id, visitor_id, email, points_balance, tier, updated_at")
      .eq("tenant_id", tenantId)
      .in("visitor_id", visitorIds),
    service
      .from("loyalty_accounts")
      .select("id, visitor_id, email, points_balance, tier, updated_at")
      .eq("tenant_id", tenantId)
      .is("visitor_id", null)
      .in("email", emails),
    service
      .from("leads")
      .select("visitor_id, created_at")
      .eq("tenant_id", tenantId)
      .in("visitor_id", visitorIds),
    service
      .from("chat_sessions")
      .select("visitor_id, updated_at")
      .eq("tenant_id", tenantId)
      .in("visitor_id", visitorIds),
  ]);

  if (linkedLoyalty.error) throw new Error(`Unable to load customer loyalty: ${linkedLoyalty.error.message}`);
  if (emailLoyalty.error) throw new Error(`Unable to load customer loyalty: ${emailLoyalty.error.message}`);
  if (leads.error) throw new Error(`Unable to load customer leads: ${leads.error.message}`);
  if (chats.error) throw new Error(`Unable to load customer chats: ${chats.error.message}`);

  const loyaltyByVisitor = new Map<string, LoyaltyRow>();
  for (const row of (linkedLoyalty.data ?? []) as LoyaltyRow[]) {
    if (!row.visitor_id) continue;
    const current = loyaltyByVisitor.get(row.visitor_id);
    if (!current || current.updated_at < row.updated_at) loyaltyByVisitor.set(row.visitor_id, row);
  }

  const loyaltyByEmail = new Map<string, LoyaltyRow>();
  for (const row of (emailLoyalty.data ?? []) as LoyaltyRow[]) {
    if (!row.email) continue;
    const key = row.email.toLowerCase();
    const current = loyaltyByEmail.get(key);
    if (!current || current.updated_at < row.updated_at) loyaltyByEmail.set(key, row);
  }

  const leadCounts = new Map<string, number>();
  const latestLead = new Map<string, string>();
  for (const lead of leads.data ?? []) {
    if (!lead.visitor_id) continue;
    leadCounts.set(lead.visitor_id, (leadCounts.get(lead.visitor_id) ?? 0) + 1);
    latestLead.set(lead.visitor_id, latestTimestamp(latestLead.get(lead.visitor_id), lead.created_at));
  }

  const chatCounts = new Map<string, number>();
  const latestChat = new Map<string, string>();
  for (const chat of chats.data ?? []) {
    if (!chat.visitor_id) continue;
    chatCounts.set(chat.visitor_id, (chatCounts.get(chat.visitor_id) ?? 0) + 1);
    latestChat.set(chat.visitor_id, latestTimestamp(latestChat.get(chat.visitor_id), chat.updated_at));
  }

  return visitors.map((visitor) => {
    const loyalty = loyaltyByVisitor.get(visitor.id) ?? loyaltyByEmail.get(visitor.email.toLowerCase());
    const lastActivityAt = [
      visitor.updated_at,
      loyalty?.updated_at,
      latestLead.get(visitor.id),
      latestChat.get(visitor.id),
    ].reduce<string>((latest, value) => latestTimestamp(latest, value), visitor.created_at);

    return {
      id: visitor.id,
      name: `${visitor.first_name} ${visitor.last_name}`.trim() || "Unnamed customer",
      email: visitor.email,
      joinedAt: visitor.created_at,
      pointsBalance: loyalty?.points_balance ?? null,
      tier: loyalty?.tier ?? null,
      linkedLeads: leadCounts.get(visitor.id) ?? 0,
      chatSessions: chatCounts.get(visitor.id) ?? 0,
      lastActivityAt,
    };
  });
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s@._+\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_MAX_LENGTH);
}

function latestTimestamp(current: string | undefined, candidate: string | undefined): string {
  if (!candidate) return current ?? new Date(0).toISOString();
  if (!current) return candidate;
  return Date.parse(candidate) > Date.parse(current) ? candidate : current;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMATTER.format(date);
}
