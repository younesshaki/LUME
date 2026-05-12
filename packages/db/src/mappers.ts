/**
 * Map between snake_case DB rows and the camelCase domain types in @lume/types.
 * Centralized here so consumers don't reinvent this everywhere.
 */
import type { RagChunk, Tenant, Vehicle } from "@lume/types";
import type { Database } from "./schema";

type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];
type VehicleRow = Database["public"]["Tables"]["vehicles"]["Row"];
type RagChunkRow = Database["public"]["Tables"]["rag_chunks"]["Row"];

export function rowToTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function rowToVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    stockType: row.stock_type ?? "",
    year: row.year,
    make: row.make,
    model: row.model,
    trim: row.trim,
    price: row.price,
    mileage: row.mileage,
    bodyStyle: row.body_style,
    exteriorColor: row.exterior_color,
    interiorColor: row.interior_color,
    drivetrain: row.drivetrain,
    fuelType: row.fuel_type,
    imageSrc: row.image_src,
    sellerCity: row.seller_city,
    sellerState: row.seller_state,
    isSpecial: row.is_special,
    specialImageSrc: row.special_image_src ?? undefined,
  };
}

export function rowToRagChunk(row: RagChunkRow): RagChunk {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    documentId: row.document_id,
    text: row.text,
    category: row.category,
    embedding: row.embedding ?? undefined,
  };
}
