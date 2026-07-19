import { describe, expect, it } from "vitest";
import { mergeConciergeTargets } from "@lume/types";
import { DEFAULT_BOT_PERSONA_CAPABILITIES } from "./persona";
import {
  actionOnlyAcknowledgement,
  exactGroundedVehicleId,
  recentVehicleIdFromAssistantHistory,
  recentVehicleIdFromToolResults,
  resolveDeterministicConciergeNavigation,
} from "./chatNavigation";

const VEHICLE_ID = "5d6df0bd-85db-471e-9c4c-effa3c4938ab";
const BMW_2016_ID = "877ad1ad-0cdf-47dd-9930-127089b60e10";
const BMW_2020_ID = "39d724a5-0d3a-4d3e-8918-5ed980855ee0";
const targets = mergeConciergeTargets([]);
const capabilities = DEFAULT_BOT_PERSONA_CAPABILITIES;
const groundedBmws = [
  {
    id: BMW_2016_ID,
    year: 2016,
    make: "BMW",
    model: "3 Series 328i xDrive",
    trim: "",
    price: 11_995,
    mileage: 129_832,
  },
  {
    id: BMW_2020_ID,
    year: 2020,
    make: "BMW",
    model: "X3",
    trim: "xDrive30i",
    price: 108_500,
    mileage: 54_153,
  },
];

function resolve(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  selectedVehicleId: string | null = null,
) {
  return resolveDeterministicConciergeNavigation({
    messages,
    targets,
    selectedVehicleId,
    capabilities,
  });
}

describe("deterministic concierge navigation", () => {
  it.each([
    ["take me to the products page", "products"],
    ["take me to the contact page", "contact-lead-form"],
    ["open the inventory page", "inventory"],
    ["go to my account", "account"],
    ["take me home", "home"],
    ["open the showcase", "showcase"],
  ])("resolves an explicit %s request to %s", (content, targetKey) => {
    expect(resolve([{ role: "user", content }])).toEqual([
      { type: "navigate-target", targetKey },
    ]);
  });

  it("uses the grounded selected vehicle for referential page navigation", () => {
    expect(
      resolve(
        [{ role: "user", content: "take me to that page" }],
        VEHICLE_ID,
      ),
    ).toEqual([
      {
        type: "navigate-target",
        targetKey: "vehicle-detail",
        params: { vehicleId: VEHICLE_ID },
      },
    ]);
  });

  it("applies the canonical make filter for a grounded brand inventory question", () => {
    expect(
      resolveDeterministicConciergeNavigation({
        messages: [{ role: "user", content: "do you have any BMW" }],
        targets,
        groundedVehicles: groundedBmws,
        inventoryFilters: { make: "Bmw" },
        capabilities,
      }),
    ).toEqual([{ type: "filter_inventory", make: "BMW" }]);
  });

  it("resolves both exact BMW requests from the reported transcript", () => {
    expect(
      resolveDeterministicConciergeNavigation({
        messages: [{
          role: "user",
          content: "open - **2016 BMW 328i xDrive** — 129,832 miles — $11,995",
        }],
        targets,
        groundedVehicles: groundedBmws,
        inventoryFilters: { make: "Bmw", year: 2016 },
        capabilities,
      }),
    ).toEqual([{
      type: "navigate-target",
      targetKey: "vehicle-detail",
      params: { vehicleId: BMW_2016_ID },
    }]);
    expect(
      resolveDeterministicConciergeNavigation({
        messages: [{
          role: "user",
          content:
            "take me to - **2020 BMW X3 xDrive30i** — 54,153 miles — $108,500",
        }],
        targets,
        groundedVehicles: groundedBmws,
        inventoryFilters: { make: "Bmw", year: 2020 },
        capabilities,
      }),
    ).toEqual([{
      type: "navigate-target",
      targetKey: "vehicle-detail",
      params: { vehicleId: BMW_2020_ID },
    }]);
  });

  it("fails closed when a grounded vehicle description is still ambiguous", () => {
    const duplicate = {
      ...groundedBmws[1]!,
      id: "f13ee5f8-2308-4e95-a615-1c86332fb118",
    };
    expect(
      exactGroundedVehicleId(
        "open the 2020 BMW X3 xDrive30i",
        [groundedBmws[1]!, duplicate],
      ),
    ).toBeNull();
    expect(
      resolveDeterministicConciergeNavigation({
        messages: [{ role: "user", content: "show me used BMWs from 2020" }],
        targets,
        groundedVehicles: groundedBmws,
        inventoryFilters: { make: "Bmw", stockType: "Used", year: 2020 },
        capabilities,
      }),
    ).toEqual([]);
  });

  it("turns an affirmative reply to an inquiry offer into opening the real form", () => {
    expect(
      resolve(
        [
          {
            role: "assistant",
            content: "Would you like to submit an inquiry on this vehicle?",
          },
          { role: "user", content: "yes" },
        ],
        VEHICLE_ID,
      ),
    ).toEqual([
      {
        type: "navigate-target",
        targetKey: "vehicle-inquiry",
        params: { vehicleId: VEHICLE_ID },
      },
    ]);
  });

  it("covers the reported Ferrari follow-up navigation sequence", () => {
    const detailOffer = {
      role: "assistant" as const,
      content: "Would you like to submit an inquiry on this vehicle?",
    };
    expect(
      resolve(
        [detailOffer, { role: "user", content: "yes" }],
        VEHICLE_ID,
      ),
    ).toEqual([
      {
        type: "navigate-target",
        targetKey: "vehicle-inquiry",
        params: { vehicleId: VEHICLE_ID },
      },
    ]);
    expect(
      resolve(
        [{ role: "user", content: "take me to that page" }],
        VEHICLE_ID,
      ),
    ).toEqual([
      {
        type: "navigate-target",
        targetKey: "vehicle-detail",
        params: { vehicleId: VEHICLE_ID },
      },
    ]);
    expect(
      resolve([{ role: "user", content: "take me to the contact page" }]),
    ).toEqual([
      { type: "navigate-target", targetKey: "contact-lead-form" },
    ]);
    expect(
      resolve([{ role: "user", content: "take me to the products page" }]),
    ).toEqual([{ type: "navigate-target", targetKey: "products" }]);
  });

  it("does not guess from ambiguous prose or an ungrounded reference", () => {
    expect(resolve([{ role: "user", content: "yes" }], VEHICLE_ID)).toEqual([]);
    expect(
      resolve([{ role: "user", content: "take me to that page" }]),
    ).toEqual([]);
    expect(
      resolve([{ role: "user", content: "tell me about products" }]),
    ).toEqual([]);
    expect(
      resolve(
        [
          {
            role: "assistant",
            content: "Would you like to submit an inquiry on this vehicle?",
          },
          { role: "user", content: "What does that cost?" },
          { role: "user", content: "yes" },
        ],
        VEHICLE_ID,
      ),
    ).toEqual([]);
  });

  it("respects disabled targets and persona capabilities", () => {
    const disabledProducts = mergeConciergeTargets([
      { key: "products", enabled: false },
    ]);
    expect(
      resolveDeterministicConciergeNavigation({
        messages: [{ role: "user", content: "take me to products" }],
        targets: disabledProducts,
        capabilities,
      }),
    ).toEqual([]);
    expect(
      resolveDeterministicConciergeNavigation({
        messages: [{ role: "user", content: "take me to products" }],
        targets,
        capabilities: { ...capabilities, navigate: false },
      }),
    ).toEqual([]);
    expect(
      resolveDeterministicConciergeNavigation({
        messages: [{ role: "user", content: "take me to the contact page" }],
        targets,
        capabilities: { ...capabilities, openLeadForm: false },
      }),
    ).toEqual([]);
  });
});

describe("selected vehicle continuity", () => {
  it("reads the latest exact vehicle from trusted remembered tool results", () => {
    expect(
      recentVehicleIdFromToolResults([
        {
          name: "get_vehicle_details",
          recordedAt: "2026-07-19T10:00:00.000Z",
          result: {
            ok: true,
            data: { vehicle: { id: VEHICLE_ID, make: "Ferrari" } },
          },
        },
      ]),
    ).toBe(VEHICLE_ID);
    expect(
      recentVehicleIdFromToolResults([
        {
          name: "get_vehicle_details",
          recordedAt: "2026-07-19T10:00:00.000Z",
          result: { data: { vehicle: { id: "not-a-uuid" } } },
        },
      ]),
    ).toBeNull();
  });

  it("recovers the exact vehicle from the user's leaked DSML transcript", () => {
    const raw = [
      "I checked the selected vehicle's current details.",
      "<｜｜DSML｜｜tool_calls>",
      '<｜｜DSML｜｜invoke name="get_vehicle_details">',
      `<｜｜DSML｜｜parameter name="vehicleId" string="true">${VEHICLE_ID}</｜｜DSML｜｜parameter>`,
      "</｜｜DSML｜｜invoke>",
      "</｜｜DSML｜｜tool_calls>",
    ].join("\n");
    expect(
      recentVehicleIdFromAssistantHistory([
        { role: "user", content: "take me to that page" },
        { role: "assistant", content: raw },
      ]),
    ).toBe(VEHICLE_ID);
  });

  it("never treats an arbitrary prose UUID as selected state", () => {
    expect(
      recentVehicleIdFromAssistantHistory([
        {
          role: "assistant",
          content: `Here is an unrelated identifier: ${VEHICLE_ID}`,
        },
      ]),
    ).toBeNull();
  });
});

describe("action-only acknowledgement", () => {
  it("describes deterministic filters and navigation without exposing JSON", () => {
    expect(
      actionOnlyAcknowledgement([{ type: "filter_inventory", make: "BMW" }]),
    ).toBe("I’ve opened the inventory with those filters applied.");
    expect(
      actionOnlyAcknowledgement([
        { type: "navigate-target", targetKey: "products" },
      ]),
    ).toBe("Taking you there now.");
    expect(actionOnlyAcknowledgement([])).toBe("");
  });
});
