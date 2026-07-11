import { timingSafeEqual } from "node:crypto";
import { writeStorageUsageSnapshot } from "@lume/db";
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
    async (tenant): Promise<boolean> => {
      const prefix = r2TenantPrefix(tenant.slug);
      if (!prefix) return false;
      const measurement = await measureTenantR2Storage(r2, tenant.slug, { deadlineAt });
      if (!measurement) return false;
      return writeStorageUsageSnapshot(service, {
        tenantId: tenant.id,
        bytes: measurement.bytes,
        objectCount: measurement.objectCount,
        source: "cloudflare-r2-list-v2",
        capturedOn,
        metadata: {
          scope: "r2_only",
          prefix,
        },
      });
    },
  );
  const metered = results.filter(Boolean).length;
  const failed = results.length - metered;
  return cronJson({ metered, failed }, failed > 0 ? 500 : 200);
}

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
