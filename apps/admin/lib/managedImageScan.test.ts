import { describe, expect, it, vi } from "vitest";
import { collectManagedImageVehicleIds, type ManagedImagePage } from "./managedImageScan";

/** Build a fetcher that serves fixed pages, then optionally fails. */
function pager(pages: Array<Array<{ vehicle_id: string }>>, failAfter?: { code?: string }) {
  return vi.fn(async (from: number): Promise<ManagedImagePage> => {
    const index = from === 0 ? 0 : from / PAGE;
    if (index < pages.length) return { data: pages[index], error: null };
    return { data: null, error: failAfter ?? null };
  });
}

const PAGE = 2;
const full = (...ids: string[]) => ids.map((vehicle_id) => ({ vehicle_id }));

describe("collectManagedImageVehicleIds", () => {
  it("collects ids across every page", async () => {
    const fetchPage = pager([full("a", "b"), full("c", "d"), full("e")]);
    const scan = await collectManagedImageVehicleIds(fetchPage, PAGE);

    expect(scan.ok).toBe(true);
    expect(scan.ok && [...scan.vehicleIds].sort()).toEqual(["a", "b", "c", "d", "e"]);
    // Stops on the short page rather than probing one past the end.
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("fails the scan when a later page errors, rather than undercounting", async () => {
    // The regression this guards: page 1 succeeded, page 2 failed, and the old
    // `if (error) break` returned {a, b} as if that were the whole table. Every
    // vehicle on the unread pages would then be reported as having no photo.
    const scan = await collectManagedImageVehicleIds(
      pager([full("a", "b"), full("c", "d")], { code: "57014" }),
      PAGE,
    );

    expect(scan).toEqual({ ok: false });
  });

  it("treats an absent table as genuinely zero managed images", async () => {
    // 42P01 on the very first page: the deployment has no managed-image table,
    // so legacy image_src/special_image_src are the only sources and an empty
    // set is the truthful answer.
    const scan = await collectManagedImageVehicleIds(
      pager([], { code: "42P01" }),
      PAGE,
    );

    expect(scan.ok).toBe(true);
    expect(scan.ok && scan.vehicleIds.size).toBe(0);
  });

  it("keeps the pages it already read when the table vanishes mid-scan", async () => {
    // Contrived, but it pins the semantics: 42P01 means "no such table", so
    // whatever was already collected stays valid and the scan still succeeds.
    const scan = await collectManagedImageVehicleIds(
      pager([full("a", "b")], { code: "42P01" }),
      PAGE,
    );

    expect(scan.ok).toBe(true);
    expect(scan.ok && [...scan.vehicleIds]).toEqual(["a", "b"]);
  });

  it("fails on an error carrying no code at all", async () => {
    // A network-shaped failure has no `code`. It must not be mistaken for the
    // one tolerated case; anything unrecognised fails closed.
    const scan = await collectManagedImageVehicleIds(pager([], {}), PAGE);

    expect(scan).toEqual({ ok: false });
  });

  it("handles an empty table without a second request", async () => {
    const fetchPage = pager([[]]);
    const scan = await collectManagedImageVehicleIds(fetchPage, PAGE);

    expect(scan.ok).toBe(true);
    expect(scan.ok && scan.vehicleIds.size).toBe(0);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
