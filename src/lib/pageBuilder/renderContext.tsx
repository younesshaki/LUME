import { createContext, useContext } from "react";

export type PageBuilderRenderContextValue = {
  pageSlug: string;
  onEnterShowcase?: (partIndex: number, chapterIndex: number) => void;
  onSelectProduct?: (productId: string) => void;
  onSelectVehicle?: (vehicleId: string) => void;
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
