/**
 * Long-conversation state-drift regressions (2026-07-23).
 *
 * Every scenario intentionally crosses 10+ turns or reproduces one of the
 * exact reported multi-step failures. Action assertions are first-class:
 * correct prose with no matching UI action is a failed turn.
 */
export const scenarios = [
  {
    name: "state drift repro 1: repeated full reset always synchronizes the UI",
    turns: [
      "do you have a 2026 Camry?",
      "open the first one",
      "any bmws less than 70k?",
      "open the 2nd one",
      "how much is it?",
      { text: "back to the whole inventory", expectAction: "filter_inventory" },
      "do you have a 2026 Camry?",
      "open the first one",
      { text: "back to the whole inventory", expectAction: "filter_inventory" },
      { text: "back to the whole inventory", expectAction: "filter_inventory" },
    ],
  },
  {
    name: "state drift repro 2: BMW selection cannot contaminate a later Camry query",
    turns: [
      "do you have a 2026 Camry?",
      { text: "back to the whole inventory", expectAction: "filter_inventory" },
      "do you have a 2026 Camry?",
      "any bmws less than 70k?",
      "open the 2nd one",
      { text: "how much is it?", expect: "bmw" },
      {
        text: "do you have a 2026 Camry?",
        expect: "camry",
        reject: "2026 BMW",
        expectAction: "filter_inventory",
      },
    ],
  },
  {
    name: "state drift repro 3: aged Camry scope does not leak into a broad budget query",
    turns: [
      "do you have a 2026 Camry?",
      "are these cars reliable?",
      "do they have accident history?",
      "do you have service records?",
      "what about maintenance history?",
      "do they have heated seats?",
      "what options are verified?",
      "can you confirm their condition?",
      "do you have carfax reports?",
      {
        text: "do you have a 20k budget worth of cars?",
        reject: "2026 Camry",
        expectAction: "filter_inventory",
      },
    ],
  },
  {
    name: "long probe 1: repeated make switches keep ordinals on the newest list",
    turns: [
      "do you have a 2026 Camry?",
      "open the first one",
      "any bmws less than 70k?",
      "open the second one",
      { text: "how much is it?", expect: "bmw" },
      "show me Mazda vehicles under 40k",
      "open the first one",
      { text: "how much is it?", expect: "mazda" },
      "do you have a 2026 Camry?",
      { text: "open the second one", expectAction: "navigate-target" },
    ],
  },
  {
    name: "long probe 2: resets repeatedly discard selections and rebuild order",
    turns: [
      "show me BMWs under 70k",
      "open the second one",
      { text: "back to the whole inventory", expectAction: "filter_inventory" },
      { text: "open it", reject: "taking you" },
      "do you have a 2026 Camry?",
      "open the third one",
      "how much is it?",
      { text: "clear all filters", expectAction: "filter_inventory" },
      { text: "open it", reject: "taking you" },
      { text: "show me BMWs under 70k", expect: "bmw" },
    ],
  },
  {
    name: "long probe 3: zero-result rollback cannot poison later make switches",
    turns: [
      "show me BMW SUVs under 70k",
      "open the first one",
      "only AWD ones",
      "do you have a 2026 Camry?",
      { text: "open the first one", expectAction: "navigate-target" },
      "any bmws less than 70k?",
      { text: "open the second one", expectAction: "navigate-target" },
      "do you have a 2026 Camry?",
      {
        text: "show me",
        expectAction: "filter_inventory",
        expectActionFields: { type: "filter_inventory", model: "Camry" },
        rejectActionFields: { type: "filter_inventory", make: "BMW" },
      },
      { text: "back to the whole inventory", expectAction: "filter_inventory" },
    ],
  },
  {
    name: "long probe 4: compare and ordinal operations never resurrect an old list",
    turns: [
      "do you have a 2026 Camry?",
      "compare the first two",
      "open the second one",
      { text: "back to the whole inventory", expectAction: "filter_inventory" },
      "show me BMWs under 70k",
      { text: "compare the first two", expect: "comparison" },
      "open the first one",
      { text: "how much is it?", expect: "bmw" },
      "do you have a 2026 Camry?",
      { text: "compare the first two", expect: "comparison", reject: "BMW X1" },
    ],
  },
  {
    name: "long probe 5: immediate refinement inherits, aged broad budget starts fresh",
    turns: [
      "do you have a 2026 Camry?",
      { text: "under 40k", expect: "matching" },
      "show me",
      "are these cars reliable?",
      "do they have accident history?",
      "do you have service records?",
      "what features are verified?",
      "can you confirm their condition?",
      "do you have carfax reports?",
      {
        text: "show me vehicles under 20k",
        reject: "2026 Camry",
        expectAction: "filter_inventory",
      },
    ],
  },
];
