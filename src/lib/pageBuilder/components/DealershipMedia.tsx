import { useId } from "react";
import type { BlockComponentProps } from "../registry";
import {
  SplitFeature as SharedSplit,
  GalleryMasonry as SharedGallery,
} from "@lume/blocks/react/DealershipMedia";
import { safeMediaSource } from "./dealershipBlockUtils";
import * as shared from "@lume/blocks/react/DealershipMedia";
export function VideoEmbed(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return <shared.VideoEmbed {...props} sectionHeadingId={sectionHeadingId} />;
}
export function MapHours(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return <shared.MapHours {...props} sectionHeadingId={sectionHeadingId} />;
}
export function FooterContact(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return (
    <shared.FooterContact {...props} sectionHeadingId={sectionHeadingId} />
  );
}
export function SplitFeature(props: BlockComponentProps) {
  const headingId = useId();
  return (
    <SharedSplit
      {...props}
      headingId={headingId}
      mediaSource={safeMediaSource}
    />
  );
}
export function GalleryMasonry(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return (
    <SharedGallery
      {...props}
      sectionHeadingId={sectionHeadingId}
      mediaSource={safeMediaSource}
    />
  );
}
