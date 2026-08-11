/**
 * Precedence for the public concierge's deterministic answers.
 *
 * The route computes up to twelve candidate answers per turn, most of them
 * null, then picks one. That decision used to live inline as a twelve-branch
 * `??` chain guarded by a separate `||` expression over an overlapping set of
 * the same variables — impossible to exercise without building a Request, a
 * tenant and a Supabase client, which is why the ordering had no tests.
 *
 * Here the order is data, not syntax. Nothing about the answers themselves
 * moved; this module only decides which one the visitor sees.
 *
 * Two operator choices are deliberately preserved from the original:
 *
 *  - Selection uses `??`, so an answer of `""` still wins its slot. A builder
 *    returning an empty string suppresses every lower rule.
 *  - The guard uses truthiness, so `""` does not by itself trigger the
 *    deterministic path.
 *
 * Those disagree, and that gap is real: if some *other* condition opens the
 * deterministic path while the highest-precedence answer is `""`, the visitor
 * gets an empty message. That is the defect tracked as 2.5. It is preserved
 * exactly here so this extraction stays behaviour-preserving, and
 * `emptyAnswerWouldWin` exists to make the case detectable when 2.5 is fixed.
 */

export type DeterministicAnswers = {
  /** "Do you mean the first option or the second?" — outranks everything. */
  clarifier: string | null;
  makeSwitchClarifier: string | null;
  compare: string | null;
  compareUnavailable: string | null;
  zeroResult: string | null;
  ordinalUnavailable: string | null;
  ordinalReference: string | null;
  selectedVehicle: string | null;
  selectedVehicleUnavailable: string | null;
  unsupportedFact: string | null;
  availability: string | null;
  inventory: string | null;
};

/**
 * Highest precedence first. This is the single definition of the order — both
 * selection and the "did anything answer?" guard read it, so the two can no
 * longer drift apart the way two hand-written expressions could.
 *
 * The shape of the order matters and is not alphabetical:
 *
 *  1. Clarifiers come first. If we are unsure what the visitor meant, saying
 *     anything confident is worse than asking.
 *  2. Comparison and zero-result next: both describe the *state of the
 *     search*, which contradicts any answer that assumes results exist.
 *  3. Reference resolution (ordinal, selected vehicle) before facts about a
 *     vehicle, since the fact answer needs to know which vehicle.
 *  4. Availability and inventory listings last — the broadest answers, right
 *     only when nothing more specific applied.
 */
export const DETERMINISTIC_ANSWER_ORDER = [
  "clarifier",
  "makeSwitchClarifier",
  "compare",
  "compareUnavailable",
  "zeroResult",
  "ordinalUnavailable",
  "ordinalReference",
  "selectedVehicle",
  "selectedVehicleUnavailable",
  "unsupportedFact",
  "availability",
  "inventory",
] as const satisfies ReadonlyArray<keyof DeterministicAnswers>;

export function emptyDeterministicAnswers(): DeterministicAnswers {
  return {
    clarifier: null,
    makeSwitchClarifier: null,
    compare: null,
    compareUnavailable: null,
    zeroResult: null,
    ordinalUnavailable: null,
    ordinalReference: null,
    selectedVehicle: null,
    selectedVehicleUnavailable: null,
    unsupportedFact: null,
    availability: null,
    inventory: null,
  };
}

/** The winning answer, or null when every rule declined. `??` semantics. */
export function selectDeterministicAnswer(answers: DeterministicAnswers): string | null {
  for (const key of DETERMINISTIC_ANSWER_ORDER) {
    const value = answers[key];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

/** Which rule won, for logging and tests. Null when none did. */
export function winningDeterministicRule(
  answers: DeterministicAnswers,
): keyof DeterministicAnswers | null {
  for (const key of DETERMINISTIC_ANSWER_ORDER) {
    const value = answers[key];
    if (value !== null && value !== undefined) return key;
  }
  return null;
}

export type DeterministicGuardContext = {
  /** A navigation action the client applies immediately, with no model turn. */
  immediateSiteNavigation: boolean;
  /** The turn re-presents a stored result set rather than querying again. */
  statePresentationRequest: boolean;
};

/**
 * Whether this turn is answered deterministically at all.
 *
 * Truthiness, not nullishness — matching the original guard. An answer of `""`
 * does not open the path on its own.
 */
export function hasDeterministicAnswer(
  answers: DeterministicAnswers,
  context: DeterministicGuardContext,
): boolean {
  if (context.immediateSiteNavigation || context.statePresentationRequest) return true;
  return DETERMINISTIC_ANSWER_ORDER.some((key) => Boolean(answers[key]));
}

/**
 * True when the path is open but the winning answer is an empty string, so the
 * visitor would receive a message with no text.
 *
 * Detection only — no caller acts on it yet. Wiring a fallback is 2.5.
 */
export function emptyAnswerWouldWin(
  answers: DeterministicAnswers,
  context: DeterministicGuardContext,
): boolean {
  return hasDeterministicAnswer(answers, context) && selectDeterministicAnswer(answers) === "";
}

export type DeterministicContentContext = DeterministicGuardContext & {
  /** Text describing actions taken, when the turn emitted actions but no prose. */
  actionAcknowledgement: string | null;
};

/**
 * The text the visitor sees on the deterministic path.
 *
 * Falls back to the action acknowledgement, then to a stored-results line, and
 * finally to `""` — all three exactly as the original expression did.
 */
export function resolveDeterministicContent(
  answers: DeterministicAnswers,
  context: DeterministicContentContext,
): string {
  const selected = selectDeterministicAnswer(answers);
  if (selected !== null) return selected;
  return (
    context.actionAcknowledgement ||
    (context.statePresentationRequest ? "I have the current inventory results ready." : "")
  );
}
