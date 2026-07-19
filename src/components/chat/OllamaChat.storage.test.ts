import { describe, expect, it } from "vitest";
import {
  sanitizeStoredChatMessages,
  stripLegacyProviderMarkup,
} from "./OllamaChat.storage";

const VEHICLE_ID = "5d6df0bd-85db-471e-9c4c-effa3c4938ab";

describe("stored chat migration", () => {
  it("removes legacy DSML while preserving the assistant's real prose", () => {
    const content = [
      "I checked the selected vehicle's current details.",
      "<｜｜DSML｜｜tool_calls>",
      '<｜｜DSML｜｜invoke name="get_vehicle_details">',
      `<｜｜DSML｜｜parameter name="vehicleId" string="true">${VEHICLE_ID}</｜｜DSML｜｜parameter>`,
      "</｜｜DSML｜｜invoke>",
      "</｜｜DSML｜｜tool_calls>",
    ].join("\n");
    expect(stripLegacyProviderMarkup(content)).toBe(
      "I checked the selected vehicle's current details.",
    );
    expect(
      sanitizeStoredChatMessages([
        { id: "user-1", role: "user", content: "take me to that page" },
        {
          id: "assistant-1",
          role: "assistant",
          content,
          sourceCategories: ["vehicles"],
        },
      ]),
    ).toEqual([
      { id: "user-1", role: "user", content: "take me to that page" },
      {
        id: "assistant-1",
        role: "assistant",
        content: "I checked the selected vehicle's current details.",
        sourceCategories: ["vehicles"],
      },
    ]);
  });

  it("drops empty control-only and malformed stored entries", () => {
    expect(
      sanitizeStoredChatMessages([
        {
          id: "control-only",
          role: "assistant",
          content: "<｜｜DSML｜｜tool_calls>",
        },
        { role: "assistant", content: "missing id" },
        null,
      ]),
    ).toEqual([]);
  });

  it("removes empty JSON protocol fences from an existing conversation", () => {
    expect(
      stripLegacyProviderMarkup(
        ["Taking you there now.", "", "```json", "```"].join("\n"),
      ),
    ).toBe("Taking you there now.");
    expect(
      sanitizeStoredChatMessages([
        {
          id: "empty-json-fence",
          role: "assistant",
          content: ["```json", "```"].join("\n"),
        },
      ]),
    ).toEqual([]);
  });
});
