import type { VehicleStatus } from "@lume/types";

export type VehicleStatusFilter = "active" | VehicleStatus | "all";

export const VEHICLE_STATUS_FILTERS: ReadonlyArray<{
  value: VehicleStatusFilter;
  label: string;
}> = [
  { value: "active", label: "Current" },
  { value: "draft", label: "Draft" },
  { value: "live", label: "Live" },
  { value: "sold", label: "Sold" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

export const VEHICLE_STATUSES: ReadonlyArray<{ value: VehicleStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "live", label: "Live" },
  { value: "sold", label: "Sold" },
  { value: "archived", label: "Archived" },
];

const FILTER_VALUES = new Set(VEHICLE_STATUS_FILTERS.map((filter) => filter.value));

export function normalizeVehicleStatusFilter(value: string | null | undefined): VehicleStatusFilter {
  return value && FILTER_VALUES.has(value as VehicleStatusFilter)
    ? (value as VehicleStatusFilter)
    : "active";
}

export function vehicleStatusFilterLabel(filter: VehicleStatusFilter): string {
  return VEHICLE_STATUS_FILTERS.find((option) => option.value === filter)?.label ?? "Current";
}

export function isVehicleStatusTransitionAllowed(
  current: VehicleStatus,
  hasRecordedSale: boolean,
  next: VehicleStatus,
): boolean {
  if (!hasRecordedSale) return true;
  if (current === "sold") return next === "sold" || next === "archived";
  if (current === "archived") return next === "archived";
  return false;
}
