// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  persistWebsiteTourOutcome,
  websiteTourPreferenceFromRow,
} from "./websiteTour.server";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function clientFor({
  current,
  readError = null,
  writeError = null,
}: {
  current: {
    website_tour_version: number | null;
    website_tour_completed_at: string | null;
    website_tour_skipped_at: string | null;
  } | null;
  readError?: unknown;
  writeError?: unknown;
}) {
  const maybeSingle = vi.fn(async () => ({ data: current, error: readError }));
  const selectBuilder = {
    select: () => selectBuilder,
    eq: () => selectBuilder,
    maybeSingle,
  };
  const upsert = vi.fn(async () => ({ error: writeError }));
  return {
    client: { from: vi.fn((table: string) => table === "tenant_member_preferences"
      ? { ...selectBuilder, upsert }
      : null) },
    upsert,
  };
}

describe("Website Hub tour persistence", () => {
  it("maps a nullable database row into the client-safe preference shape", () => {
    expect(websiteTourPreferenceFromRow(null)).toBeNull();
    expect(websiteTourPreferenceFromRow({
      website_tour_version: 1,
      website_tour_completed_at: "2026-09-28T12:00:00Z",
      website_tour_skipped_at: null,
    })).toEqual({
      websiteTourVersion: 1,
      websiteTourCompletedAt: "2026-09-28T12:00:00Z",
      websiteTourSkippedAt: null,
    });
  });

  it("creates a terminal completion record without touching other preferences", async () => {
    const { client, upsert } = clientFor({ current: null });
    await expect(persistWebsiteTourOutcome(client as never, {
      tenantId: TENANT_ID,
      userId: USER_ID,
      outcome: "completed",
      at: "2026-09-28T12:00:00Z",
    })).resolves.toBe(true);
    expect(upsert).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      user_id: USER_ID,
      website_tour_version: 1,
      website_tour_completed_at: "2026-09-28T12:00:00Z",
      website_tour_skipped_at: null,
    }, { onConflict: "tenant_id,user_id" });
  });

  it("does not erase a previous completion if a replay is skipped", async () => {
    const { client, upsert } = clientFor({
      current: {
        website_tour_version: 1,
        website_tour_completed_at: "2026-09-28T12:00:00Z",
        website_tour_skipped_at: null,
      },
    });
    await persistWebsiteTourOutcome(client as never, {
      tenantId: TENANT_ID,
      userId: USER_ID,
      outcome: "skipped",
      at: "2026-09-28T13:00:00Z",
    });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      website_tour_completed_at: "2026-09-28T12:00:00Z",
      website_tour_skipped_at: "2026-09-28T13:00:00Z",
    }), expect.anything());
  });

  it("fails closed when the RLS-scoped read or write cannot complete", async () => {
    const readFailure = clientFor({ current: null, readError: { message: "unavailable" } });
    await expect(persistWebsiteTourOutcome(readFailure.client as never, {
      tenantId: TENANT_ID,
      userId: USER_ID,
      outcome: "completed",
    })).resolves.toBe(false);
    expect(readFailure.upsert).not.toHaveBeenCalled();

    const writeFailure = clientFor({ current: null, writeError: { message: "unavailable" } });
    await expect(persistWebsiteTourOutcome(writeFailure.client as never, {
      tenantId: TENANT_ID,
      userId: USER_ID,
      outcome: "completed",
    })).resolves.toBe(false);
  });
});
