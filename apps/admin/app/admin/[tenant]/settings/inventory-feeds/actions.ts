"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@lume/db/server";
import {
  archiveInventoryExportDestination,
  archiveInventoryFeedSource,
  enqueueInventoryExportRun,
  enqueueInventoryFeedRun,
  setInventoryExportDestinationEnabled as setExportDestinationEnabled,
  setInventoryFeedSourceEnabled as setFeedSourceEnabled,
} from "@lume/db";
import { auditWrite } from "@/lib/audit";
import {
  encryptInventoryIntegrationCredential,
  inventoryIntegrationEncryptionConfigured,
  parseInventoryIntegrationCredential,
} from "@/lib/inventoryIntegrationCredentials.server";
import { validateManagedFeedProfile } from "@/lib/managedFeed";
import { validateManagedHttpsEndpoint } from "@/lib/managedFeedRemoteFetch.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  assertValidInventorySyndicationProfile,
  InventorySyndicationValidationError,
  type InventorySyndicationProfile,
} from "@lume/db";
import type { ManagedFeedProfile } from "@/lib/managedFeed";
import type {
  InventoryExportDestinationInput,
  InventoryIntegrationActionResult,
  InventoryIntegrationAuthInput,
  ManagedFeedSourceInput,
} from "./InventoryFeedsClient";

const DEFAULT_RETRY_DELAYS_SECONDS = [60, 300, 1_800, 3_600, 21_600];
type Validation<T> = { ok: true; value: T } | { ok: false; error: string };
type ValidatedFeedInput = {
  name: string;
  endpointUrl: string;
  profile: ManagedFeedProfile;
  scheduleMinutes: number;
};
type ValidatedExportInput = {
  name: string;
  endpointUrl: string;
  httpMethod: "POST" | "PUT";
  profile: InventorySyndicationProfile;
  scheduleMinutes: number;
};

export async function createManagedFeedSource(
  slug: string,
  input: ManagedFeedSourceInput,
): Promise<InventoryIntegrationActionResult> {
  const authorized = await authorizeInventoryIntegrationMutation(slug);
  if (!authorized) return denied();
  const validated = validateFeedInput(input);
  if (!validated.ok) return { error: validated.error };
  const credential = credentialForMutation(input.auth);
  if (!credential.ok) return { error: credential.error };

  const service = createServiceClient();
  const { data, error } = await service.rpc("create_inventory_feed_source", {
    p_tenant_id: authorized.tenantId,
    p_name: validated.value.name,
    p_source_kind: "https",
    p_source_url: validated.value.endpointUrl,
    p_source_object_path: null,
    p_source_format: validated.value.profile.format,
    p_profile: validated.value.profile,
    p_sync_mode: validated.value.profile.mode,
    p_schedule_minutes: validated.value.scheduleMinutes,
    p_retry_delays_seconds: DEFAULT_RETRY_DELAYS_SECONDS,
    p_enabled: true,
    p_credential_ciphertext: credential.value.ciphertext,
  });
  if (error || !data) return { error: "Unable to create the managed feed source." };
  await auditWrite({
    tenantId: authorized.tenantId,
    actorUserId: authorized.userId,
    action: "inventory_feed_source.created",
    resourceType: "inventory_feed_source",
    resourceId: data,
    metadata: { format: validated.value.profile.format, mode: validated.value.profile.mode },
  }).catch(() => undefined);
  revalidateInventoryFeeds(slug);
  return { message: "Managed feed source created." };
}

export async function updateManagedFeedSource(
  slug: string,
  sourceId: string,
  input: ManagedFeedSourceInput,
): Promise<InventoryIntegrationActionResult> {
  const authorized = await authorizeInventoryIntegrationMutation(slug);
  if (!authorized || !sourceId) return denied();
  const validated = validateFeedInput(input);
  if (!validated.ok) return { error: validated.error };
  const credential = credentialForMutation(input.auth);
  if (!credential.ok) return { error: credential.error };

  const service = createServiceClient();
  const { data: current, error: currentError } = await service.from("inventory_feed_sources")
    .select("enabled")
    .eq("tenant_id", authorized.tenantId)
    .eq("id", sourceId)
    .is("archived_at", null)
    .maybeSingle();
  if (currentError || !current) return { error: "Managed feed source not found." };
  const { data, error } = await service.rpc("update_inventory_feed_source", {
    p_feed_source_id: sourceId,
    p_tenant_id: authorized.tenantId,
    p_name: validated.value.name,
    p_source_kind: "https",
    p_source_url: validated.value.endpointUrl,
    p_source_object_path: null,
    p_source_format: validated.value.profile.format,
    p_profile: validated.value.profile,
    p_sync_mode: validated.value.profile.mode,
    p_schedule_minutes: validated.value.scheduleMinutes,
    p_retry_delays_seconds: DEFAULT_RETRY_DELAYS_SECONDS,
    p_enabled: current.enabled,
    p_credential_ciphertext: credential.value.ciphertext,
    p_replace_credential: credential.value.replace,
  });
  if (error || data !== true) {
    if (/active managed feed run/i.test(error?.message ?? "")) {
      return { error: "Wait for the active feed run to finish before updating this source." };
    }
    return { error: "Unable to update the managed feed source." };
  }
  await auditWrite({
    tenantId: authorized.tenantId,
    actorUserId: authorized.userId,
    action: "inventory_feed_source.updated",
    resourceType: "inventory_feed_source",
    resourceId: sourceId,
    metadata: { format: validated.value.profile.format, mode: validated.value.profile.mode },
  }).catch(() => undefined);
  revalidateInventoryFeeds(slug);
  return { message: "Managed feed source updated." };
}

export async function setManagedFeedSourceEnabled(
  slug: string,
  sourceId: string,
  enabled: boolean,
): Promise<InventoryIntegrationActionResult> {
  const authorized = await authorizeInventoryIntegrationMutation(slug);
  if (!authorized || !sourceId || typeof enabled !== "boolean") return denied();
  try {
    const updated = await setFeedSourceEnabled(
      createServiceClient(),
      sourceId,
      authorized.tenantId,
      enabled,
    );
    if (!updated) return { error: "Managed feed source not found." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/active managed feed run/i.test(message)) {
      return { error: "Wait for the active feed run to finish before pausing this source." };
    }
    return { error: "Unable to change the managed feed source." };
  }
  await auditWrite({
    tenantId: authorized.tenantId,
    actorUserId: authorized.userId,
    action: enabled ? "inventory_feed_source.enabled" : "inventory_feed_source.paused",
    resourceType: "inventory_feed_source",
    resourceId: sourceId,
  }).catch(() => undefined);
  revalidateInventoryFeeds(slug);
  return { message: enabled ? "Managed feed source enabled." : "Managed feed source paused." };
}

export async function runManagedFeedSource(
  slug: string,
  sourceId: string,
): Promise<InventoryIntegrationActionResult> {
  const authorized = await authorizeInventoryIntegrationMutation(slug);
  if (!authorized || !sourceId) return denied();
  try {
    const runId = await enqueueInventoryFeedRun(
      createServiceClient(),
      sourceId,
      authorized.tenantId,
    );
    if (!runId) return { error: "Enable the source before queueing a run." };
    await auditWrite({
      tenantId: authorized.tenantId,
      actorUserId: authorized.userId,
      action: "inventory_feed_source.run_queued",
      resourceType: "inventory_feed_source",
      resourceId: sourceId,
    }).catch(() => undefined);
    revalidateInventoryFeeds(slug);
    return { message: "Feed run queued for the worker." };
  } catch {
    return { error: "Unable to queue the managed feed run." };
  }
}

export async function removeManagedFeedSource(
  slug: string,
  sourceId: string,
): Promise<InventoryIntegrationActionResult> {
  const authorized = await authorizeInventoryIntegrationMutation(slug);
  if (!authorized || !sourceId) return denied();
  try {
    const archived = await archiveInventoryFeedSource(
      createServiceClient(),
      sourceId,
      authorized.tenantId,
    );
    if (!archived) return { error: "Managed feed source not found." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/active managed feed run/i.test(message)) {
      return { error: "Wait for the active feed run to finish before archiving this source." };
    }
    return { error: "Unable to archive the managed feed source." };
  }
  await auditWrite({
    tenantId: authorized.tenantId,
    actorUserId: authorized.userId,
    action: "inventory_feed_source.archived",
    resourceType: "inventory_feed_source",
    resourceId: sourceId,
  }).catch(() => undefined);
  revalidateInventoryFeeds(slug);
  return { message: "Managed feed source archived. Historical runs were retained." };
}

export async function createInventoryExportDestination(
  slug: string,
  input: InventoryExportDestinationInput,
): Promise<InventoryIntegrationActionResult> {
  const authorized = await authorizeInventoryIntegrationMutation(slug);
  if (!authorized) return denied();
  const validated = validateExportInput(input);
  if (!validated.ok) return { error: validated.error };
  const credential = credentialForMutation(input.auth);
  if (!credential.ok) return { error: credential.error };
  const service = createServiceClient();
  const { data, error } = await service.rpc("create_inventory_export_destination", {
    p_tenant_id: authorized.tenantId,
    p_name: validated.value.name,
    p_endpoint_url: validated.value.endpointUrl,
    p_http_method: validated.value.httpMethod,
    p_export_format: validated.value.profile.format,
    p_profile: validated.value.profile,
    p_schedule_minutes: validated.value.scheduleMinutes,
    p_retry_delays_seconds: DEFAULT_RETRY_DELAYS_SECONDS,
    p_enabled: true,
    p_credential_ciphertext: credential.value.ciphertext,
  });
  if (error || !data) return { error: "Unable to create the inventory export destination." };
  await auditWrite({
    tenantId: authorized.tenantId,
    actorUserId: authorized.userId,
    action: "inventory_export_destination.created",
    resourceType: "inventory_export_destination",
    resourceId: data,
    metadata: { format: validated.value.profile.format },
  }).catch(() => undefined);
  revalidateInventoryFeeds(slug);
  return { message: "Inventory export destination created." };
}

export async function updateInventoryExportDestination(
  slug: string,
  destinationId: string,
  input: InventoryExportDestinationInput,
): Promise<InventoryIntegrationActionResult> {
  const authorized = await authorizeInventoryIntegrationMutation(slug);
  if (!authorized || !destinationId) return denied();
  const validated = validateExportInput(input);
  if (!validated.ok) return { error: validated.error };
  const credential = credentialForMutation(input.auth);
  if (!credential.ok) return { error: credential.error };
  const service = createServiceClient();
  const { data: current, error: currentError } = await service.from("inventory_export_destinations")
    .select("enabled")
    .eq("tenant_id", authorized.tenantId)
    .eq("id", destinationId)
    .is("archived_at", null)
    .maybeSingle();
  if (currentError || !current) return { error: "Inventory export destination not found." };
  const { data, error } = await service.rpc("update_inventory_export_destination", {
    p_export_destination_id: destinationId,
    p_tenant_id: authorized.tenantId,
    p_name: validated.value.name,
    p_endpoint_url: validated.value.endpointUrl,
    p_http_method: validated.value.httpMethod,
    p_export_format: validated.value.profile.format,
    p_profile: validated.value.profile,
    p_schedule_minutes: validated.value.scheduleMinutes,
    p_retry_delays_seconds: DEFAULT_RETRY_DELAYS_SECONDS,
    p_enabled: current.enabled,
    p_credential_ciphertext: credential.value.ciphertext,
    p_replace_credential: credential.value.replace,
  });
  if (error || data !== true) {
    if (/active inventory export/i.test(error?.message ?? "")) {
      return { error: "Wait for the active export to finish before updating this destination." };
    }
    return { error: "Unable to update the inventory export destination." };
  }
  await auditWrite({
    tenantId: authorized.tenantId,
    actorUserId: authorized.userId,
    action: "inventory_export_destination.updated",
    resourceType: "inventory_export_destination",
    resourceId: destinationId,
    metadata: { format: validated.value.profile.format },
  }).catch(() => undefined);
  revalidateInventoryFeeds(slug);
  return { message: "Inventory export destination updated." };
}

export async function setInventoryExportDestinationEnabled(
  slug: string,
  destinationId: string,
  enabled: boolean,
): Promise<InventoryIntegrationActionResult> {
  const authorized = await authorizeInventoryIntegrationMutation(slug);
  if (!authorized || !destinationId || typeof enabled !== "boolean") return denied();
  try {
    const updated = await setExportDestinationEnabled(
      createServiceClient(),
      destinationId,
      authorized.tenantId,
      enabled,
    );
    if (!updated) return { error: "Inventory export destination not found." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/active inventory export/i.test(message)) {
      return { error: "Wait for the active export to finish before pausing this destination." };
    }
    return { error: "Unable to change the inventory export destination." };
  }
  await auditWrite({
    tenantId: authorized.tenantId,
    actorUserId: authorized.userId,
    action: enabled ? "inventory_export_destination.enabled" : "inventory_export_destination.paused",
    resourceType: "inventory_export_destination",
    resourceId: destinationId,
  }).catch(() => undefined);
  revalidateInventoryFeeds(slug);
  return { message: enabled ? "Inventory export destination enabled." : "Inventory export destination paused." };
}

export async function runInventoryExportDestination(
  slug: string,
  destinationId: string,
): Promise<InventoryIntegrationActionResult> {
  const authorized = await authorizeInventoryIntegrationMutation(slug);
  if (!authorized || !destinationId) return denied();
  try {
    const runId = await enqueueInventoryExportRun(
      createServiceClient(),
      destinationId,
      authorized.tenantId,
    );
    if (!runId) return { error: "Enable the destination before queueing an export." };
    await auditWrite({
      tenantId: authorized.tenantId,
      actorUserId: authorized.userId,
      action: "inventory_export_destination.run_queued",
      resourceType: "inventory_export_destination",
      resourceId: destinationId,
    }).catch(() => undefined);
    revalidateInventoryFeeds(slug);
    return { message: "Inventory export queued for the worker." };
  } catch {
    return { error: "Unable to queue the inventory export." };
  }
}

export async function removeInventoryExportDestination(
  slug: string,
  destinationId: string,
): Promise<InventoryIntegrationActionResult> {
  const authorized = await authorizeInventoryIntegrationMutation(slug);
  if (!authorized || !destinationId) return denied();
  try {
    const archived = await archiveInventoryExportDestination(
      createServiceClient(),
      destinationId,
      authorized.tenantId,
    );
    if (!archived) return { error: "Inventory export destination not found." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/active inventory export/i.test(message)) {
      return { error: "Wait for the active export to finish before archiving this destination." };
    }
    return { error: "Unable to archive the inventory export destination." };
  }
  await auditWrite({
    tenantId: authorized.tenantId,
    actorUserId: authorized.userId,
    action: "inventory_export_destination.archived",
    resourceType: "inventory_export_destination",
    resourceId: destinationId,
  }).catch(() => undefined);
  revalidateInventoryFeeds(slug);
  return { message: "Inventory export destination archived. Historical runs were retained." };
}

function validateFeedInput(input: ManagedFeedSourceInput): Validation<ValidatedFeedInput> {
  const name = normalizeName(input.name);
  if (!name) return { ok: false, error: "Source name must be between 1 and 100 characters." };
  const endpoint = validateManagedHttpsEndpoint(input.endpointUrl);
  if (!endpoint.ok) return endpoint;
  if (!Number.isInteger(input.scheduleMinutes) || input.scheduleMinutes < 15 || input.scheduleMinutes > 10_080) {
    return { ok: false, error: "Source schedule must be between 15 minutes and 7 days." };
  }
  const profile = requireFeedProfile({ ...input.profile, mode: input.mode });
  return profile.ok
    ? { ok: true, value: { name, endpointUrl: endpoint.url, profile: profile.value, scheduleMinutes: input.scheduleMinutes } }
    : profile;
}

function validateExportInput(input: InventoryExportDestinationInput): Validation<ValidatedExportInput> {
  const name = normalizeName(input.name);
  if (!name) return { ok: false, error: "Destination name must be between 1 and 100 characters." };
  const endpoint = validateManagedHttpsEndpoint(input.endpointUrl);
  if (!endpoint.ok) return endpoint;
  if (input.httpMethod !== "POST" && input.httpMethod !== "PUT") {
    return { ok: false, error: "Inventory export delivery method must be POST or PUT." };
  }
  if (!Number.isInteger(input.scheduleMinutes) || input.scheduleMinutes < 15 || input.scheduleMinutes > 10_080) {
    return { ok: false, error: "Destination schedule must be between 15 minutes and 7 days." };
  }
  const profile = requireExportProfile(input.profile);
  return profile.ok
    ? {
      ok: true,
      value: {
        name,
        endpointUrl: endpoint.url,
        httpMethod: input.httpMethod,
        profile: profile.value,
        scheduleMinutes: input.scheduleMinutes,
      },
    }
    : profile;
}

function requireFeedProfile(value: Record<string, unknown>): Validation<ManagedFeedProfile> {
  const result = validateManagedFeedProfile(value);
  return result.profile
    ? { ok: true as const, value: result.profile }
    : { ok: false as const, error: result.issues[0]?.message ?? "Managed feed profile is invalid." };
}

function requireExportProfile(value: Record<string, unknown>): Validation<InventorySyndicationProfile> {
  try {
    assertValidInventorySyndicationProfile(value);
    return { ok: true as const, value };
  } catch (error) {
    const message = error instanceof InventorySyndicationValidationError
      ? error.issues[0]?.message
      : "Inventory export profile is invalid.";
    return { ok: false as const, error: message ?? "Inventory export profile is invalid." };
  }
}

function credentialForMutation(auth: InventoryIntegrationAuthInput | undefined):
  | { ok: true; value: { ciphertext: string | null; replace: boolean } }
  | { ok: false; error: string } {
  if (!auth) return { ok: true, value: { ciphertext: null, replace: false } };
  if (auth.kind === "none") return { ok: true, value: { ciphertext: null, replace: true } };
  const parsed = parseInventoryIntegrationCredential(
    auth.kind === "bearer"
      ? { authType: "bearer", bearerToken: auth.token }
      : auth.kind === "basic"
        ? { authType: "basic", username: auth.username, password: auth.password }
        : { authType: "header", headerName: auth.headerName, headerValue: auth.headerValue },
  );
  if (!parsed.ok || !parsed.value) return { ok: false, error: parsed.ok ? "Credential is required." : parsed.error };
  if (!inventoryIntegrationEncryptionConfigured()) {
    return { ok: false, error: "Credential encryption is not configured on this environment." };
  }
  try {
    return { ok: true, value: { ciphertext: encryptInventoryIntegrationCredential(parsed.value), replace: true } };
  } catch {
    return { ok: false, error: "Unable to encrypt the credential." };
  }
}

function normalizeName(value: string): string | null {
  const name = typeof value === "string" ? value.trim() : "";
  return name.length >= 1 && name.length <= 100 ? name : null;
}

async function authorizeInventoryIntegrationMutation(slug: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: tenant }, userResult] = await Promise.all([
    supabase.from("tenants").select("id").eq("slug", slug).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const user = userResult.data.user;
  if (!tenant || !user) return null;
  const { data: allowed, error } = await supabase.rpc("user_has_tenant_role", {
    p_tenant_id: tenant.id,
    p_roles: ["owner", "admin"],
  });
  return !error && allowed ? { tenantId: tenant.id, userId: user.id } : null;
}

function revalidateInventoryFeeds(slug: string): void {
  revalidatePath(`/admin/${slug}/settings/inventory-feeds`);
}

function denied(): InventoryIntegrationActionResult {
  return { error: "Owner or admin access is required." };
}
