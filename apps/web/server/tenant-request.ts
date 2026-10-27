import "server-only";
import { tenantRepository } from "./repository.ts";
import {
  hostname,
  resolveTenant,
  RejectedTenantRequest,
} from "./resolver-core.ts";

export async function resolveTenantRequest(
  h: Headers,
  selector?: string | string[],
  publicApi = false,
) {
  const env = process.env;
  const hosts = (env.WEB_PREVIEW_HOSTS ?? "")
    .split(",")
    .filter(Boolean)
    .map(hostname);
  if (env.VERCEL_ENV === "preview" && env.VERCEL_URL)
    hosts.push(hostname(env.VERCEL_URL));
  if (!env.VERCEL) hosts.push("localhost", "127.0.0.1");
  const customHosts: Record<string, string> = JSON.parse(
    env.WEB_PREVIEW_CUSTOM_HOSTS ?? "{}",
  );
  const config = {
    previewHosts: hosts,
    customHosts,
    rootDomain: env.WEB_PREVIEW_ROOT_DOMAIN
      ? hostname(env.WEB_PREVIEW_ROOT_DOMAIN)
      : undefined,
    defaultTenant: env.WEB_PREVIEW_DEFAULT_TENANT,
  };
  if (h.has("x-web-tenant"))
    throw new RejectedTenantRequest("Internal selector forbidden");
  return resolveTenant(
    {
      host: h.get("host") ?? "",
      forwardedHost: h.get("x-forwarded-host"),
      internalSelector: publicApi ? null : h.get("x-lume-tenant"),
      selector,
    },
    config,
    tenantRepository(),
  );
}
