import type { TenantId } from "./tenant";

export type StockType = "New" | "Used";

export type Vehicle = {
  id: string;
  tenantId: TenantId;
  externalId?: string;
  stockType: StockType | string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  mileage: number | null;
  bodyStyle: string;
  exteriorColor: string;
  interiorColor: string;
  drivetrain: string;
  fuelType: string;
  imageSrc: string;
  sellerCity: string;
  sellerState: string;
  isSpecial: boolean;
  specialImageSrc?: string;
};

export type VehicleQuery = {
  query?: string;
  stockType?: string;
  make?: string;
  model?: string;
  bodyStyle?: string;
  fuelType?: string;
  drivetrain?: string;
  sellerState?: string;
  sellerCity?: string;
  yearMin?: number;
  yearMax?: number;
  mileageMax?: number;
  priceMin?: number;
  priceMax?: number;
  sort?: VehicleSort;
  limit?: number;
  offset?: number;
};

export type VehicleSort =
  | "recommended"
  | "price_asc"
  | "price_desc"
  | "year_desc"
  | "year_asc"
  | "mileage_asc"
  | "mileage_desc";

export type VehicleListResponse = {
  vehicles: Vehicle[];
  totalCount: number;
  hasMore: boolean;
  facets?: VehicleFacets;
};

export type VehicleFacets = {
  makes: string[];
  models: string[];
  states: string[];
  cities: string[];
};
