/**
 * Exploration batch 2 (2026-07-23 autonomous session) — ordinal-adjacent
 * detail questions, ambiguity chains, and filter-surface probes.
 */
export const scenarios = [
  {
    name: "explore2: full reset after a selection forgets the selected vehicle (session 2c19e8d4 repro)",
    turns: [
      "do you have a 20k budget worth of cars?",
      { text: "open the 3rd one", expect: "taking you" },
      "any bmws less than 70k?",
      {
        text: "back to the whole inventory",
        expect: "1,283",
        reject: "details on that",
        // FIXED 2026-07-23: turn 4 of session 2c19e8d4 replied with the
        // previously SELECTED Jeep Grand Cherokee's detail text ("Here are
        // the details on that 2018 Jeep Grand Cherokee Limited", duplicated)
        // instead of the reset inventory. Root cause: transitionInventoryState
        // cleared filters on resetScope but kept selectedVehicleId, and the
        // route grounded the model in that stale selection. Now resetScope
        // clears selectedVehicleId + resultSet, and reset turns skip the
        // selection-grounding candidate entirely. NOTE: reject targets the
        // failure's detail-narration phrasing, NOT "grand cherokee" — the
        // full-inventory list may legitimately include that Jeep. "1,283"
        // is data-dependent — update if demo inventory changes.
      },
    ],
  },
  {
    name: "explore2: 'yes' after an either/or clarifier is never guessed",
    turns: [
      "show me BMW SUVs",
      { text: "what about a different make?", expect: "which make" },
      { text: "yes", expect: "first option or the second" },
    ],
  },
  {
    name: "explore2: ordinal detail question 'what about the 4th?' answers from stored results",
    turns: [
      "do you have a 2026 Camry?",
      { text: "what about the 4th one?", expect: "4th" },
    ],
  },
  {
    name: "explore2: ordinal + fact 'is the first one AWD?'",
    turns: [
      "do you have a 2026 Camry?",
      // probe: should answer from the stored result's real drivetrain
      "is the first one AWD?",
    ],
  },
  {
    name: "explore2: 'open the last one' resolves when the snapshot is complete",
    turns: [
      "do you have a 2026 Camry?",
      { text: "open the last one", expect: "taking you" },
    ],
  },
  {
    name: "explore2: 'open the last one' declines safely when the snapshot is truncated",
    turns: [
      "show me cars under 20k",
      // 128 matches but only 30 stored — 'last' must not guess position 30
      { text: "open the last one", reject: "taking you" },
    ],
  },
  {
    name: "explore2: '2020 or newer' sets a year floor",
    turns: [
      { text: "show me 2020 or newer Toyotas", expect: "matching" },
    ],
  },
  {
    name: "explore2: 'between 30 and 40 grand' sets a price band",
    turns: [
      { text: "any BMWs between 30 and 40 grand?", expect: "bmw" },
    ],
  },
  {
    name: "explore2: location filter 'anything in Texas?'",
    turns: [
      // verified: extracted {sellerState:"TX"} -> 93 vehicles; the reply
      // names Texas but doesn't say "matching" (assertion fixed 2026-07-23)
      { text: "do you have anything in Texas?", expect: "texas" },
    ],
  },
  {
    name: "explore2: color request 'any red cars?' doesn't fabricate a filter",
    turns: [
      // exteriorColor is not a structured filter — probe what happens
      "any red cars?",
    ],
  },
  {
    name: "explore2: transmission request 'automatic only' doesn't fabricate a filter",
    turns: [
      // transmission is not a structured filter either — probe
      "show me automatic transmission cars only",
    ],
  },
  {
    name: "explore2: superlative + make 'what's the cheapest Toyota?'",
    turns: [
      { text: "what's the cheapest Toyota?", expect: "toyota" },
    ],
  },
  {
    name: "explore2: mileage detail on ordinal 'how many miles does the 2nd one have?'",
    turns: [
      "do you have a 2026 Camry?",
      { text: "how many miles does the 2nd one have?", expect: "mi" },
    ],
  },
];
