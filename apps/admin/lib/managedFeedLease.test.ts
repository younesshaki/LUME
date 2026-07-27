import { describe, expect, it } from "vitest";
import {
  assertManagedFeedLeaseActive,
  ManagedFeedLeaseLostError,
} from "./managedFeedLease";

describe("managed inventory feed lease guard", () => {
  it("allows an active signal and stops work after a lost lease", () => {
    const controller = new AbortController();
    expect(() => assertManagedFeedLeaseActive(controller.signal)).not.toThrow();

    controller.abort(new Error("lease moved to a newer worker"));
    expect(() => assertManagedFeedLeaseActive(controller.signal)).toThrow(
      /lease moved to a newer worker/i,
    );
    expect(() => assertManagedFeedLeaseActive(controller.signal)).toThrow(ManagedFeedLeaseLostError);
  });
});
