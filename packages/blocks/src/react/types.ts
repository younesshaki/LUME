import type { PageBlock } from "@lume/types";
import type { BlockMode } from "../blockTypes";
export type BlockComponentProps = {
  block: PageBlock;
  sectionHeadingId?: string;
  mode: BlockMode;
};
