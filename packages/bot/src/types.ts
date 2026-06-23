import type { z } from "zod";
import type {
  BotAction,
  TenantId,
  VehicleListResponse,
  VehicleQuery,
} from "@lume/types";

/**
 * Capabilities injected into a tool at execution time. Keeping data access
 * behind this interface (rather than importing @lume/db directly) keeps
 * @lume/bot dependency-light and unit-testable with a fake executor — the
 * admin API route wires `queryVehicles` to the real tenant-scoped Supabase
 * query when it constructs the context.
 */
export type BotToolContext = {
  tenantId: TenantId;
  queryVehicles: (query: VehicleQuery) => Promise<VehicleListResponse>;
};

export type BotToolError = {
  code: "unknown_tool" | "invalid_args" | "execution_error";
  message: string;
};

/**
 * Normalised result of a tool run. `data` is fed back to the LLM for
 * follow-up reasoning; `actions` are emitted on the public BotAction bus so
 * the UI reacts (e.g. applying inventory filters or highlighting a result).
 */
export type BotToolResult<TData = unknown> = {
  ok: boolean;
  /** Short natural-language summary the model can relay to the visitor. */
  summary: string;
  data?: TData;
  actions?: BotAction[];
  error?: BotToolError;
};

export type BotTool<TSchema extends z.ZodType = z.ZodType> = {
  /** Function name the LLM calls. snake_case to match tool-calling conventions. */
  name: string;
  description: string;
  schema: TSchema;
  execute: (args: z.infer<TSchema>, ctx: BotToolContext) => Promise<BotToolResult>;
};

/**
 * Type-erased tool for storage in the registry. Each tool is authored with a
 * specific `BotTool<TSchema>` for internal type-safety, but a registry holding
 * mixed schemas needs the generic erased — `BotTool<SpecificSchema>` is not
 * assignable to `BotTool<z.ZodType>` due to invariance of the schema field.
 */
export type AnyBotTool = {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (args: any, ctx: BotToolContext) => Promise<BotToolResult>;
};

/** OpenAI / DeepSeek function-calling tool specification. */
export type ToolSpec = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: import("./jsonSchema").JsonSchema;
  };
};
