import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen, Car, CheckCircle2, Circle, FileText, Inbox, Rocket } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Progress } from "@/components/ui/progress";

type PageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function TenantOverviewPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name, status")
    .eq("slug", slug)
    .maybeSingle();

  if (!tenant) notFound();

  const [{ count: vehicleCount }, { count: ragCount }, { count: leadCount }, { count: pageCount }] =
    await Promise.all([
      supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
      supabase.from("rag_chunks").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
      supabase.from("pages").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    ]);

  const stats = [
    { label: "Vehicles", value: vehicleCount ?? 0, href: `/admin/${slug}/vehicles`, icon: Car },
    { label: "Leads", value: leadCount ?? 0, href: `/admin/${slug}/leads`, icon: Inbox },
    { label: "Pages", value: pageCount ?? 0, href: `/admin/${slug}/pages`, icon: FileText },
    { label: "Knowledge chunks", value: ragCount ?? 0, href: `/admin/${slug}/knowledge`, icon: BookOpen },
  ];
  const setupItems = [
    { label: "Add inventory", complete: (vehicleCount ?? 0) > 0, href: `/admin/${slug}/vehicles` },
    { label: "Create site pages", complete: (pageCount ?? 0) > 0, href: `/admin/${slug}/pages` },
    { label: "Build AI knowledge", complete: (ragCount ?? 0) > 0, href: `/admin/${slug}/knowledge` },
    { label: "Capture your first lead", complete: (leadCount ?? 0) > 0, href: `/admin/${slug}/leads` },
  ];
  const completedSetupItems = setupItems.filter((item) => item.complete).length;
  const setupProgress = Math.round((completedSetupItems / setupItems.length) * 100);

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
        <Card>
          <CardHeader className="gap-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="size-4 text-primary" />
                  Launch checklist
                </CardTitle>
                <CardDescription className="mt-1">
                  {completedSetupItems} of {setupItems.length} foundations are in place.
                </CardDescription>
              </div>
              <span className="text-sm font-semibold tabular-nums text-primary">{setupProgress}%</span>
            </div>
            <Progress value={setupProgress} aria-label={`${setupProgress}% of site setup complete`} />
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {setupItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                {item.complete ? (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
                <span className={item.complete ? "text-muted-foreground line-through" : "font-medium"}>
                  {item.label}
                </span>
                <ArrowRight className="ml-auto size-3.5 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>

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
