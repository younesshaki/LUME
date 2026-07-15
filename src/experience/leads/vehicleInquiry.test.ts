import { describe, expect, it, vi } from "vitest";
import {
  buildVehicleInquiryPayload,
  splitFullName,
  submitVehicleInquiry,
} from "./vehicleInquiry";

const vehicleId = "11111111-1111-4111-8111-111111111111";

describe("vehicle inquiry client", () => {
  it("splits a full name without losing compound surnames", () => {
    expect(splitFullName("  Ada Byron Lovelace  ")).toEqual({
      firstName: "Ada",
      lastName: "Byron Lovelace",
    });
    expect(splitFullName("Prince")).toEqual({ firstName: "Prince", lastName: "" });
  });

  it("builds tenant-safe vehicle context and campaign attribution", () => {
    expect(buildVehicleInquiryPayload({
      fullName: "Ada Lovelace",
      email: " ada@example.com ",
      phone: " +1 555 0100 ",
      message: " I am interested. ",
      vehicleId,
      vehicleTitle: "2024 Ferrari Roma",
    }, "https://public.example/vehicles/111?utm_source=google&utm_medium=cpc&utm_campaign=summer&utm_content=hero", "https://search.example/results")).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "+1 555 0100",
      message: "I am interested.",
      vehicleId,
      source: "contact-form",
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "summer",
      utmContent: "hero",
      referrer: "https://search.example/results",
      sourceContext: {
        trigger: "vehicle-detail",
        actionType: "request-info",
        vehicleId,
        vehicleTitle: "2024 Ferrari Roma",
        pagePath: "/vehicles/111?utm_source=google&utm_medium=cpc&utm_campaign=summer&utm_content=hero",
      },
      turnstileToken: undefined,
    });
  });

  it("submits with visitor credentials and treats a 201 as a new lead", async () => {
    const fetcher = vi.fn(async () => Response.json({ leadId: "lead-1" }, { status: 201 }));

    await expect(submitVehicleInquiry({
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      vehicleId,
      vehicleTitle: "2024 Ferrari Roma",
    }, {
      fetcher: fetcher as typeof fetch,
      tenantSlug: "demo",
      pageUrl: "https://public.example/vehicles/111",
      timeoutMs: 1_000,
    })).resolves.toEqual({ leadId: "lead-1", duplicate: false });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/leads?tenant=demo");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Lume-Tenant": "demo",
      },
    });
  });

  it("treats a deduplicated 200 as success and surfaces upstream errors", async () => {
    await expect(submitVehicleInquiry({
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      vehicleId,
      vehicleTitle: "2024 Ferrari Roma",
    }, {
      fetcher: (async () => Response.json({ leadId: "lead-existing" }, { status: 200 })) as typeof fetch,
      tenantSlug: "demo",
      timeoutMs: 1_000,
    })).resolves.toEqual({ leadId: "lead-existing", duplicate: true });

    await expect(submitVehicleInquiry({
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      vehicleId,
      vehicleTitle: "2024 Ferrari Roma",
    }, {
      fetcher: (async () => Response.json({ error: "Vehicle is unavailable" }, { status: 400 })) as typeof fetch,
      tenantSlug: "demo",
      timeoutMs: 1_000,
    })).rejects.toThrow("Vehicle is unavailable");
  });
});
