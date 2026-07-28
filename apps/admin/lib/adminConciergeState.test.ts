import { describe, expect, it } from "vitest";
import {
  emptyAdminConciergeState,
  normalizeAdminConciergeState,
  resolveAdminPresentationRequest,
  resultSetState,
  selectAdminConciergeResult,
} from "./adminConciergeState";

const IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
] as const;
const NOW = Date.parse("2026-07-27T18:00:00.000Z");

describe("admin concierge result-set grounding", () => {
  it("opens ordinals only from the current verified ordered result set", () => {
    const state = resultSetState({ kind: "vehicles", orderedIds: [...IDS], totalCount: 9, href: "/admin/demo/vehicles?q=BMW" }, NOW);
    expect(resolveAdminPresentationRequest("open the second one", state)).toEqual({ kind: "open_result", id: IDS[1], resultKind: "vehicles" });
    expect(resolveAdminPresentationRequest("show me", state)).toEqual({ kind: "show_results", href: "/admin/demo/vehicles?q=BMW", totalCount: 9, resultKind: "vehicles" });
  });

  it("grounds lead ordinals exactly like vehicle ordinals", () => {
    const state = resultSetState({ kind: "leads", orderedIds: [...IDS], totalCount: 2, href: "/admin/demo/leads?status=new" }, NOW);
    expect(resolveAdminPresentationRequest("open the first lead", state)).toEqual({ kind: "open_result", id: IDS[0], resultKind: "leads" });
  });

  it("grounds customer ordinals only from the customer result set", () => {
    const state = resultSetState({ kind: "customers", orderedIds: [...IDS], totalCount: 2, href: "/admin/demo/customers?q=jane" }, NOW);
    expect(resolveAdminPresentationRequest("open the second customer", state)).toEqual({ kind: "open_result", id: IDS[1], resultKind: "customers" });
  });

  it("grounds page ordinals only from the page result set", () => {
    const state = resultSetState({ kind: "pages", orderedIds: [...IDS], totalCount: 2, href: "/admin/demo/pages" }, NOW);
    expect(resolveAdminPresentationRequest("open the first page", state)).toEqual({ kind: "open_result", id: IDS[0], resultKind: "pages" });
  });

  it("opens a deictic reference only after an explicit verified selection", () => {
    const state = resultSetState({ kind: "vehicles", orderedIds: [...IDS], totalCount: 2, href: "/admin/demo/vehicles?q=BMW" }, NOW);
    // A broad list does not imply that one item is selected.
    expect(resolveAdminPresentationRequest("open it", state)).toBeNull();

    const selected = selectAdminConciergeResult(state, IDS[1], "vehicles");
    expect(resolveAdminPresentationRequest("open it", selected)).toEqual({
      kind: "open_result",
      id: IDS[1],
      resultKind: "vehicles",
    });
    // An ID that was never server-issued cannot become the current selection.
    expect(selectAdminConciergeResult(state, "33333333-3333-4333-8333-333333333333", "vehicles")).toBe(state);
  });

  it("does not guess out-of-range, stale, forged, or feed-run ordinals", () => {
    const state = resultSetState({ kind: "feed_runs", orderedIds: [...IDS], totalCount: 2, href: "/admin/demo/settings/inventory-feeds" }, NOW);
    expect(resolveAdminPresentationRequest("open the first one", state)).toBeNull();
    expect(resolveAdminPresentationRequest("open the third one", state)).toBeNull();
    expect(normalizeAdminConciergeState({ lastResultSet: { kind: "vehicles", orderedIds: ["not-an-id"], totalCount: 1, href: "/admin/demo/vehicles", createdAt: new Date(NOW).toISOString() } }, NOW)).toEqual(emptyAdminConciergeState());
    expect(normalizeAdminConciergeState({ lastResultSet: { kind: "vehicles", orderedIds: [...IDS], totalCount: 2, href: "/admin/demo/vehicles", createdAt: new Date(NOW - 16 * 60 * 1_000).toISOString() } }, NOW)).toEqual(emptyAdminConciergeState());
  });
});
