import { describe, expect, it } from "vitest";
import type { BotNavigateBackAction } from "@lume/types";
import {
  InAppHistory,
  isSafeInAppPath,
  resolveBackNavigationTarget,
} from "./inAppHistory";

const RESULTS = "/vehicles?make=Porsche&sort=price_desc&limit=10";
const VDP = "/vehicles/2ae764bd-8de1-4866-86d7-e48fa3cb2b93";
const FALLBACK: NonNullable<BotNavigateBackAction["fallback"]> = {
  type: "filter_inventory",
  make: "Porsche",
};

function visit(history: InAppHistory, ...paths: string[]) {
  paths.forEach((path, index) => history.record({ key: `k${index}-${path}`, path }, "PUSH"));
}

describe("InAppHistory", () => {
  it("returns the previous in-app page after a normal transition", () => {
    const history = new InAppHistory();
    visit(history, "/home", "/contact");
    expect(history.previous()).toEqual({ path: "/home", index: 0 });
    expect(history.summary()).toEqual({ hasPrevious: true, hasResults: false });
  });

  it("finds the filtered results a vehicle was opened from", () => {
    const history = new InAppHistory();
    visit(history, "/home", RESULTS, VDP);
    expect(history.latestResults()).toEqual({ path: RESULTS, index: 1 });
    expect(history.summary()).toEqual({ hasPrevious: true, hasResults: true });
  });

  it("has nothing to go back to on a direct landing (e.g. from Google)", () => {
    const history = new InAppHistory();
    history.record({ key: "default", path: VDP }, "POP");
    expect(history.previous()).toBeNull();
    expect(history.latestResults()).toBeNull();
    expect(history.summary()).toEqual({ hasPrevious: false, hasResults: false });
  });

  it("matches browser back/forward to the entry it returned to", () => {
    const history = new InAppHistory();
    history.record({ key: "a", path: "/home" }, "PUSH");
    history.record({ key: "b", path: RESULTS }, "PUSH");
    history.record({ key: "c", path: VDP }, "PUSH");
    history.record({ key: "b", path: RESULTS }, "POP");
    expect(history.snapshot().map((entry) => entry.path)).toEqual(["/home", RESULTS]);
  });

  it("treats a reload (same page, fresh key) as the same entry", () => {
    const history = new InAppHistory([
      { key: "a", path: RESULTS },
      { key: "b", path: VDP },
    ]);
    history.record({ key: "default", path: VDP }, "POP");
    expect(history.previous()).toEqual({ path: RESULTS, index: 0 });
  });

  it("collapses the stack when the concierge returns, instead of stacking forever", () => {
    const history = new InAppHistory();
    visit(history, RESULTS, VDP);
    const previous = history.previous()!;
    history.markPendingBack(previous);
    history.record({ key: "new-key", path: RESULTS }, "PUSH");
    expect(history.snapshot().map((entry) => entry.path)).toEqual([RESULTS]);
    expect(history.previous()).toBeNull();
  });

  it("replaces the current entry on REPLACE navigation", () => {
    const history = new InAppHistory();
    visit(history, "/home");
    history.record({ key: "r", path: RESULTS }, "REPLACE");
    expect(history.snapshot().map((entry) => entry.path)).toEqual([RESULTS]);
  });

  it("never records or restores unsafe destinations", () => {
    const history = new InAppHistory([
      { key: "x", path: "https://evil.example/" },
      { key: "y", path: "//evil.example" },
      { key: "z", path: "/admin/demo" },
      { key: "ok", path: "/home" },
    ]);
    history.record({ key: "admin", path: "/admin/dashboard" }, "PUSH");
    expect(history.snapshot().map((entry) => entry.path)).toEqual(["/home"]);
  });
});

describe("isSafeInAppPath", () => {
  it.each(["/home", RESULTS, VDP, "/pages/about-us#team"])("accepts %s", (path) => {
    expect(isSafeInAppPath(path)).toBe(true);
  });
  it.each([
    "https://evil.example/",
    "//evil.example/x",
    "javascript:alert(1)",
    "/\\evil.example",
    "vehicles",
    "/admin",
    "/admin/demo/leads",
    "/page-preview",
    "",
    42,
  ])("rejects %s", (path) => {
    expect(isSafeInAppPath(path)).toBe(false);
  });
});

describe("resolveBackNavigationTarget", () => {
  it("prefers the in-app previous page", () => {
    const history = new InAppHistory();
    visit(history, "/home", "/contact");
    expect(
      resolveBackNavigationTarget(history, {
        type: "navigate-back",
        destination: "previous",
        fallback: FALLBACK,
      }),
    ).toEqual({ kind: "history", path: "/home", index: 0 });
  });

  it("results goes to the latest results page, skipping unrelated pages", () => {
    const history = new InAppHistory();
    visit(history, RESULTS, VDP, "/contact");
    expect(
      resolveBackNavigationTarget(history, { type: "navigate-back", destination: "results" }),
    ).toEqual({ kind: "history", path: RESULTS, index: 0 });
  });

  it("with no in-app history, uses the server's grounded results", () => {
    const history = new InAppHistory();
    history.record({ key: "default", path: VDP }, "POP");
    expect(
      resolveBackNavigationTarget(history, {
        type: "navigate-back",
        destination: "previous",
        fallback: FALLBACK,
      }),
    ).toEqual({ kind: "fallback", fallback: FALLBACK });
  });

  it("with neither, does nothing — it never falls through to browser history", () => {
    const history = new InAppHistory();
    history.record({ key: "default", path: VDP }, "POP");
    expect(
      resolveBackNavigationTarget(history, { type: "navigate-back", destination: "previous" }),
    ).toBeNull();
  });
});
