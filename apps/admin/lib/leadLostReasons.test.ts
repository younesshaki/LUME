import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEAD_LOST_REASON_KEYS,
  mergeLeadLostReasons,
  normalizeLeadLostReasonKey,
  resolveLeadLostReasonForReporting,
  selectableLeadLostReasons,
  summarizeLeadLostReasons,
} from "./leadLostReasons";

describe("normalizeLeadLostReasonKey", () => {
  it("creates stable, safe keys for custom reasons", () => {
    expect(normalizeLeadLostReasonKey("  Décision d’achat / différée  ")).toBe(
      "decision-dachat-differee"
    );
    expect(normalizeLeadLostReasonKey("Enterprise___policy")).toBe("enterprise-policy");
  });

  it("rejects values that contain no usable key characters", () => {
    expect(normalizeLeadLostReasonKey("  /!?  ")).toBeNull();
  });
});

describe("mergeLeadLostReasons", () => {
  it("provides the canonical defaults in their configured order", () => {
    const reasons = mergeLeadLostReasons();

    expect(reasons.map((reason) => reason.key)).toEqual([...DEFAULT_LEAD_LOST_REASON_KEYS]);
    expect(reasons.every((reason) => reason.isActive && reason.isDefault)).toBe(true);
  });

  it("overrides default labels, order, and active state without deleting them", () => {
    const reasons = mergeLeadLostReasons([
      { key: "ghosted", label: "No reply", sortOrder: 5, isActive: false },
    ]);

    expect(reasons[0]).toMatchObject({
      key: "ghosted",
      label: "No reply",
      sortOrder: 5,
      isActive: false,
      isDefault: true,
    });
    expect(reasons).toHaveLength(DEFAULT_LEAD_LOST_REASON_KEYS.length);
  });

  it("adds normalized custom reasons and ignores invalid keys", () => {
    const reasons = mergeLeadLostReasons([
      { key: "Internal / Policy", label: "  Internal   policy  ", sortOrder: 15 },
      { key: "!!!", label: "Invalid" },
    ]);

    expect(reasons.find((reason) => reason.key === "internal-policy")).toMatchObject({
      label: "Internal policy",
      sortOrder: 15,
      isActive: true,
      isDefault: false,
    });
    expect(reasons).toHaveLength(DEFAULT_LEAD_LOST_REASON_KEYS.length + 1);
  });

  it("applies repeated overrides deterministically", () => {
    const reasons = mergeLeadLostReasons([
      { key: "price", label: "Budget", isActive: false },
      { key: "PRICE", label: "Pricing", sortOrder: 2 },
    ]);

    expect(reasons[0]).toMatchObject({
      key: "price",
      label: "Pricing",
      sortOrder: 2,
      isActive: false,
    });
  });
});

describe("selectableLeadLostReasons", () => {
  it("excludes disabled reasons only from new selections", () => {
    const merged = mergeLeadLostReasons([
      { key: "timing", isActive: false },
      { key: "not-qualified", label: "Not qualified", isActive: true },
    ]);

    expect(selectableLeadLostReasons(merged).map((reason) => reason.key)).not.toContain("timing");
    expect(merged.map((reason) => reason.key)).toContain("timing");
  });
});

describe("resolveLeadLostReasonForReporting", () => {
  it("resolves a disabled configured reason for historical reports", () => {
    const reasons = mergeLeadLostReasons([
      { key: "competitor", label: "Went elsewhere", isActive: false },
    ]);

    expect(resolveLeadLostReasonForReporting("competitor", reasons)).toMatchObject({
      key: "competitor",
      label: "Went elsewhere",
      isActive: false,
      isLegacy: false,
    });
  });

  it("resolves old stored labels as configured reasons", () => {
    const reasons = mergeLeadLostReasons([
      { key: "wrong-fit", label: "Not a fit", isActive: false },
    ]);

    expect(resolveLeadLostReasonForReporting("NOT A FIT", reasons)?.key).toBe("wrong-fit");
  });

  it("keeps unknown historical keys visible as inactive legacy reasons", () => {
    const result = resolveLeadLostReasonForReporting(
      "Budget constraints",
      mergeLeadLostReasons()
    );

    expect(result).toEqual({
      key: "budget-constraints",
      label: "Budget constraints",
      sortOrder: 1_000_000,
      isActive: false,
      isDefault: false,
      isLegacy: true,
    });
  });

  it("returns null for an absent historical value", () => {
    expect(resolveLeadLostReasonForReporting("  ", mergeLeadLostReasons())).toBeNull();
    expect(resolveLeadLostReasonForReporting(null, mergeLeadLostReasons())).toBeNull();
  });
});

describe("summarizeLeadLostReasons", () => {
  it("groups configured, legacy, and unspecified lost leads without dropping history", () => {
    const reasons = mergeLeadLostReasons([
      { key: "competitor", label: "Went elsewhere", isActive: false },
    ]);

    expect(summarizeLeadLostReasons(
      ["price", "competitor", "competitor", "legacy reason", null],
      reasons,
    )).toEqual([
      { key: "price", label: "Price", count: 1, isLegacy: false },
      { key: "competitor", label: "Went elsewhere", count: 2, isLegacy: false },
      { key: "legacy-reason", label: "Legacy reason", count: 1, isLegacy: true },
      { key: "unspecified", label: "Unspecified", count: 1, isLegacy: true },
    ]);
  });
});
