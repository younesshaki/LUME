"use client";
import { useMemo } from "react";
import type { VehicleFacets } from "@lume/types";
import { VehicleQuickSearch } from "@lume/blocks/react/VehicleQuickSearch";
import {
  VehicleServicesProvider,
  type VehicleServices,
} from "@lume/blocks/react/VehicleServices";
export default function QuickSearch({
  tenant,
  initialFacets,
  className,
  buttonLabel,
  defaultBudget,
  showCondition,
}: {
  tenant: string;
  initialFacets: VehicleFacets;
  className: string;
  buttonLabel: string;
  defaultBudget?: number;
  showCondition?: boolean;
}) {
  const services = useMemo<VehicleServices>(
    () => ({
      async loadVehicleFacets(make, state) {
        const p = new URLSearchParams({ tenant, make, sellerState: state });
        const r = await fetch(`/api/vehicles/facets?${p}`, {
          cache: "no-store",
        });
        if (!r.ok) throw new Error("Vehicle filters unavailable");
        return r.json();
      },
      buildHref(filters) {
        const p = new URLSearchParams({ tenant });
        for (const [key, value] of Object.entries(filters))
          if (value) p.set(key, String(value));
        return `/vehicles?${p}`;
      },
    }),
    [tenant],
  );
  return (
    <VehicleServicesProvider value={services}>
      <VehicleQuickSearch
        className={className}
        buttonLabel={buttonLabel}
        defaultBudget={defaultBudget}
        showCondition={showCondition}
        initialFacets={initialFacets}
      />
    </VehicleServicesProvider>
  );
}
