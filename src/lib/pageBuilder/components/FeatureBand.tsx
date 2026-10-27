import type { BlockComponentProps } from "../registry";
import { mediaUrl } from "@/config/cdn";
import { FeatureBandView } from "@lume/blocks/react/FeatureBand";
import "@/experience/ui/StoryHomePage/StoryHomePage.css";
export function FeatureBand(props: BlockComponentProps) {
  return <FeatureBandView {...props} mediaUrl={mediaUrl} />;
}
