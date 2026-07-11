import { timingSafeEqual } from "node:crypto";
import {
  combineStorageMeasurements,
  createAdminNotification,
  formatStorageBytes,
  loadTenantStorageAllowance,
  measureTenantSupabaseStorage,
  reconcileStorageReservations,
  storageQuotaState,
  storageWarningDedupeKey,
  writeStorageUsageSnapshot,
  writeTenantStorageUsage,
} from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { readR2StorageConfig } from "@/lib/r2Config";
import { measureTenantR2Storage, r2TenantPrefix } from "@/lib/r2StorageUsage.server";
import { loadUsageMeteringTenants } from "@/lib/usageTenants.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const METERING_CONCURRENCY = 3;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return cronJson({ error: "Storage metering is not configured." }, 503);
  }
  if (!validBearerToken(request.headers.get("authorization"), secret)) {
    return cronJson({ error: "Unauthorized." }, 401);
  }

  const r2 = readR2StorageConfig();
  if (!r2) {
    return cronJson(
      { metered: 0, failed: 0, skipped: "r2_not_configured" },
      503,
    );
  }

  let service: ReturnType<typeof createServiceClient>;
  try {
    service = createServiceClient();
  } catch {
    return cronJson({ error: "Storage metering database is not configured." }, 503);
  }
  const tenants = await loadUsageMeteringTenants(service);
  if (!tenants) {
    return cronJson({ error: "Unable to load tenants for metering." }, 500);
  }

  const capturedOn = new Date().toISOString().slice(0, 10);
  const deadlineAt = Date.now() + 270_000;
  const results = await mapWithConcurrency(
    tenants,
    METERING_CONCURRENCY,
    async (tenant): Promise<TenantMeteringResult> => {
      const meteringStartedAt = new Date().toISOString();
      const prefix = r2TenantPrefix(tenant.slug);
      if (!prefix) return { r2Metered: false, totalMetered: false, warningDelivered: false };
      const [r2Measurement, supabaseMeasurement] = await Promise.all([
        measureTenantR2Storage(r2, tenant.slug, { deadlineAt }),
        measureTenantSupabaseStorage(service, tenant.id),
      ]);
      if (!r2Measurement) {
        return { r2Metered: false, totalMetered: false, warningDelivered: false };
      }
      const r2Metered = await writeStorageUsageSnapshot(service, {
        tenantId: tenant.id,
        bytes: r2Measurement.bytes,
        objectCount: r2Measurement.objectCount,
        source: "cloudflare-r2-list-v2",
        capturedOn,
        metadata: {
          scope: "r2_only",
          prefix,
        },
      });
      if (!r2Metered || !supabaseMeasurement) {
        return { r2Metered, totalMetered: false, warningDelivered: false };
      }

      const combined = combineStorageMeasurements(
        supabaseMeasurement,
        r2Measurement,
        new Date().toISOString(),
      );
      if (!combined) {
        return { r2Metered, totalMetered: false, warningDelivered: false };
      }
      const totalMetered = await writeTenantStorageUsage(service, tenant.id, combined, {
        scope: "complete",
        r2Prefix: prefix,
        supabaseBuckets: supabaseMeasurement.buckets,
      });
      if (!totalMetered) {
        return { r2Metered, totalMetered: false, warningDelivered: false };
      }

      await reconcileStorageReservations(service, tenant.id, meteringStartedAt);
      const allowance = await loadTenantStorageAllowance(service, tenant.id);
      const limitBytes = allowance?.limitBytes ?? null;
      const state = storageQuotaState(combined.bytes, limitBytes);
      let warningDelivered = false;
      if (
        allowance &&
        limitBytes !== null &&
        limitBytes > 0 &&
        (state === "warning" || state === "exceeded")
      ) {
        const dedupeKey = storageWarningDedupeKey(allowance.planId, limitBytes);
        const percentage = Math.floor((combined.bytes / limitBytes) * 100);
        warningDelivered = await createAdminNotification(service, {
          tenantId: tenant.id,
          type: "storage.quota_warning",
          body: `Storage is at ${percentage}% (${formatStorageBytes(combined.bytes)} of ${formatStorageBytes(limitBytes)}). Review storage or upgrade your plan.`,
          link: `/admin/${tenant.slug}/settings/billing`,
          dedupeKey,
        });
      }
      return { r2Metered, totalMetered, warningDelivered };
    },
  );
  const metered = results.filter((result) => result.r2Metered).length;
  const failed = results.length - metered;
  const totalMetered = results.filter((result) => result.totalMetered).length;
  const warnings = results.filter((result) => result.warningDelivered).length;
  return cronJson({
    metered,
    failed,
    total_metered: totalMetered,
    total_failed: results.length - totalMetered,
    warnings,
  }, failed > 0 ? 500 : 200);
}

type TenantMeteringResult = {
  r2Metered: boolean;
  totalMetered: boolean;
  warningDelivered: boolean;
};

function cronJson(payload: unknown, status: number): Response {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function validBearerToken(header: string | null, secret: string): boolean {
  const actual = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}
