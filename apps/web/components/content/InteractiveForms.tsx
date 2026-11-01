"use client";
import { TemplateConversionPanel } from "@lume/blocks/react/TemplateConversionPanel";
import type { SiteDesign } from "@lume/types";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { submitPublicLead } from "../concierge/submitLead";
import { LEAD_FORM_EVENT, pendingLeadForm } from "../concierge/pendingLeadForm";
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
  vehicleId,
  handlerId,
}: {
  tenant: string;
  block?: PageBlock;
  siteKey?: string;
  design?: Pick<SiteDesign, "template">;
  vehicleId?: string;
  handlerId?: string;
}) {
  const services = useMemo<LeadServices>(
    () => ({
      turnstileSiteKey: siteKey,
      Verification: TurnstileWidget,
      async submitLead(input: LeadCaptureInput): Promise<LeadCaptureResponse> {
        return submitPublicLead(tenant, input);
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
        <ContactForm
          tenant={tenant}
          vehicleId={vehicleId}
          handlerId={handlerId}
        />
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
function ContactForm({
  tenant,
  vehicleId,
  handlerId = "concierge-lead-form",
}: {
  tenant: string;
  vehicleId?: string;
  handlerId?: string;
}) {
  const empty: ContactFormState = {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    message: "",
  };
  const [form, setForm] = useState(empty);
  const section = useRef<HTMLElement>(null);
  const first = useRef<HTMLInputElement>(null);
  const [context, setContext] = useState<LeadCaptureInput>({
    source: "contact-form",
    ...(vehicleId ? { vehicleId } : {}),
  });
  useEffect(() => {
    const activate = () => {
      const pending = pendingLeadForm(
        tenant,
        window.location.pathname,
        handlerId,
        true,
      );
      if (!pending) return;
      setForm((current) => {
        const next = { ...current };
        for (const key of Object.keys(empty) as (keyof ContactFormState)[]) {
          const value = pending.input[key];
          if (typeof value === "string") next[key] = value;
        }
        return next;
      });
      setContext({
        source: "chat",
        vehicleId: pending.input.vehicleId ?? vehicleId,
        sourceContext: pending.input.sourceContext,
      });
      requestAnimationFrame(() => {
        section.current?.scrollIntoView({
          block: "center",
          behavior: "instant",
        });
        first.current?.focus({ preventScroll: true });
      });
    };
    activate();
    window.addEventListener(LEAD_FORM_EVENT, activate);
    return () => window.removeEventListener(LEAD_FORM_EVENT, activate);
  }, [tenant, vehicleId, handlerId]);
  const lead = forms.useLeadSubmission(
    "Request received. The dealership will follow up with you.",
  );
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void lead.send({ ...form, ...context }, () => {
      setForm(empty);
      setContext({ source: "contact-form", vehicleId });
    });
  }
  return (
    <ConciergeLeadFormView
      formSectionRef={section}
      firstNameInputRef={first}
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
