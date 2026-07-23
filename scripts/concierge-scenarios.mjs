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
      // Do not assert reject:"toyota" here — a correct reset legitimately
      // mentions Toyota as one of many makes in the full inventory list
      // ("Makes available include: Toyota, Volkswagen, Ram, ..."). Verified
      // 2026-07-23: this scenario passes correctly; check the total count
      // is the real full-inventory number (1,283 as of that date) and that
      // the response isn't STILL scoped to only Toyota results.
      "show me all makes",
    ],
  },
  {
    name: "CONFIRMED BUG 2026-07-23: 'a different make' asks a clarifying question but still shows the old make's results",
    turns: [
      "show me BMW SUVs",
      {
        text: "what about a different make?",
        reject: "bmw",
        // Live-reproduced 2026-07-23, source: "model". The reply correctly
        // asks "What make are you interested in?" — the right move for an
        // ambiguous "a different make" with no make named — but then, in
        // the SAME reply, still lists the old BMW SUV results underneath
        // ("Meanwhile, here's what I have... BMW SUVs Available: ..."),
        // directly contradicting its own question. The full-reset regex fix
        // (FULL_INVENTORY_RESET_PATTERN matching "a different make") is
        // confirmed working for OTHER phrasings ("what about a different
        // make?" -> BMW dropped is NOT what's broken) — the bug is that
        // when the visitor doesn't name the new make, the model still has
        // the old grounded BMW vehicles in its context and volunteers them
        // anyway instead of waiting for an answer. Look at whether
        // groundedVehicles/context should be suppressed (not just
        // activeFilters cleared) when a reset fires without a replacement
        // make in the same turn.
      },
    ],
  },
  {
    name: "CONFIRMED WORSE THAN DOCUMENTED 2026-07-23: numeral ordinals can return a confidently WRONG vehicle, not just fail loudly",
    turns: [
      "do you have a 20k budget worth of cars?",
      // No expect/reject — this needs a human/Codex reading the transcript,
      // not a substring check, because the failure mode is silent
      // incorrectness, not an error string. Live-reproduced 2026-07-23:
      // turn 1 offered (in order) 2026 kimi kimi $200, 2011 Ford Fiesta SE
      // $5,388, 2013 Nissan Altima $8,888, 2011 Dodge Grand Caravan $10,891.
      // "open the 3rd one" should mean the Nissan Altima. Instead the model
      // (source: "tool", via get_vehicle_details) confidently returned the
      // Dodge Grand Caravan — the 4TH item, not the 3rd — with "Here it is:"
      // and no hedging. A previous run of this exact same scenario instead
      // failed loudly with "vehicle ID could not be verified" (also
      // real, also live-reproduced). Same root cause (numeral ordinals
      // aren't in ORDINAL_REFERENCE_PATTERN/ORDINAL_ACTION_PATTERN, so this
      // never reaches the safe deterministic path), TWO different failure
      // modes depending on what the model does when left to improvise —
      // the wrong-vehicle-with-confidence case is worse than the loud
      // failure because a human wouldn't notice anything is wrong from the
      // reply text alone. Fixing the regex gap (accept 1st/2nd/3rd/4th and
      // "#3"/"number 3" forms, mapped through the SAME deterministic
      // ordinalResultSetVehicleId() path as the spelled-out words) should
      // make this scenario resolve through source:"deterministic" instead
      // of ever reaching the model — verify that after the fix.
      "open the 3rd one",
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
