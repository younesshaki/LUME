"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, DollarSign, Trash2 } from "lucide-react";
import type { VehicleStatus } from "@lume/types";
import { toast } from "sonner";
import {
  normalizeBulkPriceRule,
  previewBulkVehiclePrices,
} from "@/lib/bulkVehicles";
import {
  VEHICLE_STATUSES,
  isVehicleStatusTransitionAllowed,
} from "@/lib/vehicleStatus";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  bulkDeleteVehicles,
  bulkSetVehicleStatus,
  bulkUpdateVehiclePrices,
  type BulkVehicleActionResult,
} from "./bulk-actions";

type SelectedVehicle = {
  id: string;
  price: number;
  status: VehicleStatus;
  sold_at: string | null;
};

type VehicleBulkToolbarProps = {
  tenantSlug: string;
  selectedRows: SelectedVehicle[];
  onCompleted: () => void;
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function VehicleBulkToolbar({
  tenantSlug,
  selectedRows,
  onCompleted,
}: VehicleBulkToolbarProps) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = React.useState<VehicleStatus>("live");
  const [priceOpen, setPriceOpen] = React.useState(false);
  const [priceKind, setPriceKind] = React.useState<"percent" | "fixed" | "set">("percent");
  const [priceValue, setPriceValue] = React.useState("5");
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const selectedIds = selectedRows.map((vehicle) => vehicle.id);
  const hasSoldSelection = selectedRows.some((vehicle) => vehicle.sold_at !== null);
  const canSetStatus = selectedRows.every((vehicle) => isVehicleStatusTransitionAllowed(
    vehicle.status,
    Boolean(vehicle.sold_at),
    nextStatus,
  ));
  const priceRule = normalizeBulkPriceRule(priceKind, Number(priceValue));
  const pricePreview = priceRule ? previewBulkVehiclePrices(selectedRows, priceRule) : null;

  const finish = (result: BulkVehicleActionResult, successMessage: string) => {
    if (result.error) {
      setActionError(result.error);
      return false;
    }
    setActionError(null);
    onCompleted();
    toast.success(successMessage);
    router.refresh();
    return true;
  };

  const updateStatus = (status: VehicleStatus, successMessage: string) => {
    setActionError(null);
    startTransition(async () => {
      finish(await bulkSetVehicleStatus(tenantSlug, selectedIds, status), successMessage);
    });
  };

  const updatePrices = () => {
    if (!priceRule || !pricePreview || pricePreview.error || hasSoldSelection) return;
    setActionError(null);
    startTransition(async () => {
      const result = await bulkUpdateVehiclePrices(
        tenantSlug,
        selectedIds,
        priceRule.kind,
        priceRule.value,
      );
      if (finish(
        result,
        `Updated ${selectedIds.length} vehicle price${selectedIds.length === 1 ? "" : "s"}.`,
      )) {
        setPriceOpen(false);
      }
    });
  };

  const deleteSelected = () => {
    setActionError(null);
    startTransition(async () => {
      finish(
        await bulkDeleteVehicles(tenantSlug, selectedIds),
        `Deleted ${selectedIds.length} vehicle${selectedIds.length === 1 ? "" : "s"}.`,
      );
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3">
        <span className="mr-auto text-sm font-medium" aria-live="polite">
          {selectedRows.length} selected on this page
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => updateStatus("archived", "Selected vehicles marked inactive.")}
        >
          <Archive aria-hidden="true" />
          Mark inactive
        </Button>
        <div className="flex items-center gap-1">
          <label htmlFor="bulk-vehicle-status" className="sr-only">Set selected status</label>
          <select
            id="bulk-vehicle-status"
            value={nextStatus}
            disabled={pending}
            onChange={(event) => setNextStatus(event.target.value as VehicleStatus)}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
          >
            {VEHICLE_STATUSES.map((status) => (
              <option
                key={status.value}
                value={status.value}
                disabled={selectedRows.some((vehicle) => !isVehicleStatusTransitionAllowed(
                  vehicle.status,
                  Boolean(vehicle.sold_at),
                  status.value,
                ))}
              >
                {status.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !canSetStatus}
            onClick={() => updateStatus(
              nextStatus,
              `Set ${selectedRows.length} vehicle status${selectedRows.length === 1 ? "" : "es"} to ${nextStatus}.`,
            )}
          >
            Apply
          </Button>
        </div>

        <Dialog open={priceOpen} onOpenChange={setPriceOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || hasSoldSelection}
              title={hasSoldSelection ? "Deselect sold vehicles to update prices" : undefined}
            >
              <DollarSign aria-hidden="true" />
              Update price
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bulk price update</DialogTitle>
              <DialogDescription>
                Preview and apply one price rule to the selected vehicles atomically.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Rule</span>
                <select
                  value={priceKind}
                  onChange={(event) => setPriceKind(
                    event.target.value as "percent" | "fixed" | "set",
                  )}
                  className="h-9 rounded-md border border-input bg-background px-3"
                >
                  <option value="percent">Percentage change</option>
                  <option value="fixed">Fixed amount change</option>
                  <option value="set">Set exact price</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">
                  {priceKind === "percent" ? "Percent" : "Amount (USD)"}
                </span>
                <input
                  type="number"
                  value={priceValue}
                  step={priceKind === "percent" ? "0.1" : "1"}
                  onChange={(event) => setPriceValue(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3"
                  aria-describedby="bulk-price-example"
                />
                <span id="bulk-price-example" className="text-xs text-muted-foreground">
                  {priceKind === "percent"
                    ? "Examples: 5 adds 5%; -5 subtracts 5%."
                    : priceKind === "fixed"
                      ? "Examples: 500 adds $500; -500 subtracts $500."
                      : "Every selected vehicle receives this exact price."}
                </span>
              </label>
              {pricePreview?.error ? (
                <p role="alert" className="text-sm text-destructive">{pricePreview.error}</p>
              ) : pricePreview ? (
                <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">{pricePreview.affected} rows affected</p>
                  <p className="mt-1 text-muted-foreground">
                    New range {formatCurrency(pricePreview.minimum)}–{formatCurrency(pricePreview.maximum)};
                    total {formatCurrency(pricePreview.totalBefore)} → {formatCurrency(pricePreview.totalAfter)}.
                  </p>
                </div>
              ) : (
                <p role="alert" className="text-sm text-destructive">
                  Enter a valid, non-zero price rule.
                </p>
              )}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending}>Cancel</Button>
              </DialogClose>
              <Button
                type="button"
                disabled={pending || !priceRule || Boolean(pricePreview?.error)}
                onClick={updatePrices}
              >
                {pending ? "Updating…" : `Update ${selectedRows.length} prices`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending || hasSoldSelection}
              title={hasSoldSelection ? "Sold vehicle history cannot be deleted" : undefined}
            >
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedRows.length} vehicles?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the selected unsold vehicles and cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                onClick={deleteSelected}
              >
                Delete vehicles
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {actionError ? <p role="alert" className="text-sm text-destructive">{actionError}</p> : null}
    </div>
  );
}

function formatCurrency(value: number): string {
  return CURRENCY_FORMATTER.format(value);
}
