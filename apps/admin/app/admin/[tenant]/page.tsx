import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen, Car, FileText, Inbox } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
                  {stat.value.toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link href={`/admin/${slug}/vehicles/import`}>
            Import inventory
            <ArrowRight />
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/admin/${slug}/pages`}>
            Edit your pages
            <ArrowRight />
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/admin/${slug}/persona`}>
            Tune your AI concierge
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}
