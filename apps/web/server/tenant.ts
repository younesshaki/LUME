import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveTenantRequest } from "./tenant-request.ts";
import { RejectedTenantRequest } from "./resolver-core.ts";

export const requestTenant = cache(
  async (selector: string | string[] | undefined) => {
    try {
      return await resolveTenantRequest(await headers(), selector);
    } catch (error) {
      if (error instanceof RejectedTenantRequest) notFound();
      throw error;
    }
  },
);
