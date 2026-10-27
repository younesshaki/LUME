import { useId } from "react";
import "./DealershipBlocks.css";
import type { BlockComponentProps } from "../registry";
import { submitLead } from "@/lib/leads";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import * as shared from "@lume/blocks/react/DealershipForms";
import { LeadServicesProvider } from "@lume/blocks/react/LeadServices";
export type { ContactState } from "@lume/blocks/react/DealershipForms";
export {
  ContactFields,
  EMPTY_CONTACT,
  FormFeedback,
} from "@lume/blocks/react/DealershipForms";
export const services = {
  submitLead,
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim(),
  Verification: TurnstileWidget,
};
export function useLeadSubmission(message: string) {
  return shared.useLeadSubmission(message, services);
}
export function FormVerification(
  props: Parameters<typeof shared.FormVerification>[0],
) {
  return (
    <LeadServicesProvider value={services}>
      <shared.FormVerification {...props} />
    </LeadServicesProvider>
  );
}
export function submitDisabled(
  submission: Parameters<typeof shared.submitDisabled>[0],
  token: string | null,
) {
  return shared.submitDisabled(
    submission,
    token,
    Boolean(services.turnstileSiteKey),
  );
}
export function FinanceCalculator(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return (
    <LeadServicesProvider value={services}>
      <shared.FinanceCalculator
        {...props}
        sectionHeadingId={sectionHeadingId}
      />
    </LeadServicesProvider>
  );
}
export function LeadCaptureForm(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return (
    <LeadServicesProvider value={services}>
      <shared.LeadCaptureForm {...props} sectionHeadingId={sectionHeadingId} />
    </LeadServicesProvider>
  );
}
export function NewsletterSignup(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return (
    <LeadServicesProvider value={services}>
      <shared.NewsletterSignup {...props} sectionHeadingId={sectionHeadingId} />
    </LeadServicesProvider>
  );
}
export function ServiceBooking(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return (
    <LeadServicesProvider value={services}>
      <shared.ServiceBooking {...props} sectionHeadingId={sectionHeadingId} />
    </LeadServicesProvider>
  );
}
export function TestDriveBooking(props: BlockComponentProps) {
  const sectionHeadingId = useId();
  return (
    <LeadServicesProvider value={services}>
      <shared.TestDriveBooking {...props} sectionHeadingId={sectionHeadingId} />
    </LeadServicesProvider>
  );
}
