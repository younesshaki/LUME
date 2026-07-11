import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen, Car, FileText, Inbox } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isBotPersonaConfigured,
  tenantThemeHasLogo,
  type OnboardingChecklistItem,
} from "@/lib/onboardingChecklist";
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

  const [
    { count: vehicleCount },
    { count: ragCount },
    { count: leadCount },
    { count: pageCount },
    { count: publishedPageCount },
    personaResult,
    { count: memberCount },
    { count: inviteCount },
    { count: verifiedDomainCount },
    rootLogoResult,
    nestedLogoResult,
  ] = await Promise.all([
    supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    supabase.from("rag_chunks").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    supabase.from("pages").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    supabase
      .from("pages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .not("published_revision_id", "is", null)
      .is("archived_at", null),
    supabase
      .from("bot_personas")
      .select("name, tone, system_prompt, created_at, updated_at")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("tenant_members")
      .select("user_id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id),
    supabase
      .from("tenant_invites")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .in("status", ["pending", "accepted"]),
    supabase
      .from("tenant_domains")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("verified", true),
    supabase.storage.from("tenant-logos").list(tenant.id, { limit: 100 }),
    supabase.storage.from("tenant-logos").list(`${tenant.id}/logos`, { limit: 100 }),
  ]);

  const stats = [
    { label: "Vehicles", value: vehicleCount ?? 0, href: `/admin/${slug}/vehicles`, icon: Car },
    { label: "Leads", value: leadCount ?? 0, href: `/admin/${slug}/leads`, icon: Inbox },
    { label: "Pages", value: pageCount ?? 0, href: `/admin/${slug}/pages`, icon: FileText },
    { label: "Knowledge chunks", value: ragCount ?? 0, href: `/admin/${slug}/knowledge`, icon: BookOpen },
  ];
  const logoObjects = [...(rootLogoResult.data ?? []), ...(nestedLogoResult.data ?? [])];
  const hasLogo =
    tenantThemeHasLogo(tenant.theme) || logoObjects.some((object) => Boolean(object.id));
  const setupItems: OnboardingChecklistItem[] = [
    { id: "logo", label: "Upload logo", complete: hasLogo, href: `/admin/${slug}/branding` },
    {
      id: "inventory",
      label: "Import first vehicles",
      complete: (vehicleCount ?? 0) > 0,
      href: `/admin/${slug}/vehicles`,
    },
    {
      id: "persona",
      label: "Configure bot persona",
      complete: isBotPersonaConfigured(personaResult.data),
      href: `/admin/${slug}/persona`,
    },
    {
      id: "team",
      label: "Invite a team member",
      complete: (memberCount ?? 0) > 1 || (inviteCount ?? 0) > 0,
      href: `/admin/${slug}/team`,
    },
    {
      id: "domain",
      label: "Connect domain or publish",
      complete:
        (verifiedDomainCount ?? 0) > 0 ||
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
