/**
 * Exploration batch 3 (2026-07-23 session 2) — CHAINED state combinations:
 * selection + filter change + reset + ordinal in sequence. The
 * selection-leak bug (session 2c19e8d4) only appeared because of turn
 * ordering; these probe that class deliberately.
 */
export const scenarios = [
  {
    name: "explore3: reset then 'open it' does NOT resurrect the old selection",
    turns: [
      "do you have a 2026 Camry?",
      { text: "open the first one", expect: "taking you" },
      "back to the whole inventory",
      // 'open it' has no selected vehicle anymore — must decline, not reopen
      { text: "open it", reject: "taking you" },
    ],
  },
  {
    name: "explore3: ordinal after make-switch resolves against the NEW make's list",
    turns: [
      "do you have a 2026 Camry?",
      "any bmws less than 70k?",
      // position 2 must be a BMW (2nd of 6), never the 2nd Camry
      { text: "open the 2nd one", expect: "taking you" },
      { text: "how much is it?", expect: "bmw" },
    ],
  },
  {
    name: "explore3: reset then ordinal resolves against the fresh full-inventory list",
    turns: [
      "do you have a 2026 Camry?",
      "back to the whole inventory",
      { text: "open the 1st one", expect: "taking you" },
    ],
  },
  {
    name: "explore3: selection survives a compatible refinement, dies on reset",
    turns: [
      "do you have a 2026 Camry?",
      { text: "open the first one", expect: "taking you" },
      { text: "under 40k", expect: "matching" },
      // the selected vehicle may have dropped out of the refined list —
      // judgment call read from the transcript; no hard assertion
      "how much is it?",
      "back to the whole inventory",
      { text: "how much is it?", reject: "camry" },
    ],
  },
  {
    name: "explore3: zero-yield refinement keeps prior selection for detail questions",
    turns: [
      "show me BMW SUVs under 70k",
      { text: "open the 1st one", expect: "taking you" },
      { text: "only AWD ones", expect: "nothing matches" },
      // zero-yield preserves the old result set — the selection should still
      // answer detail questions from its real fields
      { text: "how much is it?", expect: "$" },
    ],
  },
  {
    name: "explore3: compare after reset uses the fresh list, not the old one",
    turns: [
      "do you have a 2026 Camry?",
      "back to the whole inventory",
      {
        text: "compare the first two",
        expect: "comparison",
        reject: "XSE Hybrid",
        // NOTE: reject is "XSE Hybrid" (position 1 of the PRE-reset 2026
        // Camry search), NOT "camry" — the fresh full-inventory list's #1 is
        // legitimately a 2022 Toyota Camry SE, so rejecting "camry" flakes
        // (failed once that way in a full-suite run 2026-07-23).
      },
    ],
  },
  {
    name: "explore3: budget search -> #2 select -> reset -> #1 select chain",
    turns: [
      "do you have a 20k budget worth of cars?",
      { text: "#2", expect: "taking you" },
      { text: "back to the whole inventory", reject: "grand cherokee" },
      { text: "#1", expect: "taking you" },
    ],
  },
  {
    name: "explore3: 'yes' with no pending either/or does not trigger the clarifier",
    turns: [
      "back to the whole inventory",
      // no two-option question was asked — a bare 'yes' must not produce
      // the 'first option or the second' clarifier
      { text: "yes", reject: "first option or the second" },
    ],
  },
];
