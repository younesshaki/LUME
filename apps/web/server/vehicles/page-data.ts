import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requestTenant } from "../tenant.ts";
import { vehicleRepository } from "./data.ts";

export const vehiclePage = cache(
  async (id: string, selector: string | string[] | undefined) => {
    const tenant = await requestTenant(selector);
    const detail = await vehicleRepository().detail(tenant.tenantId, id);
    if (!detail) notFound();
    return { tenant, ...detail };
  },
);
