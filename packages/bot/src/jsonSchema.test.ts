import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "./jsonSchema";

describe("zodToJsonSchema", () => {
  it("maps an object with required and optional fields", () => {
    const schema = z.object({
      make: z.string().describe("Manufacturer"),
      priceMax: z.number().optional(),
    });
    const json = zodToJsonSchema(schema);
    expect(json.type).toBe("object");
    expect(json.properties?.make).toEqual({ type: "string", description: "Manufacturer" });
    expect(json.properties?.priceMax).toEqual({ type: "number" });
    expect(json.required).toEqual(["make"]);
  });

  it("treats defaulted fields as optional (not required)", () => {
    const schema = z.object({ limit: z.number().int().default(12) });
    const json = zodToJsonSchema(schema);
    expect(json.required).toBeUndefined();
    expect(json.properties?.limit).toEqual({ type: "integer" });
  });

  it("emits enum values and integer constraints", () => {
    const schema = z.object({
      stockType: z.enum(["New", "Used"]),
      year: z.number().int().min(1990).max(2030),
    });
    const json = zodToJsonSchema(schema);
    expect(json.properties?.stockType).toEqual({ type: "string", enum: ["New", "Used"] });
    expect(json.properties?.year).toEqual({ type: "integer", minimum: 1990, maximum: 2030 });
  });

  it("handles arrays of primitives", () => {
    const schema = z.object({ tags: z.array(z.string()) });
    const json = zodToJsonSchema(schema);
    expect(json.properties?.tags).toEqual({ type: "array", items: { type: "string" } });
  });
});
