import type { BlockComponentProps } from "../registry";
import { AutomotiveHeroView } from "@lume/blocks/react/AutomotiveHero";
import { stringProp } from "./props";
import { VehicleQuickSearch } from "./VehicleQuickSearch";
import "./AutomotiveHero.css";
export { responsiveSrcSet } from "@lume/blocks/react/AutomotiveHero";
export function AutomotiveHero(
  props: BlockComponentProps & { variant: "split" | "search" | "fullBleed" },
) {
  return (
    <AutomotiveHeroView
      {...props}
      quickSearch={
        <VehicleQuickSearch
          className="autoHeroSearch"
          buttonLabel={
            stringProp(props.block, "primaryCtaLabel") || "Search inventory"
          }
          showCondition
        />
      }
    />
  );
}
