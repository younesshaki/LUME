"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Car } from "lucide-react";
import type { VehicleStatus } from "@lume/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import DeleteButton from "./DeleteButton";
import { VehicleBulkToolbar } from "./VehicleBulkToolbar";
import { FilterScopeBulkBar } from "./FilterScopeBulkBar";
import type { InventoryFilterInput } from "./bulk-actions";

type SortableColumn = "year" | "make" | "model" | "price" | "mileage";

export type InventoryView = "table" | "grid";

export type VehicleTableRow = {
  id: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  mileage: number | null;
  body_style: string;
  exterior_color: string;
  status: VehicleStatus;
  sold_at: string | null;
  stock_type: string | null;
  external_id: string | null;
};

type VehiclesTableClientProps = {
  tenantId: string;
  tenantSlug: string;
  vehicles: VehicleTableRow[];
  /** vehicle id → resolved thumbnail URL (managed R2 wins; null = placeholder). */
  thumbnails: Record<string, string | null>;
  view: InventoryView;
  query: string;
  errorMessage: string | null;
  clearSearchHref: string;
  sort: string;
  direction: "asc" | "desc";
  sortHrefs: Record<SortableColumn, string>;
  /** Total rows matching the current filter, across every page. */
  totalCount: number;
  /** The filter itself, so bulk actions can act beyond this page. */
  filter: InventoryFilterInput;
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const COLOR_HEX: Record<string, string> = {
  black: "#000000", white: "#ffffff", silver: "#c0c0c0", gray: "#808080",
  grey: "#808080", blue: "#0000ff", red: "#ff0000", green: "#008000",
  burgundy: "#800020", tan: "#d2b48c", brown: "#a52a2a", orange: "#ffa500",
  yellow: "#ffff00", purple: "#800080", gold: "#ffd700", beige: "#f5f5dc",
};

export function VehiclesTableClient({
  tenantId,
  tenantSlug,
  vehicles,
  thumbnails,
  view,
  query,
  errorMessage,
  clearSearchHref,
  sort,
  direction,
  sortHrefs,
  totalCount,
  filter,
}: VehiclesTableClientProps) {
  // Selection is page-scoped and shared by both views: switching layout or
  // changing filters/pages prunes ids that are no longer on screen.
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const availableIds = React.useMemo(() => new Set(vehicles.map((vehicle) => vehicle.id)), [vehicles]);

  React.useEffect(() => {
    setSelected((current) => new Set([...current].filter((id) => availableIds.has(id))));
  }, [availableIds]);

  const selectedRows = React.useMemo(
    () => vehicles.filter((vehicle) => selected.has(vehicle.id)),
    [selected, vehicles],
  );
  const allSelected = vehicles.length > 0 && selectedRows.length === vehicles.length;
  // "Select all N matching" is a mode, not a list of ids: past the page size
  // the ids would exceed MAX_BULK_VEHICLES and any sane request payload.
  const [filterScope, setFilterScope] = React.useState(false);
  const clearSelection = React.useCallback(() => {
    setSelected(new Set());
    setFilterScope(false);
  }, []);

  // Leaving the page, or changing filters, drops the whole-filter mode too.
  React.useEffect(() => {
    setFilterScope(false);
  }, [availableIds, totalCount]);
  const toggleOne = React.useCallback((vehicleId: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(vehicleId);
      else next.delete(vehicleId);
      return next;
    });
  }, []);

  return (
    <div className="space-y-3">
      {filterScope ? (
        <FilterScopeBulkBar
          tenantSlug={tenantSlug}
          filter={filter}
          matchingCount={totalCount}
          onClear={clearSelection}
        />
      ) : selectedRows.length > 0 ? (
        <>
          <VehicleBulkToolbar
            tenantSlug={tenantSlug}
            selectedRows={selectedRows}
            onCompleted={clearSelection}
          />
          {allSelected && totalCount > vehicles.length ? (
            <p className="text-sm text-muted-foreground">
              All {vehicles.length} on this page are selected.{" "}
              <button
                type="button"
                onClick={() => setFilterScope(true)}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Select all {totalCount.toLocaleString()} matching this filter
              </button>
            </p>
          ) : null}
        </>
      ) : null}

      {view === "grid" ? (
        <VehiclesGrid
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          vehicles={vehicles}
          thumbnails={thumbnails}
          query={query}
          errorMessage={errorMessage}
          clearSearchHref={clearSearchHref}
          selected={selected}
          allSelected={allSelected}
          selectedCount={selectedRows.length}
          onToggleOne={toggleOne}
          onToggleAll={(checked) =>
            setSelected(checked ? new Set(vehicles.map((vehicle) => vehicle.id)) : new Set())
          }
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : selectedRows.length > 0 ? "indeterminate" : false}
                    onCheckedChange={(checked) => {
                      setSelected(checked === true ? new Set(vehicles.map((vehicle) => vehicle.id)) : new Set());
                    }}
                    aria-label="Select all vehicles on this page"
                    disabled={vehicles.length === 0 || Boolean(errorMessage)}
                  />
                </TableHead>
                {(["year", "make", "model"] as const).map((column) => (
                  <SortableHead
                    key={column}
                    column={column}
                    label={column.charAt(0).toUpperCase() + column.slice(1)}
                    href={sortHrefs[column]}
                    sort={sort}
                    direction={direction}
                  />
                ))}
                <TableHead>Trim</TableHead>
                <SortableHead
                  column="price"
                  label="Price"
                  href={sortHrefs.price}
                  sort={sort}
                  direction={direction}
                  className="text-right"
                />
                <SortableHead
                  column="mileage"
                  label="Mileage"
                  href={sortHrefs.mileage}
                  sort={sort}
                  direction={direction}
                />
                <TableHead>Body</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errorMessage ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-24 text-center text-destructive">
                    {errorMessage}
                  </TableCell>
                </TableRow>
              ) : vehicles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
                    No vehicles match “{query}”.{" "}
                    <Link href={clearSearchHref} className="underline underline-offset-2">
                      Clear search
                    </Link>
                  </TableCell>
                </TableRow>
              ) : (
                vehicles.map((vehicle) => (
                  <TableRow key={vehicle.id} data-state={selected.has(vehicle.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(vehicle.id)}
                        onCheckedChange={(checked) => toggleOne(vehicle.id, checked === true)}
                        aria-label={`Select ${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                      />
                    </TableCell>
                    <TableCell>{vehicle.year}</TableCell>
                    <TableCell className="font-medium">{vehicle.make}</TableCell>
                    <TableCell>{vehicle.model}</TableCell>
                    <TableCell className="text-muted-foreground">{vehicle.trim || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(vehicle.price)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {vehicle.mileage !== null ? `${vehicle.mileage.toLocaleString()} mi` : "—"}
                    </TableCell>
                    <TableCell>{vehicle.body_style || "—"}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {vehicle.exterior_color ? (
                          <span
                            className="inline-block size-3 shrink-0 rounded-full border"
                            style={{ backgroundColor: colorToHex(vehicle.exterior_color) }}
                            title={vehicle.exterior_color}
                            aria-hidden="true"
                          />
                        ) : null}
                        {vehicle.exterior_color || "—"}
                      </span>
                    </TableCell>
                    <TableCell><StatusBadge status={vehicle.status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            href={`/admin/${tenantSlug}/vehicles/${vehicle.id}`}
                            aria-label={`Edit ${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                          >
                            Edit
                          </Link>
                        </Button>
                        {vehicle.sold_at ? null : (
                          <DeleteButton
                            tenantId={tenantId}
                            vehicleId={vehicle.id}
                            vehicleLabel={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function VehiclesGrid({
  tenantId,
  tenantSlug,
  vehicles,
  thumbnails,
  query,
  errorMessage,
  clearSearchHref,
  selected,
  allSelected,
  selectedCount,
  onToggleOne,
  onToggleAll,
}: {
  tenantId: string;
  tenantSlug: string;
  vehicles: VehicleTableRow[];
  thumbnails: Record<string, string | null>;
  query: string;
  errorMessage: string | null;
  clearSearchHref: string;
  selected: Set<string>;
  allSelected: boolean;
  selectedCount: number;
  onToggleOne: (vehicleId: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  if (errorMessage) {
    return (
      <div className="rounded-xl border p-10 text-center text-destructive">{errorMessage}</div>
    );
  }
  if (vehicles.length === 0) {
    return (
      <div className="rounded-xl border p-10 text-center text-muted-foreground">
        No vehicles match “{query}”.{" "}
        <Link href={clearSearchHref} className="underline underline-offset-2">
          Clear search
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
        <Checkbox
          checked={allSelected ? true : selectedCount > 0 ? "indeterminate" : false}
          onCheckedChange={(checked) => onToggleAll(checked === true)}
          aria-label="Select all vehicles on this page"
        />
        Select all on this page
      </label>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" role="list">
        {vehicles.map((vehicle) => (
          <VehicleGridCard
            key={vehicle.id}
            tenantId={tenantId}
            tenantSlug={tenantSlug}
            vehicle={vehicle}
            thumbnail={thumbnails[vehicle.id] ?? null}
            selected={selected.has(vehicle.id)}
            onToggle={(checked) => onToggleOne(vehicle.id, checked)}
          />
        ))}
      </ul>
    </div>
  );
}

function VehicleGridCard({
  tenantId,
  tenantSlug,
  vehicle,
  thumbnail,
  selected,
  onToggle,
}: {
  tenantId: string;
  tenantSlug: string;
  vehicle: VehicleTableRow;
  thumbnail: string | null;
  selected: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

  return (
    <li
      className={`overflow-hidden rounded-xl border bg-card transition-colors ${
        selected ? "border-primary ring-2 ring-primary/15" : ""
      }`}
      data-state={selected ? "selected" : undefined}
    >
      <div className="relative aspect-[4/3] bg-muted">
        <VehicleThumbnail key={thumbnail ?? "no-photo"} src={thumbnail} title={title} />
        <span className="absolute left-2 top-2 rounded-md bg-background/90 p-1 shadow-sm">
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onToggle(checked === true)}
            aria-label={`Select ${title}`}
          />
        </span>
        <span className="absolute right-2 top-2">
          <StatusBadge status={vehicle.status} />
        </span>
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[vehicle.trim, vehicle.body_style].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <p className="shrink-0 font-mono text-sm font-medium">{formatCurrency(vehicle.price)}</p>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{vehicle.mileage !== null ? `${vehicle.mileage.toLocaleString()} mi` : "— mi"}</span>
          {vehicle.exterior_color ? (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 shrink-0 rounded-full border"
                style={{ backgroundColor: colorToHex(vehicle.exterior_color) }}
                aria-hidden="true"
              />
              {vehicle.exterior_color}
            </span>
          ) : null}
          {vehicle.stock_type ? <span>{vehicle.stock_type}</span> : null}
          {vehicle.external_id ? <span title="External ID">#{vehicle.external_id}</span> : null}
        </p>
        <div className="flex items-center justify-end gap-1 border-t pt-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/admin/${tenantSlug}/vehicles/${vehicle.id}`} aria-label={`Edit ${title}`}>
              Edit
            </Link>
          </Button>
          {vehicle.sold_at ? null : (
            <DeleteButton tenantId={tenantId} vehicleId={vehicle.id} vehicleLabel={title} />
          )}
        </div>
      </div>
    </li>
  );
}

function VehicleThumbnail({ src, title }: { src: string | null; title: string }) {
  // This component is keyed by URL at the call site. If a broken feed image
  // is later replaced by a managed image during router.refresh(), React
  // remounts it and clears this failure state immediately.
  const [failed, setFailed] = React.useState(false);
  if (!src || failed) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
        <Car className="size-8" aria-hidden="true" />
        <span className="text-xs">No photo</span>
      </div>
    );
  }

  return (
    // Feed thumbnails may come from arbitrary dealer CDNs. A native image
    // avoids weakening next/image with a wildcard remote-host policy.
    <img
      src={src}
      alt={title}
      loading="lazy"
      decoding="async"
      className="absolute inset-0 size-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function SortableHead({
  column,
  label,
  href,
  sort,
  direction,
  className,
}: {
  column: SortableColumn;
  label: string;
  href: string;
  sort: string;
  direction: "asc" | "desc";
  className?: string;
}) {
  const Icon = sort !== column ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <Link href={href} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        <Icon
          className={sort === column ? "size-3.5 text-primary" : "size-3.5 text-muted-foreground/50"}
          aria-hidden="true"
        />
      </Link>
    </TableHead>
  );
}

function formatCurrency(value: number): string {
  return CURRENCY_FORMATTER.format(value);
}

function colorToHex(color: string): string {
  return COLOR_HEX[color.toLowerCase()] ?? "#cccccc";
}
