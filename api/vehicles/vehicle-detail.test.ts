// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const calls = {
  vehicleEq: [] as Array<[string, unknown]>,
  imageEq: [] as Array<[string, unknown]>,
  imageOrder: [] as Array<[string, unknown]>,
  imageClientKeys: [] as string[],
};

const vehicleRow = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "tenant-1",
  stock_type: "Used",
  year: 2022,
  make: "BMW",
  model: "X5",
  trim: "",
  price: 50000,
  mileage: 1000,
  body_style: "SUV",
  exterior_color: "Black",
  interior_color: "Black",
  drivetrain: "AWD",
  fuel_type: "Gasoline",
  image_src: "/legacy.webp",
  seller_city: "Denver",
  seller_state: "CO",
  is_special: false,
  special_image_src: null,
};

function thenable<T>(value: T) {
  return {
    then<TResult1 = T, TResult2 = never>(
      resolve?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, key: string) => ({
    rpc: vi.fn().mockResolvedValue({
      data: [{ id: "tenant-1", slug: "atelier", status: "active" }],
      error: null,
    }),
    from: (table: string) => {
      if (table === "vehicles") {
        const query = {
          select: () => query,
          eq: (column: string, value: unknown) => {
            calls.vehicleEq.push([column, value]);
            return query;
          },
          maybeSingle: vi.fn().mockResolvedValue({ data: vehicleRow, error: null }),
        };
        return query;
      }
      calls.imageClientKeys.push(key);
      const result = {
        data: [
          {
            vehicle_id: vehicleRow.id,
            r2_key: "tenant-1/vehicle/front.webp",
            is_primary: true,
            sort_order: 0,
            created_at: "2026-01-01T00:00:00Z",
            ai_description: "Front view",
          },
        ],
        error: null,
      };
      const query = Object.assign(thenable(result), {
        select: () => query,
        eq: (column: string, value: unknown) => {
          calls.imageEq.push([column, value]);
          return query;
        },
        order: (column: string, options: unknown) => {
          calls.imageOrder.push([column, options]);
          return query;
        },
      });
      return query;
    },
  }),
}));

afterEach(() => {
  calls.vehicleEq.length = 0;
  calls.imageEq.length = 0;
  calls.imageOrder.length = 0;
  calls.imageClientKeys.length = 0;
  vi.unstubAllEnvs();
});

describe("standalone public vehicle detail", () => {
  it("scopes the visible vehicle and ordered gallery to the resolved tenant", async () => {
    vi.stubEnv("SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://cdn.example");
    const { default: handler } = await import("./[id]");
    let status = 0;
    let payload: unknown;
    const response = {
      status(code: number) {
        status = code;
        return response;
      },
      setHeader: vi.fn(),
      json(value: unknown) {
        payload = value;
      },
      end: vi.fn(),
    };

    await handler(
      {
        method: "GET",
        headers: { "x-lume-tenant": "atelier" },
        query: { id: vehicleRow.id },
      },
      response,
    );

    expect(status).toBe(200);
    expect(calls.vehicleEq).toEqual([
      ["tenant_id", "tenant-1"],
      ["id", vehicleRow.id],
      ["status", "live"],
    ]);
    expect(calls.imageEq).toEqual([
      ["tenant_id", "tenant-1"],
      ["vehicle_id", vehicleRow.id],
    ]);
    expect(calls.imageClientKeys).toEqual(["service-role"]);
    expect(calls.imageOrder.map(([column]) => column)).toEqual([
      "is_primary",
      "sort_order",
      "created_at",
    ]);
    expect(payload).toMatchObject({
      vehicle: { id: vehicleRow.id, tenantId: "tenant-1" },
      images: [{ src: "https://cdn.example/tenant-1/vehicle/front.webp", isPrimary: true }],
    });
  });
});
