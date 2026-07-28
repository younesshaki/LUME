import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen, Car, FileText, Inbox } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { evaluateLaunchReadiness } from "@/lib/launchReadiness";
import { loadTenantLaunchSnapshot } from "@/lib/launchReadiness.server";
import type { OnboardingChecklistItem } from "@/lib/onboardingChecklist";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NumberTicker } from "@/components/ui/number-ticker";
import { OnboardingChecklist } from "./OnboardingChecklist";

type PageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function TenantOverviewPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name, status, theme")
    .eq("slug", slug)
    .maybeSingle();

  if (!tenant) notFound();

  // The launch snapshot is the shared source of truth for setup state —
  // the checklist below derives from it instead of ad-hoc queries. The
  // remaining queries feed only the stat cards (and the domain rule below).
  const snapshot = await loadTenantLaunchSnapshot(supabase, slug);
  if (!snapshot) notFound();

  const [
    { count: vehicleCount },
    { count: ragCount },
    { count: leadCount },
    { count: pageCount },
    { count: publishedPageCount },
  ] = await Promise.all([
    supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).neq("status", "archived"),
    supabase.from("rag_chunks").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    supabase.from("pages").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    // Any published, non-archived page satisfies the domain rule — the
    // snapshot only tracks the home page, so this query stays.
    supabase
      .from("pages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .not("published_revision_id", "is", null)
      .is("archived_at", null),
  ]);

  const stats = [
    { label: "Live vehicles", value: vehicleCount ?? 0, href: `/admin/${slug}/vehicles`, icon: Car },
    { label: "Leads", value: leadCount ?? 0, href: `/admin/${slug}/leads`, icon: Inbox },
    { label: "Pages", value: pageCount ?? 0, href: `/admin/${slug}/pages`, icon: FileText },
    { label: "Knowledge chunks", value: ragCount ?? 0, href: `/admin/${slug}/knowledge`, icon: BookOpen },
  ];
  const launchReport = evaluateLaunchReadiness(snapshot, "pilot", new Date().toISOString());
  const logoCheck = launchReport.checks.find((check) => check.id === "branding.logo");
  const setupItems: OnboardingChecklistItem[] = [
    {
      id: "logo",
      label: "Upload logo",
      complete: logoCheck?.status === "pass",
      href: `/admin/${slug}/branding`,
    },
    {
      id: "inventory",
      label: "Import first vehicles",
      complete: snapshot.vehicles.live > 0,
      href: `/admin/${slug}/vehicles`,
    },
    {
      id: "persona",
      label: "Configure bot persona",
      complete: snapshot.personaConfigured,
      href: `/admin/${slug}/persona`,
    },
    {
      id: "team",
      label: "Invite a team member",
      complete: snapshot.memberCount > 1 || snapshot.pendingInviteCount > 0,
      href: `/admin/${slug}/team`,
    },
    {
      id: "domain",
      label: "Connect domain or publish",
      complete:
        snapshot.verifiedDomainCount > 0 ||
        (tenant.status === "active" && (publishedPageCount ?? 0) > 0),
      href: `/admin/${slug}/domains`,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={tenant.name}
        description={
          <span className="flex items-center gap-2">
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{tenant.slug}</code>
            <StatusBadge status={tenant.status} />
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="group">
            <Card className="transition-colors group-hover:border-primary/50">
              <CardHeader>
                <CardDescription className="flex items-center gap-2">
                  <stat.icon className="size-4" />
                  {stat.label}
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  <span className="sr-only">{stat.value.toLocaleString()}</span>
                  <NumberTicker
                    value={stat.value}
                    aria-hidden="true"
                    className="tracking-tight text-foreground"
                  />
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <OnboardingChecklist tenantId={tenant.id} items={setupItems} />

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>Keep the site moving forward.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button variant="outline" className="justify-between" asChild>
              <Link href={`/admin/${slug}/vehicles/import`}>
                Import inventory
                <ArrowRight />
              </Link>
            </Button>
            <Button variant="outline" className="justify-between" asChild>
              <Link href={`/admin/${slug}/pages`}>
                Edit your pages
                <ArrowRight />
              </Link>
            </Button>
            <Button variant="outline" className="justify-between" asChild>
              <Link href={`/admin/${slug}/customers`}>
                View registered customers
                <ArrowRight />
              </Link>
            </Button>
            <Button variant="outline" className="justify-between" asChild>
              <Link href={`/admin/${slug}/persona`}>
                Tune your AI concierge
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
