import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_VISION_MODEL,
  describeVehicleImage,
  readVehicleImageDescriptionConfig,
} from "./vehicleImageDescriptions.server";

describe("vehicle image vision provider", () => {
  it("is disabled without a key and defaults to the ticketed Haiku model", () => {
    expect(readVehicleImageDescriptionConfig({})).toBeNull();
    expect(readVehicleImageDescriptionConfig({ ANTHROPIC_API_KEY: "test-key" }))
      .toEqual({ apiKey: "test-key", model: DEFAULT_VISION_MODEL });
  });

  it("sends a base64 image and returns the raw text block", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "text", text: "Raw vehicle description." }],
    }), { status: 200 }));
    const output = await describeVehicleImage(
      { apiKey: "test-key", model: "claude-test" },
      {
        bytes: new Uint8Array([1, 2, 3]).buffer,
        contentType: "image/jpeg",
        vehicle: { year: 2026, make: "LUME", model: "Aurora", trim: null },
      },
      fetchImpl,
    );
    expect(output).toBe("Raw vehicle description.");
    const request = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: Array<{ source?: { data?: string } }> }>;
    };
    expect(request.messages[0]?.content[0]?.source?.data).toBe("AQID");
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({
      "x-api-key": "test-key",
      "anthropic-version": "2023-06-01",
    });
  });
});
