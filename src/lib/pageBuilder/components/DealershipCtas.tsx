import { useId } from "react";
import type { BlockComponentProps } from "../registry";
import * as shared from "@lume/blocks/react/DealershipCtas";
export { AnnouncementBar } from "@lume/blocks/react/AnnouncementBar";
export function WhatsAppCta(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return <shared.WhatsAppCta {...props} sectionHeadingId={sectionHeadingId} />;
}
export function CtaBanner(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return <shared.CtaBanner {...props} sectionHeadingId={sectionHeadingId} />;
}
