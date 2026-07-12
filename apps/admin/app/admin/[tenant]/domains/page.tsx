import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCustomDomainLimit } from "@lume/db";
import {
  rowToTenantDomain,
} from "@/lib/domains";
import DomainsClient from "./DomainsClient";

type PageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function DomainsPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const [domainsResult, subscriptionResult] = await Promise.all([
    supabase
      .from("tenant_domains")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("subscriptions")
      .select("status, plan_id")
      .eq("tenant_id", tenant.id)
      .in("status", ["trialing", "active", "past_due", "incomplete"])
      .limit(1)
      .maybeSingle(),
  ]);

  if (domainsResult.error || subscriptionResult.error) {
    throw new Error(`Unable to load domains: ${domainsResult.error?.message ?? subscriptionResult.error?.message}`);
  }
  const subscription = subscriptionResult.data;
  const planResult = subscription
    ? await supabase.from("plans").select("name, limits").eq("id", subscription.plan_id).maybeSingle()
    : { data: null, error: null };
  if (planResult.error) throw new Error(`Unable to load domain allowance: ${planResult.error.message}`);
  const customDomainLimit = resolveCustomDomainLimit({
    subscriptionStatus: subscription?.status ?? null,
    planName: planResult.data?.name ?? null,
    limits: planResult.data?.limits ?? null,
  });

  return (
    <DomainsClient
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      customDomainLimit={customDomainLimit}
      initialDomains={(domainsResult.data ?? []).map(rowToTenantDomain)}
    />
  );
}
