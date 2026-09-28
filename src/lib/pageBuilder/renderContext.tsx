import { createContext, useContext } from "react";

export type PageBuilderRenderContextValue = {
  pageSlug: string;
  onEnterShowcase?: (partIndex: number, chapterIndex: number) => void;
  onSelectProduct?: (productId: string) => void;
  onSelectVehicle?: (vehicleId: string) => void;
  /**
   * True inside the admin editor's live-preview iframe. Route-driven blocks
   * (the vehicle detail) use a sample from the tenant's own data there, so
   * edits to them are visible instead of a placeholder.
   */
  preview?: boolean;
};

const PageBuilderRenderContext = createContext<PageBuilderRenderContextValue>({
  pageSlug: "home",
});

export const PageBuilderRenderProvider = PageBuilderRenderContext.Provider;

/**
 * Block components stay registry-compatible by receiving only `{ block, mode }`.
 * Page-level actions and route-specific styling context come from this provider.
 */
export function usePageBuilderRenderContext(): PageBuilderRenderContextValue {
  return useContext(PageBuilderRenderContext);
}
