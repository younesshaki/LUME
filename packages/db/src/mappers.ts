/**
 * Map between snake_case DB rows and the camelCase domain types in @lume/types.
 * Centralized here so consumers don't reinvent this everywhere.
 */
import type { Lead, LeadSourceContext, RagChunk, Tenant, Vehicle } from "@lume/types";
import type { Database } from "./schema";

type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];
type VehicleRow = Database["public"]["Tables"]["vehicles"]["Row"];
type RagChunkRow = Database["public"]["Tables"]["rag_chunks"]["Row"];
type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

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
    externalId: row.external_id ?? undefined,
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
    status: row.status,
    soldAt: row.sold_at,
    soldPrice: row.sold_price,
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

export function rowToLead(row: LeadRow): Lead {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    source: row.source,
    status: row.status,
    assignedTo: row.assigned_to,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    vehicleId: row.vehicle_id,
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    utmContent: row.utm_content,
    referrer: row.referrer,
    sourceContext: rowToLeadSourceContext(row.source_context),
    ipAddr: row.ip_addr,
    userAgent: row.user_agent,
    lostReason: row.lost_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToLeadSourceContext(value: Record<string, unknown> | null): LeadSourceContext | null {
  if (value?.trigger !== "bot-action") return null;
  if (value.actionType !== "capture_lead" && value.actionType !== "open-lead-form") return null;
  return {
    trigger: "bot-action",
    actionType: value.actionType,
    ...(typeof value.vehicleId === "string" ? { vehicleId: value.vehicleId } : {}),
  };
}
