import { describe, expect, it } from "vitest";
import { getTenantVehicle, queryTenantVehicles } from "./vehicleQuery";

/**
 * Chainable fake of the PostgREST query builder: records every filter call,
 * resolves like a promise. Lets us assert tenant scoping + VehicleQuery →
 * filter translation without a database.
 */
function fakeClient(rows: Array<Record<string, unknown>>, count = rows.length) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  const chain =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  for (const method of ["select", "eq", "ilike", "gte", "lte", "or", "order", "range"]) {
    builder[method] = chain(method);
  }
  builder.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows, count, error: null }).then(resolve);

  const client = { from: chain("from") };
  return { client: client as never, calls };
}

const vehicleRow = {
  id: "v1",
  tenant_id: "t1",
  external_id: null,
  stock_type: "Used",
  year: 2021,
  make: "Porsche",
  model: "911",
  trim: "Carrera",
  price: 120000,
  mileage: 8000,
  body_style: "Coupe",
  exterior_color: "Black",
  interior_color: "Red",
  drivetrain: "RWD",
  fuel_type: "Gas",
  image_src: "img",
  seller_city: "Monaco",
  seller_state: "MC",
  is_special: false,
  special_image_src: null,
  search_vector: null,
  status: "live",
  sold_at: null,
  sold_price: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

describe("queryTenantVehicles", () => {
  it("always scopes to the tenant and applies query filters", async () => {
    const { client, calls } = fakeClient([vehicleRow], 3);
    const result = await queryTenantVehicles(client, "t1", {
      make: "Porsche",
      priceMax: 150000,
      yearMin: 2020,
      sort: "price_asc",
      limit: 2,
    });

    expect(calls).toContainEqual(["eq", "tenant_id", "t1"]);
    expect(calls).toContainEqual(["eq", "status", "live"]);
    expect(calls).toContainEqual(["ilike", "make", "Porsche"]);
    expect(calls).toContainEqual(["lte", "price", 150000]);
    expect(calls).toContainEqual(["gte", "year", 2020]);
    expect(calls).toContainEqual(["order", "price", { ascending: true }]);
    expect(calls).toContainEqual(["range", 0, 1]);

    expect(result.totalCount).toBe(3);
    expect(result.hasMore).toBe(true);
    expect(result.vehicles[0]?.make).toBe("Porsche");
    expect(result.vehicles[0]?.status).toBe("live");
  });

  it("escapes LIKE wildcards in model terms", async () => {
    const { client, calls } = fakeClient([]);
    await queryTenantVehicles(client, "t1", { model: "10%_special" });
    expect(calls).toContainEqual(["ilike", "model", "%10\\%\\_special%"]);
  });

  it("clamps limit and defaults to recommended sort", async () => {
    const { client, calls } = fakeClient([]);
    await queryTenantVehicles(client, "t1", { limit: 500 });
    expect(calls).toContainEqual(["range", 0, 49]);
    expect(calls).toContainEqual(["order", "is_special", { ascending: false }]);
  });

  it("supports latest-listing order for new-arrival blocks", async () => {
    const { client, calls } = fakeClient([]);
    await queryTenantVehicles(client, "t1", { sort: "created_desc", limit: 6 });
    expect(calls).toContainEqual(["order", "created_at", { ascending: false }]);
  });
});

describe("getTenantVehicle", () => {
  it("scopes the lookup to tenant and id", async () => {
    const { client, calls } = fakeClient([vehicleRow]);
    const vehicle = await getTenantVehicle(client, "t1", "v1");
    expect(calls).toContainEqual(["eq", "tenant_id", "t1"]);
    expect(calls).toContainEqual(["eq", "id", "v1"]);
    expect(calls).toContainEqual(["eq", "status", "live"]);
    expect(vehicle?.id).toBe("v1");
  });
});
