import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Car, Plus, Search, Upload } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import DeleteButton from "./DeleteButton";

type PageProps = {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ q?: string; sort?: string; dir?: string; page?: string }>;
};

const PAGE_SIZE = 25;

const SORTABLE: Record<string, string> = {
  year: "year",
  make: "make",
  model: "model",
  price: "price",
  mileage: "mileage",
};

export default async function VehiclesPage({ params, searchParams }: PageProps) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const sort = SORTABLE[sp.sort ?? ""] ? sp.sort! : "year";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);

  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  let query = supabase
    .from("vehicles")
    .select("id, year, make, model, trim, price, mileage, body_style, exterior_color, stock_type", {
      count: "exact",
    })
    .eq("tenant_id", tenant.id);

  if (q) {
    const term = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    query = query.or(`make.ilike.${term},model.ilike.${term},trim.ilike.${term}`);
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data: vehicles, count, error } = await query
    .order(SORTABLE[sort], { ascending: dir === "asc", nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const href = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { q, sort, dir, page, ...overrides };
    if (merged.q) params.set("q", String(merged.q));
    if (merged.sort && merged.sort !== "year") params.set("sort", String(merged.sort));
    if (merged.dir && merged.dir !== "desc") params.set("dir", String(merged.dir));
    if (merged.page && Number(merged.page) > 1) params.set("page", String(merged.page));
    const qs = params.toString();
    return `/admin/${slug}/vehicles${qs ? `?${qs}` : ""}`;
  };

  const sortHref = (column: string) =>
    href({ sort: column, dir: sort === column && dir === "desc" ? "asc" : "desc", page: 1 });

  const SortIcon = ({ column }: { column: string }) =>
    sort !== column ? (
      <ArrowUpDown className="size-3.5 text-muted-foreground/50" />
    ) : dir === "asc" ? (
      <ArrowUp className="size-3.5 text-primary" />
    ) : (
      <ArrowDown className="size-3.5 text-primary" />
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vehicles"
        description={
          error
            ? "Error loading vehicles"
            : `${totalCount.toLocaleString()} vehicle${totalCount === 1 ? "" : "s"} in inventory${q ? ` matching “${q}”` : ""}`
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/admin/${slug}/vehicles/import`}>
                <Upload />
                Import CSV
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/admin/${slug}/vehicles/new`}>
                <Plus />
                Add vehicle
              </Link>
            </Button>
          </>
        }
      />

      <form method="get" className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search make, model, trim…"
          className="pl-8"
        />
        {sort !== "year" && <input type="hidden" name="sort" value={sort} />}
        {dir !== "desc" && <input type="hidden" name="dir" value={dir} />}
      </form>

      {totalCount === 0 && !q && !error ? (
        <EmptyState
          icon={Car}
          title="No vehicles yet"
          description="Add vehicles one at a time, or import your whole inventory from a CSV file in one go."
          action={
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href={`/admin/${slug}/vehicles/import`}>
                  <Upload />
                  Import CSV
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/admin/${slug}/vehicles/new`}>
                  <Plus />
                  Add vehicle
                </Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                {(
                  [
                    ["year", "Year"],
                    ["make", "Make"],
                    ["model", "Model"],
                  ] as const
                ).map(([column, label]) => (
                  <TableHead key={column}>
                    <Link href={sortHref(column)} className="inline-flex items-center gap-1 hover:text-foreground">
                      {label}
                      <SortIcon column={column} />
                    </Link>
                  </TableHead>
                ))}
                <TableHead>Trim</TableHead>
                <TableHead className="text-right">
                  <Link href={sortHref("price")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Price
                    <SortIcon column="price" />
                  </Link>
                </TableHead>
                <TableHead>
                  <Link href={sortHref("mileage")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Mileage
                    <SortIcon column="mileage" />
                  </Link>
                </TableHead>
                <TableHead>Body</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {error && (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-destructive">
                    Failed to load vehicles
                  </TableCell>
                </TableRow>
              )}
              {!error && vehicles?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    No vehicles match “{q}”.{" "}
                    <Link href={href({ q: undefined, page: 1 })} className="underline underline-offset-2">
                      Clear search
                    </Link>
                  </TableCell>
                </TableRow>
              )}
              {vehicles?.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>{v.year}</TableCell>
                  <TableCell className="font-medium">{v.make}</TableCell>
                  <TableCell>{v.model}</TableCell>
                  <TableCell className="text-muted-foreground">{v.trim || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    ${v.price?.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {v.mileage !== null ? `${v.mileage.toLocaleString()} mi` : "—"}
                  </TableCell>
                  <TableCell>{v.body_style || "—"}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {v.exterior_color && (
                        <span
                          className="inline-block size-3 shrink-0 rounded-full border"
                          style={{ backgroundColor: colorToHex(v.exterior_color) }}
                          title={v.exterior_color}
                          aria-hidden="true"
                        />
                      )}
                      {v.exterior_color || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          href={`/admin/${slug}/vehicles/${v.id}`}
                          aria-label={`Edit ${v.year} ${v.make} ${v.model}`}
                        >
                          Edit
                        </Link>
                      </Button>
                      <DeleteButton
                        tenantId={tenant.id}
                        vehicleId={v.id}
                        vehicleLabel={`${v.year} ${v.make} ${v.model}`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {totalCount.toLocaleString()} vehicles
          </span>
          <div className="flex gap-2">
            {page <= 1 ? (
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <Link href={href({ page: page - 1 })}>Previous</Link>
              </Button>
            )}
            {page >= totalPages ? (
              <Button variant="outline" size="sm" disabled>
                Next
              </Button>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <Link href={href({ page: page + 1 })}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}
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
