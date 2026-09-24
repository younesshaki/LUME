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
export const CHAT_INTERPRETATION_GOLD_SET_VERSION = 2;

export type GoldTurn = {
  /** What the visitor typed. */
  message: string;
  /** The reading a correct interpreter produces. */
  expected: Pick<ChatInterpretation, "kind"> &
    Partial<
      Pick<
        ChatInterpretation,
        "setFilters" | "clearFilters" | "reference" | "clarifyReason"
      >
    > & {
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

function repeatedTurns(
  messages: readonly string[],
  expected: GoldTurn["expected"],
  note: string,
): GoldTurn[] {
  return messages.map((message) => ({ message, expected, note }));
}

const PHASE_3_HELD_OUT_CONVERSATIONS: readonly GoldConversation[] = [
  {
    id: "heldout-make-searches",
    partition: "held-out",
    locale: "en",
    turns: [
      ...repeatedTurns(
        [
          "let me see the BMWs",
          "got any BMW inventory",
          "I'd like to browse BMW vehicles",
          "pull up your BMW selection",
          "what BMW cars are available",
        ],
        { kind: "search", setFilters: { make: "BMW" } },
        "Explicit named-make searches must start a new vehicle topic.",
      ),
      ...repeatedTurns(
        [
          "show me Toyota vehicles",
          "what Toyotas do you carry",
          "browse the Toyota inventory",
          "I'd like to see your Toyotas",
          "any Toyota cars in stock",
        ],
        { kind: "search", setFilters: { make: "Toyota" } },
        "A second make family checks conventional make normalization.",
      ),
    ],
  },
  {
    id: "heldout-model-year-searches",
    partition: "held-out",
    locale: "en",
    turns: [
      ...repeatedTurns(
        [
          "show me 2026 Camrys",
          "any Camry from 2026",
          "I'm after a 2026 Camry",
          "do you carry the 2026 Camry",
          "find a Camry model year 2026",
        ],
        { kind: "search", setFilters: { model: "Camry", year: 2026 } },
        "A model and year are current-turn facts; make must not be invented.",
      ),
      ...repeatedTurns(
        [
          "show me 2024 X5s",
          "any X5 from 2024",
          "find me a 2024 X5",
          "do you have the 2024 X5",
          "I want an X5 model year 2024",
        ],
        { kind: "search", setFilters: { model: "X5", year: 2024 } },
        "A second model/year family guards against memorizing one transcript.",
      ),
    ],
  },
  {
    id: "heldout-budget-searches",
    partition: "held-out",
    locale: "en",
    turns: [
      ...repeatedTurns(
        [
          "cars under 40k",
          "anything for at most $40,000",
          "my budget is forty thousand",
          "show inventory up to 40k",
          "I have $40,000 to spend",
        ],
        { kind: "search", setFilters: { priceMax: 40000 } },
        "Natural maximum-budget language must become a numeric current search.",
      ),
      ...repeatedTurns(
        [
          "cars over $60,000",
          "show inventory starting at 60k",
          "anything at least sixty thousand",
          "I only want vehicles above 60k",
          "what costs more than $60,000",
        ],
        { kind: "search", setFilters: { priceMin: 60000 } },
        "Minimum-price language must not be inverted into a cap.",
      ),
    ],
  },
  {
    id: "heldout-refinements",
    partition: "held-out",
    locale: "en",
    turns: [
      ...repeatedTurns(
        [
          "only the AWD ones",
          "narrow that to AWD",
          "make those all wheel drive",
          "keep just AWD",
          "from those, show AWD",
        ],
        { kind: "refine", setFilters: { drivetrain: "AWD" } },
        "Deictic narrowing edits the active result scope.",
      ),
      ...repeatedTurns(
        [
          "only SUVs",
          "narrow those down to SUVs",
          "just the SUV options",
          "keep the SUVs from that list",
          "from those I want an SUV",
        ],
        { kind: "refine", setFilters: { bodyStyle: "SUV" } },
        "Body-style narrowing remains a refinement rather than a new topic.",
      ),
    ],
  },
  {
    id: "heldout-resets",
    partition: "held-out",
    locale: "en",
    turns: repeatedTurns(
      [
        "take me back to all the cars",
        "clear everything and start over",
        "I want the complete inventory again",
        "drop every filter",
        "let's browse all vehicles",
        "forget that search",
        "return to the entire inventory",
        "remove all those limits",
        "start fresh with every car",
        "no filters anymore",
      ],
      { kind: "reset" },
      "Full-scope reset variants must clear state rather than merely sound successful.",
    ),
  },
  {
    id: "heldout-presentations",
    partition: "held-out",
    locale: "en",
    turns: repeatedTurns(
      [
        "put those on screen",
        "let me see those",
        "display the results",
        "show that list",
        "bring those results up",
        "can I see them",
        "show me what you found",
        "display those vehicles",
        "put the matches up",
        "let's see the options",
      ],
      { kind: "present" },
      "Presentation language must reuse the verified result set, never run a broad query.",
    ),
  },
  {
    id: "heldout-references",
    partition: "held-out",
    locale: "en",
    turns: [
      {
        message: "open item number two",
        expected: {
          kind: "reference",
          reference: { kind: "ordinal", position: 2 },
        },
        note: "Numeric ordinal navigation.",
      },
      {
        message: "tell me about the third result",
        expected: {
          kind: "reference",
          reference: { kind: "ordinal", position: 3 },
        },
        note: "Non-navigation ordinal reference.",
      },
      {
        message: "view the first vehicle",
        expected: {
          kind: "reference",
          reference: { kind: "ordinal", position: 1 },
        },
        note: "Word ordinal navigation.",
      },
      {
        message: "what about the last one",
        expected: { kind: "reference", reference: { kind: "last" } },
        note: "Last-result reference.",
      },
      {
        message: "pull up the second listing",
        expected: {
          kind: "reference",
          reference: { kind: "ordinal", position: 2 },
        },
        note: "Listing synonym reference.",
      },
      {
        message: "compare number one and number three",
        expected: {
          kind: "reference",
          reference: { kind: "compare", positions: [1, 3] },
        },
        note: "Arbitrary positional comparison.",
      },
      {
        message: "compare the first three",
        expected: {
          kind: "reference",
          reference: { kind: "compare", positions: [1, 2, 3] },
        },
        note: "Sequential positional comparison.",
      },
      {
        message: "how does the second compare with the first",
        expected: {
          kind: "reference",
          reference: { kind: "compare", positions: [2, 1] },
        },
        note: "Reversed comparison order.",
      },
      {
        message: "open the last result",
        expected: { kind: "reference", reference: { kind: "last" } },
        note: "Last-result navigation.",
      },
      {
        message: "select result number three",
        expected: {
          kind: "reference",
          reference: { kind: "ordinal", position: 3 },
        },
        note: "Selection synonym reference.",
      },
    ],
  },
  {
    id: "heldout-clarifications",
    partition: "held-out",
    locale: "en",
    turns: [
      ...repeatedTurns(
        [
          "something more affordable",
          "make it cheaper",
          "lower mileage please",
          "a newer one",
          "show me less expensive options",
        ],
        { kind: "clarify", clarifyReason: "relative_constraint" },
        "Relative constraints need an exact limit before execution.",
      ),
      ...repeatedTurns(
        ["sure", "okay yes"],
        { kind: "clarify", clarifyReason: "ambiguous_affirmation" },
        "Bare affirmations cannot choose between prior options.",
      ),
      ...repeatedTurns(
        [
          "switch to another brand",
          "what about a different manufacturer",
          "try another make",
        ],
        { kind: "clarify", clarifyReason: "ambiguous_make" },
        "An unnamed make switch must not be guessed.",
      ),
    ],
  },
  {
    id: "heldout-explicit-clears",
    partition: "held-out",
    locale: "en",
    turns: [
      ...repeatedTurns(
        [
          "any make is fine",
          "I don't care about the brand",
          "remove the make restriction",
          "regardless of manufacturer",
          "drop the brand filter",
        ],
        { kind: "refine", clearFilters: ["make"] },
        "Named filter clears must be represented explicitly.",
      ),
      ...repeatedTurns(
        [
          "any model year works",
          "remove the year limit",
          "I don't care what year",
          "regardless of year",
          "drop the model year filter",
        ],
        { kind: "refine", clearFilters: ["year"] },
        "Year clears must not silently reset unrelated facets.",
      ),
    ],
  },
  {
    id: "heldout-mixed-requests",
    partition: "held-out",
    locale: "en",
    turns: [
      {
        message: "show BMWs and call me tomorrow",
        expected: {
          kind: "search",
          setFilters: { make: "BMW" },
          expectUnsupported: true,
        },
        note: "A mixed request must retain the unsupported clause instead of half-executing.",
      },
      {
        message: "find Toyotas and email the list to me",
        expected: {
          kind: "search",
          setFilters: { make: "Toyota" },
          expectUnsupported: true,
        },
        note: "A mixed request must retain the unsupported clause instead of half-executing.",
      },
      {
        message: "cars under 30k and reserve one for Friday",
        expected: {
          kind: "search",
          setFilters: { priceMax: 30000 },
          expectUnsupported: true,
        },
        note: "A mixed request must retain the unsupported clause instead of half-executing.",
      },
      {
        message: "show SUVs and negotiate the price",
        expected: {
          kind: "search",
          setFilters: { bodyStyle: "SUV" },
          expectUnsupported: true,
        },
        note: "A mixed request must retain the unsupported clause instead of half-executing.",
      },
      {
        message: "find a Camry and approve my loan",
        expected: {
          kind: "search",
          setFilters: { model: "Camry" },
          expectUnsupported: true,
        },
        note: "A mixed request must retain the unsupported clause instead of half-executing.",
      },
      ...repeatedTurns(
        [
          "write me a poem",
          "what is the weather",
          "order me lunch",
          "book a hotel",
          "play some music",
        ],
        { kind: "unsupported", expectUnsupported: true },
        "Out-of-domain requests must abstain and retain their content class.",
      ),
    ],
  },
];

export const CHAT_INTERPRETATION_GOLD_SET: readonly GoldConversation[] = [
  {
    id: "bmw-budget-drift",
    partition: "development",
    locale: "en",
    turns: [
      {
        message: "any BMWs under 70k?",
        expected: {
          kind: "search",
          setFilters: { make: "BMW", priceMax: 70000 },
        },
        note: "Baseline search with a budget.",
      },
      {
        message: "2026 Camry",
        expected: {
          kind: "search",
          // The interpreter reports only what the visitor said. The trusted
          // tenant facet vocabulary may deterministically resolve Camry to
          // Toyota later; asking the model to invent the make would contradict
          // the schema contract.
          setFilters: { model: "Camry", year: 2026 },
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
        expected: { kind: "reset" },
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
        expected: {
          kind: "reference",
          reference: { kind: "ordinal", position: 3 },
        },
        note: "Numeral ordinals fell through to the model, which opened the 4th.",
      },
      {
        message: "compare the first two",
        expected: {
          kind: "reference",
          reference: { kind: "compare", positions: [1, 2] },
        },
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
        expected: { kind: "clarify", clarifyReason: "relative_constraint" },
        note: "Relative budget language with no numeric anchor needs a bounded clarification before it can become a trusted filter.",
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
  ...PHASE_3_HELD_OUT_CONVERSATIONS,
];

/** Turn counts by partition, so no metric is ever reported without its n. */
export function goldSetDenominators(): {
  conversations: number;
  turns: number;
  byPartition: Record<
    GoldConversation["partition"],
    { conversations: number; turns: number }
  >;
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
    turns: CHAT_INTERPRETATION_GOLD_SET.reduce(
      (sum, c) => sum + c.turns.length,
      0,
    ),
    byPartition,
  };
}
