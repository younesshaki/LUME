import { cache } from "react";
import { notFound } from "next/navigation";
import { requestTenant } from "../../../server/tenant";
import { vehicleRepository, safeImage } from "../../../server/vehicles/data";
import {
  canonicalFor,
  priceLabel,
  vehiclePath,
  vehicleTitle,
} from "../../../server/vehicles/presentation";
import { comparisonIds } from "../../../components/concierge/conciergeActions";
import ChatLauncher from "../../../components/concierge/ChatLauncher";

export const dynamic = "force-dynamic";
type Search = { ids?: string | string[]; tenant?: string | string[] };
type Props = { searchParams: Promise<Search> };
const comparison = cache(
  async (ids: Search["ids"], selector: Search["tenant"]) => {
    if (typeof ids !== "string") notFound();
    const selected = comparisonIds(ids.split(","));
    if (!selected) notFound();
    const tenant = await requestTenant(selector);
    const repo = vehicleRepository();
    const details = await Promise.all(
      selected.map((id) => repo.detail(tenant.tenantId, id)),
    );
    if (details.some((v) => !v)) notFound();
    return { tenant, ids: selected, vehicles: details.map((d) => d!.vehicle) };
  },
);
export async function generateMetadata({ searchParams }: Props) {
  const search = await searchParams;
  const { tenant, ids } = await comparison(search.ids, search.tenant);
  return {
    title: `Compare vehicles | ${tenant.name}`,
    description: `Compare available vehicles at ${tenant.name}.`,
    alternates: {
      canonical: canonicalFor(tenant, `/vehicles/compare?ids=${ids.join(",")}`),
    },
    robots: { index: false, follow: false },
  };
}
export default async function Compare({ searchParams }: Props) {
  const search = await searchParams;
  const { tenant, vehicles } = await comparison(search.ids, search.tenant);
  const rows = [
    ["Price", vehicles.map((v) => (v.soldAt ? "Sold" : priceLabel(v.price)))],
    ["Availability", vehicles.map((v) => (v.soldAt ? "Sold" : "Available"))],
    [
      "Mileage",
      vehicles.map((v) =>
        v.mileage == null
          ? "Not provided"
          : `${v.mileage.toLocaleString("en-US")} miles`,
      ),
    ],
    ["Body style", vehicles.map((v) => v.bodyStyle || "Not provided")],
    ["Fuel", vehicles.map((v) => v.fuelType || "Not provided")],
    ["Drivetrain", vehicles.map((v) => v.drivetrain || "Not provided")],
  ] as const;
  return (
    <main className="vehicle-page">
      <p className="preview-banner">Staging preview · noindex</p>
      <h1>Compare vehicles</h1>
      <a href={`/vehicles?tenant=${encodeURIComponent(tenant.slug)}`}>
        Browse inventory
      </a>
      <div style={{ overflowX: "auto" }}>
        <table>
          <caption>Side-by-side vehicle specifications</caption>
          <thead>
            <tr>
              <th scope="col">Specification</th>
              {vehicles.map((v) => (
                <th scope="col" key={v.id}>
                  <a href={vehiclePath(v.id, tenant.slug)}>{vehicleTitle(v)}</a>
                  {safeImage(v.primaryImageSrc) || safeImage(v.imageSrc) ? (
                    <img
                      src={
                        safeImage(v.primaryImageSrc) ?? safeImage(v.imageSrc)
                      }
                      alt={vehicleTitle(v)}
                      width={240}
                      height={160}
                    />
                  ) : (
                    <p>Photos coming soon</p>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, values]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                {values.map((value, i) => (
                  <td key={vehicles[i].id}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ChatLauncher tenant={tenant.slug} title={`${tenant.name} comparison`} />
    </main>
  );
}
