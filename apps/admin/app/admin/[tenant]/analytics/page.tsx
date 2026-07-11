import Link from "next/link";
import { notFound } from "next/navigation";
import type { LeadStatus } from "@lume/types";
import { countByValue, leadsPerDay, priceHistogram } from "@/lib/analytics";
import {
  mergeLeadLostReasons,
  summarizeLeadLostReasons,
} from "@/lib/leadLostReasons";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  InventoryByBodyStyleChart,
  InventoryByMakeChart,
  LeadsOverTimeChart,
  PriceDistributionChart,
} from "./AnalyticsCharts";

type PageProps = {
  params: Promise<{ tenant: string }>;
};

const LEADS_WINDOW_DAYS = 30;
const VEHICLE_PAGE = 1000;
const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Page through the tenant's vehicles; only the three columns the charts need. */
async function fetchVehicleFacts(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string
) {
  const facts: Array<{ make: string | null; body_style: string | null; price: number | null }> = [];
  for (let from = 0; ; from += VEHICLE_PAGE) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("make, body_style, price")
      .eq("tenant_id", tenantId)
      .range(from, from + VEHICLE_PAGE - 1);
    if (error) throw new Error(`Unable to load vehicle facts: ${error.message}`);
    facts.push(...(data ?? []));
    if (!data || data.length < VEHICLE_PAGE) break;
  }
  return facts;
}

type LeadSummaryRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  created_at: string;
};

const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];

export default async function AnalyticsPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const windowStart = new Date(
    Date.now() - LEADS_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    vehiclesResult,
    leadsResult,
    windowLeadsResult,
    recentLeadsResult,
    priceHistoryResult,
    soldVehiclesResult,
    vehicleFacts,
    lostReasonOptionsResult,
  ] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id),
    supabase
      .from("leads")
      .select("status, lost_reason, source")
      .eq("tenant_id", tenant.id),
    supabase
      .from("leads")
      .select("created_at")
      .eq("tenant_id", tenant.id)
      .gte("created_at", windowStart),
    supabase
      .from("leads")
      .select("id, first_name, last_name, email, phone, status, created_at")
      .eq("tenant_id", tenant.id)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("price_history")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id),
    supabase
      .from("vehicles")
      .select("sold_price")
      .eq("tenant_id", tenant.id)
      .not("sold_at", "is", null),
    fetchVehicleFacts(supabase, tenant.id),
    supabase
      .from("lead_lost_reason_options")
      .select("key, label, sort_order, is_active")
      .eq("tenant_id", tenant.id),
  ]);

  if (vehiclesResult.error) throw new Error(`Unable to load vehicles count: ${vehiclesResult.error.message}`);
  if (leadsResult.error) throw new Error(`Unable to load lead status counts: ${leadsResult.error.message}`);
  if (windowLeadsResult.error) throw new Error(`Unable to load lead history: ${windowLeadsResult.error.message}`);
  if (recentLeadsResult.error) throw new Error(`Unable to load recent leads: ${recentLeadsResult.error.message}`);
  if (priceHistoryResult.error) throw new Error(`Unable to load price history count: ${priceHistoryResult.error.message}`);
  if (soldVehiclesResult.error) throw new Error(`Unable to load sold vehicle facts: ${soldVehiclesResult.error.message}`);

  const leadsByStatus = countLeadStatuses(
    ((leadsResult.data ?? []) as Array<{ status: LeadStatus }>).map((row) => row.status)
  );
  const lostReasonTaxonomy = mergeLeadLostReasons(
    (lostReasonOptionsResult.data ?? []).map((row) => ({
      key: row.key,
      label: row.label,
      sortOrder: row.sort_order,
      isActive: row.is_active,
    }))
  );
  const lostReasonSummary = summarizeLeadLostReasons(
    (leadsResult.data ?? [])
      .filter((row) => row.status === "lost")
      .map((row) => row.lost_reason),
    lostReasonTaxonomy,
  );
  const lostLeadCount = lostReasonSummary.reduce((sum, reason) => sum + reason.count, 0);
  const leadsBySource = countByValue(
    (leadsResult.data ?? []).map((row) => row.source),
    8,
  );
  const recentLeads = (recentLeadsResult.data ?? []) as LeadSummaryRow[];
  const soldVehicleRevenue = (soldVehiclesResult.data ?? []).reduce(
    (total, vehicle) => total + (vehicle.sold_price ?? 0),
    0,
  );

  const leadsSeries = leadsPerDay(
    (windowLeadsResult.data ?? []).map((row) => row.created_at),
    LEADS_WINDOW_DAYS
  );
  const byMake = countByValue(vehicleFacts.map((v) => v.make), 8);
  const byBodyStyle = countByValue(vehicleFacts.map((v) => v.body_style), 8);
  const priceBuckets = priceHistogram(
    vehicleFacts.map((v) => v.price).filter((price): price is number => price !== null)
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tenant-scoped operating signals for {tenant.name}.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Vehicles" value={vehiclesResult.count ?? 0} />
        <MetricCard label="Recent leads" value={recentLeads.length} helper="Last 7 days" />
        <MetricCard label="Price changes" value={priceHistoryResult.count ?? 0} />
        <MetricCard
          label="Sold vehicles"
          value={soldVehiclesResult.data?.length ?? 0}
          helper={`${formatCurrency(soldVehicleRevenue)} recorded value`}
        />
      </section>

      <LeadsOverTimeChart data={leadsSeries} />

      <section className="grid gap-6 lg:grid-cols-2">
        <InventoryByMakeChart data={byMake} />
        <InventoryByBodyStyleChart data={byBodyStyle} />
      </section>

      <PriceDistributionChart data={priceBuckets} />

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Leads by Status</h2>
          <div className="mt-4 space-y-3">
            {LEAD_STATUSES.map((status) => (
              <div key={status}>
                <div className="flex items-center justify-between text-sm">
                  <span className="capitalize text-neutral-600 dark:text-neutral-300">{status}</span>
                  <span className="font-medium">{leadsByStatus[status]}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900">
                  <div
                    className="h-full rounded-full bg-neutral-900 dark:bg-neutral-100"
                    style={{ width: `${statusPercent(leadsByStatus[status], leadsResult.data?.length ?? 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Lost Leads by Reason</h2>
          {lostReasonSummary.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No lost leads have been recorded.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {lostReasonSummary.map((reason) => (
                <div key={reason.key}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-neutral-600 dark:text-neutral-300">
                      {reason.label}{reason.isLegacy ? " (historical)" : ""}
                    </span>
                    <span className="font-medium">{reason.count}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{ width: `${statusPercent(reason.count, lostLeadCount)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Leads by Source</h2>
          {leadsBySource.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No lead sources recorded.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {leadsBySource.map((source) => (
                <div key={source.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-neutral-600 dark:text-neutral-300">{source.name}</span>
                  <span className="font-medium">{source.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="overflow-hidden rounded-xl border">
          <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Recent Leads</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Lead</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Contact</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody>
              {recentLeads.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                    No leads in the last 7 days.
                  </td>
                </tr>
              )}
              {recentLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b last:border-0"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/${tenant.slug}/leads/${lead.id}`}
                      className="font-medium hover:underline"
                    >
                      {leadName(lead)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {lead.email || lead.phone || "N/A"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(lead.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value.toLocaleString()}</p>
      {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}

function countLeadStatuses(statuses: LeadStatus[]): Record<LeadStatus, number> {
  const counts: Record<LeadStatus, number> = {
    new: 0,
    contacted: 0,
    qualified: 0,
    won: 0,
    lost: 0,
  };
  for (const status of statuses) counts[status] += 1;
  return counts;
}

function statusPercent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

function leadName(lead: LeadSummaryRow): string {
  const name = `${lead.first_name} ${lead.last_name}`.trim();
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

function formatCurrency(value: number): string {
  return CURRENCY_FORMATTER.format(value);
}
