import type { Vehicle } from "@lume/types";
export function vehicleTitle(
  v: Pick<Vehicle, "year" | "make" | "model" | "trim">,
) {
  return [v.year, v.make, v.model].filter(Boolean).join(" ");
}
export function priceLabel(price: number) {
  return Number.isFinite(price) && price > 0
    ? `Est. $${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : "Contact for price";
}
export function vehiclePath(id: string, slug: string) {
  return `/vehicles/${encodeURIComponent(id)}?tenant=${encodeURIComponent(slug)}`;
}
export function canonicalFor(
  tenant: { canonical: string; source: string; slug: string },
  path: string,
) {
  const url = new URL(path, tenant.canonical);
  if (tenant.source === "preview") url.searchParams.set("tenant", tenant.slug);
  return url.href;
}
