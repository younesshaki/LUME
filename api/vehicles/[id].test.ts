import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The public vehicle-detail function returns the price-reduction signal with
 * the vehicle. The public site used to fetch it from
 * /api/vehicles/:id/price-signal, which only exists on the admin app, so
 * every production vehicle page logged a 404 and the signal never showed.
 */
const VEHICLE_ID = "98888c4f-f7ee-4ece-9d26-febefb66a12d";
const TENANT_ID = "00000000-0000-4000-8000-000000000001";

const state = vi.hoisted(() => ({
  priceSignal: { data: [{ enabled: true, reductions: 2 }], error: null } as {
    data: unknown;
    error: unknown;
  },
  priceSignalCalls: 0,
}));

vi.mock("@supabase/supabase-js", () => {
  function query(table: string) {
    const result =
      table === "vehicles"
        ? {
            data: {
              id: VEHICLE_ID, tenant_id: TENANT_ID, year: 2023, make: "Lamborghini", model: "Urus",
              trim: "Performante", price: 555500, mileage: 5123, status: "live", image_src: "",
            },
            error: null,
          }
        : { data: [], error: null };
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order"]) builder[method] = () => builder;
    builder.maybeSingle = async () => result;
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return builder;
  }
  return {
    createClient: () => ({
      from: query,
      rpc: async (name: string) => {
        if (name === "tenant_by_slug") {
          return { data: [{ id: TENANT_ID, slug: "demo", status: "active" }], error: null };
        }
        if (name === "get_public_vehicle_price_signal") {
          state.priceSignalCalls += 1;
          if (state.priceSignal.error === "throw") throw new Error("network");
          return state.priceSignal;
        }
        return { data: null, error: { message: `unexpected rpc ${name}` } };
      },
    }),
  };
});

import handler from "./[id]";

async function get(): Promise<{ status: number; body: any }> {
  let status = 0;
  let body: unknown;
  const res = {
    status(code: number) {
      status = code;
      return res;
    },
    setHeader: () => undefined,
    json(payload: unknown) {
      body = payload;
    },
    end: () => undefined,
  };
  await handler({ method: "GET", headers: {}, query: { id: VEHICLE_ID, tenant: "demo" } }, res);
  return { status, body };
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.stubEnv("ALLOWED_CHAT_ORIGINS", "");
  state.priceSignal = { data: [{ enabled: true, reductions: 2 }], error: null };
  state.priceSignalCalls = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/vehicles/:id price signal", () => {
  it("returns the signal alongside the vehicle", async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.vehicle.make).toBe("Lamborghini");
    expect(body.priceSignal).toEqual({ enabled: true, reductions: 2 });
    expect(state.priceSignalCalls).toBe(1);
  });

  it("hides the signal when the tenant has it off", async () => {
    state.priceSignal = { data: [{ enabled: false, reductions: 5 }], error: null };
    expect((await get()).body.priceSignal).toEqual({ enabled: false, reductions: 0 });
  });

  it("hides, never breaks, when the RPC errors or throws", async () => {
    state.priceSignal = { data: null, error: { message: "function does not exist" } };
    const errored = await get();
    expect(errored.status).toBe(200);
    expect(errored.body.priceSignal).toEqual({ enabled: false, reductions: 0 });

    state.priceSignal = { data: null, error: "throw" };
    const thrown = await get();
    expect(thrown.status).toBe(200);
    expect(thrown.body.priceSignal).toEqual({ enabled: false, reductions: 0 });
  });
});
