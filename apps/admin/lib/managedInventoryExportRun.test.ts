import { describe, expect, it } from "vitest";
import { createInventorySyndicationOutput, type InventorySyndicationProfile } from "@lume/db";
import type { Vehicle } from "@lume/types";
import { shouldSkipUnchangedManagedExport } from "./managedInventoryExportPolicy";

const vehicle: Vehicle = {
  id: "vehicle-1",
  tenantId: "tenant-1",
  stockType: "Used",
  year: 2026,
  make: "Toyota",
  model: "Camry",
  trim: "XSE",
  price: 38_288,
  mileage: 12,
  bodyStyle: "Sedan",
  exteriorColor: "White",
  interiorColor: "Black",
  drivetrain: "FWD",
  fuelType: "Hybrid",
  imageSrc: "https://supplier.example/camry.jpg",
  sellerCity: "Detroit",
  sellerState: "MI",
  isSpecial: false,
  status: "live",
  soldAt: null,
  soldPrice: null,
};

const profile: InventorySyndicationProfile = {
  format: "json",
  fields: [{ name: "stock", source: "stockNumber" }],
};

describe("managed export no-op policy", () => {
  it("delivers an unchanged catalog once after a destination configuration change", async () => {
    const output = await createInventorySyndicationOutput([vehicle], profile);

    expect(shouldSkipUnchangedManagedExport(output.semanticHash, output, 3, 3)).toBe(true);
    expect(shouldSkipUnchangedManagedExport(output.semanticHash, output, 4, 3)).toBe(false);
  });
});
