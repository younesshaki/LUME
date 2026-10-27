import { useId } from "react";
import type { BlockComponentProps } from "../registry";
import { TradeInForm as SharedTradeIn } from "@lume/blocks/react/TradeInFormVariants";
import { LeadServicesProvider } from "@lume/blocks/react/LeadServices";
import { services } from "./DealershipForms";
import "./TradeInFormVariants.css";
export function TradeInForm(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return (
    <LeadServicesProvider value={services}>
      <SharedTradeIn {...props} sectionHeadingId={sectionHeadingId} />
    </LeadServicesProvider>
  );
}
