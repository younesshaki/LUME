"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { VEHICLE_STATUSES } from "@/lib/vehicleStatus";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  bulkSetVehicleStatusForFilter,
  type InventoryFilterInput,
} from "./bulk-actions";

/**
 * Acts on every vehicle matching the current filter, not just the 25 on this
 * page. The filter travels to the server instead of thousands of ids, which is
 * the only shape that scales past MAX_BULK_VEHICLES.
 *
 * Status only, deliberately: price and delete stay on the explicit checkbox
 * selection, because an accidental whole-filter delete is unrecoverable.
 */
export function FilterScopeBulkBar({
  tenantSlug,
  filter,
  matchingCount,
  onClear,
}: {
  tenantSlug: string;
  filter: InventoryFilterInput;
  matchingCount: number;
  onClear: () => void;
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState<string>("archived");
  const [confirming, setConfirming] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const statusLabel =
    VEHICLE_STATUSES.find((option) => option.value === status)?.label ?? status;

  const onConfirm = () => {
    startTransition(async () => {
      const result = await bulkSetVehicleStatusForFilter(tenantSlug, filter, status);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const affected = result.affected ?? 0;
      const skipped = result.skipped ?? 0;
      toast.success(
        `Set ${affected.toLocaleString()} ${affected === 1 ? "vehicle" : "vehicles"} to ${statusLabel}.` +
          (skipped > 0 ? ` ${skipped.toLocaleString()} sold skipped.` : ""),
      );
      setConfirming(false);
      onClear();
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
      <span className="text-sm">
        All <strong>{matchingCount.toLocaleString()}</strong> vehicles matching this
        filter are selected.
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="filter-scope-status">
          Status to apply
        </label>
        <select
          id="filter-scope-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          disabled={pending}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          {VEHICLE_STATUSES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={() => setConfirming(true)} disabled={pending}>
          Apply to all {matchingCount.toLocaleString()}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClear} disabled={pending}>
          Clear
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Set {matchingCount.toLocaleString()} vehicles to {statusLabel}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This applies to every vehicle matching the current filter across all
              pages — not just the 25 shown. Sold vehicles are skipped where the
              change is not allowed. Status changes are reversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                onConfirm();
              }}
              disabled={pending}
            >
              {pending ? "Applying…" : `Apply to all ${matchingCount.toLocaleString()}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
