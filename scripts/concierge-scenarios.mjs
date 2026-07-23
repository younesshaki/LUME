/**
 * Starter regression scenarios for the concierge test harness
 * (scripts/run-concierge-scenarios.mjs). These encode every bug pattern
 * found and fixed during the 2026-07-22/23 session (see
 * docs/architecture/concierge-architecture-and-limitations-2026-07-23.md)
 * plus the two gaps that were still open at handoff time.
 *
 * A turn can be a plain string (just log the exchange, no automated
 * assertion — use this when the "right" answer needs a human/Codex judgment
 * call) or an object { text, expect?, reject? } where expect/reject are
 * case-insensitive substrings checked against the bot's visible reply.
 *
 * Extend this file freely as new scenarios are designed — it's the running
 * regression suite for the concierge, not a fixed list.
 */
export const scenarios = [
  {
    name: "make-switch clears the stranded model (Camry -> Cadillac)",
    turns: [
      { text: "do you have a camry?", expect: "camry" },
      { text: "what about a caddy?", expect: "cadillac", reject: "nothing matches" },
    ],
  },
  {
    name: "make-switch clears the stranded model YEAR, not just the model",
    turns: [
      "do you have a 2026 Camry?",
      "what about a caddy?",
      { text: "show me BMW SUVs under 70k", reject: "nothing matches" },
    ],
  },
  {
    name: "zero-yield refinement does not permanently compound",
    turns: [
      { text: "show me BMW SUVs under 70k", expect: "bmw" },
      "only AWD ones",
      { text: "BMW", reject: "nothing matches" },
    ],
  },
  {
    name: "full reset phrasing: 'all makes'",
    turns: [
      "show me toyotas",
      { text: "show me all makes", reject: "toyota" },
    ],
  },
  {
    name: "full reset phrasing: 'a different make' / 'another make'",
    turns: [
      "show me BMW SUVs",
      { text: "what about a different make?", reject: "bmw" },
    ],
  },
  {
    name: "KNOWN GAP (open at handoff): numeral ordinals",
    turns: [
      "do you have a 20k budget worth of cars?",
      {
        text: "open the 3rd one",
        reject: "could not be verified",
      },
    ],
  },
  {
    name: "KNOWN GAP (open at handoff): 'whole inventory' reset synonym",
    turns: [
      "any bmws less than 70k?",
      {
        text: "back to the whole inventory",
        reject: "bmw",
      },
    ],
  },
  {
    name: "ordinal navigation works after a real search (spelled-out word, regression baseline)",
    turns: [
      "do you have a 2026 Camry?",
      { text: "open the first one", expect: "taking you" },
    ],
  },
  {
    name: "ordinal reference with no prior search is declined safely, not guessed",
    turns: [
      { text: "open the first one", reject: "taking you" },
    ],
  },
  {
    name: "grounded follow-up on the selected vehicle",
    turns: [
      "do you have a 2026 Camry?",
      "open the first one",
      "how much is it?",
      "is it AWD?",
    ],
  },
  {
    name: "SOFT GAP (open at handoff): unsupported-sounding market claims on free-form prose",
    turns: [
      "show me SUVs under 40k",
      {
        text: "any cheaper ones?",
        // No strict assertion — read the transcript and judge whether the
        // reply states anything (e.g. "10% below comparable listings")
        // that isn't backed by a real, verifiable field on the vehicle.
      },
    ],
  },
];
