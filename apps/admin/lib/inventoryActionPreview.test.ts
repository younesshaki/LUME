import { describe, expect, it } from "vitest";
import type { BotAction, Vehicle } from "@lume/types";
import { attachInventoryActionPreview } from "./inventoryActionPreview";

const expected = { type: "filter_inventory", make: "BMW", priceMax: 70_000 } as const;
const vehicles: Vehicle[] = Array.from({ length: 26 }, (_, index) => ({
  id: `vehicle-${index + 1}`,
  tenantId: "tenant-1",
  stockType: "Used",
  year: 2024,
  make: "BMW",
  model: "X5",
  trim: "xDrive",
  price: 60_000,
  mileage: 10_000,
  bodyStyle: "SUV",
  exteriorColor: "Black",
  interiorColor: "Black",
  drivetrain: "AWD",
  fuelType: "Gasoline",
  imageSrc: "/car.jpg",
  sellerCity: "Dublin",
  sellerState: "IE",
  isSpecial: false,
  status: "live",
  soldAt: null,
  soldPrice: null,
}));

describe("attachInventoryActionPreview", () => {
  it("attaches only the queried first page and never tenant/private fields", () => {
    const [action] = attachInventoryActionPreview([expected], expected, vehicles, 40);
    expect(action).toMatchObject({
      type: "filter_inventory",
      initialResults: { totalCount: 40, hasMore: true },
    });
    const preview = (action as Extract<BotAction, { type: "filter_inventory" }>).initialResults!;
    expect(preview.vehicles).toHaveLength(24);
    expect(preview.vehicles[0]).not.toHaveProperty("tenantId");
  });

  it("never attaches a result page to a different filter action", () => {
    const [action] = attachInventoryActionPreview(
      [{ type: "filter_inventory", make: "Porsche" }],
      expected,
      vehicles,
      2,
    );
    expect(action).not.toHaveProperty("initialResults");
  });

  it("honours a smaller ranked result set", () => {
    const [action] = attachInventoryActionPreview(
      [{ ...expected, limit: 10 }],
      { ...expected, limit: 10 },
      vehicles,
      10,
    );
    expect((action as Extract<BotAction, { type: "filter_inventory" }>).initialResults)
      .toMatchObject({ vehicles: expect.arrayContaining([expect.any(Object)]), hasMore: false });
    expect((action as Extract<BotAction, { type: "filter_inventory" }>).initialResults?.vehicles)
      .toHaveLength(10);
  });
});
