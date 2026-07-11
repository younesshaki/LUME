import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";
import {
  accrueLoyaltyPoints,
  LOYALTY_EVENT_POINTS,
  pointsForLoyaltyEvent,
} from "./loyalty";

describe("loyalty accrual", () => {
  it("keeps the product event award schedule explicit", () => {
    expect(LOYALTY_EVENT_POINTS).toEqual({
      chat_session: 5,
      saved_vehicle: 10,
      submitted_lead: 50,
      referral: 100,
    });
    expect(pointsForLoyaltyEvent("submitted_lead")).toBe(50);
  });

  it("calls the atomic RPC and maps its result", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ applied: true, points_delta: 5, balance_after: 25, transaction_id: "tx-1" }],
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient<Database, "public">;

    await expect(accrueLoyaltyPoints(client, {
      tenantId: "tenant-1",
      visitorId: "visitor-1",
      eventType: "chat_session",
      idempotencyKey: "chat-session:session-1",
    })).resolves.toEqual({
      applied: true,
      pointsDelta: 5,
      balanceAfter: 25,
      transactionId: "tx-1",
    });

    expect(rpc).toHaveBeenCalledWith("accrue_loyalty_points", {
      p_tenant_id: "tenant-1",
      p_visitor_id: "visitor-1",
      p_event_type: "chat_session",
      p_idempotency_key: "chat-session:session-1",
      p_description: null,
      p_metadata: {},
    });
  });

  it("surfaces RPC failures", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "db down" } }),
    } as unknown as SupabaseClient<Database, "public">;

    await expect(accrueLoyaltyPoints(client, {
      tenantId: "tenant-1",
      visitorId: "visitor-1",
      eventType: "referral",
      idempotencyKey: "referral:abc",
    })).rejects.toThrow("db down");
  });
});
