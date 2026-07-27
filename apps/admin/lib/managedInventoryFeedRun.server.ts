/** Server-only execution of one leased managed inventory feed run. */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClaimedInventoryFeedRun,
  Database,
  InventoryFeedRunCompletion,
  InventoryRunDiagnostic,
} from "@lume/db";
import { isTenantOwnedPath, TENANT_BUCKETS } from "@lume/db";
import {
  decryptInventoryIntegrationCredential,
  inventoryIntegrationCredentialHeaders,
} from "@/lib/inventoryIntegrationCredentials.server";
import { fetchManagedFeed, MAX_MANAGED_FEED_BYTES } from "@/lib/managedFeedRemoteFetch.server";
import {
  fetchManagedSftpFeed,
  validateManagedSftpFeedConfig,
} from "@/lib/managedFeedSftpFetch.server";
import {
  materializeManagedFeedCreate,
  materializeManagedFeedUpdate,
  parseManagedFeed,
  preflightManagedFeedIdentities,
  type ManagedFeedMappedRecord,
  type ManagedFeedParseIssue,
} from "@/lib/managedFeed";
import {
  resolveFeedSync,
  type FeedSyncExistingVehicle,
  type FeedSyncResolution,
  type VehicleImportInsert,
} from "@/lib/vehicleImport";
import {
  countUnmappedManagedFeedInvalidRecords,
  normalizedManagedFeedIdentity,
  protectedVehicleHistoryMessage,
  shouldSkipUnchangedManagedFeed,
} from "./managedInventoryFeedPolicy";
import { assertManagedFeedLeaseActive } from "./managedFeedLease";

export { shouldSkipUnchangedManagedFeed } from "./managedInventoryFeedPolicy";

type ServiceClient = SupabaseClient<Database, "public">;
type FeedSnapshot = {
  sourceKind: "https" | "storage" | "sftp";
  sourceUrl: string | null;
  sourceObjectPath: string | null;
  sftpHost: string | null;
  sftpPort: number | null;
  sftpRemotePath: string | null;
  sftpHostKeyFingerprint: string | null;
  sourceFormat: "csv" | "json" | "xml";
  profile: Record<string, unknown>;
  syncMode: "hybrid" | "mirror";
  configVersion: number;
};

type SourcePayload = { text: string; byteLength: number; sha256: string };
type ManagedInventoryFeedRunOptions = { signal?: AbortSignal };

/**
 * Download, parse, preflight, and safely sync one claimed run. This function
 * never deletes or recreates a vehicle: matching uses LUME's VIN-first,
 * stock-ID fallback resolver and only inserts genuinely new stable identities.
 */
export async function executeManagedInventoryFeedRun(
  service: ServiceClient,
  run: ClaimedInventoryFeedRun,
  options: ManagedInventoryFeedRunOptions = {},
): Promise<InventoryFeedRunCompletion> {
  assertManagedFeedLeaseActive(options.signal);
  const snapshot = parseFeedSnapshot(run.sourceSnapshot);
  const source = await readFeedSource(service, run.tenantId, snapshot, run.credentialCiphertext);
  assertManagedFeedLeaseActive(options.signal);
  // Raw bytes may be unchanged, but a profile/source edit must always rerun.
  // The queued snapshot version and current claimed version make this safe for
  // an old in-flight run as well as a normal scheduled no-op.
  if (shouldSkipUnchangedManagedFeed(
    run.lastSourceHash,
    source.sha256,
    run.sourceConfigVersion,
    snapshot.configVersion,
  )) {
    return {
      status: "skipped",
      sourceHash: source.sha256,
      inputBytes: source.byteLength,
      totalRows: 0,
      processedRows: 0,
      createdRows: 0,
      updatedRows: 0,
      skippedRows: 0,
      conflictRows: 0,
      failedRows: 0,
      errors: [],
    };
  }
  // The DB `sync_mode` is authoritative rather than a potentially stale JSON
  // property. This also makes legacy hybrid profiles explicit at execution.
  const parsed = parseManagedFeed({ ...snapshot.profile, format: snapshot.sourceFormat, mode: snapshot.syncMode }, source.text);
  if (!parsed.profile) throw new Error(parsed.issues[0]?.message ?? "Managed feed profile is invalid.");
  if (parsed.records.length === 0 && parsed.issues.length > 0) {
    throw new Error(parsed.issues[0]?.message ?? "Managed feed could not be parsed.");
  }

  const diagnostics: InventoryRunDiagnostic[] = parsed.issues.map(toParseDiagnostic);
  const unmappedInvalidRecordCount = countUnmappedManagedFeedInvalidRecords(parsed);
  const preflight = preflightManagedFeedIdentities(parsed.records);
  diagnostics.push(...preflight.issues.map((issue) => ({
    stage: "preflight" as const,
    line: issue.sourceLine,
    message: issue.message,
  })));

  const inventoryIdentities = await loadSyncFingerprints(service, run.tenantId, options.signal);
  assertManagedFeedLeaseActive(options.signal);
  // resolveFeedSync intentionally reads only identities. Keep this cast local:
  // full row normalization happens below before *any* insert/update.
  const identityRows = parsed.records.map((record) => ({
    feed_vin: record.fields.feed_vin ?? null,
    external_id: record.fields.external_id ?? null,
  } as VehicleImportInsert));
  const resolutions = resolveFeedSync(identityRows, inventoryIdentities.active);
  const preflightInvalid = new Set(preflight.issues.map((issue) => issue.recordIndex));
  const parseInvalid = new Set(parsed.issues
    .filter((issue) => issue.recordIndex !== undefined)
    .map((issue) => issue.recordIndex!));

  const feedUpdatedAt = new Date().toISOString();
  // Archival is blocked while a run is processing, and this recheck is a
  // defense-in-depth boundary before any vehicle mutation in case a future
  // worker/administrative path changes that policy.
  await assertFeedSourceNotArchived(service, run.tenantId, run.feedSourceId, options.signal);
  // A bounded pool keeps 10k-row feeds inside a serverless run without a
  // database stampede. Each row remains independently normalized and tenant
  // scoped, so no batch can accidentally apply another row's identity.
  const outcomes = await mapWithConcurrency(parsed.records, 10, (record, recordIndex) =>
    applyFeedRecord({
      service,
      tenantId: run.tenantId,
      record,
      resolution: resolutions.get(recordIndex),
      protectedHistoryMessage: protectedHistoryMessage(record, inventoryIdentities),
      parseInvalid: parseInvalid.has(record.index),
      preflightInvalid: preflightInvalid.has(record.index),
      syncMode: snapshot.syncMode,
      feedUpdatedAt,
      signal: options.signal,
    }),
  );
  let createdRows = 0;
  let updatedRows = 0;
  let skippedRows = 0;
  let conflictRows = 0;
  let failedRows = unmappedInvalidRecordCount;
  for (const outcome of outcomes) {
    diagnostics.push(...outcome.diagnostics);
    if (outcome.kind === "created") createdRows += 1;
    else if (outcome.kind === "updated") updatedRows += 1;
    else if (outcome.kind === "skipped") skippedRows += 1;
    else if (outcome.kind === "conflict") conflictRows += 1;
    else failedRows += 1;
  }

  const totalRows = parsed.records.length + unmappedInvalidRecordCount;
  const processedRows = createdRows + updatedRows + skippedRows + conflictRows + failedRows;
  return {
    status: diagnostics.length > 0 || conflictRows > 0 || failedRows > 0 || skippedRows > 0
      ? "partial"
      : "succeeded",
    sourceHash: source.sha256,
    inputBytes: source.byteLength,
    totalRows,
    processedRows,
    createdRows,
    updatedRows,
    skippedRows,
    conflictRows,
    failedRows,
    errors: diagnostics,
  };
}

function parseFeedSnapshot(value: Record<string, unknown>): FeedSnapshot {
  if (!isPlainRecord(value)) throw new Error("Managed feed run has an invalid source snapshot.");
  const sourceKind = value.sourceKind;
  const sourceFormat = value.sourceFormat;
  const syncMode = value.syncMode;
  const configVersion = value.configVersion;
  const profile = value.profile;
  const sourceUrl = nullableString(value.sourceUrl);
  const sourceObjectPath = nullableString(value.sourceObjectPath);
  const sftpHost = nullableString(value.sftpHost);
  const sftpPort = typeof value.sftpPort === "number" && Number.isInteger(value.sftpPort)
    ? value.sftpPort
    : null;
  const sftpRemotePath = nullableString(value.sftpRemotePath);
  const sftpHostKeyFingerprint = nullableString(value.sftpHostKeyFingerprint);
  if ((sourceKind !== "https" && sourceKind !== "storage" && sourceKind !== "sftp") ||
    (sourceFormat !== "csv" && sourceFormat !== "json" && sourceFormat !== "xml") ||
    (syncMode !== "hybrid" && syncMode !== "mirror") ||
    typeof configVersion !== "number" || !Number.isInteger(configVersion) || configVersion < 1 ||
    !isPlainRecord(profile)) {
    throw new Error("Managed feed run has an invalid source snapshot.");
  }
  if (sourceKind === "https" && !sourceUrl) throw new Error("Managed feed source URL is missing.");
  if (sourceKind === "storage" && !sourceObjectPath) throw new Error("Managed feed source file is missing.");
  if (sourceKind === "sftp") {
    const config = validateManagedSftpFeedConfig({
      host: sftpHost ?? "",
      port: sftpPort ?? 0,
      remotePath: sftpRemotePath ?? "",
      hostKeyFingerprint: sftpHostKeyFingerprint ?? "",
    });
    if (!config.ok) throw new Error(config.error);
  }
  return {
    sourceKind,
    sourceUrl,
    sourceObjectPath,
    sftpHost,
    sftpPort,
    sftpRemotePath,
    sftpHostKeyFingerprint,
    sourceFormat,
    profile,
    syncMode,
    configVersion,
  };
}

async function readFeedSource(
  service: ServiceClient,
  tenantId: string,
  snapshot: FeedSnapshot,
  credentialCiphertext: string | null,
): Promise<SourcePayload> {
  let bytes: Uint8Array;
  if (snapshot.sourceKind === "https") {
    const credential = credentialCiphertext
      ? decryptInventoryIntegrationCredential(credentialCiphertext)
      : null;
    const response = await fetchManagedFeed(
      snapshot.sourceUrl!,
      inventoryIntegrationCredentialHeaders(credential),
    );
    bytes = response.bytes;
  } else if (snapshot.sourceKind === "sftp") {
    if (!credentialCiphertext) throw new Error("SFTP source credentials are missing.");
    const credential = decryptInventoryIntegrationCredential(credentialCiphertext);
    if (credential.kind !== "sftp_password") {
      throw new Error("SFTP source has an invalid credential type.");
    }
    bytes = await fetchManagedSftpFeed({
      host: snapshot.sftpHost!,
      port: snapshot.sftpPort!,
      remotePath: snapshot.sftpRemotePath!,
      hostKeyFingerprint: snapshot.sftpHostKeyFingerprint!,
      username: credential.username,
      password: credential.password,
    });
  } else {
    const objectPath = snapshot.sourceObjectPath!;
    if (!isTenantOwnedPath(tenantId, objectPath)) throw new Error("Managed feed storage path is outside this tenant.");
    const { data, error } = await service.storage.from(TENANT_BUCKETS.csvs).download(objectPath);
    if (error || !data) throw new Error("Managed feed storage object could not be read.");
    const buffer = await data.arrayBuffer();
    if (buffer.byteLength > MAX_MANAGED_FEED_BYTES) throw new Error("Managed feed exceeds the 25 MB limit.");
    bytes = new Uint8Array(buffer);
  }
  if (bytes.byteLength > MAX_MANAGED_FEED_BYTES) throw new Error("Managed feed exceeds the 25 MB limit.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Managed feed must use UTF-8 text.");
  }
  return {
    text,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

type ProtectedInventoryIdentities = {
  active: FeedSyncExistingVehicle[];
  protectedByVin: Map<string, string>;
  protectedByExternalId: Map<string, string>;
};

async function loadSyncFingerprints(
  service: ServiceClient,
  tenantId: string,
  signal?: AbortSignal,
): Promise<ProtectedInventoryIdentities> {
  const active: FeedSyncExistingVehicle[] = [];
  const protectedByVin = new Map<string, string>();
  const protectedByExternalId = new Map<string, string>();
  const pageSize = 1_000;
  let afterId: string | null = null;
  for (;;) {
    assertManagedFeedLeaseActive(signal);
    let query = service.from("vehicles")
      .select("id, external_id, feed_vin, year, make, model, trim, mileage, status")
      .eq("tenant_id", tenantId)
      .order("id", { ascending: true })
      .limit(pageSize);
    if (afterId) query = query.gt("id", afterId);
    const { data, error } = await query;
    if (error) throw new Error("Current inventory identities could not be loaded.");
    const rows = data ?? [];
    for (const row of rows) {
      if (row.status === "draft" || row.status === "live") {
        active.push(row);
        continue;
      }
      if (row.status === "sold" || row.status === "archived") {
        const vin = normalizedManagedFeedIdentity(row.feed_vin);
        const externalId = normalizedManagedFeedIdentity(row.external_id);
        if (vin) protectedByVin.set(vin, row.id);
        if (externalId) protectedByExternalId.set(externalId, row.id);
      }
    }
    if (rows.length < pageSize) break;
    afterId = rows[rows.length - 1]?.id ?? null;
    if (!afterId) break;
  }
  return { active, protectedByVin, protectedByExternalId };
}

function protectedHistoryMessage(
  record: ManagedFeedMappedRecord,
  identities: ProtectedInventoryIdentities,
): string | null {
  return protectedVehicleHistoryMessage(
    record.fields.feed_vin,
    record.fields.external_id,
    identities.protectedByVin,
    identities.protectedByExternalId,
  );
}

async function assertFeedSourceNotArchived(
  service: ServiceClient,
  tenantId: string,
  feedSourceId: string,
  signal?: AbortSignal,
): Promise<void> {
  assertManagedFeedLeaseActive(signal);
  const { data, error } = await service.from("inventory_feed_sources")
    .select("archived_at")
    .eq("tenant_id", tenantId)
    .eq("id", feedSourceId)
    .maybeSingle();
  if (error || !data || data.archived_at) {
    throw new Error("Managed inventory source is no longer available.");
  }
}

function toParseDiagnostic(issue: ManagedFeedParseIssue) {
  return {
    stage: "parse" as const,
    ...(issue.sourceLine ? { line: issue.sourceLine } : {}),
    message: issue.message,
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeDatabaseMessage(value: string): string {
  // PostgREST error text can include query details. Preserve a useful bounded
  // message in tenant-visible run history without attaching supplier data.
  return value.replace(/https?:\/\/\S+/gi, "[endpoint]").slice(0, 500);
}

type FeedRecordOutcome = {
  kind: "created" | "updated" | "skipped" | "conflict" | "failed";
  diagnostics: InventoryRunDiagnostic[];
};

async function applyFeedRecord(input: {
  service: ServiceClient;
  tenantId: string;
  record: ManagedFeedMappedRecord;
  resolution: FeedSyncResolution | undefined;
  protectedHistoryMessage: string | null;
  parseInvalid: boolean;
  preflightInvalid: boolean;
  syncMode: "hybrid" | "mirror";
  feedUpdatedAt: string;
  signal?: AbortSignal;
}): Promise<FeedRecordOutcome> {
  assertManagedFeedLeaseActive(input.signal);
  const { record } = input;
  if (input.parseInvalid) return { kind: "failed", diagnostics: [] };
  if (input.preflightInvalid) return { kind: "conflict", diagnostics: [] };
  if (input.protectedHistoryMessage) {
    return {
      kind: "conflict",
      diagnostics: [{
        stage: "preflight",
        line: record.sourceLine,
        message: input.protectedHistoryMessage,
      }],
    };
  }
  if (!input.resolution || input.resolution.status === "conflict") {
    return {
      kind: "conflict",
      diagnostics: input.resolution?.status === "conflict"
        ? [{ stage: "preflight", line: record.sourceLine, message: input.resolution.message }]
        : [],
    };
  }

  if (input.resolution.status === "update") {
    const normalized = materializeManagedFeedUpdate(record, {
      applyNullClears: input.syncMode === "mirror",
    });
    if (normalized.errors.length > 0) {
      return {
        kind: "failed",
        diagnostics: normalized.errors.map((message) => ({
          stage: "normalize",
          line: record.sourceLine,
          message,
        })),
      };
    }
    const patch: Database["public"]["Tables"]["vehicles"]["Update"] = {
      ...normalized.update,
      feed_updated_at: input.feedUpdatedAt,
    };
    assertManagedFeedLeaseActive(input.signal);
    const { data, error } = await input.service.from("vehicles").update(patch)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.resolution.vehicleId)
      // A unit can be sold/archived between the identity read and this write.
      // Supplier sync must never mutate that historical record.
      .in("status", ["draft", "live"])
      .select("id")
      .maybeSingle();
    if (error) {
      return {
        kind: "failed",
        diagnostics: [{ stage: "sync", line: record.sourceLine, message: safeDatabaseMessage(error.message) }],
      };
    }
    if (!data) {
      return {
        kind: "conflict",
        diagnostics: [{
          stage: "sync",
          line: record.sourceLine,
          message: "Vehicle became sold or archived before this feed update and was left unchanged.",
        }],
      };
    }
    return { kind: "updated", diagnostics: [] };
  }

  const materialized = materializeManagedFeedCreate(record);
  if (!materialized.row || materialized.errors.length > 0) {
    return {
      kind: "failed",
      diagnostics: materialized.errors.map((message) => ({
        stage: "normalize",
        line: record.sourceLine,
        message,
      })),
    };
  }
  assertManagedFeedLeaseActive(input.signal);
  const { error } = await input.service.from("vehicles").insert({
    ...materialized.row,
    tenant_id: input.tenantId,
    feed_updated_at: input.feedUpdatedAt,
  });
  return error
    ? {
        kind: "failed",
        diagnostics: [{ stage: "sync", line: record.sourceLine, message: safeDatabaseMessage(error.message) }],
      }
    : { kind: "created", diagnostics: [] };
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor++;
      const value = values[index];
      if (value === undefined) continue;
      results[index] = await mapper(value, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}
