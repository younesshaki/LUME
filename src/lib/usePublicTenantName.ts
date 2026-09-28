import { useEffect, useState } from "react";
import {
  DEFAULT_PUBLIC_TENANT_SLUG,
  publicTenantSlug,
  resolvePublicTenant,
} from "@/lib/publicTenant";

/**
 * The public tenant's display name, or null until it resolves (or if it
 * cannot). For visitor-facing copy that must name the dealership rather than
 * LUME — the footer's ©, the vehicle page's browser-tab title.
 */
export function usePublicTenantName(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void resolvePublicTenant(publicTenantSlug)
      .then((tenant) => {
        if (!cancelled) setName(tenant?.name?.trim() || null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return name;
}

/** Browser-tab title for a vehicle page: the car, then the dealership's name. */
export function vehiclePageTitle(
  vehicle: { year: number; make: string; model: string },
  tenantName: string | null,
): string {
  const car = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
  return tenantName ? `${car} · ${tenantName}` : car;
}

/**
 * LUME's own site keeps its concept copy ("Marketplace Concept", "a demo
 * marketplace…"); a dealership's site must never show it. Returns the house
 * copy for the LUME house tenant, otherwise `tenantLabel` — usually the
 * dealership's name (or "" until it resolves), or dealer-neutral copy.
 */
export function houseOrTenantLabel(
  houseLabel: string,
  tenantLabel: string | null,
  slug: string = publicTenantSlug,
): string {
  return slug === DEFAULT_PUBLIC_TENANT_SLUG ? houseLabel : tenantLabel ?? "";
}
