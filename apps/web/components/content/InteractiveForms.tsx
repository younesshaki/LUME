"use client";
import { TemplateConversionPanel } from "@lume/blocks/react/TemplateConversionPanel";
import type { SiteDesign } from "@lume/types";
import { getLeadAttribution } from "@lume/blocks/lead-attribution";
import { useMemo, useState, type FormEvent } from "react";
import type {
  LeadCaptureInput,
  LeadCaptureResponse,
  PageBlock,
} from "@lume/types";
import {
  LeadServicesProvider,
  type LeadServices,
} from "@lume/blocks/react/LeadServices";
import { TurnstileWidget } from "@lume/blocks/react/TurnstileWidget";
import { TradeInForm } from "@lume/blocks/react/TradeInFormVariants";
import * as forms from "@lume/blocks/react/DealershipForms";
import {
  ConciergeLeadFormView,
  type ContactFormState,
} from "@lume/blocks/react/ConciergeLeadForm";

export default function InteractiveForms({
  tenant,
  block,
  siteKey,
  design,
}: {
  tenant: string;
  block?: PageBlock;
  siteKey?: string;
  design?: SiteDesign;
}) {
  const services = useMemo<LeadServices>(
    () => ({
      turnstileSiteKey: siteKey,
      Verification: TurnstileWidget,
      async submitLead(input: LeadCaptureInput): Promise<LeadCaptureResponse> {
        const response = await fetch(
          `/api/leads?tenant=${encodeURIComponent(tenant)}`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "X-Lume-Tenant": tenant,
            },
            body: JSON.stringify({ ...input, ...getLeadAttribution(input) }),
          },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : "Unable to submit request.",
          );
        return data;
      },
    }),
    [tenant, siteKey],
  );
  const registry = {
    "trade-in-form": TradeInForm,
    "lead-capture-form": forms.LeadCaptureForm,
    "newsletter-signup": forms.NewsletterSignup,
    "service-booking": forms.ServiceBooking,
    "test-drive-booking": forms.TestDriveBooking,
    "finance-calculator": forms.FinanceCalculator,
  };
  const Component = block
    ? registry[block.type as keyof typeof registry]
    : null;
  return (
    <LeadServicesProvider value={services}>
      {design ? (
        <TemplateConversionPanel
          design={design}
          progressive
          navigateTo={() => {
            window.location.href = `/vehicles?tenant=${encodeURIComponent(tenant)}`;
          }}
        />
      ) : block && Component ? (
        <Component block={block} mode="standard" />
      ) : (
        <ContactForm />
      )}
      <noscript>
        <p>
          Enable JavaScript to submit this form. Published page information
          remains available above.
        </p>
      </noscript>
    </LeadServicesProvider>
  );
}
function ContactForm() {
  const empty: ContactFormState = {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    message: "",
  };
  const [form, setForm] = useState(empty);
  const lead = forms.useLeadSubmission(
    "Request received. The dealership will follow up with you.",
  );
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void lead.send({ ...form, source: "contact-form" }, () => setForm(empty));
  }
  return (
    <ConciergeLeadFormView
      form={form}
      setForm={setForm}
      handleSubmit={handleSubmit}
      status={lead.submission}
      verification={
        <forms.FormVerification
          resetKey={lead.turnstileResetKey}
          onToken={lead.setTurnstileToken}
        />
      }
      verificationPending={lead.requiredVerification && !lead.turnstileToken}
    />
  );
}
