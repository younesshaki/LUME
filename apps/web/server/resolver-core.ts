import type { ActiveTenant, TenantRepository } from "./repository";

const reserved = new Set(["www", "app", "api", "admin", "static", "cdn"]);
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export class RejectedTenantRequest extends Error {}
function reject(): never {
  throw new RejectedTenantRequest("Unknown or conflicting tenant request");
}

export function hostname(raw: string): string {
  // One DNS host or loopback; never lists, userinfo, schemes, paths or IPv6.
  if (!/^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(raw)) reject();
  const port = raw.match(/:(\d+)$/)?.[1];
  if (port && (Number(port) < 1 || Number(port) > 65535)) reject();
  const value = raw.replace(/:\d+$/, "").replace(/\.$/, "").toLowerCase();
  if (
    value.length > 253 ||
    value
      .split(".")
      .some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
  )
    reject();
  return value;
}
export type ResolverConfig = {
  previewHosts: string[];
  customHosts: Record<string, string>;
  rootDomain?: string;
  defaultTenant?: string;
};
export type ResolvedTenant = ActiveTenant & {
  canonical: string;
  source: "preview" | "subdomain" | "custom-domain";
};

export async function resolveTenant(
  input: {
    host: string;
    forwardedHost?: string | null;
    internalSelector?: string | null;
    selector?: string | string[];
  },
  config: ResolverConfig,
  repository: TenantRepository,
): Promise<ResolvedTenant> {
  const host = hostname(input.host);
  if (input.internalSelector !== null && input.internalSelector !== undefined)
    reject();
  // Do not trust forwarded host as identity, even if a proxy supplied it.
  if (input.forwardedHost && hostname(input.forwardedHost) !== host) reject();
  if (Array.isArray(input.selector)) reject();
  if (
    input.selector !== undefined &&
    (!slugPattern.test(input.selector) || reserved.has(input.selector))
  )
    reject();

  let slug: string | undefined;
  let source: ResolvedTenant["source"];
  let canonicalOrigin: string;
  let domainTenantId: string | undefined;
  if (config.customHosts[host]) {
    const mapping = await repository.verifiedDomain(host);
    if (!mapping) reject();
    slug = config.customHosts[host];
    domainTenantId = mapping.tenantId;
    source = "custom-domain";
    canonicalOrigin = `https://${mapping.domain}`;
  } else if (config.rootDomain && host.endsWith(`.${config.rootDomain}`)) {
    slug = host.slice(0, -(config.rootDomain.length + 1));
    if (!slugPattern.test(slug) || reserved.has(slug)) reject();
    source = "subdomain";
    canonicalOrigin = `https://${slug}.${config.rootDomain}`;
  } else if (config.previewHosts.includes(host)) {
    slug = input.selector ?? config.defaultTenant;
    source = "preview";
    const local = host === "127.0.0.1" || host === "localhost";
    const port = input.host.match(/:(\d+)$/)?.[1];
    canonicalOrigin = `${local ? "http" : "https"}://${host}${local && port ? `:${port}` : ""}`;
  } else reject();
  if (!slug || !slugPattern.test(slug) || reserved.has(slug)) reject();
  if (input.selector !== undefined && slug !== input.selector) reject();
  const tenant = await repository.bySlug(slug);
  if (!tenant || (domainTenantId && tenant.tenantId !== domainTenantId))
    reject();
  const canonical = new URL("/preview", canonicalOrigin);
  if (source === "preview") canonical.searchParams.set("tenant", tenant.slug);
  return Object.freeze({ ...tenant, canonical: canonical.href, source });
}
