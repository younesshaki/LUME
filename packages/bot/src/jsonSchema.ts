import { z } from "zod";

/**
 * Minimal JSON Schema shape — only the subset emitted for tool parameters.
 * Hand-rolled (rather than pulling in zod-to-json-schema) so @lume/bot owns
 * exactly the conversion the DeepSeek/OpenAI tool-calling API needs and stays
 * dependency-light. Covers the primitives the tool schemas actually use:
 * object, string, number, boolean, enum, array, optional/default/nullable.
 */
export type JsonSchema = {
  type?: "object" | "string" | "number" | "integer" | "boolean" | "array";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
  minimum?: number;
  maximum?: number;
};

type NumberCheck = { kind: string; value?: number };

function unwrap(schema: z.ZodTypeAny): { inner: z.ZodTypeAny; optional: boolean } {
  let current = schema;
  let optional = false;
  // Peel optional/default/nullable wrappers, recording whether the field is
  // not required. ZodEffects (.refine/.transform) is unwrapped transparently.
  for (;;) {
    if (current instanceof z.ZodOptional) {
      optional = true;
      current = current.unwrap();
    } else if (current instanceof z.ZodDefault) {
      optional = true;
      current = current._def.innerType;
    } else if (current instanceof z.ZodNullable) {
      current = current.unwrap();
    } else if (current instanceof z.ZodEffects) {
      current = current._def.schema;
    } else {
      break;
    }
  }
  return { inner: current, optional };
}

function numberConstraints(schema: z.ZodNumber): { minimum?: number; maximum?: number; integer: boolean } {
  const checks = (schema._def.checks ?? []) as NumberCheck[];
  let minimum: number | undefined;
  let maximum: number | undefined;
  let integer = false;
  for (const check of checks) {
    if (check.kind === "min" && typeof check.value === "number") minimum = check.value;
    if (check.kind === "max" && typeof check.value === "number") maximum = check.value;
    if (check.kind === "int") integer = true;
  }
  return { minimum, maximum, integer };
}

function convert(schema: z.ZodTypeAny): JsonSchema {
  const description = schema.description;
  const withDescription = (node: JsonSchema): JsonSchema =>
    description ? { ...node, description } : node;

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      const { inner, optional } = unwrap(value);
      properties[key] = convert(inner);
      if (!optional) required.push(key);
    }
    const node: JsonSchema = { type: "object", properties };
    if (required.length > 0) node.required = required;
    return withDescription(node);
  }

  if (schema instanceof z.ZodString) {
    return withDescription({ type: "string" });
  }

  if (schema instanceof z.ZodNumber) {
    const { minimum, maximum, integer } = numberConstraints(schema);
    const node: JsonSchema = { type: integer ? "integer" : "number" };
    if (minimum !== undefined) node.minimum = minimum;
    if (maximum !== undefined) node.maximum = maximum;
    return withDescription(node);
  }

  if (schema instanceof z.ZodBoolean) {
    return withDescription({ type: "boolean" });
  }

  if (schema instanceof z.ZodEnum) {
    return withDescription({ type: "string", enum: schema.options as string[] });
  }

  if (schema instanceof z.ZodArray) {
    const { inner } = unwrap(schema.element as z.ZodTypeAny);
    return withDescription({ type: "array", items: convert(inner) });
  }

  // Fallback: an open-ended object. Keeps the exporter total rather than
  // throwing on an unmodelled type.
  return withDescription({ type: "object" });
}

export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const { inner } = unwrap(schema);
  return convert(inner);
}
