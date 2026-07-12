import { timingSafeEqual } from "node:crypto";
import { claimTenantDomainsForVerification } from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { checkTenantDomainVerification } from "@/lib/domainVerification.server";
import { captureError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: "Domain verification cron is not configured." }, 503);
  if (!validBearerToken(request.headers.get("authorization"), secret)) {
    return json({ error: "Unauthorized." }, 401);
  }

  const service = createServiceClient();
  let domains: Awaited<ReturnType<typeof claimTenantDomainsForVerification>>;
  try {
    domains = await claimTenantDomainsForVerification(service, 50);
  } catch (error) {
    captureError("api/cron/domain-verification/claim", error);
    return json({ error: "Unable to claim domains." }, 500);
  }

  const origin = new URL(request.url).origin;
  const outcomes = await mapWithConcurrency(domains, 5, async (domain) => {
    try {
      return (await checkTenantDomainVerification(service, domain, origin)).status;
    } catch (error) {
      captureError("api/cron/domain-verification/check", error, {
        tenantId: domain.tenant_id,
        domainId: domain.id,
      });
      return "error" as const;
    }
  });
  const errors = outcomes.filter((status) => status === "error").length;
  const notConfigured = outcomes.filter((status) => status === "not_configured").length;
  return json({
    claimed: domains.length,
    verified: outcomes.filter((status) => status === "verified").length,
    pending: outcomes.filter((status) => status === "pending").length,
    failed: outcomes.filter((status) => status === "failed").length,
    errors,
    notConfigured,
  }, errors > 0 ? 500 : notConfigured > 0 ? 503 : 200);
}

function json(payload: unknown, status: number): Response {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
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
      const index = cursor++;
      results[index] = await mapper(values[index]);
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(concurrency, values.length) },
    () => worker(),
  ));
  return results;
}
