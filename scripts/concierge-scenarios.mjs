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
 *
 * The exported `scenarios` compose the starter set below with the two
 * exploration batches (concierge-scenarios-explore{,2}.mjs, 2026-07-23
 * autonomous session), so the runner's default path covers everything.
 */
import { scenarios as exploreScenarios } from "./concierge-scenarios-explore.mjs";
import { scenarios as explore2Scenarios } from "./concierge-scenarios-explore2.mjs";

const starterScenarios = [
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
    name: "FIXED 2026-07-23: 'a different make' gets a deterministic clarifier, never the old make's results",
    turns: [
      "show me BMW SUVs",
      {
        text: "what about a different make?",
        expect: "which make",
        reject: "bmw",
        // Fixed 2026-07-23: isAmbiguousMakeSwitchRequest() in
        // chatConversationState.ts now routes this to a deterministic
        // clarifier ("which make would you like to see instead?") with NO
        // query and NO grounded old-make vehicles — the reply can no longer
        // contradict itself by listing BMWs under its own question, and it
        // no longer depends on the model choosing to behave (source was
        // "model" and flaky before; now source: "deterministic").
      },
    ],
  },
  {
    name: "FIXED 2026-07-23: numeral ordinals resolve through the deterministic path",
    turns: [
      "do you have a 20k budget worth of cars?",
      {
        text: "open the 3rd one",
        expect: "taking you",
        // Fixed 2026-07-23: ORDINAL_TOKEN_PATTERN + ORDINAL_STANDALONE_PATTERN
        // in chatConversationState.ts accept 1st/2nd/3rd…, fourth–tenth, and
        // "#3"/"number 3", all mapped through the same deterministic
        // ordinalResultSetVehicleId() lookup as the spelled-out words.
        // Verified live: position 3 of the stored resultSet (0a71954e) is
        // exactly the vehicleId in the emitted navigate-target action, and
        // the turn answers with source: "deterministic" instead of the model
        // improvising (previously: wrong vehicle with confidence, or
        // "vehicle ID could not be verified" — same root cause, two modes).
      },
    ],
  },
  {
    name: "FIXED 2026-07-23: 'whole'/'entire' inventory reset synonyms",
    turns: [
      "any bmws less than 70k?",
      {
        text: "back to the whole inventory",
        expect: "1,283",
        reject: "6 matching",
        // Fixed 2026-07-23: FULL_INVENTORY_RESET_PATTERN now covers
        // whole/entire/full/complete + inventory/vehicles/cars/makes/stock.
        // Pre-fix this answered "6 matching vehicles found" (the stale BMW
        // scope); post-fix it shows the real full inventory. NOTE: the
        // "1,283" count is data-dependent — update it if the demo tenant's
        // inventory changes. Do NOT reject "bmw" here: a correct
        // full-inventory listing may legitimately include one.
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

/** The full regression suite: starter scenarios + both exploration batches. */
export const scenarios = [
  ...starterScenarios,
  ...exploreScenarios,
  ...explore2Scenarios,
];
