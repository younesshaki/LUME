import { VehicleQuickSearch as SharedSearch } from "@lume/blocks/react/VehicleQuickSearch";
import { VehicleServicesProvider } from "@lume/blocks/react/VehicleServices";
import {
  DEFAULT_FILTERS,
  loadVehicleFacets,
} from "@/experience/vehicles/catalog";
import { encodeVehicleUrlState } from "@/experience/vehicles/urlState";
const services = {
  loadVehicleFacets,
  buildHref: (filters: Partial<Parameters<typeof encodeVehicleUrlState>[0]>) =>
    `/vehicles${encodeVehicleUrlState({ ...DEFAULT_FILTERS, ...filters }, "recommended", 1)}`,
};
export function VehicleQuickSearch(props: Parameters<typeof SharedSearch>[0]) {
  return (
    <VehicleServicesProvider value={services}>
      <SharedSearch {...props} />
    </VehicleServicesProvider>
  );
}
