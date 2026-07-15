import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, Coins, Users2 } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { TierManager, type TierRow } from "./TierManager";

type PageProps = { params: Promise<{ tenant: string }> };

const ACCOUNT_PAGE = 1000;
const RECENT_TX = 10;

export default async function LoyaltyPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  // Accounts (paged) → totals + per-tier distribution.
  const accounts: Array<{ points_balance: number; tier: string }> = [];
  for (let from = 0; ; from += ACCOUNT_PAGE) {
    const { data, error } = await supabase
      .from("loyalty_accounts")
      .select("points_balance, tier")
      .eq("tenant_id", tenant.id)
      .range(from, from + ACCOUNT_PAGE - 1);
    if (error) throw new Error(`Unable to load loyalty accounts: ${error.message}`);
    accounts.push(...(data ?? []));
    if (!data || data.length < ACCOUNT_PAGE) break;
  }

  const [{ data: tierRows }, { data: recent }] = await Promise.all([
    supabase
      .from("loyalty_tiers")
      .select("id, name, threshold")
      .eq("tenant_id", tenant.id)
      .order("threshold", { ascending: true }),
    supabase
      .from("loyalty_transactions")
      .select("id, points_delta, description, occurred_at")
      .eq("tenant_id", tenant.id)
      .order("occurred_at", { ascending: false })
      .limit(RECENT_TX),
  ]);

  const totalAccounts = accounts.length;
  const totalPoints = accounts.reduce((sum, a) => sum + a.points_balance, 0);
  const avgPoints = totalAccounts ? Math.round(totalPoints / totalAccounts) : 0;

  const byTier = new Map<string, number>();
  for (const a of accounts) byTier.set(a.tier, (byTier.get(a.tier) ?? 0) + 1);
  const tiers: TierRow[] = (tierRows ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    threshold: t.threshold,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loyalty"
        description={`Points, tiers, and recent activity for ${tenant.name}`}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/admin/${slug}/customers`}>Registered customers</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={Users2} label="Members" value={totalAccounts.toLocaleString()} />
        <Stat icon={Coins} label="Points outstanding" value={totalPoints.toLocaleString()} />
        <Stat icon={Award} label="Avg. balance" value={avgPoints.toLocaleString()} />
      </div>

      <TierManager slug={slug} tiers={tiers} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-medium">Members by tier</h2>
          </div>
          <ul className="divide-y">
            {byTier.size === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                No loyalty members yet.
              </li>
            )}
            {[...byTier.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([tier, count]) => (
                <li key={tier} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="capitalize">{tier}</span>
                  <span className="text-muted-foreground">{count.toLocaleString()}</span>
                </li>
              ))}
          </ul>
        </div>

        <div className="rounded-xl border">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-medium">Recent activity</h2>
          </div>
          <ul className="divide-y">
            {(recent ?? []).length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                No transactions yet.
              </li>
            )}
            {(recent ?? []).map((tx) => (
              <li key={tx.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="truncate text-muted-foreground">
                  {tx.description ?? "Adjustment"}
                </span>
                <span
                  className={tx.points_delta >= 0 ? "text-emerald-600" : "text-destructive"}
                >
                  {tx.points_delta >= 0 ? "+" : ""}
                  {tx.points_delta.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
