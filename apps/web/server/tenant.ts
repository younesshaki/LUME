import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { tenantRepository } from "./repository";
import {
  hostname,
  resolveTenant,
  RejectedTenantRequest,
} from "./resolver-core";

export const requestTenant = cache(
  async (selector: string | string[] | undefined) => {
    const h = await headers();
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
    try {
      return await resolveTenant(
        {
          host: h.get("host") ?? "",
          forwardedHost: h.get("x-forwarded-host"),
          internalSelector: h.get("x-lume-tenant") ?? h.get("x-web-tenant"),
          selector,
        },
        config,
        tenantRepository(),
      );
    } catch (error) {
      if (error instanceof RejectedTenantRequest) notFound();
      throw error;
    }
  },
);
