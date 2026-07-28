import { describe, expect, it } from "vitest";
import {
  ADMIN_CONCIERGE_EVAL_CASES,
  runAdminConciergeEval,
} from "./adminConciergeEval";

describe("admin concierge accuracy regression corpus", () => {
  it("keeps every deterministic intent and model-policy boundary passing", () => {
    const results = runAdminConciergeEval();
    expect(results).toHaveLength(ADMIN_CONCIERGE_EVAL_CASES.length);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "reviewed-one-lead-write", deterministicPassed: true }),
        expect.objectContaining({ id: "never-model-authorize-delete", modelPlanPassed: true }),
        expect.objectContaining({ id: "reject-model-invented-capability", modelPlanPassed: true }),
      ]),
    );
    expect(results.every((result) => result.deterministicPassed && result.modelPlanPassed)).toBe(true);
  });
});
