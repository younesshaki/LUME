import { describe, expect, it } from "vitest";
import { removeVehicleSaveForVisitor, saveVehicleForVisitor } from "./savedVehicles";

const tenantId = "11111111-1111-4111-8111-111111111111";
const visitorId = "22222222-2222-4222-8222-222222222222";
const vehicleId = "33333333-3333-4333-8333-333333333333";
const saved = { id: "44444444-4444-4444-8444-444444444444", vehicle_id: vehicleId, created_at: "2026-01-01T00:00:00.000Z" };

type Call = { operation: "upsert" | "select" | "delete"; filters: Array<[string, string]>; payload?: Record<string, string> };

function savedVehiclesClient(insertData: typeof saved | null) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      expect(table).toBe("visitor_saved_vehicles");
      const filters: Array<[string, string]> = [];
      const query = {
        select() { calls.push({ operation: "select", filters }); return query; },
        eq(column: string, value: string) { filters.push([column, value]); return query; },
        maybeSingle: async () => ({ data: insertData ?? saved, error: null }),
        delete() { calls.push({ operation: "delete", filters }); return query; },
        upsert(payload: Record<string, string>) {
          calls.push({ operation: "upsert", payload, filters: [...filters] });
          return {
            select() {
              return { maybeSingle: async () => ({ data: insertData, error: null }) };
            },
          };
        },
      };
      return query;
    },
  };
  return { client: client as Parameters<typeof saveVehicleForVisitor>[0], calls };
}

describe("saved vehicle persistence", () => {
  it("creates a tenant-scoped save once", async () => {
    const { client, calls } = savedVehiclesClient(saved);
    await expect(saveVehicleForVisitor(client, { tenantId, visitorId, vehicleId })).resolves.toEqual({
      saved: { id: saved.id, vehicleId, createdAt: saved.created_at }, created: true,
    });
    expect(calls[0]).toMatchObject({ operation: "upsert", payload: { tenant_id: tenantId, visitor_id: visitorId, vehicle_id: vehicleId } });
  });

  it("treats a concurrent duplicate as an existing tenant/visitor-scoped save", async () => {
    const { client, calls } = savedVehiclesClient(null);
    await expect(saveVehicleForVisitor(client, { tenantId, visitorId, vehicleId })).resolves.toMatchObject({ created: false });
    expect(calls.find((call) => call.operation === "select")?.filters).toEqual([
      ["tenant_id", tenantId], ["visitor_id", visitorId], ["vehicle_id", vehicleId],
    ]);
  });

  it("deletes only the resolved tenant visitor vehicle tuple", async () => {
    const { client, calls } = savedVehiclesClient(saved);
    await expect(removeVehicleSaveForVisitor(client, { tenantId, visitorId, vehicleId })).resolves.toBeUndefined();
    expect(calls.find((call) => call.operation === "delete")?.filters).toEqual([
      ["tenant_id", tenantId], ["visitor_id", visitorId], ["vehicle_id", vehicleId],
    ]);
  });
});
