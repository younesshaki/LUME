"use client";
import { createContext, useContext } from "react";
import type { VehicleFacets } from "@lume/types";
export type QuickFilters = {
  make: string;
  model: string;
  stockType: string;
  priceMax: number;
};
export type VehicleServices = {
  loadVehicleFacets: (make: string, state: string) => Promise<VehicleFacets>;
  buildHref: (filters: QuickFilters) => string;
};
const Context = createContext<VehicleServices | null>(null);
export const VehicleServicesProvider = Context.Provider;
export function useVehicleServices() {
  const value = useContext(Context);
  if (!value) throw new Error("Vehicle services are required");
  return value;
}
