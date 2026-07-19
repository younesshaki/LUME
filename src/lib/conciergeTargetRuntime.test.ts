import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BotNavigateTargetAction } from "@lume/types";
import {
  activatePendingConciergeTarget,
  queueConciergeTargetAction,
  registerConciergeTargetHandler,
  resolveConciergeTargetAction,
  watchPendingConciergeTarget,
} from "./conciergeTargetRuntime";

function action(
  overrides: Partial<BotNavigateTargetAction> = {},
): BotNavigateTargetAction {
  return {
    type: "navigate-target",
    targetKey: "vehicle-inquiry",
    params: { vehicleId: "ABC 123" },
    target: {
      key: "vehicle-inquiry",
      label: "Vehicle inquiry",
      kind: "modal",
      destination: "/vehicles/:vehicleId#vehicle-inquiry",
      isConversion: true,
    },
    ...overrides,
  };
}

describe("concierge target runtime", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/home");
  });

  it("interpolates grounded params and resolves a typed public route", () => {
    expect(resolveConciergeTargetAction(action())).toMatchObject({
      path: "/vehicles/ABC%20123",
      route: { route: "vehicleDetail", vehicleId: "ABC 123" },
      handlerId: "vehicle-inquiry",
    });
  });

  it("resolves a trusted products target to the public products route", () => {
    expect(
      resolveConciergeTargetAction({
        type: "navigate-target",
        targetKey: "products",
        target: {
          key: "products",
          label: "Products page",
          kind: "route",
          destination: "/products",
          isConversion: false,
        },
      }),
    ).toMatchObject({
      path: "/products",
      route: { route: "products" },
      handlerId: null,
    });
  });

  it("rejects missing params, forged descriptors, and unsafe destinations", () => {
    expect(resolveConciergeTargetAction(action({ params: {} }))).toBeNull();
    expect(
      resolveConciergeTargetAction(action({ params: { vehicleId: ".." } })),
    ).toBeNull();
    expect(
      resolveConciergeTargetAction(
        action({
          targetKey: "inventory",
        }),
      ),
    ).toBeNull();
    expect(
      resolveConciergeTargetAction(
        action({
          target: {
            key: "vehicle-inquiry",
            label: "Unsafe",
            kind: "modal",
            destination: "/admin#open",
            isConversion: true,
          },
        }),
      ),
    ).toBeNull();
    expect(
      resolveConciergeTargetAction(
        action({
          target: {
            key: "vehicle-inquiry",
            label: "Encoded traversal",
            kind: "modal",
            destination: "/%2e%2e/admin#vehicle-inquiry",
            isConversion: true,
          },
        }),
      ),
    ).toBeNull();
  });

  it("keeps a cross-route modal pending until its handler mounts", () => {
    const handler = vi.fn();
    queueConciergeTargetAction(action());
    expect(activatePendingConciergeTarget("/home")).toBe(false);

    window.history.replaceState({}, "", "/vehicles/ABC%20123");
    const unregister = registerConciergeTargetHandler("vehicle-inquiry", handler);
    expect(handler).toHaveBeenCalledWith(action());
    expect(activatePendingConciergeTarget("/vehicles/ABC%20123")).toBe(false);
    unregister();
  });

  it("activates a plain anchor after a lazy route mounts it", async () => {
    const scrollIntoView = vi.fn();
    queueConciergeTargetAction({
      type: "navigate-target",
      targetKey: "finance",
      target: {
        key: "finance",
        label: "Finance",
        kind: "section-anchor",
        destination: "/finance#finance-calculator",
        isConversion: false,
      },
    });
    window.history.replaceState({}, "", "/finance");
    const stop = watchPendingConciergeTarget("/finance");
    const section = document.createElement("section");
    section.id = "finance-calculator";
    section.scrollIntoView = scrollIntoView;
    document.body.append(section);

    await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(activatePendingConciergeTarget("/finance")).toBe(false);
    section.remove();
    stop();
  });
});
