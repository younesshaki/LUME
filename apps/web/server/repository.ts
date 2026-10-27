import "server-only";
import { databaseConfiguration } from "../config/environment.ts";
import type { TenantContext } from "@lume/types";

export type ActiveTenant = TenantContext & { name: string };
export type TenantRepository = {
  bySlug(slug: string): Promise<ActiveTenant | null>;
  verifiedDomain(
    host: string,
  ): Promise<{ tenantId: string; domain: string } | null>;
};

/** Only tenant identity and exact verified-domain metadata are read in Phase 1. */
export function tenantRepository(): TenantRepository {
  const config = databaseConfiguration(process.env);
  async function read<T>(
    path: string,
    body?: object,
    privileged = false,
  ): Promise<T> {
    const key = privileged ? config.domainKey : config.anon;
    if (!key)
      throw new Error("Staging domain lookup binding is not configured");
    const response = await fetch(`${config.url}/rest/v1/${path}`, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      method: body ? "POST" : "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error("Staging identity lookup unavailable");
    return response.json();
  }
  return {
    async bySlug(slug) {
      const rows = await read<
        { id: string; slug: string; name: string; status: string }[]
      >("rpc/tenant_by_slug", { p_slug: slug });
      const row = rows[0];
      return row && row.status === "active" && row.slug === slug
        ? { tenantId: row.id, slug: row.slug, name: row.name }
        : null;
    },
    async verifiedDomain(host) {
      if (!config.domainKey) return null;
      const rows = await read<{ tenant_id: string; domain: string }[]>(
        `tenant_domains?select=tenant_id,domain&domain=eq.${encodeURIComponent(host)}&verified=eq.true&verification_status=eq.verified&limit=2`,
        undefined,
        true,
      );
      return rows.length === 1 && rows[0].domain === host
        ? { tenantId: rows[0].tenant_id, domain: host }
        : null;
    },
  };
}
