export type VehicleImageDescriptionInput = {
  bytes: ArrayBuffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  vehicle: { year: number; make: string; model: string; trim: string | null };
};

export type VehicleImageDescriptionConfig = {
  apiKey: string;
  model: string;
};

export const MAX_VISION_IMAGE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_VISION_MODEL = "claude-haiku-4-5-20251001";

export function readVehicleImageDescriptionConfig(
  environment?: Partial<Record<"ANTHROPIC_API_KEY" | "ANTHROPIC_MODEL", string | undefined>>,
): VehicleImageDescriptionConfig | null {
  const source = environment ?? process.env;
  const apiKey = source.ANTHROPIC_API_KEY?.trim();
  const model = source.ANTHROPIC_MODEL?.trim() || DEFAULT_VISION_MODEL;
  if (!apiKey || !/^[a-zA-Z0-9._:-]{3,200}$/.test(model)) return null;
  return { apiKey, model };
}

export async function describeVehicleImage(
  config: VehicleImageDescriptionConfig,
  input: VehicleImageDescriptionInput,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_VISION_IMAGE_BYTES) {
    throw new Error("Image exceeds the vision-model input limit.");
  }
  const base64 = Buffer.from(input.bytes).toString("base64");
  const vehicleLabel = [
    input.vehicle.year,
    input.vehicle.make,
    input.vehicle.model,
    input.vehicle.trim,
  ].filter(Boolean).join(" ");
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 300,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: input.contentType, data: base64 },
          },
          {
            type: "text",
            text: `Describe the vehicle visibly shown in this image for accessible ALT text and inventory search. Cover the visible make/model if identifiable, color, camera angle, body style, and notable visible features. Do not invent hidden specifications or use sales language. Inventory context: ${vehicleLabel}. Return one concise paragraph only.`,
          },
        ],
      }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Vision model returned HTTP ${response.status}.`);
  const value = await response.json() as unknown;
  if (!isRecord(value) || !Array.isArray(value.content)) {
    throw new Error("Vision model returned an invalid response.");
  }
  const output = value.content.flatMap((block): string[] =>
    isRecord(block) && block.type === "text" && typeof block.text === "string"
      ? [block.text]
      : []).join("\n");
  if (!output.trim() || output.length > 12_000) {
    throw new Error("Vision model returned invalid text.");
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
