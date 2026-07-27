import { notFound } from "next/navigation";
import { createServiceClient } from "@lume/db/server";
import { PageHeader } from "@/components/page-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createInventoryExportDestination,
  createManagedFeedSource,
  removeInventoryExportDestination,
  removeManagedFeedSource,
  runInventoryExportDestination,
  runManagedFeedSource,
  setInventoryExportDestinationEnabled,
  setManagedFeedSourceEnabled,
  updateInventoryExportDestination,
  updateManagedFeedSource,
} from "./actions";
import InventoryFeedsClient, {
  type InventoryExportDestinationRow,
  type InventoryFeedSourceRow,
  type InventoryIntegrationHealth,
  type InventoryIntegrationRunRow,
} from "./InventoryFeedsClient";

type PageProps = { params: Promise<{ tenant: string }> };

/**
 * The protected Admin surface for durable supplier syncs and outbound
 * syndication. Reads use the member's RLS-scoped client; only the opaque
 * credential-presence checks use the service client after an owner/admin role
 * check, and never select credential ciphertext.
 */
export default async function InventoryFeedsPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ data: tenant }, { data: userData }] = await Promise.all([
    supabase.from("tenants").select("id, name").eq("slug", slug).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (!tenant) notFound();

  const { data: canManageRole } = userData.user
    ? await supabase.rpc("user_has_tenant_role", {
      p_tenant_id: tenant.id,
      p_roles: ["owner", "admin"],
    })
    : { data: false };
  const canManage = canManageRole === true;

  const [sourcesResult, destinationsResult, feedRunsResult, exportRunsResult] = await Promise.all([
    supabase.from("inventory_feed_sources")
      .select("id, name, source_kind, source_url, source_object_path, sftp_host, sftp_port, sftp_remote_path, sftp_host_key_fingerprint, source_format, profile, sync_mode, enabled, schedule_minutes, last_attempt_at, last_succeeded_at, consecutive_failure_count, last_error, created_at")
      .eq("tenant_id", tenant.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("inventory_export_destinations")
      .select("id, name, endpoint_url, http_method, export_format, profile, enabled, schedule_minutes, last_attempt_at, last_succeeded_at, last_noop_at, consecutive_failure_count, last_error, created_at")
      .eq("tenant_id", tenant.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("inventory_feed_runs")
      .select("id, feed_source_id, status, attempt_count, total_rows, created_rows, updated_rows, skipped_rows, conflict_rows, failed_rows, errors, last_error, created_at, completed_at")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("inventory_export_runs")
      .select("id, export_destination_id, status, attempt_count, record_count, response_status, last_error, created_at, completed_at")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const readErrors = [sourcesResult.error, destinationsResult.error, feedRunsResult.error, exportRunsResult.error]
    .filter((error): error is NonNullable<typeof error> => Boolean(error));
  if (readErrors.some(isInventoryInfrastructureMigrationMissing)) {
    return <InventoryInfrastructureMigrationRequired tenantName={tenant.name} />;
  }
  if (readErrors.length > 0) {
    throw new Error("Unable to load managed inventory integrations.");
  }

  const [sourceCredentials, destinationCredentials] = canManage
    ? await Promise.all([
      createServiceClient().from("inventory_feed_source_credentials")
        .select("feed_source_id")
        .eq("tenant_id", tenant.id),
      createServiceClient().from("inventory_export_destination_credentials")
        .select("export_destination_id")
        .eq("tenant_id", tenant.id),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (sourceCredentials.error || destinationCredentials.error) {
    throw new Error("Unable to determine inventory integration credential status.");
  }

  const sourceCredentialIds = new Set((sourceCredentials.data ?? []).map((row) => row.feed_source_id));
  const destinationCredentialIds = new Set((destinationCredentials.data ?? []).map((row) => row.export_destination_id));
  const sources: InventoryFeedSourceRow[] = (sourcesResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    sourceKind: row.source_kind,
    endpointUrl: row.source_url ?? "",
    sourceObjectPath: row.source_object_path,
    sftpHost: row.sftp_host,
    sftpPort: row.sftp_port,
    sftpRemotePath: row.sftp_remote_path,
    sftpHostKeyFingerprint: row.sftp_host_key_fingerprint,
    format: row.source_format,
    mappingProfile: row.profile,
    mode: row.sync_mode,
    enabled: row.enabled,
    scheduleMinutes: row.schedule_minutes,
    authKind: sourceCredentialIds.has(row.id) ? "configured" : "none",
    credentialsConfigured: sourceCredentialIds.has(row.id),
    health: healthFrom(row),
    lastAttemptAt: row.last_attempt_at,
    lastSucceededAt: row.last_succeeded_at,
    lastError: row.last_error,
  }));
  const destinations: InventoryExportDestinationRow[] = (destinationsResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    endpointUrl: row.endpoint_url,
    httpMethod: row.http_method,
    format: row.export_format,
    mappingProfile: row.profile,
    enabled: row.enabled,
    scheduleMinutes: row.schedule_minutes,
    authKind: destinationCredentialIds.has(row.id) ? "configured" : "none",
    credentialsConfigured: destinationCredentialIds.has(row.id),
    health: healthFrom(row),
    lastAttemptAt: row.last_attempt_at,
    lastSucceededAt: row.last_succeeded_at,
    lastError: row.last_error,
    lastSemanticHashAt: row.last_noop_at,
  }));

  const sourceNames = new Map(sources.map((source) => [source.id, source.name]));
  const destinationNames = new Map(destinations.map((destination) => [destination.id, destination.name]));
  const runs: InventoryIntegrationRunRow[] = [
    ...(feedRunsResult.data ?? []).map((row): InventoryIntegrationRunRow => ({
      id: row.id,
      targetKind: "source",
      targetId: row.feed_source_id,
      targetName: sourceNames.get(row.feed_source_id) ?? "Removed inventory source",
      status: normalizeFeedRunStatus(row.status),
      attemptCount: row.attempt_count,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      totalRecords: row.total_rows,
      createdRecords: row.created_rows,
      updatedRecords: row.updated_rows,
      skippedRecords: row.skipped_rows + row.conflict_rows,
      failedRecords: row.failed_rows,
      responseStatus: null,
      lastError: row.last_error ?? firstDiagnosticMessage(row.errors),
    })),
    ...(exportRunsResult.data ?? []).map((row): InventoryIntegrationRunRow => ({
      id: row.id,
      targetKind: "export",
      targetId: row.export_destination_id,
      targetName: destinationNames.get(row.export_destination_id) ?? "Removed export destination",
      status: normalizeExportRunStatus(row.status),
      attemptCount: row.attempt_count,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      totalRecords: row.record_count,
      createdRecords: null,
      updatedRecords: null,
      skippedRecords: null,
      failedRecords: null,
      responseStatus: row.response_status,
      lastError: row.last_error,
    })),
  ].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory feeds & syndication"
        description={`Safely synchronize supplier inventory and publish approved feeds for ${tenant.name}.`}
      />
      <InventoryFeedsClient
        sources={sources}
        destinations={destinations}
        runs={runs}
        canManage={canManage}
        actions={{
          createSource: createManagedFeedSource.bind(null, slug),
          updateSource: updateManagedFeedSource.bind(null, slug),
          setSourceEnabled: setManagedFeedSourceEnabled.bind(null, slug),
          runSource: runManagedFeedSource.bind(null, slug),
          removeSource: removeManagedFeedSource.bind(null, slug),
          createDestination: createInventoryExportDestination.bind(null, slug),
          updateDestination: updateInventoryExportDestination.bind(null, slug),
          setDestinationEnabled: setInventoryExportDestinationEnabled.bind(null, slug),
          runDestination: runInventoryExportDestination.bind(null, slug),
          removeDestination: removeInventoryExportDestination.bind(null, slug),
        }}
      />
    </div>
  );
}

function healthFrom(value: {
  last_attempt_at: string | null;
  last_succeeded_at: string | null;
  consecutive_failure_count: number;
  last_error: string | null;
}): InventoryIntegrationHealth {
  if (!value.last_attempt_at) return "unknown";
  if (value.consecutive_failure_count >= 3) return "failing";
  if (value.consecutive_failure_count > 0 || value.last_error) return "degraded";
  return value.last_succeeded_at ? "healthy" : "unknown";
}

function normalizeFeedRunStatus(status: string): InventoryIntegrationRunRow["status"] {
  if (status === "pending") return "queued";
  if (status === "processing") return "running";
  if (status === "retrying" || status === "succeeded" || status === "partial" || status === "skipped" || status === "cancelled" || status === "failed" || status === "dead_letter") {
    return status;
  }
  return "failed";
}

function normalizeExportRunStatus(status: string): InventoryIntegrationRunRow["status"] {
  if (status === "pending") return "queued";
  if (status === "delivering") return "running";
  if (status === "retrying" || status === "succeeded" || status === "skipped" || status === "cancelled" || status === "failed" || status === "dead_letter") {
    return status;
  }
  return "failed";
}

function firstDiagnosticMessage(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const first = value[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) return null;
  const message = (first as Record<string, unknown>).message;
  return typeof message === "string" && message.trim() ? message.slice(0, 500) : null;
}

function isInventoryInfrastructureMigrationMissing(error: { code?: string | null; message?: string | null }): boolean {
  return error.code === "42P01" || /(?:inventory_(?:feed|export)_[a-z_]+).*does not exist/i.test(error.message ?? "");
}

function InventoryInfrastructureMigrationRequired({ tenantName }: { tenantName: string }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory feeds & syndication"
        description={`Safely synchronize supplier inventory and publish approved feeds for ${tenantName}.`}
      />
      <section className="max-w-3xl rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
        <h2 className="text-lg font-semibold">Migration required</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Managed feed and syndication configuration becomes available after migration 077 is applied to this environment.
          No inventory data has been changed from this screen.
        </p>
      </section>
    </div>
  );
}
