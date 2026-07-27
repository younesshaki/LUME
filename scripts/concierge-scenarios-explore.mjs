/**
 * Exploration scenarios (2026-07-23 autonomous session) — visitor-phrased
 * probes into territory the starter suite doesn't cover. Winners graduate
 * into concierge-scenarios.mjs after review.
 */
export const scenarios = [
  {
    name: "explore: budget phrasing 'I got a 10k budget' extracts a price cap",
    turns: [
      { text: "I got a 10k budget, what can I get?", expect: "matching" },
    ],
  },
  {
    name: "explore: budget phrasing 'my budget is 25 grand'",
    turns: [
      // verified: extracted {bodyStyle:SUV, priceMax:25000} -> 79 matching
      { text: "my budget is 25 grand, show me SUVs", expect: "matching" },
    ],
  },
  {
    name: "explore: a second price refinement REPLACES the cap, not compounds",
    turns: [
      "show me cars under 20k",
      // transcript check: activeFiltersAfter should be {priceMax:15000}, no BMW-era leftovers
      { text: "actually, under 15k", expect: "matching" },
    ],
  },
  {
    name: "explore: reset phrasing 'show me the entire inventory'",
    turns: [
      "any bmws less than 70k?",
      // Full reset now answers deterministically with the verified count and
      // must emit the UI filter action; navigation may also be emitted.
      {
        text: "show me the entire inventory",
        expect: "1,283",
        expectAction: "filter_inventory",
      },
    ],
  },
  {
    name: "explore: 'forget the filters' should clear EVERYTHING incl. price",
    turns: [
      "any bmws less than 70k?",
      {
        text: "forget the filters, show me everything",
        expect: "1,283",
        reject: "1,142",
        // FIXED 2026-07-23: FULL_INVENTORY_RESET_PATTERN now covers
        // forget/clear/reset/remove/drop + filters, "no filters",
        // "show me everything", "everything you have", "start over".
        // Pre-fix: priceMax:70000 survived the make/model-only clear and
        // the "full" inventory came back as 1,142 (live-reproduced).
        // NOTE: counts are data-dependent — update if demo inventory changes.
      },
    ],
  },
  {
    name: "explore: year range 'between 2018 and 2022'",
    turns: [
      { text: "show me BMWs between 2018 and 2022", expect: "bmw" },
    ],
  },
  {
    name: "explore: mileage cap 'under 50k miles'",
    turns: [
      { text: "show me Toyota Camrys under 50k miles", expect: "camry" },
    ],
  },
  {
    name: "explore: numeral ordinal variant 'open the 2nd one'",
    turns: [
      "do you have a 2026 Camry?",
      { text: "open the 2nd one", expect: "taking you" },
    ],
  },
  {
    name: "explore: standalone '#2' resolves as ordinal navigation",
    turns: [
      "do you have a 2026 Camry?",
      { text: "#2", expect: "taking you" },
    ],
  },
  {
    name: "explore: out-of-range ordinal gets a bounded answer, not a guess",
    turns: [
      "do you have a 2026 Camry?",
      { text: "open the 25th one", expect: "between 1 and" },
    ],
  },
  {
    name: "explore: unsupported fact 'does it have heated seats?' is declined honestly",
    turns: [
      "do you have a 2026 Camry?",
      "open the first one",
      // probe: must not invent a yes — deterministic unsupported-fact path
      "does it have heated seats?",
    ],
  },
  {
    name: "explore: superlative 'what's your cheapest SUV?'",
    turns: [
      // verified: extracted {bodyStyle:SUV, sort:price_asc} -> 579 matching
      { text: "what's your cheapest SUV?", expect: "matching vehicles found" },
    ],
  },
  {
    name: "explore: 'compare the first two' is a deterministic comparison from stored results",
    turns: [
      "do you have a 2026 Camry?",
      {
        text: "compare the first two",
        expect: "comparison",
        reject: "compass",
        // FIXED 2026-07-23: compareOrdinalIndexesFromText() resolves positions
        // from the stored result set and the route answers with a templated
        // field-by-field comparison (source: deterministic). Before: the typo
        // corrector turned "compare" into model "Compass" ("Nothing matches
        // 2026 Compass"); after that guard, the model still claimed the
        // just-listed Camrys "aren't in the dataset" and asked which two.
      },
    ],
  },
  {
    name: "explore: make typo 'toyta' still resolves",
    turns: [
      { text: "do you have any toyta cars?", expect: "toyota" },
    ],
  },
  {
    name: "explore: long chain — search, refine, reset, search, ordinal, detail",
    turns: [
      "show me BMW SUVs under 70k",
      "only AWD ones",
      "back to the whole inventory",
      "do you have a 2026 Camry?",
      { text: "open the 2nd one", expect: "taking you" },
      { text: "how much is it?", expect: "$" },
    ],
  },
];
