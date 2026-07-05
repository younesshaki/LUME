import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DeleteButton from "./DeleteButton";

type PageProps = { params: Promise<{ tenant: string }> };

export default async function VehiclesPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const { data: vehicles, error } = await supabase
    .from("vehicles")
    .select("id, year, make, model, trim, price, mileage, body_style, exterior_color, stock_type")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Vehicles</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {error
              ? "Error loading vehicles"
              : vehicles
                ? `${vehicles.length} vehicle${vehicles.length === 100 ? "+" : ""} in inventory`
                : "Loading…"}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/admin/${slug}/vehicles/import`}
            className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            Import CSV
          </Link>
          <Link
            href={`/admin/${slug}/vehicles/new`}
            className="rounded-lg bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:bg-neutral-700 transition-colors"
          >
            + Add Vehicle
          </Link>
        </div>
      </header>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
              <th className="text-left px-4 py-3 font-medium text-neutral-500">Year</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-500">Make</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-500">Model</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-500">Trim</th>
              <th className="text-right px-4 py-3 font-medium text-neutral-500">Price</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-500">Mileage</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-500">Body</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-500">Color</th>
              <th className="text-right px-4 py-3 font-medium text-neutral-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(!vehicles || vehicles.length === 0) && !error && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-neutral-500">
                  No vehicles yet.{" "}
                  <Link href={`/admin/${slug}/vehicles/new`} className="underline">
                    Add one
                  </Link>
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-red-500">
                  Failed to load vehicles
                </td>
              </tr>
            )}
            {vehicles?.map((v) => (
              <tr
                key={v.id}
                className="border-b border-neutral-100 dark:border-neutral-800 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-900/50"
              >
                <td className="px-4 py-3">{v.year}</td>
                <td className="px-4 py-3 font-medium">{v.make}</td>
                <td className="px-4 py-3">{v.model}</td>
                <td className="px-4 py-3 text-neutral-500">{v.trim}</td>
                <td className="px-4 py-3 text-right font-mono text-sm">
                  ${v.price?.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {v.mileage !== null ? `${v.mileage.toLocaleString()} mi` : "—"}
                </td>
                <td className="px-4 py-3">{v.body_style}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    {v.exterior_color && (
                      <span
                        className="inline-block w-3 h-3 rounded-full border border-neutral-300 shrink-0"
                        style={{ backgroundColor: colorToHex(v.exterior_color) }}
                        title={v.exterior_color}
                        aria-hidden="true"
                      />
                    )}
                    {v.exterior_color || "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/${slug}/vehicles/${v.id}`}
                      aria-label={`Edit ${v.year} ${v.make} ${v.model}`}
                      className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
                    >
                      Edit
                    </Link>
                    <DeleteButton tenantId={tenant.id} vehicleId={v.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function colorToHex(color: string): string {
  const map: Record<string, string> = {
    black: "#000000", white: "#ffffff", silver: "#c0c0c0", gray: "#808080", grey: "#808080",
    blue: "#0000ff", red: "#ff0000", green: "#008000", burgundy: "#800020",
    tan: "#d2b48c", brown: "#a52a2a", orange: "#ffa500", yellow: "#ffff00",
    purple: "#800080", gold: "#ffd700", beige: "#f5f5dc",
  };
  return map[color.toLowerCase()] || "#cccccc";
}
