export type {
  AnyBotTool,
  BotTool,
  BotToolContext,
  BotToolError,
  BotToolResult,
  ToolSpec,
} from "./types";
export type { JsonSchema } from "./jsonSchema";
export { zodToJsonSchema } from "./jsonSchema";
export {
  type DealScore,
  type MarketContext,
  type RankedVehicle,
  buildMarketContext,
  dealScore,
  rankByDealScore,
} from "./dealScore";
export {
  type FindVehiclesArgs,
  buildVehicleQuery,
  findVehiclesSchema,
  findVehiclesTool,
} from "./tools/findVehicles";
export {
  type FindBestDealArgs,
  findBestDealSchema,
  findBestDealTool,
} from "./tools/findBestDeal";
export { BOT_TOOLS, getBotTool, runBotTool, toToolSpecs } from "./registry";
