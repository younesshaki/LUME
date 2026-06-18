import { registerBlockComponent } from "./registry";
import {
  FeatureBand,
  Hero,
  ProductGrid,
  RichText,
  ShowcaseGallery,
  StatementList,
  VehicleInventory,
} from "./components";

let registered = false;

/**
 * Bind shared block type ids to public React components. This is idempotent so
 * tests, HMR, and app startup can call it without duplicating registry work.
 */
export function registerBlocks(): void {
  if (registered) return;

  registerBlockComponent("hero", Hero);
  registerBlockComponent("feature-band", FeatureBand);
  registerBlockComponent("statement-list", StatementList);
  registerBlockComponent("rich-text", RichText);
  registerBlockComponent("product-grid", ProductGrid);
  registerBlockComponent("vehicle-inventory", VehicleInventory);
  registerBlockComponent("showcase-gallery", ShowcaseGallery);

  registered = true;
}
