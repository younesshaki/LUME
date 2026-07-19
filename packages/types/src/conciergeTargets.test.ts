import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONCIERGE_TARGETS,
  mergeConciergeTargets,
  validateConciergeTargetDestination,
  validateConciergeTargetInput,
} from "./conciergeTargets";

describe("concierge target registry", () => {
  it("ships valid, distinct built-in routes and conversion surfaces", () => {
    const targets = mergeConciergeTargets([]);
    expect(targets).toHaveLength(DEFAULT_CONCIERGE_TARGETS.length);
    expect(new Set(targets.map((target) => target.key)).size).toBe(targets.length);
    expect(targets.find((target) => target.key === "inventory")).toMatchObject({
      destination: "/vehicles",
      isConversion: false,
    });
    expect(targets.find((target) => target.key === "products")).toMatchObject({
      destination: "/products",
      isConversion: false,
    });
    expect(targets.find((target) => target.key === "contact-lead-form")).toMatchObject({
      destination: "/contact#concierge-lead-form",
      isConversion: true,
    });
    for (const key of ["home", "products", "inventory", "showcase", "account"]) {
      expect(targets.find((target) => target.key === key)?.enabled).toBe(true);
    }
    expect(targets.find((target) => target.key === "vehicle-inquiry")).toMatchObject({
      destination: "/vehicles/:vehicleId#vehicle-inquiry",
      isConversion: true,
    });
  });

  it("merges a tenant override without mutating another built-in", () => {
    const targets = mergeConciergeTargets([
      {
        key: "inventory",
        enabled: false,
        aiDescription: "Use only for explicit browsing requests.",
      },
    ]);
    expect(targets.find((target) => target.key === "inventory")).toMatchObject({
      enabled: false,
      aiDescription: "Use only for explicit browsing requests.",
      builtIn: true,
    });
    expect(targets.find((target) => target.key === "vehicle-detail")?.enabled).toBe(true);
  });

  it("accepts a validated custom target and rejects unsafe public destinations", () => {
    expect(
      validateConciergeTargetInput({
        key: "trade-in",
        label: "Trade-in form",
        kind: "form",
        destination: "/trade-in#trade-in-form",
        aiDescription: "Use when a visitor wants a trade valuation.",
        enabled: true,
        isConversion: true,
        examplePrompts: ["What is my car worth?"],
        sortOrder: 50,
      }),
    ).toMatchObject({ ok: true });

    expect(validateConciergeTargetDestination("route", "https://evil.example")).toMatch(
      /root-relative/,
    );
    expect(validateConciergeTargetDestination("route", "/admin/demo")).toMatch(
      /public website/,
    );
    expect(validateConciergeTargetDestination("route", "/%2e%2e/admin")).toMatch(
      /canonical root-relative/,
    );
    expect(validateConciergeTargetDestination("route", "/vehicles/../admin")).toMatch(
      /canonical root-relative/,
    );
    expect(validateConciergeTargetDestination("route", "/vehicles/./featured")).toMatch(
      /canonical root-relative/,
    );
    expect(validateConciergeTargetDestination("form", "/contact")).toMatch(
      /require a safe anchor/,
    );
    expect(validateConciergeTargetDestination("route", "/vehicles/:bad-param")).toMatch(
      /route parameter/,
    );
  });

  it("ignores malformed rows rather than breaking the effective registry", () => {
    const targets = mergeConciergeTargets([
      {
        key: "malformed",
        label: "Unsafe",
        kind: "route",
        destination: "/admin",
        aiDescription: "No",
        enabled: true,
        isConversion: false,
        examplePrompts: [],
        sortOrder: 1,
      },
    ]);
    expect(targets.some((target) => target.key === "malformed")).toBe(false);
    expect(targets.some((target) => target.key === "inventory")).toBe(true);
  });
});
