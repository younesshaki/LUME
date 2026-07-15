import { describe, expect, it } from "vitest";
import { rowToLeadSourceContext } from "./mappers";

describe("rowToLeadSourceContext", () => {
  it("preserves the allowlisted vehicle inquiry context", () => {
    expect(
      rowToLeadSourceContext({
        trigger: "vehicle-inquiry",
        actionType: "request-info",
        pagePath: "/vehicles/vehicle-1",
        vehicleTitle: "2024 LUME Grand Touring",
        untrusted: "discarded",
      }),
    ).toEqual({
      trigger: "vehicle-inquiry",
      actionType: "request-info",
      pagePath: "/vehicles/vehicle-1",
      vehicleTitle: "2024 LUME Grand Touring",
    });
  });

  it("rejects unsupported context shapes", () => {
    expect(rowToLeadSourceContext({ trigger: "vehicle-inquiry", actionType: "delete" })).toBeNull();
  });
});
