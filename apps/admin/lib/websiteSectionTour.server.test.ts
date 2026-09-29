// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  persistWebsiteSectionTourDismissal,
  websiteSectionTourDismissalsFromPreference,
} from "./websiteSectionTour.server";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function clientFor({ current, readError = null, writeError = null }: {
  current: { website_section_tour_dismissals: Record<string, unknown> } | null;
  readError?: unknown;
  writeError?: unknown;
}) {
  const maybeSingle = vi.fn(async () => ({ data: current, error: readError }));
  const selectBuilder = { select: () => selectBuilder, eq: () => selectBuilder, maybeSingle };
  const upsert = vi.fn(async () => ({ error: writeError }));
  return {
    client: { from: vi.fn((table: string) => table === "tenant_member_preferences" ? { ...selectBuilder, upsert } : null) },
    upsert,
  };
}

describe("Website section tutorial persistence", () => {
  it("maps only valid existing route dismissals", () => {
    expect(websiteSectionTourDismissalsFromPreference(null)).toEqual({});
    expect(websiteSectionTourDismissalsFromPreference({
      website_section_tour_dismissals: { pages: "2026-09-29T12:00:00Z", other: "ignored" },
    })).toEqual({ pages: "2026-09-29T12:00:00Z" });
  });

  it("merges one route opt-out without overwriting an existing route or Hub fields", async () => {
    const { client, upsert } = clientFor({
      current: { website_section_tour_dismissals: { pages: "2026-09-29T12:00:00Z" } },
    });
    await expect(persistWebsiteSectionTourDismissal(client as never, {
      tenantId: TENANT_ID,
      userId: USER_ID,
      tourKey: "templates",
      at: "2026-09-29T13:00:00Z",
    })).resolves.toBe(true);
    expect(upsert).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      user_id: USER_ID,
      website_section_tour_dismissals: {
        pages: "2026-09-29T12:00:00Z",
        templates: "2026-09-29T13:00:00Z",
      },
    }, { onConflict: "tenant_id,user_id" });
  });

  it("fails closed when RLS-scoped read or write fails", async () => {
    const readFailure = clientFor({ current: null, readError: { message: "unavailable" } });
    await expect(persistWebsiteSectionTourDismissal(readFailure.client as never, {
      tenantId: TENANT_ID, userId: USER_ID, tourKey: "pages",
    })).resolves.toBe(false);
    expect(readFailure.upsert).not.toHaveBeenCalled();

    const writeFailure = clientFor({ current: null, writeError: { message: "unavailable" } });
    await expect(persistWebsiteSectionTourDismissal(writeFailure.client as never, {
      tenantId: TENANT_ID, userId: USER_ID, tourKey: "pages",
    })).resolves.toBe(false);
  });
});
