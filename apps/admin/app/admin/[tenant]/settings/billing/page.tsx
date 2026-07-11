import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CalendarDays, CreditCard, FileDown, FileText } from "lucide-react";
import type { Database } from "@lume/db";
import {
  buildBillingUsageMeter,
  findPlanAllowance,
  formatBillingAmount,
  invoicePageCount,
  normalizeInvoicePage,
  planLimitEntries,
  selectPrimarySubscription,
  type BillingUsageMeter,
} from "@/lib/billing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlanChangeButton } from "./PlanChangeButton";

type PageProps = {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ page?: string }>;
};
type PlanRow = Database["public"]["Tables"]["plans"]["Row"];
type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];

const INVOICE_PAGE_SIZE = 10;

export default async function BillingPage({ params, searchParams }: PageProps) {
  const { tenant: slug } = await params;
  const invoicePage = normalizeInvoicePage((await searchParams).page);
  const invoiceFrom = (invoicePage - 1) * INVOICE_PAGE_SIZE;
  const supabase = await createSupabaseServerClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const [plansResult, subscriptionsResult, invoicesResult, canManageResult] = await Promise.all([
    supabase.from("plans").select("*").order("monthly_price_cents", { ascending: true }),
    supabase
      .from("subscriptions")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .range(invoiceFrom, invoiceFrom + INVOICE_PAGE_SIZE - 1),
    supabase.rpc("user_has_tenant_role", {
      p_tenant_id: tenant.id,
      p_roles: ["owner", "admin"],
    }),
  ]);

  const plans = (plansResult.data ?? []) as PlanRow[];
  const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionRow[];
  const invoices = (invoicesResult.data ?? []) as InvoiceRow[];
  const primary = selectPrimarySubscription(subscriptions.map((subscription) => ({
    id: subscription.id,
    status: subscription.status,
    planId: subscription.plan_id,
    currentPeriodEnd: subscription.current_period_end,
    createdAt: subscription.created_at,
  })));
  const currentPlan = primary
    ? plans.find((plan) => plan.id === primary.planId) ?? null
    : null;
  const currentSubscription = primary
    ? subscriptions.find((subscription) => subscription.id === primary.id) ?? null
    : null;
  const currentPlanLimits = currentPlan ? planLimitEntries(currentPlan.limits) : [];
  let leadUsageQuery = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id);
  if (currentSubscription?.current_period_start) {
    leadUsageQuery = leadUsageQuery.gte("created_at", currentSubscription.current_period_start);
  }
  if (currentSubscription?.current_period_end) {
    leadUsageQuery = leadUsageQuery.lt("created_at", currentSubscription.current_period_end);
  }
  const leadUsageResult = await leadUsageQuery;
  const limits = currentPlan?.limits ?? {};
  const usageMeters = [
    {
      label: "Chat requests",
      detail: "Current billing period",
      meter: buildBillingUsageMeter(null, findPlanAllowance(limits, [
        "chat_requests",
        "monthly_chat_requests",
        "chat_requests_per_month",
      ])),
    },
    {
      label: "Leads",
      detail: currentSubscription?.current_period_start ? "Current billing period" : "All time",
      meter: buildBillingUsageMeter(
        leadUsageResult.error ? null : (leadUsageResult.count ?? 0),
        findPlanAllowance(limits, ["leads", "monthly_leads", "leads_per_month"]),
      ),
    },
    {
      label: "Storage",
      detail: "Tenant media",
      meter: buildBillingUsageMeter(null, findPlanAllowance(limits, [
        "storage_bytes",
        "storage",
        "storage_limit_bytes",
      ])),
    },
  ];
  const invoiceCount = invoicesResult.count ?? 0;
  const totalInvoicePages = invoicePageCount(invoiceCount, INVOICE_PAGE_SIZE);
  if (invoicePage > totalInvoicePages) {
    redirect(billingPageHref(slug, totalInvoicePages));
  }
  const canManagePlans = canManageResult.data === true;
  const providerManaged = Boolean(currentSubscription?.stripe_subscription_id);
  const unavailable = Boolean(
    plansResult.error || subscriptionsResult.error || invoicesResult.error || canManageResult.error
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description={`Plan, subscription, and invoice details for ${tenant.name}`}
      />

      {unavailable ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200" role="status">
          Billing data is not available yet. Existing site features are unaffected.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <CreditCard className="size-4" /> Current plan
            </CardDescription>
            <CardTitle className="flex flex-wrap items-center gap-2 text-2xl">
              {currentPlan?.name ?? "No active subscription"}
              {currentSubscription ? (
                <Badge variant="outline" className="capitalize">{currentSubscription.status}</Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentPlan ? (
              <p className="text-3xl font-semibold tabular-nums">
                {formatBillingAmount(currentPlan.monthly_price_cents)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">/ month</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                A plan will appear here once the tenant subscription is provisioned.
              </p>
            )}
            {currentSubscription?.current_period_end ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="size-4" />
                Current period ends {formatDate(currentSubscription.current_period_end)}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {providerManaged
                ? "This provider-managed subscription must be changed through billing support."
                : canManagePlans
                  ? "Owners and admins can switch manual plans below."
                  : "Only tenant owners and admins can change plans."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plan limits</CardTitle>
            <CardDescription>Limits synchronized from the billing catalog.</CardDescription>
          </CardHeader>
          <CardContent>
            {currentPlanLimits.length > 0 ? (
              <dl className="space-y-2">
                {currentPlanLimits.map((limit) => (
                  <div key={limit.key} className="flex items-center justify-between gap-3 text-sm">
                    <dt className="text-muted-foreground">{limit.label}</dt>
                    <dd className="font-medium tabular-nums">{limit.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No plan limits are configured.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Usage</h2>
          <p className="text-sm text-muted-foreground">
            Chat and storage metering will populate after SCRUM-103 usage tracking is provisioned.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {usageMeters.map((usage) => (
            <UsageMeterCard key={usage.label} {...usage} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Plan catalog</h2>
          <p className="text-sm text-muted-foreground">
            Manual plan changes never call an external billing provider.
          </p>
        </div>
        {plans.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No plans have been provisioned. Ask a platform administrator to configure the catalog.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <Card key={plan.id} className={plan.id === currentPlan?.id ? "border-primary/60" : undefined}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    {plan.name}
                    {plan.id === currentPlan?.id ? <Badge>Current</Badge> : null}
                  </CardTitle>
                  <CardDescription>
                    {formatBillingAmount(plan.monthly_price_cents)} per month
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {planLimitEntries(plan.limits).slice(0, 5).map((limit) => (
                      <li key={limit.key} className="flex justify-between gap-3">
                        <span>{limit.label}</span><span>{limit.value}</span>
                      </li>
                    ))}
                  </ul>
                  {plan.id !== currentPlan?.id && canManagePlans && !providerManaged ? (
                    <div className="mt-4">
                      <PlanChangeButton
                        slug={slug}
                        planId={plan.id}
                        planName={plan.name}
                        label={currentPlan
                          ? plan.monthly_price_cents > currentPlan.monthly_price_cents
                            ? "Upgrade"
                            : "Downgrade"
                          : "Choose plan"}
                      />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FileText className="size-4" /> Invoice history
          </h2>
          <p className="text-sm text-muted-foreground">
            Page {invoicePage} of {totalInvoicePages} · {invoiceCount.toLocaleString()} synchronized invoices.
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              ) : invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>{formatDate(invoice.created_at)}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{invoice.status}</Badge></TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatBillingAmount(invoice.amount_cents)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled
                      title="Stripe-hosted invoice PDFs are not synchronized yet"
                    >
                      <FileDown className="size-4" /> PDF unavailable
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {totalInvoicePages > 1 ? (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {invoicePage} of {totalInvoicePages}</span>
            <div className="flex gap-2">
              {invoicePage <= 1 ? (
                <Button variant="outline" size="sm" disabled>Previous</Button>
              ) : (
                <Button variant="outline" size="sm" asChild>
                  <Link href={billingPageHref(slug, invoicePage - 1)}>Previous</Link>
                </Button>
              )}
              {invoicePage >= totalInvoicePages ? (
                <Button variant="outline" size="sm" disabled>Next</Button>
              ) : (
                <Button variant="outline" size="sm" asChild>
                  <Link href={billingPageHref(slug, invoicePage + 1)}>Next</Link>
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function UsageMeterCard({
  label,
  detail,
  meter,
}: {
  label: string;
  detail: string;
  meter: BillingUsageMeter;
}) {
  const value = meter.used === null ? "Unavailable" : meter.used.toLocaleString();
  const allowance = meter.state === "unlimited"
    ? "Unlimited"
    : meter.allowance === null
      ? "Allowance not configured"
      : `of ${meter.allowance.toLocaleString()}`;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{detail}</CardDescription>
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-2xl font-semibold tabular-nums">
          {value} <span className="text-xs font-normal text-muted-foreground">{allowance}</span>
        </p>
        <Progress
          value={meter.percentage ?? 0}
          aria-label={meter.percentage === null
            ? `${label} usage unavailable`
            : `${label} usage is ${meter.percentage}% of allowance`}
        />
      </CardContent>
    </Card>
  );
}

function billingPageHref(slug: string, page: number): string {
  return page <= 1
    ? `/admin/${slug}/settings/billing`
    : `/admin/${slug}/settings/billing?page=${page}`;
}

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}
