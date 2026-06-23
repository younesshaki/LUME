import type { AnyBotTool, BotToolContext, BotToolResult, ToolSpec } from "./types";
import { zodToJsonSchema } from "./jsonSchema";
import { findVehiclesTool } from "./tools/findVehicles";
import { findBestDealTool } from "./tools/findBestDeal";
import { getVehicleDetailsTool } from "./tools/getVehicleDetails";
import { compareVehiclesTool } from "./tools/compareVehicles";

/** All tools the bot may call, keyed by their LLM-facing name. */
export const BOT_TOOLS: readonly AnyBotTool[] = [
  findVehiclesTool,
  findBestDealTool,
  getVehicleDetailsTool,
  compareVehiclesTool,
];

const TOOLS_BY_NAME = new Map<string, AnyBotTool>(BOT_TOOLS.map((tool) => [tool.name, tool]));

export function getBotTool(name: string): AnyBotTool | undefined {
  return TOOLS_BY_NAME.get(name);
}

/**
 * Convert the registry into the `tools` array DeepSeek/OpenAI expect on a
 * chat-completion request.
 */
export function toToolSpecs(tools: readonly AnyBotTool[] = BOT_TOOLS): ToolSpec[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.schema),
    },
  }));
}

/**
 * Validate raw arguments (as produced by the model) against the tool schema
 * and execute. Always resolves to a normalised BotToolResult — schema and
 * runtime failures become structured errors rather than thrown exceptions,
 * so the multi-step runner and the API route can handle them uniformly.
 */
export async function runBotTool(
  name: string,
  rawArgs: unknown,
  ctx: BotToolContext
): Promise<BotToolResult> {
  const tool = getBotTool(name);
  if (!tool) {
    return {
      ok: false,
      summary: `Unknown tool: ${name}.`,
      error: { code: "unknown_tool", message: `No tool registered as "${name}".` },
    };
  }

  const parsed = tool.schema.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      ok: false,
      summary: "Those tool arguments were invalid.",
      error: { code: "invalid_args", message: parsed.error.message },
    };
  }

  try {
    return await tool.execute(parsed.data, ctx);
  } catch (error) {
    return {
      ok: false,
      summary: "The tool failed to run.",
      error: {
        code: "execution_error",
        message: error instanceof Error ? error.message : "Unknown execution error.",
      },
    };
  }
}
