import type { TenantId } from "./tenant";

export type StockType = "New" | "Used";
export type VehicleStatus = "draft" | "live" | "sold" | "archived";

export type Vehicle = {
  id: string;
  tenantId: TenantId;
  externalId?: string;
  /** Stable VIN supplied by an inventory feed, when available. */
  feedVin?: string;
  /** Ordered supplier-hosted image URLs; separate from managed R2 images. */
  feedImageUrls?: string[];
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
  /** Managed vehicle_images primary image, preferred over legacy imagery. */
  primaryImageSrc?: string;
  /** Ordered tenant-owned R2 gallery URLs, kept separate from supplier feeds. */
  managedImageUrls?: string[];
  /** AI-generated description for the managed primary image. */
  primaryImageAlt?: string;
  sellerCity: string;
  sellerState: string;
  isSpecial: boolean;
  specialImageSrc?: string;
  status: VehicleStatus;
  soldAt: string | null;
  soldPrice: number | null;
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
  | "created_desc"
  | "price_asc"
  | "price_desc"
  | "year_desc"
  | "year_asc"
  | "mileage_asc"
  | "mileage_desc";

export type VehicleListResponse = {
  vehicles: Vehicle[];
  /** Present when the caller requested a count; later pages can reuse page 1. */
  totalCount?: number;
  hasMore: boolean;
  facets?: VehicleFacets;
};

export type VehicleFacets = {
  makes: string[];
  models: string[];
  states: string[];
  cities: string[];
  ranges?: {
    yearMin: number | null;
    yearMax: number | null;
    priceMin: number | null;
    priceMax: number | null;
    mileageMin: number | null;
    mileageMax: number | null;
  };
};

export type VehicleGalleryImage = {
  src: string;
  alt?: string;
  isPrimary: boolean;
  sortOrder: number;
};

export type VehicleDetailResponse = {
  vehicle: Vehicle;
  images: VehicleGalleryImage[];
};
