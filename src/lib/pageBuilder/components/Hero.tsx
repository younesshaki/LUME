import type { BlockComponentProps } from "../registry";
import { usePageBuilderRenderContext } from "../renderContext";
import { HeroView } from "@lume/blocks/react/Hero";
import { AutomotiveHero } from "./AutomotiveHero";
import { stringProp } from "./props";
import "./PageBuilderBlocks.css";
import "@/experience/ui/ContactPage/ContactPage.css";
import "@/experience/ui/ProductsPage/ProductsPage.css";
import "@/experience/ui/ShowcasePage/ShowcasePage.css";
import "@/experience/ui/StoryHomePage/StoryHomePage.css";
import "@/experience/ui/VehiclesPage/VehiclesPage.css";
export function Hero(props: BlockComponentProps) {
  const { pageSlug } = usePageBuilderRenderContext();
  const variant = stringProp(props.block, "variant", "classic");
  return (
    <HeroView
      {...props}
      pageSlug={pageSlug}
      automotiveHero={
        variant === "split" ||
        variant === "search" ||
        variant === "fullBleed" ? (
          <AutomotiveHero {...props} variant={variant} />
        ) : undefined
      }
    />
  );
}
