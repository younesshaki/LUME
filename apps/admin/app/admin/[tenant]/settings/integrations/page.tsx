import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import IntegrationsClient, {
  type CrmWebhookRow,
  type WebhookDeliveryRow,
} from "./IntegrationsClient";

type PageProps = { params: Promise<{ tenant: string }> };

export default async function IntegrationsPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: tenant } = await supabase.from("tenants")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const [webhooksResult, deliveriesResult] = await Promise.all([
    supabase.from("tenant_webhooks")
      .select("id, name, endpoint_url, enabled, integration_kind, retry_delays_seconds, created_at")
      .eq("tenant_id", tenant.id)
      .contains("events", ["lead.created"])
      .order("created_at", { ascending: false }),
    supabase.from("webhook_deliveries")
      .select("id, webhook_id, status, attempt_count, response_status, last_error, created_at")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (webhooksResult.error || deliveriesResult.error) {
    throw new Error("Unable to load CRM integrations.");
  }

  const webhooks: CrmWebhookRow[] = (webhooksResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    endpointUrl: row.endpoint_url,
    enabled: row.enabled,
    integrationKind: row.integration_kind,
    retryDelaysSeconds: row.retry_delays_seconds,
    createdAt: row.created_at,
  }));
  const deliveries: WebhookDeliveryRow[] = (deliveriesResult.data ?? []).map((row) => ({
    id: row.id,
    webhookId: row.webhook_id,
    status: row.status,
    attemptCount: row.attempt_count,
    responseStatus: row.response_status,
    lastError: row.last_error,
    createdAt: row.created_at,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM integrations"
        description={`Forward new leads from ${tenant.name} to HubSpot, Pipedrive, or a custom HTTPS webhook.`}
      />
      <IntegrationsClient slug={slug} webhooks={webhooks} deliveries={deliveries} />
    </div>
  );
}
