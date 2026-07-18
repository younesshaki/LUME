import {
  INITIAL_VEHICLE_PAGE_SIZE,
  prefetchVehicleResults,
  type VehicleResults,
} from "./catalog";
import { readVehicleUrlState } from "./urlState";

/**
 * Warm the exact visible inventory page for a confirmed route intent. The
 * current URL state is used so a bookmarked filtered inventory is never
 * replaced by an unrelated default request.
 */
export function prefetchInitialVehicleResults(): Promise<VehicleResults> {
  const { filters, sort, page } = readVehicleUrlState();
  return prefetchVehicleResults(filters, sort, page, INITIAL_VEHICLE_PAGE_SIZE);
}
