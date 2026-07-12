import { describe, expect, it } from "vitest";
import { parseWebhookRetrySeconds, validateCrmWebhookInput } from "./crmWebhooks";

describe("CRM webhook configuration", () => {
  it("validates a public endpoint and bounded retry policy", () => {
    expect(validateCrmWebhookInput({
      name: " HubSpot Leads ",
      endpointUrl: "https://hooks.example.com/hubspot",
      integrationKind: "hubspot",
      retryDelays: "60, 300, 1800",
    })).toEqual({ ok: true, value: {
      name: "HubSpot Leads",
      endpointUrl: "https://hooks.example.com/hubspot",
      integrationKind: "hubspot",
      retryDelaysSeconds: [60, 300, 1800],
    } });
    expect(parseWebhookRetrySeconds("0,60")).toBeNull();
    expect(parseWebhookRetrySeconds(Array(11).fill("1").join(","))).toBeNull();
  });

  it("rejects local or insecure webhook destinations", () => {
    expect(validateCrmWebhookInput({
      name: "Local",
      endpointUrl: "http://127.0.0.1/hook",
      integrationKind: "custom",
      retryDelays: "60",
    })).toMatchObject({ ok: false });
  });
});
