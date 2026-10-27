import { useId } from "react";
import type { BlockComponentProps } from "../registry";
import * as shared from "@lume/blocks/react/DealershipTrust";
import * as interactive from "@lume/blocks/react/TrustInteractive";
import { safeMediaSource } from "./dealershipBlockUtils";
export function TrustStats(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return (
    <interactive.TrustStats {...props} sectionHeadingId={sectionHeadingId} />
  );
}
export function FaqAccordion(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return (
    <interactive.FaqAccordion {...props} sectionHeadingId={sectionHeadingId} />
  );
}
export function LogoMarquee(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return (
    <interactive.LogoMarquee
      {...props}
      sectionHeadingId={sectionHeadingId}
      mediaSource={safeMediaSource}
    />
  );
}

export function Testimonials(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return <shared.Testimonials {...props} sectionHeadingId={sectionHeadingId} />;
}
export function ReviewSummary(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return (
    <shared.ReviewSummary {...props} sectionHeadingId={sectionHeadingId} />
  );
}
export function ServicesList(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return <shared.ServicesList {...props} sectionHeadingId={sectionHeadingId} />;
}
export function HowItWorks(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return <shared.HowItWorks {...props} sectionHeadingId={sectionHeadingId} />;
}
export function TeamGrid(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return <shared.TeamGrid {...props} sectionHeadingId={sectionHeadingId} />;
}
