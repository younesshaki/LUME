import { describe, expect, it } from "vitest";
import {
  ADMIN_CLARIFY_QUESTIONS,
  adminClarifyIntent,
  buildAdminConciergeSystemPrompt,
  buildAdminPlannerContextPrompt,
  isAdminClarifyReason,
  parseAdminConciergeModelPlan,
} from "./adminConcierge";

const plan = (intent: unknown) => JSON.stringify({ intent });

describe("admin concierge: typed clarification", () => {
  it("accepts a clarification that names a known reason", () => {
    expect(
      parseAdminConciergeModelPlan(
        plan({ kind: "clarify", reason: "ambiguous_record" }),
      ),
    ).toEqual({ kind: "clarify", reason: "ambiguous_record" });
  });

  it("rejects a clarification with an unknown reason", () => {
    // Malformed planner output must not become a response.
    expect(
      parseAdminConciergeModelPlan(
        plan({ kind: "clarify", reason: "because_i_said_so" }),
      ),
    ).toBeNull();
  });

  it("rejects a clarification with no reason at all", () => {
    expect(parseAdminConciergeModelPlan(plan({ kind: "clarify" }))).toBeNull();
  });

  it("never lets the model author the question text", () => {
    // The headline safety property: the model picks a reason, LUME picks the
    // words. Model prose on this surface is one step from a question that
    // names a record the actor may not be allowed to see.
    const parsed = parseAdminConciergeModelPlan(
      plan({
        kind: "clarify",
        reason: "ambiguous_record",
        question: "Did you mean Jane Doe (jane@example.com)?",
      }),
    );
    expect(parsed).toEqual({ kind: "clarify", reason: "ambiguous_record" });
    const intent = adminClarifyIntent("ambiguous_record");
    expect(intent.kind === "clarify" && intent.question).toBe(
      ADMIN_CLARIFY_QUESTIONS.ambiguous_record,
    );
    expect(intent.kind === "clarify" && intent.question).not.toContain("jane@");
  });

  it("resolves every reason to non-empty server-authored text", () => {
    for (const reason of Object.keys(ADMIN_CLARIFY_QUESTIONS) as Array<
      keyof typeof ADMIN_CLARIFY_QUESTIONS
    >) {
      const intent = adminClarifyIntent(reason);
      expect(intent.kind).toBe("clarify");
      expect(intent.kind === "clarify" && intent.question.length).toBeGreaterThan(20);
    }
  });

  it("guards the reason type at the boundary", () => {
    expect(isAdminClarifyReason("missing_value")).toBe(true);
    expect(isAdminClarifyReason("toString")).toBe(false);
    expect(isAdminClarifyReason(null)).toBe(false);
    expect(isAdminClarifyReason(7)).toBe(false);
  });

  it("still rejects every non-clarify hostile plan", () => {
    // Regression guard: the clarify change must not have widened the parser.
    expect(parseAdminConciergeModelPlan(plan({ kind: "delete_everything" }))).toBeNull();
    expect(
      parseAdminConciergeModelPlan(plan({ kind: "navigate", capabilityId: "../admin" })),
    ).toBeNull();
    expect(parseAdminConciergeModelPlan("not json at all")).toBeNull();
  });
});

describe("admin concierge: planner session context", () => {
  it("says nothing when there is nothing on screen", () => {
    expect(buildAdminPlannerContextPrompt({})).toBe("");
  });

  it("describes a result set by shape, never by content", () => {
    const prompt = buildAdminPlannerContextPrompt({
      resultSet: { kind: "leads", size: 5 },
      hasSelection: true,
      currentSurface: "Leads",
    });
    expect(prompt).toContain("5 leads result(s)");
    expect(prompt).toContain("one record selected");
    expect(prompt).toContain("Leads");
  });

  it("omits an empty result set rather than claiming a list exists", () => {
    const prompt = buildAdminPlannerContextPrompt({
      resultSet: { kind: "vehicles", size: 0 },
    });
    expect(prompt).not.toContain("result(s)");
  });

  it("gives an ordinal reference a referent it previously lacked", () => {
    // "open the second one" used to reach the planner with no indication that
    // a list existed, so it could only be unsupported.
    const prompt = buildAdminPlannerContextPrompt({
      resultSet: { kind: "vehicles", size: 3 },
    });
    expect(prompt).toContain("the second one");
  });

  it("keeps the context inside the system prompt and still forbids tenant data", () => {
    const prompt = buildAdminConciergeSystemPrompt({
      resultSet: { kind: "vehicles", size: 2 },
    });
    expect(prompt).toContain("You do not have access to tenant data");
    expect(prompt).toContain("2 vehicles result(s)");
  });

  it("advertises the clarify reason codes to the model", () => {
    const prompt = buildAdminConciergeSystemPrompt();
    expect(prompt).toContain("ambiguous_record");
    expect(prompt).toContain("LUME writes the question");
  });
});
