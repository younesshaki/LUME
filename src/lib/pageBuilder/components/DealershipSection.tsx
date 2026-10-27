import { useId } from "react";
import type { ComponentProps } from "react";
import { DealershipSection as SharedSection } from "@lume/blocks/react/DealershipSection";
export { DealershipActionLink } from "@lume/blocks/react/DealershipSection";
import "./DealershipBlocks.css";
export function DealershipSection(props: ComponentProps<typeof SharedSection>) {
  const headingId = useId();
  return <SharedSection {...props} headingId={headingId} />;
}
