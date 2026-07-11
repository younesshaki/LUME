"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
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

type SortableColumn = "year" | "make" | "model" | "price" | "mileage";

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
};

type VehiclesTableClientProps = {
  tenantId: string;
  tenantSlug: string;
  vehicles: VehicleTableRow[];
  query: string;
  errorMessage: string | null;
  clearSearchHref: string;
  sort: string;
  direction: "asc" | "desc";
  sortHrefs: Record<SortableColumn, string>;
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
  query,
  errorMessage,
  clearSearchHref,
  sort,
  direction,
  sortHrefs,
}: VehiclesTableClientProps) {
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
  const clearSelection = React.useCallback(() => setSelected(new Set()), []);

  return (
    <div className="space-y-3">
      {selectedRows.length > 0 ? (
        <VehicleBulkToolbar
          tenantSlug={tenantSlug}
          selectedRows={selectedRows}
          onCompleted={clearSelection}
        />
      ) : null}

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
                      onCheckedChange={(checked) => {
                        setSelected((current) => {
                          const next = new Set(current);
                          if (checked === true) next.add(vehicle.id);
                          else next.delete(vehicle.id);
                          return next;
                        });
                      }}
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
    </div>
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
