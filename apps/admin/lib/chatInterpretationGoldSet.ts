import type { ChatInterpretation } from "./chatInterpretation";

/**
 * Versioned gold set for concierge interpretation.
 *
 * Every case is drawn from a failure that actually happened (the 2026-07
 * series documented in the architecture doc) or from the phrasings those
 * failures proved a fixed phrase list cannot cover. This is the evidence base
 * for deciding whether the Phase 3 interpreter is worth enabling — without it,
 * "the model understands better" is an opinion.
 *
 * Partitioned by CONVERSATION, not by turn. Splitting turns would put turn 3
 * of a conversation in development and turn 4 in held-out, and a model that
 * had seen turn 3 would look better on turn 4 than it deserves.
 */
export const CHAT_INTERPRETATION_GOLD_SET_VERSION = 1;

export type GoldTurn = {
  /** What the visitor typed. */
  message: string;
  /** The reading a correct interpreter produces. */
  expected: Pick<ChatInterpretation, "kind"> &
    Partial<Pick<ChatInterpretation, "setFilters" | "clearFilters" | "reference" | "clarifyReason">> & {
      /** Clauses a correct reading must NOT silently drop. */
      expectUnsupported?: boolean;
    };
  /** Why this turn is in the corpus; keeps a case from being "fixed" by deletion. */
  note: string;
};

export type GoldConversation = {
  id: string;
  partition: "development" | "held-out";
  /** Language tag. English only today — LUME claims no other. */
  locale: "en";
  turns: GoldTurn[];
};

export const CHAT_INTERPRETATION_GOLD_SET: readonly GoldConversation[] = [
  {
    id: "bmw-budget-drift",
    partition: "development",
    locale: "en",
    turns: [
      {
        message: "any BMWs under 70k?",
        expected: { kind: "search", setFilters: { make: "BMW", priceMax: 70000 } },
        note: "Baseline search with a budget.",
      },
      {
        message: "2026 Camry",
        expected: {
          kind: "search",
          setFilters: { make: "Toyota", model: "Camry", year: 2026 },
        },
        note: "The 2026-07-23 drift bug: the $70k cap must not survive an explicit new vehicle topic.",
      },
      {
        message: "only AWD ones",
        expected: { kind: "refine", setFilters: { drivetrain: "AWD" } },
        note: "A refinement narrows the CURRENT search rather than starting one.",
      },
    ],
  },
  {
    id: "reset-phrasings",
    partition: "development",
    locale: "en",
    turns: [
      {
        message: "back to the whole inventory",
        expected: { kind: "reset" },
        note: "'whole' was unrecognised for weeks; the reset half-applied and kept a price cap.",
      },
      {
        message: "forget the filters, show me everything",
        expected: { kind: "reset" },
        note: "Filter-explicit reset; the weaker rule cleared only make and model.",
      },
      {
        message: "I'm not talking about Toyota, I mean in general",
        expected: { kind: "reset", clearFilters: ["make"] },
        note: "Negation plus 'in general' — the exact phrasing that stranded a make.",
      },
    ],
  },
  {
    id: "ordinal-references",
    partition: "development",
    locale: "en",
    turns: [
      {
        message: "show me",
        expected: { kind: "present" },
        note: "Presentation of the stored set, not a new search.",
      },
      {
        message: "open the 3rd one",
        expected: { kind: "reference", reference: { kind: "ordinal", position: 3 } },
        note: "Numeral ordinals fell through to the model, which opened the 4th.",
      },
      {
        message: "compare the first two",
        expected: { kind: "reference", reference: { kind: "compare", positions: [1, 2] } },
        note: "'compare' was once typo-corrected into the model name 'Compass'.",
      },
    ],
  },
  {
    id: "natural-budget-language",
    partition: "held-out",
    locale: "en",
    turns: [
      {
        message: "what have you got for about fifty grand",
        expected: { kind: "search", setFilters: { priceMax: 50000 } },
        note: "Spoken-number budget with no make; held out to measure real generalisation.",
      },
      {
        message: "anything cheaper?",
        expected: { kind: "refine" },
        note: "Relative budget language with no number at all.",
      },
    ],
  },
  {
    id: "misspellings-and-switches",
    partition: "held-out",
    locale: "en",
    turns: [
      {
        message: "do you have any porche",
        expected: { kind: "search", setFilters: { make: "Porsche" } },
        note: "Typo tolerance must survive without inventing an unrelated make.",
      },
      {
        message: "what about a caddy",
        expected: { kind: "search", setFilters: { make: "Cadillac" } },
        note: "'caddy' was once fuzzy-matched onto the MODEL Camry, producing a Cadillac Camry.",
      },
    ],
  },
  {
    id: "ambiguity-and-mixed-requests",
    partition: "held-out",
    locale: "en",
    turns: [
      {
        message: "what about a different make?",
        expected: { kind: "clarify", clarifyReason: "ambiguous_make" },
        note: "An unnamed make switch must ask, not guess and not show the old make's results.",
      },
      {
        message: "yes",
        expected: { kind: "clarify", clarifyReason: "ambiguous_affirmation" },
        note: "A bare 'yes' after two offered options must produce one targeted question.",
      },
      {
        message: "show me BMWs and book me a test drive for Saturday",
        expected: {
          kind: "search",
          setFilters: { make: "BMW" },
          expectUnsupported: true,
        },
        note: "Mixed request: the supported half runs, the unsupported half must not vanish.",
      },
    ],
  },
];

/** Turn counts by partition, so no metric is ever reported without its n. */
export function goldSetDenominators(): {
  conversations: number;
  turns: number;
  byPartition: Record<GoldConversation["partition"], { conversations: number; turns: number }>;
} {
  const byPartition = {
    development: { conversations: 0, turns: 0 },
    "held-out": { conversations: 0, turns: 0 },
  };
  for (const conversation of CHAT_INTERPRETATION_GOLD_SET) {
    byPartition[conversation.partition].conversations += 1;
    byPartition[conversation.partition].turns += conversation.turns.length;
  }
  return {
    conversations: CHAT_INTERPRETATION_GOLD_SET.length,
    turns: CHAT_INTERPRETATION_GOLD_SET.reduce((sum, c) => sum + c.turns.length, 0),
    byPartition,
  };
}
