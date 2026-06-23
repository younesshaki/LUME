import type { Vehicle, VehicleListResponse, VehicleQuery } from "@lume/types";

/** Build a Vehicle with sensible defaults; override only what a test cares about. */
export function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: overrides.id ?? "veh-1",
    tenantId: overrides.tenantId ?? "tenant-1",
    stockType: overrides.stockType ?? "Used",
    year: overrides.year ?? 2022,
    make: overrides.make ?? "Porsche",
    model: overrides.model ?? "911",
    trim: overrides.trim ?? "Carrera",
    price: overrides.price ?? 100_000,
    mileage: overrides.mileage ?? 20_000,
    bodyStyle: overrides.bodyStyle ?? "Coupe",
    exteriorColor: overrides.exteriorColor ?? "Black",
    interiorColor: overrides.interiorColor ?? "Tan",
    drivetrain: overrides.drivetrain ?? "RWD",
    fuelType: overrides.fuelType ?? "Gas",
    imageSrc: overrides.imageSrc ?? "https://cdn.test/veh-1.jpg",
    sellerCity: overrides.sellerCity ?? "Miami",
    sellerState: overrides.sellerState ?? "FL",
    isSpecial: overrides.isSpecial ?? false,
    ...overrides,
  };
}

/** A fake queryVehicles that echoes a fixed list and records the query it saw. */
export function fakeQueryVehicles(vehicles: Vehicle[]): {
  fn: (query: VehicleQuery) => Promise<VehicleListResponse>;
  calls: VehicleQuery[];
} {
  const calls: VehicleQuery[] = [];
  const fn = async (query: VehicleQuery): Promise<VehicleListResponse> => {
    calls.push(query);
    const limit = query.limit ?? vehicles.length;
    const sliced = vehicles.slice(0, limit);
    return {
      vehicles: sliced,
      totalCount: vehicles.length,
      hasMore: vehicles.length > sliced.length,
    };
  };
  return { fn, calls };
}
