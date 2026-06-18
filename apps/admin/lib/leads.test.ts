import { describe, expect, it } from "vitest";
import { normalizeLeadCaptureInput } from "./leads";

describe("normalizeLeadCaptureInput", () => {
  it("requires at least one reachable contact method", () => {
    expect(normalizeLeadCaptureInput({ message: "Hello" })).toEqual({
      ok: false,
      error: "Email or phone is required.",
    });
  });

  it("rejects invalid email addresses", () => {
    expect(normalizeLeadCaptureInput({ email: "not-email" })).toEqual({
      ok: false,
      error: "Email is invalid.",
    });
  });

  it("normalizes public lead capture fields", () => {
    expect(
      normalizeLeadCaptureInput({
        firstName: " Ada ",
        lastName: " Lovelace ",
        email: " ada@example.com ",
        source: "chat",
        message: "Interested",
      })
    ).toEqual({
      ok: true,
      value: {
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        phone: null,
        message: "Interested",
        vehicleId: null,
        source: "chat",
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
      },
    });
  });
});
