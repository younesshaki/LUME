import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DETERMINISTIC_ANSWER_ORDER,
  type DeterministicAnswers,
  emptyAnswerWouldWin,
  emptyDeterministicAnswers,
  hasDeterministicAnswer,
  resolveDeterministicContent,
  selectDeterministicAnswer,
  winningDeterministicRule,
} from "./chatDeterministicAnswer";

const answers = (overrides: Partial<DeterministicAnswers> = {}): DeterministicAnswers => ({
  ...emptyDeterministicAnswers(),
  ...overrides,
});

const noContext = { immediateSiteNavigation: false, statePresentationRequest: false };

describe("deterministic answer precedence", () => {
  it("declines when no rule produced an answer", () => {
    expect(selectDeterministicAnswer(answers())).toBeNull();
    expect(winningDeterministicRule(answers())).toBeNull();
    expect(hasDeterministicAnswer(answers(), noContext)).toBe(false);
  });

  it("returns the only answer when exactly one rule fires", () => {
    for (const key of DETERMINISTIC_ANSWER_ORDER) {
      expect(selectDeterministicAnswer(answers({ [key]: `from ${key}` }))).toBe(`from ${key}`);
      expect(winningDeterministicRule(answers({ [key]: "x" }))).toBe(key);
    }
  });

  it("honours the full order pairwise, so no two rules can silently swap", () => {
    // Every ordered pair: the earlier key must win when both are populated.
    // Cheap, exhaustive, and it fails with the exact pair that regressed.
    for (let i = 0; i < DETERMINISTIC_ANSWER_ORDER.length; i++) {
      for (let j = i + 1; j < DETERMINISTIC_ANSWER_ORDER.length; j++) {
        const higher = DETERMINISTIC_ANSWER_ORDER[i];
        const lower = DETERMINISTIC_ANSWER_ORDER[j];
        const winner = winningDeterministicRule(answers({ [higher]: "a", [lower]: "b" }));
        expect(winner, `${higher} must outrank ${lower}`).toBe(higher);
      }
    }
  });

  it("puts a zero-result answer above any inventory answer", () => {
    // The specific precedence the brief calls out: after a refinement yields
    // nothing, the rollback text must not be replaced by a listing.
    const resolved = answers({ zeroResult: "Nothing matched, keeping your previous results.", inventory: "Here are 12 vehicles." });
    expect(selectDeterministicAnswer(resolved)).toBe("Nothing matched, keeping your previous results.");
  });

  it("lets the ambiguous make-switch clarifier suppress grounded results", () => {
    const resolved = answers({
      makeSwitchClarifier: "Did you mean Ford or Mazda?",
      availability: "Yes, we have three.",
      inventory: "Here are 12 vehicles.",
      selectedVehicle: "The CX-90 is $52,000.",
    });
    expect(selectDeterministicAnswer(resolved)).toBe("Did you mean Ford or Mazda?");
  });

  it("puts the affirmation clarifier above everything, including other clarifiers", () => {
    const populated = Object.fromEntries(
      DETERMINISTIC_ANSWER_ORDER.map((key) => [key, `from ${key}`]),
    ) as unknown as DeterministicAnswers;
    expect(winningDeterministicRule(populated)).toBe("clarifier");
  });
});

describe("deterministic guard", () => {
  it("opens the path for an immediate navigation with no answers at all", () => {
    expect(hasDeterministicAnswer(answers(), { ...noContext, immediateSiteNavigation: true })).toBe(true);
  });

  it("opens the path for a stored-results presentation", () => {
    expect(hasDeterministicAnswer(answers(), { ...noContext, statePresentationRequest: true })).toBe(true);
  });

  it("uses truthiness, so an empty answer does not open the path by itself", () => {
    // Preserved from the original `||` guard. Asserted rather than assumed,
    // because selection below uses `??` and disagrees.
    expect(hasDeterministicAnswer(answers({ inventory: "" }), noContext)).toBe(false);
  });
});

describe("visible content", () => {
  it("prefers the winning answer over the action acknowledgement", () => {
    const content = resolveDeterministicContent(answers({ inventory: "Here are 12 vehicles." }), {
      ...noContext,
      actionAcknowledgement: "Filtered the inventory.",
    });
    expect(content).toBe("Here are 12 vehicles.");
  });

  it("falls back to the action acknowledgement when no rule answered", () => {
    const content = resolveDeterministicContent(answers(), {
      ...noContext,
      immediateSiteNavigation: true,
      actionAcknowledgement: "Opening the CX-90.",
    });
    expect(content).toBe("Opening the CX-90.");
  });

  it("falls back to the stored-results line when there is no acknowledgement", () => {
    const content = resolveDeterministicContent(answers(), {
      immediateSiteNavigation: false,
      statePresentationRequest: true,
      actionAcknowledgement: null,
    });
    expect(content).toBe("I have the current inventory results ready.");
  });

  it("still yields empty content when nothing at all is available", () => {
    // Preserved, not endorsed: this is the empty-turn defect (2.5). Pinning it
    // means the fix will show up here as a deliberate change.
    const content = resolveDeterministicContent(answers(), {
      ...noContext,
      immediateSiteNavigation: true,
      actionAcknowledgement: null,
    });
    expect(content).toBe("");
  });

  it("flags the case where an empty answer wins a path opened by something else", () => {
    // `??` selection takes "" while the guard ignored it — the two operators
    // disagree, which is how an empty message reaches the client.
    const withEmpty = answers({ clarifier: "" });
    expect(hasDeterministicAnswer(withEmpty, noContext)).toBe(false);
    expect(emptyAnswerWouldWin(withEmpty, { ...noContext, statePresentationRequest: true })).toBe(true);
    expect(resolveDeterministicContent(withEmpty, {
      ...noContext,
      statePresentationRequest: true,
      actionAcknowledgement: "Filtered the inventory.",
    })).toBe("");
  });
});

describe("route wiring", () => {
  const route = readFileSync(
    resolve(process.cwd(), "apps/admin/app/api/chat/route.ts"),
    "utf8",
  );

  it("resolves content through this module rather than a second inline chain", () => {
    // The extraction is only behaviour-preserving while the route has exactly
    // one precedence definition. A reintroduced `??` ladder over the same
    // variables would drift from the order tested above.
    expect(route).toContain("resolveDeterministicContent");
    expect(route).not.toContain("deterministicOrdinalUnavailableAnswer ??");
    expect(route).not.toContain("deterministicSelectedVehicleAnswer ??");
  });

  it("keeps every ordered rule represented in the route's answer record", () => {
    const record = route.slice(route.indexOf("const deterministicAnswers"), route.indexOf("const actionAcknowledgement"));
    for (const key of DETERMINISTIC_ANSWER_ORDER) {
      expect(record, `${key} missing from the route's answer record`).toContain(`${key}:`);
    }
  });
});
