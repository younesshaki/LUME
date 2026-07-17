import { describe, expect, it, vi } from "vitest";
import { removeVehicleSaveForVisitor, saveVehicleForVisitor } from "./savedVehicles";

const tenantId = "11111111-1111-4111-8111-111111111111";
const visitorId = "22222222-2222-4222-8222-222222222222";
const vehicleId = "33333333-3333-4333-8333-333333333333";
const savedId = "44444444-4444-4444-8444-444444444444";
const eventId = "55555555-5555-4555-8555-555555555555";
const savedAt = "2026-01-01T00:00:00.000Z";

type DbClient = Parameters<typeof saveVehicleForVisitor>[0];

function mutationClient(result: {
  changed: boolean;
  saved_id: string | null;
  vehicle_id: string;
  saved_at: string | null;
  operational_event_id: string | null;
} | null, error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data: result ? [result] : null, error }));
  return { client: { rpc } as unknown as DbClient, rpc };
}

describe("saved vehicle persistence", () => {
  it("uses one tenant/visitor-scoped RPC for the first save and receives its operational event", async () => {
    const { client, rpc } = mutationClient({
      changed: true,
      saved_id: savedId,
      vehicle_id: vehicleId,
      saved_at: savedAt,
      operational_event_id: eventId,
    });

    await expect(saveVehicleForVisitor(client, { tenantId, visitorId, vehicleId })).resolves.toEqual({
      saved: { id: savedId, vehicleId, createdAt: savedAt },
      created: true,
      operationalEventId: eventId,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("mutate_visitor_saved_vehicle", {
      p_tenant_id: tenantId,
      p_visitor_id: visitorId,
      p_vehicle_id: vehicleId,
      p_operation: "save",
    });
  });

  it("reports a duplicate save without creating a new state transition", async () => {
    const { client } = mutationClient({
      changed: false,
      saved_id: savedId,
      vehicle_id: vehicleId,
      saved_at: savedAt,
      operational_event_id: null,
    });

    await expect(saveVehicleForVisitor(client, { tenantId, visitorId, vehicleId })).resolves.toMatchObject({
      created: false,
      operationalEventId: null,
    });
  });

  it("uses the same atomic RPC for a successful unsave", async () => {
    const { client, rpc } = mutationClient({
      changed: true,
      saved_id: savedId,
      vehicle_id: vehicleId,
      saved_at: savedAt,
      operational_event_id: eventId,
    });

    await expect(removeVehicleSaveForVisitor(client, { tenantId, visitorId, vehicleId })).resolves.toEqual({
      removed: true,
      operationalEventId: eventId,
    });
    expect(rpc).toHaveBeenCalledWith("mutate_visitor_saved_vehicle", {
      p_tenant_id: tenantId,
      p_visitor_id: visitorId,
      p_vehicle_id: vehicleId,
      p_operation: "unsave",
    });
  });

  it("keeps repeated unsaves idempotent with no operational event", async () => {
    const { client } = mutationClient({
      changed: false,
      saved_id: null,
      vehicle_id: vehicleId,
      saved_at: null,
      operational_event_id: null,
    });

    await expect(removeVehicleSaveForVisitor(client, { tenantId, visitorId, vehicleId })).resolves.toEqual({
      removed: false,
      operationalEventId: null,
    });
  });

  it("does not turn a failed mutation into a successful history result", async () => {
    const { client } = mutationClient(null, { message: "tenant relationship rejected" });
    await expect(removeVehicleSaveForVisitor(client, { tenantId, visitorId, vehicleId }))
      .rejects.toThrow("tenant relationship rejected");
  });
});
